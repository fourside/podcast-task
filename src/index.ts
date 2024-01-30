import { sentry } from "@hono/sentry";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { HTTPException } from "hono/http-exception";
import type { Describe } from "superstruct";
import { object, pattern, string, validate } from "superstruct";
import { logger } from "./logger";
import { tasks } from "./schema";

type Bindings = {
  DB: D1Database;
  USERNAME: string;
  PASSWORD: string;
  LOGFLARE_API_KEY: string;
  LOGFLARE_SOURCE: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", sentry());

app.use("*", logger);

app.use("/tasks", async (c, next) => {
  const auth = basicAuth({
    username: c.env.USERNAME,
    password: c.env.PASSWORD,
  });
  return auth(c, next);
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status);
  }
  console.error(error);
  return c.json({ message: error.message }, 500);
});

type Task = Omit<typeof tasks.$inferSelect, "id" | "createdAt">;

const taskSchema: Describe<Task> = object({
  stationId: string(),
  title: string(),
  fromTime: pattern(string(), /^\d{12}$/),
  duration: pattern(string(), /^\d+$/),
  personality: string(),
});

app.get("/tasks", async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.createdAt))
    .all();
  return c.json(result);
});

app.post("/tasks", async (c) => {
  const json = await c.req.json();
  const [err, task] = validate(json, taskSchema);
  if (err !== undefined) {
    return c.json({ message: `${err.key} is invalid` }, 400);
  }
  const db = drizzle(c.env.DB);
  const prepare = db
    .insert(tasks)
    .values({
      id: sql.placeholder("id"),
      stationId: sql.placeholder("stationId"),
      title: sql.placeholder("title"),
      fromTime: sql.placeholder("fromTime"),
      duration: sql.placeholder("duration"),
      personality: sql.placeholder("personality"),
    })
    .prepare();
  const id = crypto.randomUUID();
  try {
    await prepare.execute({ id, ...task });
    return c.json({ message: "success" }, 201);
  } catch (error) {
    if (
      error instanceof Error &&
      /^D1_ERROR: UNIQUE constraint failed/.test(error.message)
    ) {
      return c.json({ message: "already created" }, 400);
    }
    throw error;
  }
});

app.delete("/tasks/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const prepare = db
    .delete(tasks)
    .where(eq(tasks.id, sql.placeholder("id")))
    .prepare();
  await prepare.execute({ id: c.req.param("id") });
  return c.json({ message: "success" });
});

export default app;

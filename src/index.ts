import { sentry } from "@hono/sentry";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { Describe } from "superstruct";
import { object, pattern, string, validate } from "superstruct";
import { tasks } from "./schema";

type Bindings = {
  DB: D1Database;
  USERNAME: string;
  PASSWORD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", sentry());

app.use("/tasks", async (c, next) => {
  const auth = basicAuth({
    username: c.env.USERNAME,
    password: c.env.PASSWORD,
  });
  return auth(c, next);
});

app.onError((error, c) => {
  c.status(500);
  return c.json({ message: "error" });
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
    return c.json({ message: JSON.stringify(err) }, 400);
  }
  const db = drizzle(c.env.DB);
  const prepare = db
    .insert(tasks)
    .values({
      id: sql.placeholder("id"),
      stationId: sql.placeholder("sationId"),
      title: sql.placeholder("title"),
      fromTime: sql.placeholder("fromTime"),
      duration: sql.placeholder("duration"),
      personality: sql.placeholder("personality"),
    })
    .prepare();
  const id = crypto.randomUUID();
  await prepare.execute({ id, ...task });
  return c.json({ message: "success" }, 201);
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

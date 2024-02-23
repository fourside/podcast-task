import { sentry } from "@hono/sentry";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { jwt } from "hono/jwt";
import type { Describe } from "superstruct";
import { number, object, pattern, string, validate } from "superstruct";
import { logger } from "./logger";
import { runTasks } from "./run-tasks";
import { tasks, users } from "./schema";

type Bindings = {
  DB: D1Database;
  LOGFLARE_API_KEY: string;
  LOGFLARE_SOURCE: string;
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", sentry());

app.use("*", logger);

app.use("*", (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    alg: "HS512",
  });
  return jwtMiddleware(c, next);
});

type JwtPayload = {
  sub: string;
  name: string;
  iss: string;
  iat: number;
  exp: number;
  nbf: number;
  aud: string;
};

const jwtPayloadSchema: Describe<JwtPayload> = object({
  sub: string(),
  name: string(),
  iss: string(),
  iat: number(),
  exp: number(),
  nbf: number(),
  aud: string(),
});

app.use("*", async (c, next) => {
  const payloadJson = c.get("jwtPayload");
  const [err, payload] = validate(payloadJson, jwtPayloadSchema);
  if (err !== undefined) {
    throw new HTTPException(401, {
      res: new Response(`${err.key} is invalid`),
    });
  }
  const db = drizzle(c.env.DB);
  const prepare = db
    .select()
    .from(users)
    .where(eq(users.name, sql.placeholder("name")))
    .prepare();
  const result = await prepare.all({ name: payload.name });
  if (result.length !== 1) {
    throw new HTTPException(401, {
      res: new Response(JSON.stringify({ message: "not authorized" })),
    });
  }
  await next();
});

app.onError((error, c) => {
  console.error(error);
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status);
  }
  return c.json({ message: error.message }, 500);
});

type Task = Omit<typeof tasks.$inferSelect, "id" | "createdAt">;

const taskSchema: Describe<Omit<Task, "status">> = object({
  stationId: string(),
  title: string(),
  fromTime: pattern(string(), /^\d{12}$/),
  toTime: pattern(string(), /^\d{12}$/),
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
      toTime: sql.placeholder("toTime"),
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

async function scheduled(
  event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  await runTasks(env.DB, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY);
}

export default {
  fetch: app.fetch,
  scheduled,
};

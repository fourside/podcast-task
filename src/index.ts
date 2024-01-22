import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { Describe } from "superstruct";
import { object, pattern, string, validate } from "superstruct";

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

interface ProgramModel {
  stationId: string;
  title: string;
  fromTime: string; // yyyymmddHHmm
  duration: string; // min
  personality: string;
}

interface ProgramRecord extends ProgramModel {
  id: string;
}

const programSchema: Describe<ProgramModel> = object({
  stationId: string(),
  title: string(),
  fromTime: pattern(string(), /^\d{12}$/),
  duration: pattern(string(), /^\d+$/),
  personality: string(),
});

app.get("/tasks", async (c) => {
  const statement = c.env.DB.prepare(
    "SELECT * FROM Tasks ORDER BY createdAt DESC",
  );
  const result = await statement.all<ProgramRecord>();
  if (result.success) {
    return c.json(result.results);
  }
  console.error(result.error);
  return c.json({ message: "error" }, 500);
});

app.post("/tasks", async (c) => {
  const json = await c.req.json();
  const [err, program] = validate(json, programSchema);
  if (err !== undefined) {
    return c.json({ message: JSON.stringify(err) }, 400);
  }
  const id = crypto.randomUUID();
  const statement = c.env.DB.prepare(
    `INSERT INTO Tasks
      (id, stationId, title, fromTime, duration, personality)
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(
    id,
    program.stationId,
    program.title,
    program.fromTime,
    program.duration,
    program.personality,
  );
  const result = await statement.run();
  if (result.success) {
    return c.json({ message: "success" }, 201);
  }
  console.error(result.error);
  return c.json({ message: "error" }, 500);
});

app.delete("/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const statement = c.env.DB.prepare("DELETE FROM Tasks WHERE id = ?1").bind(
    id,
  );
  const result = await statement.run();
  if (result.success) {
    return c.json({ message: "success" });
  }
  console.error(result.error);
  return c.json({ message: "error" }, 500);
});

export default app;

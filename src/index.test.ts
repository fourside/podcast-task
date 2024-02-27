import { drizzle } from "drizzle-orm/d1";
import { sign } from "hono/jwt";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import type { UnstableDevWorker } from "wrangler";
import { getBindingsProxy, unstable_dev } from "wrangler";
import { tasks, users, type TaskRecord } from "./schema";

describe("index.ts", async () => {
  let worker: UnstableDevWorker;
  let d1: D1Database;
  let dispose: () => Promise<void>;
  const JWT_SECRET = await createKey();

  beforeAll(async () => {
    worker = await unstable_dev("src/index.ts", {
      experimental: { disableExperimentalWarning: true },
      vars: { JWT_SECRET },
    });
    const bindingProxy = await getBindingsProxy();
    d1 = bindingProxy.bindings.DB as D1Database;
    dispose = bindingProxy.dispose;

    await drizzle(d1).delete(users);
    await drizzle(d1)
      .insert(users)
      .values({ id: crypto.randomUUID(), name: "fourside@gmail.com" });
  });

  beforeEach(async () => {
    await drizzle(d1).delete(tasks);
  });

  afterAll(async () => {
    await dispose();
    await worker.stop();
  });

  describe("auth", () => {
    test("no authorization header", async () => {
      // arrange & act
      const res = await worker.fetch("/tasks");
      // assert
      expect(res.status).toBe(401);
    });

    test("invalid jwt payload", async () => {
      // arrange & act
      const invalidSchema = { ...jwtPayload, sub: undefined };
      // nbf or expired
      const expired = {
        ...jwtPayload,
        exp: Math.floor(new Date(2000, 1, 1).getTime() / 1000),
      };
      const now = new Date();
      const nbf = {
        ...jwtPayload,
        nbf: Math.floor(
          new Date(
            now.getFullYear() + 1,
            now.getMonth(),
            now.getDate(),
          ).getTime() / 1000,
        ),
      };
      const resList = await Promise.all([
        worker.fetch("/tasks", {
          headers: {
            Authorization: `Bearer ${await createJwt(
              invalidSchema,
              JWT_SECRET,
            )}`,
          },
        }),
        worker.fetch("/tasks", {
          headers: {
            Authorization: `Bearer ${await createJwt(expired, JWT_SECRET)}`,
          },
        }),
        worker.fetch("/tasks", {
          headers: {
            Authorization: `Bearer ${await createJwt(nbf, JWT_SECRET)}`,
          },
        }),
      ]);
      // assert
      expect(resList[0].status).toBe(401);
      expect(resList[1].status).toBe(401);
      expect(resList[2].status).toBe(401);
    });

    test("user not in DB", async () => {
      // arrange & act
      const res = await worker.fetch("/tasks", {
        headers: {
          Authorization: `Bearer ${await createJwt(
            { ...jwtPayload, name: "not_user@example.com" },
            JWT_SECRET,
          )}`,
        },
      });
      // assert
      expect(res.status).toBe(401);
    });
  });

  describe("get tasks", () => {
    test("success", async () => {
      // arrange
      const values: TaskRecord[] = [
        {
          id: crypto.randomUUID(),
          stationId: "TBS",
          title: "program1",
          personality: "John",
          duration: "60",
          fromTime: "202401011230",
          toTime: "202401011330",
          status: "pending",
          createdAt: "2024-01-30 23:00:00",
        },
        {
          id: crypto.randomUUID(),
          stationId: "TBS",
          title: "program2",
          personality: "Doe",
          duration: "120",
          fromTime: "202401010300",
          toTime: "202401010500",
          status: "pending",
          createdAt: "2024-01-30 23:30:00",
        },
      ];
      await drizzle(d1).insert(tasks).values(values);
      // act
      const res = await getTasks();
      const json = await res.json();
      values.sort((a, b) =>
        a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0,
      );
      // assert
      expect(res.status).toStrictEqual(200);
      expect(json).toStrictEqual(values);
    });

    test("zero", async () => {
      // arrange & act
      const res = await getTasks();
      const json = await res.json();
      // assert
      expect(res.status).toStrictEqual(200);
      expect(json).toStrictEqual([]);
    });
  });

  describe("post task", () => {
    test("success", async () => {
      // arrange
      const value = {
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "15",
        fromTime: "202402011200",
        toTime: "202402011215",
      };
      // act
      const res = await postTask(value);
      // assert
      expect(res.status).toBe(201);
      const data = await drizzle(d1).select().from(tasks);
      expect(data.length).toBe(1);

      expect(data[0].stationId).toBe(value.stationId);
      expect(data[0].title).toBe(value.title);
      expect(data[0].personality).toBe(value.personality);
      expect(data[0].duration).toBe(value.duration);
      expect(data[0].fromTime).toBe(value.fromTime);
    });

    test("invalid parameter", async () => {
      // arrange
      const missingStation = {
        title: "new program",
        personality: "John Doe",
        duration: "15",
        fromTime: "202402011200",
        toTime: "202402011215",
      };
      const wrongDuration = {
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "15a",
        fromTime: "202402011200",
        toTime: "202402011200",
      };
      const wrongFromTime = {
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "15",
        fromTime: "2024-02-01 12:00",
        toTime: "202402011200",
      };

      // act
      const [missingStationRes, wrongDurationRes, wrongFromTimeRes] =
        await Promise.all([
          postTask(missingStation),
          postTask(wrongDuration),
          postTask(wrongFromTime),
        ]);

      // assert
      expect(missingStationRes.status).toBe(400);
      expect(await missingStationRes.json()).toStrictEqual({
        message: "stationId is invalid",
      });
      expect(wrongDurationRes.status).toBe(400);
      expect(await wrongDurationRes.json()).toStrictEqual({
        message: "duration is invalid",
      });
      expect(wrongFromTimeRes.status).toBe(400);
      expect(await wrongFromTimeRes.json()).toStrictEqual({
        message: "fromTime is invalid",
      });
      const data = await drizzle(d1).select().from(tasks);
      expect(data.length).toBe(0);
    });

    test("duplicate title and fromTime", async () => {
      // arrange
      const alreadyInserted = {
        id: crypto.randomUUID(),
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "60",
        fromTime: "202403012300",
        toTime: "202403020000",
      };
      await drizzle(d1).insert(tasks).values(alreadyInserted);
      const duplicated = {
        stationId: "QRR",
        title: "new program",
        personality: "Scot",
        duration: "120",
        fromTime: "202403012300",
        toTime: "202403020100",
      };
      // act
      const res = await postTask(duplicated);
      // assert
      expect(res.status).toBe(400);
      expect(await res.json()).toStrictEqual({ message: "already created" });
      const data = await drizzle(d1).select().from(tasks);
      expect(data.length).toBe(1); // already have one
    });
  });

  describe("delete task", () => {
    test("success", async () => {
      // arrange
      const toBeDeleted = {
        id: crypto.randomUUID(),
        stationId: "TBS",
        title: "program to be deleted",
        personality: "John Doe",
        duration: "90",
        fromTime: "202404010830",
        toTime: "202404011000",
      };
      await drizzle(d1).insert(tasks).values(toBeDeleted);
      // act
      const res = await deleteTask(toBeDeleted.id);
      // assert
      expect(res.status).toBe(200);
      const data = await drizzle(d1).select().from(tasks);
      expect(data.length).toBe(0);
    });

    test("not exists one", async () => {
      // arrange & act
      const res = await deleteTask(crypto.randomUUID());
      // assert
      expect(res.status).toBe(200);
    });
  });

  const jwtPayload = {
    sub: crypto.randomUUID(),
    name: "fourside@gmail.com",
    iss: "podcast-task-test",
    iat: Math.floor(new Date().getTime() / 1000),
    exp: Math.floor(new Date(2100, 12, 31).getTime() / 1000),
    nbf: Math.floor(new Date().getTime() / 1000),
    aud: "podcast-task",
  } as const;

  async function getTasks() {
    return worker.fetch("/tasks", {
      headers: {
        Authorization: `Bearer ${await createJwt(jwtPayload, JWT_SECRET)}`,
      },
    });
  }

  async function postTask(body: unknown) {
    return worker.fetch("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await createJwt(jwtPayload, JWT_SECRET)}`,
      },
    });
  }

  async function deleteTask(id: string) {
    return worker.fetch(`/tasks/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${await createJwt(jwtPayload, JWT_SECRET)}`,
      },
    });
  }
});

async function createKey(): Promise<string> {
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign"],
  );
  const keyBuf = await crypto.subtle.exportKey("raw", cryptoKey as CryptoKey);
  return new TextDecoder().decode(keyBuf as ArrayBuffer);
}

async function createJwt(payload: unknown, key: string): Promise<string> {
  return await sign(payload, key, "HS512");
}

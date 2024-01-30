import { drizzle } from "drizzle-orm/d1";
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
import { tasks } from "./schema";

type TaskRecode = typeof tasks.$inferSelect;

describe("index.ts", () => {
  let worker: UnstableDevWorker;
  let d1: D1Database;
  let dispose: () => Promise<void>;
  const USERNAME = "user";
  const PASSWORD = "pass";

  beforeAll(async () => {
    worker = await unstable_dev("src/index.ts", {
      experimental: { disableExperimentalWarning: true },
      vars: { USERNAME, PASSWORD },
    });
    const bindingProxy = await getBindingsProxy();
    d1 = bindingProxy.bindings.DB as D1Database;
    dispose = bindingProxy.dispose;
  });

  beforeEach(async () => {
    await drizzle(d1).delete(tasks);
  });

  afterAll(async () => {
    await dispose();
    await worker.stop();
  });

  describe("basic auth", () => {
    test("fail", async () => {
      // arrange & act
      const res = await worker.fetch("/tasks"); // not pass authorization header
      // assert
      expect(res.status).toBe(401);
    });
  });

  describe("get tasks", () => {
    test("success", async () => {
      // arrange
      const values: TaskRecode[] = [
        {
          id: crypto.randomUUID(),
          stationId: "TBS",
          title: "program1",
          personality: "John",
          duration: "60",
          fromTime: "202401011230",
          createdAt: "2024-01-30 23:00:00",
        },
        {
          id: crypto.randomUUID(),
          stationId: "TBS",
          title: "program2",
          personality: "Doe",
          duration: "120",
          fromTime: "202401010300",
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
      expect(json).toStrictEqual(values);
    });

    test("zero", async () => {
      // arrange & act
      const res = await getTasks();
      const json = await res.json();
      // assert
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
      };
      const wrongDuration = {
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "15a",
        fromTime: "202402011200",
      };
      const wrongFromTime = {
        stationId: "TBS",
        title: "new program",
        personality: "John Doe",
        duration: "15",
        fromTime: "2024-02-01 12:00",
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
      };
      await drizzle(d1).insert(tasks).values(alreadyInserted);
      const duplicated = {
        stationId: "QRR",
        title: "new program",
        personality: "Scot",
        duration: "120",
        fromTime: "202403012300",
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

  async function getTasks() {
    return worker.fetch("/tasks", {
      headers: { Authorization: `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}` },
    });
  }

  async function postTask(body: unknown) {
    return worker.fetch("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`,
      },
    });
  }

  async function deleteTask(id: string) {
    return worker.fetch(`/tasks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}` },
    });
  }
});

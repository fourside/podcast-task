import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { Uint8ArrayBlobAdapter } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import { drizzle } from "drizzle-orm/d1";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { getBindingsProxy } from "wrangler";
import { runTask } from "./run-task";
import { TaskRecord, tasks } from "./schema";

const lambdaMock = mockClient(LambdaClient);

describe(runTask.name, () => {
  let d1: D1Database;
  let dispose: () => Promise<void>;
  const pendingTask: TaskRecord = {
    id: crypto.randomUUID(),
    stationId: "TBS",
    title: "program",
    personality: "Doe",
    duration: "120",
    fromTime: "202401010300",
    toTime: "202401010500",
    status: "pending",
    createdAt: "2024-01-30 23:30:00",
  };
  const doingTask: TaskRecord = {
    id: crypto.randomUUID(),
    stationId: "TBS",
    title: "program",
    personality: "Doe",
    duration: "120",
    fromTime: "202401010300",
    toTime: "202401010500",
    status: "doing",
    createdAt: "2024-01-30 23:30:00",
  };

  beforeAll(async () => {
    const bindingProxy = await getBindingsProxy();
    d1 = bindingProxy.bindings.DB as D1Database;
    dispose = bindingProxy.dispose;
  });

  afterAll(async () => {
    await dispose();
  });

  beforeEach(() => {
    lambdaMock.reset();
  });

  afterEach(async () => {
    await drizzle(d1).delete(tasks);
  });

  test("Taskがなければlambdaを呼ばない", async () => {
    // arrange
    await drizzle(d1).delete(tasks);
    // act
    await runTask(d1, "", "");
    // assert
    expect(lambdaMock).not.toHaveReceivedCommand(InvokeCommand);
  });

  test("doingなTaskがあるとき、lambdaを呼ばない", async () => {
    // arrange
    await drizzle(d1).insert(tasks).values([doingTask]);
    // act
    await runTask(d1, "", "");
    // assert
    expect(lambdaMock).not.toHaveReceivedCommand(InvokeCommand);
  });

  test("pendingなTaskがあるとき、lambdaが呼ばれ、Taskが削除される", async () => {
    // arrange
    await drizzle(d1).insert(tasks).values([pendingTask]);
    lambdaMock.on(InvokeCommand).resolves({
      StatusCode: 200,
      Payload: Uint8ArrayBlobAdapter.fromString(
        JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({ message: "success" }),
        }),
      ),
    });
    // act
    await runTask(d1, "", "");
    // assert
    expect(lambdaMock).toHaveReceivedCommand(InvokeCommand);

    const data = await drizzle(d1).select().from(tasks);
    expect(data.length).toBe(0);
  });

  test("pendingなTaskがありlambda呼び出しに失敗すると、doingなTaskが残る", async () => {
    // arrange
    await drizzle(d1).insert(tasks).values([pendingTask]);
    lambdaMock.on(InvokeCommand).resolves({
      StatusCode: 200,
      Payload: Uint8ArrayBlobAdapter.fromString(
        JSON.stringify({
          statusCode: 400,
          body: JSON.stringify({ message: "failed" }),
        }),
      ),
    });
    // act & assert
    await expect(async () => await runTask(d1, "", "")).rejects.toThrowError(
      /^lambda application error:/,
    );
    expect(lambdaMock).toHaveReceivedCommand(InvokeCommand);

    const data = await drizzle(d1).select().from(tasks);
    expect(data.length).toBe(1);
    expect(data[0].status).toBe("doing");
  });
});

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { object, string, validate } from "superstruct";
import { convert } from "./convert";
import { tasks } from "./schema";

export async function runTasks(
  d1: D1Database,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
): Promise<void> {
  const db = drizzle(d1);
  const result = await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.createdAt))
    .where(eq(tasks.status, "pending"))
    .limit(1); // invoke one by one to avoid from timeout of lambda

  if (result.length === 0) {
    return;
  }

  const payload = convert(result[0]);

  const lambda = new LambdaClient({
    region: "ap-northeast-1",
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  await db
    .update(tasks)
    .set({ status: "doing" })
    .where(eq(tasks.id, payload.id));
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: "podcast-lambda-spot-task",
      Payload: JSON.stringify(payload),
    }),
  );
  console.log(res);

  if (res.StatusCode !== 200) {
    console.error("fail to invoke lambda.", res.StatusCode, res.Payload);
    return;
  }

  const resBody = res.Payload?.transformToString();
  if (resBody === undefined) {
    console.error("invoke error: response body is empty.");
    return;
  }

  const resJson = parseAsJson(resBody);
  if (resJson === undefined) {
    console.error("invoke error: response payload is not json", resBody);
    return;
  }

  const [err, resPayload] = validate(resJson, lambdaResponsePayload);
  if (err !== undefined) {
    console.error(
      "invoke error: response payload is invalid for schema",
      resJson,
      JSON.stringify(err),
    );
    return;
  }

  if (resPayload.message !== "success") {
    console.error("invoke error: message is not success", resPayload);
    return;
  }

  const prepare = db
    .delete(tasks)
    .where(eq(tasks.id, sql.placeholder("id")))
    .prepare();
  await prepare.execute({ id: payload.id });
}

function parseAsJson(string: string): unknown {
  try {
    return JSON.parse(string);
  } catch (e) {
    // ignore
  }
}

const lambdaResponsePayload = object({
  message: string(),
});

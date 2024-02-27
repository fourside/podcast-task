import {
  InvokeCommand,
  type InvokeCommandOutput,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { number, object, string, validate } from "superstruct";
import { convert } from "./convert";
import { tasks } from "./schema";

export async function runTask(
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
  validateLambdaResponse(res);

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

function validateLambdaResponse(res: InvokeCommandOutput): void {
  if (res.StatusCode !== 200) {
    throw new Error(`fail to invoke lambda: ${res.StatusCode}`);
  }

  const payloadStr = res.Payload?.transformToString();
  if (payloadStr === undefined) {
    throw new Error("invoke error: response payload is empty.");
  }

  const payloadJson = parseAsJson(payloadStr);
  const [err, payload] = validate(payloadJson, payloadSchema);
  if (err !== undefined) {
    throw new Error(
      `invoke error: response payload is invalid for schema, ${JSON.stringify(
        err,
      )}`,
    );
  }

  if (payload.statusCode !== 200) {
    throw new Error(
      `lambda application error: status code is ${payload.statusCode} and body is ${payload.body}`,
    );
  }

  const bodyJson = parseAsJson(payload.body);
  const [bodyErr, body] = validate(bodyJson, payloadBodySchema);
  if (bodyErr !== undefined) {
    throw new Error(
      `invoke error: payload body is invalid for schema, ${JSON.stringify(
        bodyErr,
      )}`,
    );
  }

  if (body.message !== "success") {
    throw new Error(
      `lambda application error: message is not success, ${body}`,
    );
  }
}

const payloadSchema = object({
  statusCode: number(),
  body: string(),
});

const payloadBodySchema = object({
  message: string(),
});

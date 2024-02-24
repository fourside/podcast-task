import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
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
    .orderBy(desc(tasks.createdAt))
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
  if (res.StatusCode === 200) {
    const prepare = db
      .delete(tasks)
      .where(eq(tasks.id, sql.placeholder("id")))
      .prepare();
    await prepare.execute({ id: payload.id });
  } else {
    console.error("fail to invoke lambda.", res.StatusCode, res.Payload);
  }
}

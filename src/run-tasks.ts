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
    .all();

  if (result.length === 0) {
    return;
  }

  const payloads = result.map(convert);

  const lambda = new LambdaClient({
    region: "ap-northeast-1",
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  // invoke one by one to avoid from timeout of lambda
  for (const payload of payloads) {
    const res = await lambda.send(
      new InvokeCommand({
        FunctionName: "podcast-lambda-spot-task",
        Payload: JSON.stringify(payload),
      }),
    );
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
}

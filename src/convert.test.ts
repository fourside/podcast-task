import { describe, expect, test } from "vitest";
import { convert } from "./convert";
import { tasks } from "./schema";

type TaskRecord = typeof tasks.$inferSelect;

describe(convert.name, () => {
  test("通常", () => {
    // arrange
    const task: TaskRecord = {
      id: "aaa",
      stationId: "TBS",
      title: "タイトル",
      personality: "パーソナリティ",
      fromTime: "202401020300",
      toTime: "202401020310",
      duration: "10",
      status: "pending",
      createdAt: new Date().toLocaleString(),
    };
    // act
    const result = convert(task);
    // assert
    expect(result).toStrictEqual<ReturnType<typeof convert>>({
      id: task.id,
      stationId: task.stationId,
      title: task.title,
      personality: task.personality,
      from: { year: 2024, month: 1, day: 2, hour: 3, min: 0 },
      to: { year: 2024, month: 1, day: 2, hour: 3, min: 10 },
    });
  });
});

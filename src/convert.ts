import { tasks } from "./schema";

export function convert(task: TaskRecord): LambdaPayload {
  return {
    id: task.id,
    stationId: task.stationId,
    title: task.title,
    personality: task.personality,
    fromTime: parse(task.fromTime),
    toTime: parse(task.toTime),
  };
}

function parse(str: string): DateTime {
  if (str.length !== 12) {
    throw new Error(`date time length is not 12: ${str}`);
  }
  return {
    year: parseAsInt(str.slice(0, 4)),
    month: parseAsInt(str.slice(4, 6)),
    day: parseAsInt(str.slice(6, 8)),
    hour: parseAsInt(str.slice(8, 10)),
    min: parseAsInt(str.slice(10)),
  };
}

function parseAsInt(str: string): number {
  const result = Number.parseInt(str);
  if (Number.isNaN(result)) {
    throw new Error(`fail to parse as int: ${str}`);
  }
  return result;
}

type TaskRecord = typeof tasks.$inferSelect;

type LambdaPayload = {
  id: string;
  stationId: string;
  title: string;
  personality: string;
  fromTime: DateTime;
  toTime: DateTime;
};

type DateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  min: number;
};

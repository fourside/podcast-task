import { sql } from "drizzle-orm";
import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "Tasks",
  {
    id: text("id").primaryKey(),
    stationId: text("stationId").notNull(),
    title: text("title").notNull(),
    fromTime: text("fromTime").notNull(),
    toTime: text("toTime").notNull(),
    duration: text("duration").notNull(),
    personality: text("personality").notNull(),
    createdAt: text("createdAt")
      .notNull()
      .default(sql`(DATETIME('now', 'localtime'))`),
  },
  (t) => ({
    unq: unique("").on(t.title, t.fromTime),
  }),
);

export const users = sqliteTable(
  "Users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => ({
    unq: unique("unique_name").on(t.name),
  }),
);

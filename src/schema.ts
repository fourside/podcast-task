import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("Tasks", {
  id: text("id").primaryKey(),
  stationId: text("stationId").notNull(),
  title: text("title").notNull(),
  fromTime: text("fromTime").notNull(),
  duration: text("duration").notNull(),
  personality: text("personality").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .default(sql`(DATETIME('now', 'localtime'))`),
});

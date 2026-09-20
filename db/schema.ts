import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  version: integer("version").notNull().default(1),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

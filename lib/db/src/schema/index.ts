import { pgTable, serial, text, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().default("Player"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("50000000"),
  goldCoins: numeric("gold_coins", { precision: 18, scale: 2 }).notNull().default("50000"),
  level: integer("level").notNull().default(1),
  vipLevel: integer("vip_level").notNull().default(0),
  avatar: text("avatar"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, joinedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gameType: text("game_type").notNull().default("taixiu"),
  minBet: numeric("min_bet", { precision: 18, scale: 2 }).notNull().default("1000"),
  maxBet: numeric("max_bet", { precision: 18, scale: 2 }).notNull().default("10000000"),
  playerCount: integer("player_count").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(6),
  status: text("status").notNull().default("waiting"),
  isHot: boolean("is_hot").notNull().default(false),
  isVip: boolean("is_vip").notNull().default(false),
  hasPassword: boolean("has_password").notNull().default(false),
  jackpot: numeric("jackpot", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true, createdAt: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull().default("completed"),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

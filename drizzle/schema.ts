import { boolean, float, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "IDLE", "OFFLINE"]).default("ACTIVE").notNull(),
  speed: float("speed").default(0).notNull(),
  direction: varchar("direction", { length: 32 }),
  zone: varchar("zone", { length: 128 }),
  safetyScore: int("safetyScore").default(100).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const objects = mysqlTable("objects", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("trackingId", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  objectType: varchar("objectType", { length: 64 }).notNull(),
  confidence: float("confidence").notNull(),
  distance: float("distance"),
  relativeSpeed: float("relativeSpeed"),
  direction: varchar("direction", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const detections = mysqlTable("detections", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("trackingId", { length: 64 }).notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }),
  confidence: float("confidence").notNull(),
  distance: float("distance"),
  visibility: float("visibility"),
  sensorStatus: varchar("sensorStatus", { length: 128 }),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export const riskEvents = mysqlTable("risk_events", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  trackingId: varchar("trackingId", { length: 64 }).notNull(),
  riskLevel: mysqlEnum("riskLevel", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
  riskScore: int("riskScore").notNull(),
  ttc: float("ttc"),
  zoneViolation: boolean("zoneViolation").default(false).notNull(),
  reason: text("reason"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export const nearMisses = mysqlTable("near_misses", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  objectLabel: varchar("objectLabel", { length: 128 }).notNull(),
  distance: float("distance"),
  ttc: float("ttc"),
  speed: float("speed"),
  visibility: float("visibility"),
  riskScore: int("riskScore"),
  zone: varchar("zone", { length: 128 }),
  detail: text("detail"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  alertId: varchar("alertId", { length: 64 }).notNull().unique(),
  level: mysqlEnum("level", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const environment = mysqlTable("environment", {
  id: int("id").autoincrement().primaryKey(),
  visibility: float("visibility").notNull(),
  temperature: float("temperature"),
  humidity: float("humidity"),
  weather: varchar("weather", { length: 128 }),
  wind: float("wind"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export const zones = mysqlTable("zones", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  zoneType: varchar("zoneType", { length: 64 }).notNull(),
  restricted: boolean("restricted").default(false).notNull(),
  geometry: text("geometry"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

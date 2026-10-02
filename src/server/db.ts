import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQL } from "bun";
import { env } from "./env";
import { schemaSql } from "./schema";
import { seedIfEmpty } from "./seed";

mkdirSync(path.dirname(env.dbFile), { recursive: true });

export const db = new SQL({ adapter: "sqlite", filename: env.dbFile, create: true });

await db`PRAGMA journal_mode = WAL`;
await db`PRAGMA foreign_keys = ON`;
await db.unsafe(schemaSql);

// Lightweight migrations for databases created before these columns existed.
const migrations = [
  "ALTER TABLE orders ADD COLUMN pickup_latitude REAL",
  "ALTER TABLE orders ADD COLUMN pickup_longitude REAL",
  "ALTER TABLE orders ADD COLUMN dropoff_latitude REAL",
  "ALTER TABLE orders ADD COLUMN dropoff_longitude REAL",
  "ALTER TABLE orders ADD COLUMN courier_latitude REAL",
  "ALTER TABLE orders ADD COLUMN courier_longitude REAL",
  "ALTER TABLE orders ADD COLUMN courier_name TEXT DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN courier_phone TEXT DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN courier_updated_at TEXT",
  "ALTER TABLE orders ADD COLUMN confirmed_at TEXT",
  "ALTER TABLE customers ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN verified INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE customers ADD COLUMN last_login_at TEXT",
  "ALTER TABLE customers ADD COLUMN birthday TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN gender TEXT DEFAULT ''",
  "ALTER TABLE products ADD COLUMN warehouse_id TEXT DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN pickup_warehouse_id TEXT DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN pickup_stops INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE orders ADD COLUMN stock_state TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE inventory ADD COLUMN reserved INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE inventory ADD COLUMN in_transit INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN cost REAL NOT NULL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN track_inventory INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE purchases ADD COLUMN sent_at TEXT",
];
for (const statement of migrations) {
  try {
    await db.unsafe(statement);
  } catch {
    // column already exists
  }
}

// One-time backfill for databases created before the product cost field.
// Guarded by SQLite's `user_version` so it runs EXACTLY once and never again —
// even if the merchant later sets every cost to zero, margins are never touched.
const versionRows = (await db`PRAGMA user_version`) as { user_version: number }[];
if (Number(versionRows[0]?.user_version ?? 0) < 1) {
  await db.unsafe("UPDATE products SET cost = ROUND(price * 0.6) WHERE price > 0 AND cost = 0");
  await db.unsafe("PRAGMA user_version = 1");
}

await seedIfEmpty(db);

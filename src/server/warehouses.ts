import { db } from "./db";
import { newId, nowIso, parseJson, str } from "./lib";

export type WarehouseHours = { alwaysOpen: boolean; days: string[]; open: string; close: string };

export type WarehouseRow = {
  id: string;
  store_id: string;
  name: string;
  code: string;
  contact_name: string;
  phone: string;
  email: string;
  street_address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export type WarehouseApi = {
  id: string;
  name: string;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  streetAddress: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  hours: WarehouseHours;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const ALL_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function defaultHours(): WarehouseHours {
  return { alwaysOpen: true, days: ["mon", "tue", "wed", "thu", "fri", "sat"], open: "08:00", close: "18:00" };
}

export function parseHours(raw: unknown): WarehouseHours {
  const value = typeof raw === "string" ? parseJson<Partial<WarehouseHours>>(raw, {}) : (raw as Partial<WarehouseHours> | undefined) ?? {};
  const time = (t: unknown, fallback: string) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : fallback);
  return {
    alwaysOpen: value.alwaysOpen ?? true,
    days: Array.isArray(value.days) ? value.days.filter((d): d is string => WEEKDAYS.includes(d as (typeof WEEKDAYS)[number])) : ["mon", "tue", "wed", "thu", "fri", "sat"],
    open: time(value.open, "08:00"),
    close: time(value.close, "18:00"),
  };
}

export function isOpenNow(hours: WarehouseHours, now = new Date()): boolean {
  if (hours.alwaysOpen) return true;
  if (!hours.days.includes(ALL_DAYS[now.getDay()]!)) return false;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  return close >= open ? minutes >= open && minutes <= close : minutes >= open || minutes <= close;
}

export function hydrateWarehouse(row: WarehouseRow): WarehouseApi {
  return {
    id: row.id,
    name: row.name,
    code: str(row.code),
    contactName: str(row.contact_name),
    phone: str(row.phone),
    email: str(row.email),
    streetAddress: str(row.street_address),
    city: str(row.city),
    country: str(row.country),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    hours: parseHours(row.hours),
    active: Number(row.active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWarehouses(storeId: string): Promise<WarehouseApi[]> {
  const rows = (await db`SELECT * FROM warehouses WHERE store_id = ${storeId} ORDER BY created_at ASC`) as WarehouseRow[];
  return rows.map(hydrateWarehouse);
}

export async function getWarehouseRow(storeId: string, id: string): Promise<WarehouseRow | undefined> {
  const rows = await db`SELECT * FROM warehouses WHERE store_id = ${storeId} AND id = ${id} LIMIT 1`;
  return rows[0] as WarehouseRow | undefined;
}

export async function defaultWarehouseRow(storeId: string): Promise<WarehouseRow | undefined> {
  const rows = await db`SELECT * FROM warehouses WHERE store_id = ${storeId} ORDER BY active DESC, created_at ASC LIMIT 1`;
  return rows[0] as WarehouseRow | undefined;
}

function buildFields(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const setString = (key: string, column: string) => {
    if (!partial || key in body) fields[column] = str(body[key]);
  };
  if (!partial || "name" in body) {
    const name = str(body.name).trim();
    if (!name) throw new Error("Warehouse name is required.");
    fields.name = name;
  }
  setString("code", "code");
  setString("contactName", "contact_name");
  setString("phone", "phone");
  setString("email", "email");
  setString("streetAddress", "street_address");
  setString("city", "city");
  setString("country", "country");
  if (!partial || "latitude" in body) fields.latitude = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
  if (!partial || "longitude" in body) fields.longitude = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
  if (!partial || "hours" in body) fields.hours = JSON.stringify(parseHours(body.hours));
  if (!partial || "active" in body) fields.active = body.active === false ? 0 : 1;
  return fields;
}

export async function createWarehouse(storeId: string, body: Record<string, unknown>): Promise<WarehouseApi> {
  const now = nowIso();
  const fields = buildFields(body, false);
  const id = newId("wh");
  await db`INSERT INTO warehouses ${db({ id, store_id: storeId, created_at: now, updated_at: now, ...fields })}`;
  return hydrateWarehouse((await getWarehouseRow(storeId, id))!);
}

export async function updateWarehouse(storeId: string, id: string, body: Record<string, unknown>): Promise<WarehouseApi> {
  const fields = buildFields(body, true);
  fields.updated_at = nowIso();
  const keys = Object.keys(fields);
  await db`UPDATE warehouses SET ${db(fields, ...keys)} WHERE id = ${id} AND store_id = ${storeId}`;
  const row = await getWarehouseRow(storeId, id);
  if (!row) throw new Error("Warehouse not found.");
  return hydrateWarehouse(row);
}

export async function deleteWarehouse(storeId: string, id: string): Promise<void> {
  await db`DELETE FROM warehouses WHERE id = ${id} AND store_id = ${storeId}`;
  await db`UPDATE products SET warehouse_id = '' WHERE store_id = ${storeId} AND warehouse_id = ${id}`;
}

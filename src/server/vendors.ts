import { db } from "./db";
import { newId, nowIso, str } from "./lib";

export type VendorApi = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  owed: number;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function listVendors(storeId: string): Promise<VendorApi[]> {
  const rows = (await db`
    SELECT v.*,
      COALESCE((SELECT SUM(MAX(0, p.total - p.amount_paid)) FROM purchases p WHERE p.vendor_id = v.id AND p.status != 'cancelled'), 0) AS owed,
      (SELECT COUNT(*) FROM purchases p WHERE p.vendor_id = v.id) AS purchase_count
    FROM vendors v WHERE v.store_id = ${storeId} ORDER BY v.created_at ASC`) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    contactName: str(row.contact_name),
    phone: str(row.phone),
    email: str(row.email),
    address: str(row.address),
    notes: str(row.notes),
    active: Number(row.active) === 1,
    owed: Number(row.owed ?? 0),
    purchaseCount: Number(row.purchase_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function getVendorRow(storeId: string, id: string): Promise<Record<string, unknown> | undefined> {
  const rows = (await db`SELECT * FROM vendors WHERE store_id = ${storeId} AND id = ${id} LIMIT 1`) as Record<string, unknown>[];
  return rows[0];
}

function buildFields(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (!partial || "name" in body) {
    const name = str(body.name).trim();
    if (!name) throw new Error("Vendor name is required.");
    fields.name = name;
  }
  for (const [key, column] of [["contactName", "contact_name"], ["phone", "phone"], ["email", "email"], ["address", "address"], ["notes", "notes"]] as const) {
    if (!partial || key in body) fields[column] = str(body[key]);
  }
  if (!partial || "active" in body) fields.active = body.active === false ? 0 : 1;
  return fields;
}

export async function createVendor(storeId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowIso();
  const id = newId("ven");
  await db`INSERT INTO vendors ${db({ id, store_id: storeId, created_at: now, updated_at: now, ...buildFields(body, false) })}`;
  return (await db`SELECT * FROM vendors WHERE id = ${id} LIMIT 1`)[0] as Record<string, unknown>;
}

export async function updateVendor(storeId: string, id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const fields = buildFields(body, true);
  fields.updated_at = nowIso();
  const keys = Object.keys(fields);
  await db`UPDATE vendors SET ${db(fields, ...keys)} WHERE id = ${id} AND store_id = ${storeId}`;
  const row = await getVendorRow(storeId, id);
  if (!row) throw new Error("Vendor not found.");
  return row;
}

export async function deleteVendor(storeId: string, id: string): Promise<void> {
  await db`DELETE FROM vendors WHERE id = ${id} AND store_id = ${storeId}`;
  await db`UPDATE purchases SET vendor_id = '' WHERE store_id = ${storeId} AND vendor_id = ${id}`;
}

export function purchasePaymentStatus(total: number, paid: number): "unpaid" | "partial" | "paid" {
  if (paid <= 0) return "unpaid";
  if (paid + 0.001 >= total) return "paid";
  return "partial";
}

import { db } from "./db";
import { ApiError, badRequest, newId, notFound, nowIso, str } from "./lib";
import { receiveStock } from "./inventory";
import { purchasePaymentStatus } from "./vendors";
import { getSettings, type StoreRow } from "./stores";

export type PurchaseItemApi = { id: string; productId: string; name: string; quantity: number; unitCost: number; lineTotal: number };

export type PurchaseApi = {
  id: string;
  vendorId: string;
  vendorName: string;
  reference: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  total: number;
  amountPaid: number;
  notes: string;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItemApi[];
};

async function hydrate(storeId: string, id: string): Promise<PurchaseApi> {
  const rows = (await db`SELECT p.*, v.name AS vendor_name FROM purchases p LEFT JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ${id} AND p.store_id = ${storeId} LIMIT 1`) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) throw notFound("Purchase not found.");
  const items = (await db`SELECT * FROM purchase_items WHERE purchase_id = ${id} ORDER BY rowid ASC`) as Record<string, unknown>[];
  return {
    id: String(row.id),
    vendorId: str(row.vendor_id),
    vendorName: str(row.vendor_name),
    reference: str(row.reference),
    status: str(row.status, "ordered"),
    paymentStatus: str(row.payment_status, "unpaid"),
    subtotal: Number(row.subtotal ?? 0),
    total: Number(row.total ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    notes: str(row.notes),
    receivedAt: row.received_at ? String(row.received_at) : null,
    sentAt: row.sent_at ? String(row.sent_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items: items.map((item) => ({
      id: String(item.id),
      productId: str(item.product_id),
      name: String(item.name),
      quantity: Number(item.quantity ?? 0),
      unitCost: Number(item.unit_cost ?? 0),
      lineTotal: Number(item.line_total ?? 0),
    })),
  };
}

export async function listPurchases(storeId: string): Promise<PurchaseApi[]> {
  const rows = (await db`SELECT id FROM purchases WHERE store_id = ${storeId} ORDER BY created_at DESC LIMIT 200`) as { id: string }[];
  return Promise.all(rows.map((row) => hydrate(storeId, row.id)));
}

export async function getPurchase(storeId: string, id: string): Promise<PurchaseApi> {
  return hydrate(storeId, id);
}

export async function createPurchase(storeId: string, body: Record<string, unknown>): Promise<PurchaseApi> {
  const itemsInput = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  if (itemsInput.length === 0) throw badRequest("VALIDATION_ERROR", "Add at least one item.");
  const now = nowIso();
  const purchaseId = newId("po");
  const lines: Record<string, unknown>[] = [];
  let subtotal = 0;
  for (const raw of itemsInput) {
    const name = str(raw.name).trim();
    const quantity = Math.max(0, Math.trunc(Number(raw.quantity)));
    const unitCost = Math.max(0, Number(raw.unitCost) || 0);
    if (!name || quantity <= 0) throw badRequest("VALIDATION_ERROR", "Each line needs a name and a positive quantity.");
    const lineTotal = quantity * unitCost;
    subtotal += lineTotal;
    lines.push({ id: newId("poi"), purchase_id: purchaseId, product_id: str(raw.productId), name, quantity, unit_cost: unitCost, line_total: lineTotal });
  }
  await db.begin(async (tx) => {
    await tx`INSERT INTO purchases ${tx({
      id: purchaseId,
      store_id: storeId,
      vendor_id: str(body.vendorId),
      reference: str(body.reference),
      status: "ordered",
      payment_status: "unpaid",
      subtotal,
      total: subtotal,
      amount_paid: 0,
      notes: str(body.notes),
      created_at: now,
      updated_at: now,
    })}`;
    for (const line of lines) await tx`INSERT INTO purchase_items ${tx(line)}`;
  });
  return hydrate(storeId, purchaseId);
}

function buildLines(storeId: string, purchaseId: string, itemsInput: Record<string, unknown>[]): { lines: Record<string, unknown>[]; subtotal: number } {
  if (itemsInput.length === 0) throw badRequest("VALIDATION_ERROR", "Add at least one item.");
  const lines: Record<string, unknown>[] = [];
  let subtotal = 0;
  for (const raw of itemsInput) {
    const name = str(raw.name).trim();
    const quantity = Math.max(0, Math.trunc(Number(raw.quantity)));
    const unitCost = Math.max(0, Number(raw.unitCost) || 0);
    if (!name || quantity <= 0) throw badRequest("VALIDATION_ERROR", "Each line needs a name and a positive quantity.");
    const lineTotal = quantity * unitCost;
    subtotal += lineTotal;
    lines.push({ id: newId("poi"), purchase_id: purchaseId, product_id: str(raw.productId), name, quantity, unit_cost: unitCost, line_total: lineTotal });
  }
  return { lines, subtotal };
}

/** Edit a purchase's vendor/reference/notes and line items. Only allowed while it hasn't been received or paid. */
export async function updatePurchase(storeId: string, id: string, body: Record<string, unknown>): Promise<PurchaseApi> {
  const purchase = await hydrate(storeId, id);
  if (purchase.status === "received" || purchase.amountPaid > 0) {
    throw badRequest("NOT_EDITABLE", "Only purchases that haven't been received or paid can be edited.");
  }
  const itemsInput = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  const { lines, subtotal } = buildLines(storeId, id, itemsInput);
  const now = nowIso();
  await db.begin(async (tx) => {
    await tx`UPDATE purchases SET vendor_id = ${str(body.vendorId)}, reference = ${str(body.reference)}, notes = ${str(body.notes)}, subtotal = ${subtotal}, total = ${subtotal}, updated_at = ${now} WHERE id = ${id} AND store_id = ${storeId}`;
    await tx`DELETE FROM purchase_items WHERE purchase_id = ${id}`;
    for (const line of lines) await tx`INSERT INTO purchase_items ${tx(line)}`;
  });
  return hydrate(storeId, id);
}

/** Send the purchase order to the configured webhook (e.g. n8n) for delivery to the vendor. */
export async function sendPurchase(store: StoreRow, id: string): Promise<PurchaseApi> {
  const purchase = await hydrate(store.id, id);
  if (purchase.status === "received") throw badRequest("VALIDATION_ERROR", "This purchase has already been received.");
  const url = getSettings(store).purchases?.webhookUrl?.trim();
  if (!url) throw badRequest("NO_WEBHOOK", "Configure the purchase-order webhook in Settings first.");
  const payload = {
    event: "purchase_order.created",
    store: { id: store.id, name: store.name },
    vendor: { id: purchase.vendorId, name: purchase.vendorName },
    purchase: { id: purchase.id, reference: purchase.reference, total: purchase.total, currency: store.currency, notes: purchase.notes, createdAt: purchase.createdAt },
    items: purchase.items.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity, unitCost: item.unitCost, lineTotal: item.lineTotal })),
  };
  let delivered = false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }
  if (!delivered) throw new ApiError(502, "WEBHOOK_FAILED", "The purchase-order webhook could not be reached.");
  const now = nowIso();
  await db`UPDATE purchases SET status = 'sent', sent_at = ${now}, updated_at = ${now} WHERE id = ${id} AND store_id = ${store.id}`;
  return hydrate(store.id, id);
}

/** Delete a purchase. If it was received, its stock is reversed first. */
export async function deletePurchase(storeId: string, id: string): Promise<void> {
  const purchase = await hydrate(storeId, id);
  if (purchase.status === "received") {
    const now = nowIso();
    for (const item of purchase.items) {
      if (!item.productId) continue;
      await db`UPDATE products SET stock = MAX(0, stock - ${item.quantity}), updated_at = ${now} WHERE id = ${item.productId} AND store_id = ${storeId}`;
      const rows = (await db`SELECT warehouse_id FROM products WHERE id = ${item.productId} AND store_id = ${storeId} LIMIT 1`) as { warehouse_id: string }[];
      const warehouseId = str(rows[0]?.warehouse_id);
      if (warehouseId) {
        await db`UPDATE inventory SET quantity = MAX(0, quantity - ${item.quantity}), updated_at = ${now} WHERE store_id = ${storeId} AND product_id = ${item.productId} AND warehouse_id = ${warehouseId}`;
      }
    }
  }
  await db`DELETE FROM purchases WHERE id = ${id} AND store_id = ${storeId}`;
}

/** Receive a purchase: add each line's quantity to inventory. */
export async function receivePurchase(storeId: string, id: string): Promise<PurchaseApi> {
  const purchase = await hydrate(storeId, id);
  if (purchase.status === "received") return purchase;
  const now = nowIso();
  for (const item of purchase.items) {
    if (item.productId) await receiveStock(storeId, item.productId, item.quantity, id);
  }
  await db`UPDATE purchases SET status = 'received', received_at = ${now}, updated_at = ${now} WHERE id = ${id} AND store_id = ${storeId}`;
  return hydrate(storeId, id);
}

export async function payPurchase(storeId: string, id: string, body: Record<string, unknown>): Promise<PurchaseApi> {  const purchase = await hydrate(storeId, id);
  const outstanding = Math.max(0, purchase.total - purchase.amountPaid);
  if (outstanding <= 0) throw badRequest("VALIDATION_ERROR", "This purchase is already fully paid.");
  const requested = Number(body.amount) > 0 ? Number(body.amount) : outstanding;
  const amount = Math.min(requested, outstanding);
  const now = nowIso();
  await db`INSERT INTO purchase_payments ${db({
    id: newId("pp"),
    store_id: storeId,
    purchase_id: id,
    vendor_id: purchase.vendorId,
    amount,
    gateway: str(body.gateway, "mock"),
    reference: str(body.reference),
    status: "paid",
    created_at: now,
  })}`;
  const paid = purchase.amountPaid + amount;
  await db`UPDATE purchases SET amount_paid = ${paid}, payment_status = ${purchasePaymentStatus(purchase.total, paid)}, updated_at = ${now} WHERE id = ${id} AND store_id = ${storeId}`;
  return hydrate(storeId, id);
}

/**
 * Pay a vendor directly: allocate the amount across their outstanding purchases,
 * oldest first. This is the "direct" payment path (you owe a vendor, you pay).
 */
export async function payVendor(storeId: string, vendorId: string, body: Record<string, unknown>): Promise<{ paid: number }> {
  const rows = (await db`SELECT id, total, amount_paid FROM purchases WHERE store_id = ${storeId} AND vendor_id = ${vendorId} AND status != 'cancelled' AND amount_paid < total ORDER BY created_at ASC`) as Record<string, unknown>[];
  const outstandingTotal = rows.reduce((sum, row) => sum + Math.max(0, Number(row.total) - Number(row.amount_paid)), 0);
  if (outstandingTotal <= 0) throw badRequest("VALIDATION_ERROR", "This vendor has no outstanding balance.");
  let remaining = Number(body.amount) > 0 ? Math.min(Number(body.amount), outstandingTotal) : outstandingTotal;
  const gateway = str(body.gateway, "mock");
  const now = nowIso();
  let paid = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, Number(row.total) - Number(row.amount_paid));
    const apply = Math.min(outstanding, remaining);
    const newPaid = Number(row.amount_paid) + apply;
    await db`INSERT INTO purchase_payments ${db({
      id: newId("pp"),
      store_id: storeId,
      purchase_id: String(row.id),
      vendor_id: vendorId,
      amount: apply,
      gateway,
      reference: "",
      status: "paid",
      created_at: now,
    })}`;
    await db`UPDATE purchases SET amount_paid = ${newPaid}, payment_status = ${purchasePaymentStatus(Number(row.total), newPaid)}, updated_at = ${now} WHERE id = ${String(row.id)} AND store_id = ${storeId}`;
    remaining -= apply;
    paid += apply;
  }
  return { paid };
}

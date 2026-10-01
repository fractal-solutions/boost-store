import { db } from "./db";
import { newId, nowIso, str } from "./lib";

export type InventoryItem = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  status: string;
  price: number;
  image: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  reserved: number;
  inTransit: number;
  reorderLevel: number;
  low: boolean;
  value: number;
};

export type StockMovement = { id: string; type: string; quantity: number; reference: string; createdAt: string };

export type ProductHistory = {
  productId: string;
  name: string;
  onHand: number;
  reserved: number;
  inTransit: number;
  reorderLevel: number;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  daily: { date: string; units: number; revenue: number }[];
  movements: StockMovement[];
  forecast: {
    avgDailyUnits: number;
    daysOfCover: number | null;
    suggestedReorder: number;
    trend: "rising" | "steady" | "falling";
  };
};

const HISTORY_DAYS = 30;
const COVER_DAYS = 14;

/** One row per product with its home warehouse and stock buckets. */
export async function listInventory(storeId: string): Promise<InventoryItem[]> {
  const rows = (await db`
    SELECT p.id, p.name, p.slug, p.category, p.status, p.price, p.image, p.warehouse_id,
           w.name AS warehouse_name,
           COALESCE(i.quantity, p.stock) AS quantity,
           COALESCE(i.reserved, 0) AS reserved,
           COALESCE(i.in_transit, 0) AS in_transit,
           COALESCE(i.reorder_level, 0) AS reorder_level
    FROM products p
    LEFT JOIN warehouses w ON w.id = p.warehouse_id
    LEFT JOIN inventory i ON i.product_id = p.id AND i.warehouse_id = p.warehouse_id
    WHERE p.store_id = ${storeId}
    ORDER BY p.created_at DESC`) as Record<string, unknown>[];
  return rows.map((row) => {
    const quantity = Number(row.quantity ?? 0);
    const reserved = Number(row.reserved ?? 0);
    const inTransit = Number(row.in_transit ?? 0);
    const reorderLevel = Number(row.reorder_level ?? 0);
    const price = Number(row.price ?? 0);
    return {
      productId: String(row.id),
      name: String(row.name),
      sku: str(row.slug),
      category: str(row.category),
      status: str(row.status, "active"),
      price,
      image: str(row.image),
      warehouseId: str(row.warehouse_id),
      warehouseName: str(row.warehouse_name) || "Unassigned",
      quantity,
      reserved,
      inTransit,
      reorderLevel,
      low: reorderLevel > 0 && quantity <= reorderLevel,
      value: quantity * price,
    };
  });
}

async function recordMovement(storeId: string, productId: string, warehouseId: string, type: string, quantity: number, reference = ""): Promise<void> {
  await db`INSERT INTO stock_movements ${db({
    id: newId("mov"),
    store_id: storeId,
    product_id: productId,
    warehouse_id: warehouseId,
    type,
    quantity: Math.abs(Math.trunc(quantity)),
    reference,
    created_at: nowIso(),
  })}`;
}

/** Set a product's warehouse, on-hand quantity and reorder level (keeps products.stock in sync). */
export async function setStock(storeId: string, productId: string, warehouseId: string, quantity: number, reorderLevel: number): Promise<void> {
  const now = nowIso();
  const q = Math.max(0, Math.trunc(Number.isFinite(quantity) ? quantity : 0));
  const r = Math.max(0, Math.trunc(Number.isFinite(reorderLevel) ? reorderLevel : 0));
  await db`DELETE FROM inventory WHERE store_id = ${storeId} AND product_id = ${productId} AND warehouse_id != ${warehouseId}`;
  await db`
    INSERT INTO inventory ${db({ id: newId("inv"), store_id: storeId, product_id: productId, warehouse_id: warehouseId, quantity: q, reserved: 0, in_transit: 0, reorder_level: r, updated_at: now })}
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity, reorder_level = excluded.reorder_level, updated_at = excluded.updated_at`;
  await db`UPDATE products SET stock = ${q}, warehouse_id = ${warehouseId}, updated_at = ${now} WHERE id = ${productId} AND store_id = ${storeId}`;
  await recordMovement(storeId, productId, warehouseId, "adjustment", q, "stock set");
}

// --- order lifecycle stock transitions ---

type StockBuckets = { onHand: number; reserved: number; inTransit: number };

async function applyBuckets(storeId: string, productId: string, warehouseId: string, delta: StockBuckets): Promise<void> {
  const now = nowIso();
  if (warehouseId) {
    await db`UPDATE inventory SET
        quantity = MAX(0, quantity + ${delta.onHand}),
        reserved = MAX(0, reserved + ${delta.reserved}),
        in_transit = MAX(0, in_transit + ${delta.inTransit}),
        updated_at = ${now}
      WHERE store_id = ${storeId} AND product_id = ${productId} AND warehouse_id = ${warehouseId}`;
  }
  if (delta.onHand !== 0) {
    await db`UPDATE products SET stock = MAX(0, stock + ${delta.onHand}), updated_at = ${now} WHERE id = ${productId} AND store_id = ${storeId}`;
  }
}

async function orderLines(storeId: string, orderId: string): Promise<{ productId: string; quantity: number; warehouseId: string }[]> {
  const rows = (await db`
    SELECT oi.product_id, oi.quantity, COALESCE(p.warehouse_id, '') AS warehouse_id
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ${orderId}`) as Record<string, unknown>[];
  return rows.map((row) => ({ productId: String(row.product_id), quantity: Number(row.quantity), warehouseId: str(row.warehouse_id) }));
}

/**
 * Move an order's stock through the lifecycle:
 *   (created) -> reserved -> dispatched -> completed
 *                              \-> released (cancelled)
 * Idempotent: guarded by the order's stock_state.
 */
export async function transitionStock(storeId: string, orderId: string, to: "reserved" | "dispatched" | "completed" | "released"): Promise<void> {
  const orderRows = (await db`SELECT stock_state FROM orders WHERE id = ${orderId} AND store_id = ${storeId} LIMIT 1`) as { stock_state: string }[];
  const state = str(orderRows[0]?.stock_state);
  if (state === to) return;
  const lines = await orderLines(storeId, orderId);
  const now = nowIso();
  for (const line of lines) {
    const q = line.quantity;
    if (to === "reserved" && state === "") {
      await applyBuckets(storeId, line.productId, line.warehouseId, { onHand: -q, reserved: +q, inTransit: 0 });
      await recordMovement(storeId, line.productId, line.warehouseId, "reserve", q, orderId);
    } else if (to === "dispatched" && state === "reserved") {
      await applyBuckets(storeId, line.productId, line.warehouseId, { onHand: 0, reserved: -q, inTransit: +q });
      await recordMovement(storeId, line.productId, line.warehouseId, "dispatch", q, orderId);
    } else if (to === "completed" && (state === "reserved" || state === "dispatched")) {
      const delta = state === "reserved" ? { onHand: 0, reserved: -q, inTransit: 0 } : { onHand: 0, reserved: 0, inTransit: -q };
      await applyBuckets(storeId, line.productId, line.warehouseId, delta);
      await recordMovement(storeId, line.productId, line.warehouseId, "complete", q, orderId);
    } else if (to === "released" && (state === "reserved" || state === "dispatched")) {
      const delta = state === "reserved" ? { onHand: +q, reserved: -q, inTransit: 0 } : { onHand: +q, reserved: 0, inTransit: -q };
      await applyBuckets(storeId, line.productId, line.warehouseId, delta);
      await recordMovement(storeId, line.productId, line.warehouseId, "release", q, orderId);
    }
  }
  await db`UPDATE orders SET stock_state = ${to}, updated_at = ${now} WHERE id = ${orderId} AND store_id = ${storeId}`;
}

/** Derive the right transition from an order status change. */
export async function syncStockForStatus(storeId: string, orderId: string, status: string): Promise<void> {
  if (status === "dispatched" || status === "in_transit" || status === "out_for_delivery") {
    await transitionStock(storeId, orderId, "dispatched");
  } else if (status === "completed") {
    await transitionStock(storeId, orderId, "completed");
  } else if (status === "cancelled") {
    await transitionStock(storeId, orderId, "released");
  }
}

// --- history + forecast ---

export async function productHistory(storeId: string, productId: string): Promise<ProductHistory | null> {
  const productRows = (await db`SELECT id, name, stock, warehouse_id FROM products WHERE id = ${productId} AND store_id = ${storeId} LIMIT 1`) as Record<string, unknown>[];
  const product = productRows[0];
  if (!product) return null;
  const invRows = (await db`SELECT quantity, reserved, in_transit, reorder_level FROM inventory WHERE store_id = ${storeId} AND product_id = ${productId} ORDER BY updated_at DESC LIMIT 1`) as Record<string, unknown>[];
  const inv = invRows[0] ?? {};

  const totalsRows = (await db`
    SELECT COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.line_total), 0) AS revenue, COUNT(DISTINCT o.id) AS orders
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ${storeId} AND oi.product_id = ${productId} AND o.status != 'cancelled'`) as Record<string, unknown>[];
  const totals = totalsRows[0] ?? {};
  const unitsSold = Number(totals.units ?? 0);
  const revenue = Number(totals.revenue ?? 0);
  const orderCount = Number(totals.orders ?? 0);

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const dailyRows = (await db`
    SELECT substr(o.created_at, 1, 10) AS day, COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.line_total), 0) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ${storeId} AND oi.product_id = ${productId} AND o.status != 'cancelled' AND o.created_at >= ${since}
    GROUP BY day ORDER BY day ASC`) as Record<string, unknown>[];
  const byDay = new Map(dailyRows.map((row) => [String(row.day), { units: Number(row.units), revenue: Number(row.revenue) }]));
  const daily: { date: string; units: number; revenue: number }[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const entry = byDay.get(date);
    daily.push({ date, units: entry?.units ?? 0, revenue: entry?.revenue ?? 0 });
  }

  const movementRows = (await db`SELECT id, type, quantity, reference, created_at FROM stock_movements WHERE store_id = ${storeId} AND product_id = ${productId} ORDER BY created_at DESC LIMIT 30`) as Record<string, unknown>[];
  const movements: StockMovement[] = movementRows.map((row) => ({ id: String(row.id), type: String(row.type), quantity: Number(row.quantity), reference: str(row.reference), createdAt: String(row.created_at) }));

  const onHand = Number(inv.quantity ?? product.stock ?? 0);
  const avgDailyUnits = unitsSold > 0 ? Number((unitsSold / HISTORY_DAYS).toFixed(2)) : 0;
  const daysOfCover = avgDailyUnits > 0 ? Number((onHand / avgDailyUnits).toFixed(1)) : null;
  const suggestedReorder = avgDailyUnits > 0 ? Math.max(0, Math.ceil(avgDailyUnits * COVER_DAYS)) : 0;
  const recent = daily.slice(-7).reduce((sum, d) => sum + d.units, 0);
  const prior = daily.slice(-14, -7).reduce((sum, d) => sum + d.units, 0);
  const trend: ProductHistory["forecast"]["trend"] = recent > prior * 1.15 ? "rising" : recent < prior * 0.85 ? "falling" : "steady";

  return {
    productId,
    name: String(product.name),
    onHand,
    reserved: Number(inv.reserved ?? 0),
    inTransit: Number(inv.in_transit ?? 0),
    reorderLevel: Number(inv.reorder_level ?? 0),
    unitsSold,
    revenue,
    orderCount,
    daily,
    movements,
    forecast: { avgDailyUnits, daysOfCover, suggestedReorder, trend },
  };
}

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
  reorderLevel: number;
  low: boolean;
  value: number;
};

/** One row per product with its home warehouse and stock level. */
export async function listInventory(storeId: string): Promise<InventoryItem[]> {
  const rows = (await db`
    SELECT p.id, p.name, p.slug, p.category, p.status, p.price, p.image, p.warehouse_id,
           w.name AS warehouse_name,
           COALESCE(i.quantity, p.stock) AS quantity,
           COALESCE(i.reorder_level, 0) AS reorder_level
    FROM products p
    LEFT JOIN warehouses w ON w.id = p.warehouse_id
    LEFT JOIN inventory i ON i.product_id = p.id AND i.warehouse_id = p.warehouse_id
    WHERE p.store_id = ${storeId}
    ORDER BY p.created_at DESC`) as Record<string, unknown>[];
  return rows.map((row) => {
    const quantity = Number(row.quantity ?? 0);
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
      reorderLevel,
      low: reorderLevel > 0 && quantity <= reorderLevel,
      value: quantity * price,
    };
  });
}

/** Set a product's warehouse, on-hand quantity and reorder level (keeps products.stock in sync). */
export async function setStock(storeId: string, productId: string, warehouseId: string, quantity: number, reorderLevel: number): Promise<void> {
  const now = nowIso();
  const q = Math.max(0, Math.trunc(Number.isFinite(quantity) ? quantity : 0));
  const r = Math.max(0, Math.trunc(Number.isFinite(reorderLevel) ? reorderLevel : 0));
  await db`DELETE FROM inventory WHERE store_id = ${storeId} AND product_id = ${productId} AND warehouse_id != ${warehouseId}`;
  await db`
    INSERT INTO inventory ${db({ id: newId("inv"), store_id: storeId, product_id: productId, warehouse_id: warehouseId, quantity: q, reorder_level: r, updated_at: now })}
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity, reorder_level = excluded.reorder_level, updated_at = excluded.updated_at`;
  await db`UPDATE products SET stock = ${q}, warehouse_id = ${warehouseId}, updated_at = ${now} WHERE id = ${productId} AND store_id = ${storeId}`;
}

/** Decrement on-hand stock for a product's warehouse after an order. */
export async function decrementStock(storeId: string, productId: string, quantity: number): Promise<void> {
  const now = nowIso();
  await db`UPDATE products SET stock = MAX(0, stock - ${quantity}), updated_at = ${now} WHERE id = ${productId} AND store_id = ${storeId}`;
  const productRows = (await db`SELECT warehouse_id FROM products WHERE id = ${productId} AND store_id = ${storeId} LIMIT 1`) as { warehouse_id: string }[];
  const warehouseId = productRows[0]?.warehouse_id;
  if (warehouseId) {
    await db`UPDATE inventory SET quantity = MAX(0, quantity - ${quantity}), updated_at = ${now} WHERE store_id = ${storeId} AND product_id = ${productId} AND warehouse_id = ${warehouseId}`;
  }
}

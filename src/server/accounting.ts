import { db } from "./db";

export type Accounting = {
  currency: string;
  sales: { total: number; paid: number; outstanding: number; orders: number };
  purchases: { total: number; paid: number; owed: number; count: number };
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  inventory: { units: number; costValue: number; retailValue: number; itemCount: number };
  balance: { cash: number; receivables: number; inventoryCost: number; totalAssets: number; payables: number; equity: number };
  receivablesOrders: { id: string; customer: string; total: number; paymentStatus: string }[];
  payablesVendors: { id: string; name: string; owed: number }[];
  salesOrders: { id: string; customer: string; total: number; status: string; paymentStatus: string; createdAt: string }[];
  cogsItems: { name: string; quantity: number; unitCost: number; total: number }[];
  purchaseList: { id: string; vendor: string; total: number; amountPaid: number; status: string; paymentStatus: string; createdAt: string }[];
  purchasePayments: { id: string; vendor: string; amount: number; gateway: string; reference: string; createdAt: string }[];
};

/**
 * Store accounting snapshot:
 * - sales paid vs outstanding (accounts receivable)
 * - purchases paid vs owed (accounts payable)
 * - COGS / gross profit / margin
 * - inventory at cost and at retail
 * - a simple balance sheet (assets = inventory + receivables + cash; equity = assets - payables)
 */
export async function accountingSummary(storeId: string, currency: string): Promise<Accounting> {
  const salesRows = (await db`
    SELECT COALESCE(SUM(total), 0) AS total,
           COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS paid,
           COUNT(*) AS orders
    FROM orders WHERE store_id = ${storeId} AND status != 'cancelled'`) as Record<string, unknown>[];
  const sales = salesRows[0] ?? {};
  const salesTotal = Number(sales.total ?? 0);
  const salesPaid = Number(sales.paid ?? 0);

  const cogsRows = (await db`
    SELECT COALESCE(SUM(oi.quantity * p.cost), 0) AS cogs
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.store_id = ${storeId} AND o.status != 'cancelled'`) as Record<string, unknown>[];
  const cogs = Number(cogsRows[0]?.cogs ?? 0);

  const purchaseRows = (await db`
    SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(amount_paid), 0) AS paid, COUNT(*) AS count
    FROM purchases WHERE store_id = ${storeId} AND status != 'cancelled'`) as Record<string, unknown>[];
  const purchaseTotal = Number(purchaseRows[0]?.total ?? 0);
  const purchasePaid = Number(purchaseRows[0]?.paid ?? 0);

  const invRows = (await db`
    SELECT COALESCE(SUM(i.quantity * p.cost), 0) AS cost_value,
           COALESCE(SUM(i.quantity * p.price), 0) AS retail_value,
           COALESCE(SUM(i.quantity), 0) AS units,
           COUNT(DISTINCT i.product_id) AS item_count
    FROM inventory i JOIN products p ON p.id = i.product_id
    WHERE i.store_id = ${storeId}`) as Record<string, unknown>[];
  const invUnits = Number(invRows[0]?.units ?? 0);
  const invCost = Number(invRows[0]?.cost_value ?? 0);
  const invRetail = Number(invRows[0]?.retail_value ?? 0);

  const receivableRows = (await db`
    SELECT o.id, COALESCE(c.name, 'Customer') AS customer, o.total, o.payment_status
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.store_id = ${storeId} AND o.status != 'cancelled' AND o.payment_status != 'paid'
    ORDER BY o.created_at DESC LIMIT 20`) as Record<string, unknown>[];
  const receivablesOrders = receivableRows.map((row) => ({
    id: String(row.id),
    customer: String(row.customer),
    total: Number(row.total ?? 0),
    paymentStatus: String(row.payment_status ?? "unpaid"),
  }));

  const payableRows = (await db`
    SELECT v.id, v.name, COALESCE(SUM(MAX(0, p.total - p.amount_paid)), 0) AS owed
    FROM vendors v JOIN purchases p ON p.vendor_id = v.id
    WHERE v.store_id = ${storeId} AND p.status != 'cancelled'
    GROUP BY v.id HAVING owed > 0 ORDER BY owed DESC LIMIT 20`) as Record<string, unknown>[];
  const payablesVendors = payableRows.map((row) => ({ id: String(row.id), name: String(row.name), owed: Number(row.owed ?? 0) }));

  const salesOrderRows = (await db`
    SELECT o.id, COALESCE(c.name, 'Customer') AS customer, o.total, o.status, o.payment_status, o.created_at
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.store_id = ${storeId} AND o.status != 'cancelled'
    ORDER BY o.created_at DESC LIMIT 20`) as Record<string, unknown>[];
  const salesOrders = salesOrderRows.map((row) => ({
    id: String(row.id),
    customer: String(row.customer),
    total: Number(row.total ?? 0),
    status: String(row.status ?? ""),
    paymentStatus: String(row.payment_status ?? ""),
    createdAt: String(row.created_at),
  }));

  const cogsItemRows = (await db`
    SELECT p.name, COALESCE(SUM(oi.quantity), 0) AS qty, p.cost AS unit_cost, COALESCE(SUM(oi.quantity * p.cost), 0) AS total
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
    WHERE o.store_id = ${storeId} AND o.status != 'cancelled'
    GROUP BY oi.product_id ORDER BY total DESC LIMIT 20`) as Record<string, unknown>[];
  const cogsItems = cogsItemRows.map((row) => ({ name: String(row.name), quantity: Number(row.qty ?? 0), unitCost: Number(row.unit_cost ?? 0), total: Number(row.total ?? 0) }));

  const purchaseListRows = (await db`
    SELECT po.id, COALESCE(v.name, '') AS vendor, po.total, po.amount_paid, po.status, po.payment_status, po.created_at
    FROM purchases po LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.store_id = ${storeId} AND po.status != 'cancelled'
    ORDER BY po.created_at DESC LIMIT 20`) as Record<string, unknown>[];
  const purchaseList = purchaseListRows.map((row) => ({
    id: String(row.id),
    vendor: String(row.vendor),
    total: Number(row.total ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    status: String(row.status ?? ""),
    paymentStatus: String(row.payment_status ?? ""),
    createdAt: String(row.created_at),
  }));

  const paymentRows = (await db`
    SELECT pp.id, COALESCE(v.name, 'Vendor') AS vendor, pp.amount, pp.gateway, pp.reference, pp.created_at
    FROM purchase_payments pp LEFT JOIN vendors v ON v.id = pp.vendor_id
    WHERE pp.store_id = ${storeId}
    ORDER BY pp.created_at DESC LIMIT 20`) as Record<string, unknown>[];
  const purchasePayments = paymentRows.map((row) => ({
    id: String(row.id),
    vendor: String(row.vendor),
    amount: Number(row.amount ?? 0),
    gateway: String(row.gateway ?? ""),
    reference: String(row.reference ?? ""),
    createdAt: String(row.created_at),
  }));

  const receivables = Math.max(0, salesTotal - salesPaid);
  const payables = Math.max(0, purchaseTotal - purchasePaid);
  const cash = salesPaid - purchasePaid;
  const grossProfit = salesTotal - cogs;
  const totalAssets = invCost + receivables + cash;

  return {
    currency,
    sales: { total: salesTotal, paid: salesPaid, outstanding: receivables, orders: Number(sales.orders ?? 0) },
    purchases: { total: purchaseTotal, paid: purchasePaid, owed: payables, count: Number(purchaseRows[0]?.count ?? 0) },
    cogs,
    grossProfit,
    grossMarginPct: salesTotal > 0 ? grossProfit / salesTotal : 0,
    inventory: { units: invUnits, costValue: invCost, retailValue: invRetail, itemCount: Number(invRows[0]?.item_count ?? 0) },
    balance: { cash, receivables, inventoryCost: invCost, totalAssets, payables, equity: totalAssets - payables },
    receivablesOrders,
    payablesVendors,
    salesOrders,
    cogsItems,
    purchaseList,
    purchasePayments,
  };
}

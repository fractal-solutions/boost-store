import { db } from "./db";
import type { StoreSettings } from "./defaults";
import { getDeliveryProvider, mapUberStatus, type DeliveryAddress, type QuoteResult } from "./delivery";
import {
  ApiError,
  badRequest,
  isForwardTransition,
  newId,
  nowIso,
  parseJson,
  STATUS_MESSAGES,
  STATUS_PROGRESS,
  str,
  TERMINAL_ORDER_STATUSES,
} from "./lib";
import { getGateway, type PaymentInitResult } from "./payments";
import { getSettings, getStoreRow, type StoreRow } from "./stores";

export type OrderRow = {
  id: string;
  store_id: string;
  customer_id: string;
  status: string;
  payment_timing: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  delivery_provider: string;
  delivery_quote_id: string;
  delivery_id: string;
  delivery_status: string;
  tracking_url: string;
  eta_minutes: number;
  progress_percent: number;
  pickup_address: string;
  dropoff_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  courier_latitude: number | null;
  courier_longitude: number | null;
  courier_name: string;
  courier_phone: string;
  courier_updated_at: string | null;
  payment_status: string;
  payment_gateway: string;
  payment_reference: string;
  payment_transaction_id: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  line_total: number;
};

export type OrderEventRow = {
  id: string;
  order_id: string;
  status: string;
  message: string;
  location: string;
  created_at: string;
};

type QuoteCacheEntry = QuoteResult & { at: number };

const quoteCache = new Map<string, QuoteCacheEntry>();
const QUOTE_TTL_MS = 10 * 60 * 1000;

function addressFrom(value: unknown, fallback: DeliveryAddress): DeliveryAddress {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const street = Array.isArray(v.street_address) ? v.street_address.map(String) : [];
    return { street_address: street.length ? street : fallback.street_address, city: str(v.city, fallback.city), country: str(v.country, fallback.country) };
  }
  if (typeof value === "string" && value.trim()) {
    return { street_address: [value.trim()], city: fallback.city, country: fallback.country };
  }
  return fallback;
}

export async function quoteDelivery(settings: StoreSettings, input: { dropoff: DeliveryAddress; pickup?: DeliveryAddress }): Promise<QuoteResult> {
  const provider = getDeliveryProvider(settings.delivery.provider);
  const pickup = input.pickup ?? settings.pickup;
  const quote = await provider.quote(
    { pickup, dropoff: input.dropoff, pickupLatitude: settings.pickup.latitude, pickupLongitude: settings.pickup.longitude },
    settings,
  );
  quoteCache.set(quote.quoteId, { ...quote, at: Date.now() });
  return quote;
}

export async function createOrder(
  store: StoreRow,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const settings = getSettings(store);
  const customerInput = (body.customer ?? {}) as Record<string, unknown>;
  const name = str(customerInput.name).trim();
  const email = str(customerInput.email).trim().toLowerCase();
  if (!name || !email) throw badRequest("VALIDATION_ERROR", "Customer name and email are required.");

  const itemsInput = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  if (itemsInput.length === 0) throw badRequest("VALIDATION_ERROR", "Your cart is empty.");

  const paymentTiming = body.paymentTiming === "cod" ? "cod" : body.paymentTiming === "prepay" ? "prepay" : settings.paymentTiming;
  const defaultDropoff: DeliveryAddress = { street_address: ["", ""], city: "Nairobi", country: "KE" };
  const dropoff = addressFrom(body.dropoff ?? customerInput.address, defaultDropoff);
  if (!dropoff.street_address.some((line) => line.trim())) throw badRequest("VALIDATION_ERROR", "A delivery address is required.");

  const coords = body.dropoffCoords as Record<string, unknown> | undefined;
  const dropoffLatitude = Number.isFinite(Number(coords?.latitude)) ? Number(coords?.latitude) : settings.demoDropoff.latitude;
  const dropoffLongitude = Number.isFinite(Number(coords?.longitude)) ? Number(coords?.longitude) : settings.demoDropoff.longitude;

  // Resolve delivery fee from a cached quote (never trust a client-supplied fee).
  let fee = 0;
  let etaMinutes = 30;
  let quoteId = str(body.quoteId);
  const cached = quoteId ? quoteCache.get(quoteId) : undefined;
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) {
    fee = cached.fee;
    etaMinutes = cached.etaMinutes;
  } else {
    const quote = await quoteDelivery(settings, { dropoff });
    fee = quote.fee;
    etaMinutes = quote.etaMinutes;
    quoteId = quote.quoteId;
  }

  const now = nowIso();
  const orderId = newId("ord");
  let customerId = "";
  let subtotal = 0;

  await db.begin(async (tx) => {
    const existing = await tx`SELECT id FROM customers WHERE store_id = ${store.id} AND email = ${email} LIMIT 1`;
    if (existing.length > 0) {
      customerId = (existing[0] as { id: string }).id;
      await tx`UPDATE customers SET name = ${name}, phone = ${str(customerInput.phone)}, address = ${str(customerInput.address)} WHERE id = ${customerId}`;
    } else {
      customerId = newId("cus");
      await tx`INSERT INTO customers ${tx({
        id: customerId,
        store_id: store.id,
        name,
        email,
        phone: str(customerInput.phone),
        address: str(customerInput.address),
        created_at: now,
      })}`;
    }

    const lines: { id: string; product_id: string; name: string; price: number; quantity: number; image: string; line_total: number }[] = [];
    for (const raw of itemsInput) {
      const productId = str(raw.productId);
      const quantity = Math.trunc(Number(raw.quantity));
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) throw badRequest("VALIDATION_ERROR", "Each item needs a product and a positive quantity.");
      const productRows = await tx`SELECT * FROM products WHERE id = ${productId} AND store_id = ${store.id} LIMIT 1`;
      const product = productRows[0] as { id: string; name: string; price: number; stock: number; image: string } | undefined;
      if (!product) throw badRequest("VALIDATION_ERROR", `Product ${productId} was not found.`);
      if (product.stock < quantity) throw badRequest("INSUFFICIENT_STOCK", `Only ${product.stock} left of ${product.name}.`);
      const lineTotal = product.price * quantity;
      subtotal += lineTotal;
      lines.push({ id: newId("oi"), product_id: product.id, name: product.name, price: product.price, quantity, image: product.image, line_total: lineTotal });
    }

    const total = subtotal + fee;
    const paymentStatus = paymentTiming === "cod" ? "cod_pending" : "unpaid";
    await tx`INSERT INTO orders ${tx({
      id: orderId,
      store_id: store.id,
      customer_id: customerId,
      status: "pending",
      payment_timing: paymentTiming,
      subtotal,
      delivery_fee: fee,
      total,
      currency: store.currency,
      delivery_provider: settings.delivery.provider,
      delivery_quote_id: quoteId,
      eta_minutes: etaMinutes,
      progress_percent: STATUS_PROGRESS.pending,
      pickup_address: JSON.stringify(settings.pickup),
      dropoff_address: JSON.stringify(dropoff),
      pickup_latitude: settings.pickup.latitude,
      pickup_longitude: settings.pickup.longitude,
      dropoff_latitude: dropoffLatitude,
      dropoff_longitude: dropoffLongitude,
      payment_status: paymentStatus,
      created_at: now,
      updated_at: now,
    })}`;
    for (const line of lines) await tx`INSERT INTO order_items ${tx({ ...line, order_id: orderId })}`;
    for (const line of lines) await tx`UPDATE products SET stock = stock - ${line.quantity}, updated_at = ${now} WHERE id = ${line.product_id}`;
    await tx`INSERT INTO order_events ${tx({
      id: newId("evt"),
      order_id: orderId,
      status: "pending",
      message: STATUS_MESSAGES.pending,
      location: "",
      created_at: now,
    })}`;
  });

  let order = (await getOrderRow(orderId))!;

  // Cash on delivery: book the courier right away. Prepay waits for payment.
  if (paymentTiming === "cod") {
    order = (await bookDelivery(order, store)) ?? order;
  }

  return hydrateOrder(order);
}

export async function getOrderRow(orderId: string): Promise<OrderRow | undefined> {
  const rows = await db`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`;
  return rows[0] as OrderRow | undefined;
}

export async function getOrderById(storeId: string, orderId: string): Promise<OrderRow | undefined> {
  const rows = await db`SELECT * FROM orders WHERE id = ${orderId} AND store_id = ${storeId} LIMIT 1`;
  return rows[0] as OrderRow | undefined;
}

export async function listOrders(storeId: string, status?: string): Promise<OrderRow[]> {
  const rows = status
    ? await db`SELECT * FROM orders WHERE store_id = ${storeId} AND status = ${status} ORDER BY created_at DESC`
    : await db`SELECT * FROM orders WHERE store_id = ${storeId} ORDER BY created_at DESC`;
  return rows as OrderRow[];
}

/** A customer's own orders, matched by the email used at checkout (any device). */
export async function listOrdersByEmail(storeId: string, email: string): Promise<OrderRow[]> {
  const rows = await db`
    SELECT o.* FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.store_id = ${storeId} AND lower(c.email) = ${email}
    ORDER BY o.created_at DESC LIMIT 50`;
  return rows as OrderRow[];
}

/** A signed-in customer's orders. */
export async function listOrdersByCustomer(storeId: string, customerId: string): Promise<OrderRow[]> {
  const rows = await db`SELECT * FROM orders WHERE store_id = ${storeId} AND customer_id = ${customerId} ORDER BY created_at DESC LIMIT 50`;
  return rows as OrderRow[];
}

export async function hydrateOrder(order: OrderRow): Promise<Record<string, unknown>> {
  const items = (await db`SELECT * FROM order_items WHERE order_id = ${order.id}`) as OrderItemRow[];
  const events = (await db`SELECT * FROM order_events WHERE order_id = ${order.id} ORDER BY created_at ASC`) as OrderEventRow[];
  const pings = (await db`SELECT latitude, longitude, status, created_at FROM order_courier_pings WHERE order_id = ${order.id} ORDER BY created_at ASC LIMIT 300`) as { latitude: number; longitude: number; status: string; created_at: string }[];
  const customers = await db`SELECT * FROM customers WHERE id = ${order.customer_id} LIMIT 1`;
  const customer = customers[0] as Record<string, unknown> | undefined;
  return {
    id: order.id,
    status: order.status,
    paymentTiming: order.payment_timing,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total),
    currency: order.currency,
    paymentStatus: order.payment_status,
    paymentGateway: str(order.payment_gateway),
    paymentReference: str(order.payment_reference),
    paymentTransactionId: str(order.payment_transaction_id),
    delivery: {
      provider: str(order.delivery_provider),
      quoteId: str(order.delivery_quote_id),
      deliveryId: str(order.delivery_id),
      status: str(order.delivery_status),
      trackingUrl: str(order.tracking_url),
      etaMinutes: Number(order.eta_minutes),
      progressPercent: Number(order.progress_percent),
      pickup: parseJson<DeliveryAddress>(order.pickup_address, { street_address: [], city: "", country: "" }),
      dropoff: parseJson<DeliveryAddress>(order.dropoff_address, { street_address: [], city: "", country: "" }),
      pickupCoords: order.pickup_latitude != null ? { latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude) } : null,
      dropoffCoords: order.dropoff_latitude != null ? { latitude: Number(order.dropoff_latitude), longitude: Number(order.dropoff_longitude) } : null,
      courier:
        order.courier_latitude != null
          ? {
              latitude: Number(order.courier_latitude),
              longitude: Number(order.courier_longitude),
              name: /uber|boost|postmates|direct/i.test(str(order.courier_name)) ? "" : str(order.courier_name),
              phone: str(order.courier_phone),
              updatedAt: order.courier_updated_at,
            }
          : null,
      path: pings.map((ping) => ({
        latitude: Number(ping.latitude),
        longitude: Number(ping.longitude),
        status: ping.status,
        at: ping.created_at,
      })),
    },
    customer: customer
      ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address }
      : null,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      image: item.image,
      lineTotal: Number(item.line_total),
    })),
    events: events.map((event) => ({
      id: event.id,
      status: event.status,
      message: event.message,
      location: event.location,
      createdAt: event.created_at,
    })),
    confirmedAt: order.confirmed_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

async function appendEvent(orderId: string, status: string, message: string, location = ""): Promise<void> {
  await db`INSERT INTO order_events ${db({
    id: newId("evt"),
    order_id: orderId,
    status,
    message,
    location,
    created_at: nowIso(),
  })}`;
}

export async function updateOrderStatus(orderId: string, status: string, message?: string): Promise<OrderRow> {
  const order = await getOrderRow(orderId);
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  if (!isForwardTransition(order.status, status)) {
    throw badRequest("INVALID_TRANSITION", `Cannot move an order from ${order.status} to ${status}.`);
  }
  const etaMinutes = status === "delivered" ? 0 : order.eta_minutes;
  await db`UPDATE orders SET status = ${status}, progress_percent = ${STATUS_PROGRESS[status] ?? order.progress_percent}, eta_minutes = ${etaMinutes}, updated_at = ${nowIso()} WHERE id = ${orderId}`;
  await appendEvent(orderId, status, message ?? STATUS_MESSAGES[status] ?? `Status changed to ${status}`);
  return (await getOrderRow(orderId))!;
}

export async function confirmReceipt(orderId: string): Promise<Record<string, unknown>> {
  const order = await getOrderRow(orderId);
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  if (order.status === "completed") return hydrateOrder(order);
  if (order.status !== "delivered") {
    throw badRequest("NOT_DELIVERED", "You can confirm receipt once the order has been delivered.");
  }
  await db`UPDATE orders SET status = 'completed', progress_percent = 100, confirmed_at = ${nowIso()}, updated_at = ${nowIso()} WHERE id = ${orderId}`;
  await appendEvent(orderId, "completed", STATUS_MESSAGES.completed);
  if (order.payment_timing === "cod") {
    await db`UPDATE orders SET payment_status = 'paid', payment_gateway = 'cod', payment_transaction_id = ${`COD-${order.id}`}, updated_at = ${nowIso()} WHERE id = ${orderId}`;
    await appendEvent(orderId, "completed", "Payment collected on delivery");
  }
  return hydrateOrder((await getOrderRow(orderId))!);
}

export async function bookDelivery(order: OrderRow, store: StoreRow): Promise<OrderRow> {
  const settings = getSettings(store);
  const provider = getDeliveryProvider(settings.delivery.provider);
  const pickup = parseJson<DeliveryAddress>(order.pickup_address, settings.pickup);
  const dropoff = parseJson<DeliveryAddress>(order.dropoff_address, { street_address: [], city: "", country: "" });
  const items = (await db`SELECT * FROM order_items WHERE order_id = ${order.id}`) as OrderItemRow[];
  const customerRows = (await db`SELECT name, phone FROM customers WHERE id = ${order.customer_id} LIMIT 1`) as { name: string; phone: string }[];
  const customer = customerRows[0];

  let result;
  try {
    result = await provider.book(
      {
        quoteId: order.delivery_quote_id,
        pickup,
        dropoff,
        pickupName: store.name,
        pickupPhone: process.env.STORE_PICKUP_PHONE || "+254700000000",
        dropoffName: customer?.name || "Customer",
        dropoffPhone: customer?.phone || "+254711111111",
        reference: order.id,
        totalCents: Math.round(order.total * 100),
        items: items.map((item) => ({ name: item.name, quantity: Number(item.quantity), price: Number(item.price) })),
      },
      settings,
    );
  } catch (error) {
    await appendEvent(order.id, order.status, `Delivery booking failed: ${error instanceof Error ? error.message : "unknown error"}`);
    throw error;
  }

  await db`UPDATE orders SET
      delivery_provider = ${result.provider},
      delivery_id = ${result.deliveryId},
      delivery_status = ${result.status},
      tracking_url = ${result.trackingUrl},
      status = ${"dispatched"},
      progress_percent = ${STATUS_PROGRESS.dispatched},
      updated_at = ${nowIso()}
    WHERE id = ${order.id}`;
  await appendEvent(order.id, "dispatched", STATUS_MESSAGES.dispatched);
  return (await getOrderRow(order.id))!;
}

// --- payments orchestration ---

export async function payOrder(order: OrderRow, store: StoreRow, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = getSettings(store);
  if (order.payment_status === "paid") throw badRequest("ALREADY_PAID", "This order is already paid.");
  const gatewayKey = str(body.gateway) || settings.defaultPaymentGateway || "mock";
  const gateway = getGateway(gatewayKey);
  if (!gateway) throw badRequest("UNKNOWN_GATEWAY", `Unknown payment gateway "${gatewayKey}".`);
  const config = (settings.payments[gatewayKey] ?? {}) as Record<string, unknown>;
  if (config.enabled === false) throw badRequest("GATEWAY_DISABLED", `${gateway.label} is not enabled for this store.`);

  const now = nowIso();
  const paymentId = newId("pay");
  await db`INSERT INTO payments ${db({
    id: paymentId,
    store_id: store.id,
    order_id: order.id,
    gateway: gatewayKey,
    amount: order.total,
    currency: order.currency,
    phone: str(body.phone),
    status: "pending",
    reference: order.id,
    transaction_id: "",
    meta: "{}",
    created_at: now,
    updated_at: now,
  })}`;

  let result: PaymentInitResult;
  try {
    result = await gateway.initiate(config, {
      orderId: order.id,
      amount: order.total,
      currency: order.currency,
      phone: str(body.phone),
      reference: order.id,
      description: `${store.name} order`,
    }, { baseUrl: (process.env.APP_BASE_URL || "http://localhost:4000"), storeId: store.id, storeName: store.name });
  } catch (error) {
    await db`UPDATE payments SET status = ${"failed"}, updated_at = ${nowIso()} WHERE id = ${paymentId}`;
    throw badRequest("PAYMENT_ERROR", error instanceof Error ? error.message : "Payment failed.");
  }

  await db`UPDATE payments SET
      status = ${result.status},
      transaction_id = ${result.transactionId ?? ""},
      reference = ${result.reference ?? order.id},
      meta = ${JSON.stringify({ placeholder: result.placeholder ?? false, message: result.message ?? "", raw: result.raw ?? null })},
      updated_at = ${nowIso()}
    WHERE id = ${paymentId}`;

  await db`UPDATE orders SET payment_gateway = ${gatewayKey}, payment_reference = ${result.reference ?? order.id}, updated_at = ${nowIso()} WHERE id = ${order.id}`;

  if (result.status === "paid") {
    await confirmPayment(order.id, {
      gateway: gatewayKey,
      transactionId: result.transactionId ?? "",
      reference: result.reference ?? order.id,
      message: result.message,
    });
  } else if (result.status === "failed") {
    await db`UPDATE orders SET payment_status = ${"failed"}, updated_at = ${nowIso()} WHERE id = ${order.id}`;
  } else {
    await db`UPDATE orders SET payment_status = ${"pending"}, updated_at = ${nowIso()} WHERE id = ${order.id}`;
  }

  return hydrateOrder((await getOrderRow(order.id))!);
}

export async function confirmPayment(
  orderId: string,
  info: { gateway: string; transactionId: string; reference: string; message?: string },
): Promise<void> {
  const order = await getOrderRow(orderId);
  if (!order) return;
  await db`UPDATE orders SET
      payment_status = ${"paid"},
      payment_gateway = ${info.gateway},
      payment_transaction_id = ${info.transactionId},
      payment_reference = ${info.reference},
      status = ${order.status === "pending" ? "processing" : order.status},
      progress_percent = ${order.status === "pending" ? STATUS_PROGRESS.processing : order.progress_percent},
      updated_at = ${nowIso()}
    WHERE id = ${orderId}`;
  await appendEvent(orderId, "processing", info.message || "Payment confirmed");
  const updated = (await getOrderRow(orderId))!;
  if (updated.payment_timing === "prepay" && !updated.delivery_id) {
    const store = await getStoreRow(updated.store_id);
    try {
      await bookDelivery(updated, store);
    } catch (error) {
      await appendEvent(orderId, updated.status, `Delivery booking failed after payment: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
}

export async function simulateCallback(orderId: string): Promise<Record<string, unknown>> {
  const rows = await db`SELECT * FROM payments WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1`;
  const payment = rows[0] as Record<string, unknown> | undefined;
  if (!payment) throw badRequest("NO_PAYMENT", "No payment has been started for this order.");
  await db`UPDATE payments SET status = ${"paid"}, transaction_id = ${`SIM${Math.floor(10000000 + Math.random() * 89999999)}`}, updated_at = ${nowIso()} WHERE id = ${payment.id}`;
  await confirmPayment(orderId, {
    gateway: String(payment.gateway),
    transactionId: String(payment.transaction_id || `SIM${Math.floor(100000 + Math.random() * 899999)}`),
    reference: String(payment.reference || orderId),
    message: "Payment confirmed (simulated callback)",
  });
  return hydrateOrder((await getOrderRow(orderId))!);
}

export async function applyGatewayCallback(gatewayKey: string, body: unknown): Promise<{ handled: boolean; orderId?: string }> {
  const gateway = getGateway(gatewayKey);
  if (!gateway) return { handled: false };
  const parsed = gateway.parseCallback({}, body);
  if (!parsed) return { handled: false };
  const rows = await db`SELECT * FROM payments WHERE transaction_id = ${parsed.reference} AND gateway = ${gatewayKey} ORDER BY created_at DESC LIMIT 1`;
  const payment = rows[0] as { id: string; order_id: string } | undefined;
  if (!payment) return { handled: false };
  await db`UPDATE payments SET status = ${parsed.status}, transaction_id = ${parsed.transactionId ?? parsed.reference}, meta = ${JSON.stringify({ rawCallback: parsed.raw ?? null })}, updated_at = ${nowIso()} WHERE id = ${payment.id}`;
  if (parsed.status === "paid") {
    await confirmPayment(payment.order_id, {
      gateway: gatewayKey,
      transactionId: parsed.transactionId ?? parsed.reference,
      reference: parsed.reference,
      message: parsed.message,
    });
  } else if (parsed.status === "failed") {
    await db`UPDATE orders SET payment_status = ${"failed"}, updated_at = ${nowIso()} WHERE id = ${payment.order_id}`;
  }
  return { handled: true, orderId: payment.order_id };
}

// --- delivery webhooks (forwarded by boost-carrier) ---

async function recordCourier(orderId: string, data: Record<string, unknown>, status: string): Promise<void> {
  const courier = (data.courier ?? {}) as Record<string, unknown>;
  const latitude = Number(courier.lat);
  const longitude = Number(courier.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const rawName = str(courier.name);
  const name = /uber|boost|postmates|direct/i.test(rawName) ? "" : rawName;
  const phone = str(courier.phone_number) || str(courier.public_phone_info);
  const now = nowIso();
  await db`INSERT INTO order_courier_pings ${db({
    id: newId("ping"),
    order_id: orderId,
    latitude,
    longitude,
    status,
    created_at: now,
  })}`;
  await db`UPDATE orders SET
      courier_latitude = ${latitude},
      courier_longitude = ${longitude},
      courier_name = ${name},
      courier_phone = ${phone},
      courier_updated_at = ${now},
      updated_at = ${now}
    WHERE id = ${orderId}`;
}

export async function applyDeliveryEvent(body: Record<string, unknown>): Promise<{ handled: boolean; orderId?: string; status?: string }> {
  const deliveryId = str(body.delivery_id);
  const kind = str(body.kind);
  if (!deliveryId) return { handled: false };
  const rows = await db`SELECT * FROM orders WHERE delivery_id = ${deliveryId} ORDER BY created_at DESC LIMIT 1`;
  const order = rows[0] as OrderRow | undefined;
  if (!order) return { handled: false };

  const data = (body.data ?? {}) as Record<string, unknown>;
  const trackingUrl = str(data.tracking_url);

  if (kind === "event.courier_update") {
    await recordCourier(order.id, data, str(data.status) || order.status);
    if (trackingUrl) await db`UPDATE orders SET tracking_url = ${trackingUrl}, updated_at = ${nowIso()} WHERE id = ${order.id}`;
    return { handled: true, orderId: order.id, status: order.status };
  }
  if (kind !== "event.delivery_status") return { handled: false };

  const uberStatus = str(data.status);
  const mapped = mapUberStatus(uberStatus);
  await recordCourier(order.id, data, uberStatus);
  await db`UPDATE orders SET delivery_status = ${uberStatus}, tracking_url = ${trackingUrl || order.tracking_url}, updated_at = ${nowIso()} WHERE id = ${order.id}`;
  if (mapped && mapped !== order.status && !TERMINAL_ORDER_STATUSES.has(order.status) && isForwardTransition(order.status, mapped)) {
    await db`UPDATE orders SET status = ${mapped}, progress_percent = ${STATUS_PROGRESS[mapped]}, eta_minutes = ${mapped === "delivered" ? 0 : order.eta_minutes}, updated_at = ${nowIso()} WHERE id = ${order.id}`;
    await appendEvent(order.id, mapped, STATUS_MESSAGES[mapped] ?? "Delivery update");
  }
  return { handled: true, orderId: order.id, status: mapped ?? order.status };
}

// --- analytics ---

export async function productPopularity(storeId: string): Promise<Map<string, number>> {
  const rows = (await db`
    SELECT oi.product_id AS product_id, SUM(oi.quantity) AS sold
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ${storeId} AND o.status != 'cancelled'
    GROUP BY oi.product_id`) as { product_id: string; sold: number }[];
  return new Map(rows.map((row) => [row.product_id, Number(row.sold)]));
}

export async function orderStats(storeId: string) {
  const orders = await listOrders(storeId);
  const revenue = orders.filter((o) => o.payment_status === "paid").reduce((sum, o) => sum + Number(o.total), 0);
  const byStatus: Record<string, number> = {};
  for (const order of orders) byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
  const customers = await db`SELECT COUNT(*) AS count FROM customers WHERE store_id = ${storeId}`;
  return {
    orders: orders.length,
    revenue,
    currency: orders[0]?.currency ?? "KES",
    byStatus,
    customers: Number((customers[0] as { count: number } | undefined)?.count ?? 0),
  };
}

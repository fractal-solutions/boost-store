import type { StoreSettings } from "./defaults";
import type { OrderStatus } from "./lib";

export type DeliveryAddress = { street_address: string[]; city: string; country: string };

export interface QuoteInput {
  pickup: DeliveryAddress;
  dropoff: DeliveryAddress;
  pickupLatitude?: number;
  pickupLongitude?: number;
}

export interface QuoteResult {
  provider: string;
  quoteId: string;
  fee: number;
  currency: string;
  etaMinutes: number;
  raw?: unknown;
}

export interface ManifestItem {
  name: string;
  quantity: number;
  size?: string;
  price: number;
  weight?: number;
}

export interface BookInput {
  quoteId: string;
  pickup: DeliveryAddress;
  dropoff: DeliveryAddress;
  pickupName: string;
  pickupPhone: string;
  dropoffName: string;
  dropoffPhone: string;
  reference: string;
  totalCents: number;
  items: ManifestItem[];
}

export interface BookResult {
  provider: string;
  deliveryId: string;
  status: string;
  trackingUrl: string;
  raw?: unknown;
}

export interface DeliveryProvider {
  key: string;
  label: string;
  quote(input: QuoteInput, settings: StoreSettings): Promise<QuoteResult>;
  book(input: BookInput, settings: StoreSettings): Promise<BookResult>;
  getStatus(deliveryId: string, settings: StoreSettings): Promise<{ status: string; trackingUrl?: string; raw?: unknown }>;
}

/** Translate an Uber Direct delivery status into our order lifecycle. */
export function mapUberStatus(status: string): OrderStatus | null {
  switch (status) {
    case "pending":
      return "dispatched";
    case "pickup":
    case "pickup_complete":
      return "in_transit";
    case "dropoff":
      return "out_for_delivery";
    case "delivered":
      return "delivered";
    case "canceled":
    case "returned":
      return "cancelled";
    default:
      return null;
  }
}

// --- boost-carrier (Uber Direct) provider ---

async function boostCarrierRequest<T>(
  settings: StoreSettings,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, customerId } = settings.delivery.boostCarrier;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/customers/${encodeURIComponent(customerId)}/${endpoint}`;
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new Error(`Boost delivery service is unreachable at ${baseUrl}.`);
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (body.error as string) || (body.message as string) || `Boost delivery request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export const boostCarrierProvider: DeliveryProvider = {
  key: "boost-carrier",
  label: "Boost (Uber Direct)",
  async quote(input, settings) {
    const body = await boostCarrierRequest<Record<string, unknown>>(settings, "delivery_quotes", {
      method: "POST",
      body: JSON.stringify({
        pickup_address: input.pickup,
        dropoff_address: input.dropoff,
        pickup_latitude: input.pickupLatitude,
        pickup_longitude: input.pickupLongitude,
      }),
    });
    const baseFee = Number(body.estimated_fee ?? body.fee ?? 0);
    const fee = Math.round(baseFee + Number(settings.delivery.markup ?? 0));
    return {
      provider: "boost-carrier",
      quoteId: String(body.quote_id ?? body.id ?? ""),
      fee,
      currency: "KES",
      etaMinutes: Number(body.duration ? Math.round(Number(body.duration) / 60) : 35),
      raw: body,
    };
  },
  async book(input, settings) {
    const body = await boostCarrierRequest<Record<string, unknown>>(settings, "deliveries", {
      method: "POST",
      body: JSON.stringify({
        quote_id: input.quoteId,
        pickup_address: input.pickup,
        dropoff_address: input.dropoff,
        pickup_name: input.pickupName,
        pickup_phone_number: input.pickupPhone,
        dropoff_name: input.dropoffName,
        dropoff_phone_number: input.dropoffPhone,
        manifest_reference: input.reference,
        external_id: input.reference,
        idempotency_key: input.reference,
        manifest_total_value_cents: input.totalCents,
        deliverable_action: "deliverable_action_meet_at_door",
        undeliverable_action: "return",
        manifest_items: input.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          size: item.size ?? "medium",
          price: Math.round(item.price * 100),
          weight: item.weight ?? 500,
          must_be_upright: false,
        })),
      }),
    });
    return {
      provider: "boost-carrier",
      deliveryId: String(body.id ?? ""),
      status: String(body.status ?? "pending"),
      trackingUrl: String(body.tracking_url ?? ""),
      raw: body,
    };
  },
  async getStatus(deliveryId, settings) {
    const body = await boostCarrierRequest<Record<string, unknown>>(settings, `deliveries/${encodeURIComponent(deliveryId)}`);
    return { status: String(body.status ?? "pending"), trackingUrl: body.tracking_url ? String(body.tracking_url) : undefined, raw: body };
  },
};

// --- simulated provider (no external services required) ---

const simulatedBookings = new Map<string, { bookedAt: number; etaMinutes: number }>();
const SIMULATED_FLOW: { at: number; status: string }[] = [
  { at: 0, status: "pending" },
  { at: 0.1, status: "pickup" },
  { at: 0.3, status: "pickup_complete" },
  { at: 0.6, status: "dropoff" },
  { at: 0.9, status: "delivered" },
];

export const simulatedProvider: DeliveryProvider = {
  key: "simulated",
  label: "Simulated courier",
  async quote(_input, settings) {
    return { provider: "simulated", quoteId: `simq_${crypto.randomUUID().slice(0, 8)}`, fee: 350 + Number(settings.delivery.markup ?? 0), currency: "KES", etaMinutes: 30 };
  },
  async book(input) {
    const deliveryId = `sim_${crypto.randomUUID().slice(0, 10)}`;
    simulatedBookings.set(deliveryId, { bookedAt: Date.now(), etaMinutes: 30 });
    return { provider: "simulated", deliveryId, status: "pending", trackingUrl: `https://boost.local/track/${deliveryId}` };
  },
  async getStatus(deliveryId) {
    const booking = simulatedBookings.get(deliveryId);
    if (!booking) return { status: "pending" };
    const elapsed = (Date.now() - booking.bookedAt) / 1000;
    const total = booking.etaMinutes * 60;
    const progress = Math.min(1, elapsed / total);
    let status = "pending";
    for (const step of SIMULATED_FLOW) if (progress >= step.at) status = step.status;
    return { status };
  },
};

const providers = new Map<string, DeliveryProvider>([
  [boostCarrierProvider.key, boostCarrierProvider],
  [simulatedProvider.key, simulatedProvider],
]);

export function getDeliveryProvider(key: string): DeliveryProvider {
  return providers.get(key) ?? boostCarrierProvider;
}

export function listDeliveryProviders(): { key: string; label: string }[] {
  return [...providers.values()].map((p) => ({ key: p.key, label: p.label }));
}

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "ready",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled"]);

export const STATUS_PROGRESS: Record<string, number> = {
  pending: 10,
  processing: 25,
  ready: 40,
  dispatched: 55,
  in_transit: 70,
  out_for_delivery: 88,
  delivered: 95,
  completed: 100,
  cancelled: 0,
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready for pickup",
  dispatched: "Courier dispatched",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_MESSAGES: Record<string, string> = {
  pending: "Order placed and awaiting confirmation",
  processing: "Payment confirmed, preparing your order",
  ready: "Items packed and ready for the courier",
  dispatched: "Courier assigned and heading to pickup",
  in_transit: "Your package is on the move",
  out_for_delivery: "Courier is close to the drop-off",
  delivered: "Package delivered successfully",
  completed: "Order delivered and confirmed by the customer",
  cancelled: "Order was cancelled",
};

export const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "cod_pending"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_TIMINGS = ["prepay", "cod"] as const;
export type PaymentTiming = (typeof PAYMENT_TIMINGS)[number];

export function isForwardTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (TERMINAL_ORDER_STATUSES.has(from)) return false;
  const fromIdx = ORDER_STATUSES.indexOf(from as OrderStatus);
  const toIdx = ORDER_STATUSES.indexOf(to as OrderStatus);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx > fromIdx;
}

// --- ids ---

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "store";
}

export function nowIso(): string {
  return new Date().toISOString();
}

// --- errors + response envelope ---

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(code: string, message: string): ApiError {
  return new ApiError(400, code, message);
}

export function unauthorized(message = "Authentication required."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function notFound(message = "Not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function json(data: unknown, status = 200, message?: string): Response {
  return Response.json(
    message === undefined ? { success: true, data } : { success: true, data, message },
    { status },
  );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("Unhandled error", error);
  return Response.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Internal error" } },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw badRequest("VALIDATION_ERROR", "Request body must be a JSON object.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest("VALIDATION_ERROR", "Request body must contain valid JSON.");
  }
}

// --- cookies ---

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function cookieHeader(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// --- validation helpers ---

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest("VALIDATION_ERROR", `${field} is required.`);
  }
  return value.trim();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

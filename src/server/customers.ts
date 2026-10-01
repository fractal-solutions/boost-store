import { db } from "./db";
import { getSettings, type StoreRow } from "./stores";
import { ApiError, badRequest, isEmail, newId, nowIso, parseCookies, unauthorized } from "./lib";

export const CUSTOMER_COOKIE = "bs_customer";
const SESSION_DAYS = 30;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 6;

export type CustomerRow = {
  id: string;
  store_id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  password_hash: string;
  verified: number;
  last_login_at: string | null;
  created_at: string;
};

export type CustomerPublic = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  verified: boolean;
};

function toPublic(row: CustomerRow): CustomerPublic {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, address: row.address, verified: Number(row.verified) === 1 };
}

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\s()]/g, "");
}

async function findCustomerByEmail(storeId: string, email: string): Promise<CustomerRow | undefined> {
  const rows = await db`SELECT * FROM customers WHERE store_id = ${storeId} AND lower(email) = ${email} LIMIT 1`;
  return rows[0] as CustomerRow | undefined;
}

// --- sessions ---

async function createSession(customerId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await db`INSERT INTO customer_sessions ${db({
    token,
    customer_id: customerId,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
  })}`;
  return token;
}

export async function resolveCustomer(request: Request): Promise<CustomerRow | null> {
  const token = parseCookies(request)[CUSTOMER_COOKIE];
  if (!token) return null;
  const rows = await db`SELECT customer_id, expires_at FROM customer_sessions WHERE token = ${token} LIMIT 1`;
  const session = rows[0] as { customer_id: string; expires_at: string } | undefined;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db`DELETE FROM customer_sessions WHERE token = ${token}`;
    return null;
  }
  const customerRows = await db`SELECT * FROM customers WHERE id = ${session.customer_id} LIMIT 1`;
  return (customerRows[0] as CustomerRow | undefined) ?? null;
}

export async function requireCustomer(request: Request): Promise<CustomerRow> {
  const customer = await resolveCustomer(request);
  if (!customer) throw unauthorized("Sign in to continue.");
  return customer;
}

export async function logoutCustomer(token: string | undefined): Promise<void> {
  if (token) await db`DELETE FROM customer_sessions WHERE token = ${token}`;
}

// --- OTP ---

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Send the code to the configured webhook (n8n → email/WhatsApp). Returns false when unconfigured or unreachable. */
async function sendOtpWebhook(store: StoreRow, payload: Record<string, unknown>): Promise<boolean> {
  const settings = getSettings(store);
  const url = settings.otp?.webhookUrl?.trim();
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store: { id: store.id, name: store.name }, ...payload }),
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function issueOtp(store: StoreRow, email: string, phone: string, purpose: "signup" | "reset"): Promise<{ code: string; delivered: boolean }> {
  // Invalidate previous pending codes for this purpose.
  await db`UPDATE customer_otps SET status = 'superseded' WHERE store_id = ${store.id} AND email = ${email} AND purpose = ${purpose} AND status = 'pending'`;
  const code = generateCode();
  await db`INSERT INTO customer_otps ${db({
    id: newId("otp"),
    store_id: store.id,
    email,
    phone,
    purpose,
    code,
    status: "pending",
    attempts: 0,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    created_at: nowIso(),
  })}`;
  const delivered = await sendOtpWebhook(store, {
    event: purpose === "signup" ? "customer.otp_requested" : "customer.password_reset_requested",
    purpose,
    otp_code: code,
    email,
    phone,
    expires_in_minutes: OTP_TTL_MS / 60000,
  });
  return { code, delivered };
}

async function consumeOtp(storeId: string, email: string, purpose: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  const rows = await db`SELECT * FROM customer_otps WHERE store_id = ${storeId} AND email = ${email} AND purpose = ${purpose} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`;
  const otp = rows[0] as { id: string; code: string; attempts: number; expires_at: string } | undefined;
  if (!otp) return { ok: false, reason: "Request a new code." };
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await db`UPDATE customer_otps SET status = 'expired' WHERE id = ${otp.id}`;
    return { ok: false, reason: "That code has expired. Request a new one." };
  }
  if (Number(otp.attempts) >= MAX_OTP_ATTEMPTS) {
    await db`UPDATE customer_otps SET status = 'locked' WHERE id = ${otp.id}`;
    return { ok: false, reason: "Too many attempts. Request a new code." };
  }
  if (otp.code !== code.trim()) {
    await db`UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ${otp.id}`;
    return { ok: false, reason: "The code doesn't match. Try again." };
  }
  await db`UPDATE customer_otps SET status = 'verified' WHERE id = ${otp.id}`;
  return { ok: true };
}

// --- flows ---

export async function registerCustomer(store: StoreRow, body: Record<string, unknown>): Promise<{ email: string; delivered: boolean; demoCode?: string }> {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(body.phone ?? ""));
  const password = String(body.password ?? "");
  if (name.length < 2) throw badRequest("VALIDATION_ERROR", "Enter your full name.");
  if (!isEmail(email)) throw badRequest("VALIDATION_ERROR", "Enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 9) throw badRequest("VALIDATION_ERROR", "Enter a valid phone number.");
  if (password.length < 6) throw badRequest("VALIDATION_ERROR", "Password must be at least 6 characters.");

  const existing = await findCustomerByEmail(store.id, email);
  const passwordHash = await Bun.password.hash(password);
  if (existing && Number(existing.verified) === 1 && existing.password_hash) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists. Sign in instead.");
  }

  if (existing) {
    await db`UPDATE customers SET name = ${name}, phone = ${phone}, password_hash = ${passwordHash} WHERE id = ${existing.id}`;
  } else {
    await db`INSERT INTO customers ${db({
      id: newId("cus"),
      store_id: store.id,
      name,
      email,
      phone,
      address: "",
      password_hash: passwordHash,
      verified: 0,
      created_at: nowIso(),
    })}`;
  }

  const { code, delivered } = await issueOtp(store, email, phone, "signup");
  return { email, delivered, demoCode: delivered ? undefined : code };
}

export async function verifySignup(store: StoreRow, body: Record<string, unknown>): Promise<{ user: CustomerPublic; token: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "");
  const customer = await findCustomerByEmail(store.id, email);
  if (!customer) throw badRequest("NOT_FOUND", "No pending signup for that email.");
  const result = await consumeOtp(store.id, email, "signup", code);
  if (!result.ok) throw badRequest("INVALID_OTP", result.reason ?? "Invalid code.");
  await db`UPDATE customers SET verified = 1, last_login_at = ${nowIso()} WHERE id = ${customer.id}`;
  const token = await createSession(customer.id);
  return { user: toPublic((await db`SELECT * FROM customers WHERE id = ${customer.id} LIMIT 1`)[0] as CustomerRow), token };
}

export async function loginCustomer(store: StoreRow, body: Record<string, unknown>): Promise<{ user: CustomerPublic; token: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const customer = await findCustomerByEmail(store.id, email);
  if (!customer || !customer.password_hash || !(await Bun.password.verify(password, customer.password_hash))) {
    throw unauthorized("Invalid email or password.");
  }
  if (Number(customer.verified) !== 1) {
    const { code, delivered } = await issueOtp(store, email, customer.phone, "signup");
    throw new ApiError(403, "UNVERIFIED", `Verify your account to continue. Code sent${delivered ? "" : ` (demo code: ${code})`}.`);
  }
  await db`UPDATE customers SET last_login_at = ${nowIso()} WHERE id = ${customer.id}`;
  const token = await createSession(customer.id);
  return { user: toPublic(customer), token };
}

export async function forgotPassword(store: StoreRow, body: Record<string, unknown>): Promise<{ email: string; delivered: boolean; demoCode?: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) throw badRequest("VALIDATION_ERROR", "Enter a valid email address.");
  const customer = await findCustomerByEmail(store.id, email);
  // Always respond the same way to avoid leaking which emails exist.
  if (!customer) return { email, delivered: true };
  const { code, delivered } = await issueOtp(store, email, customer.phone, "reset");
  return { email, delivered, demoCode: delivered ? undefined : code };
}

export async function resetPassword(store: StoreRow, body: Record<string, unknown>): Promise<{ user: CustomerPublic; token: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "");
  const password = String(body.password ?? "");
  if (password.length < 6) throw badRequest("VALIDATION_ERROR", "Password must be at least 6 characters.");
  const customer = await findCustomerByEmail(store.id, email);
  if (!customer) throw badRequest("NOT_FOUND", "No account found for that email.");
  const result = await consumeOtp(store.id, email, "reset", code);
  if (!result.ok) throw badRequest("INVALID_OTP", result.reason ?? "Invalid code.");
  const passwordHash = await Bun.password.hash(password);
  await db`UPDATE customers SET password_hash = ${passwordHash}, verified = 1, last_login_at = ${nowIso()} WHERE id = ${customer.id}`;
  const token = await createSession(customer.id);
  return { user: toPublic((await db`SELECT * FROM customers WHERE id = ${customer.id} LIMIT 1`)[0] as CustomerRow), token };
}

export function publicCustomer(row: CustomerRow): CustomerPublic {
  return toPublic(row);
}

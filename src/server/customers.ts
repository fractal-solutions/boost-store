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
  birthday: string;
  gender: string;
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
  birthday: string;
  gender: string;
  verified: boolean;
};

const GENDERS = new Set(["male", "female", "other"]);

function toPublic(row: CustomerRow): CustomerPublic {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    birthday: row.birthday ?? "",
    gender: row.gender ?? "",
    verified: Number(row.verified) === 1,
  };
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

/** Send the code to the configured webhook (n8n → email/WhatsApp). */
async function sendOtpWebhook(url: string, store: StoreRow, payload: Record<string, unknown>): Promise<boolean> {
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

async function issueOtp(store: StoreRow, email: string, phone: string, purpose: "signup" | "reset"): Promise<{ code: string; configured: boolean; delivered: boolean }> {
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
  const url = getSettings(store).otp?.webhookUrl?.trim() ?? "";
  const configured = Boolean(url);
  const delivered = configured && (await sendOtpWebhook(url, store, {
    event: purpose === "signup" ? "customer.otp_requested" : "customer.password_reset_requested",
    purpose,
    otp_code: code,
    email,
    phone,
    expires_in_minutes: OTP_TTL_MS / 60000,
  }));
  return { code, configured, delivered };
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

export async function registerCustomer(store: StoreRow, body: Record<string, unknown>): Promise<{ email: string; delivered: boolean; configured: boolean; demoCode?: string }> {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(body.phone ?? ""));
  const password = String(body.password ?? "");
  const birthday = String(body.birthday ?? "").trim();
  const gender = String(body.gender ?? "").trim().toLowerCase();
  if (name.length < 2) throw badRequest("VALIDATION_ERROR", "Enter your full name.");
  if (!isEmail(email)) throw badRequest("VALIDATION_ERROR", "Enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 9) throw badRequest("VALIDATION_ERROR", "Enter a valid phone number.");
  if (password.length < 6) throw badRequest("VALIDATION_ERROR", "Password must be at least 6 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(new Date(birthday).getTime())) {
    throw badRequest("VALIDATION_ERROR", "Enter your birthday (YYYY-MM-DD).");
  }
  if (!GENDERS.has(gender)) throw badRequest("VALIDATION_ERROR", "Select your gender.");

  const existing = await findCustomerByEmail(store.id, email);
  const passwordHash = await Bun.password.hash(password);
  if (existing && Number(existing.verified) === 1 && existing.password_hash) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists. Sign in instead.");
  }

  if (existing) {
    await db`UPDATE customers SET name = ${name}, phone = ${phone}, birthday = ${birthday}, gender = ${gender}, password_hash = ${passwordHash} WHERE id = ${existing.id}`;
  } else {
    await db`INSERT INTO customers ${db({
      id: newId("cus"),
      store_id: store.id,
      name,
      email,
      phone,
      address: "",
      birthday,
      gender,
      password_hash: passwordHash,
      verified: 0,
      created_at: nowIso(),
    })}`;
  }

  const { code, delivered, configured } = await issueOtp(store, email, phone, "signup");
  return { email, delivered, configured, demoCode: configured ? undefined : code };
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
    const { code, configured } = await issueOtp(store, email, customer.phone, "signup");
    throw new ApiError(403, "UNVERIFIED", `Verify your account to continue. Code sent${configured ? "" : ` (demo code: ${code})`}.`);
  }
  await db`UPDATE customers SET last_login_at = ${nowIso()} WHERE id = ${customer.id}`;
  const token = await createSession(customer.id);
  return { user: toPublic(customer), token };
}

export async function forgotPassword(store: StoreRow, body: Record<string, unknown>): Promise<{ email: string; delivered: boolean; configured: boolean; demoCode?: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) throw badRequest("VALIDATION_ERROR", "Enter a valid email address.");
  const customer = await findCustomerByEmail(store.id, email);
  // Always respond the same way to avoid leaking which emails exist.
  if (!customer) return { email, delivered: true, configured: true };
  const { code, delivered, configured } = await issueOtp(store, email, customer.phone, "reset");
  return { email, delivered, configured, demoCode: configured ? undefined : code };
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

// --- CRM ---

export type CrmCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  birthday: string;
  age: number | null;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
};

function ageFrom(birthday: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const born = new Date(birthday);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Customer directory with CRM aggregates (orders, spend, last order, age). */
export async function listCustomersWithCrm(storeId: string): Promise<CrmCustomer[]> {
  const rows = (await db`
    SELECT c.id, c.name, c.email, c.phone, c.gender, c.birthday, c.verified, c.created_at, c.last_login_at,
           COUNT(o.id) AS orders,
           COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS spent,
           MAX(o.created_at) AS last_order_at
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.store_id = ${storeId}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 500`) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: String(row.phone ?? ""),
    gender: String(row.gender ?? ""),
    birthday: String(row.birthday ?? ""),
    age: ageFrom(String(row.birthday ?? "")),
    verified: Number(row.verified) === 1,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    orders: Number(row.orders ?? 0),
    spent: Number(row.spent ?? 0),
    lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
  }));
}

import { db } from "./db";
import { defaultSettings, defaultTheme } from "./defaults";
import {
  ApiError,
  badRequest,
  isEmail,
  newId,
  nowIso,
  parseCookies,
  requireString,
  slugify,
  unauthorized,
} from "./lib";

export const SESSION_COOKIE = "bs_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
};

async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

async function createSession(merchantId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await db`INSERT INTO sessions ${db({
    token,
    merchant_id: merchantId,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
  })}`;
  return token;
}

async function userForMerchant(merchantId: string): Promise<SessionUser> {
  const rows = await db`
    SELECT m.id AS id, m.name AS name, m.email AS email,
           s.id AS store_id, s.slug AS store_slug, s.name AS store_name
    FROM merchants m JOIN stores s ON s.merchant_id = m.id
    WHERE m.id = ${merchantId} LIMIT 1`;
  const row = rows[0] as Record<string, string> | undefined;
  if (!row) throw unauthorized();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    storeId: row.store_id,
    storeSlug: row.store_slug,
    storeName: row.store_name,
  };
}

export async function register(body: Record<string, unknown>): Promise<{ user: SessionUser; token: string }> {
  const name = requireString(body.name, "name");
  const email = requireString(body.email, "email").toLowerCase();
  const password = requireString(body.password, "password");
  if (!isEmail(email)) throw badRequest("VALIDATION_ERROR", "A valid email is required.");
  if (password.length < 6) throw badRequest("VALIDATION_ERROR", "Password must be at least 6 characters.");

  const existing = await db`SELECT id FROM merchants WHERE email = ${email}`;
  if (existing.length > 0) throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists.");

  const now = nowIso();
  const merchantId = newId("mer");
  const storeId = newId("store");
  const storeName = typeof body.storeName === "string" && body.storeName.trim() ? body.storeName.trim() : `${name}'s Store`;
  let slug = slugify(storeName);
  const slugTaken = await db`SELECT id FROM stores WHERE slug = ${slug}`;
  if (slugTaken.length > 0) slug = `${slug}-${storeId.slice(-4)}`;

  await db.begin(async (tx) => {
    await tx`INSERT INTO merchants ${tx({ id: merchantId, name, email, password_hash: await hashPassword(password), created_at: now })}`;
    await tx`INSERT INTO stores ${tx({
      id: storeId,
      merchant_id: merchantId,
      name: storeName,
      slug,
      description: "",
      currency: "KES",
      contact_email: email,
      announcement: "",
      theme: JSON.stringify(defaultTheme()),
      settings: JSON.stringify(defaultSettings()),
      created_at: now,
      updated_at: now,
    })}`;
  });

  return { user: await userForMerchant(merchantId), token: await createSession(merchantId) };
}

export async function login(body: Record<string, unknown>): Promise<{ user: SessionUser; token: string }> {
  const email = requireString(body.email, "email").toLowerCase();
  const password = requireString(body.password, "password");
  const rows = await db`SELECT id, password_hash FROM merchants WHERE email = ${email} LIMIT 1`;
  const row = rows[0] as { id: string; password_hash: string } | undefined;
  if (!row || !(await Bun.password.verify(password, row.password_hash))) {
    throw unauthorized("Invalid email or password.");
  }
  await db`UPDATE merchants SET last_login_at = ${nowIso()} WHERE id = ${row.id}`;
  return { user: await userForMerchant(row.id), token: await createSession(row.id) };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await db`DELETE FROM sessions WHERE token = ${token}`;
}

export async function resolveSession(request: Request): Promise<SessionUser | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const rows = await db`SELECT merchant_id, expires_at FROM sessions WHERE token = ${token} LIMIT 1`;
  const row = rows[0] as { merchant_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db`DELETE FROM sessions WHERE token = ${token}`;
    return null;
  }
  return userForMerchant(row.merchant_id);
}

export async function requireSession(request: Request): Promise<SessionUser> {
  const user = await resolveSession(request);
  if (!user) throw unauthorized();
  return user;
}

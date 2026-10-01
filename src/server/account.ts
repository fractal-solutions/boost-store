import { db } from "./db";
import { SESSION_COOKIE, login as merchantLogin, logout as merchantLogout, resolveSession, type SessionUser } from "./auth";
import { CUSTOMER_COOKIE, loginCustomer, logoutCustomer, resolveCustomer, type CustomerPublic } from "./customers";
import { parseCookies, unauthorized } from "./lib";
import type { StoreRow } from "./stores";

export type Account = {
  id: string;
  role: "admin" | "customer";
  isAdmin: boolean;
  name: string;
  email: string;
  phone: string;
  birthday: string;
  gender: string;
  storeId?: string;
  storeName?: string;
};

function fromMerchant(user: SessionUser): Account {
  return { id: user.id, role: "admin", isAdmin: true, name: user.name, email: user.email, phone: "", birthday: "", gender: "", storeId: user.storeId, storeName: user.storeName };
}

function fromCustomer(customer: CustomerPublic): Account {
  return { id: customer.id, role: "customer", isAdmin: false, name: customer.name, email: customer.email, phone: customer.phone, birthday: customer.birthday, gender: customer.gender };
}

export { fromCustomer as accountFromCustomer };

/** The signed-in user: an admin (merchant) or a shopper, or null. */
export async function getAccount(request: Request): Promise<Account | null> {
  const merchant = await resolveSession(request);
  if (merchant) return fromMerchant(merchant);
  const customer = await resolveCustomer(request);
  if (customer) return fromCustomer(customer);
  return null;
}

/**
 * One sign-in for everyone: admin (merchant) credentials first, then shopper
 * credentials. Returns which cookie to set so admin and customer sessions stay
 * isolated.
 */
export async function loginAccount(store: StoreRow, body: Record<string, unknown>): Promise<{ account: Account; cookie: string; token: string }> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) throw unauthorized("Enter your email and password.");

  const merchants = await db`SELECT id FROM merchants WHERE lower(email) = ${email} LIMIT 1`;
  if (merchants.length > 0) {
    const { user, token } = await merchantLogin({ email, password });
    return { account: fromMerchant(user), cookie: SESSION_COOKIE, token };
  }

  const { user, token } = await loginCustomer(store, { email, password });
  return { account: fromCustomer(user), cookie: CUSTOMER_COOKIE, token };
}

/** Sign out of everything — clears both admin and shopper sessions. */
export async function logoutAccount(request: Request): Promise<void> {
  const cookies = parseCookies(request);
  if (cookies[SESSION_COOKIE]) await merchantLogout(cookies[SESSION_COOKIE]);
  if (cookies[CUSTOMER_COOKIE]) await logoutCustomer(cookies[CUSTOMER_COOKIE]);
}

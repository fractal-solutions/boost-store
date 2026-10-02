import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { productImage } from "./images";
import {
  ApiError,
  badRequest,
  clearCookieHeader,
  cookieHeader,
  errorResponse,
  json,
  notFound,
  parseCookies,
  readJson,
  requireString,
  str,
} from "./lib";
import { buildMashup, daySeed, MASHUP_THEMES, type MashupTheme } from "./mashup";
import {
  applyDeliveryEvent,
  applyGatewayCallback,
  bookDelivery,
  confirmReceipt,
  createOrder,
  getOrderById,
  getOrderRow,
  hydrateOrder,
  listOrders,
  listOrdersByCustomer,
  listOrdersByEmail,
  orderStats,
  payOrder,
  productPopularity,
  quoteDelivery,
  simulateCallback,
  updateOrderStatus,
} from "./orders";
import { mapConfig, reverseGeocode, route as computeRoute, searchPlaces } from "./geo";
import { getGateway, gatewayView, listGateways } from "./payments";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  productCategories,
  updateProduct,
} from "./products";
import { login, logout, register, requireSession, resolveSession, SESSION_COOKIE } from "./auth";
import {
  CUSTOMER_COOKIE,
  forgotPassword,
  listCustomersWithCrm,
  loginCustomer,
  logoutCustomer,
  publicCustomer,
  registerCustomer,
  requireCustomer,
  resetPassword,
  resolveCustomer,
  verifySignup,
} from "./customers";
import { accountFromCustomer, getAccount, loginAccount, logoutAccount } from "./account";
import { createWarehouse, deleteWarehouse, listWarehouses, updateWarehouse } from "./warehouses";
import { listInventory, setStock, productHistory } from "./inventory";
import { createVendor, deleteVendor, listVendors, updateVendor } from "./vendors";
import { createPurchase, deletePurchase, getPurchase, listPurchases, payPurchase, payVendor, receivePurchase, sendPurchase, updatePurchase } from "./purchases";
import { accountingSummary } from "./accounting";
import { getSettings, getStoreRow, storeSummary, updateStore, type StoreRow } from "./stores";
import { listDeliveryProviders, type DeliveryAddress } from "./delivery";

type Req = Request & { params: Record<string, string> };
type Handler = (req: Req) => Response | Promise<Response>;

function route(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

async function publicStore(req: Request): Promise<{ store: StoreRow; settings: ReturnType<typeof getSettings> }> {
  const slug = new URL(req.url).searchParams.get("store");
  const rows = slug
    ? await db`SELECT * FROM stores WHERE slug = ${slug} LIMIT 1`
    : await db`SELECT * FROM stores ORDER BY created_at ASC LIMIT 1`;
  const store = rows[0] as StoreRow | undefined;
  if (!store) throw notFound("No store is configured yet.");
  return { store, settings: getSettings(store) };
}

async function adminStore(req: Request): Promise<StoreRow> {
  const user = await requireSession(req);
  return getStoreRow(user.storeId);
}

function initialsSvg(seed: string): string {
  let h = 0;
  for (const char of seed) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  const tint = 205 + (h % 25); // subtle slate variation, no rainbow hues
  const label = seed.replace(/[-_]+/g, " ").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(210 20% ${tint}%)"/>
    <stop offset="100%" stop-color="hsl(210 18% ${tint - 12}%)"/>
  </linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="470" cy="130" r="150" fill="rgba(255,255,255,0.35)"/>
  <circle cx="120" cy="500" r="190" fill="rgba(255,255,255,0.28)"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="200" font-weight="700" fill="rgba(51,65,85,0.55)">${label || "BS"}</text>
</svg>`;
}

function verifyWebhook(rawBody: string, signature: string | null): boolean {
  if (!env.deliveryWebhookSecret) return true;
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", env.deliveryWebhookSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function apiRoutes(): Record<string, unknown> {
  return {
    "/api/health": {
      GET: route(async () => {
        await db`SELECT 1`;
        return json({ status: "ok", delivery: env.deliveryProvider, time: new Date().toISOString() });
      }),
    },

    "/api/map-config": {
      GET: route(async () => json(mapConfig())),
    },

    "/api/geo/search": {
      GET: route(async (req) => {
        const query = new URL(req.url).searchParams.get("q") ?? "";
        return json(await searchPlaces(query));
      }),
    },

    "/api/geo/reverse": {
      GET: route(async (req) => {
        const params = new URL(req.url).searchParams;
        const place = await reverseGeocode(Number(params.get("lat")), Number(params.get("lng")));
        if (!place) throw notFound("No address found for that location.");
        return json(place);
      }),
    },

    "/api/geo/route": {
      GET: route(async (req) => {
        const params = new URL(req.url).searchParams;
        const parse = (value: string | null) => {
          const [lat, lng] = (value ?? "").split(",").map(Number);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest("VALIDATION_ERROR", "Expected coordinates as lat,lng.");
          return { latitude: lat as number, longitude: lng as number };
        };
        return json(await computeRoute(parse(params.get("from")), parse(params.get("to"))));
      }),
    },

    "/api/placeholder/:seed": route(async (req) => {
      const seed = str(req.params.seed, "boost");
      const params = new URL(req.url).searchParams;
      const size = Math.min(1024, Math.max(64, Number(params.get("size")) || 640));
      const prompt = params.get("prompt") || `${seed.replace(/[-_]+/g, " ")} product photo, studio lighting, plain background, high detail`;
      const image = await productImage(seed, prompt, size);
      if (image) {
        return new Response(image.body, { headers: { "Content-Type": image.type, "Cache-Control": "public, max-age=604800" } });
      }
      return new Response(initialsSvg(seed), {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
      });
    }),

    // --- public storefront ---

    "/api/store": {
      GET: route(async (req) => {
        const { store, settings } = await publicStore(req);
        return json(storeSummary(store, settings));
      }),
    },

    "/api/products": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        const url = new URL(req.url);
        const products = await listProducts(store.id, {
          status: "active",
          category: url.searchParams.get("category") ?? undefined,
          search: url.searchParams.get("search") ?? undefined,
          featured: url.searchParams.get("featured") === "true" ? true : undefined,
        });
        return json(products);
      }),
    },

    "/api/categories": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        return json(await productCategories(store.id));
      }),
    },

    "/api/products/:id": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        const product = await getProduct(store.id, req.params.id);
        if (!product || product.status !== "active") throw notFound("Product not found.");
        return json(product);
      }),
    },

    "/api/mashup": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        const url = new URL(req.url);
        const themeParam = url.searchParams.get("theme") as MashupTheme | null;
        const limit = Number(url.searchParams.get("limit") ?? 8);
        const products = await listProducts(store.id, { status: "active" });
        const popularity = await productPopularity(store.id);
        return json(buildMashup(products, popularity, { theme: themeParam ?? undefined, limit, seed: daySeed() }));
      }),
    },

    "/api/payment-methods": {
      GET: route(async (req) => {
        const { settings } = await publicStore(req);
        const methods = listGateways()
          .map((gateway) => {
            const config = settings.payments[gateway.key] ?? {};
            const enabled = config.enabled === undefined ? gateway.key === "mock" : Boolean(config.enabled);
            const descriptor = gateway.descriptor();
            return {
              key: gateway.key,
              label: gateway.label,
              description: descriptor.description,
              requiresCredentials: descriptor.requiresCredentials,
              supportsPlaceholder: descriptor.supportsPlaceholder,
              enabled,
              configured: gateway.isConfigured(config),
            };
          })
          .filter((method) => method.enabled);
        return json(methods);
      }),
    },

    "/api/delivery/quote": {
      POST: route(async (req) => {
        const { settings } = await publicStore(req);
        const body = await readJson(req);
        const dropoff = body.dropoff as DeliveryAddress | undefined;
        if (!dropoff || !Array.isArray(dropoff.street_address) || dropoff.street_address.length === 0) {
          throw notFound("A drop-off address is required.");
        }
        return json(await quoteDelivery(settings, { dropoff }));
      }),
    },

    // --- checkout + orders ---

    "/api/orders": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        const customer = await resolveCustomer(req);
        if (customer) {
          const orders = await listOrdersByCustomer(store.id, customer.id);
          return json(await Promise.all(orders.map(hydrateOrder)));
        }
        const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
        if (!email) throw badRequest("VALIDATION_ERROR", "Sign in or provide an email to list your orders.");
        const orders = await listOrdersByEmail(store.id, email);
        return json(await Promise.all(orders.map(hydrateOrder)));
      }),
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const body = await readJson(req);
        return json(await createOrder(store, body), 201);
      }),
    },

    "/api/orders/:id": {
      GET: route(async (req) => {
        const { store } = await publicStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        return json(await hydrateOrder(order));
      }),
    },

    "/api/orders/:id/pay": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        const body = await readJson(req);
        return json(await payOrder(order, store, body));
      }),
    },

    "/api/orders/:id/confirm": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        return json(await confirmReceipt(order.id));
      }),
    },

    "/api/orders/:id/simulate-callback": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        return json(await simulateCallback(order.id));
      }),
    },

    "/api/payments/mpesa/callback": {
      POST: route(async (req) => {
        const body = await req.json().catch(() => ({}));
        await applyGatewayCallback("mpesa", body);
        return json({ ResultCode: 0, ResultDesc: "Success" });
      }),
    },

    "/api/delivery/webhook": {
      POST: route(async (req) => {
        const raw = await req.text();
        const signature = req.headers.get("x-uber-signature");
        if (!verifyWebhook(raw, signature)) {
          return Response.json({ success: false, error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." } }, { status: 401 });
        }
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(raw);
        } catch {
          body = {};
        }
        const result = await applyDeliveryEvent(body);
        return json(result);
      }),
    },

    // --- auth ---

    "/api/auth/register": {
      POST: route(async (req) => {
        if (!env.allowMerchantSignup) {
          throw new ApiError(403, "SIGNUP_DISABLED", "Admin accounts are provisioned by the operator.");
        }
        const { user, token } = await register(await readJson(req));
        return Response.json({ success: true, data: user }, { status: 201, headers: { "Set-Cookie": cookieHeader(SESSION_COOKIE, token) } });
      }),
    },

    "/api/auth/login": {
      POST: route(async (req) => {
        const { user, token } = await login(await readJson(req));
        return Response.json({ success: true, data: user }, { headers: { "Set-Cookie": cookieHeader(SESSION_COOKIE, token) } });
      }),
    },

    "/api/auth/logout": {
      POST: route(async (req) => {
        await logout(parseCookies(req)[SESSION_COOKIE]);
        return Response.json({ success: true, data: null }, { headers: { "Set-Cookie": clearCookieHeader(SESSION_COOKIE) } });
      }),
    },

    "/api/auth/me": {
      GET: route(async (req) => {
        const user = await resolveSession(req);
        return json(user);
      }),
    },

    "/api/terms": {
      GET: route(async (req) => {
        const { store, settings } = await publicStore(req);
        return json({ store: store.name, terms: settings.terms });
      }),
    },

    // --- customer accounts (email + phone, OTP verified) ---

    "/api/customer/register": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        return json(await registerCustomer(store, await readJson(req)), 201);
      }),
    },

    "/api/customer/verify": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { user, token } = await verifySignup(store, await readJson(req));
        return Response.json({ success: true, data: user }, { headers: { "Set-Cookie": cookieHeader(CUSTOMER_COOKIE, token) } });
      }),
    },

    "/api/customer/login": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { user, token } = await loginCustomer(store, await readJson(req));
        return Response.json({ success: true, data: user }, { headers: { "Set-Cookie": cookieHeader(CUSTOMER_COOKIE, token) } });
      }),
    },

    "/api/customer/logout": {
      POST: route(async (req) => {
        await logoutCustomer(parseCookies(req)[CUSTOMER_COOKIE]);
        return Response.json({ success: true, data: null }, { headers: { "Set-Cookie": clearCookieHeader(CUSTOMER_COOKIE) } });
      }),
    },

    "/api/customer/me": {
      GET: route(async (req) => {
        const customer = await resolveCustomer(req);
        return json(customer ? publicCustomer(customer) : null);
      }),
    },

    "/api/customer/forgot": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        return json(await forgotPassword(store, await readJson(req)));
      }),
    },

    "/api/customer/reset": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { user, token } = await resetPassword(store, await readJson(req));
        return Response.json({ success: true, data: user }, { headers: { "Set-Cookie": cookieHeader(CUSTOMER_COOKIE, token) } });
      }),
    },

    // --- unified accounts (admin + shopper share one login/logout) ---

    "/api/account/login": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { account, cookie, token } = await loginAccount(store, await readJson(req));
        return Response.json({ success: true, data: account }, { headers: { "Set-Cookie": cookieHeader(cookie, token) } });
      }),
    },

    "/api/account/register": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        return json(await registerCustomer(store, await readJson(req)), 201);
      }),
    },

    "/api/account/verify": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { user, token } = await verifySignup(store, await readJson(req));
        return Response.json({ success: true, data: accountFromCustomer(user) }, { headers: { "Set-Cookie": cookieHeader(CUSTOMER_COOKIE, token) } });
      }),
    },

    "/api/account/logout": {
      POST: route(async (req) => {
        await logoutAccount(req);
        const headers = new Headers();
        headers.append("Set-Cookie", clearCookieHeader(SESSION_COOKIE));
        headers.append("Set-Cookie", clearCookieHeader(CUSTOMER_COOKIE));
        return Response.json({ success: true, data: null }, { headers });
      }),
    },

    "/api/account/me": {
      GET: route(async (req) => json(await getAccount(req))),
    },

    "/api/account/forgot": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        return json(await forgotPassword(store, await readJson(req)));
      }),
    },

    "/api/account/reset": {
      POST: route(async (req) => {
        const { store } = await publicStore(req);
        const { user, token } = await resetPassword(store, await readJson(req));
        return Response.json({ success: true, data: accountFromCustomer(user) }, { headers: { "Set-Cookie": cookieHeader(CUSTOMER_COOKIE, token) } });
      }),
    },

    // --- admin ---

    "/api/admin/products": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listProducts(store.id));
      }),
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await createProduct(store.id, await readJson(req)), 201);
      }),
    },

    "/api/admin/products/:id": {
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        return json(await updateProduct(store.id, req.params.id, await readJson(req)));
      }),
      DELETE: route(async (req) => {
        const store = await adminStore(req);
        await deleteProduct(store.id, req.params.id);
        return json({ deleted: true });
      }),
    },

    "/api/admin/orders": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        const status = new URL(req.url).searchParams.get("status") ?? undefined;
        const orders = await listOrders(store.id, status);
        return json(await Promise.all(orders.map(hydrateOrder)));
      }),
    },

    "/api/admin/orders/:id": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        return json(await hydrateOrder(order));
      }),
    },

    "/api/admin/orders/:id/status": {
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        const body = await readJson(req);
        const status = requireString(body.status, "status");
        await updateOrderStatus(order.id, status, typeof body.message === "string" ? body.message : undefined);
        return json(await hydrateOrder((await getOrderRow(order.id))!));
      }),
    },

    "/api/admin/orders/:id/book-delivery": {
      POST: route(async (req) => {
        const store = await adminStore(req);
        const order = await getOrderById(store.id, req.params.id);
        if (!order) throw notFound("Order not found.");
        if (order.delivery_id) return json(await hydrateOrder(order));
        const updated = await bookDelivery(order, store);
        return json(await hydrateOrder(updated));
      }),
    },

    "/api/admin/stats": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await orderStats(store.id));
      }),
    },

    "/api/admin/customers": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listCustomersWithCrm(store.id));
      }),
    },

    "/api/admin/warehouses": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listWarehouses(store.id));
      }),
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await createWarehouse(store.id, await readJson(req)), 201);
      }),
    },

    "/api/admin/warehouses/:id": {
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        return json(await updateWarehouse(store.id, req.params.id, await readJson(req)));
      }),
      DELETE: route(async (req) => {
        const store = await adminStore(req);
        await deleteWarehouse(store.id, req.params.id);
        return json({ deleted: true });
      }),
    },

    "/api/admin/inventory": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listInventory(store.id));
      }),
    },

    "/api/admin/inventory/:productId": {
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        const body = await readJson(req);
        const warehouseId = requireString(body.warehouseId, "warehouseId");
        await setStock(store.id, req.params.productId, warehouseId, Number(body.quantity ?? 0), Number(body.reorderLevel ?? 0));
        return json(await listInventory(store.id));
      }),
    },

    "/api/admin/inventory/:productId/history": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        const history = await productHistory(store.id, req.params.productId);
        if (!history) throw notFound("Product not found.");
        return json(history);
      }),
    },

    "/api/admin/vendors": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listVendors(store.id));
      }),
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await createVendor(store.id, await readJson(req)), 201);
      }),
    },

    "/api/admin/vendors/:id": {
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        return json(await updateVendor(store.id, req.params.id, await readJson(req)));
      }),
      DELETE: route(async (req) => {
        const store = await adminStore(req);
        await deleteVendor(store.id, req.params.id);
        return json({ deleted: true });
      }),
    },

    "/api/admin/vendors/:id/pay": {
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await payVendor(store.id, req.params.id, await readJson(req)));
      }),
    },

    "/api/admin/purchases": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await listPurchases(store.id));
      }),
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await createPurchase(store.id, await readJson(req)), 201);
      }),
    },

    "/api/admin/purchases/:id": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await getPurchase(store.id, req.params.id));
      }),
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        return json(await updatePurchase(store.id, req.params.id, await readJson(req)));
      }),
      DELETE: route(async (req) => {
        const store = await adminStore(req);
        await deletePurchase(store.id, req.params.id);
        return json({ deleted: true });
      }),
    },

    "/api/admin/purchases/:id/send": {
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await sendPurchase(store, req.params.id));
      }),
    },

    "/api/admin/purchases/:id/receive": {
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await receivePurchase(store.id, req.params.id));
      }),
    },

    "/api/admin/purchases/:id/pay": {
      POST: route(async (req) => {
        const store = await adminStore(req);
        return json(await payPurchase(store.id, req.params.id, await readJson(req)));
      }),
    },

    "/api/admin/accounting": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(await accountingSummary(store.id, store.currency));
      }),
    },

    "/api/admin/payments/gateways": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        const settings = getSettings(store);
        return json(listGateways().map((gateway) => gatewayView(gateway, settings.payments[gateway.key] ?? {})));
      }),
    },

    "/api/admin/payments/gateways/:key": {
      PUT: route(async (req) => {
        const store = await adminStore(req);
        const key = req.params.key;
        const gateway = getGateway(key);
        if (!gateway) throw notFound("Unknown gateway.");
        const body = await readJson(req);
        const patch: Record<string, unknown> = { ...(body.config as object ?? {}) };
        if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
        await updateStore(store.id, { payments: { [key]: patch } });
        return json(gatewayView(gateway, getSettings(await getStoreRow(store.id)).payments[key] ?? {}));
      }),
    },

    "/api/admin/settings": {
      GET: route(async (req) => {
        const store = await adminStore(req);
        return json(storeSummary(store, getSettings(store)));
      }),
      PATCH: route(async (req) => {
        const store = await adminStore(req);
        const body = await readJson(req);
        const { store: updated, settings } = await updateStore(store.id, body);
        return json(storeSummary(updated, settings));
      }),
    },

    "/api/admin/delivery/providers": {
      GET: route(async (req) => {
        await adminStore(req);
        return json([{ key: "boost-carrier", label: "Boost (Uber Direct)" }, { key: "simulated", label: "Simulated courier" }]);
      }),
    },
  };
}

export { MASHUP_THEMES };

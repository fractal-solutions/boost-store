# Boost Store

A Shopify-style storefront + admin, built entirely on [Bun](https://bun.com) and React (shadcn/ui + Tailwind), that uses **[boost-carrier](../boost-carrier)** as its delivery service (Uber Direct under the hood) and ships **plug-and-play payments** including Safaricom **M-PESA (Daraja)**.

- **Storefront** — mobile-first hero with a product-mashup algorithm, catalogue, product sheets, cart.
- **Checkout** — a 3-step flow (details → delivery → payment) with address search, a real map to drop a pin, a real routed distance/time and a delivery quote from boost-carrier **before** the order is confirmed. Supports **pay before delivery** and **pay on delivery**.
- **Live delivery map** — real map tiles (Leaflet) with turn-by-turn routing, courier location, breadcrumb path, pickup/drop-off and status, updated from Uber webhooks.
- **Admin** — dashboard, products, orders, payments, delivery settings, store settings.
- **Backend** — `Bun.serve` route map, **Bun.SQL** (SQLite), cookie sessions, server-authoritative pricing/stock.

> The store talks to **boost-carrier**, not Uber directly. boost-carrier is plug-and-play: point it at the `uber-delivery-mock-api` locally or at real Uber in production — no store changes required.

---

## Requirements

- [Bun](https://bun.com) ≥ 1.2.3
- For the full local stack: **Python 3.10+** and the sibling repos
  [`boost-carrier`](../boost-carrier) and [`uber-delivery-mock-api`](../uber-delivery-mock-api)

## Quick start (store only)

```sh
bun install
bun dev            # http://localhost:4000
```

With no other services running, delivery falls back to the built-in **simulated courier**, so you can shop, check out, pay with the mock gateway, and watch orders progress end-to-end.

Admin: open the app and click **Admin**, or sign in with the seeded demo account:

```
email:    demo@booststore.app
password: booststore
```

## Full local stack (real delivery flow)

Runs the mock Uber API, boost-carrier, and this store together — works on Windows, macOS and Linux:

```sh
bun run dev:stack
```

It expects this layout:

```
your-projects/
├── boost-store/
├── boost-carrier/
└── uber-delivery-mock-api/
```

What it starts:

| Service | URL | Role |
| --- | --- | --- |
| boost-store | http://localhost:4000 | this app |
| boost-carrier | http://localhost:5000 | Uber Direct proxy |
| uber-delivery-mock-api | http://localhost:3000 | mock Uber |

The script skips any service that is already running, streams each service's logs with a prefix, and shuts everything down on `Ctrl+C`. Override the Python interpreter with `PYTHON=...`.

The flow: **store → boost-carrier → mock Uber**, and back via **mock Uber → boost-carrier → `/api/delivery/webhook`**, which drives the order status and the live map.

> The bundled mock reports a fixed courier location that isn't tied to Kenya. The store therefore places the courier **along the real route** (derived from the delivery status) whenever the provider's coordinates fall outside the delivery area, so the map still animates realistically. With real Uber credentials you get real, live courier coordinates.

## Access from your phone (same Wi-Fi)

The store binds to `0.0.0.0:4000`, so it is reachable across your network. Only port **4000** needs to be open — the store talks to boost-carrier and the mock on the server side.

1. Find your computer's LAN IP (`ipconfig` on Windows, `ip addr` on Linux, `ipconfig getifaddr en0` on macOS). `dev:stack` already prints it under "On your phone".
2. Allow inbound TCP 4000 through the firewall:
   - **Windows:** `powershell -ExecutionPolicy Bypass -File scripts/allow-lan.ps1` (run as Administrator). Undo with `-Remove`.
   - **Linux (ufw):** `sudo ufw allow 4000/tcp`
   - **Linux (firewalld):** `sudo firewall-cmd --add-port=4000/tcp --permanent && sudo firewall-cmd --reload`
   - **macOS:** usually nothing to do.
3. On your phone, open `http://<your-lan-ip>:4000`.

HTTP is fine for the maps; camera/geolocation/service-worker features would need HTTPS. Not on the same Wi-Fi? Use a tunnel (e.g. `cloudflared tunnel --url http://localhost:4000`) or deploy it (see below).

## Delivery (boost-carrier / Uber Direct)

The delivery layer is a provider interface (`src/server/delivery.ts`):

- **`boost-carrier`** — calls the boost-carrier service for quotes, bookings and status.
- **`simulated`** — a local fake courier for offline development.

Configure it in **Admin → Delivery**: provider, boost-carrier base URL, Uber customer ID, delivery markup, and the map's pickup/drop-off coordinates.

Webhooks: set boost-carrier's `DELIVERY_WEBHOOK_FORWARD_URL` to `http://<store>/api/delivery/webhook`. The store verifies the forwarded signature (set the same value as boost-carrier's `UBER_WEBHOOK_SIGNING_KEY` in `DELIVERY_WEBHOOK_SECRET`) and maps Uber statuses onto the order lifecycle:

| Uber Direct | Order status |
| --- | --- |
| `pending` | dispatched |
| `pickup`, `pickup_complete` | in transit |
| `dropoff` | out for delivery |
| `delivered` | delivered |
| `canceled` / `returned` | cancelled |

## Payments

Two gateways, registered behind one interface (`src/server/payments.ts`):

| Gateway | Key | Credentials | Behaviour |
| --- | --- | --- | --- |
| Demo / Mock | `mock` | none | confirms instantly |
| M-PESA (Daraja) | `mpesa` | optional | STK Push; **placeholder mode** without credentials |

**Payment timing** is chosen per store (Admin → Settings) and per checkout:

- **Pay before delivery (prepay)** — the order is created unpaid; the courier is booked only after payment is confirmed.
- **Pay on delivery (COD)** — the courier is booked immediately and payment is collected on arrival (`paymentStatus: cod_pending`).

### M-PESA without credentials (toggleable)

M-PESA is **off by default**. Enable it in **Admin → Payments**. With no credentials it runs in **placeholder mode**: it records a pending STK push and you confirm it from the order screen ("Simulate M-PESA confirmation"), or via `POST /api/orders/:id/simulate-callback`. Add real Daraja credentials (`consumerKey`, `consumerSecret`, `shortcode`, `passkey`) and it performs a real STK push, with callbacks at `POST /api/payments/mpesa/callback`.

## Customer accounts (signup, OTP, terms)

Shoppers create an account with **name, email, phone, birthday, gender and password** (Account button in the header, or **Account** in the bottom nav). Birthday and gender are captured for CRM. Accounts are **verified with a 6-digit OTP** sent to email and WhatsApp.

Admins and shoppers use the **same sign-in / sign-out**: `POST /api/account/login` checks admin (merchant) credentials first, then shopper credentials, and `POST /api/account/logout` clears **both** sessions. The only difference is that admin accounts additionally see the bolt (admin panel).

The OTP delivery is delegated to an **n8n (or similar) webhook** — the same pattern as the QR Base Odoo module:

- Set the webhook URL in **Admin → Settings → Customer onboarding** (or `OTP_WEBHOOK_URL`). When set, the store `POST`s JSON:
  ```json
  { "event": "customer.otp_requested", "purpose": "signup", "otp_code": "123456", "email": "…", "phone": "…", "expires_in_minutes": 10, "store": { "id": "…", "name": "…" } }
  ```
  Your n8n workflow composes and sends the WhatsApp/email message.
- **No webhook configured → demo mode:** the code is shown directly on the OTP screen so onboarding still works offline.

Other flows: **sign in**, **forgot password** (email → OTP → new password), and **sign out**. Sessions are cookie-based (`bs_customer`) and separate from the merchant session.

**Terms & conditions** are stored per-store and shown at signup (with a required checkbox). Edit them in **Admin → Settings → Terms & conditions**; they're served publicly at `GET /api/terms`.

Signed-in customers get **order history on any device** (`GET /api/orders` uses the session); signed-out shoppers can look up orders by the email they used at checkout.

## Admin access

The admin panel (dashboard, orders, products, CRM, payments, delivery, settings) is **only reachable when the signed-in account is an admin**.

- Admins sign in through the **same account screen** as shoppers (`/api/account/login`); the difference is that admin accounts show the **bolt** (admin entry) in the storefront header — shoppers never see it. Signing out (`/api/account/logout`) clears both sessions.
- Every `/api/admin/*` route requires the admin session cookie (`bs_session`) and returns `401` otherwise. Shoppers use a **separate** cookie (`bs_customer`), so a shopper can never reach admin routes.
- Admin accounts are **provisioned, not self-served**: `POST /api/auth/register` returns `403` by default. Create one from the CLI:
  ```sh
  bun run create-admin -- --name "Jane" --email jane@example.com --password secret123 --store "Jane Store"
  ```
  (Set `ALLOW_MERCHANT_SIGNUP=true` to re-enable public admin registration.)
- Open the panel via the header **bolt** (admins only), or go straight to it with `?admin` (e.g. `http://localhost:4000/?admin`).

## Inventory & warehouses

**Admin → Inventory** manages stock across physical **warehouses**. Each warehouse carries:

- details — name, code, contact name / phone / email;
- a **pickup location** (street, city, country, coordinates) used as the courier's pickup for its products;
- **operating hours** — always-open, or specific days with open/close times (orders from a closed warehouse are rejected);
- an active flag.

Products have a **price** and a **cost**, so the Inventory view shows **margin** (retail value, value at cost, and total margin) in the summary tiles, per warehouse, per product row, and in each item's history. (A **one-time** migration backfills existing products with 60% of price on the first boot of this version; it's recorded in the database via `user_version` and **never runs again**, so later cost edits — including setting them to zero — are never overwritten.) The view is mobile-first (cards on phones, a table on larger screens); stock, reorder level, cost and warehouse are edited in each item's modal, and destructive actions raise a confirmation dialog.

The whole admin panel is responsive — the Dashboard stat tiles, the Orders list (cards on phones, table on desktop) and the tracking detail all adapt to small screens.

**Stock lifecycle** — placing an order **reserves** stock (on-hand → reserved); when the delivery is dispatched it becomes **in transit**; it is only fully deducted from the system once the order is **completed**. Cancelling an order returns stock to on-hand. Buckets are tracked per product in `inventory` (`quantity`, `reserved`, `in_transit`) with a `stock_movements` log.

Each item has a **History** view: units sold, revenue and order count, a 30-day units chart, the stock-movement log, and a **forecast** (average daily sales, days of cover, suggested reorder quantity, and a rising/steady/falling trend).

When a cart contains products from **more than one warehouse**, the order records `pickupStops` and a timeline note that the courier will make multiple pickups. The courier is still booked as a **single pickup** for now (the bundled mock Uber API has no multi-stop support) — the primary pickup is the warehouse holding the most items. The mock's limitations are the only reason multi-stop isn't wired end-to-end.

## Procurement (vendors & purchases)

**Admin → Purchases** covers buying stock from suppliers:

- **Vendors** — name, contact, phone, email, address, notes, active flag, with the amount **owed** to each.
- **Purchases** — pick a vendor, add line items (product, quantity, unit cost), and create the order. Each purchase card shows **lines · units** and can be **expanded to view the purchase lines** (item, qty, unit cost, line total). While a purchase **hasn't been received or paid**, you can **edit its lines** and **Send PO** to the vendor through the configured webhook (Admin → Settings → Purchase orders; POSTs `{ event, store, vendor, purchase, items }` to your n8n endpoint). Then:
  - **Receive into stock** — adds each line's quantity to inventory (on-hand) and logs a `purchase` stock movement.
  - **Pay vendor** — record a full or partial payment; the purchase becomes `paid` / `partial`, and the vendor's **owed** balance updates.
- **Paying is direct**: each outstanding purchase shows a prominent **Pay {amount}** button, and each vendor shows their balance with a **Pay** button that allocates a payment across that vendor's **oldest unpaid purchases** (with Full-balance / Half shortcuts).
- **Deleting is tiered**: an incomplete purchase deletes with a normal confirmation; a **received or paid** purchase requires typing `DELETE` to confirm (and a received purchase reverses its stock).

Supplier payments go through the same gateway list (`mock` records instantly; M-PESA payouts would use the B2C/disbursement API, which must be enabled on the account).

## Accounting dashboard

**Admin → Payments** opens with a visual **balance sheet and accounting dashboard** derived from sales and purchases:

- **Metrics** — sales (collected / outstanding), purchases (paid / owed), COGS, gross profit, gross margin %, and inventory at cost or retail.
- **Balance sheet** — a **composition bar** of Assets (cash / receivables / inventory) beside **Liabilities & equity** (payables / overdraft / equity), with per-line values. **Every line is clickable** to drill into its composition (cash = collections − vendor payments; receivables = the outstanding orders; inventory = units/value/margin; payables = the vendors owed; equity = Assets − Liabilities). Every component is **toggleable** (include/exclude cash, receivables, inventory, payables) and inventory can be valued **at cost or at retail**; choices are saved to the store.
  - **Negative cash is reclassified** as a **Bank overdraft** liability, so assets never go negative (a business can't hold negative cash — it's funded by an overdraft or owner's capital).
- **Sales & costs** — a bar chart (Sales / COGS / Gross profit) plus a collected-vs-outstanding progress bar. Each bar/row is clickable: **Sales** lists the orders, **COGS** lists the per-product cost breakdown, **Profit** shows the sales − COGS waterfall, **Collected** lists the payments received.
- **Purchases & payables** — a bar chart (Purchases / Paid / Owed) plus a paid-vs-owed progress bar, each clickable: **Purchases** lists the purchase orders, **Paid** lists the vendor payments, **Owed** lists the vendors outstanding.

The dashboard is laid out in stacked cards so it reads well on phones and desktops.

Gateways and delivery credentials are shown as **masked summaries** (partial redaction) — click **Configure** to open a modal that reveals/edits the fields. Secrets are stored server-side and returned masked; entering a value replaces it, leaving it blank keeps the current one.

## CRM

**Admin → CRM** lists every customer with their CRM fields and aggregates:

- name, email, phone, **gender**, **birthday** and derived **age**, verified status, sign-up date, last login;
- **orders**, **lifetime spend** and **last order** (joined from the orders table).

It has a search box, a gender filter, and summary tiles (total customers, new this month, customers with orders, lifetime spend). Data comes from `GET /api/admin/customers` (admin-only).

## Product mashup

The hero/landing uses a ranking + diversity algorithm (`src/server/mashup.ts`) exposed at `GET /api/mashup?theme=&limit=`:

1. **Score** every product from weighted signals — featured, discount depth, sales (real order counts), recency and rating — plus a deterministic per-day jitter so the hero rotates daily but is stable within a day.
2. **Diversify** with a greedy pick that caps how many items one category can contribute.
3. **Backfill** from the remaining ranked list if the cap left the shelf short.

Themes (`curated`, `deals`, `trending`, `fresh`) shift the weights so the hero feels different depending on the story.

## Maps, geocoding & routing

The store uses real maps and real routing, all proxied through the backend so providers are configurable and keys stay server-side (`src/server/geo.ts`):

| Concern | Endpoint | Default provider |
| --- | --- | --- |
| Map tiles | `GET /api/map-config` | CARTO basemaps (OSM data) |
| Address search | `GET /api/geo/search?q=` | Photon (key-less) |
| Reverse geocoding | `GET /api/geo/reverse?lat=&lng=` | Photon (key-less) |
| Routing | `GET /api/geo/route?from=lat,lng&to=lat,lng` | OSRM (key-less demo server) |

Swap any provider with the `GEOCODER_URL`, `ROUTER_URL` / `ROUTER_PROFILE`, and `MAP_TILE_URL` / `MAP_TILE_ATTRIBUTION` env vars.

**Checkout flow:** search or tap the map to set the drop-off → the server returns a routed distance/time and a boost-carrier quote → you review and confirm → the order is created and paid. The quote and coordinates are captured on the order, so the tracking screen can route between pickup and drop-off.

**Tracking UI** (`src/components/storefront/TrackOrder.tsx`, `src/components/map/MapView.tsx`) is a Leaflet map with:

- pickup, drop-off and a pulsing courier marker,
- the planned route (routed via OSRM) and the courier's breadcrumb path,
- a status/ETA pill, a horizontal progress stepper, a courier card with call/chat actions, and a timeline.

It polls the order every few seconds; the store persists courier coordinates and a ping history from each `event.courier_update` webhook.

## Product images

Product photos are served by `GET /api/placeholder/:seed` (used by `ProductImage`) — it proxies the configured image provider and caches results in memory:

- Default: **Lorem Picsum** (`https://picsum.photos/seed/{seed}/{w}/{h}`) — real, deterministic photos per product, no key.
- Point `PRODUCT_IMAGE_URL` at your own provider/AI endpoint (tokens `{seed}`, `{prompt}`, `{w}`, `{h}`).
- If it's disabled (`PRODUCT_IMAGE_ENABLED=false`) or the provider fails, a clean SVG placeholder is used.

## API overview

Public:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | service status |
| `GET` | `/api/store` | store profile + theme + settings |
| `GET` | `/api/products`, `/api/products/:id`, `/api/categories` | catalogue |
| `GET` | `/api/mashup` | hero mashup (`theme`, `limit`) |
| `GET` | `/api/payment-methods` | enabled checkout gateways |
| `POST` | `/api/delivery/quote` | delivery quote from the provider |
| `POST` | `/api/orders` | checkout (server-side totals + stock) |
| `GET` | `/api/orders/:id` | order + items + events + live delivery/map |
| `POST` | `/api/orders/:id/pay` | start a payment |
| `POST` | `/api/orders/:id/simulate-callback` | confirm a pending (placeholder) payment |
| `POST` | `/api/payments/mpesa/callback` | Daraja STK callback |
| `POST` | `/api/delivery/webhook` | Uber webhook forwarded by boost-carrier |
| `GET` | `/api/terms` | store terms & conditions |
| `POST` | `/api/account/login`, `/logout`, `/register`, `/verify`, `/forgot`, `/reset` | unified account (admin + shopper) |
| `GET` | `/api/account/me` | current account |
| `POST` | `/api/customer/register` | create account + send OTP |
| `POST` | `/api/customer/verify` | verify OTP (sets session) |
| `POST` | `/api/customer/login`, `/logout` | customer session |
| `GET` | `/api/customer/me` | current customer |
| `POST` | `/api/customer/forgot`, `/reset` | password reset via OTP |

Auth + admin:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/login`, `/logout` | sessions |
| `GET` | `/api/auth/me` | current merchant |
| `GET/POST/PATCH/DELETE` | `/api/admin/products` | product CRUD |
| `GET` | `/api/admin/orders`, `/api/admin/stats` | orders + dashboard |
| `GET` | `/api/admin/customers` | CRM customer directory |
| `GET/POST` | `/api/admin/warehouses` | warehouses |
| `PATCH/DELETE` | `/api/admin/warehouses/:id` | update / remove a warehouse |
| `GET` | `/api/admin/inventory` | stock levels per product |
| `PATCH` | `/api/admin/inventory/:productId` | set warehouse + stock + reorder |
| `GET` | `/api/admin/inventory/:productId/history` | item performance + forecast |
| `GET/POST` | `/api/admin/vendors` | vendors |
| `PATCH/DELETE` | `/api/admin/vendors/:id` | update / remove a vendor |
| `GET/POST` | `/api/admin/purchases` | purchases |
| `POST` | `/api/admin/purchases/:id/receive` | receive stock into inventory |
| `PATCH/DELETE` | `/api/admin/purchases/:id` | edit lines / delete a purchase |
| `POST` | `/api/admin/purchases/:id/send` | send the PO to the vendor webhook |
| `POST` | `/api/admin/purchases/:id/pay` | record a vendor payment |
| `POST` | `/api/admin/vendors/:id/pay` | pay a vendor (allocate across purchases) |
| `GET` | `/api/admin/accounting` | balance sheet + accounting metrics |
| `PATCH` | `/api/admin/orders/:id/status` | advance an order |
| `POST` | `/api/admin/orders/:id/book-delivery` | (re)book the courier |
| `GET/PUT` | `/api/admin/payments/gateways` | gateway config |
| `GET/PATCH` | `/api/admin/settings` | store + delivery settings |

## Configuration

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `APP_BASE_URL` | `http://localhost:4000` | builds payment callback URLs |
| `DELIVERY_PROVIDER` | `boost-carrier` | or `simulated` |
| `BOOST_CARRIER_URL` | `http://localhost:5000` | boost-carrier base URL |
| `BOOST_CARRIER_CUSTOMER_ID` | placeholder | Uber customer ID |
| `DELIVERY_WEBHOOK_SECRET` | — | verify forwarded webhooks |
| `MPESA_ENABLED` | `false` | toggle M-PESA |
| `MPESA_ENV` | `sandbox` | `sandbox` / `production` |
| `MPESA_CONSUMER_KEY` / `_SECRET` / `SHORTCODE` / `PASSKEY` | — | Daraja credentials |
| `PAYMENT_TIMING_DEFAULT` | `prepay` | `prepay` / `cod` |
| `OTP_WEBHOOK_URL` | — | n8n webhook for customer OTP (empty = demo code on screen) |
| `PURCHASE_WEBHOOK_URL` | — | n8n webhook that sends purchase orders to vendors |
| `GEOCODER_URL` | Photon | address search + reverse geocoding |
| `ROUTER_URL` / `ROUTER_PROFILE` | OSRM / `driving` | routing between pickup and drop-off |
| `MAP_TILE_URL` / `MAP_TILE_ATTRIBUTION` | CARTO | map tiles served to the browser |
| `PRODUCT_IMAGE_URL` / `PRODUCT_IMAGE_ENABLED` | Picsum / `true` | product image provider |
| `ALLOW_MERCHANT_SIGNUP` | `false` | allow public admin registration |
| `DEMO_PICKUP_LAT/LNG`, `DEMO_DROPOFF_LAT/LNG` | Nairobi | demo map coordinates |

## Testing

```sh
bun test
```

Covers the mashup algorithm, Uber status mapping, M-PESA phone normalisation, and order status transitions.

## Project structure

```
src/
  index.ts                 # Bun.serve bootstrap (API routes + SPA)
  frontend.tsx  App.tsx    # React entry + store/admin switch
  components/
    storefront/            # Storefront, Checkout, TrackOrder
    map/                   # MapView (Leaflet), AddressSearch
    admin/                 # Admin console
    ui/                    # shadcn/ui primitives
  server/
    db.ts schema.ts seed.ts defaults.ts env.ts lib.ts
    auth.ts stores.ts products.ts orders.ts mashup.ts
    delivery.ts payments.ts mpesa.ts geo.ts routes.ts
  lib/                     # client api + formatting helpers
scripts/
  dev-stack.ts             # cross-platform local stack
  start-prod.ts            # cross-platform production starter
  allow-lan.ps1            # Windows firewall helper for LAN/phone access
```

## From dev:stack to production

`dev:stack` is for local development: it runs the **mock** Uber API, boost-carrier with **test credentials**, and this store with the simulated payment flow. To go live:

**1. Delivery (real Uber Direct).** Deploy boost-carrier with your approved Uber credentials and point it at production:
- `UBER_API_BASE_URL=https://api.uber.com` (only once Uber approves your app)
- real `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `UBER_CUSTOMER_ID`
- `UBER_WEBHOOK_SIGNING_KEY` from the webhook you create in the Uber Direct dashboard
- `DELIVERY_WEBHOOK_FORWARD_URL=https://<your-store>/api/delivery/webhook`

Then point the store at it (Admin → Delivery, or `.env`): `DELIVERY_PROVIDER=boost-carrier`, `BOOST_CARRIER_URL=https://<your-carrier>`, `BOOST_CARRIER_CUSTOMER_ID=<id>`, and `DELIVERY_WEBHOOK_SECRET=<same signing key>`.

**2. Payments (real M-PESA).** In `.env` (or Admin → Payments): `MPESA_ENABLED=true`, `MPESA_ENV=production`, and the Daraja `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` / `MPESA_SHORTCODE` / `MPESA_PASSKEY`. Set `APP_BASE_URL` to your public HTTPS origin so M-PESA callbacks reach `/api/payments/mpesa/callback`. Turn the `mock` gateway off for real orders.

**3. Run it.** From the project root:

```sh
bun install
bun run start        # production mode, binds 0.0.0.0:$PORT
```

In production mode Bun disables HMR and caches/minifies the frontend bundle in memory. Put it behind a reverse proxy that terminates TLS (Caddy, nginx, or a PaaS) so `https://your-store` → `http://127.0.0.1:4000`, and keep it alive with a process manager (systemd, pm2, Docker).

> Do **not** run `bunx serve dist`. `bun run build` produces a **static frontend only** (no API), so serving that folder gives you a store that can't reach its own backend. The app *is* the Bun server — that's what you run.

**4. Data.** The SQLite database lives in `BOOST_STORE_DATA_DIR` (default `./data`). Mount it on a volume and back it up; it holds stores, products, orders and payments.

**5. Go-live checklist.**
- Change the demo admin credentials (`DEMO_MERCHANT_EMAIL` / `DEMO_MERCHANT_PASSWORD`) and keep secrets out of git.
- HTTPS everywhere; `/api/delivery/webhook` reachable by boost-carrier.
- Real Uber webhook created and subscribed to delivery-status + courier-update events.
- M-PESA callback reachable and verified with a real STK push.
- Restrict the admin surface (auth is session-based; harden as needed).

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| dev | `bun dev` | hot-reload dev server |
| start | `bun run start` | production server (cross-platform) |
| build | `bun run build` | static frontend export to `dist/` (no API) |
| dev:stack | `bun run dev:stack` | mock Uber + boost-carrier + store |
| create-admin | `bun run create-admin -- --name … --email … --password …` | provision an admin account |
| db:reset | `bun run db:reset` | delete + reseed the SQLite database |
| test | `bun test` | run tests |
| allow-lan | `scripts/allow-lan.ps1` | Windows firewall rule so your phone can reach `:4000` |

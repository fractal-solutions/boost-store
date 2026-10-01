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

Auth + admin:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/login`, `/logout` | sessions |
| `GET` | `/api/auth/me` | current merchant |
| `GET/POST/PATCH/DELETE` | `/api/admin/products` | product CRUD |
| `GET` | `/api/admin/orders`, `/api/admin/stats` | orders + dashboard |
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
| `GEOCODER_URL` | Photon | address search + reverse geocoding |
| `ROUTER_URL` / `ROUTER_PROFILE` | OSRM / `driving` | routing between pickup and drop-off |
| `MAP_TILE_URL` / `MAP_TILE_ATTRIBUTION` | CARTO | map tiles served to the browser |
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
| db:reset | `bun run db:reset` | delete + reseed the SQLite database |
| test | `bun test` | run tests |
| allow-lan | `scripts/allow-lan.ps1` | Windows firewall rule so your phone can reach `:4000` |

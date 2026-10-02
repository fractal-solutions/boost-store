import { serve } from "bun";
import index from "./index.html";
import { env } from "./server/env";
import { releaseExpiredReservations } from "./server/orders";
import { apiRoutes } from "./server/routes";

// API routes are matched first; everything else falls through to the SPA.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routes: any = {
  ...apiRoutes(),
  "/*": index,
};

const server = serve({
  port: env.port,
  // Bind all interfaces so the store is reachable from your phone on the same
  // network (override with HOST=...).
  hostname: process.env.HOST || "0.0.0.0",
  routes,
  development:
    process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
});

console.log(`Boost Store listening on http://0.0.0.0:${env.port} (this computer: http://localhost:${env.port})`);

// Release stock held by unpaid reservations past their TTL.
const sweep = setInterval(() => {
  releaseExpiredReservations().catch((error) => console.error("reservation sweep failed", error));
}, 60_000);
(sweep as { unref?: () => void }).unref?.();

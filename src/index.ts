import { serve } from "bun";
import index from "./index.html";
import { env } from "./server/env";
import { apiRoutes } from "./server/routes";

// API routes are matched first; everything else falls through to the SPA.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routes: any = {
  ...apiRoutes(),
  "/*": index,
};

const server = serve({
  port: env.port,
  routes,
  development:
    process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
});

console.log(`Boost Store running at ${server.url}`);

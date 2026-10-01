// Cross-platform production starter.
// `NODE_ENV=production bun src/index.ts` is POSIX-only, so set it in-process
// and then load the server.
process.env.NODE_ENV = "production";
await import("../src/index.ts");

// Provision an admin (merchant) account + its store.
//
//   bun run create-admin -- --name "Jane" --email jane@example.com --password secret123 --store "Jane Store"
//
// The `store` argument is optional (defaults to "<name>'s Store").
import { register } from "../src/server/auth";

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const name = arg("name");
const email = arg("email");
const password = arg("password");
const storeName = arg("store");

if (!name || !email || !password) {
  console.error('Usage: bun run create-admin -- --name "Jane" --email jane@example.com --password secret123 [--store "Jane Store"]');
  process.exit(1);
}

try {
  const { user } = await register({ name, email, password, storeName });
  console.log(`Created admin ${user.email} (store: ${user.storeName} / ${user.storeSlug}).`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

import { rmSync } from "node:fs";
import { env } from "./env";

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${env.dbFile}${suffix}`, { force: true });
}
console.log(`Removed ${env.dbFile}. It will be recreated and seeded on next start.`);

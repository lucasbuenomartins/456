import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { adminDb, closePools } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const candidates = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle")];
  const { existsSync } = await import("node:fs");
  const migrationsFolder = candidates.find((c) => existsSync(c));
  if (!migrationsFolder) throw new Error("Pasta de migrações não encontrada.");
  await migrate(adminDb, { migrationsFolder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log("Migrações aplicadas.");
      return closePools();
    })
    .catch(async (err) => {
      console.error(err);
      await closePools();
      process.exit(1);
    });
}

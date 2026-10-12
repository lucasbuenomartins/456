import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Recria o banco de ponta a ponta com os dados de demonstração antes da bateria. */
export default async function globalSetup() {
  const adminUrl = "postgres://clinica_owner:clinica_owner_dev@localhost:5432/clinica_e2e";
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  // Encerra conexões abertas pelo servidor de testes para recriar o esquema com segurança.
  await client.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public; create extension if not exists pg_trgm;");
  await client.end();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const env = {
    ...process.env,
    DATABASE_URL: "postgres://clinica_app:clinica_app_dev@localhost:5432/clinica_e2e",
    DATABASE_ADMIN_URL: adminUrl,
  };
  execSync("pnpm --filter @clinica/api exec tsx src/db/migrate.ts", { cwd: root, env, stdio: "inherit" });
  execSync("pnpm --filter @clinica/api exec tsx src/db/seed.ts", { cwd: root, env, stdio: "inherit" });
}

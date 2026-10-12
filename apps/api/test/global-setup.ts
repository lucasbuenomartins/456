import pg from "pg";

/** Recria o banco de testes do zero: esquema, migrações e dados de demonstração. */
export default async function setup() {
  process.env.VITEST = "true";
  const url = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://clinica_owner:clinica_owner_dev@localhost:5432/clinica_test";
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public; create extension if not exists pg_trgm;");
  await client.end();
  const { runMigrations } = await import("../src/db/migrate");
  const { seed } = await import("../src/db/seed");
  const { closePools } = await import("../src/db/client");
  await runMigrations();
  await seed();
  await closePools();
}

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? "postgres://clinica_owner:clinica_owner_dev@localhost:5432/clinica",
  },
});

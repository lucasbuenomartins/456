import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/db/migrate.ts", "src/db/seed.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  splitting: false,
  // O pacote compartilhado é código-fonte TypeScript: entra no bundle.
  noExternal: ["@clinica/shared"],
});

import { buildApp } from "./app";
import { config } from "./config";
import { closePools } from "./db/client";

const app = await buildApp({ logger: true });

const shutdown = async () => {
  await app.close();
  await closePools();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });

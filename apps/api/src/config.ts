const env = process.env;
const isTest = env.NODE_ENV === "test" || env.VITEST === "true";

function required(name: string, fallback?: string): string {
  const value = env[name] ?? fallback;
  if (!value) throw new Error(`Variável de ambiente ${name} não definida.`);
  return value;
}

export const config = {
  isTest,
  isProduction: env.NODE_ENV === "production",
  port: Number(env.PORT ?? 3333),
  databaseUrl: required(
    isTest ? "TEST_DATABASE_URL" : "DATABASE_URL",
    isTest ? "postgres://clinica_app:clinica_app_dev@localhost:5432/clinica_test" : undefined,
  ),
  databaseAdminUrl: required(
    isTest ? "TEST_DATABASE_ADMIN_URL" : "DATABASE_ADMIN_URL",
    isTest ? "postgres://clinica_owner:clinica_owner_dev@localhost:5432/clinica_test" : undefined,
  ),
  appOrigin: env.APP_ORIGIN ?? "http://localhost:5173",
  cookieSecure: env.COOKIE_SECURE === "true",
  sessionDays: 14,
  platformSessionHours: 12,
  inviteDays: 7,
  /** Tentativas por minuto nas rotas de login e convite (por IP). */
  authRateLimit: Number(env.AUTH_RATE_LIMIT ?? (isTest ? 10_000 : 10)),
};

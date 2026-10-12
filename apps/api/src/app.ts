import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { MODULES, PERMISSION_MAP, canReadModule, canWriteModule, type ModuleKey, type PermissionKey } from "@clinica/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { config } from "./config";
import { can, loadClinicContext, type ClinicContext } from "./lib/access";
import { AppError, forbidden, unauthorized } from "./lib/errors";
import { loadPlatformContext, type PlatformContext } from "./modules/admin/platform-auth";
import { adminRoutes } from "./modules/admin/routes";
import { authRoutes, SESSION_COOKIE, loadBareSession, type BareSession } from "./modules/auth/routes";
import { clientRoutes } from "./modules/clients/routes";
import { meRoutes } from "./modules/me/routes";
import { newsRoutes } from "./modules/news/routes";
import { settingsRoutes } from "./modules/settings/routes";
import { tourRoutes } from "./modules/tours/routes";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Rota pública (sem sessão). Todas as outras rotas exigem autenticação. */
    public?: boolean;
    /** clinic (padrão) | platform (painel do SaaS) | session (logado, sem empresa escolhida) */
    realm?: "clinic" | "platform" | "session";
    permission?: PermissionKey;
    /** Módulo exigido. Se omitido, é o módulo da permissão. */
    module?: ModuleKey;
    /** Permite escrita mesmo com a conta em modo somente leitura (ex.: progresso de tours). */
    allowReadOnly?: boolean;
  }
  interface FastifyRequest {
    clinic?: ClinicContext;
    platform?: PlatformContext;
    bareSession?: BareSession;
  }
}

export function ctxOf(req: FastifyRequest): ClinicContext {
  if (!req.clinic) throw unauthorized();
  return req.clinic;
}

export function platformOf(req: FastifyRequest): PlatformContext {
  if (!req.platform) throw unauthorized();
  return req.platform;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger
      ? {
          // Não registrar corpo de requisições, cookies ou cabeçalhos de autenticação.
          redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
        }
      : false,
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, fields: error.fields, details: error.details },
      });
    }
    // Violação de unicidade em corrida (ex.: duas pessoas salvando o mesmo CPF ao mesmo tempo).
    const pgCode = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (pgCode === "23505") {
      return reply.status(409).send({
        error: { code: "duplicate", message: "Este registro já existe. Outra pessoa pode ter salvo ao mesmo tempo — recarregue a página." },
      });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.status(429).send({
        error: { code: "rate_limited", message: "Muitas tentativas. Aguarde um minuto e tente de novo." },
      });
    }
    if (status && status < 500) {
      return reply.status(status).send({ error: { code: "bad_request", message: "Requisição inválida." } });
    }
    req.log.error({ err: error }, "erro não tratado");
    return reply.status(500).send({
      error: { code: "internal", message: "Algo deu errado do nosso lado. Tente novamente; se persistir, fale com o suporte." },
    });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: "not_found", message: "Endereço não encontrado." } }),
  );

  // Proteção contra CSRF: requisições que alteram dados precisam vir da origem do app.
  app.addHook("onRequest", async (req) => {
    if (!WRITE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== config.appOrigin) {
      throw new AppError(403, "bad_origin", "Origem da requisição não permitida.");
    }
  });

  // Autenticação e autorização declarativas, negando por padrão.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    const cfg = req.routeOptions.config;
    if (cfg.public) return;

    const realm = cfg.realm ?? "clinic";
    if (realm === "platform") {
      const token = req.cookies["admin_session"];
      const ctx = token ? await loadPlatformContext(token) : null;
      if (!ctx) throw unauthorized();
      req.platform = ctx;
      return;
    }

    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw unauthorized();

    if (realm === "session") {
      const bare = await loadBareSession(token);
      if (!bare) throw unauthorized();
      req.bareSession = bare;
      return;
    }

    const ctx = await loadClinicContext(token);
    if (!ctx) {
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      throw unauthorized();
    }
    req.clinic = ctx;

    const isWrite = WRITE_METHODS.has(req.method);
    if (isWrite && ctx.tenantAccess !== "full" && !cfg.allowReadOnly) {
      throw new AppError(
        403,
        "tenant_read_only",
        "Sua conta está em modo somente leitura. Você pode consultar e exportar os dados. Fale com o responsável pela conta.",
      );
    }

    const module = cfg.module ?? (cfg.permission ? PERMISSION_MAP[cfg.permission]?.module : undefined);
    if (module) {
      const status = ctx.modules[module];
      if (!canReadModule(status)) {
        throw new AppError(403, "module_not_contracted", `O módulo "${MODULES[module].name}" não está contratado.`);
      }
      if (isWrite && !cfg.allowReadOnly && !canWriteModule(status)) {
        throw new AppError(
          403,
          "module_read_only",
          `O módulo "${MODULES[module].name}" está em modo somente leitura. É possível consultar e exportar.`,
        );
      }
    }

    if (cfg.permission && !can(ctx, cfg.permission)) throw forbidden();
  });

  app.get("/api/health", { config: { public: true } }, async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(clientRoutes);
  await app.register(settingsRoutes);
  await app.register(tourRoutes);
  await app.register(newsRoutes);
  await app.register(adminRoutes);

  return app;
}

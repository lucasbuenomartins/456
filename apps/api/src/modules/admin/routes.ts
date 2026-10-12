import {
  MODULES,
  MODULE_KEYS,
  MODULE_STATUS_LABEL,
  PERMISSIONS,
  READ_ONLY_GRACE_DAYS,
  SCREENS,
  TOURS,
  TOUR_MAP,
  canWriteModule,
  createTenantSchema,
  dependentsOf,
  loginSchema,
  newsSchema,
  planSchema,
  tenantModuleChangeSchema,
  tenantPlanChangeSchema,
  tenantStatusChangeSchema,
  type ModuleKey,
} from "@clinica/shared";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { platformOf } from "../../app";
import { config } from "../../config";
import { adminDb } from "../../db/client";
import * as s from "../../db/schema";
import { auditPlatform } from "../../lib/audit";
import { AppError, conflict, notFound } from "../../lib/errors";
import { burnPasswordCheck, hashToken, newToken, verifyPassword } from "../../lib/security";
import { parse } from "../../lib/validate";
import { provisionTenant, syncModulesWithPlan } from "./provisioning";

const ADMIN_COOKIE = "admin_session";
const platform = { realm: "platform" as const };
const days = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

const STATUS_LABEL: Record<string, string> = { trial: "Em teste", active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada" };

export async function adminRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------ Autenticação
  app.post("/api/admin/auth/login", { config: { public: true, rateLimit: { max: config.authRateLimit, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const [user] = await adminDb.select().from(s.platformUsers).where(eq(s.platformUsers.email, body.email));
    if (!user) await burnPasswordCheck(body.password);
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      throw new AppError(401, "invalid_credentials", "E-mail ou senha incorretos.");
    }
    const token = newToken();
    await adminDb.insert(s.platformSessions).values({
      tokenHash: hashToken(token),
      platformUserId: user.id,
      expiresAt: new Date(Date.now() + config.platformSessionHours * 3600 * 1000),
    });
    await adminDb.update(s.platformUsers).set({ lastLoginAt: new Date() }).where(eq(s.platformUsers.id, user.id));
    reply.setCookie(ADMIN_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
      maxAge: config.platformSessionHours * 3600,
    });
    return { ok: true };
  });

  app.post("/api/admin/auth/logout", { config: { public: true } }, async (req, reply) => {
    const token = req.cookies[ADMIN_COOKIE];
    if (token) await adminDb.delete(s.platformSessions).where(eq(s.platformSessions.tokenHash, hashToken(token)));
    reply.clearCookie(ADMIN_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/admin/me", { config: platform }, async (req) => ({ user: platformOf(req).user }));

  app.get("/api/admin/catalog", { config: platform }, async () => ({
    modules: MODULE_KEYS.map((k) => MODULES[k]),
    moduleStatusLabels: MODULE_STATUS_LABEL,
    permissions: PERMISSIONS,
    tours: TOURS.filter((t) => t.realm === "clinic"),
    screens: Object.entries(SCREENS)
      .filter(([k]) => !k.startsWith("admin."))
      .map(([id, v]) => ({ id, ...v })),
  }));

  // ------------------------------------------------------------------ Planos
  app.get("/api/admin/plans", { config: platform }, async () => {
    const plans = await adminDb.select().from(s.plans).orderBy(asc(s.plans.monthlyPriceCents));
    const counts = await adminDb.select({ planId: s.tenants.planId, n: count() }).from(s.tenants).groupBy(s.tenants.planId);
    return { items: plans.map((p) => ({ ...p, tenantsCount: counts.find((c) => c.planId === p.id)?.n ?? 0 })) };
  });

  app.post("/api/admin/plans", { config: platform }, async (req, reply) => {
    const body = parse(planSchema, req.body);
    const [exists] = await adminDb.select({ id: s.plans.id }).from(s.plans).where(eq(s.plans.code, body.code));
    if (exists) throw new AppError(422, "validation", "Confira os campos destacados.", { code: "Já existe um plano com este código." });
    const modules = [...new Set<ModuleKey>(["core", ...body.modules])];
    const [row] = await adminDb.insert(s.plans).values({ ...body, modules }).returning();
    await auditPlatform(adminDb, platformOf(req).user, null, { action: "plan.created", entityType: "plan", entityId: row!.id, summary: `Plano ${row!.name} criado.` });
    return reply.status(201).send(row);
  });

  app.put<{ Params: { id: string } }>("/api/admin/plans/:id", { config: platform }, async (req) => {
    const body = parse(planSchema, req.body);
    const modules = [...new Set<ModuleKey>(["core", ...body.modules])];
    // Alterar os módulos de um plano não muda empresas existentes automaticamente:
    // a mudança vale para novas contratações ou trocas de plano (evita perda de acesso inesperada).
    const [row] = await adminDb.update(s.plans).set({ ...body, modules, updatedAt: new Date() }).where(eq(s.plans.id, req.params.id)).returning();
    if (!row) throw notFound("Plano");
    await auditPlatform(adminDb, platformOf(req).user, null, { action: "plan.updated", entityType: "plan", entityId: row.id, summary: `Plano ${row.name} atualizado.` });
    return row;
  });

  // ------------------------------------------------------------------ Empresas
  app.get("/api/admin/tenants", { config: platform }, async (req) => {
    const q = (req.query as { q?: string; status?: string }) ?? {};
    const conds = [];
    if (q.status && STATUS_LABEL[q.status]) conds.push(eq(s.tenants.status, q.status));
    if (q.q) conds.push(sql`(${s.tenants.name} ilike ${"%" + q.q + "%"} or ${s.tenants.document} like ${"%" + q.q.replace(/\D/g, "") + "%"})`);
    const rows = await adminDb
      .select({
        id: s.tenants.id,
        name: s.tenants.name,
        document: s.tenants.document,
        status: s.tenants.status,
        trialEndsAt: s.tenants.trialEndsAt,
        createdAt: s.tenants.createdAt,
        planName: s.plans.name,
        members: sql<number>`(select count(*)::int from memberships m where m.tenant_id = ${s.tenants.id} and m.status = 'active')`,
        modules: sql<string[]>`(select coalesce(array_agg(tm.module order by tm.module), '{}') from tenant_modules tm where tm.tenant_id = ${s.tenants.id} and tm.status in ('active','trial'))`,
      })
      .from(s.tenants)
      .innerJoin(s.plans, eq(s.plans.id, s.tenants.planId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.tenants.createdAt))
      .limit(200);
    return { items: rows };
  });

  app.post("/api/admin/tenants", { config: platform }, async (req, reply) => {
    const body = parse(createTenantSchema, req.body);
    const actor = platformOf(req).user;
    const result = await adminDb.transaction(async (tx) => {
      const [plan] = await tx.select().from(s.plans).where(and(eq(s.plans.id, body.planId), eq(s.plans.isActive, true)));
      if (!plan) throw new AppError(422, "validation", "Confira os campos destacados.", { planId: "Plano inválido ou inativo." });
      const r = await provisionTenant(tx, { ...body, actorPlatformUserId: actor.id });
      await auditPlatform(tx, actor, r.tenant.id, {
        action: "tenant.created",
        entityType: "company",
        entityId: r.tenant.id,
        summary: `Empresa criada no plano ${plan.name}.`,
      });
      return r;
    });
    return reply.status(201).send({ id: result.tenant.id, ownerInviteUrl: result.ownerInviteUrl });
  });

  app.get<{ Params: { id: string } }>("/api/admin/tenants/:id", { config: platform }, async (req) => {
    const [tenant] = await adminDb.select().from(s.tenants).where(eq(s.tenants.id, req.params.id));
    if (!tenant) throw notFound("Empresa");
    const [plan] = await adminDb.select().from(s.plans).where(eq(s.plans.id, tenant.planId));
    const modules = await adminDb.select().from(s.tenantModules).where(eq(s.tenantModules.tenantId, tenant.id));
    const history = await adminDb
      .select({ h: s.tenantHistory, actor: s.platformUsers.name })
      .from(s.tenantHistory)
      .leftJoin(s.platformUsers, eq(s.platformUsers.id, s.tenantHistory.actorPlatformUserId))
      .where(eq(s.tenantHistory.tenantId, tenant.id))
      .orderBy(desc(s.tenantHistory.createdAt))
      .limit(50);
    const [members] = await adminDb.select({ n: count() }).from(s.memberships).where(and(eq(s.memberships.tenantId, tenant.id), eq(s.memberships.status, "active")));
    const [units] = await adminDb.select({ n: count() }).from(s.units).where(and(eq(s.units.tenantId, tenant.id), eq(s.units.isActive, true)));
    const [clients] = await adminDb.select({ n: count() }).from(s.clients).where(and(eq(s.clients.tenantId, tenant.id), eq(s.clients.status, "active")));
    const pendingOwnerInvite = await adminDb
      .select({ id: s.invites.id, email: s.invites.email, expiresAt: s.invites.expiresAt })
      .from(s.invites)
      .where(and(eq(s.invites.tenantId, tenant.id), eq(s.invites.isOwner, true), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)));
    return {
      tenant,
      plan,
      usage: { members: members?.n ?? 0, units: units?.n ?? 0, clients: clients?.n ?? 0 },
      modules: MODULE_KEYS.map((key) => {
        const row = modules.find((m) => m.module === key);
        return { key, name: MODULES[key].name, requires: MODULES[key].requires, availability: MODULES[key].availability, status: row?.status ?? "disabled", source: row?.source ?? null, readOnlyUntil: row?.readOnlyUntil ?? null };
      }),
      history: history.map(({ h, actor }) => ({ ...h, actorName: actor })),
      pendingOwnerInvite: pendingOwnerInvite[0] ?? null,
    };
  });

  app.post<{ Params: { id: string } }>("/api/admin/tenants/:id/status", { config: platform }, async (req) => {
    const body = parse(tenantStatusChangeSchema, req.body);
    const actor = platformOf(req).user;
    return adminDb.transaction(async (tx) => {
      const [tenant] = await tx.select().from(s.tenants).where(eq(s.tenants.id, req.params.id)).for("update");
      if (!tenant) throw notFound("Empresa");
      if (tenant.status === body.status) return { ok: true, changed: false };
      const patch: Partial<typeof s.tenants.$inferInsert> = { status: body.status, statusChangedAt: new Date(), updatedAt: new Date() };
      if (body.status === "cancelled") patch.dataAvailableUntil = days(READ_ONLY_GRACE_DAYS);
      if (body.status === "active") {
        patch.dataAvailableUntil = null;
        patch.trialEndsAt = null;
        // Ao ativar, módulos em teste passam a ativos.
        await tx.update(s.tenantModules).set({ status: "active", updatedAt: new Date() }).where(and(eq(s.tenantModules.tenantId, tenant.id), eq(s.tenantModules.status, "trial")));
      }
      await tx.update(s.tenants).set(patch).where(eq(s.tenants.id, tenant.id));
      await tx.insert(s.tenantHistory).values({ tenantId: tenant.id, kind: "status", fromValue: tenant.status, toValue: body.status, reason: body.reason, actorPlatformUserId: actor.id });
      await auditPlatform(tx, actor, tenant.id, {
        action: "tenant.status_changed",
        entityType: "company",
        entityId: tenant.id,
        summary: `Situação da conta alterada de ${STATUS_LABEL[tenant.status]} para ${STATUS_LABEL[body.status]}.`,
      });
      if (body.status !== "active") {
        // Encerra sessões abertas para que a nova situação valha imediatamente.
        await tx.delete(s.sessions).where(eq(s.sessions.tenantId, tenant.id));
      }
      return { ok: true, changed: true };
    });
  });

  app.post<{ Params: { id: string } }>("/api/admin/tenants/:id/plan", { config: platform }, async (req) => {
    const body = parse(tenantPlanChangeSchema, req.body);
    const actor = platformOf(req).user;
    return adminDb.transaction(async (tx) => {
      const [tenant] = await tx.select().from(s.tenants).where(eq(s.tenants.id, req.params.id)).for("update");
      if (!tenant) throw notFound("Empresa");
      const [from] = await tx.select().from(s.plans).where(eq(s.plans.id, tenant.planId));
      const [to] = await tx.select().from(s.plans).where(and(eq(s.plans.id, body.planId), eq(s.plans.isActive, true)));
      if (!to) throw new AppError(422, "validation", "Plano inválido ou inativo.", { planId: "Plano inválido." });
      if (to.id === tenant.planId) return { ok: true, changes: [] };
      await tx.update(s.tenants).set({ planId: to.id, updatedAt: new Date() }).where(eq(s.tenants.id, tenant.id));
      const changes = await syncModulesWithPlan(tx, tenant.id, to.modules as ModuleKey[]);
      await tx.insert(s.tenantHistory).values({ tenantId: tenant.id, kind: "plan", fromValue: from?.name ?? null, toValue: to.name, reason: body.reason, actorPlatformUserId: actor.id });
      for (const c of changes) {
        await tx.insert(s.tenantHistory).values({ tenantId: tenant.id, kind: "module", subject: c.module, fromValue: c.from, toValue: c.to, reason: `Mudança de plano para ${to.name}`, actorPlatformUserId: actor.id });
      }
      await auditPlatform(tx, actor, tenant.id, {
        action: "tenant.plan_changed",
        entityType: "company",
        entityId: tenant.id,
        summary: `Plano alterado de ${from?.name ?? "—"} para ${to.name}.`,
        changes: { modulos: changes },
      });
      return { ok: true, changes };
    });
  });

  app.put<{ Params: { id: string; module: string } }>("/api/admin/tenants/:id/modules/:module", { config: platform }, async (req) => {
    const body = parse(tenantModuleChangeSchema, req.body);
    const module = req.params.module as ModuleKey;
    if (!MODULE_KEYS.includes(module)) throw notFound("Módulo");
    if (module === "core") throw conflict("core_required", "O núcleo da plataforma não pode ser alterado.");
    const actor = platformOf(req).user;
    return adminDb.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.id, req.params.id)).for("update");
      if (!tenant) throw notFound("Empresa");
      const rows = await tx.select().from(s.tenantModules).where(eq(s.tenantModules.tenantId, tenant.id));
      const writable = rows.filter((r) => canWriteModule(r.status as never)).map((r) => r.module as ModuleKey);
      const current = rows.find((r) => r.module === module);

      if (canWriteModule(body.status)) {
        const missing = MODULES[module].requires.filter((r) => r !== "core" && !writable.includes(r));
        if (missing.length) {
          throw conflict("missing_dependency", `Para ativar ${MODULES[module].name}, ative antes: ${missing.map((m) => MODULES[m].name).join(", ")}.`);
        }
      } else {
        const dependents = dependentsOf(module, writable);
        if (dependents.length) {
          throw conflict("has_dependents", `Antes, desative os módulos que dependem deste: ${dependents.map((m) => MODULES[m].name).join(", ")}.`);
        }
      }

      const values = {
        status: body.status,
        source: current?.source ?? "addon",
        readOnlyUntil: body.status === "read_only" ? days(READ_ONLY_GRACE_DAYS) : null,
        updatedAt: new Date(),
      };
      await tx
        .insert(s.tenantModules)
        .values({ tenantId: tenant.id, module, ...values })
        .onConflictDoUpdate({ target: [s.tenantModules.tenantId, s.tenantModules.module], set: values });
      await tx.insert(s.tenantHistory).values({ tenantId: tenant.id, kind: "module", subject: module, fromValue: current?.status ?? "disabled", toValue: body.status, reason: body.reason, actorPlatformUserId: actor.id });
      await auditPlatform(tx, actor, tenant.id, {
        action: "tenant.module_changed",
        entityType: "company",
        entityId: tenant.id,
        summary: `Módulo ${MODULES[module].name}: ${MODULE_STATUS_LABEL[(current?.status as never) ?? "disabled"]} → ${MODULE_STATUS_LABEL[body.status]}.`,
      });
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>("/api/admin/tenants/:id/owner-invite", { config: platform }, async (req) => {
    const actor = platformOf(req).user;
    return adminDb.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(s.invites)
        .where(and(eq(s.invites.tenantId, req.params.id), eq(s.invites.isOwner, true), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)))
        .orderBy(desc(s.invites.createdAt))
        .limit(1);
      if (!invite) throw notFound("Convite pendente do responsável");
      const token = newToken();
      await tx.update(s.invites).set({ tokenHash: hashToken(token), expiresAt: days(config.inviteDays) }).where(eq(s.invites.id, invite.id));
      await auditPlatform(tx, actor, req.params.id, { action: "tenant.owner_invite_renewed", entityType: "invite", entityId: invite.id, summary: "Novo link de convite gerado para o responsável pela conta." });
      return { ownerInviteUrl: `${config.appOrigin}/convite/${token}` };
    });
  });

  // ------------------------------------------------------------------ Novidades
  app.get("/api/admin/news", { config: platform }, async () => {
    const rows = await adminDb.select().from(s.news).orderBy(desc(s.news.createdAt));
    const stats = await adminDb
      .select({ newsId: s.newsReceipts.newsId, action: s.newsReceipts.action, n: count() })
      .from(s.newsReceipts)
      .groupBy(s.newsReceipts.newsId, s.newsReceipts.action);
    return {
      items: rows.map((n) => ({
        ...n,
        stats: Object.fromEntries(stats.filter((st) => st.newsId === n.id).map((st) => [st.action, st.n])),
      })),
    };
  });

  const validateNews = (body: ReturnType<typeof newsSchema.parse>) => {
    const fields: Record<string, string> = {};
    if (body.tourId) {
      const tour = TOUR_MAP[body.tourId];
      if (!tour || tour.realm !== "clinic") fields.tourId = "Tour inexistente.";
      else if (body.targetPath && SCREENS[tour.screen as keyof typeof SCREENS]?.path !== body.targetPath) {
        fields.tourId = `Este tour pertence à tela ${SCREENS[tour.screen as keyof typeof SCREENS]?.path}. Ajuste a tela de destino.`;
      }
    }
    if (body.requiredPermission && !PERMISSIONS.some((p) => p.key === body.requiredPermission)) fields.requiredPermission = "Permissão inexistente.";
    if (body.status === "published" && !body.publishedAt) fields.publishedAt = "Informe a data de publicação.";
    if (Object.keys(fields).length) throw new AppError(422, "validation", "Confira os campos destacados.", fields);
  };

  app.post("/api/admin/news", { config: platform }, async (req, reply) => {
    const body = parse(newsSchema, req.body);
    validateNews(body);
    const actor = platformOf(req).user;
    const [row] = await adminDb
      .insert(s.news)
      .values({ ...body, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdBy: actor.id })
      .returning();
    await auditPlatform(adminDb, actor, null, { action: "news.created", entityType: "news", entityId: row!.id, summary: `Novidade "${row!.title}" cadastrada.` });
    return reply.status(201).send(row);
  });

  app.put<{ Params: { id: string } }>("/api/admin/news/:id", { config: platform }, async (req) => {
    const body = parse(newsSchema, req.body);
    validateNews(body);
    const actor = platformOf(req).user;
    const [row] = await adminDb
      .update(s.news)
      .set({ ...body, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, updatedAt: new Date() })
      .where(eq(s.news.id, req.params.id))
      .returning();
    if (!row) throw notFound("Novidade");
    await auditPlatform(adminDb, actor, null, { action: "news.updated", entityType: "news", entityId: row.id, summary: `Novidade "${row.title}" atualizada.` });
    return row;
  });
}

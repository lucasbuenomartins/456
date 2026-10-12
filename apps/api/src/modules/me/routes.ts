import { MODULES, MODULE_KEYS, changePasswordSchema, profileSchema } from "@clinica/shared";
import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf } from "../../app";
import { config } from "../../config";
import { adminDb, withTenant } from "../../db/client";
import * as s from "../../db/schema";
import { effectivePermissions } from "../../lib/access";
import { audit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { hashPassword, verifyPassword } from "../../lib/security";
import { parse } from "../../lib/validate";

export async function meRoutes(app: FastifyInstance) {
  app.get("/api/me", async (req) => {
    const ctx = ctxOf(req);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, ctx.tenant.planId));
      const allUnits = await tx
        .select({ id: s.units.id, name: s.units.name })
        .from(s.units)
        .where(eq(s.units.isActive, true))
        .orderBy(s.units.name);
      const tenantWideRole = ctx.membership.isOwner || ctx.assignments.some((a) => a.unitId === null);
      const allowedUnitIds = new Set(ctx.assignments.map((a) => a.unitId));
      const units = tenantWideRole ? allUnits : allUnits.filter((u) => allowedUnitIds.has(u.id));
      const currentUnitId = units.some((u) => u.id === ctx.unitId) ? ctx.unitId : (units[0]?.id ?? null);

      return {
        user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, createdAt: ctx.user.createdAt },
        tenant: {
          id: ctx.tenant.id,
          name: ctx.tenant.name,
          status: ctx.tenant.status,
          access: ctx.tenantAccess,
          trialEndsAt: ctx.tenant.trialEndsAt,
          dataAvailableUntil: ctx.tenant.dataAvailableUntil,
          plan: plan ? { id: plan.id, name: plan.name, limits: plan.limits } : null,
        },
        membership: {
          isOwner: ctx.membership.isOwner,
          jobTitle: ctx.membership.jobTitle,
          roles: [...new Set(ctx.assignments.map((a) => a.roleName))],
        },
        units,
        currentUnitId,
        permissions: effectivePermissions(ctx),
        modules: MODULE_KEYS.map((key) => ({
          key,
          name: MODULES[key].name,
          status: ctx.modules[key],
          availability: MODULES[key].availability,
        })),
      };
    });
  });

  app.post("/api/me/unit", { config: { allowReadOnly: true } }, async (req) => {
    const ctx = ctxOf(req);
    const { unitId } = (req.body ?? {}) as { unitId?: string };
    const tenantWideRole = ctx.membership.isOwner || ctx.assignments.some((a) => a.unitId === null);
    const allowed = tenantWideRole || ctx.assignments.some((a) => a.unitId === unitId);
    const exists = unitId
      ? await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
          tx.select({ id: s.units.id }).from(s.units).where(and(eq(s.units.id, unitId), eq(s.units.isActive, true))),
        )
      : [];
    if (!unitId || !allowed || exists.length === 0) throw new AppError(403, "forbidden", "Você não tem acesso a esta unidade.");
    await adminDb.update(s.sessions).set({ unitId }).where(eq(s.sessions.id, ctx.sessionId));
    return { ok: true };
  });

  app.patch("/api/me/profile", { config: { allowReadOnly: true } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(profileSchema, req.body);
    await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      await tx.update(s.users).set({ name: body.name }).where(eq(s.users.id, ctx.user.id));
    });
    return { ok: true };
  });

  app.post("/api/me/password", { config: { allowReadOnly: true, rateLimit: { max: config.authRateLimit, timeWindow: "1 minute" } } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(changePasswordSchema, req.body);
    const [user] = await adminDb.select().from(s.users).where(eq(s.users.id, ctx.user.id));
    if (!(await verifyPassword(user?.passwordHash, body.currentPassword))) {
      throw new AppError(422, "validation", "Confira os campos destacados.", { currentPassword: "Senha atual incorreta." });
    }
    await adminDb.update(s.users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(s.users.id, ctx.user.id));
    // Encerra as outras sessões do usuário.
    await adminDb.delete(s.sessions).where(and(eq(s.sessions.userId, ctx.user.id), ne(s.sessions.id, ctx.sessionId)));
    await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
      audit(tx, ctx, { action: "user.password_changed", entityType: "user", entityId: ctx.user.id, summary: `${ctx.user.name} alterou a própria senha.` }),
    );
    return { ok: true };
  });
}

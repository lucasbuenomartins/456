import {
  MODULES,
  MODULE_KEYS,
  PERMISSION_MAP,
  ROLE_TEMPLATES,
  companySchema,
  inviteSchema,
  memberUpdateSchema,
  roleSchema,
  unitSchema,
} from "@clinica/shared";
import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf } from "../../app";
import { config } from "../../config";
import { withTenant, type Tx } from "../../db/client";
import * as s from "../../db/schema";
import { can, type ClinicContext } from "../../lib/access";
import { audit, diffFields } from "../../lib/audit";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import { hashToken, newToken } from "../../lib/security";
import { parse } from "../../lib/validate";
import { assertWithinLimit, usage } from "./limits";

const scope = (ctx: ClinicContext) => ({ tenantId: ctx.tenant.id, userId: ctx.user.id });

/**
 * Impede escalada de privilégio: só o responsável pela conta concede permissões
 * que ele próprio não tem. Os demais só concedem permissões que já possuem para toda a empresa.
 */
function assertCanGrant(ctx: ClinicContext, permissions: string[]) {
  if (ctx.membership.isOwner) return;
  const own = new Set(ctx.assignments.filter((a) => a.unitId === null).flatMap((a) => a.permissions));
  const missing = permissions.filter((p) => !own.has(p));
  if (missing.length) {
    throw forbidden(
      `Você não pode conceder permissões que não possui: ${missing.map((p) => PERMISSION_MAP[p]?.label ?? p).join(", ")}.`,
    );
  }
}

/** Quem não é o responsável pela conta não altera o acesso de alguém com mais permissões do que ele. */
async function assertCanManageMember(tx: Tx, ctx: ClinicContext, membershipId: string) {
  if (ctx.membership.isOwner) return;
  const rows = await tx
    .select({ permissions: s.roles.permissions })
    .from(s.membershipRoles)
    .innerJoin(s.roles, eq(s.roles.id, s.membershipRoles.roleId))
    .where(eq(s.membershipRoles.membershipId, membershipId));
  const own = new Set(ctx.assignments.filter((a) => a.unitId === null).flatMap((a) => a.permissions));
  if (rows.flatMap((r) => r.permissions).some((p) => !own.has(p))) {
    throw forbidden("Esta pessoa tem permissões que você não possui. Peça ao responsável pela conta para alterar o acesso dela.");
  }
}

async function validateAssignments(tx: Tx, ctx: ClinicContext, assignments: { roleId: string; unitId: string | null }[]) {
  const roleIds = [...new Set(assignments.map((a) => a.roleId))];
  const unitIds = [...new Set(assignments.map((a) => a.unitId).filter((u): u is string => Boolean(u)))];
  const roles = await tx.select({ id: s.roles.id, permissions: s.roles.permissions }).from(s.roles).where(inArray(s.roles.id, roleIds));
  const units = unitIds.length ? await tx.select({ id: s.units.id }).from(s.units).where(inArray(s.units.id, unitIds)) : [];
  if (roles.length !== roleIds.length || units.length !== unitIds.length) {
    throw new AppError(422, "validation", "Função ou unidade inválida.", { assignments: "Escolha funções e unidades da lista." });
  }
  assertCanGrant(ctx, roles.flatMap((r) => r.permissions));
}

export async function settingsRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------ Empresa
  app.get("/api/settings/company", { config: { module: "core" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const [t] = await tx.select().from(s.tenants);
      return { name: t!.name, legalName: t!.legalName, document: t!.document, phone: t!.phone, email: t!.email };
    });
  });

  app.put("/api/settings/company", { config: { permission: "company.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(companySchema, req.body);
    return withTenant(scope(ctx), async (tx) => {
      const [before] = await tx.select().from(s.tenants);
      await tx.update(s.tenants).set({ ...body, updatedAt: new Date() }).where(eq(s.tenants.id, ctx.tenant.id));
      await audit(tx, ctx, {
        action: "company.updated",
        entityType: "company",
        entityId: ctx.tenant.id,
        summary: "Dados da empresa atualizados.",
        changes: diffFields(before as unknown as Record<string, unknown>, body),
      });
      return { ok: true };
    });
  });

  // ------------------------------------------------------------------ Unidades
  app.get("/api/settings/units", { config: { module: "core" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => ({
      items: await tx.select().from(s.units).orderBy(desc(s.units.isActive), asc(s.units.name)),
    }));
  });

  app.post("/api/settings/units", { config: { permission: "units.manage" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const body = parse(unitSchema, req.body);
    const unit = await withTenant(scope(ctx), async (tx) => {
      await assertWithinLimit(tx, ctx, "units");
      const [row] = await tx.insert(s.units).values({ ...body, tenantId: ctx.tenant.id, isActive: true }).returning();
      await audit(tx, ctx, { action: "unit.created", entityType: "unit", entityId: row!.id, summary: `Unidade ${row!.name} criada.` });
      return row;
    });
    return reply.status(201).send(unit);
  });

  app.put<{ Params: { id: string } }>("/api/settings/units/:id", { config: { permission: "units.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(unitSchema, req.body);
    return withTenant(scope(ctx), async (tx) => {
      const [before] = await tx.select().from(s.units).where(eq(s.units.id, req.params.id)).for("update");
      if (!before) throw notFound("Unidade");
      if (before.isActive && !body.isActive) {
        const [active] = await tx.select({ n: count() }).from(s.units).where(eq(s.units.isActive, true));
        if ((active?.n ?? 0) <= 1) throw conflict("last_unit", "A empresa precisa ter pelo menos uma unidade ativa.");
      }
      if (!before.isActive && body.isActive) await assertWithinLimit(tx, ctx, "units");
      const [row] = await tx.update(s.units).set({ ...body, updatedAt: new Date() }).where(eq(s.units.id, before.id)).returning();
      await audit(tx, ctx, {
        action: "unit.updated",
        entityType: "unit",
        entityId: before.id,
        summary: `Unidade ${row!.name} atualizada.`,
        changes: diffFields(before as unknown as Record<string, unknown>, body),
      });
      return row;
    });
  });

  // ------------------------------------------------------------------ Funções
  app.get("/api/settings/roles", { config: { permission: "team.read" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const roles = await tx.select().from(s.roles).orderBy(asc(s.roles.name));
      const usageRows = await tx
        .select({ roleId: s.membershipRoles.roleId, n: sql<number>`count(distinct ${s.membershipRoles.membershipId})::int` })
        .from(s.membershipRoles)
        .groupBy(s.membershipRoles.roleId);
      const used = Object.fromEntries(usageRows.map((u) => [u.roleId, u.n]));
      return {
        items: roles.map((r) => ({ ...r, membersCount: used[r.id] ?? 0 })),
        templates: ROLE_TEMPLATES.map((t) => ({ key: t.key, name: t.name })),
      };
    });
  });

  const checkPermissions = (perms: string[]) => {
    const invalid = perms.filter((p) => !PERMISSION_MAP[p]);
    if (invalid.length) throw new AppError(422, "validation", "Permissão desconhecida.", { permissions: invalid.join(", ") });
    return [...new Set(perms)];
  };

  app.post("/api/settings/roles", { config: { permission: "roles.manage" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const body = parse(roleSchema, req.body);
    const permissions = checkPermissions(body.permissions);
    assertCanGrant(ctx, permissions);
    const row = await withTenant(scope(ctx), async (tx) => {
      const [exists] = await tx.select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.name, body.name));
      if (exists) throw new AppError(422, "validation", "Confira os campos destacados.", { name: "Já existe uma função com este nome." });
      const [r] = await tx.insert(s.roles).values({ tenantId: ctx.tenant.id, name: body.name, description: body.description, permissions }).returning();
      await audit(tx, ctx, { action: "role.created", entityType: "role", entityId: r!.id, summary: `Função ${r!.name} criada.`, changes: { permissoes: permissions } });
      return r;
    });
    return reply.status(201).send(row);
  });

  app.put<{ Params: { id: string } }>("/api/settings/roles/:id", { config: { permission: "roles.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(roleSchema, req.body);
    const permissions = checkPermissions(body.permissions);
    return withTenant(scope(ctx), async (tx) => {
      const [before] = await tx.select().from(s.roles).where(eq(s.roles.id, req.params.id)).for("update");
      if (!before) throw notFound("Função");
      assertCanGrant(ctx, permissions.filter((p) => !before.permissions.includes(p)));
      const [sameName] = await tx.select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.name, body.name));
      if (sameName && sameName.id !== before.id) {
        throw new AppError(422, "validation", "Confira os campos destacados.", { name: "Já existe uma função com este nome." });
      }
      const [row] = await tx
        .update(s.roles)
        .set({ name: body.name, description: body.description, permissions, updatedAt: new Date() })
        .where(eq(s.roles.id, before.id))
        .returning();
      const added = permissions.filter((p) => !before.permissions.includes(p));
      const removed = before.permissions.filter((p) => !permissions.includes(p));
      await audit(tx, ctx, {
        action: "role.updated",
        entityType: "role",
        entityId: before.id,
        summary: `Função ${row!.name} atualizada.`,
        changes: { incluidas: added, removidas: removed, ...(before.name !== body.name ? { nome: { de: before.name, para: body.name } } : {}) },
      });
      return row;
    });
  });

  app.delete<{ Params: { id: string } }>("/api/settings/roles/:id", { config: { permission: "roles.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const [role] = await tx.select().from(s.roles).where(eq(s.roles.id, req.params.id));
      if (!role) throw notFound("Função");
      const [inUse] = await tx.select({ n: count() }).from(s.membershipRoles).where(eq(s.membershipRoles.roleId, role.id));
      if ((inUse?.n ?? 0) > 0) {
        throw conflict("role_in_use", `Esta função está atribuída a ${inUse!.n} pessoa(s). Troque a função dessas pessoas antes de excluir.`);
      }
      await tx.delete(s.roles).where(eq(s.roles.id, role.id));
      await audit(tx, ctx, { action: "role.deleted", entityType: "role", entityId: role.id, summary: `Função ${role.name} excluída.` });
      return { ok: true };
    });
  });

  // ------------------------------------------------------------------ Equipe
  app.get("/api/settings/team", { config: { permission: "team.read" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const members = await tx
        .select({
          id: s.memberships.id,
          userId: s.users.id,
          name: s.users.name,
          email: s.users.email,
          status: s.memberships.status,
          jobTitle: s.memberships.jobTitle,
          isOwner: s.memberships.isOwner,
          lastLoginAt: s.users.lastLoginAt,
        })
        .from(s.memberships)
        .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
        .orderBy(asc(s.users.name));
      const assignments = await tx
        .select({ membershipId: s.membershipRoles.membershipId, roleId: s.membershipRoles.roleId, roleName: s.roles.name, unitId: s.membershipRoles.unitId })
        .from(s.membershipRoles)
        .innerJoin(s.roles, eq(s.roles.id, s.membershipRoles.roleId));
      const canManage = can(ctx, "team.manage");
      const invites = canManage
        ? await tx
            .select({ id: s.invites.id, name: s.invites.name, email: s.invites.email, jobTitle: s.invites.jobTitle, expiresAt: s.invites.expiresAt, createdAt: s.invites.createdAt, assignments: s.invites.assignments })
            .from(s.invites)
            .where(and(isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)))
            .orderBy(desc(s.invites.createdAt))
        : [];
      return {
        members: members.map((m) => ({
          ...m,
          email: canManage || m.userId === ctx.user.id ? m.email : null,
          lastLoginAt: canManage ? m.lastLoginAt : null,
          assignments: assignments.filter((a) => a.membershipId === m.id).map(({ membershipId: _m, ...a }) => a),
        })),
        invites: invites.map((i) => ({ ...i, expired: i.expiresAt < new Date() })),
      };
    });
  });

  app.post("/api/settings/team/invites", { config: { permission: "team.manage" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const body = parse(inviteSchema, req.body);
    const token = newToken();
    const invite = await withTenant(scope(ctx), async (tx) => {
      await validateAssignments(tx, ctx, body.assignments);
      const [member] = await tx
        .select({ id: s.memberships.id, status: s.memberships.status })
        .from(s.memberships)
        .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
        .where(eq(s.users.email, body.email));
      if (member?.status === "active") {
        throw new AppError(422, "validation", "Confira os campos destacados.", { email: "Esta pessoa já faz parte da equipe." });
      }
      // Um convite pendente por e-mail: o anterior é substituído.
      await tx.update(s.invites).set({ revokedAt: new Date() }).where(and(eq(s.invites.email, body.email), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)));
      await assertWithinLimit(tx, ctx, "users");
      const [row] = await tx
        .insert(s.invites)
        .values({
          tenantId: ctx.tenant.id,
          email: body.email,
          name: body.name,
          jobTitle: body.jobTitle,
          assignments: body.assignments,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + config.inviteDays * 24 * 3600 * 1000),
          createdBy: ctx.user.id,
        })
        .returning();
      await audit(tx, ctx, { action: "team.invited", entityType: "invite", entityId: row!.id, summary: `Convite criado para ${row!.name}.` });
      return row!;
    });
    // O envio automático (WhatsApp) depende de integração futura: o link é exibido para ser compartilhado manualmente.
    return reply.status(201).send({ id: invite.id, inviteUrl: `${config.appOrigin}/convite/${token}`, expiresAt: invite.expiresAt });
  });

  app.delete<{ Params: { id: string } }>("/api/settings/team/invites/:id", { config: { permission: "team.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const [row] = await tx
        .update(s.invites)
        .set({ revokedAt: new Date() })
        .where(and(eq(s.invites.id, req.params.id), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)))
        .returning();
      if (!row) throw notFound("Convite");
      await audit(tx, ctx, { action: "team.invite_revoked", entityType: "invite", entityId: row.id, summary: `Convite de ${row.name} cancelado.` });
      return { ok: true };
    });
  });

  app.put<{ Params: { id: string } }>("/api/settings/team/:id", { config: { permission: "team.manage" } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(memberUpdateSchema, req.body);
    return withTenant(scope(ctx), async (tx) => {
      const [member] = await tx.select().from(s.memberships).where(eq(s.memberships.id, req.params.id)).for("update");
      if (!member) throw notFound("Pessoa");
      if (member.isOwner && !ctx.membership.isOwner) throw forbidden("Apenas o responsável pela conta altera o próprio acesso.");
      await assertCanManageMember(tx, ctx, member.id);
      await validateAssignments(tx, ctx, body.assignments);
      const before = await tx
        .select({ roleName: s.roles.name, unitId: s.membershipRoles.unitId })
        .from(s.membershipRoles)
        .innerJoin(s.roles, eq(s.roles.id, s.membershipRoles.roleId))
        .where(eq(s.membershipRoles.membershipId, member.id));
      await tx.delete(s.membershipRoles).where(eq(s.membershipRoles.membershipId, member.id));
      const unique = [...new Map(body.assignments.map((a) => [`${a.roleId}:${a.unitId}`, a])).values()];
      await tx.insert(s.membershipRoles).values(unique.map((a) => ({ tenantId: ctx.tenant.id, membershipId: member.id, roleId: a.roleId, unitId: a.unitId })));
      await tx.update(s.memberships).set({ jobTitle: body.jobTitle, updatedAt: new Date() }).where(eq(s.memberships.id, member.id));
      const [user] = await tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, member.userId));
      await audit(tx, ctx, {
        action: "team.access_changed",
        entityType: "membership",
        entityId: member.id,
        summary: `Funções de ${user?.name ?? "uma pessoa"} alteradas.`,
        changes: { antes: before.map((b) => b.roleName), depois: unique.length },
      });
      return { ok: true };
    });
  });

  const setMemberStatus = (status: "active" | "disabled") =>
    async function handler(req: Parameters<typeof ctxOf>[0] & { params: unknown }) {
      const ctx = ctxOf(req);
      const { id } = req.params as { id: string };
      return withTenant(scope(ctx), async (tx) => {
        const [member] = await tx.select().from(s.memberships).where(eq(s.memberships.id, id)).for("update");
        if (!member) throw notFound("Pessoa");
        if (member.isOwner && status === "disabled") throw forbidden("O responsável pela conta não pode ser desativado.");
        if (member.userId === ctx.user.id && status === "disabled") throw forbidden("Você não pode desativar o próprio acesso.");
        await assertCanManageMember(tx, ctx, member.id);
        if (status === "active" && member.status !== "active") await assertWithinLimit(tx, ctx, "users");
        await tx.update(s.memberships).set({ status, updatedAt: new Date() }).where(eq(s.memberships.id, id));
        const [user] = await tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, member.userId));
        await audit(tx, ctx, {
          action: status === "active" ? "team.reactivated" : "team.disabled",
          entityType: "membership",
          entityId: id,
          summary: `Acesso de ${user?.name ?? "uma pessoa"} ${status === "active" ? "reativado" : "desativado"}.`,
        });
        return { ok: true };
      });
    };
  app.post("/api/settings/team/:id/disable", { config: { permission: "team.manage" } }, setMemberStatus("disabled"));
  app.post("/api/settings/team/:id/enable", { config: { permission: "team.manage" } }, setMemberStatus("active"));

  // ------------------------------------------------------------------ Plano e módulos
  app.get("/api/settings/plan", { config: { permission: "plan.read" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, ctx.tenant.planId));
      const modules = await tx.select().from(s.tenantModules);
      const history = await tx
        .select({ kind: s.tenantHistory.kind, subject: s.tenantHistory.subject, fromValue: s.tenantHistory.fromValue, toValue: s.tenantHistory.toValue, reason: s.tenantHistory.reason, createdAt: s.tenantHistory.createdAt })
        .from(s.tenantHistory)
        .orderBy(desc(s.tenantHistory.createdAt))
        .limit(30);
      return {
        plan,
        status: ctx.tenant.status,
        access: ctx.tenantAccess,
        trialEndsAt: ctx.tenant.trialEndsAt,
        dataAvailableUntil: ctx.tenant.dataAvailableUntil,
        usage: await usage(tx),
        modules: MODULE_KEYS.map((key) => {
          const row = modules.find((m) => m.module === key);
          return {
            key,
            name: MODULES[key].name,
            description: MODULES[key].description,
            requires: MODULES[key].requires,
            enhancedBy: MODULES[key].enhancedBy,
            availability: MODULES[key].availability,
            status: ctx.modules[key],
            source: row?.source ?? null,
            readOnlyUntil: row?.readOnlyUntil ?? null,
          };
        }),
        history,
      };
    });
  });

  // ------------------------------------------------------------------ Histórico de alterações
  app.get("/api/settings/audit", { config: { permission: "audit.read" } }, async (req) => {
    const ctx = ctxOf(req);
    const q = req.query as { before?: string; entityType?: string; actorId?: string };
    return withTenant(scope(ctx), async (tx) => {
      const conds = [];
      if (q.before && !Number.isNaN(Date.parse(q.before))) conds.push(lt(s.auditEvents.createdAt, new Date(q.before)));
      if (q.entityType) conds.push(eq(s.auditEvents.entityType, q.entityType));
      if (q.actorId && /^[0-9a-f-]{36}$/.test(q.actorId)) conds.push(eq(s.auditEvents.actorId, q.actorId));
      const items = await tx
        .select()
        .from(s.auditEvents)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(s.auditEvents.createdAt))
        .limit(50);
      return { items, nextBefore: items.length === 50 ? items[items.length - 1]!.createdAt : null };
    });
  });

  // ------------------------------------------------------------------ Exportação
  app.get("/api/settings/export", { config: { permission: "data.export", module: "core" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const data = await withTenant(scope(ctx), async (tx) => {
      const [company] = await tx.select().from(s.tenants);
      const result = {
        geradoEm: new Date().toISOString(),
        observacao:
          "Exportação dos dados do núcleo (empresa, unidades, equipe, funções e clientes). Dados de outros módulos são exportados em seus módulos.",
        empresa: company,
        unidades: await tx.select().from(s.units),
        funcoes: await tx.select().from(s.roles),
        equipe: await tx
          .select({ nome: s.users.name, email: s.users.email, situacao: s.memberships.status, cargo: s.memberships.jobTitle })
          .from(s.memberships)
          .innerJoin(s.users, eq(s.users.id, s.memberships.userId)),
        clientes: (await tx.select().from(s.clients)).map(({ searchText: _s, ...c }) => c),
        consentimentosDeComunicacao: await tx.select().from(s.clientConsents),
      };
      await audit(tx, ctx, { action: "data.exported", entityType: "company", entityId: ctx.tenant.id, summary: "Exportação completa dos dados do núcleo." });
      return result;
    });
    reply.header("Content-Disposition", `attachment; filename="exportacao-${new Date().toISOString().slice(0, 10)}.json"`);
    return data;
  });
}

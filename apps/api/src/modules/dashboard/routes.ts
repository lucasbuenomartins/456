import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf } from "../../app";
import { withTenant } from "../../db/client";
import * as s from "../../db/schema";
import { can } from "../../lib/access";

/** Resumo do Início. Cada bloco só é calculado se a pessoa tiver permissão para vê-lo. */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", { config: { module: "core" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      const result: Record<string, unknown> = {};

      if (can(ctx, "clients.read")) {
        const today = sql`(now() at time zone 'America/Sao_Paulo')::date`;
        const [birthdaysToday, birthdaysMonth, recent, [total]] = await Promise.all([
          tx
            .select({ id: s.clients.id, fullName: s.clients.fullName, phone: s.clients.phone, birthDate: s.clients.birthDate, phoneIsWhatsapp: s.clients.phoneIsWhatsapp })
            .from(s.clients)
            .where(and(eq(s.clients.status, "active"), sql`to_char(${s.clients.birthDate}, 'MM-DD') = to_char(${today}, 'MM-DD')`))
            .limit(20),
          tx
            .select({ id: s.clients.id, fullName: s.clients.fullName, birthDate: s.clients.birthDate })
            .from(s.clients)
            .where(and(eq(s.clients.status, "active"), sql`extract(month from ${s.clients.birthDate}) = extract(month from ${today})`))
            .orderBy(sql`extract(day from ${s.clients.birthDate})`)
            .limit(50),
          tx
            .select({ id: s.clients.id, fullName: s.clients.fullName, phone: s.clients.phone, createdAt: s.clients.createdAt })
            .from(s.clients)
            .orderBy(desc(s.clients.createdAt))
            .limit(5),
          tx.select({ n: count() }).from(s.clients).where(eq(s.clients.status, "active")),
        ]);
        result.clients = { total: total?.n ?? 0, birthdaysToday, birthdaysMonth, recent };
      }

      if (can(ctx, "team.manage")) {
        const now = new Date();
        const [[pending], [expired]] = await Promise.all([
          tx.select({ n: count() }).from(s.invites).where(and(isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt), gt(s.invites.expiresAt, now))),
          tx.select({ n: count() }).from(s.invites).where(and(isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt), lt(s.invites.expiresAt, now))),
        ]);
        result.invites = { pending: pending?.n ?? 0, expired: expired?.n ?? 0 };
      }

      if (can(ctx, "company.manage")) {
        const [tenant] = await tx.select().from(s.tenants);
        const [[members], [invites], [unitsWithAddress], [clients]] = await Promise.all([
          tx.select({ n: count() }).from(s.memberships).where(eq(s.memberships.status, "active")),
          tx.select({ n: count() }).from(s.invites).where(isNull(s.invites.revokedAt)),
          tx.select({ n: count() }).from(s.units).where(and(eq(s.units.isActive, true), sql`coalesce(${s.units.address}->>'street', '') <> ''`)),
          tx.select({ n: count() }).from(s.clients),
        ]);
        result.setup = [
          { key: "company", done: Boolean(tenant?.document && (tenant.phone || tenant.email)), to: "/configuracoes/empresa", label: "Complete os dados da empresa" },
          { key: "units", done: (unitsWithAddress?.n ?? 0) > 0, to: "/configuracoes/unidades", label: "Informe o endereço da unidade" },
          { key: "team", done: (members?.n ?? 0) > 1 || (invites?.n ?? 0) > 0, to: "/configuracoes/equipe", label: "Convide sua equipe" },
          { key: "clients", done: (clients?.n ?? 0) > 0, to: "/clientes/novo", label: "Cadastre o primeiro cliente" },
        ];
      }
      return result;
    });
  });
}

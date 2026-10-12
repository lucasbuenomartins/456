import { MODULE_KEYS, READ_ONLY_GRACE_DAYS, ROLE_TEMPLATES, type ModuleKey } from "@clinica/shared";
import { and, eq } from "drizzle-orm";
import { config } from "../../config";
import type { DbOrTx } from "../../db/client";
import * as s from "../../db/schema";
import { hashToken, newToken } from "../../lib/security";

const days = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

export interface ProvisionInput {
  name: string;
  document?: string | null;
  planId: string;
  trialDays: number;
  firstUnitName: string;
  owner: { name: string; email: string };
  actorPlatformUserId?: string | null;
}

/**
 * Cria uma empresa pronta para uso: unidade inicial, funções-modelo, módulos do plano
 * e o convite do responsável pela conta. Tudo na mesma transação.
 */
export async function provisionTenant(tx: DbOrTx, input: ProvisionInput) {
  const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, input.planId));
  if (!plan) throw new Error("Plano não encontrado");

  const [tenant] = await tx
    .insert(s.tenants)
    .values({
      name: input.name,
      document: input.document ?? null,
      planId: plan.id,
      status: input.trialDays > 0 ? "trial" : "active",
      trialEndsAt: input.trialDays > 0 ? days(input.trialDays) : null,
    })
    .returning();
  const tenantId = tenant!.id;

  const [unit] = await tx.insert(s.units).values({ tenantId, name: input.firstUnitName }).returning();
  const roles = await tx
    .insert(s.roles)
    .values(ROLE_TEMPLATES.map((t) => ({ tenantId, name: t.name, description: t.description, permissions: t.permissions, templateKey: t.key })))
    .returning();

  const planModules = new Set<ModuleKey>(["core", ...(plan.modules as ModuleKey[])]);
  await tx.insert(s.tenantModules).values(
    MODULE_KEYS.filter((m) => planModules.has(m)).map((module) => ({
      tenantId,
      module,
      status: input.trialDays > 0 && module !== "core" ? "trial" : "active",
      source: "plan",
    })),
  );

  await tx.insert(s.tenantHistory).values({
    tenantId,
    kind: "created",
    toValue: plan.name,
    reason: "Empresa criada",
    actorPlatformUserId: input.actorPlatformUserId ?? null,
  });

  const adminRole = roles.find((r) => r.templateKey === "admin")!;
  const token = newToken();
  await tx.insert(s.invites).values({
    tenantId,
    email: input.owner.email,
    name: input.owner.name,
    jobTitle: "Responsável pela conta",
    assignments: [{ roleId: adminRole.id, unitId: null }],
    isOwner: true,
    tokenHash: hashToken(token),
    expiresAt: days(config.inviteDays),
  });

  return { tenant: tenant!, unit: unit!, roles, ownerInviteUrl: `${config.appOrigin}/convite/${token}` };
}

/**
 * Sincroniza os módulos após mudança de plano.
 * - Módulos do novo plano ficam ativos.
 * - Módulos que vinham do plano anterior e não estão no novo ficam em "somente leitura"
 *   por READ_ONLY_GRACE_DAYS (consulta e exportação), sem apagar dados.
 * - Módulos contratados avulsos (addon) não são afetados.
 */
export async function syncModulesWithPlan(tx: DbOrTx, tenantId: string, planModules: ModuleKey[]) {
  const wanted = new Set<ModuleKey>(["core", ...planModules]);
  const current = await tx.select().from(s.tenantModules).where(eq(s.tenantModules.tenantId, tenantId));
  const changes: { module: string; from: string; to: string }[] = [];
  for (const module of MODULE_KEYS) {
    const row = current.find((c) => c.module === module);
    if (wanted.has(module)) {
      if (!row) {
        await tx.insert(s.tenantModules).values({ tenantId, module, status: "active", source: "plan" });
        changes.push({ module, from: "disabled", to: "active" });
      } else if (row.status !== "active" && row.status !== "trial") {
        await tx
          .update(s.tenantModules)
          .set({ status: "active", source: "plan", readOnlyUntil: null, updatedAt: new Date() })
          .where(and(eq(s.tenantModules.tenantId, tenantId), eq(s.tenantModules.module, module)));
        changes.push({ module, from: row.status, to: "active" });
      }
    } else if (row && row.source === "plan" && (row.status === "active" || row.status === "trial")) {
      await tx
        .update(s.tenantModules)
        .set({ status: "read_only", readOnlyUntil: days(READ_ONLY_GRACE_DAYS), updatedAt: new Date() })
        .where(and(eq(s.tenantModules.tenantId, tenantId), eq(s.tenantModules.module, module)));
      changes.push({ module, from: row.status, to: "read_only" });
    }
  }
  return changes;
}

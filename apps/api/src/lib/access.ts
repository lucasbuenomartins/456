import {
  MODULE_KEYS,
  PERMISSION_MAP,
  PERMISSIONS,
  canReadModule,
  canWriteModule,
  type ModuleKey,
  type ModuleStatus,
  type PermissionKey,
} from "@clinica/shared";
import { and, eq, gt } from "drizzle-orm";
import { adminDb, withTenant } from "../db/client";
import * as s from "../db/schema";
import { hashToken } from "./security";

export interface Assignment {
  roleId: string;
  roleName: string;
  unitId: string | null;
  permissions: string[];
}

export type TenantAccessMode = "full" | "read_only" | "blocked";

export interface ClinicContext {
  sessionId: string;
  user: { id: string; name: string; email: string; createdAt: Date };
  tenant: {
    id: string;
    name: string;
    status: string;
    planId: string;
    trialEndsAt: Date | null;
    dataAvailableUntil: Date | null;
  };
  membership: { id: string; isOwner: boolean; jobTitle: string | null };
  /** Unidade selecionada no topo da tela. */
  unitId: string | null;
  assignments: Assignment[];
  modules: Record<ModuleKey, ModuleStatus>;
  tenantAccess: TenantAccessMode;
}

const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key) as string[];

/**
 * Regras de permissão:
 * - O responsável pela conta (is_owner) tem todas as permissões, para evitar perda de acesso.
 * - Permissões de escopo "tenant" só valem por funções atribuídas a "Todas as unidades".
 * - Permissões de escopo "unit" valem na unidade da função; se nenhuma unidade for informada,
 *   basta tê-la em alguma unidade (recursos compartilhados pela empresa, como clientes).
 * - A permissão também exige que o módulo correspondente esteja contratado.
 */
export function can(ctx: Pick<ClinicContext, "assignments" | "membership" | "modules">, permission: PermissionKey, unitId?: string | null): boolean {
  const def = PERMISSION_MAP[permission];
  if (!def) return false;
  if (!canReadModule(ctx.modules[def.module])) return false;
  if (ctx.membership.isOwner) return true;
  return ctx.assignments.some((a) => {
    if (!a.permissions.includes(permission)) return false;
    if (def.scope === "tenant") return a.unitId === null;
    if (unitId) return a.unitId === null || a.unitId === unitId;
    return true;
  });
}

/** Lista efetiva de permissões por unidade, enviada ao frontend para montar a interface. */
export function effectivePermissions(ctx: ClinicContext): { tenantWide: string[]; byUnit: Record<string, string[]> } {
  const allowed = (perms: string[]) =>
    perms.filter((p) => {
      const def = PERMISSION_MAP[p];
      return def && canReadModule(ctx.modules[def.module]);
    });
  if (ctx.membership.isOwner) return { tenantWide: allowed(ALL_PERMISSIONS), byUnit: {} };
  const tenantWide = new Set<string>();
  const byUnit: Record<string, Set<string>> = {};
  for (const a of ctx.assignments) {
    for (const perm of allowed(a.permissions)) {
      if (a.unitId === null) tenantWide.add(perm);
      else if (PERMISSION_MAP[perm]?.scope === "unit") (byUnit[a.unitId] ??= new Set()).add(perm);
    }
  }
  return {
    tenantWide: [...tenantWide],
    byUnit: Object.fromEntries(Object.entries(byUnit).map(([k, v]) => [k, [...v]])),
  };
}

export function tenantAccessMode(tenant: ClinicContext["tenant"], now = new Date()): TenantAccessMode {
  switch (tenant.status) {
    case "active":
      return "full";
    case "trial":
      return tenant.trialEndsAt && tenant.trialEndsAt < now ? "read_only" : "full";
    case "suspended":
      return "read_only";
    case "cancelled":
      return tenant.dataAvailableUntil && tenant.dataAvailableUntil > now ? "read_only" : "blocked";
    default:
      return "blocked";
  }
}

export function moduleStatusMap(rows: { module: string; status: string; readOnlyUntil: Date | null }[], now = new Date()) {
  const map = Object.fromEntries(MODULE_KEYS.map((k) => [k, "disabled"])) as Record<ModuleKey, ModuleStatus>;
  for (const r of rows) {
    if (!(MODULE_KEYS as readonly string[]).includes(r.module)) continue;
    let status = r.status as ModuleStatus;
    // Fim do prazo de consulta: o módulo deixa de aparecer, mas os dados permanecem guardados.
    if (status === "read_only" && r.readOnlyUntil && r.readOnlyUntil < now) status = "disabled";
    map[r.module as ModuleKey] = status;
  }
  map.core = map.core === "disabled" ? "active" : map.core;
  return map;
}

export function moduleWritable(ctx: ClinicContext, module: ModuleKey): boolean {
  return ctx.tenantAccess === "full" && canWriteModule(ctx.modules[module]);
}

/** Carrega a sessão a partir do token do cookie. Retorna null se inválida, expirada ou sem acesso. */
export async function loadClinicContext(token: string): Promise<ClinicContext | null> {
  const now = new Date();
  const [row] = await adminDb
    .select({ session: s.sessions, user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.tokenHash, hashToken(token)), gt(s.sessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.user.isActive || !row.session.tenantId) return null;
  const { session, user } = row;
  const tenantId = session.tenantId!;

  return withTenant({ tenantId, userId: user.id }, async (tx) => {
    const [tenant] = await tx.select().from(s.tenants).where(eq(s.tenants.id, tenantId));
    const [membership] = await tx
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.userId, user.id), eq(s.memberships.tenantId, tenantId)));
    if (!tenant || !membership || membership.status !== "active") return null;

    const moduleRows = await tx.select().from(s.tenantModules);
    const roleRows = await tx
      .select({ roleId: s.roles.id, roleName: s.roles.name, unitId: s.membershipRoles.unitId, permissions: s.roles.permissions })
      .from(s.membershipRoles)
      .innerJoin(s.roles, eq(s.roles.id, s.membershipRoles.roleId))
      .where(eq(s.membershipRoles.membershipId, membership.id));

    const tenantInfo = {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      planId: tenant.planId,
      trialEndsAt: tenant.trialEndsAt,
      dataAvailableUntil: tenant.dataAvailableUntil,
    };
    const access = tenantAccessMode(tenantInfo, now);
    if (access === "blocked") return null;

    return {
      sessionId: session.id,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      tenant: tenantInfo,
      membership: { id: membership.id, isOwner: membership.isOwner, jobTitle: membership.jobTitle },
      unitId: session.unitId,
      assignments: roleRows,
      modules: moduleStatusMap(moduleRows, now),
      tenantAccess: access,
    } satisfies ClinicContext;
  });
}

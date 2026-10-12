import type { DbOrTx } from "../db/client";
import { auditEvents } from "../db/schema";
import type { ClinicContext } from "./access";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  unitId?: string | null;
  summary: string;
  /** Apenas nomes de campos ou valores não sensíveis. Nunca grave dados de saúde, CPF ou senhas. */
  changes?: Record<string, unknown>;
}

export async function audit(tx: DbOrTx, ctx: ClinicContext, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    tenantId: ctx.tenant.id,
    actorKind: "user",
    actorId: ctx.user.id,
    actorName: ctx.user.name,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    unitId: input.unitId ?? ctx.unitId,
    summary: input.summary,
    changes: input.changes ?? null,
  });
}

export async function auditPlatform(
  tx: DbOrTx,
  actor: { id: string; name: string },
  tenantId: string | null,
  input: AuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    tenantId,
    actorKind: "platform",
    actorId: actor.id,
    actorName: `${actor.name} (suporte da plataforma)`,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    changes: input.changes ?? null,
  });
}

/** Lista os campos que mudaram entre dois objetos, sem expor os valores de campos sensíveis. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  sensitive: (keyof T)[] = [],
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) changed[key as string] = sensitive.includes(key) ? "(alterado)" : { de: before[key] ?? null, para: after[key] ?? null };
  }
  return changed;
}

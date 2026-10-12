import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Tx } from "../../db/client";
import * as s from "../../db/schema";
import type { ClinicContext } from "../../lib/access";
import { AppError } from "../../lib/errors";

type LimitKey = "units" | "users" | "clients";

const LABEL: Record<LimitKey, string> = {
  units: "unidades",
  users: "pessoas na equipe",
  clients: "clientes ativos",
};

export async function usage(tx: Tx): Promise<Record<LimitKey, number>> {
  const [[units], [users], [clients], [pendingInvites]] = await Promise.all([
    tx.select({ n: count() }).from(s.units).where(eq(s.units.isActive, true)),
    tx.select({ n: count() }).from(s.memberships).where(eq(s.memberships.status, "active")),
    tx.select({ n: count() }).from(s.clients).where(eq(s.clients.status, "active")),
    tx
      .select({ n: count() })
      .from(s.invites)
      .where(and(isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt), gt(s.invites.expiresAt, new Date()))),
  ]);
  return { units: units?.n ?? 0, users: (users?.n ?? 0) + (pendingInvites?.n ?? 0), clients: clients?.n ?? 0 };
}

/** Verifica no servidor se a operação cabe no limite do plano contratado. */
export async function assertWithinLimit(tx: Tx, ctx: ClinicContext, key: LimitKey, adding = 1): Promise<void> {
  const [plan] = await tx.select({ limits: s.plans.limits, name: s.plans.name }).from(s.plans).where(eq(s.plans.id, ctx.tenant.planId));
  const limit = plan?.limits[key];
  if (limit === null || limit === undefined) return;
  const current = (await usage(tx))[key];
  if (current + adding > limit) {
    throw new AppError(
      403,
      "plan_limit",
      `Seu plano (${plan!.name}) permite até ${limit} ${LABEL[key]}. Para incluir mais, fale com o responsável pela conta sobre a mudança de plano.`,
      undefined,
      { limit, current, key },
    );
  }
}

import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Tx } from "../db/client";
import { idempotencyKeys } from "../db/schema";
import type { ClinicContext } from "./access";
import { AppError } from "./errors";

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

/**
 * Garante que uma operação repetida (duplo clique, reenvio após falha de rede)
 * não seja executada duas vezes. O cliente envia o cabeçalho Idempotency-Key.
 *
 * A chave é reservada dentro da mesma transação da operação. Se duas requisições
 * com a mesma chave chegam juntas, a segunda espera a primeira terminar e devolve
 * a mesma resposta. Se a primeira falhar, a reserva é desfeita e a segunda executa.
 */
export async function idempotent<T>(
  tx: Tx,
  req: FastifyRequest,
  ctx: ClinicContext,
  route: string,
  fn: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const header = req.headers["idempotency-key"];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) return { ...(await fn()), replayed: false };
  if (key.length > 100) throw new AppError(400, "bad_request", "Idempotency-Key inválida.");

  const reserved = await tx
    .insert(idempotencyKeys)
    .values({ tenantId: ctx.tenant.id, key, userId: ctx.user.id, route, statusCode: 0 })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (reserved.length === 0) {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.tenantId, ctx.tenant.id), eq(idempotencyKeys.key, key)));
    if (!existing || existing.route !== route || existing.userId !== ctx.user.id) {
      throw new AppError(422, "idempotency_mismatch", "Esta operação já foi usada para outra ação. Recarregue a página.");
    }
    return { statusCode: existing.statusCode, body: existing.response as T, replayed: true };
  }

  const result = await fn();
  await tx
    .update(idempotencyKeys)
    .set({ statusCode: result.statusCode, response: sql`${JSON.stringify(result.body)}::jsonb` })
    .where(and(eq(idempotencyKeys.tenantId, ctx.tenant.id), eq(idempotencyKeys.key, key)));
  return { ...result, replayed: false };
}

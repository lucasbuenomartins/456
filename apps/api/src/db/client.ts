import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

/** Conexão da operação das clínicas: papel sem BYPASSRLS. */
export const appPool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
/** Conexão privilegiada: autenticação e painel do SaaS. Nunca use em rotas das clínicas. */
export const adminPool = new pg.Pool({ connectionString: config.databaseAdminUrl, max: 5 });

export const appDb: Database = drizzle(appPool, { schema });
export const adminDb: Database = drizzle(adminPool, { schema });

export interface TenantScope {
  tenantId: string;
  userId: string;
}

/**
 * Executa `fn` numa transação com o contexto da empresa e do usuário.
 * O PostgreSQL (RLS) garante que apenas linhas da empresa sejam visíveis,
 * mesmo que uma consulta esqueça o filtro por tenant_id.
 */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', ${scope.userId}, true)`,
    );
    return fn(tx);
  });
}

export async function closePools(): Promise<void> {
  await Promise.all([appPool.end(), adminPool.end()]);
}

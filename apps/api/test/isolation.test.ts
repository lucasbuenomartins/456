import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appDb, closePools, withTenant } from "../src/db/client";
import * as s from "../src/db/schema";
import { ana, bianca, getApp, uniquePhone } from "./helpers";

/** O ORM encapsula o erro do PostgreSQL; a mensagem original fica em `cause`. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; cause?: { message: string } },
  );
  expect(err, "a operação deveria falhar").not.toBeNull();
  expect(`${err!.message} ${err!.cause?.message ?? ""}`).toMatch(pattern);
}

afterAll(async () => {
  await (await getApp()).close();
  await closePools();
});

describe("Isolamento entre empresas", () => {
  it("cada empresa só lista os próprios clientes", async () => {
    const a = await ana();
    const b = await bianca();
    const listA = (await a.get("/api/clients?status=all&pageSize=100")).json();
    const listB = (await b.get("/api/clients?status=all&pageSize=100")).json();
    expect(listA.total).toBeGreaterThan(0);
    expect(listB.total).toBeGreaterThan(0);
    const idsA = new Set(listA.items.map((c: { id: string }) => c.id));
    expect(listB.items.some((c: { id: string }) => idsA.has(c.id))).toBe(false);
  });

  it("não lê, altera nem inativa cliente de outra empresa pelo ID", async () => {
    const a = await ana();
    const b = await bianca();
    const created = await b.post("/api/clients", { fullName: "Cliente Exclusiva Aurora", phone: uniquePhone() });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    expect((await a.get(`/api/clients/${id}`)).statusCode).toBe(404);
    const put = await a.put(`/api/clients/${id}`, { fullName: "Invasão", phone: uniquePhone(), version: 0 });
    expect(put.statusCode).toBe(404);
    expect((await a.post(`/api/clients/${id}/deactivate`)).statusCode).toBe(404);
    const bulk = await a.post("/api/clients/bulk", { ids: [id], action: "deactivate" });
    expect(bulk.json().updated).toBe(0);
    expect((await b.get(`/api/clients/${id}`)).json().client.status).toBe("active");
  });

  it("o banco (RLS) bloqueia leitura sem contexto de empresa e entre empresas", async () => {
    // Sem app.tenant_id definido: nenhuma linha visível para o papel da aplicação.
    const rows = await appDb.select().from(s.clients);
    expect(rows).toHaveLength(0);

    const b = await bianca();
    const me = (await b.get("/api/me")).json();
    const a = await ana();
    const meA = (await a.get("/api/me")).json();
    const visible = await withTenant({ tenantId: me.tenant.id, userId: me.user.id }, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from clients where tenant_id = ${meA.tenant.id}`),
    );
    expect(visible.rows[0]!.n).toBe(0);
  });

  it("o banco recusa inserir registro com tenant_id de outra empresa", async () => {
    const a = await ana();
    const b = await bianca();
    const meA = (await a.get("/api/me")).json();
    const meB = (await b.get("/api/me")).json();
    await expectDbError(
      withTenant({ tenantId: meA.tenant.id, userId: meA.user.id }, (tx) =>
        tx.insert(s.clients).values({ tenantId: meB.tenant.id, fullName: "X", phone: "11987654321", searchText: "x" }),
      ),
      /row-level security/,
    );
  });

  it("não vincula unidade de outra empresa ao cliente", async () => {
    const a = await ana();
    const b = await bianca();
    const unitB = (await b.get("/api/me")).json().units[0].id;
    const res = await a.post("/api/clients", { fullName: "Teste Unidade", phone: uniquePhone(), preferredUnitId: unitB });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields.preferredUnitId).toBeDefined();
  });

  it("a aplicação não altera nem apaga o histórico de auditoria", async () => {
    const a = await ana();
    const me = (await a.get("/api/me")).json();
    await expectDbError(
      withTenant({ tenantId: me.tenant.id, userId: me.user.id }, (tx) => tx.execute(sql`update audit_events set summary = 'x'`)),
      /permission denied/,
    );
    await expectDbError(
      withTenant({ tenantId: me.tenant.id, userId: me.user.id }, (tx) => tx.execute(sql`delete from audit_events`)),
      /permission denied/,
    );
  });

  it("a aplicação não altera plano nem situação da própria empresa", async () => {
    const a = await ana();
    const me = (await a.get("/api/me")).json();
    await expectDbError(
      withTenant({ tenantId: me.tenant.id, userId: me.user.id }, (tx) => tx.execute(sql`update tenants set status = 'active'`)),
      /permission denied/,
    );
    await expectDbError(
      withTenant({ tenantId: me.tenant.id, userId: me.user.id }, (tx) => tx.execute(sql`update tenant_modules set status = 'active'`)),
      /permission denied/,
    );
  });
});

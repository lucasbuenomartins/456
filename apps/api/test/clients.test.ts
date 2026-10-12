import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePools } from "../src/db/client";
import { carla, getApp, uniquePhone } from "./helpers";

afterAll(async () => {
  await (await getApp()).close();
  await closePools();
});

describe("Cadastro de clientes", () => {
  it("valida campos com mensagens claras", async () => {
    const c = await carla();
    const res = await c.post("/api/clients", { fullName: "Jo", phone: "123", email: "sem-arroba", cpf: "111.111.111-11" });
    expect(res.statusCode).toBe(422);
    const fields = res.json().error.fields;
    expect(fields.fullName).toMatch(/nome completo/);
    expect(fields.phone).toMatch(/DDD/);
    expect(fields.email).toMatch(/inválido/);
    expect(fields.cpf).toMatch(/CPF inválido/);
  });

  it("a mesma operação repetida (Idempotency-Key) cria um único cliente", async () => {
    const c = await carla();
    const key = randomUUID();
    const phone = uniquePhone();
    const body = { fullName: "Cliente Clique Duplo", phone };
    const [r1, r2] = await Promise.all([
      c.post("/api/clients", body, { "idempotency-key": key }),
      c.post("/api/clients", body, { "idempotency-key": key }),
    ]);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().id).toBe(r2.json().id);
    const list = (await c.get(`/api/clients?q=${phone}`)).json();
    expect(list.total).toBe(1);
  });

  it("avisa sobre possível duplicidade e permite confirmar", async () => {
    const c = await carla();
    const phone = uniquePhone();
    expect((await c.post("/api/clients", { fullName: "Maria Duplicada", phone })).statusCode).toBe(201);
    const dup = await c.post("/api/clients", { fullName: "Maria D. Outra", phone });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("possible_duplicate");
    expect(dup.json().error.details.candidates[0].matchedBy).toContain("phone");
    const confirmed = await c.post("/api/clients", { fullName: "Maria D. Outra", phone, confirmDuplicate: true });
    expect(confirmed.statusCode).toBe(201);
  });

  it("CPF repetido é bloqueado mesmo com confirmação", async () => {
    const c = await carla();
    await c.post("/api/clients", { fullName: "Dona do CPF", phone: uniquePhone(), cpf: "390.533.447-05" });
    const res = await c.post("/api/clients", { fullName: "Outra Pessoa", phone: uniquePhone(), cpf: "39053344705", confirmDuplicate: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("duplicate_cpf");
  });

  it("detecta edição simultânea (versão desatualizada)", async () => {
    const c = await carla();
    const created = (await c.post("/api/clients", { fullName: "Cliente Concorrência", phone: uniquePhone() })).json();
    const first = await c.put(`/api/clients/${created.id}`, { ...created, notes: "primeira edição" });
    expect(first.statusCode).toBe(200);
    expect(first.json().version).toBe(1);
    const stale = await c.put(`/api/clients/${created.id}`, { ...created, notes: "edição com versão antiga" });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("stale");
  });

  it("busca sem acento, por parte do nome e por telefone", async () => {
    const c = await carla();
    const phone = uniquePhone();
    await c.post("/api/clients", { fullName: "Conceição Araújo Teste", phone });
    expect((await c.get("/api/clients?q=conceicao%20araujo")).json().total).toBeGreaterThanOrEqual(1);
    expect((await c.get(`/api/clients?q=${encodeURIComponent(`(${phone.slice(0, 2)}) ${phone.slice(2, 7)}`)}`)).json().total).toBeGreaterThanOrEqual(1);
  });

  it("registra consentimentos de comunicação com histórico", async () => {
    const c = await carla();
    const created = (await c.post("/api/clients", { fullName: "Cliente Consentimento", phone: uniquePhone(), consents: { whatsapp: true, sms: false } })).json();
    let detail = (await c.get(`/api/clients/${created.id}`)).json();
    expect(detail.consents.find((x: { channel: string }) => x.channel === "whatsapp").granted).toBe(true);
    expect(detail.consents.find((x: { channel: string }) => x.channel === "whatsapp").recordedBy).toBe("Carla Mendes");
    await c.put(`/api/clients/${created.id}`, { ...created, consents: { whatsapp: false, sms: true } });
    detail = (await c.get(`/api/clients/${created.id}`)).json();
    expect(detail.consents.find((x: { channel: string }) => x.channel === "whatsapp").granted).toBe(false);
    expect(detail.consents.find((x: { channel: string }) => x.channel === "sms").granted).toBe(true);
    expect(detail.activity.some((a: { action: string }) => a.action === "client.updated")).toBe(true);
  });

  it("ações em lote: etiqueta e inativação", async () => {
    const c = await carla();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await c.post("/api/clients", { fullName: `Cliente Lote ${i}`, phone: uniquePhone() })).json().id);
    const tag = await c.post("/api/clients/bulk", { ids, action: "add_tag", tag: "Campanha" });
    expect(tag.json().updated).toBe(3);
    const again = await c.post("/api/clients/bulk", { ids, action: "add_tag", tag: "Campanha" });
    expect(again.json().updated).toBe(3);
    const detail = (await c.get(`/api/clients/${ids[0]}`)).json();
    expect(detail.client.tags.filter((t: string) => t === "Campanha")).toHaveLength(1);
    // Secretária não tem permissão de inativar
    expect((await c.post("/api/clients/bulk", { ids, action: "deactivate" })).statusCode).toBe(403);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { closePools } from "../src/db/client";
import { carla, getApp, login, loginAdmin, uniquePhone } from "./helpers";

afterAll(async () => {
  await (await getApp()).close();
  await closePools();
});

describe("Autenticação", () => {
  it("rotas da clínica exigem sessão", async () => {
    const app = await getApp();
    expect((await app.inject({ method: "GET", url: "/api/clients" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(401);
  });

  it("sessão da clínica não acessa o painel do SaaS e vice-versa", async () => {
    const c = await carla();
    expect((await c.get("/api/admin/tenants")).statusCode).toBe(401);
    const admin = await loginAdmin();
    expect((await admin.get("/api/clients")).statusCode).toBe(401);
  });

  it("mensagem de erro de login não revela se o e-mail existe", async () => {
    const app = await getApp();
    const r1 = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "naoexiste@x.com", password: "qualquercoisa" } });
    const r2 = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ana@bellapele.com.br", password: "errada123" } });
    expect(r1.statusCode).toBe(401);
    expect(r1.json().error.message).toBe(r2.json().error.message);
  });

  it("bloqueia requisições de escrita vindas de outra origem (CSRF)", async () => {
    const c = await carla();
    const app = await getApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: { cookie: c.cookie, origin: "https://site-malicioso.com" },
      payload: { fullName: "CSRF", phone: uniquePhone() },
    });
    expect(res.statusCode).toBe(403);
  });

  it("quem trabalha em duas clínicas escolhe a empresa após o login", async () => {
    const app = await getApp();
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "julia@bellapele.com.br", password: "Senha@123" } });
    expect(res.json().needsTenant).toBe(true);
    expect(res.json().tenants).toHaveLength(2);
    const julia = await login("julia@bellapele.com.br", "Estética Aurora");
    expect((await julia.get("/api/me")).json().tenant.name).toBe("Estética Aurora");
  });
});

describe("Permissões por função", () => {
  it("profissional consulta clientes, mas não cadastra", async () => {
    const julia = await login("julia@bellapele.com.br", "Clínica Bella Pele");
    expect((await julia.get("/api/clients")).statusCode).toBe(200);
    const res = await julia.post("/api/clients", { fullName: "Nova Cliente", phone: uniquePhone() });
    expect(res.statusCode).toBe(403);
  });

  it("comercial não exporta clientes nem vê CPF completo", async () => {
    const paula = await login("paula@bellapele.com.br");
    expect((await paula.get("/api/clients/export.csv")).statusCode).toBe(403);
    const c = await carla();
    const created = await c.post("/api/clients", { fullName: "Cliente Com Cpf", phone: uniquePhone(), cpf: "529.982.247-25" });
    expect(created.statusCode).toBe(201);
    expect(created.json().cpf).toBe("52998224725");
    const seen = (await paula.get(`/api/clients/${created.json().id}`)).json();
    expect(seen.client.cpf).toBe("***.982.***-**");
    expect(seen.client.cpfMasked).toBe(true);
  });

  it("comercial edita cliente sem apagar o CPF que não pode ver", async () => {
    const c = await carla();
    const created = (await c.post("/api/clients", { fullName: "Cliente Cpf Preservado", phone: uniquePhone(), cpf: "111.444.777-35" })).json();
    const paula = await login("paula@bellapele.com.br");
    const current = (await paula.get(`/api/clients/${created.id}`)).json().client;
    const res = await paula.put(`/api/clients/${created.id}`, { ...current, cpf: null, fullName: "Cliente Cpf Preservado Editada" });
    expect(res.statusCode).toBe(200);
    expect((await c.get(`/api/clients/${created.id}`)).json().client.cpf).toBe("11144477735");
  });

  it("secretária não gerencia equipe, funções nem histórico", async () => {
    const c = await carla();
    expect((await c.post("/api/settings/team/invites", {})).statusCode).toBe(403);
    expect((await c.post("/api/settings/roles", { name: "X" })).statusCode).toBe(403);
    expect((await c.get("/api/settings/audit")).statusCode).toBe(403);
    expect((await c.get("/api/settings/export")).statusCode).toBe(403);
  });

  it("secretária só troca para unidades em que tem função", async () => {
    const c = await carla();
    const ana = await login("ana@bellapele.com.br");
    const units = (await ana.get("/api/settings/units")).json().items as { id: string; name: string }[];
    const jardins = units.find((u) => u.name === "Unidade Jardins")!;
    const centro = units.find((u) => u.name === "Unidade Centro")!;
    expect((await c.post("/api/me/unit", { unitId: jardins.id })).statusCode).toBe(403);
    expect((await c.post("/api/me/unit", { unitId: centro.id })).statusCode).toBe(200);
    expect((await c.get("/api/me")).json().units.map((u: { name: string }) => u.name)).toEqual(["Unidade Centro"]);
  });

  it("gestor não concede permissões que não tem (dados de saúde)", async () => {
    const roberto = await login("roberto@bellapele.com.br");
    const res = await roberto.post("/api/settings/roles", { name: "Função Clínica", permissions: ["clinical.read"] });
    expect(res.statusCode).toBe(403);
    const ok = await roberto.post("/api/settings/roles", { name: "Recepção Jardins", permissions: ["clients.read"] });
    expect(ok.statusCode).toBe(201);
  });

  it("gestor não altera o acesso de quem tem mais permissões", async () => {
    const roberto = await login("roberto@bellapele.com.br");
    const team = (await roberto.get("/api/settings/team")).json();
    const julia = team.members.find((m: { name: string }) => m.name === "Dra. Júlia Castro");
    const owner = team.members.find((m: { isOwner: boolean }) => m.isOwner);
    expect((await roberto.post(`/api/settings/team/${julia.id}/disable`)).statusCode).toBe(403);
    expect((await roberto.post(`/api/settings/team/${owner.id}/disable`)).statusCode).toBe(403);
  });

  it("dados de saúde não ficam acessíveis à função comercial por padrão", async () => {
    const paula = await login("paula@bellapele.com.br");
    const me = (await paula.get("/api/me")).json();
    const all = [...me.permissions.tenantWide, ...Object.values(me.permissions.byUnit).flat()] as string[];
    expect(all.some((p) => p.startsWith("clinical."))).toBe(false);
  });
});

describe("Situação da conta e módulos", () => {
  it("conta suspensa fica somente leitura, mas permite consultar e registrar tours", async () => {
    const admin = await loginAdmin();
    const b = await login("bianca@aurora.com.br");
    const tenantId = (await b.get("/api/me")).json().tenant.id;
    expect((await admin.post(`/api/admin/tenants/${tenantId}/status`, { status: "suspended", reason: "Teste de suspensão" })).statusCode).toBe(200);

    const b2 = await login("bianca@aurora.com.br");
    expect((await b2.get("/api/me")).json().tenant.access).toBe("read_only");
    expect((await b2.get("/api/clients")).statusCode).toBe(200);
    const write = await b2.post("/api/clients", { fullName: "Bloqueada", phone: uniquePhone() });
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe("tenant_read_only");
    expect((await b2.post("/api/tours/screen.home/events", { version: 1, status: "seen" })).statusCode).toBe(200);

    expect((await admin.post(`/api/admin/tenants/${tenantId}/status`, { status: "active", reason: "Regularizado" })).statusCode).toBe(200);
    const b3 = await login("bianca@aurora.com.br");
    expect((await b3.post("/api/clients", { fullName: "Liberada Novamente", phone: uniquePhone() })).statusCode).toBe(201);
  });

  it("respeita o limite de unidades do plano no servidor", async () => {
    const b = await login("bianca@aurora.com.br");
    const res = await b.post("/api/settings/units", { name: "Segunda unidade" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("plan_limit");
  });

  it("valida dependências obrigatórias ao ativar e desativar módulos", async () => {
    const admin = await loginAdmin();
    const b = await login("bianca@aurora.com.br");
    const tenantId = (await b.get("/api/me")).json().tenant.id;
    // Portal exige Agenda: com Agenda ativa, pode ativar; depois Agenda não pode ser desativada.
    expect((await admin.put(`/api/admin/tenants/${tenantId}/modules/portal`, { status: "active", reason: "teste" })).statusCode).toBe(200);
    const off = await admin.put(`/api/admin/tenants/${tenantId}/modules/agenda`, { status: "read_only", reason: "teste" });
    expect(off.statusCode).toBe(409);
    expect(off.json().error.code).toBe("has_dependents");
    expect((await admin.put(`/api/admin/tenants/${tenantId}/modules/portal`, { status: "disabled", reason: "teste" })).statusCode).toBe(200);
    expect((await admin.put(`/api/admin/tenants/${tenantId}/modules/agenda`, { status: "read_only", reason: "teste" })).statusCode).toBe(200);
    const on = await admin.put(`/api/admin/tenants/${tenantId}/modules/portal`, { status: "active", reason: "teste" });
    expect(on.statusCode).toBe(409);
    expect(on.json().error.code).toBe("missing_dependency");
    expect((await admin.put(`/api/admin/tenants/${tenantId}/modules/agenda`, { status: "active", reason: "teste" })).statusCode).toBe(200);
  });

  it("módulo desativado some das permissões efetivas e o núcleo continua funcionando", async () => {
    const admin = await loginAdmin();
    const b = await login("bianca@aurora.com.br");
    const tenantId = (await b.get("/api/me")).json().tenant.id;
    await admin.put(`/api/admin/tenants/${tenantId}/modules/agenda`, { status: "disabled", reason: "teste" });
    const me = (await (await login("bianca@aurora.com.br")).get("/api/me")).json();
    expect(me.permissions.tenantWide.some((p: string) => p.startsWith("agenda."))).toBe(false);
    expect(me.permissions.tenantWide).toContain("clients.read");
    expect(me.modules.find((m: { key: string }) => m.key === "agenda").status).toBe("disabled");
    await admin.put(`/api/admin/tenants/${tenantId}/modules/agenda`, { status: "active", reason: "teste" });
  });

  it("mudança de plano mantém módulos removidos em somente leitura por um período", async () => {
    const admin = await loginAdmin();
    const plans = (await admin.get("/api/admin/plans")).json().items as { id: string; code: string }[];
    const created = await admin.post("/api/admin/tenants", {
      name: "Clínica Plano Teste",
      planId: plans.find((p) => p.code === "completo")!.id,
      trialDays: 0,
      owner: { name: "Dona Teste", email: "dona.plano@teste.com" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const res = await admin.post(`/api/admin/tenants/${id}/plan`, { planId: plans.find((p) => p.code === "essencial")!.id, reason: "Downgrade" });
    expect(res.statusCode).toBe(200);
    const detail = (await admin.get(`/api/admin/tenants/${id}`)).json();
    const crm = detail.modules.find((m: { key: string }) => m.key === "crm");
    expect(crm.status).toBe("read_only");
    expect(new Date(crm.readOnlyUntil).getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);
    expect(detail.modules.find((m: { key: string }) => m.key === "agenda").status).toBe("active");
  });
});

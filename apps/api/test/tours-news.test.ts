import { afterAll, describe, expect, it } from "vitest";
import { closePools } from "../src/db/client";
import { getApp, login, loginAdmin } from "./helpers";

afterAll(async () => {
  await (await getApp()).close();
  await closePools();
});

const stateOf = async (sess: Awaited<ReturnType<typeof login>>, tourId: string) =>
  ((await sess.get("/api/tours/state")).json().items as { tourId: string; status: string; timesShown: number; version: number }[]).find(
    (i) => i.tourId === tourId,
  );

describe("Tours guiados", () => {
  it("registra primeira exibição, reexibição, conclusão e dispensa por usuário", async () => {
    const roberto = await login("roberto@bellapele.com.br");
    expect(await stateOf(roberto, "screen.clients.list")).toBeUndefined();

    await roberto.post("/api/tours/screen.clients.list/events", { version: 1, status: "seen" });
    expect(await stateOf(roberto, "screen.clients.list")).toMatchObject({ status: "seen", timesShown: 1 });
    await roberto.post("/api/tours/screen.clients.list/events", { version: 1, status: "seen" });
    expect(await stateOf(roberto, "screen.clients.list")).toMatchObject({ status: "seen", timesShown: 2 });

    await roberto.post("/api/tours/screen.clients.list/events", { version: 1, status: "completed" });
    await roberto.post("/api/tours/screen.clients.list/events", { version: 1, status: "dismissed" });
    expect(await stateOf(roberto, "screen.clients.list")).toMatchObject({ status: "completed" });

    await roberto.post("/api/tours/screen.settings.team/events", { version: 1, status: "dismissed" });
    expect(await stateOf(roberto, "screen.settings.team")).toMatchObject({ status: "dismissed" });

    // Outro usuário não é afetado
    const paula = await login("paula@bellapele.com.br");
    expect(await stateOf(paula, "screen.clients.list")).toBeUndefined();
  });

  it("recusa tours inexistentes ou de outro ambiente", async () => {
    const roberto = await login("roberto@bellapele.com.br");
    expect((await roberto.post("/api/tours/screen.inexistente/events", { version: 1, status: "seen" })).statusCode).toBe(404);
    expect((await roberto.post("/api/tours/screen.admin.tenants/events", { version: 1, status: "seen" })).statusCode).toBe(404);
  });

  it("o painel do SaaS guarda o próprio progresso", async () => {
    const admin = await loginAdmin();
    await admin.post("/api/admin/tours/screen.admin.tenants/events", { version: 1, status: "completed" });
    const items = (await admin.get("/api/admin/tours/state")).json().items;
    expect(items.find((i: { tourId: string }) => i.tourId === "screen.admin.tenants").status).toBe("completed");
  });
});

describe("Novidades", () => {
  it("aparecem após o login até serem vistas ou dispensadas", async () => {
    const marcos = await login("marcos@bellapele.com.br");
    const pending = (await marcos.get("/api/news/pending")).json();
    expect(pending.items.length).toBeGreaterThan(0);
    const first = pending.items[0];
    await marcos.post(`/api/news/${first.id}/receipt`, { action: "dismissed" });
    const after = (await marcos.get("/api/news/pending")).json();
    expect(after.items.some((n: { id: string }) => n.id === first.id)).toBe(false);
    // continua disponível na central
    const central = (await marcos.get("/api/news")).json();
    expect(central.items.find((n: { id: string }) => n.id === first.id).state).toBe("dismissed");
  });

  it('"Ver depois" não reapresenta no mesmo dia e não rebaixa uma novidade aberta', async () => {
    const ana = await login("ana@bellapele.com.br");
    const pending = (await ana.get("/api/news/pending")).json();
    const item = pending.items[0];
    await ana.post(`/api/news/${item.id}/receipt`, { action: "later" });
    expect((await ana.get("/api/news/pending")).json().items.some((n: { id: string }) => n.id === item.id)).toBe(false);
    await ana.post(`/api/news/${item.id}/receipt`, { action: "opened" });
    await ana.post(`/api/news/${item.id}/receipt`, { action: "later" });
    const central = (await ana.get("/api/news")).json();
    expect(central.items.find((n: { id: string }) => n.id === item.id).state).toBe("opened");
  });

  it("respeita módulo e permissão do público-alvo", async () => {
    const admin = await loginAdmin();
    const created = await admin.post("/api/admin/news", {
      title: "Novidade do CRM",
      summary: "Teste de público",
      benefit: "Teste",
      version: "9.9",
      publishedAt: new Date(Date.now() - 1000).toISOString(),
      status: "published",
      module: "crm",
      requiredPermission: "crm.read",
      targetPath: null,
      tourId: null,
      showToExistingUsersOnly: false,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    // Bella Pele tem CRM; secretária tem crm.read
    const carla = await login("carla@bellapele.com.br");
    expect((await carla.get("/api/news")).json().items.some((n: { id: string }) => n.id === id)).toBe(true);
    // Profissional não tem crm.read
    const julia = await login("julia@bellapele.com.br", "Clínica Bella Pele");
    expect((await julia.get("/api/news")).json().items.some((n: { id: string }) => n.id === id)).toBe(false);
    // Aurora não contratou CRM
    const bianca = await login("bianca@aurora.com.br");
    expect((await bianca.get("/api/news")).json().items.some((n: { id: string }) => n.id === id)).toBe(false);
  });

  it("rascunhos e publicações futuras não aparecem", async () => {
    const admin = await loginAdmin();
    const base = { summary: "x x x", benefit: "y y y", version: "1", module: null, requiredPermission: null, targetPath: null, tourId: null, showToExistingUsersOnly: false };
    const draft = (await admin.post("/api/admin/news", { ...base, title: "Rascunho", status: "draft", publishedAt: null })).json();
    const future = (await admin.post("/api/admin/news", { ...base, title: "Futura", status: "published", publishedAt: new Date(Date.now() + 864e5).toISOString() })).json();
    const carla = await login("carla@bellapele.com.br");
    const ids = (await carla.get("/api/news")).json().items.map((n: { id: string }) => n.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(future.id);
  });

  it("valida que o tour da novidade pertence à tela de destino", async () => {
    const admin = await loginAdmin();
    const res = await admin.post("/api/admin/news", {
      title: "Tour errado",
      summary: "x x x",
      benefit: "y y y",
      version: "1",
      status: "draft",
      publishedAt: null,
      module: null,
      requiredPermission: null,
      targetPath: "/configuracoes/equipe",
      tourId: "update.clients.quick-search",
      showToExistingUsersOnly: true,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields.tourId).toBeDefined();
  });
});

describe("Convites", () => {
  it("convite cria acesso com a função escolhida e não pode ser reutilizado", async () => {
    const ana = await login("ana@bellapele.com.br");
    const roles = (await ana.get("/api/settings/roles")).json().items;
    const recep = roles.find((r: { templateKey: string }) => r.templateKey === "recepcao");
    const inv = await ana.post("/api/settings/team/invites", {
      name: "Nova Recepcionista",
      email: "nova.recepcao@bellapele.com.br",
      assignments: [{ roleId: recep.id, unitId: null }],
    });
    expect(inv.statusCode).toBe(201);
    const token = inv.json().inviteUrl.split("/convite/")[1];
    const app = await getApp();
    const info = await app.inject({ method: "GET", url: `/api/invites/${token}` });
    expect(info.json().tenantName).toBe("Clínica Bella Pele");
    const acc = await app.inject({ method: "POST", url: "/api/invites/accept", payload: { token, name: "Nova Recepcionista", password: "SenhaForte1" } });
    expect(acc.statusCode).toBe(200);
    const again = await app.inject({ method: "POST", url: "/api/invites/accept", payload: { token, name: "Outra Pessoa", password: "SenhaForte1" } });
    expect(again.statusCode).toBe(404);
    const login2 = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "nova.recepcao@bellapele.com.br", password: "SenhaForte1" } });
    expect(login2.statusCode).toBe(200);
  });
});

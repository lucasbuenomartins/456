import { expect, test } from "@playwright/test";
import { login, skipOnboarding } from "./helpers";

const phone = () => `(21) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0").replace(/^(\d{4})/, "$1-")}`;

test.describe("Clientes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "carla@bellapele.com.br");
    await skipOnboarding(page);
  });

  test("secretária cadastra cliente em poucos passos e é avisada de duplicidade", async ({ page }) => {
    const tel = phone();
    await page.goto("/clientes");
    await page.getByRole("link", { name: "Novo cliente" }).click();
    await page.getByLabel("Nome completo").fill("Luiza Fernandes Prado");
    await page.getByLabel("Telefone (com DDD)").fill(tel);
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Luiza Fernandes Prado");
    await expect(page.getByText("Cliente cadastrado.")).toBeVisible();

    // Mesmo telefone: aviso enquanto digita e confirmação explícita ao salvar.
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill("Luiza F. Prado Segunda");
    await page.getByLabel("Telefone (com DDD)").fill(tel);
    await expect(page.getByText("Possível cadastro repetido")).toBeVisible();
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    const dialog = page.getByRole("dialog", { name: "Este cliente já pode estar cadastrado" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "É outra pessoa, cadastrar" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Luiza F. Prado Segunda");
  });

  test("validação aparece junto aos campos", async ({ page }) => {
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill("Jo");
    await page.getByLabel("Telefone (com DDD)").fill("1234");
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByText("Informe o nome completo (pelo menos 3 letras).")).toBeVisible();
    await expect(page.getByText(/Telefone inválido/)).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toHaveAttribute("aria-invalid", "true");
  });

  test("rascunho é recuperado depois de trocar de tela", async ({ page }) => {
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill("Rascunho Recuperado Silva");
    await page.getByLabel("Telefone (com DDD)").fill(phone());
    await expect(page.getByText(/Rascunho guardado neste aparelho/)).toBeVisible();

    await page.getByRole("link", { name: "Início" }).first().click();
    await page.goto("/clientes/novo");
    await expect(page.getByText("Encontramos um rascunho não salvo")).toBeVisible();
    await page.getByRole("button", { name: "Recuperar" }).click();
    await expect(page.getByLabel("Nome completo")).toHaveValue("Rascunho Recuperado Silva");
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rascunho Recuperado Silva");

    // Após salvar, o rascunho é apagado.
    await page.goto("/clientes/novo");
    await page.waitForTimeout(500);
    await expect(page.getByText("Encontramos um rascunho não salvo")).toHaveCount(0);
  });

  test("sem conexão: avisa, mantém o rascunho e salva quando a conexão volta", async ({ page, context }) => {
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill("Cliente Sem Internet");
    await page.getByLabel("Telefone (com DDD)").fill(phone());
    await context.setOffline(true);
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByText(/Sem conexão. Seus dados estão guardados neste aparelho/)).toBeVisible();
    await expect(page.getByText(/Você está sem internet/)).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Salvar cliente" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cliente Sem Internet");
  });

  test("busca sem acentos, filtro persistente e ficha do cliente", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByLabel("Buscar clientes por nome ou telefone").fill("patricia");
    await expect(page.getByRole("row").filter({ hasText: "Patrícia" }).first()).toBeVisible();
    await page.getByLabel("Buscar clientes por nome ou telefone").fill("");
    await page.getByRole("radio", { name: "Inativos" }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Inativos" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Ativos", exact: true }).click();

    await page.getByRole("row").nth(1).click();
    await expect(page.getByRole("tab", { name: "Dados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ligar" })).toBeVisible();
    // Módulos contratados mas ainda não liberados aparecem como "Em breve", sem fingir funcionalidade.
    await expect(page.getByRole("tab", { name: /Agendamentos/ })).toBeVisible();
  });
});

test.describe("Permissões e módulos na interface", () => {
  test("profissional consulta clientes mas não cadastra", async ({ page }) => {
    await login(page, "julia@bellapele.com.br", "Clínica Bella Pele");
    await skipOnboarding(page);
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo cliente" })).toHaveCount(0);
    await page.goto("/clientes/novo");
    await expect(page.getByText("Você não tem acesso a esta área")).toBeVisible();
  });

  test("clínica sem o módulo não vê o menu e recebe explicação clara", async ({ page }) => {
    await login(page, "bianca@aurora.com.br");
    await skipOnboarding(page);
    await page.goto("/");
    const nav = page.getByRole("complementary", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: /Agenda/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Financeiro/ })).toHaveCount(0);
    await page.goto("/financeiro");
    await expect(page.getByText(/não está contratado/)).toBeVisible();
  });
});

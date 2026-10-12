import { expect, test } from "@playwright/test";
import { PASSWORD, login, skipOnboarding } from "./helpers";

test("painel do SaaS suspende e reativa uma empresa; a clínica fica somente leitura", async ({ page, browser }) => {
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill("admin@plataforma.local");
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page.getByRole("heading", { name: "Empresas clientes" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("row", { name: /Estética Aurora/ }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Suspender" }).click();
  await page.getByLabel("Motivo").fill("Teste automatizado de suspensão");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Suspensa").first()).toBeVisible();

  // A clínica entra em modo somente leitura.
  const clinic = await browser.newPage();
  await login(clinic, "bianca@aurora.com.br");
  await skipOnboarding(clinic);
  await clinic.goto("/clientes");
  await expect(clinic.getByText(/Conta suspensa: modo somente leitura/)).toBeVisible();
  await expect(clinic.getByRole("link", { name: "Novo cliente" })).toHaveCount(0);
  await clinic.close();

  await page.getByRole("button", { name: "Ativar" }).click();
  await page.getByLabel("Motivo").fill("Regularizado");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Ativa").first()).toBeVisible();
});

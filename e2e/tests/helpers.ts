import { TOURS } from "@clinica/shared";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Senha@123";

export async function login(page: Page, email: string, tenantName?: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
  if (page.url().includes("/escolher-clinica")) {
    await page.getByRole("button", { name: new RegExp(tenantName ?? ".") }).first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/escolher-clinica"));
  }
}

/** Marca todos os tours e novidades como dispensados para testar outras jornadas sem interrupções. */
export async function skipOnboarding(page: Page) {
  for (const t of TOURS.filter((x) => x.realm === "clinic")) {
    await page.request.post(`/api/tours/${t.id}/events`, { data: { version: t.version, status: "dismissed" } });
  }
  const news = await (await page.request.get("/api/news")).json();
  for (const n of news.items) await page.request.post(`/api/news/${n.id}/receipt`, { data: { action: "dismissed" } });
}

export const tourCard = (page: Page) => page.getByTestId("tour-card");

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "a página não deve ter rolagem horizontal").toBeLessThanOrEqual(1);
}

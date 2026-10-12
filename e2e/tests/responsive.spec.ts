import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, skipOnboarding, tourCard } from "./helpers";

test.describe("Uso em desktop, tablet e celular @responsivo", () => {
  test("jornadas principais sem rolagem horizontal e tour adaptado à tela", async ({ page }) => {
    await login(page, "roberto@bellapele.com.br");
    await skipOnboarding(page);
    // Reativa os tours para ver o do Início neste dispositivo.
    await page.request.post("/api/tours/reset", { data: {} });
    await page.goto("/");
    await expect(tourCard(page)).toBeVisible();
    const box = (await tourCard(page).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    // Percorre todos os passos (os que dependem de elementos ausentes são pulados sem erro).
    for (let i = 0; i < 10 && (await tourCard(page).count()) > 0; i++) {
      const next = tourCard(page).getByRole("button", { name: /Próximo|Concluir/ });
      await next.click();
      await page.waitForTimeout(250);
    }
    await expect(tourCard(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.goto("/clientes");
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Buscar clientes por nome ou telefone")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/clientes/novo");
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    // Botão principal com área de toque confortável.
    const save = (await page.getByRole("button", { name: "Salvar cliente" }).boundingBox())!;
    expect(save.height).toBeGreaterThanOrEqual(40);
    await expectNoHorizontalScroll(page);

    await page.goto("/configuracoes/equipe");
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Equipe", level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

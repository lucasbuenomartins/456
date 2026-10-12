import { expect, test } from "@playwright/test";
import { login, tourCard } from "./helpers";

test.describe("Tours de primeiro acesso e novidades", () => {
  test("novidades aparecem após o login sem sobreposição com o tour; tour abre uma vez e respeita a dispensa", async ({ page }) => {
    await login(page, "marcos@bellapele.com.br");

    // Novidades primeiro; nenhum tour enquanto a janela está aberta.
    const news = page.getByRole("dialog", { name: /novidade/i });
    await expect(news).toBeVisible();
    await expect(news.getByText("Busca rápida de clientes")).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(tourCard(page)).toHaveCount(0);

    await news.getByRole("button", { name: "Ver depois" }).click();
    await expect(news).toBeHidden();

    // Tour do Início aparece automaticamente no primeiro acesso.
    await expect(tourCard(page)).toBeVisible();
    await expect(tourCard(page).getByRole("heading")).toHaveText("Este é o seu Início");
    await tourCard(page).getByRole("button", { name: "Pular tour" }).click();
    await expect(tourCard(page)).toHaveCount(0);

    // Recarregar não reapresenta nem o tour dispensado nem as novidades.
    await page.reload();
    await expect(page.getByRole("heading", { name: /Marcos/ })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(tourCard(page)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /novidade/i })).toHaveCount(0);

    // Outra tela: o tour dela aparece no primeiro acesso.
    await page.getByRole("link", { name: "Clientes" }).first().click();
    await expect(tourCard(page)).toBeVisible();
    await expect(tourCard(page).getByRole("heading")).toHaveText("Clientes");
    // O passo "Cadastrar cliente" não aparece para quem não tem permissão (financeiro).
    const total = Number((await tourCard(page).getByText(/Passo 1 de \d+/).textContent())!.match(/de (\d+)/)![1]);
    const titles: string[] = [];
    for (let i = 0; i < total; i++) {
      titles.push((await tourCard(page).getByRole("heading").textContent())!);
      await tourCard(page).getByRole("button", { name: i === total - 1 ? "Concluir" : "Próximo" }).click();
    }
    expect(titles).not.toContain("Cadastrar cliente");
    await expect(tourCard(page)).toHaveCount(0);

    // O servidor registrou conclusão e dispensa.
    const state = await (await page.request.get("/api/tours/state")).json();
    const byId = Object.fromEntries(state.items.map((i: { tourId: string; status: string }) => [i.tourId, i.status]));
    expect(byId["screen.home"]).toBe("dismissed");
    expect(byId["screen.clients.list"]).toBe("completed");

    // Nova visita: não reabre. Pela Ajuda, reabre sob demanda.
    await page.goto("/clientes");
    await page.waitForTimeout(1500);
    await expect(tourCard(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Ajuda" }).click();
    await page.getByRole("menuitem", { name: "Ver tour desta tela" }).click();
    await expect(tourCard(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tourCard(page)).toHaveCount(0);
  });

  test('"Conhecer novidade" leva à tela e inicia o tour da novidade', async ({ page }) => {
    await login(page, "paula@bellapele.com.br");
    const news = page.getByRole("dialog", { name: /novidade/i });
    await expect(news).toBeVisible();
    await news.locator("li", { hasText: "Busca rápida de clientes" }).getByRole("button", { name: "Conhecer novidade" }).click();

    await expect(page).toHaveURL(/\/clientes$/);
    await expect(tourCard(page)).toBeVisible();
    await expect(tourCard(page).getByRole("heading")).toHaveText("Novo: busca rápida");
    // Apenas um tour por vez.
    await expect(tourCard(page)).toHaveCount(1);
    await tourCard(page).getByRole("button", { name: "Concluir" }).click();

    // A central guarda a novidade como aberta; a outra ficou para depois.
    await page.goto("/novidades");
    await expect(page.getByRole("heading", { name: "Novidades", level: 1 })).toBeVisible();
    const central = await (await page.request.get("/api/news")).json();
    const states = Object.fromEntries(central.items.map((n: { title: string; state: string }) => [n.title, n.state]));
    expect(states["Busca rápida de clientes"]).toBe("opened");

    // Próximo login: nada é reapresentado (aberta; a adiada respeita o intervalo).
    await page.context().clearCookies();
    await page.evaluate(() => sessionStorage.clear());
    await login(page, "paula@bellapele.com.br");
    await page.waitForTimeout(1500);
    await expect(page.getByRole("dialog", { name: /novidade/i })).toHaveCount(0);
  });
});

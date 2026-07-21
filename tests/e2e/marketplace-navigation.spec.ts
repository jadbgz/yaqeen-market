import { expect, test } from "@playwright/test";

test.describe("public marketplace navigation", () => {
  test("the home page leads to the published catalog", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("CHOISIR");
    await expect(page.getByRole("link", { name: "Yaqeen Market, accueil" })).toBeVisible();

    await page.getByRole("link", { name: "Voir tous les produits" }).click();

    await expect(page).toHaveURL(/\/catalogue$/);
    const finalHeading = page.getByRole("heading", { level: 1, name: /Votre prochain/ });
    const loadingState = page.getByRole("status");
    await expect(finalHeading.or(loadingState)).toBeVisible({ timeout: 2_000 });
    await expect(finalHeading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/0 résultat/).first()).toBeVisible();
  });

  test("catalog search preserves the requested query", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Rechercher dans le catalogue").fill("musc blanc");
    await page.getByRole("button", { name: "Rechercher" }).click();

    await expect(page).toHaveURL(/\/catalogue\?q=musc(?:\+|%20)blanc$/);
    await expect(page.getByText("Filtres actifs").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /“musc blanc”/ })).toBeVisible();
  });

  test("the cart icon opens a truthful empty-cart state", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /^Panier, 0 article$/ }).click();

    await expect(page).toHaveURL(/\/panier$/);
    await expect(page.getByRole("heading", { level: 2, name: "Votre panier est vide." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir le catalogue" })).toBeVisible();
  });
});

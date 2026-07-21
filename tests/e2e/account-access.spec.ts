import { expect, test } from "@playwright/test";

test("account access switches between login and registration", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Mon compte" }).click();
  const loginDialog = page.getByRole("dialog", { name: "Connexion" });
  await expect(loginDialog).toBeVisible();
  await expect(loginDialog.getByLabel("Adresse e-mail")).toBeVisible();
  await expect(loginDialog.getByLabel("Mot de passe")).toBeVisible();
  await expect(loginDialog.getByRole("link", { name: "Mot de passe oublié ?" })).toBeVisible();

  await loginDialog.getByRole("button", { name: "Créer un compte" }).click();
  const registrationDialog = page.getByRole("dialog", { name: "Créer un compte" });
  await expect(registrationDialog).toBeVisible();
  await expect(registrationDialog.getByLabel("Votre nom")).toBeVisible();
  await expect(registrationDialog.getByRole("link", { name: "Découvrir Yaqeen Seller" })).toBeVisible();

  await registrationDialog.getByRole("button", { name: "Fermer" }).click();
  await expect(registrationDialog).toBeHidden();
});

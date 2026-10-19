import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Secrétaire", exact: true }).click();
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByRole("link", { name: /Congés et permissions/ }).click();
  await expect(
    page.getByRole("heading", { name: "Congés et permissions", exact: true }),
  ).toBeVisible();
}
test("leave and permission lifecycle, filters, modes and isolated storage", async ({
  page,
}) => {
  await login(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("presence-qr.demo.v1"),
  );
  await expect(
    page.getByText(/Aucune absence autorisée enregistrée/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ajouter une absence autorisée" })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Employé", { exact: true }).selectOption("a1");
  await dialog.getByLabel("Date de début").fill("2026-09-20");
  await dialog.getByLabel("Date de fin").fill("2026-09-25");
  await dialog.getByLabel("Remarque (facultatif)").fill("Congé annuel");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(page.getByText("Congé autorisé", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ajouter une absence autorisée" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Employé", { exact: true }).selectOption("a2");
  await dialog.getByLabel("Type", { exact: true }).selectOption("PERMISSION");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-09-22");
  await dialog.getByLabel("Heure de début").fill("14:00");
  await dialog.getByLabel("Heure de fin").fill("13:00");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Heure de fin").fill("16:00");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Période du").fill("2026-09-22");
  await page.getByLabel("Au", { exact: true }).fill("2026-09-22");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Service", { exact: true }).selectOption("d1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await page.getByLabel("Employé", { exact: true }).selectOption("a2");
  await page.getByLabel("Type", { exact: true }).selectOption("PERMISSION");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator(".row-actions-trigger").first().click();
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Remarque (facultatif)")
    .fill("Rendez-vous");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Rendez-vous", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".row-actions-trigger").first().click();
  await page.getByRole("menuitem", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Conserver" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".row-actions-trigger").first().click();
  await page.getByRole("menuitem", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
  await expect(
    page.getByText("Enregistrement annulé", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Congés et permissions" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.screenshot({
    path: "test-results/authorized-absences-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    await page.evaluate(() => localStorage.getItem("presence-qr.demo.v1")),
  ).toBe(before);
});
test("save failure retains form input", async ({ page }) => {
  await login(page);
  await page
    .getByRole("button", { name: "Ajouter une absence autorisée" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Employé", { exact: true }).selectOption("a1");
  await dialog.getByLabel("Remarque (facultatif)").fill("À conserver");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "presence.authorized-absences.demo.v1")
        throw new Error("Storage unavailable");
      original.call(this, key, value);
    };
  });
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Impossible d’enregistrer",
  );
  await expect(dialog.getByLabel("Remarque (facultatif)")).toHaveValue(
    "À conserver",
  );
  await expect(
    dialog.getByRole("button", { name: "Enregistrer", exact: true }),
  ).toBeEnabled();
});
test("read failure and retry preserve data", async ({ page }) => {
  await login(page);
  await page.evaluate(() =>
    localStorage.setItem("presence.authorized-absences.demo.v1", "broken"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Impossible de charger");
  await page.evaluate(() =>
    localStorage.removeItem("presence.authorized-absences.demo.v1"),
  );
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByText(/Aucune absence autorisée enregistrée/),
  ).toBeVisible();
});

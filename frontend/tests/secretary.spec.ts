import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Secrétaire", exact: true }).click();
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-18T06:30:00Z") });
});

test("simple by default, persistent choice, shared data and unchanged permissions", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole("button", { name: "Simple", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("navigation", { name: "Actions courantes" })
      .getByRole("link"),
  ).toHaveCount(5);
  await expect(page.locator(".sidebar, .stats-grid")).toHaveCount(0);
  const before = await page.evaluate(() =>
    localStorage.getItem("presence-qr.demo.v1"),
  );
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Historique", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stats-grid")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("presence-qr.demo.v1")),
  ).toBe(before);
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await login(page);
  await expect(
    page.getByRole("button", { name: "Expert", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/users");
  await expect(
    page.getByRole("heading", { name: "Accès réservé" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await page.goto("/presences/ajouter");
  await expect(
    page.getByText("Une intervention du coordinateur est nécessaire"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("presence-qr.demo.v1")),
  ).toBe(before);
});

test("mode switches preserve the current scan and presence view", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: /Ouvrir le pointage/ }).click();
  await page.getByText("Besoin d’aide ?", { exact: true }).click();
  await page.getByLabel("Token du badge QR").fill("badge-in-progress");
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await expect(page.getByLabel("Token du badge QR")).toHaveValue(
    "badge-in-progress",
  );
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await expect(page.getByLabel("Token du badge QR")).toHaveValue(
    "badge-in-progress",
  );
  await page.goto("/presences");
  await expect(
    page.getByRole("columnheader", { name: "ARRIVÉE" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "SERVICE", exact: true }),
  ).toHaveCount(0);
  const count = await page.locator("tbody tr").count();
  await expect(page.locator("tbody tr").first().locator("td")).toHaveCount(5);
  await expect(page.locator(".badge svg").first()).toBeVisible();
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "SERVICE", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(count);
});

test("period report, invalid range, PDF and print layout", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Imprimer une fiche/ }).click();
  await page.getByLabel("Du", { exact: true }).fill("2026-09-16");
  await page.getByLabel("Au", { exact: true }).fill("2026-09-18");
  const expected = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("presence-qr.demo.v1")!);
    return db.attendance.filter(
      (p: { date: string }) => p.date >= "2026-09-16" && p.date <= "2026-09-18",
    ).length;
  });
  await expect(page.locator(".report-paper tbody tr")).toHaveCount(expected);
  await expect(
    page.getByRole("columnheader", { name: "Date", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".report-stats, .archives")).toHaveCount(0);
  await page.getByLabel("Au", { exact: true }).fill("2026-09-15");
  await expect(
    page.getByRole("button", { name: "Imprimer", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Au", { exact: true }).fill("2026-09-18");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger PDF" }).click();
  expect((await download).suggestedFilename()).toBe(
    "presence-2026-09-16-2026-09-18.pdf",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".secretary-back")).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".report-paper")).toBeVisible();
});

test("preference is isolated per account and does not affect coordinator", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("presence-qr.demo.v1")!);
    db.users.push({
      id: "other-secretary",
      name: "Autre Secrétaire",
      email: "autre@example.test",
      role: "SECRETARY",
      isActive: true,
    });
    localStorage.setItem("presence-qr.demo.v1", JSON.stringify(db));
    sessionStorage.setItem("presence-session", "other-secretary");
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Simple", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => sessionStorage.setItem("presence-session", "u1"));
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Mode d’utilisation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Personnel", exact: true }),
  ).toBeVisible();
});

test("simple scan guidance, help and camera errors", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await login(page);
  await page.getByRole("link", { name: /Ouvrir le pointage/ }).click();
  await expect(page.getByRole("heading", { name: "Présentez votre badge" })).toBeVisible();
  await expect(page.locator(".simple-scan-heading time")).toHaveText("09:30");
  await expect(page.getByRole("heading", { name: "Derniers scans" })).toHaveCount(0);
  await expect(page.getByLabel("Token du badge QR")).toBeHidden();
  await expect(page.locator(".simple-camera-state")).toContainText("Caméra arrêtée");
  await page.getByRole("button", { name: "Activer la caméra" }).click();
  await expect(page.getByRole("alert")).toContainText("Caméra indisponible");
  const help = page.getByText("Besoin d’aide ?", { exact: true });
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Token du badge QR")).toBeVisible();
  await page.getByLabel("Token du badge QR").fill("invalid-token");
  await page.getByRole("button", { name: "Valider le pointage" }).click();
  await expect(page.getByRole("alert")).toContainText("QR inconnu");
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pointage QR", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Derniers scans" })).toBeVisible();
});

test("mobile layout and keyboard selector", async ({ page }) => {
  await login(page);
  await page.clock.runFor(1500);
  await page.screenshot({
    path: "test-results/secretary-simple-desktop.png",
    fullPage: true,
  });
  const expert = page.getByRole("button", { name: "Expert", exact: true });
  await expert.focus();
  await page.keyboard.press("Enter");
  await expect(expert).toHaveAttribute("aria-pressed", "true");
  await page.clock.runFor(1500);
  await page.screenshot({
    path: "test-results/secretary-expert-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/presences", "/reports?period=1", "/scan"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
  await page.goto("/");
  await page.screenshot({
    path: "test-results/secretary-simple-mobile.png",
    fullPage: true,
  });
});

import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-18T06:30:00Z") });
});
const login = async (page: Page, secretary = false) => {
  await page.goto("/login");
  if (secretary)
    await page.getByRole("button", { name: "Secrétaire", exact: true }).click();
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
};
test("dashboard, all routes and responsive layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  for (const path of [
    "/agents",
    "/presences",
    "/absences",
    "/retards",
    "/history",
    "/reports",
    "/reports/daily",
    "/users",
    "/settings",
    "/profile",
    "/scan",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  for (const path of [
    "/",
    "/agents",
    "/settings",
    "/reports",
    "/scan",
    "/users",
    "/profile",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Personnel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personnel", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("agent creation, QR regeneration, filters and persistence", async ({
  page,
}) => {
  await login(page);
  await page.goto("/agents/new");
  await page.getByLabel("Prénom", { exact: true }).fill("Test");
  await page.getByLabel("Nom", { exact: true }).fill("Agent");
  await page.getByLabel("Poste").fill("Analyste");
  await page.getByLabel("Service", { exact: true }).selectOption("d1");
  await page.getByRole("button", { name: "Enregistrer l’agent" }).click();
  await expect(
    page.getByRole("heading", { name: "Test Agent", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Badge QR" }).click();
  await expect(page.locator(".qr-badge img")).toBeVisible();
  const first = await page.locator(".qr-badge img").getAttribute("src");
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.locator(".qr-badge img")).not.toHaveAttribute(
    "src",
    first!,
  );
  await page.goto("/agents");
  await page
    .getByRole("textbox", { name: "Rechercher un agent" })
    .fill("TEST-001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Personnel", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Rechercher un agent" })
    .fill("TEST-001");
  await expect(page.getByText("Test Agent")).toBeVisible();
});
test("correction chronology, audit, absence justification and PDF", async ({
  page,
}) => {
  await login(page);
  await page.goto("/presences");
  await page.locator("tbody .icon-button").first().click();
  await page.getByRole("button", { name: "Corriger", exact: true }).click();
  await page.getByLabel("Arrivée", { exact: true }).fill("09:00");
  await page.getByLabel("Départ", { exact: true }).fill("08:00");
  await page.getByLabel("Motif obligatoire").fill("Correction test");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("strictement postérieur");
  await page.getByLabel("Départ", { exact: true }).fill("17:00");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Correction de présence", { exact: true }),
  ).toBeVisible();
  await page.goto("/absences");
  await page.locator("tbody .icon-button").first().click();
  await page.getByRole("button", { name: "Justifier l’absence" }).click();
  await page
    .getByLabel("Motif obligatoire")
    .fill("Congé autorisé par la direction");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Justification d’absence", { exact: true }),
  ).toBeVisible();
  await page.goto("/reports");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByRole("button", { name: "Archiver la journée" }).click();
  await expect(
    page.getByRole("link", { name: "Ouvrir la fiche" }),
  ).toBeVisible();
});
test("secretary access control and invalid token", async ({ page }) => {
  await page.goto("/agents");
  await expect(page).toHaveURL(/login/);
  await login(page, true);
  await expect(
    page.getByRole("link", { name: "Personnel", exact: true }),
  ).toHaveCount(0);
  await page.goto("/agents/new");
  await expect(
    page.getByRole("heading", { name: "Accès réservé" }),
  ).toBeVisible();
  await page.goto("/presences");
  await page.locator("tbody .icon-button").first().click();
  await expect(
    page.getByRole("button", { name: "Corriger", exact: true }),
  ).toHaveCount(0);
  await page.goto("/scan");
  await page.getByText("Besoin d’aide ?", { exact: true }).click();
  await page.getByLabel("Token du badge QR").fill("invalid-token");
  await page.getByRole("button", { name: "Valider le pointage" }).click();
  await expect(page.getByRole("alert")).toContainText("QR inconnu");
});

test("arrival, duplicate rejection, departure and revoked badge", async ({
  page,
}) => {
  await login(page);
  const token = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("presence-qr.demo.v1")!);
    db.agents.push({
      id: "scan-test",
      firstName: "Scan",
      lastName: "Test",
      departmentId: "d1",
      position: "Test",
      isActive: true,
      token: "scan-test-token",
      createdAt: "2026-09-18",
    });
    localStorage.setItem("presence-qr.demo.v1", JSON.stringify(db));
    return "scan-test-token";
  });
  await page.goto("/scan");
  const scan = async () => {
    await page.getByLabel("Token du badge QR").fill(token);
    await page.getByRole("button", { name: "Valider le pointage" }).click();
  };
  await scan();
  await expect(page.getByRole("status")).toContainText("Arrivée de Scan Test");
  await page.clock.fastForward(3000);
  await scan();
  await expect(page.getByRole("alert")).toContainText("Pointage déjà reçu");
  await page.clock.fastForward(120000);
  await scan();
  await expect(page.getByRole("status")).toContainText("Départ de Scan Test");
  await page.clock.fastForward(3000);
  await scan();
  await expect(page.getByRole("alert")).toContainText("déjà enregistrés");
  await page.goto("/agents/scan-test/qr");
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await page.goto("/scan");
  await scan();
  await expect(page.getByRole("alert")).toContainText("QR inconnu ou révoqué");
});

test("camera denied shows an actionable error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await login(page);
  await page.goto("/scan");
  await page.getByRole("button", { name: "Activer la caméra" }).click();
  await expect(page.getByRole("alert")).toContainText("Caméra indisponible");
  await expect(page.getByLabel("Token du badge QR")).toBeVisible();
});

test("settings validation, account creation and frozen archive", async ({
  page,
}) => {
  await login(page);
  await page.goto("/reports");
  await page.getByRole("button", { name: "Archiver la journée" }).click();
  const archiveUrl = await page
    .getByRole("link", { name: "Ouvrir la fiche" })
    .getAttribute("href");
  await page.goto("/settings");
  await page
    .getByLabel("Nom de l’organisation")
    .fill("Organisation mise à jour");
  await page.getByLabel("Lundi end", { exact: true }).fill("07:00");
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(page.getByRole("alert")).toContainText("fin après le début");
  await page.getByLabel("Lundi end", { exact: true }).fill("17:00");
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Paramètres enregistrés",
  );
  await page.goto(archiveUrl!);
  await expect(
    page.getByRole("heading", { name: "Fiche archivée" }),
  ).toBeVisible();
  await expect(page.locator(".report-heading")).toContainText(
    "Direction administrative",
  );
  await expect(page.locator(".report-heading")).not.toContainText(
    "Organisation mise à jour",
  );
  await page.goto("/users/new");
  await page.getByLabel("Nom complet").fill("Compte Test");
  await page.getByLabel("Email", { exact: true }).fill("test@presence.local");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("TestPresence2026!");
  await page.getByRole("button", { name: "Créer l’utilisateur" }).click();
  await expect(page.getByText("test@presence.local")).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.getByLabel("Adresse email").fill("test@presence.local");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("TestPresence2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Bonjour Compte", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Utilisateurs", exact: true }),
  ).toHaveCount(0);
});

test("sidebar icon rail persists and keeps mobile labels", async ({ page }) => {
  await login(page);
  const toggle = page.getByRole("button", { name: "Replier la sidebar" });
  await expect(toggle.locator(".brand-logo")).toHaveCSS("opacity", "1");
  await toggle.hover();
  await expect(toggle.locator(".brand-logo")).toHaveCSS("opacity", "0");
  await expect(toggle.locator(".brand-toggle-icon")).toHaveCSS("opacity", "1");
  await page.mouse.move(500, 200);
  await toggle.focus();
  await expect(toggle.locator(".brand-toggle-icon")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Replier la sidebar" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".sidebar")).toHaveCSS("width", "76px");
  await expect(page.locator(".main-shell")).toHaveCSS("margin-left", "76px");
  await expect(page.locator(".sidebar .nav-label").first()).toBeHidden();
  await page.getByRole("link", { name: "Pointage QR", exact: true }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Déployer la sidebar" })).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar-toggle")).toBeHidden();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.locator(".sidebar .nav-label").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Déployer la sidebar" }).click();
  await expect(page.locator(".sidebar .nav-label").first()).toBeVisible();
  await expect(page.locator(".main-shell")).toHaveCSS("margin-left", "248px");
});

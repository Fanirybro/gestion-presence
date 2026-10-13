import { test, expect, type Page } from "@playwright/test";
import type { BadgeData } from "../src/services/badges";

async function mockBadges(page: Page) {
  let badge: BadgeData | null = null;
  let serial = 0;
  let scans = 0;
  const user = {
    id: "1",
    organisation_id: "7",
    nom: "Admin",
    prenom: "Alice",
    email: "alice@example.com",
    role: "COORDINATOR",
    actif: true,
  };
  const organisation = {
    id: "7",
    nom: "Équipe",
    adresse: null,
    fuseau_horaire: "Indian/Antananarivo",
    organisation_code: 123456789,
  };
  const agent = {
    id: "2",
    organisation_id: "7",
    nom: "Rakoto",
    prenom: "Jean",
    departement_id: "4",
    utilisateur_id: null,
    date_naissance: "1990-01-01",
    date_embauche: null,
    poste: "Assistant",
    actif: true,
    created_at: "2026-10-08T08:00:00Z",
  };
  const issue = () => {
    badge = {
      id: String(++serial),
      personnel_id: "2",
      token: `presence:v1:${serial}:${String(serial).repeat(64)}`,
    };
    return badge;
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    let result: unknown = {},
      status = 200;
    if (path === "/api/auth/me") result = { user };
    else if (path === "/api/organisations/me") result = { organisation };
    else if (path === "/api/parametres")
      result = { organisation, horaires: [] };
    else if (path === "/api/personnels") result = { personnel: [agent] };
    else if (path === "/api/personnels/membres") result = { membres: [] };
    else if (path === "/api/departements")
      result = {
        departements: [{ id: "4", nom: "Administration", actif: true }],
      };
    else if (path === "/api/badges/personnel/2") {
      if (
        method === "POST" &&
        (!badge || route.request().postDataJSON().regenerate)
      )
        issue();
      result = { badge };
    } else if (path === "/api/badges/personnel/2/revoke") {
      badge = null;
      result = { badge };
    } else if (path === "/api/badges/prepare")
      result = { badges: [badge ?? issue()] };
    else if (path === "/api/badges/scan") {
      await new Promise(resolve => setTimeout(resolve, 700));
      const body = route.request().postDataJSON();
      expect(body.cle_idempotence).toMatch(/^[a-f0-9-]{36}$/);
      if (body.token !== badge?.token) {
        status = 404;
        result = { message: "QR révoqué." };
      } else {
        scans++;
        result = {
          type: "ARRIVAL",
          message: "Arrivée de Jean Rakoto enregistrée à 08:30.",
        };
      }
    } else if (path === "/api/badges/events")
      result = {
        attendance: [],
        scans: scans
          ? [
              {
                id: "1",
                agentId: "2",
                type: "ARRIVAL",
                at: "2026-10-08T05:30:00Z",
              },
            ]
          : [],
      };
    else {
      status = 404;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { current: () => badge, scans: () => scans };
}
test("badges : accès, génération, téléchargement, rechargement et régénération", async ({
  page,
}) => {
  const state = await mockBadges(page);
  await page.goto("/agents");
  await page.getByRole("link", { name: "Badge QR", exact: true }).click();
  await page
    .getByRole("button", { name: "Générer le badge", exact: true })
    .click();
  const image = page.getByRole("img", {
    name: "QR de pointage de Jean Rakoto",
  });
  await expect(image).toBeVisible();
  const firstToken = state.current()!.token;
  const originalImage = await image.getAttribute("src");
  const download = page.waitForEvent("download");
  await page.locator("summary").filter({ hasText: "Télécharger le QR" }).click();
  await page.getByRole("button", { name: "86 × 54 mm · Paysage" }).click();
  expect((await download).suggestedFilename()).toBe("badge-2-cr80.pdf");
  await page.locator("summary").filter({ hasText: "Télécharger le QR" }).click();
  const a6 = page.waitForEvent("download");
  await page.getByRole("button", { name: "A6 · 105 × 148 mm" }).click();
  expect((await a6).suggestedFilename()).toBe("badge-2-a6.pdf");
  await page.getByRole("button", { name: "Fermer la notification" }).click();
  await page.locator(".qr-badge").screenshot({ path: "test-results/badge-redesign.png" });
  await page.reload();
  await expect(image).toBeVisible();
  expect(state.current()!.token).toBe(firstToken);
  await expect(image).toHaveAttribute("src", originalImage!);
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer" })
    .click();
  await expect(image).not.toHaveAttribute("src", originalImage!);
  expect(state.current()!.token).not.toBe(firstToken);
  await page.getByRole("button", { name: "Révoquer le badge" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer" })
    .click();
  await expect(
    page.getByRole("button", { name: "Générer le badge", exact: true }),
  ).toBeVisible();
  await expect(image).toHaveCount(0);
});
test("planche et scan : QR existant conservé, validation serveur et rejet d'un ancien code", async ({
  page,
}) => {
  const state = await mockBadges(page);
  await page.goto("/agents/badges");
  await page.getByRole("button", { name: "Préparer les badges" }).click();
  await expect(
    page.getByRole("img", { name: "QR de pointage de Jean Rakoto" }),
  ).toBeVisible();
  const token = state.current()!.token!;
  await expect(
    page.locator("summary").filter({ hasText: "Imprimer les 1 badges" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Préparer les badges" }).click();
  expect(state.current()!.token).toBe(token);
  await page.goto("/scan");
  await page.getByLabel("Token du badge QR").fill(token);
  await page.locator("form.manual-scan").getByRole("button").click();
  await expect(page.locator(".scan-feedback-overlay.processing")).toBeVisible();
  await expect(
    page.getByText("Arrivée de Jean Rakoto enregistrée à 08:30."),
  ).toBeVisible();
  await expect(page.locator(".scan-feedback-overlay")).toBeInViewport();
  expect(state.scans()).toBe(1);
  await expect(page.locator(".scan-feedback-overlay.success")).toBeVisible();
  await expect(page.locator(".scan-feedback-overlay")).toBeHidden({ timeout: 6500 });
  await page.goto("/agents/2/qr");
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer" })
    .click();
  await expect(
    page.getByText("Nouveau badge créé. L’ancien code est invalidé."),
  ).toBeVisible();
  await page.goto("/scan");
  await page.getByLabel("Token du badge QR").fill(token);
  await page.locator("form.manual-scan").getByRole("button").click();
  await expect(page.locator(".scan-feedback-overlay.processing")).toBeVisible();
  await expect(page.getByText("QR révoqué.", { exact: true })).toBeVisible();
  await expect(page.locator(".scan-feedback-overlay")).toBeInViewport();
  expect(state.scans()).toBe(1);
});

import { test, expect, type Page } from "@playwright/test";
async function mockApi(
  page: Page,
  initial: "none" | "unlinked" | "COORDINATOR" | "SECRETARY" = "none",
) {
  let user: Record<string, unknown> | null =
    initial === "none"
      ? null
      : {
          id: "1",
          nom: "Rakoto",
          prenom: "Alice",
          email: "alice@example.com",
          actif: true,
          role: initial === "unlinked" ? "SECRETARY" : initial,
          organisation_id: initial === "unlinked" ? null : "7",
        };
  const organisation = {
    id: "7",
    nom: "Équipe administrative",
    slug: "equipe",
    adresse: null,
    fuseau_horaire: "Indian/Antananarivo",
    organisation_code: 582394107,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      route.request().method() === "POST" ? route.request().postDataJSON() : {};
    let status = 200;
    let result: unknown;
    if (path === "/api/auth/me") {
      status = user ? 200 : 401;
      result = user ? { user } : { message: "Connexion requise." };
    } else if (path === "/api/auth/signup") {
      expect(body.role).toBeUndefined();
      expect(body.organisation_id).toBeUndefined();
      user = {
        ...body,
        password: undefined,
        id: "1",
        role: "SECRETARY",
        actif: true,
        organisation_id: null,
      };
      result = { user };
      status = 201;
    } else if (path === "/api/auth/login") {
      if (body.password === "wrong-password") {
        status = 401;
        result = { message: "Identifiants incorrects." };
      } else {
        user = {
          id: "1",
          nom: "Rakoto",
          prenom: "Alice",
          email: body.email,
          actif: true,
          role: body.email.startsWith("secretary")
            ? "SECRETARY"
            : "COORDINATOR",
          organisation_id: "7",
        };
        result = { user };
      }
    } else if (path === "/api/organisations/me") result = { organisation };
    else if (path === "/api/organisations") {
      organisation.nom = body.nom;
      user = { ...user, organisation_id: "7", role: "COORDINATOR" };
      result = { organisation, user };
      status = 201;
    } else if (path === "/api/organisations/join") {
      expect(body.role).toBeUndefined();
      if (Number(body.organisation_code) !== organisation.organisation_code) {
        status = 404;
        result = { message: "Code introuvable ou organisation indisponible." };
      } else {
        user = { ...user, organisation_id: "7", role: "SECRETARY" };
        result = { organisation, user };
      }
    } else if (path === "/api/parametres") {
      result = { organisation, horaires: [] };
    } else if (path === "/api/personnels") {
      result = { personnel: [] };
    } else if (path === "/api/departements") {
      result = { departements: [] };
    } else if (path === "/api/auth/logout") {
      user = null;
      status = 204;
    } else {
      status = 404;
      result = {};
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: status === 204 ? undefined : JSON.stringify(result),
    });
  });
}

test("inscription puis création, code et persistance de la session", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/signup");
  await page.getByLabel("Prénom", { exact: true }).fill("Alice");
  await page.getByLabel("Nom", { exact: true }).fill("Rakoto");
  await page.getByLabel("Adresse email").fill("alice@example.com");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("a-valid-password-123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/organisation$/);
  await page
    .getByRole("button", { name: "Créer Je crée notre espace" })
    .click();
  await page.getByLabel("Nom de l’organisation").fill("Notre équipe");
  await page.getByRole("button", { name: "Créer mon organisation" }).click();
  await expect(page.getByText("582394107")).toBeVisible();
  await page.getByRole("link", { name: "Accéder à mon espace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await expect(page.getByText("582394107")).toBeVisible();
  await page.reload();
  await expect(page.getByText("582394107")).toBeVisible();
});

test("compte sans organisation, mauvais code puis adhésion secrétaire", async ({
  page,
}) => {
  await mockApi(page, "unlinked");
  await page.goto("/agents");
  await expect(page).toHaveURL(/organisation$/);
  await page.getByLabel("Code d’organisation").fill("999999999");
  await page.getByRole("button", { name: "Rejoindre l’organisation" }).click();
  await expect(page.getByRole("alert")).toContainText("Code introuvable");
  await page.getByLabel("Code d’organisation").fill("582394107");
  await page.getByRole("button", { name: "Rejoindre l’organisation" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/403$/);
});

test("connexion sans sélection du rôle, erreurs et déconnexion", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Coordinateur", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Adresse email").fill("secretary@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Identifiants incorrects",
  );
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("a-valid-password-123");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("button", { name: /déconnex|déconnecter/i })
    .first()
    .click();
  await expect(page).toHaveURL(/login$/);
});

test("interface mobile sans débordement et captures", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Heureux de vous retrouver." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/auth-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/signup");
  await expect(
    page.getByRole("button", { name: "Créer mon compte" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    fullPage: true,
  });
});

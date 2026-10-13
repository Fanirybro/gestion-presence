import { test, expect, type Page } from "@playwright/test";
import type { Personnel, Departement } from "../src/services/personnel";

async function mockPersonnel(
  page: Page,
  options: {
    emptyDepartments?: boolean;
    failSave?: boolean;
    failLoad?: boolean;
  } = {},
) {
  const people: Personnel[] = [];
  const departments: Departement[] = options.emptyDepartments
    ? []
    : [{ id: "4", nom: "Administration", actif: true }];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = ["POST", "PATCH"].includes(method)
      ? route.request().postDataJSON()
      : {};
    let status = 200;
    let result: unknown = {};
    if (method !== "GET") writes.push({ path, body });
    if (path === "/api/auth/me")
      result = {
        user: {
          id: "1",
          organisation_id: "7",
          nom: "Admin",
          prenom: "Alice",
          email: "admin@example.com",
          role: "COORDINATOR",
          actif: true,
        },
      };
    else if (path === "/api/organisations/me")
      result = {
        organisation: {
          id: "7",
          nom: "Équipe",
          slug: "equipe",
          organisation_code: 123456789,
          fuseau_horaire: "Indian/Antananarivo",
          adresse: null,
        },
      };
    else if (path === "/api/parametres")
      result = { organisation: { id: "7", nom: "Équipe", adresse: null, fuseau_horaire: "Indian/Antananarivo", organisation_code: 123456789 }, horaires: [] };
    else if (path === "/api/personnels/membres")
      result = {
        membres: [{ id: "6", nom: "Membre", prenom: "Jean", actif: true }],
      };
    else if (path === "/api/personnels" && method === "GET") {
      status = options.failLoad ? 500 : 200;
      result = options.failLoad
        ? { message: "Base indisponible." }
        : { personnel: people };
    } else if (path === "/api/personnels" && method === "POST") {
      status = options.failSave ? 409 : 201;
      if (options.failSave)
        result = { message: "Enregistrement indisponible." };
      else {
        const personnel = {
          ...body,
          id: "2",
          organisation_id: "7",
          created_at: "2026-10-05T08:00:00.000Z",
          updated_at: "2026-10-05T08:00:00.000Z",
        } as Personnel;
        people.push(personnel);
        result = { personnel };
      }
    } else if (path === "/api/personnels/2" && method === "PATCH") {
      Object.assign(people[0], body);
      result = { personnel: people[0] };
    } else if (path === "/api/departements" && method === "GET")
      result = { departements: departments };
    else if (path === "/api/departements" && method === "POST") {
      const departement = { id: "4", nom: body.nom, actif: true };
      departments.push(departement);
      result = { departement };
      status = 201;
    } else if (path === "/api/departements/4" && method === "PATCH") {
      Object.assign(departments[0], body);
      result = { departement: departments[0] };
    } else {
      status = 404;
      result = { message: "Introuvable" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { people, writes, options };
}

async function fillAgent(page: Page) {
  await page.getByLabel("Prénom", { exact: true }).fill("Jean");
  await page.getByLabel("Nom", { exact: true }).fill("Rakoto");
  await page
    .getByLabel("Date de naissance", { exact: true })
    .fill("1995-04-12");
  await page.getByLabel("Département", { exact: true }).selectOption("4");
}

test("département puis personnel : création, rechargement, modification et désactivation", async ({
  page,
}) => {
  const data = await mockPersonnel(page, { emptyDepartments: true });
  await page.goto("/agents/new");
  await expect(
    page.getByText("Créez d’abord un département", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enregistrer l’agent" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Gérer les départements" }).click();
  await page
    .getByRole("textbox", { name: "Nom du département" })
    .fill("Administration");
  await page.getByRole("button", { name: "Ajouter un département" }).click();
  await expect(page.locator(".department-list")).toContainText(
    "Administration",
  );
  await page.goto("/agents/new");
  await fillAgent(page);
  await page.getByLabel("Date d’embauche (facultative)").fill("2020-01-15");
  await page
    .getByLabel("Compte utilisateur lié (facultatif)")
    .selectOption("6");
  await page.getByRole("button", { name: "Enregistrer l’agent" }).click();
  await expect(page).toHaveURL(/\/agents\/2$/);
  await expect(
    page.getByRole("heading", { name: "Jean Rakoto" }),
  ).toBeVisible();
  expect(data.people[0].date_naissance).toBe("1995-04-12");
  expect(data.people[0].utilisateur_id).toBe("6");
  expect(
    data.writes.find((w) => w.path === "/api/personnels")?.body.organisation_id,
  ).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Jean Rakoto" }),
  ).toBeVisible();
  await expect(page.locator(".detail-strip")).toContainText("1995");
  await expect(page.locator(".detail-strip")).toContainText("2026");
  await page.getByRole("link", { name: "Modifier", exact: true }).click();
  await expect(page.getByLabel("Date de naissance")).toHaveValue("1995-04-12");
  await page.getByLabel("Poste (facultatif)").fill("Responsable RH");
  await page.getByRole("button", { name: "Enregistrer l’agent" }).click();
  await expect(page).toHaveURL(/\/agents\/2$/);
  await expect(page.locator(".page-heading").getByText("Responsable RH", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Désactiver", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer" })
    .click();
  await expect(page.getByRole("button", { name: "Réactiver" })).toBeVisible();
  expect(data.people[0].actif).toBe(false);
  await page.goto("/agents");
  await page.getByLabel("Statut de l’agent").selectOption("false");
  await expect(page.getByText("Jean Rakoto", { exact: true })).toBeVisible();
  await page.getByLabel("Rechercher un agent").fill("inconnu");
  await expect(
    page.getByText("Aucun agent ne correspond aux filtres"),
  ).toBeVisible();
});

test("un refus serveur conserve le formulaire et permet de réessayer", async ({
  page,
}) => {
  const data = await mockPersonnel(page, { failSave: true });
  await page.goto("/agents/new");
  await fillAgent(page);
  await page.getByRole("button", { name: "Enregistrer l’agent" }).click();
  await expect(page.locator(".form-error")).toContainText(
    "Enregistrement indisponible.",
  );
  await expect(page).toHaveURL(/\/agents\/new$/);
  data.options.failSave = false;
  await page.getByRole("button", { name: "Enregistrer l’agent" }).click();
  await expect(page).toHaveURL(/\/agents\/2$/);
});

test("erreur de chargement affichée et nouvelle tentative", async ({
  page,
}) => {
  const data = await mockPersonnel(page, { failLoad: true });
  await page.goto("/agents");
  await expect(
    page.getByRole("heading", { name: "Personnel indisponible" }),
  ).toBeVisible();
  await expect(page.getByText("Base indisponible.")).toBeVisible();
  data.options.failLoad = false;
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { name: "Personnel", exact: true }),
  ).toBeVisible();
});

import { test, expect } from "@playwright/test";
test("paramètres sauvegardés sur le serveur, relus et erreurs conservant le formulaire", async ({
  page,
}) => {
  let settings = {
    organisation: {
      id: "7",
      nom: "Équipe",
      adresse: null as string | null,
      fuseau_horaire: "Indian/Antananarivo",
      organisation_code: 123456789,
    },
    horaires: [] as Record<string, unknown>[],
  };
  let fail = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result: unknown = {},
      status = 200;
    if (path === "/api/auth/me")
      result = {
        user: {
          id: "1",
          organisation_id: "7",
          nom: "Admin",
          prenom: "Alice",
          email: "alice@example.com",
          actif: true,
          role: "COORDINATOR",
        },
      };
    else if (path === "/api/organisations/me")
      result = { organisation: settings.organisation };
    else if (path === "/api/personnels") result = { personnel: [] };
    else if (path === "/api/departements") result = { departements: [] };
    else if (path === "/api/parametres") {
      if (route.request().method() === "PATCH") {
        if (fail) {
          status = 500;
          result = { message: "Enregistrement indisponible." };
        } else {
          const data = route.request().postDataJSON();
          expect(data.organisation_id).toBeUndefined();
          expect(data.horaires).toHaveLength(21);
          expect(data.horaires[0].heure_debut).toBeNull();
          settings = {
            organisation: {
              ...settings.organisation,
              nom: data.nom,
              adresse: data.adresse,
            },
            horaires: data.horaires,
          };
          result = settings;
        }
      } else result = settings;
    } else status = 404;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto("/settings");
  await expect(
    page.getByText(/Les horaires ne sont pas encore configurés/),
  ).toBeVisible();
  await page
    .getByLabel("Nom de l’organisation", { exact: true })
    .fill("Nouvelle équipe");
  await page.getByLabel("Lundi Matin travaillé").check();
  await page.getByLabel("Lundi Matin start", { exact: true }).fill("09:00");
  await page.getByLabel("Lundi Matin tolerance", { exact: true }).fill("20");
  await page.getByLabel("Lundi Après-midi travaillé", { exact: true }).check();
  await page
    .getByLabel("Lundi Après-midi start", { exact: true })
    .fill("13:00");
  await page.getByLabel("Lundi Soir travaillé", { exact: true }).check();
  await page.getByLabel("Lundi Soir fin le lendemain", { exact: true }).check();
  await page.getByLabel("Lundi Soir end", { exact: true }).fill("02:00");
  await page.getByLabel("Lundi Soir cutoff", { exact: true }).fill("00:30");
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(
    page.locator(".toast"),
  ).toBeVisible();
  await expect(page.locator(".toast")).toHaveCSS("opacity", "1");
  await expect(page.locator(".toast")).toBeInViewport();
  await expect(page.locator(".toast")).toContainText("Paramètres enregistrés.");
  await expect(page.locator(".toast")).toBeHidden({ timeout: 6500 });
  await page.reload();
  await expect(
    page.getByLabel("Nom de l’organisation", { exact: true }),
  ).toHaveValue("Nouvelle équipe");
  await expect(
    page.getByLabel("Lundi Matin start", { exact: true }),
  ).toHaveValue("09:00");
  await expect(
    page.getByLabel("Lundi Matin tolerance", { exact: true }),
  ).toHaveValue("20");
  await expect(page.getByLabel("Dimanche Matin travaillé")).not.toBeChecked();
  await expect(
    page.getByLabel("Lundi Après-midi travaillé", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Lundi Soir fin le lendemain", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Lundi Soir end", { exact: true })).toHaveValue(
    "02:00",
  );
  await expect(
    page.getByLabel("Lundi Soir cutoff", { exact: true }),
  ).toHaveValue("00:30");
  const evening = settings.horaires.find(
    (h) => h.jour_semaine === 1 && h.periode === "SOIR",
  );
  expect(evening?.fin_jour_suivant).toBe(true);
  // Chevauchement avec l'après-midi : le formulaire bloque l'envoi.
  await page.getByLabel("Lundi Matin end", { exact: true }).fill("14:00");
  await page.getByLabel("Lundi Matin cutoff", { exact: true }).fill("10:00");
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(page.locator(".toast[role=alert]")).toContainText("sans se chevaucher");
  await page.getByLabel("Lundi Matin end", { exact: true }).fill("12:00");
  fail = true;
  await page.getByLabel("Adresse", { exact: true }).fill("Nouvelle adresse");
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(page.locator(".toast[role=alert]")).toContainText(
    "Enregistrement indisponible.",
  );
  await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue(
    "Nouvelle adresse",
  );
  expect(settings.organisation.adresse).toBeNull();
  fail = false;
  await page
    .getByRole("button", { name: "Enregistrer les paramètres" })
    .click();
  await expect(
    page.locator(".toast"),
  ).toBeVisible();
  expect(settings.organisation.adresse).toBe("Nouvelle adresse");
});

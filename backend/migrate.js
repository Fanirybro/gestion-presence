import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
try { loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); } catch (error) { if (error.code !== "ENOENT") throw error; }
const { default: pool } = await import("./config/database.js");
try {
  let file = "20261002_organisation_members.sql";
  if (process.argv[2] && !process.argv[2].startsWith("--")) {
    file = process.argv[2];
  } else if (process.argv.includes("--custom-fields")) {
    file = "20261029_custom_fields.sql";
  } else if (process.argv.includes("--absences-organisation")) {
    file = "20261009_absences_organisation.sql";
  } else if (process.argv.includes("--remove-matricule")) {
    file = "20261009_remove_personnel_matricule.sql";
  } else if (process.argv.includes("--pointages-organisation")) {
    file = "20261008_pointages_organisation.sql";
  } else if (process.argv.includes("--horaires-creneaux")) {
    file = "20261005_horaires_creneaux.sql";
  }
  await pool.query(await readFile(new URL(`../database/migrations/${file}`, import.meta.url), "utf8"));
  console.log(`Migration appliquée : ${file}`);
} catch (error) { console.error("Migration échouée :", error.message || (error.code ?? "erreur")); process.exitCode = 1; }
finally { await pool.end(); }

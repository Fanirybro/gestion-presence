import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
try { loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); } catch (error) { if (error.code !== "ENOENT") throw error; }
const { default: pool } = await import("./config/database.js");
try {
  const file = process.argv.includes("--absences-organisation")
    ? "20261009_absences_organisation.sql" : process.argv.includes("--remove-matricule")
    ? "20261009_remove_personnel_matricule.sql" : process.argv.includes("--pointages-organisation")
    ? "20261008_pointages_organisation.sql" : process.argv.includes("--horaires-creneaux")
    ? "20261005_horaires_creneaux.sql" : "20261002_organisation_members.sql";
  await pool.query(await readFile(new URL(`../database/migrations/${file}`, import.meta.url), "utf8"));
  console.log(`Migration appliquée : ${file}`);
} catch (error) { console.error("Migration échouée :", error.code ?? "erreur de connexion ou de schéma"); process.exitCode = 1; }
finally { await pool.end(); }

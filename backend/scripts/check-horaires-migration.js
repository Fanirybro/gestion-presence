import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";

loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 20000 });
try {
  await client.connect();
  await client.query("BEGIN");
  // Table temporaire privée à cette connexion : aucune donnée métier modifiée.
  await client.query(`CREATE TEMP TABLE horaires_travail (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL, jour_semaine smallint NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
    jour_travaille boolean NOT NULL DEFAULT true, heure_debut time, heure_fin time, heure_limite_absence time,
    tolerance_retard_minutes smallint NOT NULL DEFAULT 0 CHECK (tolerance_retard_minutes >= 0),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, jour_semaine),
    CHECK ((NOT jour_travaille AND heure_debut IS NULL AND heure_fin IS NULL AND heure_limite_absence IS NULL)
      OR (jour_travaille AND heure_fin > heure_debut AND heure_limite_absence BETWEEN heure_debut AND heure_fin))
  ) ON COMMIT DROP`);
  await client.query("INSERT INTO horaires_travail (organisation_id, jour_semaine, heure_debut, heure_fin, heure_limite_absence, tolerance_retard_minutes) VALUES (1, 1, '08:00', '17:00', '10:00', 15)");
  const source = await readFile(new URL("../../database/migrations/20261005_horaires_creneaux.sql", import.meta.url), "utf8");
  const sql = source.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  await client.query(sql);
  await client.query(sql);
  const { rows } = await client.query("SELECT periode, jour_travaille, heure_debut::text, heure_fin::text FROM horaires_travail ORDER BY periode");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find(r => r.periode === "MATIN"), { periode: "MATIN", jour_travaille: true, heure_debut: "08:00:00", heure_fin: "17:00:00" });
  assert.equal(rows.filter(r => r.jour_travaille).length, 1);
  console.log("OK : migration répétable, ancien horaire conservé, deux créneaux inactifs ajoutés.");
  await client.query("UPDATE horaires_travail SET jour_travaille = true, heure_debut = '18:00', heure_fin = '02:00', heure_limite_absence = '00:30', fin_jour_suivant = true WHERE periode = 'SOIR'");
  console.log("OK : soir 18:00–02:00 et seuil 00:30 acceptés par PostgreSQL.");
  await client.query("SAVEPOINT invalid_schedule");
  await assert.rejects(client.query("UPDATE horaires_travail SET heure_fin = '07:00', fin_jour_suivant = true WHERE periode = 'MATIN'"), { code: "23514" });
  await client.query("ROLLBACK TO SAVEPOINT invalid_schedule");
  console.log("OK : fin le lendemain refusée pour le matin.");
} catch (error) {
  console.error("Échec du test de migration :", error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}

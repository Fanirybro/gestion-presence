import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 20000 });
try {
  await client.connect(); await client.query("BEGIN");
  // Toutes les tables sont temporaires et masquent leurs homonymes publics.
  await client.query(`CREATE TEMP TABLE organisations (id bigint PRIMARY KEY) ON COMMIT DROP;
    CREATE TEMP TABLE personnel (id bigint PRIMARY KEY, organisation_id bigint, UNIQUE(organisation_id,id)) ON COMMIT DROP;
    CREATE TEMP TABLE organisation_members (organisation_id bigint, user_id bigint, UNIQUE(organisation_id,user_id)) ON COMMIT DROP;
    CREATE TEMP TABLE badges (id bigint PRIMARY KEY, organisation_id bigint, personnel_id bigint, UNIQUE(organisation_id,personnel_id,id)) ON COMMIT DROP;
    CREATE TEMP TABLE pointages (id bigint PRIMARY KEY, personnel_id bigint, badge_id bigint, saisi_par bigint, horodatage timestamptz DEFAULT now(), cle_idempotence uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
    INSERT INTO organisations VALUES (7); INSERT INTO personnel VALUES (2,7); INSERT INTO organisation_members VALUES (7,1);
    INSERT INTO badges VALUES (3,7,2); INSERT INTO pointages (id,personnel_id,badge_id,saisi_par) VALUES (1,2,3,1)`);
  const sql = (await readFile(new URL("../../database/migrations/20261008_pointages_organisation.sql", import.meta.url), "utf8")).replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  await client.query(sql); await client.query(sql);
  const { rows } = await client.query("SELECT id, organisation_id FROM pointages");
  assert.deepEqual(rows, [{ id: "1", organisation_id: "7" }]);
  await client.query("SAVEPOINT invalid_org");
  await assert.rejects(client.query("UPDATE pointages SET organisation_id = 8"), { code: "23503" });
  await client.query("ROLLBACK TO SAVEPOINT invalid_org");
  console.log("OK : pointage conservé, organisation retrouvée, migration répétable et rattachement incohérent refusé.");
} catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
finally { await client.query("ROLLBACK").catch(() => {}); await client.end(); }

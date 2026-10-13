import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
try {
  await client.connect();
  const { rows } = await client.query("SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('badges','pointages','presences_journalieres') ORDER BY tablename,indexname");
  for (const table of ["badges", "pointages", "presences_journalieres"]) {
    if (!rows.some(r => r.tablename === table)) throw new Error(`Table ou index manquant : ${table}`);
  }
  console.log(JSON.stringify(rows, null, 2));
  console.log(JSON.stringify((await client.query("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('pointages','presences_journalieres') ORDER BY table_name,ordinal_position")).rows));
  console.log(JSON.stringify((await client.query("SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('pointages'::regclass, 'presences_journalieres'::regclass) ORDER BY conrelid, conname")).rows));
} catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
finally { await client.end(); }

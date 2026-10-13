import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
import pg from "pg";
import { createTrace } from "./utils/diagnostics.js";

const trace = createTrace("diagnostic");
let failures = 0;
async function check(label, action) {
  try { return await trace.step(label, action); }
  catch { failures++; return undefined; }
}
await check("Load backend environment", () => {
  try { loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
});
const url = await check("Validate DATABASE_URL", () => {
  const value = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(value.protocol) || !value.hostname) {
    throw Object.assign(new Error(), { code: "INVALID_DATABASE_URL" });
  }
  trace.result(`Database host: ${value.hostname}; port: ${value.port || "5432"}`);
  return value;
});
await check("Validate session secret", () => {
  if ((process.env.SESSION_SECRET?.length ?? 0) < 32) {
    throw Object.assign(new Error(), { code: "SESSION_SECRET_TOO_SHORT" });
  }
});
if (url) {
  await check("Resolve database DNS", async () => {
    const addresses = await lookup(url.hostname, { all: true });
    trace.result(`DNS returned ${addresses.length} address(es)`);
  });
  await check("Connect to database TCP port (10-second limit)", () => new Promise((resolve, reject) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port || 5432) });
    socket.setTimeout(10000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(Object.assign(new Error(), { code: "TCP_TIMEOUT" }));
    });
  }));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  client.on("error", error => { trace.result(`Database connection ended: ${error.code || "CONNECTION_ERROR"}`); });
  try {
    const connected = await check("Authenticate to PostgreSQL (10-second limit)", async () => { await client.connect(); return true; });
    if (connected) {
      await check("Execute read-only database query", () => client.query("SELECT 1"));
      await check("Check signup columns and required defaults", async () => {
        const { rows } = await client.query("SELECT column_name, is_nullable, column_default, is_identity, is_generated FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'");
        const supplied = ["nom", "prenom", "email", "password_hash"];
        const missing = [...supplied, "id", "actif"].filter(name => !rows.some(row => row.column_name === name));
        const required = rows.filter(row => row.is_nullable === "NO" && row.column_default === null && row.is_identity !== "YES" && row.is_generated === "NEVER" && !supplied.includes(row.column_name));
        if (missing.length) trace.result(`Missing users columns: ${missing.join(", ")}`);
        if (required.length) trace.result(`Required columns omitted by signup: ${required.map(row => row.column_name).join(", ")}`);
        if (missing.length || required.length) throw Object.assign(new Error(), { code: "SIGNUP_SCHEMA_MISMATCH" });
      });
      await check("Check users INSERT privilege", async () => {
        const { rows } = await client.query("SELECT has_table_privilege(current_user, 'users', 'INSERT') AS allowed");
        if (!rows[0].allowed) throw Object.assign(new Error(), { code: "INSERT_PRIVILEGE_MISSING" });
      });
      await check("Check PostgreSQL session storage", async () => {
        const { rows } = await client.query("SELECT to_regclass('http_sessions') AS sessions, has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create");
        if (!rows[0].sessions) {
          trace.result("http_sessions is absent; session store will create it on first use");
          if (!rows[0].can_create) throw Object.assign(new Error(), { code: "SESSION_TABLE_CREATE_DENIED" });
        } else {
          await client.query("SELECT sid, sess, expire FROM http_sessions LIMIT 0");
          const rights = await client.query("SELECT has_table_privilege(current_user, 'http_sessions', 'SELECT') AND has_table_privilege(current_user, 'http_sessions', 'INSERT') AND has_table_privilege(current_user, 'http_sessions', 'UPDATE') AND has_table_privilege(current_user, 'http_sessions', 'DELETE') AS allowed");
          if (!rights.rows[0].allowed) throw Object.assign(new Error(), { code: "SESSION_TABLE_ACCESS_DENIED" });
        }
      });
    } else trace.result("SKIP database query, schema and permissions checks: PostgreSQL connection failed");
  } finally { await client.end(); }
} else trace.result("SKIP database checks: DATABASE_URL is invalid");
trace.result(`Checks complete: ${failures} failed step(s). No account or session data written.`);
process.exitCode = failures ? 1 : 0;

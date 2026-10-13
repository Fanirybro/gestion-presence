import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import session from "express-session";
import pool from "../config/database.js";

process.env.SESSION_SECRET = "organisation-tests-secret-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";
const { createApp } = await import("../server.js");

test("organisations : inscription atomique, isolation et permissions", async (t) => {
  const organisation = { id: "7", nom: "Direction", slug: "direction", adresse: null, fuseau_horaire: "Indian/Antananarivo", actif: true };
  const actor = { id: "1", organisation_id: "7", role: "COORDINATOR", actif: true };
  const signup = { nom: "Direction", slug: "direction", coordinateur: {
    nom: "Rakoto", prenom: "Alice", email: "Alice@Example.com", password: "a-test-password-123",
  } };
  let calls = [];
  let conflict = false;
  let revoked = false;
  let registered;
  let releases = 0;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("LEFT JOIN LATERAL")) return { rows: [actor] };
    if (sql.includes("pg_timezone_names")) return { rows: values[0] === "Indian/Antananarivo" ? [{ name: values[0] }] : [] };
    if (sql.includes("FROM users WHERE id = $1")) return { rows: [{ id: actor.id, nom: "Rakoto", prenom: "Alice", actif: true }] };
    if (sql.startsWith("SELECT id FROM organisation_members")) return { rows: actor.organisation_id === null ? [] : [{ id: "99" }] };
    if (sql.startsWith("INSERT INTO organisation_members")) {
      assert.deepEqual(values.slice(0, 2), ["7", "1"]);
      assert.match(sql, /'ACTIVE'/);
      if (conflict) throw Object.assign(new Error("unique"), { code: "23505" });
      return { rows: [{ id: "99", organisation_id: values[0], user_id: values[1], role: values[2], status: "ACTIVE" }] };
    }
    if (sql.startsWith("SELECT id FROM organisations WHERE organisation_code")) return { rows: [] };
    if (sql.includes("organisation_code = $1")) return { rows: values[0] === 582394107 ? [{ ...organisation }] : [] };
    if (sql.startsWith("SELECT m.role FROM organisation_members")) return { rows: [{ role: revoked ? "SECRETARY" : actor.role }] };
    if (sql.startsWith("SELECT") && sql.includes("FROM organisations")) {
      assert.deepEqual(values, [actor.organisation_id]);
      return { rows: [{ ...organisation }] };
    }
    if (sql.startsWith("INSERT INTO organisations")) {
      assert.ok(Number.isInteger(values[4]) && values[4] >= 100000000 && values[4] < 1000000000);
      return { rows: [{ ...organisation, organisation_code: values[4] }] };
    }
    if (sql.startsWith("UPDATE organisations")) {
      assert.equal(values.at(-1), "7");
      return { rows: [{ ...organisation, nom: values[0] }] };
    }
    return { rows: [] };
  };
  pool.query = query;
  pool.connect = async () => ({ query, release() { releases++; } });
  const store = new session.MemoryStore();
  const sid = "organisation-test-session";
  await new Promise((resolve, reject) => store.set(sid, {
    userId: "1", cookie: { expires: new Date(Date.now() + 60000), maxAge: 60000, httpOnly: true, path: "/" },
  }, (error) => error ? reject(error) : resolve()));
  const signature = createHmac("sha256", process.env.SESSION_SECRET).update(sid).digest("base64").replace(/=+$/, "");
  const cookie = `presence.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
  const server = createApp({ sessionStore: store }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await pool.end();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = "GET", body, authenticated = true) => fetch(base + path, {
    method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(authenticated ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  await t.test("consultation privée et limitée à son organisation", async () => {
    assert.equal((await request("/organisations/me", "GET", undefined, false)).status, 401);
    const res = await request("/organisations/me");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).organisation.id, "7");
    assert.equal((await request("/organisations/8")).status, 404);
  });
  await t.test("secrétaire : consultation permise et modification interdite", async () => {
    actor.role = "SECRETARY";
    assert.equal((await request("/organisations/me")).status, 200);
    assert.equal((await request("/organisations/me", "PATCH", { nom: "Autre" })).status, 403);
    actor.role = "COORDINATOR";
  });
  await t.test("validation et refus des champs sensibles", async () => {
    for (const body of [{}, { id: "8" }, { actif: false }, { nom: " " }, { slug: "BAD SLUG" }, { adresse: 42 }]) {
      assert.equal((await request("/organisations/me", "PATCH", body)).status, 400);
    }
  });
  await t.test("fuseau inconnu : rollback", async () => {
    calls = [];
    assert.equal((await request("/organisations/me", "PATCH", { fuseau_horaire: "Unknown/Zone" })).status, 400);
    assert.equal(calls.at(-1).sql, "ROLLBACK");
    assert.ok(!calls.some(({ sql }) => sql.startsWith("UPDATE")));
  });
  await t.test("permission révoquée pendant la requête : rollback", async () => {
    revoked = true;
    assert.equal((await request("/organisations/me", "PATCH", { nom: "Autre" })).status, 403);
    assert.equal(calls.at(-1).sql, "ROLLBACK");
    revoked = false;
  });
  await t.test("modification du coordinateur : commit", async () => {
    const res = await request("/organisations/me", "PATCH", { nom: " Autre " });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).organisation.nom, "Autre");
    assert.equal(calls.at(-1).sql, "COMMIT");
  });
  await t.test("création réservée aux comptes connectés sans organisation", async () => {
    assert.equal((await request("/organisations", "POST", { nom: "Test" }, false)).status, 401);
    assert.equal((await request("/organisations", "POST", { nom: "Test" })).status, 409);
    actor.organisation_id = null;
    assert.equal((await request("/organisations/me")).status, 403);
    assert.equal((await request("/users")).status, 403);
    assert.equal((await request("/organisations", "POST", { nom: "Test", role: "COORDINATOR" })).status, 400);
  });
  await t.test("création : code aléatoire et rôle coordinateur", async () => {
    calls = [];
    const res = await request("/organisations", "POST", { nom: "Nouvelle équipe" });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.user.role, "COORDINATOR");
    assert.equal(body.user.organisation_id, "7");
    assert.equal(body.membership.role, "COORDINATOR");
    assert.equal(body.membership.status, "ACTIVE");
    assert.equal(body.membership.user_id, "1");
    assert.ok(Number.isInteger(body.organisation.organisation_code));
    const insertOrg = calls.findIndex(({sql}) => sql.startsWith("INSERT INTO organisations"));
    const insertMember = calls.findIndex(({sql}) => sql.startsWith("INSERT INTO organisation_members"));
    assert.ok(insertOrg >= 0 && insertMember > insertOrg);
    assert.ok(!calls.some(({sql}) => /UPDATE users SET organisation_id/.test(sql)));
    assert.equal(calls.at(-1).sql, "COMMIT");
  });
  await t.test("rejoindre : code normalisé et rôle secrétaire", async () => {
    const res = await request("/organisations/join", "POST", { organisation_code: " 582394107 " });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.role, "SECRETARY");
    assert.equal((await request("/organisations/join", "POST", { organisation_code: "999999999" })).status, 404);
    assert.equal((await request("/organisations/join", "POST", { organisation_code: "582394107", role: "COORDINATOR" })).status, 400);
  });
  await t.test("échec d'affectation : rollback complet", async () => {
    conflict = true;
    calls = [];
    const before = releases;
    assert.equal((await request("/organisations", "POST", { nom: "Test" })).status, 409);
    assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO organisations")));
    assert.equal(calls.at(-1).sql, "ROLLBACK");
    assert.ok(!calls.some(({ sql }) => sql === "COMMIT"));
    assert.equal(releases, before + 1);
    conflict = false;
    actor.organisation_id = "7";
    assert.equal((await request("/organisations/join", "POST", { organisation_code: "582394107" })).status, 409);
  });
});

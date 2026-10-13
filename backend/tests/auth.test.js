import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import session from "express-session";
import pool from "../config/database.js";

process.env.SESSION_SECRET = "test-only-secret-with-more-than-32-characters";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";
const { createApp } = await import("../server.js");

test("session HTTP, authentification et autorisations", async (t) => {
  const salt = "a".repeat(32);
  const password = "a-secure-test-password";
  const key = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const user = { id: "1", organisation_id: "7", nom: "Test", prenom: "Alice", email: "alice@example.com",
    role: "COORDINATOR", actif: true, organisation_active: true,
    password_hash: `scrypt$131072$8$1$${salt}$${key.toString("hex")}` };
  const originalQuery = pool.query;
  pool.query = async (sql, values) => {
    if (sql.startsWith("INSERT INTO users")) {
      assert.ok(!sql.includes("organisation_id")); assert.ok(!sql.includes("role"));
      return { rows: [{ id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, actif: true }] };
    }
    assert.match(sql, /organisation_members/);
    assert.match(sql, /om.status = 'ACTIVE'/);
    assert.ok(!/u\.(role|organisation_id)/.test(sql));
    if (values[1] && values[1] !== user.email) return { rows: [] };
    const { organisation_active, ...account } = user;
    if (!organisation_active) { account.organisation_id = null; account.role = null; }
    return { rows: [account] };
  };
  const store = new session.MemoryStore();
  const server = createApp({ sessionStore: store }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    pool.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie;
  const request = (path, options = {}) => fetch(base + path, {
    ...options, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173",
      ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
  });
  const signIn = (body = { email: user.email, password }) => request("/auth/login", { method: "POST", body: JSON.stringify(body) });

  await t.test("absence de session : 401 et aucun cookie créé", async () => {
    const res = await request("/auth/me");
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
  });
  await t.test("origines étrangères et formulaires refusés", async () => {
    assert.equal((await request("/auth/login", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" })).status, 403);
    assert.equal((await request("/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status, 415);
  });
  await t.test("identifiants incorrects et inconnus : même réponse", async () => {
    const wrong = await signIn({ email: user.email, password: "wrong" });
    const unknown = await signIn({ email: "unknown@example.com", password });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });
  await t.test("connexion avec cookie HttpOnly sans données sensibles", async () => {
    const res = await signIn();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie"), /HttpOnly/);
    assert.match(res.headers.get("set-cookie"), /SameSite=Lax/);
    cookie = res.headers.get("set-cookie").split(";")[0];
    const body = await res.json();
    assert.equal(body.user.password_hash, undefined);
    assert.equal(body.user.organisation_active, undefined);
    assert.equal((await request("/auth/me")).status, 200);
  });
  await t.test("nouvelle connexion : rotation et révocation de l'ancien identifiant", async () => {
    const oldCookie = cookie;
    const res = await signIn();
    assert.equal(res.status, 200);
    cookie = res.headers.get("set-cookie").split(";")[0];
    assert.notEqual(cookie, oldCookie);
    assert.equal((await request("/auth/me", { headers: { Cookie: oldCookie } })).status, 401);
  });
  await t.test("changement de rôle immédiatement pris en compte", async () => {
    user.role = "SECRETARY";
    assert.equal((await request("/users")).status, 403);
    assert.equal((await (await request("/auth/me")).json()).user.role, "SECRETARY");
    user.role = "COORDINATOR";
  });
  await t.test("déconnexion : cookie supprimé et session invalidée", async () => {
    const res = await request("/auth/logout", { method: "POST", body: "{}" });
    assert.equal(res.status, 204);
    assert.match(res.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await request("/auth/me")).status, 401);
  });
  await t.test("compte désactivé : session révoquée", async () => {
    cookie = (await signIn()).headers.get("set-cookie").split(";")[0];
    user.actif = false;
    assert.equal((await request("/auth/me")).status, 401);
    user.actif = true;
    assert.equal((await request("/auth/me")).status, 401);
  });
  await t.test("organisation désactivée : aucun droit sur son espace", async () => {
    user.organisation_active = false;
    const res = await signIn();
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.organisation_id, null);
    user.organisation_active = true;
  });
  await t.test("session expirée : 401", async () => {
    cookie = (await signIn()).headers.get("set-cookie").split(";")[0];
    const sid = decodeURIComponent(cookie.split("=")[1]).slice(2).split(".")[0];
    const saved = JSON.parse(store.sessions[sid]);
    saved.cookie.expires = new Date(Date.now() - 1000).toISOString();
    store.sessions[sid] = JSON.stringify(saved);
    assert.equal((await request("/auth/me")).status, 401);
  });
  await t.test("compte sans organisation : connexion et session restaurée", async () => {
    user.organisation_id = null; user.organisation_active = null;
    const res = await signIn(); assert.equal(res.status, 200);
    cookie = res.headers.get("set-cookie").split(";")[0];
    const me = await request("/auth/me"); assert.equal(me.status, 200);
    assert.equal((await me.json()).user.organisation_id, null);
  });
  await t.test("signup : session créée sans choix de rôle", async () => {
    const body = { nom: "Test", prenom: "Alice", email: "new@example.com", password };
    const bad = await request("/auth/signup", { method: "POST", body: JSON.stringify({ ...body, role: "COORDINATOR" }) });
    assert.equal(bad.status, 400);
    const res = await request("/auth/signup", { method: "POST", body: JSON.stringify(body) });
    assert.equal(res.status, 201);
    const result = await res.json(); assert.equal(result.user.organisation_id, null);
    assert.equal(result.user.role, null); assert.equal(result.user.password_hash, undefined);
    assert.ok(res.headers.get("set-cookie"));
  });
  await t.test("tentatives de connexion limitées", async () => {
    let res;
    for (let i = 0; i < 11; i++) {
      res = await signIn({});
      if (res.status === 429) break;
    }
    assert.equal(res.status, 429);
  });
});

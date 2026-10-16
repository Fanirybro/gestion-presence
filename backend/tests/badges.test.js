import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pool from "../config/database.js";
import router from "../routes/QrCodeRoutes.js";
import { badgeToken, hashBadgeToken } from "../utils/badgeToken.js";

test("badges : génération, réimpression, révocation et pointage HTTP", async t => {
  const originals = { query: pool.query, connect: pool.connect, secret: process.env.BADGE_SECRET };
  process.env.BADGE_SECRET = "test-badge-secret-with-more-than-32-characters";
  let state, snapshot, role, currentRole, org, failAudit, calls, now, scheduleRows, failEvent;
  function reset() {
    state = { badges: [], events: [], summary: null, personActive: true };
    role = currentRole = "COORDINATOR"; org = "7"; failAudit = false; calls = [];
    now = { now: "2026-10-08T05:30:00Z", date: "2026-10-08", day: 4, time: "08:30", pointage_qr: true };
    scheduleRows = [{ jour_semaine: 4, fin_jour_suivant: false, start: "08:00", end: "12:00", tolerance: 15 }];
    failEvent = false;
  }
  reset(); t.beforeEach(reset);
  const actor = value => ({ id: "1", organisation_id: org, actif: true, role: value });
  pool.query = async () => ({ rows: [actor(role)] });
  pool.connect = async () => ({ release() {}, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql === "BEGIN") { snapshot = structuredClone(state); return { rows: [] }; }
    if (sql === "ROLLBACK") { state = snapshot; return { rows: [] }; }
    if (sql === "COMMIT") return { rows: [] };
    if (sql.includes("LEFT JOIN LATERAL")) return { rows: [actor(currentRole)] };
    assert.equal(values[0], org, "organisation imposée par la session");
    if (sql.startsWith("SELECT id FROM organisations")) return { rows: [{ id: org }] };
    if (sql.startsWith("SELECT id, nom, prenom, actif FROM personnel")) return { rows: org === "7" && values[1] === "2" ? [{ id: "2", nom: "Rakoto", prenom: "Jean", actif: state.personActive }] : [] };
    if (sql.startsWith("SELECT id FROM personnel")) return { rows: state.personActive ? [{ id: "2" }] : [] };
    if (sql.startsWith("SELECT id, organisation_id, personnel_id, token_hash FROM badges")) return { rows: state.badges.filter(b => b.organisation_id === org && b.personnel_id === values[1] && !b.revoked) };
    if (sql.startsWith("INSERT INTO badges")) {
      const row = { id: String(state.badges.length + 1), organisation_id: org, personnel_id: values[1], token_hash: values[2] };
      state.badges.push(row); return { rows: [row] };
    }
    if (sql.startsWith("UPDATE badges SET token_hash")) { state.badges.find(b => b.id === values[1]).token_hash = values[2]; return { rows: [] }; }
    if (sql.startsWith("UPDATE badges SET revoked_at")) { state.badges.find(b => b.id === values[1]).revoked = true; return { rows: [] }; }
    if (sql.startsWith("INSERT INTO journal_audit")) { if (failAudit) throw new Error("audit failure"); return { rows: [] }; }
    if (sql.startsWith("SELECT b.id, b.personnel_id")) {
      assert.match(sql, /b.revoked_at IS NULL AND p.actif = true/);
      const row = state.badges.find(b => b.organisation_id === org && b.token_hash === values[1] && !b.revoked && state.personActive);
      return { rows: row ? [{ ...row, prenom: "Jean", nom: "Rakoto" }] : [] };
    }
    if (sql.startsWith("SELECT type, personnel_id FROM pointages")) return { rows: state.events.filter(e => e.key === values[1]) };
    if (sql.startsWith("SELECT CURRENT_TIMESTAMP")) return { rows: [now] };
    if (sql.startsWith("SELECT type, horodatage FROM pointages")) return { rows: state.events.slice(-1) };
    if (sql.includes("FROM horaires_travail")) return { rows: scheduleRows };
    if (sql.startsWith("INSERT INTO presences_journalieres")) { state.summary = { id: "1", values }; return { rows: [] }; }
    if (sql.startsWith("SELECT id FROM presences_journalieres")) return { rows: state.summary ? [state.summary] : [] };
    if (sql.startsWith("UPDATE presences_journalieres")) { state.summary.departure = values[2]; return { rows: [] }; }
    if (sql.startsWith("INSERT INTO pointages")) {
      if (failEvent) throw new Error("pointage unavailable");
      state.events.push({ personnel_id: values[1], type: values[3], horodatage: values[4], key: values[6] }); return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: req.get("x-session") }; next(); });
  app.use("/badges", router);
  app.use((_err, _req, res, _next) => res.status(500).json({ message: "Erreur interne." }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    pool.query = originals.query; pool.connect = originals.connect;
    if (originals.secret === undefined) delete process.env.BADGE_SECRET; else process.env.BADGE_SECRET = originals.secret;
    await new Promise(resolve => server.close(resolve));
  });
  const request = (path, method = "GET", body, auth = true) => fetch(`http://127.0.0.1:${server.address().port}/badges${path}`, { method,
    headers: { "Content-Type": "application/json", ...(auth ? { "x-session": "1" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const issue = async () => { const res = await request("/personnel/2", "POST", {}); assert.equal(res.status, 200); return (await res.json()).badge; };
  const scan = (token, key = randomUUID()) => request("/scan", "POST", { token, cle_idempotence: key });
  await t.test("authentification et rôle coordinateur obligatoires pour les badges", async () => {
    assert.equal((await request("/personnel/2", "GET", undefined, false)).status, 401);
    role = "SECRETARY";
    assert.equal((await request("/personnel/2")).status, 403);
    assert.equal((await request("/prepare", "POST", {})).status, 403);
  });
  await t.test("création puis relecture : même QR, seulement une empreinte stockée", async () => {
    const created = await issue();
    assert.match(created.token, /^presence:v1:/); assert.equal(state.badges[0].token_hash, hashBadgeToken(created.token));
    const read = await (await request("/personnel/2")).json(); assert.equal(read.badge.token, created.token); assert.equal(read.badge.token_hash, undefined);
    assert.equal((await issue()).token, created.token); assert.equal(state.badges.length, 1);
  });
  await t.test("planche : préparation conserve les codes existants", async () => {
    const original = await issue(); const res = await request("/prepare", "POST", {});
    assert.equal(res.status, 200); assert.equal((await res.json()).badges[0].token, original.token); assert.equal(state.badges.length, 1);
  });
  await t.test("régénération invalide immédiatement l'ancien code", async () => {
    const old = await issue(); const res = await request("/personnel/2", "POST", { regenerate: true });
    const fresh = (await res.json()).badge; assert.notEqual(fresh.token, old.token);
    assert.equal((await scan(old.token)).status, 404); assert.equal((await scan(fresh.token)).status, 200);
  });
  await t.test("révocation, agent inactif et organisation étrangère refusés", async () => {
    const badge = await issue(); state.personActive = false; assert.equal((await scan(badge.token)).status, 404);
    assert.equal((await request("/personnel/2", "POST", {})).status, 409);
    state.personActive = true; org = "8"; assert.equal((await scan(badge.token)).status, 404); assert.equal((await request("/personnel/2")).status, 404);
    org = "7"; assert.equal((await request("/personnel/2/revoke", "POST", {})).status, 200); assert.equal((await scan(badge.token)).status, 404);
  });
  await t.test("retour arrière si l'audit échoue", async () => {
    const badge = await issue(); failAudit = true;
    assert.equal((await request("/personnel/2", "POST", { regenerate: true })).status, 500);
    assert.equal(state.badges.length, 1); assert.equal(state.badges[0].revoked, undefined);
    assert.equal(publicToken(), badge.token);
  });
  function publicToken() { return badgeToken(state.badges[0]); }
  await t.test("scan secrétaire : arrivée persistée, retard et idempotence", async () => {
    const badge = await issue(); role = currentRole = "SECRETARY";
    const key = randomUUID(); assert.equal((await scan(badge.token, key)).status, 200);
    assert.equal(state.summary.values[5], "LATE"); assert.equal(state.summary.values[6], 15);
    assert.equal((await scan(badge.token, key)).status, 200); assert.equal(state.events.length, 1);
    assert.equal((await scan(badge.token)).status, 409);
    now = { ...now, now: "2026-10-08T09:00:00Z", time: "12:00" };
    const departure = await scan(badge.token); assert.equal(departure.status, 200); assert.equal((await departure.json()).type, "DEPARTURE");
    assert.equal(state.events.length, 2); assert.equal(state.summary.departure, now.now);
  });
  await t.test("code altéré et corps invalide refusés", async () => {
    const badge = await issue(); const altered = badge.token.slice(0, -1) + (badge.token.endsWith("0") ? "1" : "0");
    assert.equal((await scan(altered)).status, 404);
    assert.equal((await scan("not-a-badge")).status, 400);
    assert.equal((await request("/scan", "POST", { token: badge.token, cle_idempotence: randomUUID(), personnel_id: "3" })).status, 400);
  });
  await t.test("permission révoquée pendant la requête", async () => {
    currentRole = "SECRETARY"; assert.equal((await request("/personnel/2", "POST", {})).status, 403); assert.equal(state.badges.length, 0);
  });
  await t.test("soir après minuit rattaché au jour de début, départ hors horaires accepté", async () => {
    const badge = await issue();
    scheduleRows = [{ jour_semaine: 4, fin_jour_suivant: true, start: "18:00", end: "02:00", tolerance: 15 }];
    now = { now: "2026-10-08T21:30:00Z", date: "2026-10-09", day: 5, time: "00:30" };
    assert.equal((await scan(badge.token)).status, 200);
    assert.equal(state.summary.values[2], "2026-10-08"); assert.equal(state.summary.values[6], 375);
    now = { ...now, now: "2026-10-08T23:05:00Z", time: "02:05" };
    scheduleRows = [];
    const res = await scan(badge.token); assert.equal(res.status, 200); assert.equal((await res.json()).type, "DEPARTURE");
  });
  await t.test("échec du pointage annule aussi la synthèse de présence", async () => {
    const badge = await issue(); failEvent = true;
    assert.equal((await scan(badge.token)).status, 500);
    assert.equal(state.summary, null); assert.equal(state.events.length, 0); assert.equal(calls.at(-1).sql, "ROLLBACK");
  });
});

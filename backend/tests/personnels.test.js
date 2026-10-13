import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { hashBadgeToken } from "../utils/badgeToken.js";
import pool from "../config/database.js";
import personnels from "../routes/personnelsRoutes.js";
import departements from "../routes/departementsRoutes.js";

const fields = ["nom", "prenom", "date_naissance", "departement_id", "utilisateur_id", "poste", "date_embauche", "actif"];
const input = { nom: "Rakoto", prenom: "Alice", date_naissance: "1995-04-12", departement_id: "4", utilisateur_id: null, poste: null, date_embauche: null, actif: true };

test("personnel et départements : HTTP, droits, validation et transactions", async t => {
  const previousSecret = process.env.BADGE_SECRET;
  process.env.BADGE_SECRET = "personnel-test-secret-with-at-least-32-characters";
  t.after(() => { if (previousSecret === undefined) delete process.env.BADGE_SECRET; else process.env.BADGE_SECRET = previousSecret; });
  const originals = { connect: pool.connect, query: pool.query };
  let badges, badgeFailure, calls, people, departments, snapshot, role, writeRole, auditFailure, releases;
  function reset() {
    badges = []; badgeFailure = false; calls = []; people = [{ ...input, id: "2", organisation_id: "7" }];
    departments = [{ id: "4", organisation_id: "7", nom: "Administration", actif: true }];
    snapshot = null; role = "COORDINATOR"; writeRole = "COORDINATOR"; auditFailure = false; releases = 0;
  }
  reset();
  t.beforeEach(reset);
  const actor = role => ({ id: "1", actif: true, organisation_id: "7", role });
  pool.query = async sql => {
    assert.match(sql, /LEFT JOIN LATERAL/);
    return { rows: [actor(role)] };
  };
  pool.connect = async () => ({
    release() { releases++; },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN") { snapshot = structuredClone({ people, departments, badges }); return { rows: [] }; }
      if (sql === "ROLLBACK") { ({ people, departments, badges } = snapshot); return { rows: [] }; }
      if (sql === "COMMIT") return { rows: [] };
      if (sql.includes("LEFT JOIN LATERAL")) return { rows: [actor(writeRole)] };
      if (sql.startsWith("SELECT id FROM organisations")) return { rows: [{ id: "7" }] };
      if (sql.includes("AS today FROM organisations")) return { rows: [{ today: "2026-10-05" }] };
      if (sql.startsWith("SELECT") && sql.includes("FROM personnel p")) {
        assert.match(sql, /p.organisation_id = \$1/);
        return { rows: structuredClone(people.filter(p => p.organisation_id === values[0] && (values[1] === undefined || p.id === values[1]))) };
      }
      if (sql.startsWith("SELECT") && sql.includes("FROM departements")) {
        assert.match(sql, /organisation_id = \$1/);
        return { rows: structuredClone(departments.filter(d => d.organisation_id === values[0] && (values[1] === undefined || d.id === values[1]))) };
      }
      if (sql.includes("FROM organisation_members m JOIN users")) {
        assert.match(sql, /m.organisation_id = \$1/);
        return { rows: values[0] === "7" && (values[1] === "6" || values[1] === undefined) ? [{ user_id: "6", id: "6", nom: "Membre", prenom: "Actif", actif: true }] : [] };
      }
      if (sql.startsWith("INSERT INTO personnel")) {
        const person = { id: "3", organisation_id: values[0], ...Object.fromEntries(fields.map((key, i) => [key, values[i + 1]])) };
        people.push(person); return { rows: [{ id: person.id }] };
      }
      if (sql.startsWith("UPDATE personnel")) {
        assert.match(sql, /WHERE organisation_id = \$1 AND id = \$2/);
        const person = people.find(p => p.organisation_id === values[0] && p.id === values[1]);
        Object.assign(person, Object.fromEntries(fields.map((key, i) => [key, values[i + 2]])));
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO journal_audit")) {
        assert.deepEqual(values.slice(0, 2), ["7", "1"]);
        if (auditFailure) throw new Error("audit unavailable");
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO badges")) {
        if (badgeFailure) throw new Error("badge unavailable");
        const badge = { id: "10", organisation_id: values[0], personnel_id: values[1], token_hash: values[2], created_by: values[3] };
        badges.push(badge); return { rows: [badge] };
      }
      if (sql.startsWith("UPDATE badges SET token_hash")) {
        badges.find(b => b.id === values[1] && b.organisation_id === values[0]).token_hash = values[2];
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE badges")) {
        assert.match(sql, /organisation_id = \$1 AND personnel_id = \$2 AND revoked_at IS NULL/);
        assert.deepEqual(values, ["7", "2", "1"]); return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO departements")) {
        const department = { id: "5", organisation_id: values[0], nom: values[1], actif: true };
        departments.push(department); return { rows: [department] };
      }
      if (sql.startsWith("SELECT id FROM personnel")) {
        assert.match(sql, /organisation_id = \$1 AND departement_id = \$2 AND actif = true/);
        return { rows: people.filter(p => p.organisation_id === values[0] && p.departement_id === values[1] && p.actif) };
      }
      if (sql.startsWith("UPDATE departements")) {
        assert.match(sql, /WHERE organisation_id = \$1 AND id = \$2/);
        Object.assign(departments.find(d => d.organisation_id === values[0] && d.id === values[1]), { nom: values[2], actif: values[3] });
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: req.get("x-test-session") }; next(); });
  app.use("/personnels", personnels);
  app.use("/departements", departements);
  app.use((_err, _req, res, _next) => res.status(500).json({ message: "Erreur interne." }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { pool.connect = originals.connect; pool.query = originals.query; await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, session = true) => fetch(base + path, { method,
    headers: { "Content-Type": "application/json", ...(session ? { "x-test-session": "1" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await t.test("connexion obligatoire", async () => { assert.equal((await request("/personnels", "GET", undefined, false)).status, 401); assert.equal(calls.length, 0); });
  await t.test("lecture filtrée par organisation", async () => {
    people.push({ ...input, id: "9", organisation_id: "8" });
    const res = await request("/personnels"); assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).personnel.map(p => p.id), ["2"]);
    assert.equal((await request("/personnels/9")).status, 404);
  });
  await t.test("secrétaire : lecture permise, mutations et liste des comptes interdites", async () => {
    role = "SECRETARY";
    assert.equal((await request("/personnels")).status, 200);
    for (const [path, method, body] of [["/personnels", "POST", input], ["/personnels/2", "PATCH", { actif: false }], ["/departements", "POST", { nom: "Test" }], ["/departements/4", "PATCH", { nom: "Test" }], ["/personnels/membres", "GET", undefined]]) {
      assert.equal((await request(path, method, body)).status, 403);
    }
  });
  await t.test("création, normalisation et audit dans la même transaction", async () => {
    const res = await request("/personnels", "POST", { ...input, nom: " Rakoto " });
    assert.equal(res.status, 201); const result = await res.json(); const saved = result.personnel;
    assert.equal(badges.length, 1);
    assert.equal(badges[0].personnel_id, saved.id);
    assert.equal(badges[0].token_hash, hashBadgeToken(result.badge.token));
    assert.equal(badges[0].created_by, "1");
    assert.equal(saved.nom, "Rakoto"); assert.equal(saved.organisation_id, "7");
    assert.ok(calls.some(c => c.sql.startsWith("INSERT INTO journal_audit")));
    assert.equal(calls.at(-1).sql, "COMMIT"); assert.equal(releases, 1);
  });
  await t.test("échec du badge : annulation du personnel", async () => {
    badgeFailure = true;
    assert.equal((await request("/personnels", "POST", { ...input })).status, 500);
    assert.equal(people.length, 1); assert.equal(badges.length, 0);
    assert.equal(calls.at(-1).sql, "ROLLBACK");
  });
  await t.test("personnel créé inactif : aucun badge utilisable", async () => {
    const res = await request("/personnels", "POST", { ...input, actif: false });
    assert.equal(res.status, 201); assert.equal((await res.json()).badge, null);
    assert.equal(badges.length, 0);
  });
  await t.test("champs protégés refusés", async () => {
    for (const extra of [{ organisation_id: "8" }, { id: "10" }, { role: "COORDINATOR" }]) {
      assert.equal((await request("/personnels", "POST", { ...input, ...extra })).status, 400);
    }
  });
  await t.test("dates manquantes, impossibles, futures et embauche avant naissance refusées", async () => {
    for (const override of [{ date_naissance: null }, { date_naissance: "2025-02-29" }, { date_naissance: "2026-10-06" }, { date_embauche: "1990-01-01" }]) {
      assert.equal((await request("/personnels", "POST", { ...input, ...override })).status, 400);
    }
  });
  await t.test("types invalides refusés", async () => {
    for (const override of [{ actif: null }, { actif: "false" }, { utilisateur_id: false }, { departement_id: 4 }]) {
      assert.equal((await request("/personnels", "POST", { ...input, ...override })).status, 400);
    }
  });
  await t.test("département externe ou inactif refusé", async () => {
    departments.push({ id: "8", organisation_id: "8", nom: "Autre", actif: true });
    assert.equal((await request("/personnels", "POST", { ...input, departement_id: "8" })).status, 400);
    departments[0].actif = false;
    assert.equal((await request("/personnels", "POST", { ...input })).status, 400);
  });
  await t.test("utilisateur externe refusé et membre actif accepté", async () => {
    assert.equal((await request("/personnels/2", "PATCH", { utilisateur_id: "9" })).status, 400);
    const res = await request("/personnels/2", "PATCH", { utilisateur_id: "6" });
    assert.equal(res.status, 200); assert.equal((await res.json()).personnel.utilisateur_id, "6");
  });
  await t.test("ancien champ matricule refusé", async () => {
    assert.equal((await request("/personnels", "POST", { ...input, matricule: "OLD" })).status, 400);
    assert.equal(people.length, 1);
  });
  await t.test("modification partielle conserve les champs absents", async () => {
    const res = await request("/personnels/2", "PATCH", { poste: "Responsable" });
    assert.equal(res.status, 200); const saved = (await res.json()).personnel;
    assert.equal(saved.poste, "Responsable"); assert.equal(saved.date_naissance, input.date_naissance);
  });
  await t.test("désactivation révoque les badges sans supprimer le personnel", async () => {
    assert.equal((await request("/personnels/2", "PATCH", { actif: false })).status, 200);
    assert.equal(people[0].actif, false); assert.equal(people.length, 1);
    assert.ok(calls.some(c => c.sql.startsWith("UPDATE badges")));
    assert.ok(!calls.some(c => c.sql.startsWith("DELETE")));
  });
  await t.test("réactivation refusée dans un département inactif", async () => {
    people[0].actif = false; departments[0].actif = false;
    assert.equal((await request("/personnels/2", "PATCH", { actif: true })).status, 400);
  });
  await t.test("échec de l'audit annule la modification", async () => {
    auditFailure = true;
    assert.equal((await request("/personnels/2", "PATCH", { nom: "Modifié" })).status, 500);
    assert.equal(people[0].nom, input.nom); assert.equal(calls.at(-1).sql, "ROLLBACK");
  });
  await t.test("rôle révoqué pendant la requête : aucune écriture", async () => {
    writeRole = "SECRETARY";
    assert.equal((await request("/personnels/2", "PATCH", { actif: false })).status, 403);
    assert.ok(!calls.some(c => c.sql.startsWith("UPDATE")));
  });
  await t.test("identifiants invalides et modification hors organisation refusés", async () => {
    assert.equal((await request("/personnels/abc", "PATCH", { actif: false })).status, 400);
    assert.equal((await request("/personnels/9223372036854775808")).status, 400);
    assert.equal((await request("/personnels/9", "PATCH", { actif: false })).status, 404);
  });
  await t.test("création et renommage d'un département", async () => {
    assert.equal((await request("/departements", "POST", { nom: " Finances " })).status, 201);
    assert.equal(departments[1].nom, "Finances");
    assert.equal((await request("/departements/5", "PATCH", { nom: "Comptabilité" })).status, 200);
    assert.equal(departments[1].nom, "Comptabilité");
  });
  await t.test("département contenant des agents actifs : désactivation refusée", async () => {
    assert.equal((await request("/departements/4", "PATCH", { actif: false })).status, 409);
    people[0].actif = false;
    assert.equal((await request("/departements/4", "PATCH", { actif: false })).status, 200);
    assert.equal(departments[0].actif, false);
  });
});

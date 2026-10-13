import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pool from "../config/database.js";
import routes from "../routes/parametresRoutes.js";
import { validateParametres } from "../controllers/parametresControllers.js";

const semaine = () => Array.from({ length: 7 }, (_, day) => ["MATIN", "APRES_MIDI", "SOIR"].map(periode => ({
  jour_semaine: day, periode, fin_jour_suivant: false,
  jour_travaille: day > 0 && day < 6 && periode === "MATIN",
  heure_debut: day > 0 && day < 6 && periode === "MATIN" ? "08:00" : null,
  heure_fin: day > 0 && day < 6 && periode === "MATIN" ? "12:00" : null,
  heure_limite_absence: day > 0 && day < 6 && periode === "MATIN" ? "10:00" : null,
  tolerance_retard_minutes: 15,
}))).flat();
const body = () => ({ nom: "Équipe", adresse: null, horaires: semaine() });
test("créneaux : soir après minuit, doublons et chevauchements de semaine", () => {
  const value = body();
  const set = (day, period, start, end, overnight = false) => {
    const row = value.horaires.find(h => h.jour_semaine === day && h.periode === period);
    Object.assign(row, { jour_travaille: true, heure_debut: start, heure_fin: end, heure_limite_absence: start, tolerance_retard_minutes: 0, fin_jour_suivant: overnight });
    return row;
  };
  const evening = set(1, "SOIR", "18:00", "02:00", true);
  evening.heure_limite_absence = "00:30";
  assert.doesNotThrow(() => validateParametres(value));
  const afternoon = set(1, "APRES_MIDI", "13:00", "17:00");
  assert.doesNotThrow(() => validateParametres(value));
  afternoon.heure_debut = "11:00";
  assert.throws(() => validateParametres(value), /chevaucher/);
  afternoon.heure_debut = "13:00";
  const morning = set(2, "MATIN", "01:00", "12:00");
  assert.throws(() => validateParametres(value), /chevaucher/);
  morning.heure_debut = "08:00"; morning.heure_limite_absence = "10:00";
  set(6, "SOIR", "18:00", "09:00", true);
  set(0, "MATIN", "08:00", "12:00");
  assert.throws(() => validateParametres(value), /samedi soir/);
  const duplicate = body(); duplicate.horaires[1].periode = "MATIN";
  assert.throws(() => validateParametres(duplicate), /exactement un/);
  const invalidNight = body(); invalidNight.horaires[3].fin_jour_suivant = true;
  assert.throws(() => validateParametres(invalidNight), /Seul un créneau du soir/);
});
test("validation des sept jours, types et bornes horaires", () => {
  assert.equal(validateParametres(body()).horaires[0].tolerance_retard_minutes, 0);
  for (const change of [
    b => b.horaires.pop(), b => b.horaires[0].jour_semaine = 1,
    b => b.horaires[3].heure_debut = "24:00", b => b.horaires[3].heure_fin = "07:00",
    b => b.horaires[3].heure_limite_absence = "08:10", b => b.horaires[3].heure_limite_absence = "18:00",
    b => b.horaires[3].tolerance_retard_minutes = -1, b => b.horaires[3].tolerance_retard_minutes = 1.5,
    b => b.horaires[0].heure_debut = "08:00", b => b.horaires[3].jour_travaille = "true",
    b => b.organisation_id = "8", b => b.nom = " ", b => b.adresse = 2,
  ]) {
    const value = body(); change(value);
    assert.throws(() => validateParametres(value), { status: 400 });
  }
});
test("paramètres : droits HTTP, persistance atomique et isolation", async t => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  let state, calls, role, currentRole, failAudit, failDay, snapshot;
  function reset() {
    state = { organisation: { id: "7", nom: "Avant", adresse: "Ancienne adresse", fuseau_horaire: "Indian/Antananarivo" }, horaires: [] };
    calls = []; role = "COORDINATOR"; currentRole = "COORDINATOR"; failAudit = false; failDay = false;
  }
  reset(); t.beforeEach(reset);
  pool.query = async () => ({ rows: [{ id: "1", organisation_id: "7", actif: true, role }] });
  pool.connect = async () => ({ release() {}, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.startsWith("BEGIN")) { snapshot = structuredClone(state); return { rows: [] }; }
    if (sql === "ROLLBACK") { state = snapshot; return { rows: [] }; }
    if (sql === "COMMIT") return { rows: [] };
    if (sql.includes("LEFT JOIN LATERAL")) return { rows: [{ actif: true, organisation_id: "7", role: currentRole }] };
    assert.equal(values[0], "7", "toutes les requêtes métier sont limitées à l'organisation de session");
    if (sql.startsWith("SELECT id FROM organisations")) return { rows: [{ id: "7" }] };
    if (sql.startsWith("SELECT") && sql.includes("FROM organisations")) return { rows: [structuredClone(state.organisation)] };
    if (sql.startsWith("SELECT") && sql.includes("FROM horaires_travail")) { assert.match(sql, /WHERE organisation_id = \$1/); return { rows: structuredClone(state.horaires) }; }
    if (sql.startsWith("UPDATE organisations")) { state.organisation.nom = values[1]; state.organisation.adresse = values[2]; return { rows: [] }; }
    if (sql.startsWith("INSERT INTO horaires_travail")) {
      assert.match(sql, /ON CONFLICT \(organisation_id, jour_semaine, periode\) DO UPDATE/);
      if (failDay && values[1] === 3) throw new Error("write failed");
      const keys = ["jour_semaine", "jour_travaille", "heure_debut", "heure_fin", "heure_limite_absence", "tolerance_retard_minutes", "periode", "fin_jour_suivant"];
      state.horaires = state.horaires.filter(h => (h.jour_semaine !== values[1] || h.periode !== values[7]));
      state.horaires.push(Object.fromEntries(keys.map((key, i) => [key, values[i + 1]])));
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO journal_audit")) { if (failAudit) throw new Error("audit failed"); return { rows: [] }; }
    throw new Error(sql);
  } });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: req.get("x-session") }; next(); });
  app.use("/parametres", routes);
  app.use((_error, _req, res, _next) => res.status(500).json({ message: "Erreur interne." }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { pool.query = originalQuery; pool.connect = originalConnect; await new Promise(resolve => server.close(resolve)); });
  const request = (method = "GET", data, authenticated = true) => fetch(`http://127.0.0.1:${server.address().port}/parametres`, {
    method, headers: { "Content-Type": "application/json", ...(authenticated ? { "x-session": "1" } : {}) }, body: data === undefined ? undefined : JSON.stringify(data),
  });
  await t.test("connexion obligatoire", async () => { assert.equal((await request("GET", undefined, false)).status, 401); });
  await t.test("secrétaire peut lire mais pas modifier", async () => {
    role = "SECRETARY"; assert.equal((await request()).status, 200); assert.equal((await request("PATCH", body())).status, 403);
  });
  await t.test("sauvegarde puis relecture : 21 créneaux sans doublons", async () => {
    assert.equal((await request("PATCH", body())).status, 200);
    assert.equal((await request("PATCH", { ...body(), nom: "Après" })).status, 200);
    const response = await (await request()).json();
    assert.equal(response.organisation.nom, "Après"); assert.equal(response.organisation.adresse, null);
    assert.equal(response.horaires.length, 21); assert.equal(response.horaires[0].heure_debut, null);
    assert.ok(calls.some(c => c.sql.startsWith("INSERT INTO journal_audit")));
  });
  await t.test("échec en milieu de semaine : organisation et horaires annulés", async () => {
    failDay = true; assert.equal((await request("PATCH", body())).status, 500);
    assert.equal(state.organisation.nom, "Avant"); assert.equal(state.horaires.length, 0); assert.equal(calls.at(-1).sql, "ROLLBACK");
  });
  await t.test("échec de l'audit : toutes les modifications annulées", async () => {
    failAudit = true; assert.equal((await request("PATCH", body())).status, 500); assert.equal(state.organisation.nom, "Avant"); assert.equal(state.horaires.length, 0);
  });
  await t.test("permission révoquée : modification refusée", async () => {
    currentRole = "SECRETARY"; assert.equal((await request("PATCH", body())).status, 403); assert.equal(state.organisation.nom, "Avant");
  });
});

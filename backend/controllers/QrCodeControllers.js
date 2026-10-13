import { insertBadge } from "../utils/createBadge.js";
import pool from "../config/database.js";
import { loadAccount } from "../utils/account.js";
import { badgeToken, hashBadgeToken } from "../utils/badgeToken.js";

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const validId = value => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
function body(req, keys) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some(k => !keys.includes(k))) fail(400, "Requête invalide.");
  return req.body;
}
function controller(action, { write = false, coordinator = true } = {}) {
  return async (req, res, next) => {
    let client, transaction = false;
    try {
      if (req.params.id && !validId(req.params.id)) fail(400, "Identifiant invalide.");
      client = await pool.connect();
      if (write) {
        await client.query("BEGIN"); transaction = true;
        await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [req.user.organisation_id]);
        const actor = await loadAccount(client, { id: String(req.session.userId), organisationId: req.user.organisation_id });
        if (!actor?.actif || !actor.organisation_id || (coordinator && actor.role !== "COORDINATOR")) fail(403, "Accès non autorisé.");
      }
      const result = await action(req, client);
      if (transaction) { await client.query("COMMIT"); transaction = false; }
      res.json(result);
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => {});
      if (error.status) return res.status(error.status).json({ message: error.message });
      next(error);
    } finally { client?.release(); }
  };
}
async function personnel(client, org, id) {
  const { rows } = await client.query("SELECT id, nom, prenom, actif FROM personnel WHERE organisation_id = $1 AND id = $2", [org, id]);
  if (!rows[0]) fail(404, "Agent introuvable.");
  return rows[0];
}
async function activeBadge(client, org, id) {
  return (await client.query("SELECT id, organisation_id, personnel_id, token_hash FROM badges WHERE organisation_id = $1 AND personnel_id = $2 AND revoked_at IS NULL", [org, id])).rows[0];
}
function publicBadge(row) {
  if (!row) return null;
  const token = badgeToken(row);
  return { id: String(row.id), personnel_id: String(row.personnel_id), token: hashBadgeToken(token) === row.token_hash ? token : null };
}
async function audit(client, req, badgeId, action) {
  await client.query("INSERT INTO journal_audit (organisation_id, acteur_id, entite, entite_id, action) VALUES ($1, $2, 'badges', $3, $4)", [req.user.organisation_id, req.session.userId, badgeId, action]);
}
async function issue(client, req, id, regenerate = false) {
  const org = req.user.organisation_id;
  const person = await personnel(client, org, id);
  if (!person.actif) fail(409, "Réactivez cet agent avant de générer son badge.");
  const existing = await activeBadge(client, org, id);
  if (existing && !regenerate) {
    const badge = publicBadge(existing);
    if (!badge.token) fail(409, "Ce badge doit être régénéré : sa clé de signature a changé.");
    return badge;
  }
  if (existing) {
    await client.query("UPDATE badges SET revoked_at = now(), revoked_by = $3 WHERE organisation_id = $1 AND id = $2", [org, existing.id, req.session.userId]);
    await audit(client, req, existing.id, "REVOKE");
  }
  return insertBadge(client, org, id, req.session.userId);
}
export const getBadge = controller(async (req, client) => {
  const person = await personnel(client, req.user.organisation_id, req.params.id);
  return { badge: person.actif ? publicBadge(await activeBadge(client, req.user.organisation_id, req.params.id)) : null };
});
export const createBadge = controller(async (req, client) => {
  const input = body(req, ["regenerate"]);
  if (input.regenerate !== undefined && typeof input.regenerate !== "boolean") fail(400, "Option de régénération invalide.");
  return { badge: await issue(client, req, req.params.id, input.regenerate === true) };
}, { write: true });
export const revokeBadge = controller(async (req, client) => {
  body(req, []);
  await personnel(client, req.user.organisation_id, req.params.id);
  const existing = await activeBadge(client, req.user.organisation_id, req.params.id);
  if (existing) {
    await client.query("UPDATE badges SET revoked_at = now(), revoked_by = $3 WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, existing.id, req.session.userId]);
    await audit(client, req, existing.id, "REVOKE");
  }
  return { badge: null };
}, { write: true });
export const prepareBadges = controller(async (req, client) => {
  body(req, []);
  const { rows } = await client.query("SELECT id FROM personnel WHERE organisation_id = $1 AND actif = true ORDER BY nom, prenom, id", [req.user.organisation_id]);
  const badges = [];
  for (const row of rows) badges.push(await issue(client, req, String(row.id)));
  return { badges };
}, { write: true });

export const getBadgeEvents = controller(async (req, client) => {
  const org = req.user.organisation_id;
  const attendance = await client.query(`SELECT p.id, p.personnel_id AS "agentId", to_char(p.date_presence, 'YYYY-MM-DD') AS date,
    coalesce(to_char(p.arrivee_at AT TIME ZONE o.fuseau_horaire, 'HH24:MI'), '') AS "arrivalAt",
    coalesce(to_char(p.depart_at AT TIME ZONE o.fuseau_horaire, 'HH24:MI'), '') AS "departureAt",
    p.statut AS status, p.retard_minutes AS "lateMinutes", p.source, p.remarque AS note
    FROM presences_journalieres p JOIN organisations o ON o.id = p.organisation_id WHERE p.organisation_id = $1 ORDER BY p.date_presence DESC, p.id`, [org]);
  const scans = await client.query(`SELECT id, personnel_id AS "agentId", type, horodatage AS at FROM pointages
    WHERE organisation_id = $1 AND source = 'QR_SCAN' ORDER BY horodatage DESC, id DESC LIMIT 100`, [org]);
  return { attendance: attendance.rows, scans: scans.rows };
}, { coordinator: false });

export const scanBadge = controller(async (req, client) => {
  const input = body(req, ["token", "cle_idempotence"]);
  if (typeof input.token !== "string" || !/^presence:v1:[1-9]\d{0,18}:[a-f0-9]{64}$/.test(input.token)
    || typeof input.cle_idempotence !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cle_idempotence)) fail(400, "Code QR ou identifiant de requête invalide.");
  const org = req.user.organisation_id;
  const { rows } = await client.query(`SELECT b.id, b.personnel_id, p.nom, p.prenom FROM badges b
    JOIN personnel p ON p.id = b.personnel_id AND p.organisation_id = b.organisation_id
    WHERE b.organisation_id = $1 AND b.token_hash = $2 AND b.revoked_at IS NULL AND p.actif = true`, [org, hashBadgeToken(input.token)]);
  const badge = rows[0];
  if (!badge) fail(404, "QR inconnu, révoqué ou agent inactif dans cette organisation.");
  const duplicate = await client.query("SELECT type, personnel_id FROM pointages WHERE organisation_id = $1 AND cle_idempotence = $2", [org, input.cle_idempotence]);
  if (duplicate.rows[0]) {
    if (String(duplicate.rows[0].personnel_id) !== String(badge.personnel_id)) fail(409, "Identifiant de requête déjà utilisé.");
    return { type: duplicate.rows[0].type, message: "Pointage déjà enregistré." };
  }
  const clock = (await client.query(`SELECT CURRENT_TIMESTAMP AS now, to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'YYYY-MM-DD') AS date,
    to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'HH24:MI') AS time,
    extract(dow FROM CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire)::int AS day FROM organisations WHERE id = $1`, [org])).rows[0];
  const latest = (await client.query("SELECT type, horodatage FROM pointages WHERE organisation_id = $1 AND personnel_id = $2 ORDER BY horodatage DESC, id DESC LIMIT 1", [org, badge.personnel_id])).rows[0];
  if (latest && new Date(clock.now) - new Date(latest.horodatage) < 60000) fail(409, "Pointage déjà reçu. Patientez une minute avant le prochain scan.");
  const type = latest?.type === "ARRIVAL" ? "DEPARTURE" : "ARRIVAL";
  if (type === "ARRIVAL") {
    const schedules = (await client.query(`SELECT jour_semaine, fin_jour_suivant, to_char(heure_debut, 'HH24:MI') AS start,
      to_char(heure_fin, 'HH24:MI') AS end, tolerance_retard_minutes AS tolerance FROM horaires_travail
      WHERE organisation_id = $1 AND jour_travaille = true ORDER BY heure_debut`, [org])).rows;
    const previous = schedules.find(s => s.jour_semaine === (clock.day + 6) % 7 && s.fin_jour_suivant && clock.time < s.end);
    const today = schedules.filter(s => s.jour_semaine === clock.day);
    const schedule = previous ?? today.find(s => clock.time >= s.start && (s.fin_jour_suivant || clock.time < s.end)) ?? today.find(s => clock.time < s.start) ?? today.at(-1);
    if (!schedule) fail(409, "Aucun créneau travaillé pour cette arrivée.");
    const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const late = Math.max(0, minutes(clock.time) + (previous ? 1440 : 0) - minutes(schedule.start) - schedule.tolerance);
    let date = clock.date;
    if (previous) { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - 1); date = day.toISOString().slice(0, 10); }
    await client.query(`INSERT INTO presences_journalieres (organisation_id, personnel_id, date_presence, arrivee_at, statut, retard_minutes, source)
      VALUES ($1, $2, $3, $4, $5, $6, 'QR_SCAN') ON CONFLICT (organisation_id, personnel_id, date_presence) DO UPDATE SET
      arrivee_at = coalesce(presences_journalieres.arrivee_at, EXCLUDED.arrivee_at), depart_at = NULL,
      statut = CASE WHEN presences_journalieres.arrivee_at IS NULL THEN EXCLUDED.statut ELSE presences_journalieres.statut END,
      retard_minutes = CASE WHEN presences_journalieres.arrivee_at IS NULL THEN EXCLUDED.retard_minutes ELSE presences_journalieres.retard_minutes END,
      source = 'QR_SCAN', updated_at = now()`, [org, badge.personnel_id, date, clock.now, late ? "LATE" : "PRESENT", late]);
  } else {
    const open = (await client.query("SELECT id FROM presences_journalieres WHERE organisation_id = $1 AND personnel_id = $2 AND arrivee_at IS NOT NULL AND depart_at IS NULL ORDER BY date_presence DESC LIMIT 1 FOR UPDATE", [org, badge.personnel_id])).rows[0];
    if (!open) fail(409, "Aucune arrivée ouverte à clôturer.");
    await client.query("UPDATE presences_journalieres SET depart_at = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2", [org, open.id, clock.now]);
  }
  await client.query(`INSERT INTO pointages (organisation_id, personnel_id, badge_id, type, horodatage, source, saisi_par, cle_idempotence)
    VALUES ($1, $2, $3, $4, $5, 'QR_SCAN', $6, $7)`, [org, badge.personnel_id, badge.id, type, clock.now, req.session.userId, input.cle_idempotence]);
  return { type, message: `${type === "ARRIVAL" ? "Arrivée" : "Départ"} de ${badge.prenom} ${badge.nom} enregistré à ${clock.time}.` };
}, { write: true, coordinator: false });

import pool from "../config/database.js";
import { loadAccount } from "./account.js";
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export const validId = value => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
export const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "0001-01-01" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validTime = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function inputBody(req, keys) {
  const value = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail(400, "Champs invalides.");
  return value;
}
export function reason(value) {
  if (typeof value !== "string" || value.trim().length < 5 || value.trim().length > 500) fail(400, "Un motif de 5 à 500 caractères est obligatoire.");
  return value.trim();
}
export function presenceController(action, { coordinator = false } = {}) {
  return async (req, res, next) => {
    let client;
    try {
      if (req.params.id && !validId(req.params.id)) fail(400, "Identifiant invalide.");
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [req.user.organisation_id]);
      const actor = await loadAccount(client, { id: String(req.session.userId), organisationId: req.user.organisation_id });
      if (!actor?.actif || String(actor.organisation_id) !== String(req.user.organisation_id) || (coordinator && actor.role !== "COORDINATOR")) fail(403, "Accès non autorisé.");
      const result = await action(req, client);
      await client.query("COMMIT");
      res.json(result);
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (["23514", "23502", "22007", "22008"].includes(error.code)) return res.status(400).json({ message: "Dates ou horaires incohérents." });
      next(error);
    } finally { client?.release(); }
  };
}
export async function auditPresence(client, req, entity, id, action, before, after, motif) {
  await client.query(`INSERT INTO journal_audit (organisation_id, acteur_id, entite, entite_id, action, motif, avant, apres)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, [req.user.organisation_id, req.session.userId, entity, id, action, motif, JSON.stringify(before), JSON.stringify(after)]);
}
export const attendanceSelect = `SELECT p.id, p.personnel_id AS "agentId", to_char(p.date_presence, 'YYYY-MM-DD') AS date,
  p.periode,
  coalesce(to_char(p.arrivee_at AT TIME ZONE o.fuseau_horaire, 'HH24:MI'), '') AS "arrivalAt",
  coalesce(to_char(p.depart_at AT TIME ZONE o.fuseau_horaire, 'HH24:MI'), '') AS "departureAt",
  coalesce(to_char(p.arrivee_at AT TIME ZONE o.fuseau_horaire, 'YYYY-MM-DD'), '') AS "arrivalDate",
  coalesce(to_char(p.depart_at AT TIME ZONE o.fuseau_horaire, 'YYYY-MM-DD'), '') AS "departureDate",
  p.statut AS status, p.retard_minutes AS "lateMinutes", p.source, p.remarque AS note,
  p.updated_at::text AS version FROM presences_journalieres p JOIN organisations o ON o.id = p.organisation_id`;
export async function attendanceById(client, org, id) {
  const row = (await client.query(attendanceSelect + " WHERE p.organisation_id = $1 AND p.id = $2", [org, id])).rows[0];
  if (!row) fail(404, "Relevé introuvable.");
  return row;
}
// Materialize missing absences per slot (MATIN, APRES_MIDI, SOIR) as soon as its cutoff has passed.
// Never replace an arrival or an explicit manual correction.
export async function reconcileAbsences(client, org, start, end) {
  await client.query(`WITH days AS (
    SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
  ), expected AS (
    SELECT p.id AS person, d.day, h.periode,
      ((d.day + h.heure_limite_absence +
        CASE WHEN h.fin_jour_suivant AND h.heure_limite_absence < h.heure_debut THEN interval '1 day' ELSE interval '0 day' END)
        AT TIME ZONE o.fuseau_horaire) AS cutoff,
      EXISTS (SELECT 1 FROM absences_autorisees a WHERE a.organisation_id = $1 AND a.personnel_id = p.id AND a.annule_at IS NULL
        AND d.day BETWEEN a.date_debut AND a.date_fin AND (a.type = 'LEAVE' OR
          (NOT h.fin_jour_suivant AND a.heure_debut <= h.heure_debut AND a.heure_fin >= h.heure_fin))) AS justified
    FROM days d JOIN organisations o ON o.id = $1
    JOIN personnel p ON p.organisation_id = o.id AND p.actif = true
      AND d.day >= (p.created_at AT TIME ZONE o.fuseau_horaire)::date
      AND (p.date_embauche IS NULL OR d.day >= least(p.date_embauche, (CURRENT_TIMESTAMP AT TIME ZONE o.fuseau_horaire)::date))
    JOIN horaires_travail h ON h.organisation_id = o.id AND h.jour_travaille = true AND h.jour_semaine = extract(dow FROM d.day)
  ) INSERT INTO presences_journalieres (organisation_id, personnel_id, date_presence, periode, statut, retard_minutes, source)
    SELECT $1, person, day, periode, CASE WHEN justified THEN 'JUSTIFIED' ELSE 'ABSENT' END, 0, 'AUTOMATIC' FROM expected WHERE cutoff <= CURRENT_TIMESTAMP
    ON CONFLICT (organisation_id, personnel_id, date_presence, periode) DO UPDATE SET statut = EXCLUDED.statut, updated_at = now()
    WHERE presences_journalieres.source = 'AUTOMATIC' AND presences_journalieres.arrivee_at IS NULL
      AND presences_journalieres.statut IS DISTINCT FROM EXCLUDED.statut`, [org, start, end]);
}
export function lateForArrival(schedules, date, arrivalDate, time) {
  const offset = (Date.parse(arrivalDate) - Date.parse(date)) / 86400000;
  const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const arrival = offset * 1440 + minute(time);
  const slots = schedules.map(s => ({ ...s, begin: minute(s.start), finish: minute(s.end) + (s.fin_jour_suivant ? 1440 : 0) })).sort((a,b) => a.begin-b.begin);
  const slot = slots.find(s => arrival >= s.begin && arrival < s.finish) ?? slots.find(s => arrival < s.begin) ?? slots.at(-1);
  if (!slot || offset < 0 || offset > 1 || (offset === 1 && (!slot.fin_jour_suivant || arrival >= slot.finish))) fail(400, "L’arrivée ne correspond pas aux créneaux de cette journée.");
  return Math.max(0, arrival - slot.begin - slot.tolerance);
}

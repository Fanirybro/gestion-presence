import pool from "../config/database.js";
import { loadAccount } from "../utils/account.js";

const organisationColumns = "id, nom, slug, adresse, fuseau_horaire, organisation_code";
const periods = ["MATIN", "APRES_MIDI", "SOIR"];
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function object(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid("Champs de paramètres invalides.");
}
function minutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid("Les heures doivent être au format HH:MM.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function validateParametres(body) {
  object(body, ["nom", "adresse", "horaires"]);
  if (typeof body.nom !== "string" || !body.nom.trim() || body.nom.trim().length > 100) invalid("Le nom de l’organisation doit contenir entre 1 et 100 caractères.");
  if (body.adresse !== null && (typeof body.adresse !== "string" || body.adresse.trim().length > 500)) invalid("Adresse invalide (500 caractères maximum).");
  if (!Array.isArray(body.horaires) || body.horaires.length !== 21) invalid("Renseignez les trois créneaux de chacun des sept jours.");
  const days = new Set();
  const intervals = [];
  const horaires = body.horaires.map(row => {
    object(row, ["jour_semaine", "periode", "fin_jour_suivant", "jour_travaille", "heure_debut", "heure_fin", "heure_limite_absence", "tolerance_retard_minutes"]);
    const { jour_semaine: day, jour_travaille: working, tolerance_retard_minutes: tolerance } = row;
    const key = `${day}:${row.periode}`;
    if (!Number.isInteger(day) || day < 0 || day > 6 || !periods.includes(row.periode) || days.has(key)) invalid("Chaque jour doit contenir exactement un créneau matin, après-midi et soir.");
    days.add(key);
    if (typeof row.fin_jour_suivant !== "boolean" || (row.fin_jour_suivant && (!working || row.periode !== "SOIR"))) invalid("Seul un créneau du soir travaillé peut finir le lendemain.");
    if (typeof working !== "boolean" || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 32767) invalid("Jour ouvré ou tolérance invalide.");
    if (working) {
      const start = minutes(row.heure_debut), end = minutes(row.heure_fin) + (row.fin_jour_suivant ? 1440 : 0);
      let cutoff = minutes(row.heure_limite_absence);
      if (row.fin_jour_suivant && cutoff < start) cutoff += 1440;
      if (end <= start || end - start >= 1440 || tolerance > end - start || cutoff < start + tolerance || cutoff > end) invalid("Chaque créneau doit durer moins de 24 h, avec une fin après le début et un seuil d’absence entre la fin de tolérance et la fin du créneau.");
      intervals.push({ day, period: periods.indexOf(row.periode), start: day * 1440 + start, end: day * 1440 + end });
    } else if ([row.heure_debut, row.heure_fin, row.heure_limite_absence].some(value => value !== null)) invalid("Les heures d’un jour non travaillé doivent être nulles.");
    return { ...row, tolerance_retard_minutes: working ? tolerance : 0 };
  });
  intervals.sort((a, b) => a.day - b.day || a.period - b.period);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start < intervals[i - 1].end) invalid("Les créneaux doivent suivre l’ordre matin, après-midi, soir et ne pas se chevaucher, même le lendemain.");
  }
  if (intervals.length && intervals.at(-1).end > intervals[0].start + 7 * 1440) invalid("Le créneau du samedi soir chevauche celui du dimanche.");
  return { nom: body.nom.trim(), adresse: body.adresse?.trim() || null, horaires };
}
async function read(client, organisationId) {
  const org = await client.query(`SELECT ${organisationColumns} FROM organisations WHERE id = $1 AND actif = true`, [organisationId]);
  if (!org.rows[0]) throw Object.assign(new Error("Organisation introuvable."), { status: 404 });
  const horaires = await client.query(`SELECT jour_semaine, periode, fin_jour_suivant, jour_travaille, to_char(heure_debut, 'HH24:MI') AS heure_debut,
    to_char(heure_fin, 'HH24:MI') AS heure_fin, to_char(heure_limite_absence, 'HH24:MI') AS heure_limite_absence,
    tolerance_retard_minutes FROM horaires_travail WHERE organisation_id = $1 ORDER BY jour_semaine, CASE periode WHEN 'MATIN' THEN 0 WHEN 'APRES_MIDI' THEN 1 ELSE 2 END`, [organisationId]);
  return { organisation: org.rows[0], horaires: horaires.rows };
}
export async function getParametres(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await read(client, req.user.organisation_id);
    await client.query("COMMIT");
    res.json(result);
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally { client?.release(); }
}
export async function updateParametres(req, res, next) {
  let client, transaction = false;
  try {
    const data = validateParametres(req.body);
    const organisationId = req.user.organisation_id;
    client = await pool.connect();
    await client.query("BEGIN"); transaction = true;
    await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [organisationId]);
    const actor = await loadAccount(client, { id: String(req.session.userId), organisationId });
    if (!actor?.actif || !actor.organisation_id || actor.role !== "COORDINATOR") throw Object.assign(new Error("Accès réservé au coordinateur actif."), { status: 403 });
    const before = await read(client, organisationId);
    await client.query("UPDATE organisations SET nom = $2, adresse = $3, updated_at = now() WHERE id = $1", [organisationId, data.nom, data.adresse]);
    for (const row of data.horaires) {
      await client.query(`INSERT INTO horaires_travail (organisation_id, jour_semaine, jour_travaille, heure_debut, heure_fin, heure_limite_absence, tolerance_retard_minutes, periode, fin_jour_suivant)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (organisation_id, jour_semaine, periode) DO UPDATE SET jour_travaille = EXCLUDED.jour_travaille,
        heure_debut = EXCLUDED.heure_debut, heure_fin = EXCLUDED.heure_fin, heure_limite_absence = EXCLUDED.heure_limite_absence,
        tolerance_retard_minutes = EXCLUDED.tolerance_retard_minutes, fin_jour_suivant = EXCLUDED.fin_jour_suivant, updated_at = now()`,
      [organisationId, row.jour_semaine, row.jour_travaille, row.heure_debut, row.heure_fin, row.heure_limite_absence, row.tolerance_retard_minutes, row.periode, row.fin_jour_suivant]);
    }
    const result = await read(client, organisationId);
    await client.query(`INSERT INTO journal_audit (organisation_id, acteur_id, entite, entite_id, action, avant, apres)
      VALUES ($1, $2, 'parametres', $1, 'UPDATE', $3::jsonb, $4::jsonb)`, [organisationId, req.session.userId, JSON.stringify(before), JSON.stringify(result)]);
    await client.query("COMMIT"); transaction = false;
    res.json(result);
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally { client?.release(); }
}

import { presenceController, inputBody, fail, validDate, validTime, reason, attendanceSelect, attendanceById, auditPresence, reconcileAbsences, lateForArrival } from "../utils/presence.js";

export const listPresences = presenceController(async (req, client) => {
  const { start, end } = req.query;
  if (!validDate(start) || !validDate(end) || end < start || Date.parse(end) - Date.parse(start) > 92 * 86400000) fail(400, "Choisissez une période valide de 93 jours maximum.");
  const org = req.user.organisation_id;
  await reconcileAbsences(client, org, start, end);
  const { rows } = await client.query(attendanceSelect + " WHERE p.organisation_id = $1 AND p.date_presence BETWEEN $2::date AND $3::date ORDER BY p.date_presence DESC, p.id", [org, start, end]);
  return { attendance: rows };
});
export const getPresence = presenceController(async (req, client) => {
  const org = req.user.organisation_id;
  const attendance = await attendanceById(client, org, req.params.id);
  const audit = await client.query(`SELECT j.id, j.entite_id AS "entityId", j.created_at AS at, j.action, coalesce(j.motif,'') AS reason,
    concat_ws(' ', u.prenom, u.nom) AS actor FROM journal_audit j LEFT JOIN users u ON u.id = j.acteur_id
    WHERE j.organisation_id = $1 AND j.entite = 'presences_journalieres' AND j.entite_id = $2 ORDER BY j.created_at DESC, j.id DESC`, [org, req.params.id]);
  return { attendance, audit: audit.rows };
});
export const correctPresence = presenceController(async (req, client) => {
  const body = inputBody(req, ["arrival", "departure", "arrivalDate", "departureDate", "reason", "version"]);
  const motif = reason(body.reason), org = req.user.organisation_id;
  const before = await attendanceById(client, org, req.params.id);
  if (typeof body.version !== "string" || body.version !== before.version) fail(409, "Ce relevé a été modifié. Rechargez-le avant de corriger.");
  const arrival = body.arrival || "", departure = body.departure || "";
  if ((arrival && !validTime(arrival)) || (departure && !validTime(departure)) || (departure && !arrival)) fail(400, "Horaires invalides.");
  const arrivalDate = body.arrivalDate || before.date, departureDate = body.departureDate || arrivalDate;
  if (!validDate(arrivalDate) || !validDate(departureDate)) fail(400, "Date invalide.");
  if (departure && (departureDate + departure <= arrivalDate + arrival || Date.parse(departureDate) - Date.parse(arrivalDate) > 86400000)) fail(400, "Le départ doit suivre l’arrivée, au plus tard le lendemain.");
  let late = 0;
  if (arrival) {
    const schedules = (await client.query(`SELECT to_char(heure_debut,'HH24:MI') AS start, to_char(heure_fin,'HH24:MI') AS end,
      fin_jour_suivant, tolerance_retard_minutes AS tolerance FROM horaires_travail WHERE organisation_id=$1 AND jour_travaille=true
      AND jour_semaine=extract(dow FROM $2::date)`, [org, before.date])).rows;
    late = lateForArrival(schedules, before.date, arrivalDate, arrival);
  }
  const clock = (await client.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'YYYY-MM-DD HH24:MI') AS local FROM organisations WHERE id=$1", [org])).rows[0].local;
  if (before.date > clock.slice(0,10) || (arrival && arrivalDate + ' ' + arrival > clock) || (departure && departureDate + ' ' + departure > clock)) fail(400, "Un pointage ne peut pas être dans le futur.");
  await client.query(`UPDATE presences_journalieres p SET
    arrivee_at=CASE WHEN $3::text IS NULL THEN NULL ELSE $3::timestamp AT TIME ZONE o.fuseau_horaire END,
    depart_at=CASE WHEN $4::text IS NULL THEN NULL ELSE $4::timestamp AT TIME ZONE o.fuseau_horaire END,
    statut=$5, retard_minutes=$6, source='MANUAL', remarque=$7, updated_at=clock_timestamp()
    FROM organisations o WHERE p.organisation_id=$1 AND p.id=$2 AND o.id=p.organisation_id`,
    [org, before.id, arrival ? arrivalDate + ' ' + arrival : null, departure ? departureDate + ' ' + departure : null, arrival ? (late ? 'LATE' : 'PRESENT') : 'ABSENT', late, motif]);
  const attendance = await attendanceById(client, org, before.id);
  await auditPresence(client, req, 'presences_journalieres', before.id, 'CORRECT', before, attendance, motif);
  return { attendance };
}, { coordinator: true });
export const justifyAbsence = presenceController(async (req, client) => {
  const body = inputBody(req, ["reason", "version"]), motif = reason(body.reason), org = req.user.organisation_id;
  const before = await attendanceById(client, org, req.params.id);
  if (typeof body.version !== "string" || body.version !== before.version) fail(409, "Ce relevé a été modifié. Rechargez-le.");
  if (!["ABSENT", "JUSTIFIED"].includes(before.status)) fail(409, "Seule une absence peut être justifiée.");
  await client.query("UPDATE presences_journalieres SET statut='JUSTIFIED', source='MANUAL', remarque=$3, updated_at=clock_timestamp() WHERE organisation_id=$1 AND id=$2", [org, before.id, motif]);
  const attendance = await attendanceById(client, org, before.id);
  await auditPresence(client, req, 'presences_journalieres', before.id, 'JUSTIFY', before, attendance, motif);
  return { attendance };
}, { coordinator: true });

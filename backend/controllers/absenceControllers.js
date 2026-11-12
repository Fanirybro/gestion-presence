import { presenceController, fail, inputBody, validId, validDate, validTime, auditPresence } from "../utils/presence.js";
const select = `SELECT a.id, a.personnel_id AS "agentId", a.type, to_char(a.date_debut,'YYYY-MM-DD') AS start, to_char(a.date_fin,'YYYY-MM-DD') AS end,
  to_char(a.heure_debut,'HH24:MI') AS "from", to_char(a.heure_fin,'HH24:MI') AS "to", a.remarque AS remark, a.annule_at IS NOT NULL AS cancelled,
  a.updated_at::text AS version FROM absences_autorisees a`;

const list = async (client, org, accessibleDivisions = null) => {
  let query = select + ` JOIN personnel p ON p.id = a.personnel_id WHERE a.organisation_id = $1`;
  const params = [org];
  if (accessibleDivisions !== null) {
    params.push(accessibleDivisions);
    query += ` AND p.division_id::text = ANY($2)`;
  }
  query += ` ORDER BY a.date_debut DESC, a.id DESC`;
  return (await client.query(query, params)).rows;
};

async function find(client, org, id) {
  const row = (await client.query(select + " WHERE a.organisation_id=$1 AND a.id=$2", [org, id])).rows[0];
  if (!row) fail(404, "Absence autorisée introuvable.");
  return row;
}

export const listAbsences = presenceController(async (req, client) => {
  const accessibleDivisions = req.actor?.role === "COORDINATOR" ? null : (Array.isArray(req.actor?.managed_division_ids) ? req.actor.managed_division_ids.map(String) : []);
  return { absences: await list(client, req.user.organisation_id, accessibleDivisions) };
});

export const saveAbsence = presenceController(async (req, client) => {
  const b = inputBody(req, ["agentId", "type", "start", "end", "from", "to", "remark", "version"]), org = req.user.organisation_id;
  if (!validId(b.agentId) || !["LEAVE", "PERMISSION"].includes(b.type) || !validDate(b.start) || !validDate(b.end) || b.end < b.start || Date.parse(b.end) - Date.parse(b.start) > 366 * 86400000
    || typeof b.remark !== "string" || b.remark.length > 500) fail(400, "Vérifiez l’agent, le type, les dates (un an maximum) et le motif.");
  if (b.type === "PERMISSION" && (b.start !== b.end || !validTime(b.from) || !validTime(b.to) || b.to <= b.from)) fail(400, "Une permission doit commencer et finir dans la même journée, avec une fin après le début.");
  if (b.type === "LEAVE" && (b.from || b.to)) fail(400, "Un congé ne contient pas d’horaires.");
  const before = req.params.id ? await find(client, org, req.params.id) : null;
  if (before && (before.cancelled || before.version !== b.version)) fail(409, "Enregistrement annulé ou modifié. Rechargez la liste.");
  const person = (await client.query("SELECT id, actif, division_id FROM personnel WHERE organisation_id=$1 AND id=$2", [org, b.agentId])).rows[0];
  if (!person || (!person.actif && before?.agentId !== b.agentId)) fail(400, "Choisissez un agent actif de cette organisation.");

  if (req.actor?.role !== "COORDINATOR") {
    const managed = Array.isArray(req.actor?.managed_division_ids) ? req.actor.managed_division_ids.map(String) : [];
    if (!managed.includes(String(person.division_id))) {
      fail(403, "Accès refusé : cet agent appartient à une autre division / niveau.");
    }
    if (before) {
      const beforePerson = (await client.query("SELECT division_id FROM personnel WHERE organisation_id=$1 AND id=$2", [org, before.agentId])).rows[0];
      if (!beforePerson || !managed.includes(String(beforePerson.division_id))) {
        fail(403, "Accès refusé : cette absence concerne une autre division / niveau.");
      }
    }
  }

  const overlaps = await client.query(`SELECT id FROM absences_autorisees WHERE organisation_id=$1 AND personnel_id=$2 AND annule_at IS NULL
    AND ($3::bigint IS NULL OR id<>$3) AND date_debut<=$5::date AND date_fin>=$4::date
    AND (type='LEAVE' OR $6='LEAVE' OR (heure_debut<$8::time AND heure_fin>$7::time)) LIMIT 1`,
    [org, b.agentId, before?.id ?? null, b.start, b.end, b.type, b.from || null, b.to || null]);
  if (overlaps.rows.length) fail(409, "Une absence autorisée couvre déjà cette période.");
  let id = before?.id;
  const values = [org, b.agentId, b.type, b.start, b.end, b.type === 'PERMISSION' ? b.from : null, b.type === 'PERMISSION' ? b.to : null, b.remark.trim(), req.session.userId];
  if (before) await client.query(`UPDATE absences_autorisees SET personnel_id=$2,type=$3,date_debut=$4,date_fin=$5,heure_debut=$6,heure_fin=$7,
    remarque=$8,updated_by=$9,updated_at=clock_timestamp() WHERE organisation_id=$1 AND id=$10`, [...values, id]);
  else id = (await client.query(`INSERT INTO absences_autorisees (organisation_id,personnel_id,type,date_debut,date_fin,heure_debut,heure_fin,remarque,created_by,updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`, values)).rows[0].id;
  const after = await find(client, org, id);
  await auditPresence(client, req, 'absences_autorisees', id, before ? 'UPDATE' : 'CREATE', before, after, b.remark.trim());
  const accessibleDivisions = req.actor?.role === "COORDINATOR" ? null : (Array.isArray(req.actor?.managed_division_ids) ? req.actor.managed_division_ids.map(String) : []);
  return { absences: await list(client, org, accessibleDivisions) };
});

export const cancelAbsence = presenceController(async (req, client) => {
  const b = inputBody(req, ["version"]), org = req.user.organisation_id;
  const before = await find(client, org, req.params.id);
  if (before.version !== b.version) fail(409, "Enregistrement modifié. Rechargez la liste.");
  if (req.actor?.role !== "COORDINATOR") {
    const beforePerson = (await client.query("SELECT division_id FROM personnel WHERE organisation_id=$1 AND id=$2", [org, before.agentId])).rows[0];
    const managed = Array.isArray(req.actor?.managed_division_ids) ? req.actor.managed_division_ids.map(String) : [];
    if (!beforePerson || !managed.includes(String(beforePerson.division_id))) {
      fail(403, "Accès refusé : cette absence concerne une autre division / niveau.");
    }
  }
  if (!before.cancelled) {
    await client.query("UPDATE absences_autorisees SET annule_at=now(),annule_par=$3,updated_by=$3,updated_at=clock_timestamp() WHERE organisation_id=$1 AND id=$2", [org, before.id, req.session.userId]);
    await auditPresence(client, req, 'absences_autorisees', before.id, 'CANCEL', before, await find(client, org, before.id), 'Annulation');
  }
  const accessibleDivisions = req.actor?.role === "COORDINATOR" ? null : (Array.isArray(req.actor?.managed_division_ids) ? req.actor.managed_division_ids.map(String) : []);
  return { absences: await list(client, org, accessibleDivisions) };
});

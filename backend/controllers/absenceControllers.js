import { presenceController, fail, inputBody, validId, validDate, validTime, auditPresence } from "../utils/presence.js";
const select = `SELECT id, personnel_id AS "agentId", type, to_char(date_debut,'YYYY-MM-DD') AS start, to_char(date_fin,'YYYY-MM-DD') AS end,
  to_char(heure_debut,'HH24:MI') AS "from", to_char(heure_fin,'HH24:MI') AS "to", remarque AS remark, annule_at IS NOT NULL AS cancelled,
  updated_at::text AS version FROM absences_autorisees WHERE organisation_id=$1`;
const list = async (client, org) => (await client.query(select + " ORDER BY date_debut DESC, id DESC", [org])).rows;
async function find(client, org, id) {
  const row = (await client.query(select + " AND id=$2", [org,id])).rows[0];
  if (!row) fail(404,"Absence autorisée introuvable.");
  return row;
}
export const listAbsences = presenceController(async (req, client) => ({ absences: await list(client,req.user.organisation_id) }));
export const saveAbsence = presenceController(async (req, client) => {
  const b=inputBody(req,["agentId","type","start","end","from","to","remark","version"]), org=req.user.organisation_id;
  if (!validId(b.agentId) || !["LEAVE","PERMISSION"].includes(b.type) || !validDate(b.start) || !validDate(b.end) || b.end<b.start || Date.parse(b.end)-Date.parse(b.start)>366*86400000
    || typeof b.remark!=="string" || b.remark.length>500) fail(400,"Vérifiez l’agent, le type, les dates (un an maximum) et le motif.");
  if (b.type==="PERMISSION" && (b.start!==b.end || !validTime(b.from) || !validTime(b.to) || b.to<=b.from)) fail(400,"Une permission doit commencer et finir dans la même journée, avec une fin après le début.");
  if (b.type==="LEAVE" && (b.from || b.to)) fail(400,"Un congé ne contient pas d’horaires.");
  const before=req.params.id ? await find(client,org,req.params.id) : null;
  if (before && (before.cancelled || before.version!==b.version)) fail(409,"Enregistrement annulé ou modifié. Rechargez la liste.");
  const person=(await client.query("SELECT id, actif FROM personnel WHERE organisation_id=$1 AND id=$2",[org,b.agentId])).rows[0];
  if (!person || (!person.actif && before?.agentId!==b.agentId)) fail(400,"Choisissez un agent actif de cette organisation.");
  const overlaps=await client.query(`SELECT id FROM absences_autorisees WHERE organisation_id=$1 AND personnel_id=$2 AND annule_at IS NULL
    AND ($3::bigint IS NULL OR id<>$3) AND date_debut<=$5::date AND date_fin>=$4::date
    AND (type='LEAVE' OR $6='LEAVE' OR (heure_debut<$8::time AND heure_fin>$7::time)) LIMIT 1`,
    [org,b.agentId,before?.id??null,b.start,b.end,b.type,b.from||null,b.to||null]);
  if (overlaps.rows.length) fail(409,"Une absence autorisée couvre déjà cette période.");
  let id=before?.id;
  const values=[org,b.agentId,b.type,b.start,b.end,b.type==='PERMISSION'?b.from:null,b.type==='PERMISSION'?b.to:null,b.remark.trim(),req.session.userId];
  if (before) await client.query(`UPDATE absences_autorisees SET personnel_id=$2,type=$3,date_debut=$4,date_fin=$5,heure_debut=$6,heure_fin=$7,
    remarque=$8,updated_by=$9,updated_at=clock_timestamp() WHERE organisation_id=$1 AND id=$10`,[...values,id]);
  else id=(await client.query(`INSERT INTO absences_autorisees (organisation_id,personnel_id,type,date_debut,date_fin,heure_debut,heure_fin,remarque,created_by,updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,values)).rows[0].id;
  const after=await find(client,org,id);
  await auditPresence(client,req,'absences_autorisees',id,before?'UPDATE':'CREATE',before,after,b.remark.trim());
  return {absences:await list(client,org)};
},{coordinator:true});
export const cancelAbsence = presenceController(async (req,client)=>{
  const b=inputBody(req,["version"]),org=req.user.organisation_id;
  const before=await find(client,org,req.params.id);
  if(before.version!==b.version) fail(409,"Enregistrement modifié. Rechargez la liste.");
  if(!before.cancelled){
    await client.query("UPDATE absences_autorisees SET annule_at=now(),annule_par=$3,updated_by=$3,updated_at=clock_timestamp() WHERE organisation_id=$1 AND id=$2",[org,before.id,req.session.userId]);
    await auditPresence(client,req,'absences_autorisees',before.id,'CANCEL',before,await find(client,org,before.id),'Annulation');
  }
  return {absences:await list(client,org)};
},{coordinator:true});

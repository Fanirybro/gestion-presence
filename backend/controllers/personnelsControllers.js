import { insertBadge } from "../utils/createBadge.js";
import pool from "../config/database.js";
import { loadAccount } from "../utils/account.js";

const columns = `p.id, p.organisation_id, p.departement_id, p.utilisateur_id,
  p.nom, p.prenom, to_char(p.date_naissance, 'YYYY-MM-DD') AS date_naissance,
  p.poste, to_char(p.date_embauche, 'YYYY-MM-DD') AS date_embauche, p.actif, p.created_at, p.updated_at`;
const fields = ["nom", "prenom", "date_naissance", "departement_id", "utilisateur_id", "poste", "date_embauche", "actif"];
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function id(value) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
function body(req, allowed) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
    || !Object.keys(req.body).length || Object.keys(req.body).some(key => !allowed.includes(key))) {
    fail(400, "Champs invalides ou non autorisés.");
  }
  return req.body;
}
function name(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) fail(400, `${label} : 1 à 100 caractères requis.`);
  return value.trim();
}
function date(value, label, optional = false) {
  if (optional && (value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01"
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, `${label} invalide.`);
  return value;
}
function controller(action, { write = false, byId = false } = {}) {
  return async (req, res, next) => {
    let client;
    let transaction = false;
    try {
      if (byId && !id(req.params.id)) fail(400, "Identifiant invalide.");
      client = await pool.connect();
      if (write) {
        await client.query("BEGIN"); transaction = true;
        await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [req.user.organisation_id]);
        const actor = await loadAccount(client, { id: String(req.session.userId), organisationId: req.user.organisation_id });
        if (!actor?.actif || !actor.organisation_id || actor.role !== "COORDINATOR") fail(403, "Accès réservé au coordinateur actif de cette organisation.");
      }
      const result = await action(req, client);
      if (transaction) { await client.query("COMMIT"); transaction = false; }
      res.status(result.status ?? 200).json(result.body);
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => {});
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === "23505") return res.status(409).json({ message: "Ce nom de département ou cet utilisateur est déjà utilisé dans cette organisation." });
      if (["23503", "23514", "23502"].includes(error.code)) return res.status(400).json({ message: "Les informations ne respectent pas les contraintes du personnel. Vérifiez les dates et les rattachements." });
      next(error);
    } finally { client?.release(); }
  };
}
async function find(client, organisationId, personnelId) {
  const { rows } = await client.query(`SELECT ${columns} FROM personnel p WHERE p.organisation_id = $1 AND p.id = $2`, [organisationId, personnelId]);
  if (!rows[0]) fail(404, "Agent introuvable.");
  return rows[0];
}
async function audit(client, req, entity, entityId, action, before, after) {
  await client.query(`INSERT INTO journal_audit (organisation_id, acteur_id, entite, entite_id, action, avant, apres)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
  [req.user.organisation_id, req.session.userId, entity, entityId, action, JSON.stringify(before), JSON.stringify(after)]);
}
async function validatePersonnel(client, req, input, previous = {}) {
  const data = { ...previous, ...input };
  for (const key of ["nom", "prenom"]) data[key] = name(data[key], key);
  data.date_naissance = date(data.date_naissance, "Date de naissance");
  data.date_embauche = date(data.date_embauche ?? null, "Date d’embauche", true);
  if (data.date_embauche && data.date_embauche < data.date_naissance) fail(400, "L’embauche ne peut pas précéder la naissance.");
  const { rows: localDates } = await client.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE fuseau_horaire, 'YYYY-MM-DD') AS today FROM organisations WHERE id = $1", [req.user.organisation_id]);
  if (!localDates[0] || data.date_naissance > localDates[0].today) fail(400, "La date de naissance ne peut pas être dans le futur.");
  if (data.date_embauche && data.date_embauche > localDates[0].today) fail(400, "La date d’embauche ne peut pas être dans le futur.");
  if (data.poste == null || data.poste === "") data.poste = null;
  else data.poste = name(data.poste, "Poste");
  if (data.actif === undefined) data.actif = true;
  if (typeof data.actif !== "boolean") fail(400, "Statut invalide.");
  if (!id(data.departement_id)) fail(400, "Département requis.");
  const { rows: departments } = await client.query("SELECT id, actif FROM departements WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, data.departement_id]);
  if (!departments[0] || (!departments[0].actif && (String(previous.departement_id) !== data.departement_id || data.actif))) fail(400, "Choisissez un département actif de cette organisation.");
  if (data.utilisateur_id === undefined || data.utilisateur_id === "") data.utilisateur_id = null;
  if (data.utilisateur_id !== null) {
    if (!id(data.utilisateur_id)) fail(400, "Utilisateur invalide.");
    const { rows } = await client.query(`SELECT m.user_id FROM organisation_members m JOIN users u ON u.id = m.user_id
      WHERE m.organisation_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE' AND u.actif = true`, [req.user.organisation_id, data.utilisateur_id]);
    if (!rows[0] && String(previous.utilisateur_id) !== data.utilisateur_id) fail(400, "Choisissez un membre actif de cette organisation.");
  }
  return data;
}
export const getPersonnels = controller(async (req, client) => {
  const { rows } = await client.query(`SELECT ${columns} FROM personnel p WHERE p.organisation_id = $1 ORDER BY lower(p.nom), lower(p.prenom), p.id`, [req.user.organisation_id]);
  return { body: { personnel: rows } };
});
export const getPersonnel = controller(async (req, client) => ({ body: { personnel: await find(client, req.user.organisation_id, req.params.id) } }), { byId: true });
export const createPersonnel = controller(async (req, client) => {
  const data = await validatePersonnel(client, req, body(req, fields));
  const { rows } = await client.query(`INSERT INTO personnel (organisation_id, ${fields.join(", ")})
    VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`, [req.user.organisation_id, ...fields.map(key => data[key])]);
  const saved = await find(client, req.user.organisation_id, rows[0].id);
  await audit(client, req, "personnel", saved.id, "CREATE", null, saved);
  const badge = saved.actif ? await insertBadge(client, req.user.organisation_id, saved.id, req.session.userId) : null;
  return { status: 201, body: { personnel: saved, badge } };
}, { write: true });
export const updatePersonnel = controller(async (req, client) => {
  const input = body(req, fields);
  const previous = await find(client, req.user.organisation_id, req.params.id);
  const data = await validatePersonnel(client, req, input, previous);
  await client.query(`UPDATE personnel SET ${fields.map((key, i) => `${key} = $${i + 3}`).join(", ")}, updated_at = now()
    WHERE organisation_id = $1 AND id = $2`, [req.user.organisation_id, req.params.id, ...fields.map(key => data[key])]);
  if (previous.actif && !data.actif) {
    await client.query("UPDATE badges SET revoked_at = now(), revoked_by = $3 WHERE organisation_id = $1 AND personnel_id = $2 AND revoked_at IS NULL", [req.user.organisation_id, req.params.id, req.session.userId]);
  }
  const saved = await find(client, req.user.organisation_id, req.params.id);
  await audit(client, req, "personnel", saved.id, "UPDATE", previous, saved);
  return { body: { personnel: saved } };
}, { write: true, byId: true });
export const getDepartements = controller(async (req, client) => {
  const { rows } = await client.query("SELECT id, nom, actif FROM departements WHERE organisation_id = $1 ORDER BY lower(nom), id", [req.user.organisation_id]);
  return { body: { departements: rows } };
});
export const createDepartement = controller(async (req, client) => {
  const input = body(req, ["nom"]);
  const { rows } = await client.query("INSERT INTO departements (organisation_id, nom) VALUES ($1, $2) RETURNING id, nom, actif", [req.user.organisation_id, name(input.nom, "Nom du département")]);
  await audit(client, req, "departements", rows[0].id, "CREATE", null, rows[0]);
  return { status: 201, body: { departement: rows[0] } };
}, { write: true });
export const updateDepartement = controller(async (req, client) => {
  const input = body(req, ["nom", "actif"]);
  const { rows } = await client.query("SELECT id, nom, actif FROM departements WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, req.params.id]);
  if (!rows[0]) fail(404, "Département introuvable.");
  const data = { ...rows[0], ...input };
  data.nom = name(data.nom, "Nom du département");
  if (typeof data.actif !== "boolean") fail(400, "Statut invalide.");
  if (!data.actif) {
    const active = await client.query("SELECT id FROM personnel WHERE organisation_id = $1 AND departement_id = $2 AND actif = true LIMIT 1", [req.user.organisation_id, req.params.id]);
    if (active.rows.length) fail(409, "Réaffectez ou désactivez les agents actifs avant de désactiver ce département.");
  }
  await client.query("UPDATE departements SET nom = $3, actif = $4, updated_at = now() WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, req.params.id, data.nom, data.actif]);
  await audit(client, req, "departements", data.id, "UPDATE", rows[0], data);
  return { body: { departement: data } };
}, { write: true, byId: true });
export const getPersonnelMembers = controller(async (req, client) => {
  const { rows } = await client.query(`SELECT u.id, u.nom, u.prenom, (u.actif AND m.status = 'ACTIVE') AS actif
    FROM organisation_members m JOIN users u ON u.id = m.user_id WHERE m.organisation_id = $1 ORDER BY u.nom, u.prenom`, [req.user.organisation_id]);
  return { body: { membres: rows } };
});

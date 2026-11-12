import { insertBadge } from "../utils/createBadge.js";
import pool from "../config/database.js";
import { loadAccount } from "../utils/account.js";

const columns = `p.id, p.organisation_id, p.division_id, p.division_id AS departement_id, p.utilisateur_id,
  p.nom, p.prenom, to_char(p.date_naissance, 'YYYY-MM-DD') AS date_naissance,
  p.poste, to_char(p.date_embauche, 'YYYY-MM-DD') AS date_embauche, p.actif,
  COALESCE(p.metadata, '{}'::jsonb) AS metadata, p.created_at, p.updated_at,
  d.nom AS division_nom, d.nom AS departement_nom,
  (fp.id IS NOT NULL) AS is_enrolled, coalesce(fp.updated_at, fp.created_at) AS enrolled_at`;

const fields = ["nom", "prenom", "date_naissance", "division_id", "utilisateur_id", "poste", "date_embauche", "actif", "metadata"];
const allowedInputKeys = ["nom", "prenom", "date_naissance", "division_id", "departement_id", "utilisateur_id", "poste", "date_embauche", "actif", "metadata"];

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
      const actor = await loadAccount(client, { id: String(req.session.userId), organisationId: req.user.organisation_id });
      if (!actor?.actif || !actor.organisation_id) fail(401, "Compte indisponible.");
      const managedDivs = Array.isArray(actor.managed_division_ids) ? actor.managed_division_ids.map(String) : [];
      const accessibleDivisions = actor.role === "COORDINATOR" ? null : managedDivs;
      req.actor = actor;
      req.accessibleDivisions = accessibleDivisions;

      if (write) {
        await client.query("BEGIN"); transaction = true;
        await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [req.user.organisation_id]);
        if (actor.role !== "COORDINATOR" && (!managedDivs || managedDivs.length === 0)) {
          fail(403, "Accès réservé au coordinateur actif de cette organisation.");
        }
      }
      const result = await action(req, client);
      if (transaction) { await client.query("COMMIT"); transaction = false; }
      res.status(result.status ?? 200).json(result.body);
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => {});
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === "23505") return res.status(409).json({ message: "Ce nom de division ou cet utilisateur est déjà utilisé dans cette organisation." });
      if (["23503", "23514", "23502"].includes(error.code)) return res.status(400).json({ message: "Les informations ne respectent pas les contraintes du personnel. Vérifiez les dates et les rattachements." });
      next(error);
    } finally { client?.release(); }
  };
}
async function find(client, organisationId, personnelId) {
  const { rows } = await client.query(
    `SELECT ${columns} FROM personnel p LEFT JOIN divisions d ON d.id = p.division_id LEFT JOIN face_profiles fp ON fp.personnel_id = p.id WHERE p.organisation_id = $1 AND p.id = $2`,
    [organisationId, personnelId]
  );
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

  const divisionId = data.division_id || data.departement_id;
  if (!id(divisionId)) fail(400, "Division requise.");
  data.division_id = divisionId;
  delete data.departement_id;

  if (req.accessibleDivisions !== null && !req.accessibleDivisions.includes(String(data.division_id))) {
    fail(403, "Accès refusé : vous n'êtes pas responsable de cette division / niveau.");
  }

  const { rows: divisions } = await client.query("SELECT id, actif FROM divisions WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, data.division_id]);
  if (!divisions[0] || (!divisions[0].actif && (String(previous.division_id) !== data.division_id || data.actif))) fail(400, "Choisissez une division active de cette organisation.");

  if (data.utilisateur_id === undefined || data.utilisateur_id === "") data.utilisateur_id = null;
  if (data.utilisateur_id !== null) {
    if (!id(data.utilisateur_id)) fail(400, "Utilisateur invalide.");
    const { rows } = await client.query(`SELECT m.user_id FROM organisation_members m JOIN users u ON u.id = m.user_id
      WHERE m.organisation_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE' AND u.actif = true`, [req.user.organisation_id, data.utilisateur_id]);
    if (!rows[0] && String(previous.utilisateur_id) !== data.utilisateur_id) fail(400, "Choisissez un membre actif de cette organisation.");
  }

  if (data.metadata !== undefined && data.metadata !== null) {
    if (typeof data.metadata !== "object" || Array.isArray(data.metadata)) fail(400, "Format metadata invalide.");
  } else {
    data.metadata = previous.metadata || {};
  }

  return data;
}

export const getPersonnels = controller(async (req, client) => {
  let query = `SELECT ${columns} FROM personnel p LEFT JOIN divisions d ON d.id = p.division_id LEFT JOIN face_profiles fp ON fp.personnel_id = p.id WHERE p.organisation_id = $1`;
  const params = [req.user.organisation_id];
  if (req.accessibleDivisions !== null) {
    params.push(req.accessibleDivisions);
    query += ` AND p.division_id::text = ANY($2)`;
  }
  query += ` ORDER BY lower(p.nom), lower(p.prenom), p.id`;
  const { rows } = await client.query(query, params);
  return { body: { personnel: rows } };
});

export const getPersonnel = controller(async (req, client) => {
  const p = await find(client, req.user.organisation_id, req.params.id);
  if (req.accessibleDivisions !== null && !req.accessibleDivisions.includes(String(p.division_id))) {
    fail(403, "Accès refusé : cet agent appartient à une autre division / niveau.");
  }
  return { body: { personnel: p } };
}, { byId: true });

export const createPersonnel = controller(async (req, client) => {
  const data = await validatePersonnel(client, req, body(req, allowedInputKeys));
  const { rows } = await client.query(`INSERT INTO personnel (organisation_id, ${fields.join(", ")})
    VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
    [req.user.organisation_id, ...fields.map(key => key === "metadata" ? JSON.stringify(data[key]) : data[key])]
  );
  const saved = await find(client, req.user.organisation_id, rows[0].id);
  await audit(client, req, "personnel", saved.id, "CREATE", null, saved);
  const badge = saved.actif ? await insertBadge(client, req.user.organisation_id, saved.id, req.session.userId) : null;
  return { status: 201, body: { personnel: saved, badge } };
}, { write: true });

export const updatePersonnel = controller(async (req, client) => {
  const input = body(req, allowedInputKeys);
  const previous = await find(client, req.user.organisation_id, req.params.id);
  if (req.accessibleDivisions !== null && !req.accessibleDivisions.includes(String(previous.division_id))) {
    fail(403, "Accès refusé : cet agent appartient à une autre division / niveau.");
  }
  const data = await validatePersonnel(client, req, input, previous);
  await client.query(`UPDATE personnel SET ${fields.map((key, i) => `${key} = $${i + 3}`).join(", ")}, updated_at = now()
    WHERE organisation_id = $1 AND id = $2`,
    [req.user.organisation_id, req.params.id, ...fields.map(key => key === "metadata" ? JSON.stringify(data[key]) : data[key])]
  );
  if (previous.actif && !data.actif) {
    await client.query("UPDATE badges SET revoked_at = now(), revoked_by = $3 WHERE organisation_id = $1 AND personnel_id = $2 AND revoked_at IS NULL", [req.user.organisation_id, req.params.id, req.session.userId]);
  }
  const saved = await find(client, req.user.organisation_id, req.params.id);
  await audit(client, req, "personnel", saved.id, "UPDATE", previous, saved);
  return { body: { personnel: saved } };
}, { write: true, byId: true });

export const getDivisions = controller(async (req, client) => {
  const { rows } = await client.query(
    `SELECT d.id, d.organisation_id, d.nom, d.actif, d.created_at, d.updated_at,
            COALESCE(
              json_agg(
                json_build_object('id', u.id::text, 'nom', u.nom, 'prenom', u.prenom, 'email', u.email)
              ) FILTER (WHERE u.id IS NOT NULL),
              '[]'::json
            ) AS responsables
     FROM divisions d
     LEFT JOIN division_responsables dr ON dr.division_id = d.id
     LEFT JOIN users u ON u.id = dr.user_id AND u.actif = true
     WHERE d.organisation_id = $1
     GROUP BY d.id
     ORDER BY lower(d.nom), d.id`,
    [req.user.organisation_id]
  );
  return { body: { divisions: rows, departements: rows } };
});

export const createDivision = controller(async (req, client) => {
  const input = body(req, ["nom", "responsables", "responsable_ids"]);
  const divisionNom = name(input.nom, "Nom de la division");
  const { rows } = await client.query("INSERT INTO divisions (organisation_id, nom) VALUES ($1, $2) RETURNING id, nom, actif", [req.user.organisation_id, divisionNom]);
  const divId = rows[0].id;
  const respIds = input.responsable_ids || input.responsables || [];
  if (Array.isArray(respIds) && respIds.length) {
    for (const uId of respIds) {
      if (id(String(uId))) {
        await client.query(
          `INSERT INTO division_responsables (division_id, user_id)
           SELECT $1, u.id FROM users u
           JOIN organisation_members m ON m.user_id = u.id
           WHERE u.id = $2 AND m.organisation_id = $3 AND m.status = 'ACTIVE'
           ON CONFLICT DO NOTHING`,
          [divId, uId, req.user.organisation_id]
        );
      }
    }
  }
  await audit(client, req, "divisions", divId, "CREATE", null, rows[0]);
  return { status: 201, body: { division: rows[0], departement: rows[0] } };
}, { write: true });

export const updateDivision = controller(async (req, client) => {
  const input = body(req, ["nom", "actif", "responsables", "responsable_ids"]);
  const { rows } = await client.query("SELECT id, nom, actif FROM divisions WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, req.params.id]);
  if (!rows[0]) fail(404, "Division introuvable.");
  const data = { ...rows[0], ...input };
  data.nom = name(data.nom, "Nom de la division");
  if (typeof data.actif !== "boolean") fail(400, "Statut invalide.");
  if (!data.actif) {
    const active = await client.query("SELECT id FROM personnel WHERE organisation_id = $1 AND division_id = $2 AND actif = true LIMIT 1", [req.user.organisation_id, req.params.id]);
    if (active.rows.length) fail(409, "Réaffectez ou désactivez les agents actifs avant de désactiver cette division.");
  }
  await client.query("UPDATE divisions SET nom = $3, actif = $4, updated_at = now() WHERE organisation_id = $1 AND id = $2", [req.user.organisation_id, req.params.id, data.nom, data.actif]);
  const respIds = input.responsable_ids ?? input.responsables;
  if (Array.isArray(respIds)) {
    await client.query("DELETE FROM division_responsables WHERE division_id = $1", [req.params.id]);
    for (const uId of respIds) {
      if (id(String(uId))) {
        await client.query(
          `INSERT INTO division_responsables (division_id, user_id)
           SELECT $1, u.id FROM users u
           JOIN organisation_members m ON m.user_id = u.id
           WHERE u.id = $2 AND m.organisation_id = $3 AND m.status = 'ACTIVE'
           ON CONFLICT DO NOTHING`,
          [req.params.id, uId, req.user.organisation_id]
        );
      }
    }
  }
  await audit(client, req, "divisions", data.id, "UPDATE", rows[0], data);
  return { body: { division: data, departement: data } };
}, { write: true, byId: true });

export const assignPersonnelsToDivision = controller(async (req, client) => {
  const divisionId = req.params.id;
  const { personnel_ids } = req.body || {};
  if (!Array.isArray(personnel_ids) || personnel_ids.length === 0) {
    fail(400, "Veuillez sélectionner au moins un agent à affecter.");
  }
  for (const pid of personnel_ids) {
    if (!id(String(pid))) fail(400, "Identifiant d'agent invalide.");
  }

  const { rows: divRows } = await client.query(
    "SELECT id, nom, actif FROM divisions WHERE organisation_id = $1 AND id = $2",
    [req.user.organisation_id, divisionId]
  );
  if (!divRows[0] || !divRows[0].actif) {
    fail(400, "Division introuvable ou inactive.");
  }
  if (req.accessibleDivisions !== null && !req.accessibleDivisions.includes(String(divisionId))) {
    fail(403, "Accès refusé : vous n'êtes pas responsable de cette division.");
  }

  const { rows: updated } = await client.query(
    `UPDATE personnel SET division_id = $1, updated_at = now()
     WHERE organisation_id = $2 AND id = ANY($3::bigint[])
     RETURNING id, nom, prenom`,
    [divisionId, req.user.organisation_id, personnel_ids]
  );

  for (const agent of updated) {
    await audit(client, req, "personnel", agent.id, "UPDATE_DIVISION", null, {
      division_id: divisionId,
      division_nom: divRows[0].nom,
    });
  }

  return { body: { success: true, count: updated.length, division: divRows[0] } };
}, { write: true, byId: true });

// Aliases for backwards compatibility with departements
export const getDepartements = getDivisions;
export const createDepartement = createDivision;
export const updateDepartement = updateDivision;

export const getPersonnelMembers = controller(async (req, client) => {
  const { rows } = await client.query(`SELECT u.id, u.nom, u.prenom, (u.actif AND m.status = 'ACTIVE') AS actif
    FROM organisation_members m JOIN users u ON u.id = m.user_id WHERE m.organisation_id = $1 ORDER BY u.nom, u.prenom`, [req.user.organisation_id]);
  return { body: { membres: rows } };
});

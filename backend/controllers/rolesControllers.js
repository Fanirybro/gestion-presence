import { loadAccount } from "../utils/account.js";
import pool from "../config/database.js";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function validId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
}

function roleController(action, { write = false, byId = false } = {}) {
  return async (req, res) => {
    let client;
    let transaction = false;
    try {
      const sessionId = req.session?.userId;
      if (sessionId == null || !validId(String(sessionId))) {
        fail(401, "Connexion requise.");
      }
      if (byId && !validId(req.params.id)) fail(400, "Identifiant invalide.");
      client = await pool.connect();
      if (!req.user?.organisation_id) fail(403, "Organisation requise.");
      const actor = await loadAccount(client, { id: String(sessionId), organisationId: req.user.organisation_id });
      if (!actor?.actif) fail(401, "Compte indisponible.");
      if (actor.role !== "COORDINATOR") fail(403, "Accès réservé au coordinateur.");

      if (write) {
        await client.query("BEGIN");
        transaction = true;
      }

      const result = await action(req, client, actor);

      if (transaction) {
        await client.query("COMMIT");
        transaction = false;
      }

      return res.status(result.status ?? 200).json(result.body);
    } catch (error) {
      if (transaction) {
        try { await client.query("ROLLBACK"); } catch (rollbackError) {
          console.error("Échec du rollback rôles :", rollbackError);
        }
      }
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === "23505") return res.status(409).json({ message: "Un rôle avec ce code ou ce nom existe déjà." });
      console.error("Erreur de gestion des rôles :", error);
      return res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
      client?.release();
    }
  };
}

export const getRoles = roleController(async (req, client, actor) => {
  const { rows } = await client.query(
    `SELECT r.id, r.organisation_id, r.code, r.nom, r.description, r.permissions, r.is_system, r.created_at, r.updated_at,
            COUNT(m.id) FILTER (WHERE m.status = 'ACTIVE') AS members_count
     FROM organisation_roles r
     LEFT JOIN organisation_members m ON m.organisation_id = r.organisation_id AND m.role = r.code
     WHERE r.organisation_id = $1
     GROUP BY r.id
     ORDER BY r.is_system DESC, r.nom ASC`,
    [actor.organisation_id],
  );
  return { body: { roles: rows } };
});

export const createRole = roleController(async (req, client, actor) => {
  const { nom, description = "", permissions = {} } = req.body ?? {};
  if (typeof nom !== "string" || !nom.trim() || nom.trim().length > 100) {
    fail(400, "Le nom du rôle doit contenir entre 1 et 100 caractères.");
  }
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    fail(400, "Les permissions doivent être un objet valide.");
  }

  let baseCode = nom.trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  if (!baseCode) baseCode = "ROLE";

  let code = baseCode;
  let counter = 1;
  while (true) {
    const { rows } = await client.query(
      "SELECT 1 FROM organisation_roles WHERE organisation_id = $1 AND code = $2",
      [actor.organisation_id, code],
    );
    if (!rows.length) break;
    counter++;
    code = `${baseCode}_${counter}`;
  }

  const { rows } = await client.query(
    `INSERT INTO organisation_roles (organisation_id, code, nom, description, permissions, is_system)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING id, organisation_id, code, nom, description, permissions, is_system, created_at, updated_at`,
    [actor.organisation_id, code, nom.trim(), String(description || "").trim(), JSON.stringify(permissions)],
  );

  return { status: 201, body: { role: { ...rows[0], members_count: 0 } } };
}, { write: true });

export const updateRole = roleController(async (req, client, actor) => {
  const { nom, description, permissions } = req.body ?? {};
  const { rows: existing } = await client.query(
    "SELECT * FROM organisation_roles WHERE id = $1 AND organisation_id = $2",
    [req.params.id, actor.organisation_id],
  );
  if (!existing.length) fail(404, "Rôle introuvable.");
  const role = existing[0];

  if (role.code === "COORDINATOR") {
    fail(400, "Le rôle Coordinateur est le rôle racine du système et n'est pas modifiable.");
  }

  const assignments = [];
  const values = [];

  if (nom !== undefined) {
    if (typeof nom !== "string" || !nom.trim() || nom.trim().length > 100) {
      fail(400, "Le nom du rôle doit contenir entre 1 et 100 caractères.");
    }
    values.push(nom.trim());
    assignments.push(`nom = $${values.length}`);
  }

  if (description !== undefined) {
    values.push(String(description || "").trim());
    assignments.push(`description = $${values.length}`);
  }

  if (permissions !== undefined) {
    if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
      fail(400, "Les permissions doivent être un objet valide.");
    }
    values.push(JSON.stringify(permissions));
    assignments.push(`permissions = $${values.length}`);
  }

  if (!assignments.length) fail(400, "Aucun champ à modifier.");

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);

  values.push(req.params.id, actor.organisation_id);
  const { rows: updated } = await client.query(
    `UPDATE organisation_roles SET ${assignments.join(", ")}
     WHERE id = $${values.length - 1} AND organisation_id = $${values.length}
     RETURNING id, organisation_id, code, nom, description, permissions, is_system, created_at, updated_at`,
    values,
  );

  const { rows: countRows } = await client.query(
    `SELECT COUNT(id) FILTER (WHERE status = 'ACTIVE') AS members_count
     FROM organisation_members WHERE organisation_id = $1 AND role = $2`,
    [actor.organisation_id, updated[0].code],
  );

  return { body: { role: { ...updated[0], members_count: Number(countRows[0]?.members_count ?? 0) } } };
}, { write: true, byId: true });

export const deleteRole = roleController(async (req, client, actor) => {
  const { rows: existing } = await client.query(
    "SELECT * FROM organisation_roles WHERE id = $1 AND organisation_id = $2",
    [req.params.id, actor.organisation_id],
  );
  if (!existing.length) fail(404, "Rôle introuvable.");
  const role = existing[0];

  if (role.code === "COORDINATOR") {
    fail(400, "Le rôle Coordinateur est le rôle racine du système et ne peut pas être supprimé.");
  }

  const { rows: members } = await client.query(
    "SELECT COUNT(id) AS active_count FROM organisation_members WHERE organisation_id = $1 AND role = $2 AND status = 'ACTIVE'",
    [actor.organisation_id, role.code],
  );
  const activeCount = Number(members[0]?.active_count || 0);
  if (activeCount > 0) {
    fail(409, `Ce rôle est actuellement attribué à ${activeCount} utilisateur${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}. Réaffectez d'abord ces utilisateurs à un autre rôle avant de supprimer ce rôle.`);
  }

  await client.query(
    "DELETE FROM organisation_roles WHERE id = $1 AND organisation_id = $2",
    [req.params.id, actor.organisation_id],
  );

  return { body: { message: "Rôle supprimé avec succès." } };
}, { write: true, byId: true });


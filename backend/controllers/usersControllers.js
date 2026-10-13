import { loadAccount } from "../utils/account.js";
import { hashPassword } from "../utils/password.js";
import pool from "../config/database.js";

const publicColumns = "u.id, m.organisation_id, u.nom, u.prenom, u.email, m.role, (u.actif AND m.status = 'ACTIVE') AS actif, m.status AS membership_status, u.created_at, u.updated_at";
const memberJoin = "users u JOIN organisation_members m ON m.user_id = u.id";
const roles = ["COORDINATOR", "SECRETARY"];

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function validId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
}

function bodyOf(req, allowed) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail(400, "Un objet JSON est requis.");
  }
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    fail(400, "Un champ non autorisé a été envoyé.");
  }
  return body;
}

function name(value, field) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    fail(400, `${field} doit contenir entre 1 et 100 caractères.`);
  }
  return value.trim();
}

function email(value) {
  if (typeof value !== "string" || value.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    fail(400, "Adresse email invalide.");
  }
  return value.trim().toLowerCase();
}

function role(value) {
  if (!roles.includes(value)) fail(400, "Rôle invalide.");
  return value;
}

// Chaque appel recharge le compte : les changements de rôle et désactivations
// prennent effet même si une ancienne session existe encore.
function controller(action, { write = false, byId = false } = {}) {
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
      const loadActor = () => loadAccount(client, { id: String(sessionId), organisationId: req.user.organisation_id });
      let actor = await loadActor();
      if (!actor?.actif) fail(401, "Compte indisponible.");
      if (actor.role !== "COORDINATOR") fail(403, "Accès réservé au coordinateur.");
      if (write) {
        await client.query("BEGIN");
        transaction = true;
        // Sérialise les modifications d'une organisation pour éviter que deux
        // requêtes désactivent simultanément ses derniers coordinateurs.
        await client.query("SELECT id FROM organisations WHERE id = $1 FOR UPDATE", [actor.organisation_id]);
        actor = await loadActor();
        if (!actor?.actif) fail(401, "Compte indisponible.");
        if (actor.role !== "COORDINATOR") fail(403, "Accès réservé au coordinateur.");
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
          console.error("Échec du rollback utilisateurs :", rollbackError);
        }
      }
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === "23505") return res.status(409).json({ message: "Cette adresse email est déjà utilisée." });
      console.error("Erreur de gestion des utilisateurs :", error);
      return res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
      client?.release();
    }
  };
}

async function findUser(client, id, organisationId) {
  const { rows } = await client.query(
    `SELECT ${publicColumns} FROM ${memberJoin} WHERE u.id = $1 AND m.organisation_id = $2`,
    [id, organisationId],
  );
  if (!rows[0]) fail(404, "Utilisateur introuvable.");
  return rows[0];
}

export const getUsers = controller(async (req, client, actor) => {
  const page = req.query.page ?? "1";
  const limit = req.query.limit ?? "20";
  if (typeof page !== "string" || !/^[1-9]\d*$/.test(page)
    || typeof limit !== "string" || !/^[1-9]\d*$/.test(limit)
    || !Number.isSafeInteger(Number(page)) || Number(limit) > 100
    || !Number.isSafeInteger((Number(page) - 1) * Number(limit))) {
    fail(400, "Pagination invalide (limit : 1 à 100).");
  }
  const values = [actor.organisation_id];
  const filters = ["m.organisation_id = $1"];
  if (req.query.role !== undefined) {
    values.push(role(req.query.role));
    filters.push(`m.role = $${values.length}`);
  }
  if (req.query.actif !== undefined) {
    if (!["true", "false"].includes(req.query.actif)) fail(400, "actif doit valoir true ou false.");
    values.push(req.query.actif === "true");
    filters.push(`(u.actif AND m.status = 'ACTIVE') = $${values.length}`);
  }
  values.push(Number(limit), (Number(page) - 1) * Number(limit));
  const { rows } = await client.query(
    `SELECT ${publicColumns} FROM ${memberJoin} WHERE ${filters.join(" AND ")}
     ORDER BY u.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
  );
  return { body: { users: rows, page: Number(page), limit: Number(limit) } };
});

export const getUserById = controller(async (req, client, actor) => ({
  body: { user: await findUser(client, req.params.id, actor.organisation_id) },
}), { byId: true });

export const createUser = controller(async (req, client, actor) => {
  const body = bodyOf(req, ["nom", "prenom", "email", "password", "role"]);
  const nom = name(body.nom, "Le nom");
  const prenom = name(body.prenom, "Le prénom");
  const address = email(body.email);
  const userRole = role(body.role);
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
    fail(400, "Le mot de passe doit contenir entre 12 et 128 caractères.");
  }
  const hash = await hashPassword(body.password);
  const { rows } = await client.query(
    `INSERT INTO users (nom, prenom, email, password_hash)
     VALUES ($1, $2, $3, $4) RETURNING id`, [nom, prenom, address, hash],
  );
  await client.query(
    "INSERT INTO organisation_members (organisation_id, user_id, role, status) VALUES ($1, $2, $3, 'ACTIVE')",
    [actor.organisation_id, rows[0].id, userRole],
  );
  return { status: 201, body: { user: await findUser(client, rows[0].id, actor.organisation_id) } };
}, { write: true });

export const updateUser = controller(async (req, client, actor) => {
  const body = bodyOf(req, ["nom", "prenom", "email"]);
  const assignments = [];
  const values = [];
  for (const field of ["nom", "prenom", "email"]) {
    if (Object.hasOwn(body, field)) {
      values.push(field === "email" ? email(body[field]) : name(body[field], field));
      assignments.push(`${field} = $${values.length}`);
    }
  }
  if (!assignments.length) fail(400, "Aucun champ à modifier.");
  values.push(req.params.id, actor.organisation_id);
  const { rows } = await client.query(
    `UPDATE users SET ${assignments.join(", ")}
     WHERE id = $${values.length - 1} AND EXISTS (
       SELECT 1 FROM organisation_members WHERE user_id = users.id AND organisation_id = $${values.length})
     RETURNING id`, values,
  );
  if (!rows[0]) fail(404, "Utilisateur introuvable.");
  return { body: { user: await findUser(client, req.params.id, actor.organisation_id) } };
}, { write: true, byId: true });

async function protectLastCoordinator(client, user) {
  if (user.role !== "COORDINATOR" || !user.actif) return;
  const { rows } = await client.query(
    `SELECT u.id FROM ${memberJoin} WHERE m.organisation_id = $1
     AND m.role = 'COORDINATOR' AND m.status = 'ACTIVE' AND u.actif = true AND u.id <> $2 LIMIT 1`,
    [user.organisation_id, user.id],
  );
  if (!rows.length) fail(409, "Impossible de retirer le dernier coordinateur actif.");
}

export const updateUserRole = controller(async (req, client, actor) => {
  const newRole = role(bodyOf(req, ["role"]).role);
  const user = await findUser(client, req.params.id, actor.organisation_id);
  if (newRole !== "COORDINATOR") await protectLastCoordinator(client, user);
  await client.query(
    `UPDATE organisation_members SET role = $1 WHERE user_id = $2 AND organisation_id = $3`,
    [newRole, req.params.id, actor.organisation_id],
  );
  return { body: { user: await findUser(client, req.params.id, actor.organisation_id) } };
}, { write: true, byId: true });

export const updateUserStatus = controller(async (req, client, actor) => {
  const { actif } = bodyOf(req, ["actif"]);
  if (typeof actif !== "boolean") fail(400, "actif doit être un booléen.");
  const user = await findUser(client, req.params.id, actor.organisation_id);
  if (!actif) await protectLastCoordinator(client, user);
  await client.query(
    `UPDATE organisation_members SET status = $1 WHERE user_id = $2 AND organisation_id = $3`,
    [actif ? "ACTIVE" : "REJECTED", req.params.id, actor.organisation_id],
  );
  return { body: { user: await findUser(client, req.params.id, actor.organisation_id) } };
}, { write: true, byId: true });

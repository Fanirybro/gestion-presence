import pool from "../config/database.js";
import { randomBytes, randomInt } from "node:crypto";

const columns = "id, nom, slug, adresse, fuseau_horaire, organisation_code, actif, created_at, updated_at";

// Une seule affectation possible ; le verrou empêche deux créations/adhésions simultanées.
async function attachOrganisation(req, res, next, create) {
  let client;
  let transaction = false;
  try {
    let data;
    let code;
    if (create) {
      data = validateChanges(req.body);
      if (!data.nom) invalid("Le nom de l'organisation est requis.");
    } else {
      if (!req.body || Object.keys(req.body).some(key => key !== "organisation_code")
        || typeof req.body.organisation_code !== "string") invalid("Renseignez le code de l'organisation.");
      code = req.body.organisation_code.trim().toUpperCase();
      if (!/^[1-9][0-9]{0,9}$/.test(code) || Number(code) > 2147483647) invalid("Code d'organisation invalide.");
    }
    client = await pool.connect();
    await client.query("BEGIN");
    transaction = true;
    const account = await client.query("SELECT id, nom, prenom, email, actif FROM users WHERE id = $1 AND actif = true FOR UPDATE", [req.user.id]);
    if (!account.rows[0]) throw Object.assign(new Error("Compte indisponible."), { status: 401 });
    const existing = await client.query("SELECT id FROM organisation_members WHERE user_id = $1 AND status IN ('ACTIVE', 'PENDING') LIMIT 1", [req.user.id]);
    if (existing.rows.length) throw Object.assign(new Error("Votre compte est déjà lié à une organisation."), { status: 409 });
    let organisation;
    if (create) {
      const timezone = data.fuseau_horaire ?? "Indian/Antananarivo";
      const valid = await client.query("SELECT name FROM pg_timezone_names WHERE name = $1", [timezone]);
      if (!valid.rows.length) invalid("Fuseau horaire inconnu.");
      // Verrou partagé par les créations pour éviter les collisions, même avant l'index unique.
      await client.query("SELECT pg_advisory_xact_lock(20261002, 1)");
      let organisationCode;
      for (let attempt = 0; attempt < 10; attempt++) {
        organisationCode = randomInt(100000000, 1000000000);
        const used = await client.query("SELECT id FROM organisations WHERE organisation_code = $1", [organisationCode]);
        if (!used.rows.length) break;
        organisationCode = undefined;
      }
      if (organisationCode === undefined) throw Object.assign(new Error("Impossible de générer le code. Réessayez."), { status: 503 });
      const stem = data.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "") || "organisation";
      const slug = data.slug ?? `${stem}-${randomBytes(6).toString("hex")}`;
      const created = await client.query(
        `INSERT INTO organisations (nom, slug, adresse, fuseau_horaire, organisation_code)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
        [data.nom, slug, data.adresse ?? null, timezone, organisationCode],
      );
      organisation = created.rows[0];
    } else {
      const found = await client.query(`SELECT ${columns} FROM organisations WHERE organisation_code = $1 AND actif = true FOR SHARE`, [Number(code)]);
      if (found.rows.length > 1) throw Object.assign(new Error("Ce code est ambigu. Contactez votre coordinateur."), { status: 409 });
      organisation = found.rows[0];
      if (!organisation) throw Object.assign(new Error("Code introuvable ou organisation indisponible."), { status: 404 });
    }
    if (!create) {
      const previous = await client.query("SELECT id FROM organisation_members WHERE user_id = $1 AND organisation_id = $2 LIMIT 1", [req.user.id, organisation.id]);
      if (previous.rows.length) throw Object.assign(new Error("Une adhésion existe déjà pour ce compte. Contactez votre coordinateur."), { status: 409 });
    }
    const role = create ? "COORDINATOR" : "SECRETARY";
    const { rows } = await client.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id, organisation_id, user_id, role, status, created_at`,
      [organisation.id, req.user.id, role],
    );
    await client.query("COMMIT");
    transaction = false;
    req.session.organisationId = organisation.id;
    res.status(create ? 201 : 200).json({ organisation, membership: rows[0],
      user: { ...account.rows[0], organisation_id: organisation.id, role, membership_status: "ACTIVE" } });
  } catch (error) {
    if (transaction) { try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("Rollback organisation :", rollbackError); } }
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === "23505") return res.status(409).json({ message: "Ce code ou ce slug existe déjà. Réessayez." });
    next(error);
  } finally { client?.release(); }
}

export const createOrganisation = (req, res, next) => attachOrganisation(req, res, next, true);
export const joinOrganisation = (req, res, next) => attachOrganisation(req, res, next, false);

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function validateChanges(body) {
  const allowed = ["nom", "slug", "adresse", "fuseau_horaire"];
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("Un objet JSON est requis.");
  const keys = Object.keys(body);
  if (!keys.length) invalid("Aucun champ à modifier.");
  if (keys.some((key) => !allowed.includes(key))) invalid("Un champ non autorisé a été envoyé.");
  const changes = {};
  for (const field of keys) {
    if (field === "adresse" && body[field] === null) {
      changes.adresse = null;
      continue;
    }
    if (typeof body[field] !== "string") invalid(`${field} doit être une chaîne de caractères.`);
    const value = body[field].trim();
    if (field === "nom" && (!value || value.length > 200)) invalid("Le nom doit contenir entre 1 et 200 caractères.");
    if (field === "slug" && (value.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value))) {
      invalid("Le slug doit contenir au plus 100 caractères : minuscules, chiffres et tirets entre les mots.");
    }
    if (field === "adresse" && value.length > 1000) invalid("L'adresse ne doit pas dépasser 1000 caractères.");
    if (field === "fuseau_horaire" && (!value || value.length > 100)) invalid("Fuseau horaire invalide.");
    changes[field] = field === "adresse" && !value ? null : value;
  }
  return changes;
}

// L'organisation provient exclusivement de l'utilisateur chargé par requireAuth.
export async function getOrganisation(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT ${columns} FROM organisations WHERE id = $1 AND actif = true`,
      [req.user.organisation_id],
    );
    if (!rows[0]) return res.status(404).json({ message: "Organisation introuvable." });
    res.json({ organisation: rows[0] });
  } catch (error) { next(error); }
}

export async function updateOrganisation(req, res, next) {
  let client;
  let transaction = false;
  try {
    const changes = validateChanges(req.body);
    client = await pool.connect();
    await client.query("BEGIN");
    transaction = true;
    // Même verrou que les contrôleurs utilisateurs : la permission est
    // revérifiée après toute modification concurrente du compte coordinateur.
    const organisation = await client.query(
      "SELECT id FROM organisations WHERE id = $1 AND actif = true FOR UPDATE",
      [req.user.organisation_id],
    );
    if (!organisation.rows.length) throw Object.assign(new Error("Organisation introuvable."), { status: 404 });
    const actor = await client.query(
      `SELECT m.role FROM organisation_members m JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1 AND m.organisation_id = $2 AND m.status = 'ACTIVE' AND u.actif = true`,
      [req.user.id, req.user.organisation_id],
    );
    if (!actor.rows.length) throw Object.assign(new Error("Compte indisponible."), { status: 401 });
    if (actor.rows[0].role !== "COORDINATOR") {
      throw Object.assign(new Error("Accès réservé au coordinateur."), { status: 403 });
    }
    if (changes.fuseau_horaire !== undefined) {
      const timezone = await client.query("SELECT name FROM pg_timezone_names WHERE name = $1", [changes.fuseau_horaire]);
      if (!timezone.rows.length) invalid("Fuseau horaire inconnu.");
    }
    // Les noms de colonnes viennent de la liste blanche, les valeurs sont paramétrées.
    const fields = Object.keys(changes);
    const values = Object.values(changes);
    values.push(req.user.organisation_id);
    const { rows } = await client.query(
      `UPDATE organisations SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(", ")}
       WHERE id = $${values.length} RETURNING ${columns}`, values,
    );
    await client.query("COMMIT");
    transaction = false;
    res.json({ organisation: rows[0] });
  } catch (error) {
    if (transaction) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Échec du rollback organisation :", rollbackError); }
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === "23505") return res.status(409).json({ message: "Ce slug est déjà utilisé." });
    next(error);
  } finally { client?.release(); }
}

import { loadAccount, publicAccount } from "../utils/account.js";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hashPassword } from "../utils/password.js";
import pool from "../config/database.js";
import { sessionCookieName, sessionCookieOptions } from "../config/session.js";
import { createTrace } from "../utils/diagnostics.js";

const deriveKey = promisify(scrypt);
const hashPattern = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const dummyHash = `scrypt$131072$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;

async function verifyPassword(password, hash) {
  // Même format et même coût que createUser ; comparaison en temps constant.
  const match = hashPattern.exec(hash ?? "");
  const parts = match ?? hashPattern.exec(dummyHash);
  const key = await deriveKey(password, parts[1], 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return timingSafeEqual(key, Buffer.from(parts[2], "hex")) && Boolean(match);
}

export async function login(req, res, next) {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== "string" || !password.length || password.length > 128) {
    return res.status(400).json({ message: "Email et mot de passe valides requis." });
  }
  try {
    const user = await loadAccount(pool, { email: email.trim().toLowerCase() });
    const valid = await verifyPassword(password, user?.password_hash ?? dummyHash);
    if (!valid || !user?.actif) {
      return res.status(401).json({ message: "Identifiants incorrects ou compte indisponible." });
    }
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = String(user.id);
    req.session.organisationId = user.organisation_id;
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ user: publicAccount(user) });
  } catch (error) { next(error); }
}

export function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(sessionCookieName, sessionCookieOptions);
    res.status(204).end();
  });
}

export function getMe(req, res) {
  res.json({ user: req.user });
}

export async function signup(req, res, next) {
  const trace = req.signupTrace ?? createTrace("signup");
  trace.result("Validate signup fields — START");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["nom", "prenom", "email", "password"].includes(key))
    || ["nom", "prenom"].some(key => typeof body[key] !== "string" || !body[key].trim() || body[key].trim().length > 100)
    || typeof body.email !== "string" || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
    trace.result("Validate signup fields — FAIL (HTTP 400)");
    return res.status(400).json({ message: "Renseignez vos nom, prénom, email et un mot de passe de 12 à 128 caractères." });
  }
  try {
    trace.result("Validate signup fields — OK");
    const hash = await trace.step("Hash password", () => hashPassword(body.password));
    const { rows } = await trace.step("Insert account into PostgreSQL", () => pool.query(
      `INSERT INTO users (nom, prenom, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nom, prenom, email, actif`,
      [body.nom.trim(), body.prenom.trim(), body.email.trim().toLowerCase(), hash],
    ));
    await trace.step("Regenerate session", () => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve())));
    req.session.userId = String(rows[0].id);
    await trace.step("Save session in PostgreSQL", () => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve())));
    res.status(201).json({ user: { ...rows[0], organisation_id: null, role: null, membership_status: null } });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Cette adresse email est déjà utilisée. Connectez-vous à votre compte." });
    next(error);
  }
}

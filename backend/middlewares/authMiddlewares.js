import { loadAccount, publicAccount } from "../utils/account.js";
import pool from "../config/database.js";
import { sessionCookieName, sessionCookieOptions } from "../config/session.js";

export async function requireAuth(req, res, next) {
  const id = String(req.session?.userId ?? "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    return res.status(401).json({ message: "Connexion requise." });
  }
  try {
    const account = await loadAccount(pool, { id, organisationId: req.session.organisationId ?? null });
    if (!account?.actif) {
      return req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie(sessionCookieName, sessionCookieOptions);
        res.status(401).json({ message: "Compte indisponible." });
      });
    }
    req.user = publicAccount(account);
    next();
  } catch (error) { next(error); }
}

export async function attachUserIfSession(req, res, next) {
  const id = String(req.session?.userId ?? "");
  if (/^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n) {
    try {
      const account = await loadAccount(pool, { id, organisationId: req.session.organisationId ?? null });
      if (account?.actif) {
        req.user = publicAccount(account);
      }
    } catch {
      // non bloquant
    }
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Connexion requise." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Accès interdit." });
    next();
  };
}

export function requirePermission(...permissionKeys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Connexion requise." });
    if (req.user.role === "COORDINATOR") return next();

    // Les responsables de division ont accès opérationnel aux actions de leur périmètre
    if (Array.isArray(req.user.managed_division_ids) && req.user.managed_division_ids.length > 0) {
      const divisionScopedPermissions = [
        "departments",
        "agents",
        "agents_manage",
        "presences",
        "presences_add",
        "presences_justify",
        "leaves",
        "face_enroll",
        "reports",
      ];
      if (permissionKeys.some((key) => divisionScopedPermissions.includes(key))) {
        return next();
      }
    }

    const perms = req.user.permissions || {};
    const hasAny = permissionKeys.some((key) => perms[key] === true);
    if (hasAny) return next();
    return res.status(403).json({ message: "Accès interdit : permission requise." });
  };
}

export function requireTrustedOrigin(origins) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    const host = req.get("host");

    // vérif origine autorisée (domaine explicite, same-origin ou vercel)
    let isAllowed = false;
    if (!origin) {
      isAllowed = true;
    } else if (origins.includes(origin)) {
      isAllowed = true;
    } else if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      isAllowed = true;
    } else {
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname.endsWith(".vercel.app")) {
          isAllowed = true;
        }
      } catch {
        isAllowed = false;
      }
    }

    if (!isAllowed || req.get("sec-fetch-site") === "cross-site") {
      return res.status(403).json({ message: "Origine non autorisée." });
    }
    // Les mutations utilisent exclusivement du JSON, y compris sans Origin.
    if (!req.is("application/json")) return res.status(415).json({ message: "Content-Type application/json requis." });
    next();
  };
}

export function requireOrganisation(req, res, next) {
  if (!req.user?.organisation_id) return res.status(403).json({ message: "Créez ou rejoignez une organisation pour continuer." });
  next();
}

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./database.js";

export const sessionCookieName = "presence.sid";
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

export function createSessionMiddleware(store) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET doit contenir au moins 32 caractères.");
  const PgStore = connectPgSimple(session);
  return session({
    name: sessionCookieName,
    secret,
    store: store ?? new PgStore({ pool, tableName: "http_sessions", createTableIfMissing: true }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...sessionCookieOptions, maxAge: 1000 * 60 * 60 * 24 * 7 },
  });
}

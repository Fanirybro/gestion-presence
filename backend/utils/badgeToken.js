import { createHash, createHmac } from "node:crypto";
export const hashBadgeToken = token => createHash("sha256").update(token).digest("hex");
export function badgeToken(badge) {
  const secret = process.env.BADGE_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Secret de signature des badges manquant.");
  const signature = createHmac("sha256", secret).update(`presence-badge:v1:${badge.organisation_id}:${badge.personnel_id}:${badge.id}`).digest("hex");
  return `presence:v1:${badge.id}:${signature}`;
}

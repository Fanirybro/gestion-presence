import { randomBytes } from "node:crypto";
import { badgeToken, hashBadgeToken } from "./badgeToken.js";

// Caller owns the transaction: personnel and badge must commit together.
export async function insertBadge(client, org, id, actorId) {
  const { rows } = await client.query("INSERT INTO badges (organisation_id, personnel_id, token_hash, created_by) VALUES ($1, $2, $3, $4) RETURNING id, organisation_id, personnel_id", [org, id, randomBytes(32).toString("hex"), actorId]);
  const token = badgeToken(rows[0]);
  await client.query("UPDATE badges SET token_hash = $3 WHERE organisation_id = $1 AND id = $2", [org, rows[0].id, hashBadgeToken(token)]);
  await client.query("INSERT INTO journal_audit (organisation_id, acteur_id, entite, entite_id, action) VALUES ($1, $2, 'badges', $3, $4)", [org, actorId, rows[0].id, "CREATE"]);
  return { id: String(rows[0].id), personnel_id: String(id), token };
}

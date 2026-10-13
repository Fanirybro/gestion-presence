// Le rôle appartient à une adhésion ACTIVE, jamais directement au compte.
export async function loadAccount(db, { id = null, email = null, organisationId = null } = {}) {
  const { rows } = await db.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.actif, u.password_hash,
            m.organisation_id, m.role, m.status AS membership_status
     FROM users u
     LEFT JOIN LATERAL (
       SELECT om.organisation_id, om.role, om.status
       FROM organisation_members om JOIN organisations o ON o.id = om.organisation_id
       WHERE om.user_id = u.id AND om.status = 'ACTIVE' AND o.actif = true
         AND ($3::bigint IS NULL OR om.organisation_id = $3)
       ORDER BY om.id LIMIT 1
     ) m ON true
     WHERE ($1::bigint IS NOT NULL AND u.id = $1)
        OR ($2::text IS NOT NULL AND lower(u.email) = $2)`,
    [id, email, organisationId],
  );
  return rows[0];
}

export function publicAccount(account) {
  const { password_hash, ...publicUser } = account;
  return publicUser;
}

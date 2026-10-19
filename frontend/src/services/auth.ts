import type { User, UserPermissions } from "../types";
export interface Account {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: "COORDINATOR" | "SECRETARY" | null;
  actif: boolean;
  organisation_id: string | null;
  permissions?: UserPermissions;
}
export interface Organisation {
  id: string;
  nom: string;
  slug: string;
  adresse: string | null;
  fuseau_horaire: string;
  organisation_code: number;
  pointage_qr?: boolean;
  pointage_facial?: boolean;
}
export interface Signup {
  nom: string;
  prenom: string;
  email: string;
  password: string;
}
export const toUser = (account: Account): User => ({
  id: String(account.id),
  name: `${account.prenom} ${account.nom}`,
  email: account.email,
  role: account.role ?? "SECRETARY",
  isActive: account.actif,
  organisationId:
    account.organisation_id == null ? null : String(account.organisation_id),
  permissions: account.permissions || {},
});

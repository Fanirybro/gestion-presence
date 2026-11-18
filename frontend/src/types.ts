export type Role = "SUPERADMIN" | "ADMIN" | "COORDINATOR" | "SECRETARY" | (string & {});

export function isSuperAdmin(role?: string | null): boolean {
  return role === "SUPERADMIN" || role === "COORDINATOR";
}

export interface RoleDefinition {
  id: string;
  organisation_id: string;
  code: string;
  nom: string;
  description: string;
  permissions: UserPermissions;
  is_system: boolean;
  members_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
  defaultValue?: string;
}

export type Status = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED";

export interface AdministrativeMetadata {
  im?: string;
  matricule?: string;
  structure?: string;
  cin?: string;
  telephone?: string;
  email?: string;
  localite?: string;
  adresse_professionnelle?: string;
  sexe?: "H" | "F" | string;
  categorie?: string;
  statut_administratif?: "FONCTIONNAIRE" | "EFA" | "ELD" | string;
  date_entree_administration?: string;
  date_prise_service?: string;
  [key: string]: any;
}

export interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  divisionId?: string;
  divisionName?: string;
  position: string;
  isActive: boolean;
  isEnrolled?: boolean;
  enrolledAt?: string | null;
  token: string;
  createdAt: string;
  birthDate?: string;
  hireDate?: string;
  userId?: string | null;
  deletedAt?: string;
  metadata?: AdministrativeMetadata;
}

export interface UserPermissions {
  dashboard?: boolean;
  scan?: boolean;
  kiosk?: boolean;
  presences?: boolean;
  presences_justify?: boolean;
  presences_add?: boolean;
  reports?: boolean;
  reports_print?: boolean;
  leaves?: boolean;
  agents?: boolean;
  agents_manage?: boolean;
  agents_badges?: boolean;
  departments?: boolean;
  schedules?: boolean;
  face_enroll?: boolean;
  users?: boolean;
  settings?: boolean;
  [key: string]: boolean | undefined;
}

export const DEFAULT_SECRETARY_PERMISSIONS: UserPermissions = {
  dashboard: true,
  scan: true,
  kiosk: true,
  presences: true,
  presences_justify: true,
  presences_add: true,
  reports: true,
  reports_print: true,
  leaves: true,
  agents: true,
  agents_manage: true,
  agents_badges: true,
  departments: false, // Réservé à l'administration par défaut
  face_enroll: true,
  schedules: false, // Inclus dans Paramètres
  users: false,     // Inclus dans Paramètres
  settings: false,  // Inclus dans Paramètres
};

export function hasPermission(
  user: { role?: Role | string; permissions?: UserPermissions; managed_division_ids?: string[] } | null | undefined,
  key: keyof UserPermissions | string,
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;

  // Options d'administration et paramètres système : réservées par défaut
  const isSettingsOrAdminOption =
    key === "settings" || key === "users" || key === "schedules" || key === "departments";

  // Si des permissions explicites sont définies sur l'utilisateur
  if (user.permissions && Object.prototype.hasOwnProperty.call(user.permissions, key)) {
    return Boolean(user.permissions[key]);
  }

  // Périmètre par division si configuré
  if (Array.isArray(user.managed_division_ids) && user.managed_division_ids.length > 0) {
    if (
      key === "agents" ||
      key === "agents_manage" ||
      key === "agents_badges" ||
      key === "leaves" ||
      key === "presences" ||
      key === "presences_add" ||
      key === "presences_justify" ||
      key === "face_enroll" ||
      key === "reports" ||
      key === "reports_print"
    ) {
      return true;
    }
  }

  if (isSettingsOrAdminOption) {
    return false;
  }

  return Boolean(DEFAULT_SECRETARY_PERMISSIONS[key] ?? true);
}

export interface User {
  organisationId?: string | null;
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  permissions?: UserPermissions;
  managed_division_ids?: string[];
}

export interface Attendance {
  id: string;
  agentId: string;
  date: string;
  periode?: SchedulePeriod;
  period?: SchedulePeriod;
  arrivalAt: string;
  departureAt: string;
  status: Status;
  lateMinutes: number;
  source: string;
  note: string;
}

export interface Audit {
  id: string;
  entityId: string;
  actor: string;
  action: string;
  reason: string;
  at: string;
}

export interface Scan {
  id: string;
  agentId: string;
  type: "ARRIVAL" | "DEPARTURE";
  at: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  divisionName?: string;
}

export type SchedulePeriod = "MATIN" | "APRES_MIDI" | "SOIR";

export interface Schedule {
  day: string;
  period: SchedulePeriod;
  overnight: boolean;
  working: boolean;
  start: string;
  end: string;
  tolerance: number;
  cutoff: string;
}

export interface Settings {
  organization: string;
  address: string;
  logo_url?: string | null;
  custom_fields_schema?: CustomFieldDefinition[];
  schedules: Schedule[];
  pointage_qr?: boolean;
  pointage_facial?: boolean;
}

export interface DivisionManagerInfo {
  id: string;
  nom: string;
  prenom: string;
  email: string;
}

export interface Database {
  agents: Agent[];
  users: User[];
  credentials: Record<string, string>;
  departments: { id: string; name: string; isActive?: boolean; responsables?: DivisionManagerInfo[] }[];
  divisions?: { id: string; name: string; isActive?: boolean; responsables?: DivisionManagerInfo[] }[];
  attendance: Attendance[];
  scans: Scan[];
  audit: Audit[];
  settings: Settings;
  archives: {
    id: string;
    date: string;
    at: string;
    author: string;
    snapshot?: {
      agents: Agent[];
      attendance: Attendance[];
      departments: { id: string; name: string }[];
      settings: Settings;
    };
  }[];
}

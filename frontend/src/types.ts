export type Role = "COORDINATOR" | "SECRETARY" | (string & {});

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
export type Status = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED";
export interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  position: string;
  isActive: boolean;
  token: string;
  createdAt: string;
  birthDate?: string;
  hireDate?: string;
  userId?: string | null;
  deletedAt?: string;
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
  presences_justify: false,
  presences_add: false,
  reports: true,
  reports_print: true,
  leaves: true,
  agents: false,
  agents_manage: false,
  agents_badges: false,
  departments: false,
  schedules: false,
  face_enroll: false,
  users: false,
  settings: false,
};

export function hasPermission(
  user: { role?: Role | string; permissions?: UserPermissions } | null | undefined,
  key: keyof UserPermissions | string,
): boolean {
  if (!user) return false;
  if (user.role === "COORDINATOR") return true;
  if (user.permissions && Object.prototype.hasOwnProperty.call(user.permissions, key)) {
    return Boolean(user.permissions[key]);
  }
  return Boolean(DEFAULT_SECRETARY_PERMISSIONS[key]);
}

export interface User {
  organisationId?: string | null;
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  permissions?: UserPermissions;
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
  schedules: Schedule[];
  pointage_qr?: boolean;
  pointage_facial?: boolean;
}
export interface Database {
  agents: Agent[];
  users: User[];
  credentials: Record<string, string>;
  departments: { id: string; name: string; isActive?: boolean }[];
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

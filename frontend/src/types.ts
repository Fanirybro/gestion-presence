export type Role = "COORDINATOR" | "SECRETARY";
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
export interface User {
  organisationId?: string | null;
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}
export interface Attendance {
  id: string;
  agentId: string;
  date: string;
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

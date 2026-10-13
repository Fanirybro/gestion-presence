import { periods, periodDefaults } from "./schedules";
import type { Database } from "../types";
import { today } from "../utils";
let key = "presence-qr.unlinked";
export function setStoreScope(organisationId: string | null) {
  key = organisationId
    ? `presence-qr.organisation.${organisationId}`
    : "presence-qr.unlinked";
}
export function getStoreKey() {
  return key;
}
export const demoPassword = "Presence2026!";
function seed(): Database {
  const names = [
    ["Aina", "Rakoto", "Responsable RH"],
    ["Hery", "Rabe", "Comptable"],
    ["Mialy", "Andria", "Chargée de communication"],
    ["Andry", "Rakotomalala", "Technicien réseau"],
    ["Fara", "Rasoa", "Assistante administrative"],
    ["Tojo", "Randria", "Développeur"],
    ["Hanitra", "Ravao", "Gestionnaire"],
    ["Lova", "Rajaona", "Agent logistique"],
    ["Tiana", "Ranaivo", "Secrétaire"],
    ["Nirina", "Rabe", "Chargée de mission"],
    ["Sitraka", "Ramanana", "Comptable"],
    ["Hasina", "Rakoto", "Technicien"],
    ["Mamy", "Rasolofonirina", "Chauffeur"],
    ["Ony", "Raveloson", "Responsable achats"],
    ["Rija", "Razanakoto", "Analyste"],
    ["Vola", "Andriamena", "Assistante"],
  ];
  const agents = names.map(([firstName, lastName, position], i) => ({
    id: `a${i + 1}`,
    firstName,
    lastName,
    position,
    departmentId: `d${(i % 4) + 1}`,
    isActive: true,
    token: crypto.randomUUID(),
    createdAt: today(),
  }));
  const attendance: Database["attendance"] = [];
  for (let d = 0; d < 14; d++) {
    const date = new Date(`${today()}T12:00:00+03:00`);
    date.setDate(date.getDate() - d);
    if ([0, 6].includes(date.getDay())) continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Indian/Antananarivo",
    }).format(date);
    agents.forEach((a, i) => {
      const n = (i + d) % 10;
      const status =
        n < 6 ? "PRESENT" : n < 8 ? "LATE" : n === 8 ? "ABSENT" : "JUSTIFIED";
      attendance.push({
        id: `${a.id}-${day}`,
        agentId: a.id,
        date: day,
        arrivalAt:
          n < 6 ? `07:${40 + (i % 20)}` : n < 8 ? `08:${20 + (i % 30)}` : "",
        departureAt: d > 0 && n < 8 ? "17:00" : "",
        status,
        lateMinutes: n >= 6 && n < 8 ? 5 + (i % 30) : 0,
        source: n < 8 ? "QR_SCAN" : "SYSTEM",
        note: status === "JUSTIFIED" ? "Congé autorisé" : "",
      });
    });
  }
  return {
    agents,
    attendance,
    departments: [
      { id: "d1", name: "Administration" },
      { id: "d2", name: "Finance" },
      { id: "d3", name: "Communication" },
      { id: "d4", name: "Informatique" },
    ],
    users: [
      {
        id: "u1",
        name: "Sarah Rakoto",
        email: "coordinateur@presence.local",
        role: "COORDINATOR",
        isActive: true,
      },
      {
        id: "u2",
        name: "Miora Rabe",
        email: "secretaire@presence.local",
        role: "SECRETARY",
        isActive: true,
      },
    ],
    credentials: { u1: demoPassword, u2: demoPassword },
    scans: attendance
      .filter((p) => p.date === today() && p.arrivalAt)
      .map((p) => ({
        id: crypto.randomUUID(),
        agentId: p.agentId,
        type: "ARRIVAL" as const,
        at: `${p.date}T${p.arrivalAt}:00+03:00`,
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    audit: [],
    archives: [],
    settings: {
      organization: "Direction administrative",
      address: "Antananarivo, Madagascar",
      schedules: [
        "Dimanche",
        "Lundi",
        "Mardi",
        "Mercredi",
        "Jeudi",
        "Vendredi",
        "Samedi",
      ].flatMap((day, i) =>
        periods.map((period) => ({
          day,
          period,
          overnight: false,
          working: i > 0 && i < 6 && period === "MATIN",
          ...periodDefaults[period],
          tolerance: 15,
        })),
      ),
    },
  };
}
export function readDb(): Database {
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  const db = seed();
  // Les nouveaux espaces ne reprennent jamais les données de démonstration.
  db.agents = [];
  db.attendance = [];
  db.departments = [];
  db.users = [];
  db.credentials = {};
  db.scans = [];
  db.audit = [];
  db.archives = [];
  db.settings.organization = "Mon organisation";
  db.settings.address = "";
  localStorage.setItem(key, JSON.stringify(db));
  return db;
}
export function writeDb(db: Database) {
  localStorage.setItem(key, JSON.stringify(db));
}

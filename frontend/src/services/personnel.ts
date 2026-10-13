import { apiClient } from "./api";
import type { Agent } from "../types";
import { settingsApi, mapSettings } from "./settings";

export interface Personnel {
  id: string;
  organisation_id: string;
  departement_id: string;
  utilisateur_id: string | null;
  nom: string;
  prenom: string;
  date_naissance: string;
  date_embauche: string | null;
  poste: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}
export type PersonnelInput = Pick<
  Personnel,
  | "departement_id"
  | "utilisateur_id"
  | "nom"
  | "prenom"
  | "date_naissance"
  | "date_embauche"
  | "poste"
  | "actif"
>;
export interface Departement {
  id: string;
  nom: string;
  actif: boolean;
}
export interface PersonnelMember {
  id: string;
  nom: string;
  prenom: string;
  actif: boolean;
}
export const personnelApi = {
  list: () => apiClient.get<{ personnel: Personnel[] }>("/personnels"),
  create: (body: PersonnelInput) =>
    apiClient.post<{ personnel: Personnel }>("/personnels", body),
  update: (id: string, body: Partial<PersonnelInput>) =>
    apiClient.patch<{ personnel: Personnel }>(`/personnels/${id}`, body),
  departments: () =>
    apiClient.get<{ departements: Departement[] }>("/departements"),
  createDepartment: (nom: string) => apiClient.post("/departements", { nom }),
  updateDepartment: (id: string, body: { nom?: string; actif?: boolean }) =>
    apiClient.patch(`/departements/${id}`, body),
  members: () =>
    apiClient.get<{ membres: PersonnelMember[] }>("/personnels/membres"),
};
export async function loadPersonnel() {
  const [people, departments, parameters] = await Promise.all([
    personnelApi.list(),
    personnelApi.departments(),
    settingsApi.get(),
  ]);
  return {
    settings: mapSettings(parameters),
    organisation: parameters.organisation,
    schedulesConfigured: parameters.horaires.length === 21,
    agents: people.personnel.map((p): Agent => ({
      id: String(p.id),
      firstName: p.prenom,
      lastName: p.nom,
      departmentId: String(p.departement_id),
      userId: p.utilisateur_id == null ? null : String(p.utilisateur_id),
      birthDate: p.date_naissance,
      hireDate: p.date_embauche ?? "",
      position: p.poste ?? "",
      isActive: p.actif,
      createdAt: p.created_at.slice(0, 10),
      token: "",
    })),
    departments: departments.departements.map((d) => ({
      id: String(d.id),
      name: d.nom,
      isActive: d.actif,
    })),
  };
}

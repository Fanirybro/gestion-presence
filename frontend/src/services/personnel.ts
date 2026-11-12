import { apiClient } from "./api";
import type { Agent, AdministrativeMetadata } from "../types";
import { settingsApi, mapSettings } from "./settings";
import { faceApi } from "../modules/face-recognition";

export interface Personnel {
  id: string;
  organisation_id: string;
  division_id?: string;
  departement_id: string;
  division_nom?: string;
  departement_nom?: string;
  utilisateur_id: string | null;
  nom: string;
  prenom: string;
  date_naissance: string;
  date_embauche: string | null;
  poste: string | null;
  actif: boolean;
  is_enrolled?: boolean;
  enrolled_at?: string | null;
  metadata?: AdministrativeMetadata;
  created_at: string;
  updated_at: string;
}

export type PersonnelInput = {
  division_id?: string;
  departement_id?: string;
  utilisateur_id?: string | null;
  nom: string;
  prenom: string;
  date_naissance: string;
  date_embauche?: string | null;
  poste?: string | null;
  actif?: boolean;
  metadata?: AdministrativeMetadata;
};

export interface DivisionResponsable {
  id: string;
  nom: string;
  prenom: string;
  email: string;
}

export interface Division {
  id: string;
  nom: string;
  actif: boolean;
  responsables?: DivisionResponsable[];
}

export type Departement = Division;

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
  divisions: () =>
    apiClient.get<{ divisions: Division[]; departements: Division[] }>("/divisions"),
  departments: () =>
    apiClient.get<{ divisions: Division[]; departements: Division[] }>("/divisions"),
  createDivision: (data: string | { nom: string; responsable_ids?: string[] }) =>
    apiClient.post("/divisions", typeof data === "string" ? { nom: data } : data),
  createDepartment: (data: string | { nom: string; responsable_ids?: string[] }) =>
    apiClient.post("/divisions", typeof data === "string" ? { nom: data } : data),
  updateDivision: (id: string, body: { nom?: string; actif?: boolean; responsable_ids?: string[] }) =>
    apiClient.patch(`/divisions/${id}`, body),
  updateDepartment: (id: string, body: { nom?: string; actif?: boolean; responsable_ids?: string[] }) =>
    apiClient.patch(`/divisions/${id}`, body),
  assignPersonnelToDivision: (divisionId: string, personnelIds: string[]) =>
    apiClient.post<{ success: boolean; count: number }>(`/divisions/${divisionId}/assign-personnels`, {
      personnel_ids: personnelIds,
    }),
  members: () =>
    apiClient.get<{ membres: PersonnelMember[] }>("/personnels/membres"),
};

export async function loadPersonnel() {
  const [people, divisionsRes, parameters] = await Promise.all([
    personnelApi.list(),
    personnelApi.divisions(),
    settingsApi.get(),
  ]);
  const divs = divisionsRes.divisions || divisionsRes.departements || [];

  // Récupération directe du statut d'enrôlement biométrique via le service facial
  let faceProfiles: any[] = [];
  try {
    const orgId = parameters.organisation?.id;
    faceProfiles = await faceApi.getPersonnel(orgId);
  } catch {
    // Non bloquant si le service biométrique n'est pas interrogé
  }

  const enrolledMap = new Map<string, any>(
    (faceProfiles || [])
      .filter((fp: any) => fp.is_enrolled)
      .map((fp: any) => [String(fp.id), fp])
  );

  return {
    settings: mapSettings(parameters),
    organisation: parameters.organisation,
    schedulesConfigured: parameters.horaires.length === 21,
    agents: people.personnel.map((p): Agent => {
      const faceInfo = enrolledMap.get(String(p.id));
      const isEnrolled = Boolean(p.is_enrolled) || Boolean(faceInfo?.is_enrolled);
      return {
        id: String(p.id),
        firstName: p.prenom,
        lastName: p.nom,
        departmentId: String(p.division_id || p.departement_id),
        divisionId: String(p.division_id || p.departement_id),
        divisionName: p.division_nom || p.departement_nom || "",
        userId: p.utilisateur_id == null ? null : String(p.utilisateur_id),
        birthDate: p.date_naissance,
        hireDate: p.date_embauche ?? "",
        position: p.poste ?? "",
        isActive: p.actif,
        isEnrolled,
        enrolledAt: p.enrolled_at || faceInfo?.enrolled_at || null,
        metadata: p.metadata || {},
        createdAt: p.created_at.slice(0, 10),
        token: "",
      };
    }),
    departments: divs.map((d) => ({
      id: String(d.id),
      name: d.nom,
      isActive: d.actif,
      responsables: d.responsables || [],
    })),
    divisions: divs.map((d) => ({
      id: String(d.id),
      name: d.nom,
      isActive: d.actif,
      responsables: d.responsables || [],
    })),
  };
}

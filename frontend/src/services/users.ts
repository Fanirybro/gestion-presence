import { apiClient } from "./api";
import type { Role, UserPermissions } from "../types";

export interface UserDto {
  id: string;
  organisation_id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  actif: boolean;
  membership_status: string;
  permissions: UserPermissions;
  created_at: string;
  updated_at: string;
}

export const usersService = {
  list: async () => {
    return await apiClient.get<{ users: UserDto[]; page: number; limit: number }>("/users");
  },
  getById: async (id: string) => {
    return await apiClient.get<{ user: UserDto }>(`/users/${id}`);
  },
  create: async (data: { nom: string; prenom: string; email: string; password: string; role: Role }) => {
    return await apiClient.post<{ user: UserDto }>("/users", data);
  },
  update: async (id: string, data: { nom?: string; prenom?: string; email?: string }) => {
    return await apiClient.patch<{ user: UserDto }>(`/users/${id}`, data);
  },
  updateRole: async (id: string, role: Role) => {
    return await apiClient.patch<{ user: UserDto }>(`/users/${id}/role`, { role });
  },
  updateStatus: async (id: string, actif: boolean) => {
    return await apiClient.patch<{ user: UserDto }>(`/users/${id}/status`, { actif });
  },
  updatePermissions: async (id: string, permissions: UserPermissions) => {
    return await apiClient.patch<{ user: UserDto }>(`/users/${id}/permissions`, { permissions });
  },
};


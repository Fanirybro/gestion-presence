import { apiClient } from "./api";
import type { RoleDefinition, UserPermissions } from "../types";

export const rolesService = {
  list: async () => {
    return await apiClient.get<{ roles: RoleDefinition[] }>("/roles");
  },
  create: async (data: { nom: string; description?: string; permissions?: UserPermissions }) => {
    return await apiClient.post<{ role: RoleDefinition }>("/roles", data);
  },
  update: async (
    id: string,
    data: { nom?: string; description?: string; permissions?: UserPermissions },
  ) => {
    return await apiClient.patch<{ role: RoleDefinition }>(`/roles/${id}`, data);
  },
  delete: async (id: string) => {
    return await apiClient.delete<{ message: string }>(`/roles/${id}`);
  },
};


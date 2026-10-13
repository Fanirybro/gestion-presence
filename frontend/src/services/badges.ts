import { apiClient } from "./api";
import type { Attendance, Scan } from "../types";
export interface BadgeData {
  id: string;
  personnel_id: string;
  token: string | null;
}
export const badgesApi = {
  get: (id: string) =>
    apiClient.get<{ badge: BadgeData | null }>(`/badges/personnel/${id}`),
  create: (id: string, regenerate = false) =>
    apiClient.post<{ badge: BadgeData }>(`/badges/personnel/${id}`, {
      regenerate,
    }),
  revoke: (id: string) =>
    apiClient.post<{ badge: null }>(`/badges/personnel/${id}/revoke`, {}),
  prepare: () => apiClient.post<{ badges: BadgeData[] }>("/badges/prepare", {}),
  scan: (token: string, key: string) =>
    apiClient.post<{ type: "ARRIVAL" | "DEPARTURE"; message: string }>(
      "/badges/scan",
      { token, cle_idempotence: key },
    ),
  events: () =>
    apiClient.get<{ attendance: Attendance[]; scans: Scan[] }>(
      "/badges/events",
    ),
};

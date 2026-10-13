import { apiClient } from "./api";
import type { Attendance, Audit } from "../types";

export type PresenceRecord = Attendance & {
  arrivalDate: string;
  departureDate: string;
  version: string;
};

export const presencesApi = {
  list: (start: string, end: string) =>
    apiClient.get<{ attendance: PresenceRecord[] }>(`/presences?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  get: (id: string) => apiClient.get<{ attendance: PresenceRecord; audit: Audit[] }>(`/presences/${id}`),
  correct: (id: string, body: { arrival: string; departure: string; arrivalDate: string; departureDate: string; reason: string; version: string }) =>
    apiClient.patch<{ attendance: PresenceRecord }>(`/presences/${id}`, body),
  justify: (id: string, body: { reason: string; version: string }) =>
    apiClient.post<{ attendance: PresenceRecord }>(`/presences/${id}/justify`, body),
};

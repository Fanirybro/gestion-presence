import { apiClient } from "./api";

export type AuthorizedAbsence = {
  id: string; agentId: string; type: "LEAVE" | "PERMISSION";
  start: string; end: string; from: string | null; to: string | null;
  remark: string; cancelled: boolean; version: string;
};
type AbsenceInput = Omit<AuthorizedAbsence, "id" | "cancelled" | "version"> & { version?: string };
export const authorizedAbsences = {
  async list() {
    return (await apiClient.get<{ absences: AuthorizedAbsence[] }>("/absences-autorisees")).absences;
  },
  async save(record: AbsenceInput, id?: string) {
    const body = { ...record, from: record.from || "", to: record.to || "" };
    const result = id
      ? await apiClient.patch<{ absences: AuthorizedAbsence[] }>(`/absences-autorisees/${id}`, body)
      : await apiClient.post<{ absences: AuthorizedAbsence[] }>("/absences-autorisees", body);
    return result.absences;
  },
  async cancel(id: string, version: string) {
    return (await apiClient.post<{ absences: AuthorizedAbsence[] }>(`/absences-autorisees/${id}/cancel`, { version })).absences;
  },
};

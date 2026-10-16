import { apiClient } from "./api";
import type { Organisation } from "./auth";
import type { Settings, SchedulePeriod } from "../types";
import { weekDays, periods, periodDefaults } from "./schedules";
export interface Horaire {
  jour_semaine: number;
  periode: SchedulePeriod;
  fin_jour_suivant: boolean;
  jour_travaille: boolean;
  heure_debut: string | null;
  heure_fin: string | null;
  heure_limite_absence: string | null;
  tolerance_retard_minutes: number;
}
export interface Parametres {
  organisation: Organisation;
  horaires: Horaire[];
}
export function mapSettings(data: Parametres): Settings {
  return {
    organization: data.organisation.nom,
    address: data.organisation.adresse ?? "",
    pointage_qr: data.organisation.pointage_qr ?? true,
    pointage_facial: data.organisation.pointage_facial ?? true,
    schedules: weekDays.flatMap((day, index) =>
      periods.map((period) => {
        const row = data.horaires.find(
          (h) => h.jour_semaine === index && h.periode === period,
        );
        return {
          day,
          period,
          overnight: row?.fin_jour_suivant ?? false,
          working: row?.jour_travaille ?? false,
          start: row?.heure_debut ?? periodDefaults[period].start,
          end: row?.heure_fin ?? periodDefaults[period].end,
          cutoff: row?.heure_limite_absence ?? periodDefaults[period].cutoff,
          tolerance: row?.tolerance_retard_minutes ?? 0,
        };
      }),
    ),
  };
}
export const settingsApi = {
  get: () => apiClient.get<Parametres>("/parametres"),
  save: (settings: Settings) =>
    apiClient.patch<Parametres>("/parametres", {
      nom: settings.organization,
      adresse: settings.address.trim() || null,
      pointage_qr: settings.pointage_qr ?? true,
      pointage_facial: settings.pointage_facial ?? true,
      horaires: settings.schedules.map((s) => ({
        jour_semaine: weekDays.indexOf(s.day),
        periode: s.period,
        fin_jour_suivant: s.working && s.overnight,
        jour_travaille: s.working,
        heure_debut: s.working ? s.start : null,
        heure_fin: s.working ? s.end : null,
        heure_limite_absence: s.working ? s.cutoff : null,
        tolerance_retard_minutes: s.working ? s.tolerance : 0,
      })),
    }),
};

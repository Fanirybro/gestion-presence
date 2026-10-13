import type { Schedule, SchedulePeriod, Status } from "../types";

export const weekDays = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
export const periods: SchedulePeriod[] = ["MATIN", "APRES_MIDI", "SOIR"];
export const periodLabels: Record<SchedulePeriod, string> = {
  MATIN: "Matin",
  APRES_MIDI: "Après-midi",
  SOIR: "Soir",
};
export const periodDefaults = {
  MATIN: { start: "08:00", end: "12:00", cutoff: "10:00" },
  APRES_MIDI: { start: "13:00", end: "17:00", cutoff: "15:00" },
  SOIR: { start: "18:00", end: "22:00", cutoff: "20:00" },
};
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// La présence reste une synthèse journalière ; son arrivée utilise le créneau
// en cours (y compris la suite du soir précédent), ou le prochain créneau.
export function scheduleAt(
  schedules: Schedule[],
  day: number,
  time: string,
): Schedule | undefined {
  const previous = schedules.find(
    (s) =>
      s.day === weekDays[(day + 6) % 7] &&
      s.working &&
      s.overnight &&
      time < s.end,
  );
  if (previous) return previous;
  const today = schedules
    .filter((s) => s.day === weekDays[day] && s.working)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    today.find((s) => time >= s.start && (s.overnight || time < s.end)) ??
    today.find((s) => time < s.start) ??
    today.at(-1)
  );
}
export function scheduledArrivalStatus(
  time: string,
  schedule: Schedule,
): { status: Status; lateMinutes: number } {
  let arrival = minutes(time);
  if (schedule.overnight && arrival < minutes(schedule.end)) arrival += 1440;
  const lateMinutes = Math.max(
    0,
    arrival - minutes(schedule.start) - schedule.tolerance,
  );
  return { status: lateMinutes ? "LATE" : "PRESENT", lateMinutes };
}

export function schedulesError(schedules: Schedule[]): string | null {
  const active = schedules
    .filter((s) => s.working)
    .map((s) => {
      const start = minutes(s.start),
        end = minutes(s.end) + (s.overnight ? 1440 : 0);
      const cutoff =
        minutes(s.cutoff) + (s.overnight && s.cutoff < s.start ? 1440 : 0);
      return {
        s,
        start,
        end,
        cutoff,
        absoluteStart: weekDays.indexOf(s.day) * 1440 + start,
        absoluteEnd: weekDays.indexOf(s.day) * 1440 + end,
      };
    })
    .sort(
      (a, b) =>
        weekDays.indexOf(a.s.day) - weekDays.indexOf(b.s.day) ||
        periods.indexOf(a.s.period) - periods.indexOf(b.s.period),
    );
  for (const { s, start, end, cutoff } of active) {
    if (
      ![s.start, s.end, s.cutoff].every((t) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
      ) ||
      !Number.isInteger(s.tolerance) ||
      s.tolerance < 0 ||
      end <= start ||
      end - start >= 1440 ||
      cutoff < start + s.tolerance ||
      cutoff > end ||
      (s.overnight && s.period !== "SOIR")
    ) {
      return `${s.day} — ${periodLabels[s.period]} : vérifiez la fin, la tolérance et le seuil d’absence. Un créneau dure moins de 24 h.`;
    }
  }
  for (let i = 1; i < active.length; i++) {
    if (active[i].absoluteStart < active[i - 1].absoluteEnd)
      return "Les créneaux doivent suivre l’ordre matin, après-midi, soir sans se chevaucher, même le lendemain.";
  }
  if (
    active.length &&
    active.at(-1)!.absoluteEnd > active[0].absoluteStart + 7 * 1440
  )
    return "Le samedi soir chevauche le dimanche matin.";
  return null;
}

import type { Agent, Status } from "./types";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Antananarivo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const nowTime = () =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Antananarivo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
export const dateLabel = (date: string, long = false) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: long ? "full" : "medium",
    timeZone: "Indian/Antananarivo",
  }).format(new Date(`${date}T12:00:00+03:00`));
export const fullName = (agent?: Agent) =>
  agent ? `${agent.firstName} ${agent.lastName}` : "Agent introuvable";
export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export const statusLabels: Record<Status, string> = {
  PRESENT: "Présent",
  LATE: "En retard",
  ABSENT: "Absent",
  JUSTIFIED: "Justifié",
};
export const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export function arrivalStatus(
  time: string,
  start: string,
  tolerance: number,
): { status: Status; lateMinutes: number } {
  const lateMinutes = Math.max(0, minutes(time) - minutes(start) - tolerance);
  return { status: lateMinutes ? "LATE" : "PRESENT", lateMinutes };
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(rows: string[][], filename: string) {
  const safe = (s: string) => (/^[=+@\-\t\r]/.test(s) ? `'${s}` : s);
  saveBlob(
    new Blob(
      [
        "\uFEFF" +
          rows
            .map((row) =>
              row.map((c) => `"${safe(c).replaceAll('"', '""')}"`).join(";"),
            )
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    ),
    filename,
  );
}

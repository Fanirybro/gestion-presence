import test from "node:test";
import assert from "node:assert/strict";
import { scheduleAt, scheduledArrivalStatus, schedulesError } from "../src/services/schedules.ts";
import type { Schedule } from "../src/types.ts";
const schedules: Schedule[] = [
  { day: "Lundi", period: "MATIN", working: true, overnight: false, start: "08:00", end: "12:00", cutoff: "10:00", tolerance: 10 },
  { day: "Lundi", period: "APRES_MIDI", working: true, overnight: false, start: "13:00", end: "17:00", cutoff: "15:00", tolerance: 5 },
  { day: "Lundi", period: "SOIR", working: true, overnight: true, start: "18:00", end: "02:00", cutoff: "00:30", tolerance: 15 },
];
test("sélection du créneau et calcul du retard, y compris après minuit", () => {
  assert.equal(scheduleAt(schedules, 1, "08:30")?.period, "MATIN");
  assert.equal(scheduleAt(schedules, 1, "12:30")?.period, "APRES_MIDI");
  assert.equal(scheduleAt(schedules, 1, "13:30")?.period, "APRES_MIDI");
  assert.equal(scheduledArrivalStatus("13:30", schedules[1]).lateMinutes, 25);
  assert.equal(scheduleAt(schedules, 2, "00:30")?.period, "SOIR");
  assert.equal(scheduledArrivalStatus("00:30", schedules[2]).lateMinutes, 375);
  assert.equal(scheduledArrivalStatus("17:30", schedules[2]).lateMinutes, 0);
  assert.equal(scheduleAt(schedules, 2, "02:00"), undefined);
});
test("validation des chevauchements et des seuils après minuit", () => {
  assert.equal(schedulesError(schedules), null);
  assert.match(schedulesError([...schedules, { ...schedules[0], day: "Mardi", start: "01:00" }])!, /chevaucher/);
  assert.match(schedulesError([{ ...schedules[2], day: "Samedi", end: "09:00" }, { ...schedules[0], day: "Dimanche" }])!, /samedi soir/i);
  assert.notEqual(schedulesError([{ ...schedules[2], cutoff: "03:00" }]), null);
});

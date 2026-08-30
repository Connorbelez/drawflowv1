import { describe, expect, test } from "vitest";
import { deriveScheduleHealth } from "./scheduleHealth";

describe("deriveScheduleHealth", () => {
  test.each([
    {
      expected: { health: "on_track", overdueDays: 0 },
      input: { currentDay: 7, endDay: 7, lifecycleStatus: "in_progress" },
      name: "ends on the current Build day",
    },
    {
      expected: { health: "on_track", overdueDays: 0 },
      input: { currentDay: 7, endDay: 8, lifecycleStatus: "in_progress" },
      name: "ends tomorrow",
    },
    {
      expected: { health: "behind_schedule", overdueDays: 1 },
      input: { currentDay: 7, endDay: 6, lifecycleStatus: "in_progress" },
      name: "ended yesterday",
    },
    {
      expected: { health: "behind_schedule", overdueDays: 4 },
      input: { currentDay: 7, endDay: 3, lifecycleStatus: "planned" },
      name: "classifies overdue incomplete planned work for parent surfaces",
    },
    {
      expected: { health: "behind_schedule", overdueDays: 1 },
      input: {
        actualStartedAt: undefined,
        currentDay: 7,
        endDay: 10,
        lifecycleStatus: "planned",
        startDay: 6,
      },
      name: "classifies planned work whose start passed without work starting",
    },
    {
      expected: { health: "on_track", overdueDays: 0 },
      input: {
        actualStartedAt: undefined,
        currentDay: 7,
        endDay: 10,
        lifecycleStatus: "planned",
        startDay: 7,
      },
      name: "keeps work on track on its planned start day",
    },
    {
      expected: { health: "on_track", overdueDays: 0 },
      input: {
        actualStartedAt: Date.parse("2026-08-24T12:00:00.000Z"),
        currentDay: 7,
        endDay: 10,
        lifecycleStatus: "in_progress",
        startDay: 6,
      },
      name: "does not flag started work before its planned end",
    },
    {
      expected: { health: "behind_schedule", overdueDays: 4 },
      input: { currentDay: 7, endDay: 3, lifecycleStatus: "in_progress" },
      name: "marks August 3 work four days overdue on August 7",
    },
    {
      expected: { health: "on_track", overdueDays: 0 },
      input: { currentDay: 7, endDay: 3, lifecycleStatus: "complete" },
      name: "does not classify completed work as behind schedule",
    },
  ])("$name", ({ expected, input }) => {
    expect(deriveScheduleHealth(input)).toEqual(expected);
  });

  test.each([
    { currentDay: undefined, endDay: 3, lifecycleStatus: "in_progress" },
    { currentDay: 7, endDay: undefined, lifecycleStatus: "in_progress" },
    { currentDay: Number.NaN, endDay: 3, lifecycleStatus: "in_progress" },
  ])("fails closed when schedule input is missing or invalid", (input) => {
    expect(deriveScheduleHealth(input)).toEqual({
      health: "on_track",
      overdueDays: 0,
    });
  });
});

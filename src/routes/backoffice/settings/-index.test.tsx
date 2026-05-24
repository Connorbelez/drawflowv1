import { describe, expect, test } from "vitest";
import type {
  TimelineSettingsScenarioDraft,
  TimelineSettingsTemplateDraft,
} from "../../demo/timeline/-timeline-demo-settings-adapter.ts";
import { buildSettingsCashflowChartData } from "./index.tsx";

const template: TimelineSettingsTemplateDraft = {
  description: "Template",
  isDefault: true,
  milestones: [
    {
      dependencyKeys: [],
      durationDays: 10,
      icon: "foundation",
      included: true,
      milestoneKey: "foundation",
      name: "Foundation",
      order: 0,
      percentageBps: 2500,
      submilestones: [],
      type: "foundation",
    },
    {
      dependencyKeys: [],
      durationDays: 12,
      icon: "framing",
      included: true,
      milestoneKey: "framing",
      name: "Framing",
      order: 1,
      percentageBps: 7500,
      submilestones: [],
      type: "framing",
    },
  ],
  scenarios: [],
  summary: "2 milestones",
  templateKey: "full",
  title: "Full Build",
};

const scenario: TimelineSettingsScenarioDraft = {
  description: "Standard",
  draws: [
    {
      amountBps: 2500,
      drawKey: "draw-01",
      label: "Draw 01",
      order: 0,
      reviewNote: "Foundation complete",
      timingDay: 12,
    },
  ],
  isActive: true,
  isDefault: true,
  name: "Standard",
  scenarioKey: "standard",
  sortOrder: 0,
};

describe("settings cashflow preview data", () => {
  test("benchmarks against $1M and treats draws as reimbursements, not capital spikes", () => {
    const data = buildSettingsCashflowChartData(template, scenario);

    expect(data[0]).toMatchObject({
      cashOnHand: 250_000,
      event: "start",
    });
    expect(data.find((row) => row.id === "milestone:foundation")).toMatchObject({
      budget: 250_000,
      capitalSpikeAmount: 0,
      cashOnHand: 0,
    });
    expect(data.find((row) => row.id === "draw:draw-01")).toMatchObject({
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: 250_000,
      event: "draw",
    });
  });
});

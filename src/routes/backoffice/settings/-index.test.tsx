// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  TimelineSettingsScenarioDraft,
  TimelineSettingsTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import {
  TimelineSettingsWorkspace,
  buildSettingsCashflowChartData,
} from "./index.tsx";

afterEach(() => cleanup());

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
      siteVisitGuidance: {
        cameraAngles: ["Wide foundation photo."],
        whatToVerify: ["Foundation complete."],
      },
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
      siteVisitGuidance: {
        cameraAngles: ["Wide framing photo."],
        whatToVerify: ["Framing complete."],
      },
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
      day: 0,
      milestoneEndDay: 10,
    });
    expect(data.find((row) => row.id === "milestone:framing")).toMatchObject({
      day: 15,
      milestoneEndDay: 27,
    });
    expect(data.find((row) => row.id === "draw:draw-01")).toMatchObject({
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: 250_000,
      event: "draw",
    });
  });
});

describe("TimelineSettingsWorkspace", () => {
  test("renders the full tabbed settings workspace for production data", async () => {
    const productionTemplate: TimelineSettingsTemplateDraft = {
      ...template,
      scenarios: [scenario],
    };
    const seed = vi.fn(async () => ({ templates: [productionTemplate] }));
    const save = vi.fn(async () => ({ templates: [productionTemplate] }));

    render(
      <TimelineSettingsWorkspace
        labels={{
          emptyBody: "Seed production defaults before editing templates.",
          emptyTitle: "Production defaults needed",
          eyebrow: "Production proposal settings",
          loadingText: "Loading production proposal settings...",
          sectionLabel: "Production",
          seedButtonLabel: "Seed defaults to prod",
          seedConfirmBody:
            "This seeds tenant-scoped production templates and draw scenarios.",
          seedConfirmTitle: "Seed production defaults?",
          title: "Settings workspace",
        }}
        onDeleteScenario={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onResetScenario={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onResetTemplate={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onSaveTemplate={save}
        onSeedDefaults={seed}
        settings={{ templates: [productionTemplate] }}
      />,
    );

    expect(screen.getByText("Production proposal settings")).toBeTruthy();
    expect(screen.getByText("Settings workspace")).toBeTruthy();
    expect(screen.getByText("Template settings")).toBeTruthy();
    expect(
      screen.getByTestId("timeline-settings-template-blueprint-table"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Draw scenarios" }));
    expect(
      await screen.findByTestId("timeline-settings-scenario-header"),
    ).toBeTruthy();
    expect(screen.getAllByDisplayValue("Standard").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Foundation complete")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Seed defaults to prod" }),
    );
    expect(screen.getByText("Seed production defaults?")).toBeTruthy();
  });
});

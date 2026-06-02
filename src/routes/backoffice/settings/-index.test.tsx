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
        cameraAngles: "<ul><li>Wide foundation photo.</li></ul>",
        whatToVerify: "<ul><li>Foundation complete.</li></ul>",
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
        cameraAngles: "<ul><li>Wide framing photo.</li></ul>",
        whatToVerify: "<ul><li>Framing complete.</li></ul>",
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
    const fourPlexTemplate: TimelineSettingsTemplateDraft = {
      ...template,
      isDefault: false,
      summary: "8 milestones, 36 budget line items, 100.00% PoC, 160 field days",
      templateKey: "4-plex",
      title: "4-plex",
    };
    const seed = vi.fn(async () => ({
      settings: { templates: [productionTemplate, fourPlexTemplate] },
    }));
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
    fireEvent.click(screen.getByRole("button", { name: "Confirm seed" }));

    expect(seed).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("4-plex")).toBeTruthy();
    expect(await screen.findByText("2 loaded")).toBeTruthy();
  });

  test("lists draw timing conflicts with milestones and nearest valid days", async () => {
    const invalidScenario: TimelineSettingsScenarioDraft = {
      ...scenario,
      draws: [
        {
          amountBps: 4000,
          drawKey: "draw-01",
          label: "Draw 01",
          order: 0,
          reviewNote: "Foundation complete",
          timingDay: 9,
        },
        {
          amountBps: 6000,
          drawKey: "draw-02",
          label: "Draw 02",
          order: 1,
          reviewNote: "Framing complete",
          timingDay: 27,
        },
      ],
    };
    const productionTemplate: TimelineSettingsTemplateDraft = {
      ...template,
      scenarios: [invalidScenario],
    };

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
        onSaveTemplate={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onSeedDefaults={vi.fn(async () => ({ templates: [productionTemplate] }))}
        settings={{ templates: [productionTemplate] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Draw scenarios" }));

    expect(
      await screen.findByText(
        "Draw 01, day 9: conflicts with Foundation (ends day 10) and Framing (starts day 15). Valid window: days 11-14. Nearest valid day: 11.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Draw 02, day 27: conflicts with Framing (ends day 27). Valid final draw window: days 28-31. Nearest valid day: 28.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Draw 01 timing day").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Draw 02 timing day").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});

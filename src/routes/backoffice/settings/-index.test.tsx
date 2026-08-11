// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  TimelineSettingsScenarioDraft,
  TimelineSettingsTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import {
  TimelineSettingsWorkspace,
  buildSettingsCashflowChartData,
  buildSettingsScenarioScheduleRows,
  buildSettingsScheduleReferenceLines,
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

  test("projects milestone start, milestone end, and draw unlock into matching schedule lanes", () => {
    const scenarioWithTwoDraws: TimelineSettingsScenarioDraft = {
      ...scenario,
      draws: [
        scenario.draws[0]!,
        {
          amountBps: 7500,
          drawKey: "draw-02",
          label: "Draw 02",
          order: 1,
          reviewNote: "Framing complete",
          timingDay: 29,
        },
      ],
    };

    expect(
      buildSettingsScenarioScheduleRows(template, scenarioWithTwoDraws).map(
        ({ draw, milestone, milestoneEnd, milestoneStart }) => ({
          drawUnlock: draw.timingDay,
          milestone: milestone?.name,
          milestoneEnd,
          milestoneStart,
        })
      )
    ).toEqual([
      {
        drawUnlock: 12,
        milestone: "Foundation",
        milestoneEnd: 10,
        milestoneStart: 0,
      },
      {
        drawUnlock: 29,
        milestone: "Framing",
        milestoneEnd: 27,
        milestoneStart: 15,
      },
    ]);
    expect(
      buildSettingsScheduleReferenceLines(template, scenarioWithTwoDraws).map(
        ({ label, labelOffsetY, x }) => ({ label, labelOffsetY, x })
      )
    ).toEqual([
      { label: "M1 · Day 0", labelOffsetY: -52, x: 0 },
      { label: "M1 · Day 10", labelOffsetY: -28, x: 10 },
      { label: "D1 · Day 12", labelOffsetY: -4, x: 12 },
      { label: "M2 · Day 15", labelOffsetY: -52, x: 15 },
      { label: "M2 · Day 27", labelOffsetY: -28, x: 27 },
      { label: "D2 · Day 29", labelOffsetY: -4, x: 29 },
    ]);
  });
});

describe("TimelineSettingsWorkspace", () => {
  test("rebalances removed sub-milestone PoC through the settings save boundary", async () => {
    const templateWithSubmilestones: TimelineSettingsTemplateDraft = {
      ...template,
      milestones: [
        {
          ...template.milestones[0]!,
          percentageBps: 5000,
          submilestones: [
            {
              description: "Excavate the site",
              durationDays: 4,
              name: "Excavation",
              order: 0,
              percentageBps: 3000,
              submilestoneKey: "foundation-excavation",
            },
            {
              description: "Pour the foundation",
              durationDays: 6,
              fieldGuidance: {
                cameraAnglesTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Foundation pour camera"}]}]}',
                whatToVerifyTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Foundation pour verification"}]}]}',
              },
              name: "Foundation pour",
              order: 1,
              percentageBps: 2000,
              scopeOfWorkTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Pour footings and walls"}]}]}',
              submilestoneKey: "foundation-pour",
            },
          ],
        },
        {
          ...template.milestones[1]!,
          dependencyKeys: ["foundation"],
          percentageBps: 5000,
          submilestones: [
            {
              description: "Frame the shell",
              durationDays: 12,
              fieldGuidance: {
                cameraAnglesTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Framing camera"}]}]}',
                whatToVerifyTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Framing verification"}]}]}',
              },
              name: "Frame shell",
              order: 0,
              percentageBps: 5000,
              scopeOfWorkTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Frame walls and roof"}]}]}',
              submilestoneKey: "framing-shell",
            },
          ],
        },
      ],
      scenarios: [
        {
          ...scenario,
          draws: scenario.draws.map((draw) => ({
            ...draw,
            amountBps: 10_000,
          })),
        },
      ],
    };
    const save = vi.fn(
      async (savedTemplate: TimelineSettingsTemplateDraft) => ({
        templates: [savedTemplate],
      })
    );
    const { container } = render(
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
        onDeleteScenario={vi.fn(async () => ({
          templates: [templateWithSubmilestones],
        }))}
        onResetScenario={vi.fn(async () => ({
          templates: [templateWithSubmilestones],
        }))}
        onResetTemplate={vi.fn(async () => ({
          templates: [templateWithSubmilestones],
        }))}
        onSaveTemplate={save}
        onSeedDefaults={vi.fn(async () => ({
          templates: [templateWithSubmilestones],
        }))}
        settings={{ templates: [templateWithSubmilestones] }}
      />
    );

    fireEvent.click(screen.getByTestId("timeline-setup-row-expand-foundation"));
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-submilestone-remove-foundation-excavation"
      )
    );

    expect(
      container.querySelector(".timeline-blueprint-footer")?.textContent
    ).toContain("100.00%");
    expect(screen.queryByText(/Included PoC must equal 100\.00%/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(screen.getByText("Save Full Build?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm save" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0].milestones).toMatchObject([
      {
        milestoneKey: "foundation",
        percentageBps: 2857,
        submilestones: [
          {
            fieldGuidance: {
              cameraAnglesTiptapJson:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Foundation pour camera"}]}]}',
              whatToVerifyTiptapJson:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Foundation pour verification"}]}]}',
            },
            percentageBps: 2857,
            scopeOfWorkTiptapJson:
              '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Pour footings and walls"}]}]}',
            submilestoneKey: "foundation-pour",
          },
        ],
      },
      {
        milestoneKey: "framing",
        percentageBps: 7143,
        submilestones: [
          {
            fieldGuidance: {
              cameraAnglesTiptapJson:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Framing camera"}]}]}',
              whatToVerifyTiptapJson:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Framing verification"}]}]}',
            },
            percentageBps: 7143,
            scopeOfWorkTiptapJson:
              '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Frame walls and roof"}]}]}',
            submilestoneKey: "framing-shell",
          },
        ],
      },
    ]);
  });

  test("renders the full tabbed settings workspace for production data", async () => {
    const productionTemplate: TimelineSettingsTemplateDraft = {
      ...template,
      scenarios: [
        {
          ...scenario,
          draws: scenario.draws.map((draw) => ({
            ...draw,
            amountBps: 10_000,
          })),
        },
      ],
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
    const create = vi.fn(async (createdTemplate: TimelineSettingsTemplateDraft) => ({
      templates: [productionTemplate, createdTemplate],
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
        onCreateTemplate={create}
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
    expect(
      screen.getByRole("columnheader", { name: "Milestone start" })
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Milestone end" })
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Draw unlock" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Draw 01 milestone start day").textContent).toBe(
      "Day 0"
    );
    expect(screen.getByLabelText("Draw 01 milestone end day").textContent).toBe(
      "Day 10"
    );
    expect(
      (screen.getByLabelText("Draw 01 draw unlock day") as HTMLInputElement)
        .value
    ).toBe("12");
    const previewStartingCashInput = screen.getByLabelText(
      "Preview starting cash",
    ) as HTMLInputElement;
    expect(previewStartingCashInput.value).toBe("$250,000");
    fireEvent.change(previewStartingCashInput, {
      target: { value: "100000" },
    });
    expect(
      screen.getByTestId("timeline-settings-preview-starting-cash-compact")
        .textContent,
    ).toBe("$100K");
    fireEvent.blur(previewStartingCashInput);
    expect(previewStartingCashInput.value).toBe("$100,000");

    fireEvent.click(
      screen.getByRole("button", { name: "Seed defaults to prod" }),
    );
    expect(screen.getByText("Seed production defaults?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm seed" }));

    expect(seed).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("4-plex")).toBeTruthy();
    expect(await screen.findByText("2 loaded")).toBeTruthy();
  });

  test("creates a draft template from settings and submits it through the create handler", async () => {
    const productionTemplate: TimelineSettingsTemplateDraft = {
      ...template,
      scenarios: [
        {
          ...scenario,
          draws: scenario.draws.map((draw) => ({
            ...draw,
            amountBps: 10_000,
          })),
        },
      ],
    };
    const create = vi.fn(async (createdTemplate: TimelineSettingsTemplateDraft) => ({
      templates: [productionTemplate, createdTemplate],
    }));

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
        onCreateTemplate={create}
        onDeleteScenario={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onResetScenario={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onResetTemplate={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onSaveTemplate={vi.fn(async () => ({ templates: [productionTemplate] }))}
        onSeedDefaults={vi.fn(async () => ({ templates: [productionTemplate] }))}
        settings={{ templates: [productionTemplate] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New template" }));
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    const templateTitleInput = await screen.findByLabelText("Template title");
    fireEvent.change(templateTitleInput, {
      target: { value: "Urban Infill Rowhouse" },
    });
    expect(
      (screen.getByLabelText("Template key") as HTMLInputElement).value,
    ).toBe("urban-infill-rowhouse");
    fireEvent.change(screen.getByLabelText("Template summary"), {
      target: { value: "Custom urban infill template." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create template" }));
    expect(screen.getByText("Create Urban Infill Rowhouse?")).toBeTruthy();
    const confirmCreate = screen.getByRole("button", {
      name: "Confirm create",
    }) as HTMLButtonElement;
    await waitFor(() => expect(confirmCreate.disabled).toBe(false));
    fireEvent.click(confirmCreate);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      isDefault: false,
      summary: "Custom urban infill template.",
      templateKey: "urban-infill-rowhouse",
      title: "Urban Infill Rowhouse",
    });
  });

  test("allows scenario draws inside milestone windows", async () => {
    const inMilestoneScenario: TimelineSettingsScenarioDraft = {
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
      scenarios: [inMilestoneScenario],
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

    expect(await screen.findByDisplayValue("Draw 01")).toBeTruthy();
    expect(screen.queryByText(/conflicts with Foundation/)).toBeNull();
    expect(screen.queryByText(/conflicts with Framing/)).toBeNull();
    expect(
      screen
        .getByLabelText("Draw 01 draw unlock day")
        .getAttribute("aria-invalid"),
    ).toBeNull();
    expect(
      screen
        .getByLabelText("Draw 02 draw unlock day")
        .getAttribute("aria-invalid"),
    ).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildTimelineShareSnapshotV2,
  type DemoDraw,
  type DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  buildTimelinePreviewCsv,
  buildTimelinePreviewCsvFilename,
  buildTimelinePreviewModel,
} from "./timeline-preview-export.ts";

describe("timeline preview export", () => {
  test("builds a preview model with nested sub-milestones and draw rows", () => {
    const snapshot = buildTimelineShareSnapshotV2({
      activeSelection: { itemId: "foundation", phase: "inProgress" },
      capitalSpikes: [
        {
          amount: 12_000,
          eventKind: "cashInfusion",
          id: "cash-infusion-1",
          label: "Owner reserve top-up",
          x: 9,
        },
      ],
      currentDay: 5,
      draws: previewDraws,
      items: previewItems,
      minimumCashReserve: 50_000,
      progressValue: 0,
      range: { max: 80, min: 0, unit: "days" },
      selectedPanelOpen: true,
      startingCash: 400_000,
      straightLine: true,
      title: "Luverne proposal preview",
    });

    const model = buildTimelinePreviewModel(snapshot);

    expect(model).not.toBeNull();
    expect(model?.title).toBe("Luverne proposal preview");
    expect(model?.minimumCashReserveDollars).toBe(50_000);
    expect(model?.milestones[0]).toMatchObject({
      amountDollars: 120_000,
      dayEnd: 20,
      dayStart: 0,
      drawAvailabilityDollars: 96_000,
      name: "Permits, demo & foundation",
    });
    expect(model?.milestones[0]?.submilestones).toEqual([
      {
        budgetDollars: 4_038,
        description: "Civil permit package",
        durationDays: 1,
        key: "foundation-sub-01",
        name: "DC/ED",
        order: 1,
        status: "planned",
      },
      {
        budgetDollars: 35_032,
        description: "Pour slab, cure, and inspect",
        durationDays: 9,
        key: "foundation-sub-02",
        name: "Foundation",
        order: 2,
        status: "planned",
      },
    ]);
    expect(model?.draws).toEqual([
      {
        amountDollars: 96_000,
        customDate: false,
        day: 25,
        id: "foundation-draw",
        label: "Permits & foundation reimbursement draw",
        linkedMilestoneId: "foundation",
        linkedMilestoneName: "Permits, demo & foundation",
        requestStatus: "planned",
      },
    ]);
  });

  test("exports building budget, timeline, and draw schedule sections as csv", () => {
    const snapshot = buildTimelineShareSnapshotV2({
      activeSelection: { itemId: "foundation", phase: "inProgress" },
      capitalSpikes: [
        {
          amount: 7_500,
          eventKind: "cost",
          id: "capital-cost-1",
          label: "Permit change",
          x: 12,
        },
      ],
      currentDay: 5,
      draws: previewDraws,
      items: previewItems,
      minimumCashReserve: 50_000,
      progressValue: 0,
      range: { max: 80, min: 0, unit: "days" },
      selectedPanelOpen: true,
      startingCash: 400_000,
      straightLine: true,
      title: "Luverne proposal preview",
    });
    const model = buildTimelinePreviewModel(snapshot);
    const csv = buildTimelinePreviewCsv(model!);

    expect(csv.split("\n")[0]).toBe(
      "section,type,milestone_order,milestone_id,milestone_name,submilestone_order,submilestone_name,draw_id,label,day_start,day_end,duration_days,amount_usd,draw_availability_usd,status,policy,evidence,notes",
    );
    expect(csv).toContain(
      'Building budget,Milestone,1,foundation,"Permits, demo & foundation",,,,Draw 1,0,20,20,120000,96000,ready,Admin review,Evidence pending,Initial payment 0; distributed spend 120000; completion payment 0',
    );
    expect(csv).toContain(
      'Building budget,Sub-milestone,1,foundation,"Permits, demo & foundation",2,Foundation,,Foundation,,,9,35032,,planned,,,"Pour slab, cure, and inspect"',
    );
    expect(csv).toContain(
      "Timeline,Capital cost,,,,,,capital-cost-1,Permit change,12,12,0,7500,,planned,,,Capital cost",
    );
    expect(csv).toContain(
      'Draw schedule,Reimbursement draw,,foundation,"Permits, demo & foundation",,,foundation-draw,Permits & foundation reimbursement draw,25,25,0,96000,,planned,Reimbursement only,,Milestone-linked draw',
    );
  });

  test("builds stable csv filenames", () => {
    expect(
      buildTimelinePreviewCsvFilename("Luverne, ON proposal preview", "abc123def"),
    ).toBe("luverne-on-proposal-preview-abc123de.csv");
  });
});

const previewItems: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 120_000,
      draw: "Draw 1",
      drawAvailabilityAmount: 96_000,
      durationDays: 20,
      evidence: "Evidence pending",
      icon: "foundation",
      name: "Permits, demo & foundation",
      policy: "Admin review",
      status: "ready",
      subMilestones: ["DC/ED", "Foundation"],
      submilestoneDetails: [
        {
          budgetCents: 403_800,
          description: "Civil permit package",
          durationDays: 1,
          key: "foundation-sub-01",
          name: "DC/ED",
          order: 1,
        },
        {
          budgetCents: 3_503_200,
          description: "Pour slab, cure, and inspect",
          durationDays: 9,
          key: "foundation-sub-02",
          name: "Foundation",
          order: 2,
        },
      ],
    },
    eyebrow: "Milestone 1",
    id: "foundation",
    label: "Foundation",
    markerLabel: "1",
    x: 0,
  },
];

const previewDraws: DemoDraw[] = [
  {
    amount: 96_000,
    id: "foundation-draw",
    itemId: "foundation",
    label: "Permits & foundation reimbursement draw",
    x: 25,
  },
];

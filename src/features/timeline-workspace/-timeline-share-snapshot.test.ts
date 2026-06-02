import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  applyTimelineShareSnapshotV2,
  buildTimelineShareSnapshotV2,
  type DemoDraw,
  type DemoMilestone,
  getMilestoneDrawAvailabilityAmount,
  initialTimelineShareState,
} from "./-timeline-share-snapshot.ts";

const initialItems: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 125_000,
      completionPaymentAmount: 25_000,
      draw: "Draw 1",
      drawX: 22,
      durationDays: 8,
      evidence: "Accepted package",
      icon: "foundation",
      initialPaymentAmount: 10_000,
      name: "Site prep & foundation",
      policy: "Released",
      status: "complete",
      subMilestones: ["Permit mobilization", "Excavation"],
    },
    eyebrow: "Milestone 1",
    id: "site-prep",
    label: "Site prep",
    lane: 0,
    markerLabel: "1",
    tone: "complete",
    x: 14,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 2",
      drawX: 66,
      durationDays: 12,
      evidence: "Accepted package",
      icon: "framing",
      name: "Framing & structure",
      policy: "Released",
      status: "complete",
      subMilestones: ["Wall framing", "Roof trusses"],
    },
    eyebrow: "Milestone 2",
    id: "framing",
    label: "Framing",
    lane: -1,
    markerLabel: "2",
    tone: "complete",
    x: 58,
  },
];

const initialDraws: DemoDraw[] = [
  {
    amount: 125_000,
    id: "site-prep",
    itemId: "site-prep",
    label: "Draw 1",
    x: 22,
  },
  {
    amount: 160_000,
    id: "framing",
    itemId: "framing",
    label: "Draw 2",
    x: 66,
  },
];

describe("timeline share snapshots", () => {
  test("falls back to 20% co-pay when milestone draw availability is missing", () => {
    expect(
      getMilestoneDrawAvailabilityAmount({
        amount: 100_000,
        draw: "Draw 1",
        durationDays: 10,
        evidence: "Planning",
        icon: "foundation",
        name: "Foundation",
        policy: "Planning",
        status: "ready",
        subMilestones: [],
      }),
    ).toBe(80_000);
  });

  test("round-trips initial timeline state", () => {
    const state = initialTimelineShareState(
      initialItems,
      initialDraws,
      [],
      { max: 230, min: 0, unit: "days" },
      { itemId: "framing", phase: "complete" },
      58,
      86,
      true,
      400_000,
      false,
      0,
      300_000
    );
    const snapshot = buildTimelineShareSnapshotV2(state);

    expect(snapshot.payloadVersion).toBe(2);
    expect(snapshot.approvedDrawLimit).toBe(300_000);
    expect(snapshot.currentDay).toBe(86);
    expect(snapshot.activeSelection).toEqual({
      itemId: "framing",
      phase: "complete",
    });
    expect(snapshot.snapshotSummary).toBe(
      "2 milestones · 2 draws · 0 spikes · 0-230 days"
    );
    expect(applyTimelineShareSnapshotV2(snapshot, state)).toEqual(state);
  });

  test("round-trips inserted milestones, manual draws, range, display state, selection, and payment schedule", () => {
    const insertedItems: TimelineItem<DemoMilestone>[] = [
      ...initialItems,
      {
        data: {
          amount: 137_500,
          completionPaymentAmount: 40_000,
          draw: "Inserted 1",
          drawX: 251,
          durationDays: 10,
          evidence: "Draft package",
          icon: "change",
          initialPaymentAmount: 12_500,
          name: "Field change 1",
          policy: "Needs sequencing",
          status: "ready",
          subMilestones: ["Scope estimate", "Schedule alignment"],
        },
        eyebrow: "Inserted milestone",
        id: "inserted-1",
        label: "Field change 1",
        lane: 1,
        markerLabel: "+",
        tone: "warning",
        x: 245,
      },
    ];
    const insertedDraws: DemoDraw[] = [
      ...initialDraws,
      {
        amount: 150_000,
        customDate: true,
        id: "manual-draw-1",
        label: "Draw 3",
        x: 251,
      },
    ];
    const state = initialTimelineShareState(
      insertedItems,
      insertedDraws,
      [
        {
          amount: 35_000,
          eventKind: "cost",
          id: "capital-spike-1",
          label: "Unexpected permit fee",
          x: 248,
        },
      ],
      { max: 260, min: 0, unit: "days" },
      { itemId: "inserted-1", phase: "complete" },
      245,
      245,
      false,
      475_000,
      true
    );

    const snapshot = buildTimelineShareSnapshotV2(state);
    const applied = applyTimelineShareSnapshotV2(snapshot, {
      ...state,
      activeSelection: { itemId: "site-prep", phase: "inProgress" },
    });

    expect(applied).toEqual(state);
    expect(snapshot.items.at(-1)?.data).toMatchObject({
      completionPaymentAmount: 40_000,
      durationDays: 10,
      initialPaymentAmount: 12_500,
    });
    expect(snapshot.draws.at(-1)).toMatchObject({
      amount: 150_000,
      customDate: true,
      id: "manual-draw-1",
      x: 251,
    });
    expect(snapshot.capitalSpikes.at(-1)).toMatchObject({
      amount: 35_000,
      id: "capital-spike-1",
      x: 248,
    });
    expect(snapshot.startingCash).toBe(475_000);
    expect(snapshot.snapshotSummary).toContain("1 spikes");
  });

  test("normalizes invalid active selection and capped payment schedule fields", () => {
    const baseItem = initialItems[0]!;
    const baseData = baseItem.data!;
    const state = initialTimelineShareState(
      [
        {
          ...baseItem,
          data: {
            ...baseData,
            amount: 100_000,
            completionPaymentAmount: 90_000,
            durationDays: -4,
            initialPaymentAmount: 75_000,
          },
        },
      ],
      initialDraws,
      [],
      { max: 230, min: 0, unit: "days" },
      { itemId: "missing", phase: "complete" },
      58,
      86,
      true,
      400_000,
      false
    );

    const snapshot = buildTimelineShareSnapshotV2(state);

    expect(snapshot.activeSelection).toEqual({
      itemId: "site-prep",
      phase: "inProgress",
    });
    expect(snapshot.items[0].data).toMatchObject({
      amount: 100_000,
      completionPaymentAmount: 25_000,
      durationDays: 14,
      initialPaymentAmount: 75_000,
    });
  });

  test("falls back to normalized fallback state for old payload versions", () => {
    const fallback = initialTimelineShareState(
      initialItems,
      initialDraws,
      [],
      { max: 230, min: 0, unit: "days" },
      { itemId: "framing", phase: "complete" },
      58,
      86,
      true,
      400_000,
      false
    );
    const oldPayload = {
      activeItemId: "site-prep",
      capitalSpikes: [],
      draws: [],
      items: [],
      payloadVersion: 1,
      progressValue: 0,
      range: { max: 10, min: 0, unit: "days" },
      selectedPanelOpen: false,
      startingCash: 1,
      straightLine: true,
    };

    expect(applyTimelineShareSnapshotV2(oldPayload, fallback)).toEqual(
      fallback
    );
  });

  test("falls back to normalized fallback state for empty v2 milestone sets", () => {
    const fallback = initialTimelineShareState(
      initialItems,
      initialDraws,
      [],
      { max: 230, min: 0, unit: "days" },
      { itemId: "framing", phase: "complete" },
      58,
      86,
      true,
      400_000,
      false
    );
    const emptyPayload = {
      activeSelection: { itemId: "missing", phase: "complete" },
      capitalSpikes: [],
      draws: [],
      items: [],
      payloadVersion: 2,
      progressValue: 0,
      range: { max: 10, min: 0, unit: "days" },
      selectedPanelOpen: true,
      startingCash: 1,
      straightLine: true,
      title: "Empty",
    };

    expect(applyTimelineShareSnapshotV2(emptyPayload, fallback)).toEqual(
      fallback
    );
  });

  test("does not serialize transient probe or editor state", () => {
    const routeStateWithTransient = {
      activeSelection: { itemId: "framing", phase: "inProgress" as const },
      activeDrawId: "framing",
      drawEditDraft: { amount: "260000", x: "99" },
      capitalSpikes: [],
      currentDay: 86,
      draws: initialDraws,
      items: initialItems,
      probeValue: 77,
      progressValue: 58,
      range: { max: 230, min: 0, unit: "days" },
      selectedPanelOpen: true,
      startingCash: 400_000,
      straightLine: false,
    };
    const snapshot = buildTimelineShareSnapshotV2(routeStateWithTransient);

    expect(snapshot).not.toHaveProperty("activeItemId");
    expect(snapshot).not.toHaveProperty("activeDrawId");
    expect(snapshot).not.toHaveProperty("drawEditDraft");
    expect(snapshot).not.toHaveProperty("probeValue");
  });

  test("uses fallback current day for older v2 snapshots without current day", () => {
    const fallback = initialTimelineShareState(
      initialItems,
      initialDraws,
      [],
      { max: 230, min: 0, unit: "days" },
      { itemId: "framing", phase: "complete" },
      58,
      86,
      true,
      400_000,
      false
    );
    const snapshot = buildTimelineShareSnapshotV2({
      ...fallback,
      currentDay: 0,
    });
    const legacySnapshot = { ...snapshot };
    delete (legacySnapshot as Partial<typeof legacySnapshot>).currentDay;

    expect(applyTimelineShareSnapshotV2(legacySnapshot, fallback).currentDay).toBe(
      86
    );
  });
});

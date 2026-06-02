// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type {
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  deriveMobileDayTimelineEvents,
  deriveMobileStickyTimelineRail,
  deriveMilestoneRowState,
  MilestoneFeed,
  MilestoneFocusView,
  MobileTimelineDayDialWorkspace,
  mobileDrawState,
  TimelineMinimap,
} from "./MobileTimelineWorkspace.tsx";

afterEach(() => cleanup());

const RANGE = { max: 100, min: 0, unit: "days" } as const;

function milestone(
  id: string,
  overrides: Partial<DemoMilestone> & { x: number }
): TimelineItem<DemoMilestone> {
  const { x, ...data } = overrides;
  return {
    data: {
      amount: 100_000,
      draw: `${id} draw`,
      durationDays: 10,
      evidence: "Draft package",
      icon: "foundation",
      name: id,
      policy: "Pending",
      status: "upcoming",
      subMilestones: [],
      ...data,
    },
    id,
    x,
  };
}

describe("mobileDrawState", () => {
  test("classifies draw states the same way as the desktop marker", () => {
    expect(
      mobileDrawState({ amount: 1, id: "d", label: "", requestStatus: "requested", x: 50 }, 10)
    ).toBe("requested");
    expect(
      mobileDrawState({ amount: 1, id: "d", label: "", requestStatus: "rejected", x: 50 }, 10)
    ).toBe("rejected");
    expect(
      mobileDrawState({ amount: 1, id: "d", label: "", requestStatus: "approved", x: 50 }, 10)
    ).toBe("happened");
    // unrequested but already in the past -> happened
    expect(mobileDrawState({ amount: 1, id: "d", label: "", x: 5 }, 10)).toBe(
      "happened"
    );
    // future planned
    expect(mobileDrawState({ amount: 1, id: "d", label: "", x: 50 }, 10)).toBe(
      "planned"
    );
  });
});

describe("deriveMilestoneRowState", () => {
  const items = [
    milestone("Foundation", { status: "ready", x: 0 }),
    milestone("Framing", { x: 20 }),
  ];

  test("builder primary action is submit completion when not complete", () => {
    const state = deriveMilestoneRowState({
      currentDay: 5,
      draws: [],
      item: items[1] as TimelineItem<DemoMilestone>,
      items,
      role: "builder",
    });
    expect(state.primaryAction?.intent).toBe("submitCompletion");
    expect(state.statusLabel).toBe("Upcoming");
  });

  test("builder primary action becomes request draw once approved", () => {
    const approved = milestone("Framing", {
      completionClaim: { completedDay: 25, submittedAt: "x" },
      completionReview: { reviewedAt: "x", status: "approved" },
      x: 20,
    });
    const state = deriveMilestoneRowState({
      currentDay: 30,
      draws: [],
      item: approved,
      items: [items[0] as TimelineItem<DemoMilestone>, approved],
      role: "builder",
    });
    expect(state.primaryAction?.intent).toBe("requestDraw");
    expect(state.statusLabel).toBe("Approved");
  });

  test("lender reviews a claimed-but-unreviewed milestone", () => {
    const claimed = milestone("Framing", {
      completionClaim: { completedDay: 25, submittedAt: "x" },
      x: 20,
    });
    const state = deriveMilestoneRowState({
      currentDay: 30,
      draws: [],
      item: claimed,
      items: [items[0] as TimelineItem<DemoMilestone>, claimed],
      role: "lender",
    });
    expect(state.underReview).toBe(true);
    expect(state.primaryAction?.intent).toBe("reviewCompletion");
  });

  test("lender reviews a requested draw before anything else", () => {
    const draw: DemoDraw = {
      amount: 40_000,
      id: "draw-framing",
      itemId: "Framing",
      label: "Framing draw",
      requestStatus: "requested",
      x: 30,
    };
    const state = deriveMilestoneRowState({
      currentDay: 30,
      draws: [draw],
      item: items[1] as TimelineItem<DemoMilestone>,
      items,
      role: "lender",
    });
    expect(state.primaryAction?.intent).toBe("reviewDraw");
    expect(state.draws[0]?.state).toBe("requested");
  });

  test("flags dependency blockers from earlier unapproved milestones", () => {
    // Framing (x=20) is blocked while Foundation (x=0) is not yet approved.
    const state = deriveMilestoneRowState({
      currentDay: 5,
      draws: [],
      item: items[1] as TimelineItem<DemoMilestone>,
      items,
      role: "builder",
    });
    expect(state.blockingMilestoneNames).toContain("Foundation");
  });
});

describe("MilestoneFeed", () => {
  const items = [
    milestone("Foundation", { status: "ready", x: 0 }),
    milestone("Framing", { x: 20 }),
  ];

  test("renders one row per milestone in order with status chips", () => {
    render(
      <MilestoneFeed
        currentDay={5}
        draws={[]}
        items={items}
        onOpenFocus={vi.fn()}
        onPrimaryAction={vi.fn()}
        onStructuralAction={vi.fn()}
        readOnly={false}
        registerRef={vi.fn()}
        role="builder"
      />
    );
    expect(screen.getByTestId("mobile-milestone-row-Foundation")).toBeTruthy();
    expect(screen.getByTestId("mobile-milestone-row-Framing")).toBeTruthy();
    const foundationIcon = screen
      .getByTestId("mobile-milestone-icon-Foundation")
      .querySelector("img");
    expect(foundationIcon?.getAttribute("src")).toBe(
      "/milestone-icons/foundation.png"
    );
    expect(
      screen.getByTestId("mobile-milestone-status-Foundation").textContent
    ).toBe("Ready");
  });

  test("tapping the row body opens focus mode", () => {
    const onOpenFocus = vi.fn();
    render(
      <MilestoneFeed
        currentDay={5}
        draws={[]}
        items={items}
        onOpenFocus={onOpenFocus}
        onPrimaryAction={vi.fn()}
        onStructuralAction={vi.fn()}
        readOnly={false}
        registerRef={vi.fn()}
        role="builder"
      />
    );
    fireEvent.click(screen.getByTestId("mobile-milestone-open-Framing"));
    expect(onOpenFocus).toHaveBeenCalledWith("Framing");
  });

  test("primary action button fires the role-aware intent", () => {
    const onPrimaryAction = vi.fn();
    render(
      <MilestoneFeed
        currentDay={5}
        draws={[]}
        items={items}
        onOpenFocus={vi.fn()}
        onPrimaryAction={onPrimaryAction}
        onStructuralAction={vi.fn()}
        readOnly={false}
        registerRef={vi.fn()}
        role="builder"
      />
    );
    fireEvent.click(screen.getByTestId("mobile-milestone-primary-Framing"));
    expect(onPrimaryAction).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "submitCompletion" }),
      "Framing"
    );
  });

  test("hides structural edit items when read-only", () => {
    render(
      <MilestoneFeed
        currentDay={5}
        draws={[]}
        items={items}
        onOpenFocus={vi.fn()}
        onPrimaryAction={vi.fn()}
        onStructuralAction={vi.fn()}
        readOnly
        registerRef={vi.fn()}
        role="builder"
      />
    );
    // open the menu for Framing
    fireEvent.click(screen.getByTestId("mobile-milestone-menu-Framing"));
    expect(screen.queryByTestId("mobile-milestone-edit-dates-Framing")).toBeNull();
  });
});

describe("MilestoneFocusView", () => {
  test("prev/next navigation respects bounds", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(
      <MilestoneFocusView
        index={0}
        onClose={onClose}
        onNavigate={onNavigate}
        title="Foundation"
        total={3}
      >
        <p>body</p>
      </MilestoneFocusView>
    );
    // at index 0 prev is disabled
    expect(
      (screen.getByTestId("mobile-focus-prev") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByTestId("mobile-focus-next"));
    expect(onNavigate).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId("mobile-focus-close"));
    expect(onClose).toHaveBeenCalled();
  });

  test("swipe-left advances to the next milestone", () => {
    const onNavigate = vi.fn();
    render(
      <MilestoneFocusView
        index={1}
        onClose={vi.fn()}
        onNavigate={onNavigate}
        title="Framing"
        total={3}
      >
        <p>body</p>
      </MilestoneFocusView>
    );
    const scroll = screen.getByTestId("mobile-focus-scroll");
    fireEvent.pointerDown(scroll, { clientX: 200 });
    fireEvent.pointerUp(scroll, { clientX: 100 });
    expect(onNavigate).toHaveBeenCalledWith(2);
  });
});

describe("TimelineMinimap", () => {
  const items = [milestone("Foundation", { x: 0 }), milestone("Framing", { x: 20 })];
  const draws: DemoDraw[] = [
    { amount: 40_000, id: "draw-1", itemId: "Framing", label: "Draw", x: 30 },
  ];

  test("tapping a milestone tick jumps to it", () => {
    const onJump = vi.fn();
    render(
      <TimelineMinimap
        currentDay={10}
        draws={draws}
        items={items}
        onJumpToMilestone={onJump}
        onOpenDraw={vi.fn()}
        range={RANGE}
      />
    );
    fireEvent.click(screen.getByTestId("timeline-minimap-milestone-Framing"));
    expect(onJump).toHaveBeenCalledWith("Framing");
  });

  test("tapping a draw dot opens that draw", () => {
    const onOpenDraw = vi.fn();
    render(
      <TimelineMinimap
        currentDay={10}
        draws={draws}
        items={items}
        onJumpToMilestone={vi.fn()}
        onOpenDraw={onOpenDraw}
        range={RANGE}
      />
    );
    fireEvent.click(screen.getByTestId("timeline-minimap-draw-draw-1"));
    expect(onOpenDraw).toHaveBeenCalledWith("draw-1");
  });
});

describe("MobileTimelineDayDialWorkspace", () => {
  const items = [
    milestone("Foundation", { durationDays: 10, x: 0 }),
    milestone("Framing", { durationDays: 8, x: 20 }),
  ];
  const draws: DemoDraw[] = [
    {
      amount: 40_000,
      id: "draw-foundation",
      itemId: "Foundation",
      label: "Foundation draw",
      x: 9,
    },
  ];

  test("keeps milestone cards visible while the selected day is inside the range", () => {
    expect(
      deriveMobileDayTimelineEvents({
        capitalSpikes: [],
        currentDay: 5,
        draws: [],
        items,
      }).map((event) => event.id)
    ).toContain("milestone-Foundation");

    expect(
      deriveMobileDayTimelineEvents({
        capitalSpikes: [],
        currentDay: 11,
        draws: [],
        items,
      }).map((event) => event.id)
    ).not.toContain("milestone-Foundation");
  });

  test("keeps the focused milestone sticky until its end before scrolling the rail", () => {
    const earlyRail = deriveMobileStickyTimelineRail({
      capitalSpikes: [],
      currentDay: 5,
      draws,
      items,
    });
    expect(earlyRail.events.map((event) => event.id)).toEqual([
      "milestone-Foundation",
      "draw-draw-foundation",
      "milestone-Framing",
    ]);
    expect(earlyRail.activeIndex).toBe(0);
    expect(earlyRail.progressToNext).toBe(0);
    expect(earlyRail.translateY).toBe(0);

    const nearEndRail = deriveMobileStickyTimelineRail({
      capitalSpikes: [],
      currentDay: 9,
      draws,
      items,
    });
    expect(nearEndRail.activeIndex).toBe(0);
    expect(nearEndRail.progressToNext).toBeGreaterThan(0);
    expect(nearEndRail.translateY).toBeLessThan(0);

    const nextRail = deriveMobileStickyTimelineRail({
      capitalSpikes: [],
      currentDay: 11,
      draws,
      items,
    });
    expect(nextRail.activeIndex).toBe(2);
  });

  test("resolves draw card milestone artwork when legacy draw rows lack item ids", () => {
    const legacyDraws: DemoDraw[] = [
      {
        amount: 40_000,
        id: "legacy-foundation-draw",
        label: "Foundation draw",
        x: 9,
      },
    ];

    const events = deriveMobileDayTimelineEvents({
      capitalSpikes: [],
      currentDay: 5,
      draws: legacyDraws,
      items,
    });
    const drawEvent = events.find(
      (event) => event.id === "draw-legacy-foundation-draw"
    );

    expect(drawEvent).toMatchObject({
      icon: "foundation",
      itemId: "Foundation",
    });
  });

  test("renders isometric artwork on draw status cards when only the draw label identifies the scope", () => {
    const productionItems = [
      milestone("exterior", {
        draw: "Windows & exterior reimbursement draw",
        durationDays: 18,
        icon: "exterior",
        name: "Windows & exterior",
        x: 67,
      }),
      milestone("drywall", {
        draw: "Inspections & drywall reimbursement draw",
        durationDays: 16,
        icon: "drywall",
        name: "Inspections & drywall",
        x: 90,
      }),
    ];
    const labelOnlyDraws: DemoDraw[] = [
      {
        amount: 210_000,
        id: "draw-exterior",
        label: "Windows & exterior reimbursement draw",
        x: 67,
      },
      {
        amount: 190_000,
        id: "draw-drywall",
        label: "Inspections & drywall",
        x: 90,
      },
    ];

    render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={67}
        draws={labelOnlyDraws}
        items={productionItems}
        onDayChange={vi.fn()}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={{ max: 120, min: 0, unit: "days" }}
      />
    );

    const exteriorIcon = screen
      .getByTestId("mobile-day-event-icon-draw-draw-exterior")
      .querySelector("img");
    expect(exteriorIcon?.getAttribute("src")).toBe(
      "/milestone-icons/exterior.png"
    );

    const drywallIcon = screen
      .getByTestId("mobile-day-event-icon-draw-draw-drywall")
      .querySelector("img");
    expect(drywallIcon?.getAttribute("src")).toBe(
      "/milestone-icons/drywall.png"
    );
  });

  test("uses selected day for browsing without changing logical draw state", () => {
    const rail = deriveMobileStickyTimelineRail({
      capitalSpikes: [],
      currentDay: 5,
      draws,
      items,
      selectedDay: 20,
    });

    expect(rail.activeIndex).toBe(2);
    expect(
      rail.events.find((event) => event.id === "draw-draw-foundation")?.status
    ).toBe("Planned");
  });

  test("uses the wheel picker primitive and forwards day changes", () => {
    const onDayChange = vi.fn();
    const { rerender } = render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={5}
        draws={draws}
        items={items}
        onDayChange={onDayChange}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={RANGE}
      />
    );

    expect(
      screen
        .getByTestId("mobile-day-event-stack")
        .getAttribute("data-active-index")
    ).toBe("0");
    rerender(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={9}
        draws={draws}
        items={items}
        onDayChange={onDayChange}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={RANGE}
      />
    );
    expect(
      screen
        .getByTestId("mobile-day-event-stack")
        .getAttribute("data-active-index")
    ).toBe("0");

    expect(
      screen.getByTestId("mobile-day-wheel").querySelector("[data-rwp-wrapper]")
    ).toBeTruthy();
    expect(
      screen.getByTestId("mobile-day-wheel").querySelector("[data-rwp]")
    ).toBeTruthy();

    const rangeInput = screen.getByLabelText("Selected timeline day");
    fireEvent.change(rangeInput, { target: { value: "6" } });
    expect(onDayChange).toHaveBeenCalledWith(6);
    fireEvent.change(rangeInput, { target: { value: "4" } });
    expect(onDayChange).toHaveBeenCalledWith(4);
  });

  test("defaults the day dial to the right and lets users switch sides", () => {
    render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={5}
        draws={draws}
        items={items}
        onDayChange={vi.fn()}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={RANGE}
      />
    );

    const layout = screen.getByTestId("mobile-day-layout");
    const dial = screen.getByTestId("mobile-day-dial");
    const eventRail = screen.getByTestId("mobile-day-event-rail");

    expect(layout.getAttribute("data-dial-side")).toBe("right");
    expect(dial.getAttribute("data-side")).toBe("right");
    expect(
      eventRail.compareDocumentPosition(dial) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId("mobile-dial-side-right").getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByTestId("mobile-dial-side-left"));
    expect(layout.getAttribute("data-dial-side")).toBe("left");
    const flippedDial = screen.getByTestId("mobile-day-dial");
    const flippedEventRail = screen.getByTestId("mobile-day-event-rail");
    expect(flippedDial.getAttribute("data-side")).toBe("left");
    expect(
      flippedDial.compareDocumentPosition(flippedEventRail) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId("mobile-dial-side-left").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  test("previews the selected day while the wheel is still moving", async () => {
    const onDayChange = vi.fn();
    render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={5}
        draws={draws}
        items={items}
        onDayChange={onDayChange}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={RANGE}
      />
    );

    const highlightList = screen
      .getByTestId("mobile-day-wheel")
      .querySelector<HTMLElement>("[data-rwp-highlight-list]");
    expect(highlightList).toBeTruthy();
    highlightList?.setAttribute("style", "transform: translateY(-224px);");

    await waitFor(() => expect(onDayChange).toHaveBeenCalledWith(7));
  });

  test("event cards open the underlying milestone or draw", () => {
    const onOpenDraw = vi.fn();
    const onOpenMilestone = vi.fn();
    render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={5}
        draws={draws}
        items={items}
        onDayChange={vi.fn()}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={onOpenDraw}
        onOpenMilestone={onOpenMilestone}
        range={RANGE}
      />
    );

    const milestoneIcon = screen
      .getByTestId("mobile-day-event-icon-milestone-Foundation")
      .querySelector("img");
    expect(milestoneIcon?.getAttribute("src")).toBe(
      "/milestone-icons/foundation.png"
    );
    const drawIcon = screen
      .getByTestId("mobile-day-event-icon-draw-draw-foundation")
      .querySelector("img");
    expect(drawIcon?.getAttribute("src")).toBe(
      "/milestone-icons/foundation.png"
    );
    fireEvent.click(screen.getByTestId("mobile-day-event-milestone-Foundation"));
    expect(onOpenMilestone).toHaveBeenCalledWith("Foundation");
    fireEvent.click(screen.getByTestId("mobile-day-event-draw-draw-foundation"));
    expect(onOpenDraw).toHaveBeenCalledWith("draw-foundation");
  });

  test("mobile insert menu creates items at the selected day", async () => {
    const onAddMilestone = vi.fn();
    const onAddDraw = vi.fn();
    const onAddCapitalSpike = vi.fn();
    const onAddCashInfusion = vi.fn();
    render(
      <MobileTimelineDayDialWorkspace
        capitalSpikes={[]}
        currentDay={5}
        draws={draws}
        insertMenu={{
          milestoneLabel: "Add milestone",
          onAddCapitalSpike,
          onAddCashInfusion,
          onAddDraw,
          onAddMilestone,
        }}
        items={items}
        onDayChange={vi.fn()}
        onOpenCapitalEvent={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        range={RANGE}
        selectedDay={24}
      />
    );

    fireEvent.click(screen.getByTestId("mobile-timeline-insert-menu"));
    fireEvent.click(await screen.findByTestId("mobile-insert-milestone"));
    expect(onAddMilestone).toHaveBeenCalledWith(24);

    fireEvent.click(screen.getByTestId("mobile-timeline-insert-menu"));
    fireEvent.click(await screen.findByTestId("mobile-insert-draw"));
    expect(onAddDraw).toHaveBeenCalledWith(24);

    fireEvent.click(screen.getByTestId("mobile-timeline-insert-menu"));
    fireEvent.click(await screen.findByTestId("mobile-insert-capital-spike"));
    expect(onAddCapitalSpike).toHaveBeenCalledWith(24);

    fireEvent.click(screen.getByTestId("mobile-timeline-insert-menu"));
    fireEvent.click(await screen.findByTestId("mobile-insert-cash-infusion"));
    expect(onAddCashInfusion).toHaveBeenCalledWith(24);
  });
});

"use client";

import { MobileTimelineDayDialWorkspace as DayDialWorkspace } from "./MobileTimelineDayDial.tsx";
import {
  MilestoneFeed as Feed,
  MilestoneFocusView as FocusView,
  TimelineMinimap as Minimap,
} from "./MobileTimelineFeed.tsx";
import {
  deriveMilestoneRowState,
  deriveMobileDayTimelineEvents,
  deriveMobileStickyTimelineRail,
  mobileDrawState,
} from "./MobileTimelineWorkspaceContracts.ts";

export const deriveMilestoneRowStateForMobile = deriveMilestoneRowState;
export const deriveMobileDayTimelineEventsForMobile =
  deriveMobileDayTimelineEvents;
export const deriveMobileStickyTimelineRailForMobile =
  deriveMobileStickyTimelineRail;
export const mobileDrawStateForMobile = mobileDrawState;

export type {
  MilestoneFeedRowState,
  MobileDayTimelineEvent,
  MobileDayTimelineEventKind,
  MobileDrawState,
  MobileStickyTimelineRail,
  MobileTimelineRole,
  PrimaryAction,
} from "./MobileTimelineWorkspaceContracts.ts";
export {
  deriveMilestoneRowStateForMobile as deriveMilestoneRowState,
  deriveMobileDayTimelineEventsForMobile as deriveMobileDayTimelineEvents,
  deriveMobileStickyTimelineRailForMobile as deriveMobileStickyTimelineRail,
  mobileDrawStateForMobile as mobileDrawState,
};

export const MobileTimelineDayDialWorkspace = DayDialWorkspace;
export type {
  MobileTimelineDayDialWorkspaceProps,
  MobileTimelineInsertMenuConfig,
} from "./MobileTimelineDayDial.tsx";

export const MilestoneFeed = Feed;
export const MilestoneFocusView = FocusView;
export const TimelineMinimap = Minimap;
export type {
  MilestoneFeedProps,
  MilestoneFeedRowProps,
  MilestoneFocusViewProps,
  StructuralAction,
  TimelineMinimapProps,
} from "./MobileTimelineFeed.tsx";

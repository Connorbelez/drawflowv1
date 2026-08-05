import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  FileImage,
  Flag,
  House,
  LinkIcon,
  Loader2,
  Mail,
  MapPinned,
  QrCode,
  ReceiptText,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { parseAsString, useQueryStates } from "nuqs";
import { QRCodeSVG } from "qrcode.react";
import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  AnimatedCurvedTimeline,
  type TimelineItem,
  type TimelineMarker,
  type TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { insertTimelineItemWithSpacing } from "#/components/roadmap/animated-curved-timeline-utils.ts";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { CursorPointer } from "#/components/ui/cursor.tsx";
import {
  Drawer,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { EditableNumberChip } from "#/components/ui/editable-chip.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { normalizeSiteVisitTokenRoute } from "#/features/build-workspace-demo/site-visit-token-route-model.ts";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import {
  isHeicLikeEvidenceImage,
  normalizeEvidenceFileForUpload,
} from "#/lib/evidence-image-normalization.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MilestoneCard, type MilestoneCardUpdate } from "./-MilestoneCard.tsx";
import "./timeline-route-header.css";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import { TimelineCashflowCompoundChart } from "./-TimelineCashflowCompoundChart.tsx";
import { TimelineDrawAvailabilityChart } from "./-TimelineDrawAvailabilityChart.tsx";
import { TimelineEndNodeButton } from "./-TimelineEndNodeButton.tsx";
import { TimelineMilestoneSubmilestoneList } from "./-TimelineMilestoneSubmilestoneList.tsx";
import {
  TimelineSetupFlow,
  type TimelineSetupResult,
} from "./-TimelineSetupFlow.tsx";
import {
  buildDrawsFromActiveScenario,
  buildTimelineSetupTemplatesFromSettings,
  normalizeTimelineSettingsProjection,
  TIMELINE_DEMO_SETTINGS_MISSING_NOTICE,
  timelineSettingsRange,
} from "./-timeline-demo-settings-adapter.ts";
import {
  buildMilestoneDrawCapacityEvents,
  getAccruedMilestoneDrawCapacity,
} from "./-timeline-draw-capacity.ts";
import {
  calculateHomeEquityInterestCost,
  OPTIMIZED_DRAW_FEE as DRAW_FEE,
  optimizeTimelineDrawSchedule,
} from "./-timeline-draw-optimizer.ts";
import {
  type ActiveMilestoneSelection,
  buildMilestoneSpendEvents,
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  DEFAULT_MILESTONE_DURATION_DAYS,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
  getMilestonePlannedEndX,
  normalizeMilestoneTimelineItems,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";
import {
  mapSubmilestoneSnapshotRows,
  resolveMilestoneSubmilestones,
  submilestoneNames,
} from "./-timeline-milestone-submilestones.ts";
import {
  applyTimelineShareSnapshotV2,
  buildTimelineShareSnapshotV2,
  calculateDrawAvailabilityAmount,
  DEFAULT_BORROWER_CO_PAY_BPS,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoEvidenceAsset,
  type DemoMilestone,
  getMilestoneDrawAvailabilityAmount,
  getMilestoneEffectiveCashSpendAmount,
  initialTimelineShareState,
  normalizeInterestAnnualBps,
  PROPOSAL_TIMELINE_MIN_DAY,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  DeleteSheet,
  EditBudgetSheet,
  EditDatesSheet,
  EditDrawSheet,
} from "./MobileTimelineSheets.tsx";
import { MobileTimelineDayDialWorkspace } from "./MobileTimelineWorkspace.tsx";
import { TimelineCashflowToolbar } from "./TimelineCashflowToolbar.tsx";
import { TimelineMilestoneContractorList } from "./TimelineMilestoneContractorList.tsx";

export const timelineWorkspaceSearchParsers = {
  share: parseAsString,
};

interface DrawEditDraft {
  amount: string;
  x: string;
}

interface CapitalSpikeEditDraft {
  amount: string;
  interestAnnualPercent: string;
  label: string;
  x: string;
}

type TimelineDemoRole = "builder" | "lender";

interface PendingNormalizedInsertSelection {
  itemId: string;
  x: number;
}

export interface TimelineSiteVisitRequestInput {
  includedItemIds?: string[];
  note?: string;
  requestedDay: number;
  status?: string;
  tokenExpiresAt?: number;
  url?: string;
  visitId?: string;
}

export interface CashflowDatum {
  budget: number;
  capitalSpikeAmount: number;
  cashInfusionAmount: number;
  cashOnHand: number;
  day: number;
  drawAmount: number;
  drawCapacityUnlocked: number;
  event: "capitalSpike" | "cashInfusion" | "draw" | "milestone" | "start";
  id: string;
  milestoneDrawAvailability?: number;
  milestoneEndDay?: number;
  milestoneId?: string;
  milestoneTotalBudget?: number;
  name: string;
  sortOrder?: number;
  [key: string]: unknown;
}

export interface DrawAvailabilityDatum {
  additionalAvailableDraw: number;
  day: number;
  interestAnnualBps?: number;
  interestBearingDraw: number;
  name: string;
  totalAvailableDraw: number;
  totalInterestAccrued: number;
  totalUnlockedDraw: number;
  [key: string]: unknown;
}

export interface CumulativeDrawPosition {
  availableToDraw: number;
  day: number;
  totalDrawn: number;
  totalUnlocked: number;
}

export interface CashShortfallPoint {
  cashBeforeMilestone: number;
  cashOnHand: number;
  day: number;
  milestone: string;
  milestoneCost: number;
  shortfall: number;
}

interface FinancialOverview {
  drawCount: number;
  drawFeesPaid: number;
  interestPaid: number;
  totalDrawReleased: number;
}

interface DrawRequestLimit {
  alreadyDrawn: number;
  availableLimit: number;
  remainingAfterRequest: number;
  totalUnlocked: number;
}

const BASE_INITIAL_RANGE: TimelineRange = {
  max: 230,
  min: 0,
  unit: "days",
};
const CHART_PROBE_INTERVAL_DAYS = 5;
const MINIMUM_POST_MILESTONE_CASH_RESERVE = 0;
const STARTING_CASH = 400_000;
const INITIAL_CURRENT_DAY = 86;
const GENERATED_TIMELINE_CURRENT_DAY = 0;
const TIMELINE_END_PADDING_DAYS = DEFAULT_DRAW_REVIEW_LAG_DAYS;
const INITIAL_CAPITAL_SPIKES: DemoCapitalSpike[] = [];
const INITIAL_COMPLETION_SUBMITTED_AT = "2026-05-01T14:00:00.000Z";
export const LOCAL_TIMELINE_SHARE_PREFIX = "local-timeline-";
const DEFAULT_TIMELINE_SHARE_PATH = "/demo/timeline";
const TIMELINE_TO_DEMO_MILESTONE_KEY: Record<string, string> = {
  closeout: "aluminum_windows",
  drywall: "aluminum_windows",
  exterior: "aluminum_windows",
  finishes: "aluminum_windows",
  framing: "framing",
  "rough-in": "aluminum_windows",
  "site-prep": "foundation",
};

export function getDemoApprovalStartDate(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function resolveDemoLiveBuildHref({
  buildKey,
  liveBuildHref,
}: {
  buildKey?: string | null;
  liveBuildHref?: string | null;
}) {
  if (liveBuildHref) {
    return liveBuildHref;
  }

  return buildKey ? `/builder/demo/dashboard/builds/${buildKey}` : undefined;
}

const INITIAL_ITEMS: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 125_000,
      completionClaim: {
        actualCost: 125_000,
        completedDay: 28,
        submittedAt: INITIAL_COMPLETION_SUBMITTED_AT,
      },
      draw: "Draw 1",
      drawX: 36,
      durationDays: 14,
      evidence: "Accepted package",
      icon: "foundation",
      name: "Site prep & foundation",
      policy: "Released",
      status: "complete",
      subMilestones: ["Permit mobilization", "Excavation", "Concrete forms"],
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
      completionClaim: {
        actualCost: 160_000,
        completedDay: 56,
        submittedAt: INITIAL_COMPLETION_SUBMITTED_AT,
      },
      draw: "Draw 2",
      drawX: 64,
      durationDays: 18,
      evidence: "Accepted package",
      icon: "framing",
      name: "Framing & structure",
      policy: "Released",
      status: "complete",
      subMilestones: ["Wall framing", "Roof trusses", "Structural sheathing"],
    },
    eyebrow: "Milestone 2",
    id: "framing",
    label: "Framing",
    lane: -1,
    markerLabel: "2",
    tone: "complete",
    x: 38,
  },
  {
    data: {
      amount: 245_000,
      draw: "Draw 3",
      drawX: 94,
      durationDays: 20,
      evidence: "Site visit today",
      icon: "roughIn",
      name: "Rough-in mechanical",
      policy: "Admin review",
      status: "ready",
      subMilestones: ["Plumbing rough-in", "Electrical rough-in", "HVAC ducts"],
    },
    eyebrow: "Milestone 3",
    id: "rough-in",
    label: "Rough-in",
    lane: 1,
    markerLabel: "3",
    tone: "active",
    x: 66,
  },
  {
    data: {
      amount: 210_000,
      draw: "Draw 4",
      drawX: 122,
      durationDays: 18,
      evidence: "Draft started",
      icon: "exterior",
      name: "Windows & exterior",
      policy: "Evidence required",
      status: "ready",
      subMilestones: ["Window install", "Weather barrier", "Exterior doors"],
    },
    eyebrow: "Milestone 4",
    id: "exterior",
    label: "Exterior",
    lane: 0,
    markerLabel: "4",
    tone: "warning",
    x: 96,
  },
  {
    data: {
      amount: 190_000,
      draw: "Draw 5",
      drawX: 148,
      durationDays: 16,
      evidence: "Not started",
      icon: "drywall",
      name: "Inspections & drywall",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Rough-in inspection", "Insulation", "Drywall hang"],
    },
    eyebrow: "Milestone 5",
    id: "drywall",
    label: "Drywall",
    lane: -1,
    markerLabel: "5",
    tone: "upcoming",
    x: 124,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 6",
      drawX: 170,
      durationDays: 12,
      evidence: "Not started",
      icon: "finishes",
      name: "Finishes & fixtures",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Cabinetry", "Flooring", "Fixture set"],
    },
    eyebrow: "Milestone 6",
    id: "finishes",
    label: "Finishes",
    lane: 1,
    markerLabel: "6",
    tone: "upcoming",
    x: 150,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 7",
      drawX: 184,
      durationDays: 4,
      evidence: "Not started",
      icon: "closeout",
      name: "Final inspection & closeout",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Punch list", "Final inspection", "Closeout package"],
    },
    eyebrow: "Milestone 7",
    id: "closeout",
    label: "Closeout",
    lane: 0,
    markerLabel: "7",
    tone: "upcoming",
    x: 172,
  },
];

const INITIAL_TOTAL_BUDGET = INITIAL_ITEMS.reduce(
  (sum, item) => sum + (item.data?.amount ?? 0),
  0
);
const NORMALIZED_INITIAL_ITEMS = normalizeMilestoneTimelineItems(INITIAL_ITEMS);
const INITIAL_RANGE = expandTimelineRangeForMilestones(
  NORMALIZED_INITIAL_ITEMS,
  BASE_INITIAL_RANGE
);

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const dollarsToCents = (value: number) => Math.round(value * 100);

export function resolveTimelineSiteVisitMilestoneKey(itemId: string) {
  return TIMELINE_TO_DEMO_MILESTONE_KEY[itemId] ?? itemId;
}

export function resolveTimelinePersistenceSiteVisitMilestoneKey(
  itemId: string,
  workspaceMode: TimelineWorkspaceMode
) {
  return workspaceMode === "demo"
    ? resolveTimelineSiteVisitMilestoneKey(itemId)
    : itemId;
}

export function normalizeTimelineSiteVisitStatus(
  status?: string,
  tokenExpiresAt?: number,
  now = Date.now()
) {
  if (status === "completed") {
    return "complete";
  }
  if (status === "claimed" || status === "in_progress") {
    return "in progress";
  }
  if (tokenExpiresAt && tokenExpiresAt <= now) {
    return "expired";
  }
  if (status === "requested") {
    return "un-opened";
  }
  return "not requested";
}

function buildAbsoluteSiteVisitUrl(path?: string) {
  const normalizedPath = normalizeSiteVisitTokenRoute({ url: path });
  if (!normalizedPath) {
    return "";
  }
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  if (typeof window === "undefined") {
    return normalizedPath;
  }
  return `${window.location.origin}${normalizedPath}`;
}

function findLiveSiteVisit(workspace: any, visitId?: string) {
  if (!(workspace && visitId)) {
    return null;
  }

  for (const milestone of workspace.milestones ?? []) {
    for (const visit of milestone.siteVisits ?? []) {
      if (visit._id === visitId) {
        return visit;
      }
    }
  }

  return null;
}

const fileSizeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const routeSectionVariants = {
  hidden: {
    filter: "blur(10px)",
    opacity: 0,
    y: 24,
  },
  show: {
    filter: "blur(0px)",
    opacity: 1,
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1],
    },
    y: 0,
  },
} as const;

interface TimelineResponsiveSizing {
  barSize: number;
  cardWidth: number;
  endCardWidth: number;
  minNodeSpacingPx: number;
  paddingX: number;
  pixelsPerUnit: number;
  yAxisWidth: number;
}

function getTimelineResponsiveSizing(
  isCompactLayout: boolean,
  isPhoneLayout: boolean
): TimelineResponsiveSizing {
  if (isPhoneLayout) {
    return {
      barSize: 14,
      cardWidth: 224,
      endCardWidth: 244,
      minNodeSpacingPx: 184,
      paddingX: 128,
      pixelsPerUnit: 5.35,
      yAxisWidth: 48,
    };
  }

  if (isCompactLayout) {
    return {
      barSize: 20,
      cardWidth: 232,
      endCardWidth: 260,
      minNodeSpacingPx: 190,
      paddingX: 136,
      pixelsPerUnit: 5.85,
      yAxisWidth: 58,
    };
  }

  return {
    barSize: 20,
    cardWidth: 232,
    endCardWidth: 276,
    minNodeSpacingPx: 198,
    paddingX: 136,
    pixelsPerUnit: 6.4,
    yAxisWidth: 58,
  };
}

export type TimelineWorkspaceMode = "demo" | "live" | "proposal";

export interface TimelineWorkspaceProps {
  allowRoleSwitching?: boolean;
  canApproveMilestoneCompletion?: boolean;
  collaboration?: TimelineWorkspaceCollaboration;
  contractorPlanning?: ContractorPlanningModel | null;
  durableMeta?: {
    backofficeHref: string;
    buildKey?: string;
    liveBuildHref?: string;
    proposalHref: string;
    proposalSlug: string;
    status: string;
  };
  durablePlanId?: string;
  embedded?: boolean;
  headerActions?: ReactNode;
  initialRole?: TimelineDemoRole;
  initialState?: TimelineShareState;
  lockedBannerActions?: ReactNode;
  modificationRequests?: TimelineModificationRequestView[];
  persistence?: TimelineWorkspacePersistence;
  readOnly?: boolean;
  shareUrlPath?: string;
  showWorkspaceHeader?: boolean;
  timelineSettingsProjection?: unknown;
  workspaceMode?: TimelineWorkspaceMode;
}

export type TimelineDemoWorkspaceProps = TimelineWorkspaceProps;

export interface TimelineWorkspaceCollaboration {
  cursors?: TimelineWorkspaceRemoteCursor[];
  onCursorChange?: (cursor: { x: number; y: number } | null) => void;
  permission?: "edit" | "view" | null;
  toolbar?: ReactNode;
}

export interface TimelineWorkspaceRemoteCursor {
  color?: string;
  cursor?: { x: number; y: number } | null;
  name: string;
  userId: string;
}

export interface TimelineModificationRequestView {
  _id?: string;
  milestoneKey?: string;
  reason?: string;
  requestedPayload: any;
  requestType: "createMilestone" | "deleteMilestone" | "updateMilestoneBudget";
  reviewNote?: string;
  status: "approved" | "rejected" | "requested";
}

export interface TimelinePlanStatePersistenceInput {
  currentDay: number;
  minimumCashReserveCents?: number;
  progressValue: number;
  rangeMax: number;
  rangeMin: number;
  routeState: {
    activeCapitalSpikeId?: string;
    activeDrawId?: string;
    activeMilestoneKey?: string;
    selectedPanelOpen: boolean;
    straightLine: boolean;
  };
  startingCashCents: number;
}

type DemoTimelinePlanStateMutationInput = Omit<
  TimelinePlanStatePersistenceInput,
  "minimumCashReserveCents"
>;

export function toDemoTimelinePlanStateMutationInput(
  input: TimelinePlanStatePersistenceInput
): DemoTimelinePlanStateMutationInput {
  const { minimumCashReserveCents: _productionOnlyReserve, ...demoInput } =
    input;
  return demoInput;
}

function createTimelineSaveReference(): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `TL-${randomPart
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 12)
    .toUpperCase()}`;
}

export interface TimelineWorkspacePersistence {
  createCapitalEvent?: (input: any) => Promise<unknown>;
  createCashInfusion?: (input: any) => Promise<unknown>;
  createDraw?: (input: any) => Promise<unknown>;
  createEvidenceAsset?: (input: any) => Promise<unknown>;
  createMilestone?: (input: any) => Promise<unknown>;
  deleteCapitalEvent?: (input: any) => Promise<unknown>;
  deleteDraw?: (input: any) => Promise<unknown>;
  deleteEvidenceAsset?: (input: any) => Promise<unknown>;
  deleteMilestone?: (input: any) => Promise<unknown>;
  generateEvidenceUploadUrl?: () => Promise<string>;
  recordMilestoneSiteVisit?: (input: any) => Promise<unknown>;
  replaceDrawSchedule?: (input: any) => Promise<unknown>;
  requestMilestoneSiteVisit?: (
    input: any
  ) => Promise<TimelineSiteVisitRequestInput | void>;
  requestModification?: (input: any) => Promise<unknown>;
  reviewDrawRequest?: (input: any) => Promise<unknown>;
  reviewMilestoneCompletion?: (input: any) => Promise<unknown>;
  reviewModificationRequest?: (input: any) => Promise<unknown>;
  submitDrawRequest?: (input: any) => Promise<unknown>;
  submitMilestoneCompletion?: (input: any) => Promise<unknown>;
  submitPlan?: () => Promise<unknown>;
  updateCapitalEvent?: (input: any) => Promise<unknown>;
  updateDraw?: (input: any) => Promise<unknown>;
  updateEvidenceAsset?: (input: any) => Promise<unknown>;
  updateMilestone?: (input: any) => Promise<unknown>;
  updatePlanState?: (
    input: TimelinePlanStatePersistenceInput
  ) => Promise<unknown>;
}

interface TimelineCompletionClaimInput {
  actualCost?: number;
  completedDay: number;
  note?: string;
  qualityNote?: string;
  qualityRating?: number;
}

const EMPTY_TIMELINE_MODIFICATION_REQUESTS: TimelineModificationRequestView[] =
  [];

function timelineMilestonePayloadToItem(
  milestone: any,
  approved = false
): TimelineItem<DemoMilestone> {
  const milestoneKey = milestone.milestoneKey ?? milestone.key ?? "milestone";
  const submilestoneDetails = mapSubmilestoneSnapshotRows(
    milestone.submilestoneSnapshot ??
      (milestone.submilestones ?? []).map(
        (
          submilestone: {
            budgetCents?: number;
            description?: string;
            durationDays?: number;
            key?: string;
            name: string;
            order?: number;
          },
          index: number
        ) => ({
          ...(submilestone.budgetCents === undefined
            ? {}
            : { budgetCents: submilestone.budgetCents }),
          ...(submilestone.description
            ? { description: submilestone.description }
            : {}),
          ...(submilestone.durationDays === undefined
            ? {}
            : { durationDays: submilestone.durationDays }),
          key: submilestone.key,
          name: submilestone.name,
          order: submilestone.order ?? index + 1,
        })
      ),
    milestoneKey
  );

  return {
    data: {
      amount: Math.round((milestone.budgetCents ?? 0) / 100),
      draw: milestone.drawKey ?? "Requested draw",
      ...(milestone.drawAvailabilityCents === undefined
        ? {}
        : {
            drawAvailabilityAmount: Math.round(
              milestone.drawAvailabilityCents / 100
            ),
          }),
      durationDays:
        milestone.durationDays ??
        Math.max(1, (milestone.dayEnd ?? 1) - (milestone.dayStart ?? 0)),
      evidence: milestone.evidenceState ?? "Requested change",
      icon: milestone.icon ?? "change",
      name: milestone.name ?? "Requested milestone",
      policy: milestone.policyState ?? "Admin approval required",
      status: approved ? "ready" : "review",
      subMilestones: submilestoneDetails.map(
        (submilestone) => submilestone.name
      ),
      submilestoneDetails,
    },
    disabled: !approved,
    eyebrow: approved ? "Approved live change" : "Requested milestone",
    id: milestone.milestoneKey,
    label: milestone.name ?? "Requested milestone",
    lane: milestone.lane,
    markerLabel: milestone.markerLabel ?? "+",
    tone: milestone.tone ?? "warning",
    x: milestone.x ?? milestone.dayStart ?? 0,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the shared timeline workspace used by demo, proposal, and live build routes.
export function TimelineWorkspace({
  allowRoleSwitching = true,
  canApproveMilestoneCompletion = true,
  collaboration,
  contractorPlanning,
  durableMeta,
  durablePlanId,
  embedded = false,
  headerActions,
  initialRole,
  lockedBannerActions,
  initialState,
  modificationRequests:
    initialModificationRequests = EMPTY_TIMELINE_MODIFICATION_REQUESTS,
  persistence,
  readOnly: forcedReadOnly = false,
  shareUrlPath = DEFAULT_TIMELINE_SHARE_PATH,
  showWorkspaceHeader = true,
  timelineSettingsProjection,
  workspaceMode = "demo",
}: TimelineWorkspaceProps = {}) {
  const timelineDemoSettings = useQuery(
    api.demo_settings.getTimelineDemoSettings,
    timelineSettingsProjection === undefined ? {} : "skip"
  );
  const createTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_createTimelinePlanFromSetup
  );
  const submitTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_submitTimelinePlan
  );
  const approveTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_approveTimelinePlan
  );
  const createTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_createTimelineDraw
  );
  const updateTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_updateTimelineDraw
  );
  const deleteTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineDraw
  );
  const submitTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_submitTimelineDrawRequest
  );
  const reviewTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineDrawRequest
  );
  const createTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_createTimelineCapitalEvent
  );
  const updateTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_updateTimelineCapitalEvent
  );
  const deleteTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineCapitalEvent
  );
  const createTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_createTimelineMilestone
  );
  const requestTimelineModification = useMutation(
    api.demo_timeline_plans.demo_requestTimelineModification
  );
  const reviewTimelineModificationRequest = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineModificationRequest
  );
  const createTimelineCashInfusion = useMutation(
    api.demo_timeline_plans.demo_createTimelineCashInfusion
  );
  const updateTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_updateTimelineMilestone
  );
  const deleteTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineMilestone
  );
  const submitTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_submitTimelineMilestoneCompletion
  );
  const reviewTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineMilestoneCompletion
  );
  const updateTimelinePlanState = useMutation(
    api.demo_timeline_plans.demo_updateTimelinePlanState
  );
  const generateTimelineEvidenceUploadUrl = useMutation(
    api.demo_timeline_plans.demo_generateTimelineEvidenceUploadUrl
  );
  const createTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_createTimelineEvidenceAsset
  );
  const updateTimelineEvidenceAssetMutation = useMutation(
    api.demo_timeline_plans.demo_updateTimelineEvidenceAsset
  );
  const deleteTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineEvidenceAsset
  );
  const prefersReducedMotion = useReducedMotion();
  const isCompactLayout = useMediaQuery("max-lg");
  const isMobileDrawerLayout = useMediaQuery("max-md");
  const isPhoneLayout = useMediaQuery("max-sm");
  const insertionCount = useRef(0);
  const drawInsertionCount = useRef(0);
  const capitalSpikeInsertionCount = useRef(0);
  const pendingCapitalEventIds = useRef(new Set<string>());
  const pendingNormalizedInsertSelection =
    useRef<PendingNormalizedInsertSelection | null>(null);
  const pendingExpandedRange = useRef<Required<TimelineRange> | null>(null);
  const mobileInitialPanelDismissed = useRef(false);
  const workspaceInitialState = useMemo(() => {
    const normalizedState = initialState
      ? normalizeTimelineShareStateForRoute(initialState)
      : initialTimelineShareState(
          NORMALIZED_INITIAL_ITEMS,
          buildDemoDraws(NORMALIZED_INITIAL_ITEMS, INITIAL_RANGE),
          INITIAL_CAPITAL_SPIKES,
          INITIAL_RANGE,
          { itemId: "rough-in", phase: "inProgress" },
          66,
          INITIAL_CURRENT_DAY,
          true,
          STARTING_CASH,
          true,
          0
        );
    if (workspaceMode !== "proposal") {
      return normalizedState;
    }
    return {
      ...normalizedState,
      range: {
        ...normalizedState.range,
        min: PROPOSAL_TIMELINE_MIN_DAY,
      },
    };
  }, [initialState, workspaceMode]);
  const incomingTimelineStateSignature = useMemo(
    () =>
      initialState ? timelineShareStateSignature(workspaceInitialState) : null,
    [initialState, workspaceInitialState]
  );
  const appliedTimelineStateSignature = useRef<string | null>(null);
  const [items, setItems] = useState<TimelineItem<DemoMilestone>[]>(
    () => workspaceInitialState.items
  );
  const [draws, setDraws] = useState<DemoDraw[]>(
    () => workspaceInitialState.draws
  );
  const [interestAnnualBps, setInterestAnnualBps] = useState(() =>
    normalizeInterestAnnualBps(workspaceInitialState.interestAnnualBps)
  );
  const [capitalSpikes, setCapitalSpikes] = useState<DemoCapitalSpike[]>(
    () => workspaceInitialState.capitalSpikes
  );
  const [startingCash, setStartingCash] = useState(
    workspaceInitialState.startingCash
  );
  const [minimumCashReserve, setMinimumCashReserve] = useState(
    workspaceInitialState.minimumCashReserve
  );
  const [approvedDrawLimit, setApprovedDrawLimit] = useState(
    workspaceInitialState.approvedDrawLimit
  );
  const [currentDay, setCurrentDay] = useState(
    workspaceInitialState.currentDay
  );
  const [selectedDay, setSelectedDay] = useState(
    workspaceInitialState.progressValue ?? workspaceInitialState.currentDay
  );
  const [range, setRange] = useState<TimelineRange>(
    workspaceInitialState.range
  );
  const [activeSelection, setActiveSelection] =
    useState<ActiveMilestoneSelection>(workspaceInitialState.activeSelection);
  const [progressValue, setProgressValue] = useState(
    workspaceInitialState.progressValue
  );
  const [probeValue, setProbeValue] = useTimelineProbeState();
  const [showCashflowWarnings, setShowCashflowWarnings] = useState(true);
  const [showCashflowHoverDetails, setShowCashflowHoverDetails] =
    useState(true);
  const [activeDrawId, setActiveDrawId] = useState<string | null>(null);
  const [activeCapitalSpikeId, setActiveCapitalSpikeId] = useState<
    string | null
  >(null);
  const [drawEditDraft, setDrawEditDraft] = useState<DrawEditDraft>({
    amount: "",
    x: "",
  });
  const [capitalSpikeEditDraft, setCapitalSpikeEditDraft] =
    useState<CapitalSpikeEditDraft>({
      amount: "",
      interestAnnualPercent: "",
      label: "",
      x: "",
    });
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(true);
  const [mobileDetailDrawerRequested, setMobileDetailDrawerRequested] =
    useState(false);
  const [modificationRequests, setModificationRequests] = useState<
    TimelineModificationRequestView[]
  >(initialModificationRequests);
  const [durableSavePendingCount, setDurableSavePendingCount] = useState(0);
  const [durableSaveStatus, setDurableSaveStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [durableSaveReference, setDurableSaveReference] = useState<
    string | null
  >(null);
  const durableSaveAttemptSequence = useRef(0);
  const durableSaveRetry = useRef<{
    label: string;
    operation: () => Promise<unknown> | unknown;
  } | null>(null);
  const [timelineRole, setTimelineRole] = useState<TimelineDemoRole>(
    initialRole ?? "builder"
  );
  const planStatus = durableMeta?.status ?? "draft";
  const demoMode = workspaceMode === "demo";
  const proposalMode = workspaceMode === "proposal";
  const liveBuildMode =
    workspaceMode === "live" ||
    Boolean(demoMode && durableMeta && planStatus === "approved");
  const collaborationViewOnly = collaboration?.permission === "view";
  const statusReadOnly = Boolean(
    durableMeta &&
      ((proposalMode && planStatus !== "draft") ||
        (demoMode && planStatus !== "draft" && !liveBuildMode))
  );
  const readOnly = Boolean(
    forcedReadOnly || statusReadOnly || collaborationViewOnly
  );
  const canWriteLiveTimeline =
    !readOnly && (!durableMeta || planStatus === "draft" || liveBuildMode);
  const canEditPlanStructure =
    !readOnly && (!durableMeta || planStatus === "draft");
  const canUseLiveExecution = liveBuildMode && !readOnly;
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lenderApprovalPending, setLenderApprovalPending] = useState(false);
  const [lenderApprovedBuildKey, setLenderApprovedBuildKey] = useState<
    string | null
  >(null);
  const [straightLine, setStraightLine] = useState(
    workspaceInitialState.straightLine
  );
  const [setupComplete, setSetupComplete] = useState(Boolean(initialState));
  const [setupBaseline, setSetupBaseline] = useState<TimelineShareState | null>(
    initialState ?? null
  );
  const [mobileEditDatesItemId, setMobileEditDatesItemId] = useState<
    string | null
  >(null);
  const [mobileEditBudgetItemId, setMobileEditBudgetItemId] = useState<
    string | null
  >(null);
  const [mobileEditDrawId, setMobileEditDrawId] = useState<string | null>(null);
  const [mobileDeleteTarget, setMobileDeleteTarget] = useState<{
    id: string;
    kind: "milestone" | "draw";
    label: string;
  } | null>(null);
  const timelineSettingsSource =
    timelineSettingsProjection === undefined
      ? timelineDemoSettings
      : timelineSettingsProjection;
  const settingsTemplates = useMemo(
    () => normalizeTimelineSettingsProjection(timelineSettingsSource),
    [timelineSettingsSource]
  );
  const setupTemplates = useMemo(
    () => buildTimelineSetupTemplatesFromSettings(settingsTemplates),
    [settingsTemplates]
  );
  const settingsFallbackActive =
    timelineSettingsProjection === undefined &&
    timelineDemoSettings !== undefined &&
    settingsTemplates.length === 0;
  useEffect(() => {
    setModificationRequests(initialModificationRequests);
  }, [initialModificationRequests]);
  useEffect(() => {
    if (!isMobileDrawerLayout) {
      mobileInitialPanelDismissed.current = false;
      return;
    }
    if (mobileInitialPanelDismissed.current) {
      return;
    }
    mobileInitialPanelDismissed.current = true;
    setSelectedPanelOpen(false);
    setMobileDetailDrawerRequested(false);
  }, [isMobileDrawerLayout]);
  const activeItemId = activeSelection.itemId;
  const activeItem =
    items.find((item) => item.id === activeItemId) ?? items[0] ?? null;
  const activeItemDraw = null;
  const activePanelDraw =
    activeDrawId === null
      ? null
      : (draws.find((draw) => draw.id === activeDrawId) ?? null);
  const activePanelDrawItem = activePanelDraw
    ? (items.find(
        (item) =>
          item.id === activePanelDraw.itemId ||
          `${item.id}-draw` === activePanelDraw.id ||
          item.data?.draw === activePanelDraw.label
      ) ?? null)
    : null;
  const requestedMilestoneCreations = useMemo(
    () =>
      modificationRequests
        .filter(
          (request) =>
            request.status === "requested" &&
            request.requestType === "createMilestone" &&
            request.requestedPayload?.milestone
        )
        .map((request): TimelineItem<DemoMilestone> => {
          const item = timelineMilestonePayloadToItem(
            request.requestedPayload.milestone
          );
          return {
            ...item,
            id: `requested-${item.id}`,
          };
        }),
    [modificationRequests]
  );
  const timelineItemsForRender = useMemo(
    () =>
      [...items, ...requestedMilestoneCreations].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      ),
    [items, requestedMilestoneCreations]
  );
  const requestedDeletionByMilestone = useMemo(
    () =>
      new Set(
        modificationRequests
          .filter(
            (request) =>
              request.status === "requested" &&
              request.requestType === "deleteMilestone" &&
              request.milestoneKey
          )
          .map((request) => request.milestoneKey as string)
      ),
    [modificationRequests]
  );
  const requestedBudgetByMilestone = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of modificationRequests) {
      if (
        request.status === "requested" &&
        request.requestType === "updateMilestoneBudget" &&
        request.milestoneKey &&
        typeof request.requestedPayload?.budgetCents === "number"
      ) {
        map.set(
          request.milestoneKey,
          request.requestedPayload.budgetCents / 100
        );
      }
    }
    return map;
  }, [modificationRequests]);
  const resolvedRange = useMemo(() => normalizeDemoRange(range), [range]);
  useEffect(() => {
    if (
      workspaceMode === "proposal" &&
      resolvedRange.min !== PROPOSAL_TIMELINE_MIN_DAY
    ) {
      setRange((currentRange) => ({
        ...currentRange,
        min: PROPOSAL_TIMELINE_MIN_DAY,
      }));
    }
  }, [resolvedRange.min, workspaceMode]);
  const durablePlanStateInitialized = useRef(false);
  const runDurableMutation = useCallback(
    (operation: () => Promise<unknown> | unknown, label: string) => {
      if (!(durablePlanId && !readOnly)) {
        return;
      }
      const attemptId = durableSaveAttemptSequence.current + 1;
      durableSaveAttemptSequence.current = attemptId;
      durableSaveRetry.current = { label, operation };
      setDurableSavePendingCount((count) => count + 1);
      setDurableSaveReference(null);
      setDurableSaveStatus("idle");
      const handleFailure = () => {
        const reference = createTimelineSaveReference();
        if (durableSaveAttemptSequence.current === attemptId) {
          setDurableSaveReference(reference);
          setDurableSaveStatus("error");
        }
        toast.error(
          `Unable to save ${label}. Changes are still local. Reference ${reference}.`
        );
      };
      let result: Promise<unknown> | unknown;
      try {
        result = operation();
      } catch {
        handleFailure();
        setDurableSavePendingCount((count) => Math.max(0, count - 1));
        return;
      }
      void Promise.resolve(result)
        .then(() => {
          if (durableSaveAttemptSequence.current !== attemptId) {
            return;
          }
          durableSaveRetry.current = null;
          setDurableSaveReference(null);
          setDurableSaveStatus("saved");
        })
        .catch(handleFailure)
        .finally(() => {
          setDurableSavePendingCount((count) => Math.max(0, count - 1));
        });
    },
    [durablePlanId, readOnly]
  );
  const retryDurableMutation = useCallback(() => {
    const pendingRetry = durableSaveRetry.current;
    if (pendingRetry) {
      runDurableMutation(pendingRetry.operation, pendingRetry.label);
    }
  }, [runDurableMutation]);
  const persistSubmitPlan = useCallback(
    () =>
      persistence?.submitPlan?.() ??
      submitTimelinePlan({ planId: durablePlanId as Id<"demo_timelinePlans"> }),
    [durablePlanId, persistence, submitTimelinePlan]
  );
  const persistUpdatePlanState = useCallback(
    (input: TimelinePlanStatePersistenceInput) => {
      if (persistence?.updatePlanState) {
        return persistence.updatePlanState(input);
      }
      return updateTimelinePlanState({
        ...toDemoTimelinePlanStateMutationInput(input),
        planId: durablePlanId as Id<"demo_timelinePlans">,
      });
    },
    [durablePlanId, persistence, updateTimelinePlanState]
  );
  const persistCreateDraw = useCallback(
    (input: any) =>
      persistence?.createDraw?.(input) ??
      createTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineDraw, durablePlanId, persistence]
  );
  const persistUpdateDraw = useCallback(
    (input: any) =>
      persistence?.updateDraw?.(input) ??
      updateTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineDraw]
  );
  const persistDeleteDraw = useCallback(
    (input: any) =>
      persistence?.deleteDraw?.(input) ??
      deleteTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineDraw, durablePlanId, persistence]
  );
  const persistDrawSequenceUpdates = useCallback(
    (
      previousDraws: DemoDraw[],
      nextDraws: DemoDraw[],
      skipDrawIds: Set<string> = new Set()
    ) => {
      if (!durablePlanId) {
        return;
      }

      const previousById = new Map(
        sortTimelineDraws(previousDraws).map((draw, index) => [
          draw.id,
          { draw, order: index + 1 },
        ])
      );

      nextDraws.forEach((draw, index) => {
        if (skipDrawIds.has(draw.id)) {
          return;
        }

        const previous = previousById.get(draw.id);
        if (!previous) {
          return;
        }

        const nextOrder = index + 1;
        if (
          previous.draw.label === draw.label &&
          previous.order === nextOrder
        ) {
          return;
        }

        runDurableMutation(
          () =>
            persistUpdateDraw({
              drawKey: draw.id,
              label: draw.label,
              order: nextOrder,
            }),
          "draw sequence update"
        );
      });
    },
    [durablePlanId, persistUpdateDraw, runDurableMutation]
  );
  const persistSubmitDrawRequest = useCallback(
    (input: any) =>
      persistence?.submitDrawRequest?.(input) ??
      submitTimelineDrawRequest({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, submitTimelineDrawRequest]
  );
  const persistReviewDrawRequest = useCallback(
    (input: any) =>
      persistence?.reviewDrawRequest?.(input) ??
      reviewTimelineDrawRequest({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, reviewTimelineDrawRequest]
  );
  const persistCreateCapitalEvent = useCallback(
    (input: any) =>
      persistence?.createCapitalEvent?.(input) ??
      createTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineCapitalEvent, durablePlanId, persistence]
  );
  const persistCreateCashInfusion = useCallback(
    (input: any) =>
      persistence?.createCashInfusion?.(input) ??
      createTimelineCashInfusion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineCashInfusion, durablePlanId, persistence]
  );
  const persistUpdateCapitalEvent = useCallback(
    (input: any) =>
      persistence?.updateCapitalEvent?.(input) ??
      updateTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineCapitalEvent]
  );
  const persistDeleteCapitalEvent = useCallback(
    (input: any) =>
      persistence?.deleteCapitalEvent?.(input) ??
      deleteTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineCapitalEvent, durablePlanId, persistence]
  );
  const persistCreateMilestone = useCallback(
    (input: any) =>
      persistence?.createMilestone?.(input) ??
      createTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineMilestone, durablePlanId, persistence]
  );
  const persistUpdateMilestone = useCallback(
    (input: any) =>
      persistence?.updateMilestone?.(input) ??
      updateTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineMilestone]
  );
  const persistDeleteMilestone = useCallback(
    (input: any) =>
      persistence?.deleteMilestone?.(input) ??
      deleteTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineMilestone, durablePlanId, persistence]
  );
  const persistRequestModification = useCallback(
    (input: any) =>
      persistence?.requestModification?.(input) ??
      requestTimelineModification({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, requestTimelineModification]
  );
  const persistReviewModificationRequest = useCallback(
    (input: any) =>
      persistence?.reviewModificationRequest?.(input) ??
      reviewTimelineModificationRequest(input),
    [persistence, reviewTimelineModificationRequest]
  );
  const persistSubmitMilestoneCompletion = useCallback(
    (input: any) =>
      persistence?.submitMilestoneCompletion?.(input) ??
      submitTimelineMilestoneCompletion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, submitTimelineMilestoneCompletion]
  );
  const persistReviewMilestoneCompletion = useCallback(
    (input: any) =>
      persistence?.reviewMilestoneCompletion?.(input) ??
      reviewTimelineMilestoneCompletion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, reviewTimelineMilestoneCompletion]
  );
  const persistRequestMilestoneSiteVisit = useCallback(
    (input: any) => persistence?.requestMilestoneSiteVisit?.(input),
    [persistence]
  );
  const persistRecordMilestoneSiteVisit = useCallback(
    (input: any) => persistence?.recordMilestoneSiteVisit?.(input),
    [persistence]
  );
  const persistGenerateEvidenceUploadUrl = useCallback(
    () =>
      persistence?.generateEvidenceUploadUrl?.() ??
      generateTimelineEvidenceUploadUrl({
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, generateTimelineEvidenceUploadUrl, persistence]
  );
  const persistCreateEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.createEvidenceAsset?.(input) ??
      createTimelineEvidenceAsset({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineEvidenceAsset, durablePlanId, persistence]
  );
  const persistUpdateEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.updateEvidenceAsset?.(input) ??
      updateTimelineEvidenceAssetMutation({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineEvidenceAssetMutation]
  );
  const persistDeleteEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.deleteEvidenceAsset?.(input) ??
      deleteTimelineEvidenceAsset({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineEvidenceAsset, durablePlanId, persistence]
  );
  const {
    resetTimeline,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    share,
  } = useTimelineSnapshotSharing({
    activeSelection,
    approvedDrawLimit,
    capitalSpikeInsertionCount,
    capitalSpikes,
    drawInsertionCount,
    draws,
    interestAnnualBps,
    insertionCount,
    items,
    currentDay,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    shareUrlPath,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikeEditDraft,
    setCapitalSpikes,
    setDrawEditDraft,
    setDraws,
    setInterestAnnualBps,
    setItems,
    setCurrentDay,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedDay,
    setSelectedPanelOpen,
    setApprovedDrawLimit,
    setMinimumCashReserve,
    setStartingCash,
    setStraightLine,
    minimumCashReserve,
    startingCash,
    straightLine,
  });

  const applyTimelineState = useCallback((nextState: TimelineShareState) => {
    const hydratedState = normalizeTimelineShareStateForRoute(nextState);

    setItems(hydratedState.items);
    setDraws(hydratedState.draws);
    setInterestAnnualBps(
      normalizeInterestAnnualBps(hydratedState.interestAnnualBps)
    );
    setCapitalSpikes(hydratedState.capitalSpikes);
    setRange(hydratedState.range);
    setActiveSelection(hydratedState.activeSelection);
    setCurrentDay(hydratedState.currentDay);
    setSelectedDay(hydratedState.progressValue);
    setProgressValue(hydratedState.progressValue);
    setProbeValue(null);
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setDrawEditDraft({ amount: "", x: "" });
    setCapitalSpikeEditDraft({
      amount: "",
      interestAnnualPercent: "",
      label: "",
      x: "",
    });
    setSelectedPanelOpen(hydratedState.selectedPanelOpen);
    setMinimumCashReserve(hydratedState.minimumCashReserve);
    setStartingCash(hydratedState.startingCash);
    setApprovedDrawLimit(hydratedState.approvedDrawLimit);
    setStraightLine(hydratedState.straightLine);
    insertionCount.current = countInsertedTimelineItems(hydratedState.items);
    drawInsertionCount.current = countManualDraws(hydratedState.draws);
    capitalSpikeInsertionCount.current = hydratedState.capitalSpikes.length;
  }, []);

  useEffect(() => {
    if (!(initialState && incomingTimelineStateSignature)) {
      appliedTimelineStateSignature.current = null;
      return;
    }

    if (appliedTimelineStateSignature.current === null) {
      appliedTimelineStateSignature.current = incomingTimelineStateSignature;
      if (!setupComplete) {
        setSetupBaseline(initialState);
        setSetupComplete(true);
        applyTimelineState(workspaceInitialState);
      }
      return;
    }

    if (
      appliedTimelineStateSignature.current === incomingTimelineStateSignature
    ) {
      return;
    }

    appliedTimelineStateSignature.current = incomingTimelineStateSignature;
    setSetupBaseline(initialState);
    setSetupComplete(true);
    applyTimelineState(workspaceInitialState);
  }, [
    applyTimelineState,
    incomingTimelineStateSignature,
    initialState,
    setupComplete,
    workspaceInitialState,
  ]);

  useEffect(() => {
    setModificationRequests(initialModificationRequests);
  }, [initialModificationRequests]);

  const completeTimelineSetup = useCallback(
    (result: TimelineSetupResult) => {
      const settingsTemplate = settingsTemplates.find(
        (template) => template.templateKey === result.templateKey
      );
      const computedRange = settingsTemplate
        ? timelineSettingsRange(result.items)
        : expandTimelineRangeForMilestones(result.items, BASE_INITIAL_RANGE);
      const nextRange =
        workspaceMode === "proposal"
          ? {
              ...computedRange,
              min: PROPOSAL_TIMELINE_MIN_DAY,
            }
          : computedRange;
      const nextDraws = settingsTemplate
        ? buildDrawsFromActiveScenario(
            settingsTemplate,
            result.items,
            result.reimbursableBudgetCents
          )
        : buildDemoDraws(result.items, nextRange);
      const activeItem =
        result.items.find((item) => item.id === result.activeItemId) ??
        result.items[0] ??
        null;
      const nextState: TimelineShareState = {
        activeSelection: {
          itemId: activeItem?.id ?? "",
          phase: "inProgress",
        },
        capitalSpikes: INITIAL_CAPITAL_SPIKES,
        currentDay: result.currentDay,
        draws: nextDraws,
        interestAnnualBps,
        items: result.items,
        minimumCashReserve,
        progressValue: result.currentDay,
        range: nextRange,
        selectedPanelOpen: Boolean(activeItem),
        startingCash: result.startingCash,
        straightLine: true,
      };

      setSetupBaseline(nextState);
      applyTimelineState(nextState);
      setSetupComplete(true);
      void createTimelinePlan({
        actorPersona: "lender_admin",
        address: result.projectAddress,
        buildName: result.templateTitle,
        currentDay: result.currentDay,
        draws: nextDraws.map((draw, index) => ({
          amountCents: dollarsToCents(draw.amount),
          customDate: Boolean(draw.customDate),
          drawKey: draw.id,
          ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
          label: draw.label,
          order: index + 1,
          requestNote: draw.requestNote,
          requestReviewNote: draw.requestReviewNote,
          requestStatus: draw.requestStatus,
          reviewedAt: draw.reviewedAt,
          requestedAt: draw.requestedAt,
          x: draw.x,
        })),
        milestones: result.items
          .filter(
            (
              item
            ): item is TimelineItem<DemoMilestone> & {
              data: DemoMilestone;
            } => Boolean(item.data)
          )
          .map((item, index) => ({
            budgetCents: dollarsToCents(item.data.amount),
            dayEnd: Math.round(item.x + item.data.durationDays),
            dayStart: Math.round(item.x),
            drawAvailabilityCents: dollarsToCents(
              getMilestoneDrawAvailabilityAmount(item.data)
            ),
            drawKey: item.data.draw,
            durationDays: item.data.durationDays,
            evidenceState: item.data.evidence,
            icon: item.data.icon,
            included: true,
            key: item.id,
            lane: item.lane,
            markerLabel: item.markerLabel,
            name: item.data.name,
            order: index + 1,
            policyState: item.data.policy,
            status: item.data.status,
            siteVisitGuidance: item.data.siteVisitGuidance,
            submilestones: resolveMilestoneSubmilestones(
              item.data,
              item.id
            ).map((submilestone) => ({
              ...(submilestone.budgetCents === undefined
                ? {}
                : { budgetCents: submilestone.budgetCents }),
              ...(submilestone.description
                ? { description: submilestone.description }
                : {}),
              ...(submilestone.durationDays === undefined
                ? {}
                : { durationDays: submilestone.durationDays }),
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
            })),
            tone: item.tone,
            type: "timeline_demo",
            x: item.x,
          })),
        progressValue: result.currentDay,
        borrowerCoPayBps: result.borrowerCoPayBps,
        borrowerCoPayCents: result.borrowerCoPayCents,
        rangeMax: nextRange.max,
        rangeMin: nextRange.min,
        lenderDrawPolicyLimitCents: result.reimbursableBudgetCents,
        startingCashCents: dollarsToCents(result.startingCash),
        templateTitle: result.templateTitle,
        totalBudgetCents: dollarsToCents(result.totalBudget),
      })
        .then((created) => {
          console.info("Durable timeline plan created", created);
          if (result.redirectToDurableRoute) {
            window.location.assign(created.shareUrl);
          }
        })
        .catch((error) => {
          console.error("Unable to create durable timeline plan", error);
        });
      if (!result.redirectToDurableRoute) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ left: 0, top: 0 });
        });
      }
    },
    [
      applyTimelineState,
      createTimelinePlan,
      interestAnnualBps,
      minimumCashReserve,
      settingsTemplates,
      workspaceMode,
    ]
  );

  const resetCurrentTimeline = useCallback(() => {
    if (!canEditPlanStructure) {
      return;
    }
    if (share || !setupBaseline) {
      resetTimeline();
      return;
    }

    applyTimelineState(setupBaseline);
  }, [
    applyTimelineState,
    canEditPlanStructure,
    resetTimeline,
    setupBaseline,
    share,
  ]);

  const optimizeCurrentScenario = useCallback(
    (exactDrawCount?: number) => {
      if (!(canWriteLiveTimeline && !liveBuildMode)) {
        toast.error("Timeline is locked in this status.");
        return;
      }

      const result = optimizeTimelineDrawSchedule({
        capitalSpikes,
        ...(exactDrawCount === undefined ? {} : { exactDrawCount }),
        interestAnnualBps,
        items,
        minimumCashReserve,
        range: resolvedRange,
        startingCash,
      });

      if (result.status === "infeasible") {
        toast.error(result.infeasibleReason);
        return;
      }

      const optimizationRunId = Date.now().toString(36);
      const nextDraws = relabelTimelineDraws(
        result.draws.map((draw, index) => ({
          ...draw,
          id: `optimized-draw-${optimizationRunId}-${index + 1}`,
        }))
      );

      if (drawSchedulesMatchForOptimization(draws, nextDraws)) {
        if (nextDraws.length === 0) {
          toast.success(
            "Scenario is already optimized; no draw is needed to maintain the minimum cash reserve."
          );
          return;
        }

        toast.success(
          `Scenario is already optimized: ${nextDraws.length} draw${
            nextDraws.length === 1 ? "" : "s"
          } minimize estimated interest and draw fees while maintaining the minimum cash reserve.`
        );
        return;
      }

      setActiveDrawId(null);
      setActiveCapitalSpikeId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setDraws(nextDraws);
      const optimizedRangeMax = Math.max(
        resolvedRange.max,
        ...nextDraws.map((draw) => Math.ceil(draw.x + 1))
      );
      if (optimizedRangeMax > resolvedRange.max) {
        setRange((currentRange) => ({
          ...currentRange,
          max: optimizedRangeMax,
        }));
      }

      if (durablePlanId && persistence?.replaceDrawSchedule) {
        runDurableMutation(
          () =>
            persistence.replaceDrawSchedule?.({
              draws: nextDraws.map((draw, index) => ({
                amountCents: dollarsToCents(draw.amount),
                customDate: true,
                drawKey: draw.id,
                ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
                label: draw.label,
                order: index + 1,
                x: draw.x,
              })),
              metrics: {
                drawCount: nextDraws.length,
                drawFeesCents: dollarsToCents(result.drawFees),
                interestCostCents: dollarsToCents(result.interestCost),
                totalCostCents: dollarsToCents(result.totalCost),
                totalDrawAmountCents: dollarsToCents(result.totalDrawAmount),
              },
            }),
          exactDrawCount === undefined
            ? "optimized draw replacement"
            : `exact ${exactDrawCount}-draw replacement`
        );
      } else if (durablePlanId) {
        for (const draw of draws) {
          runDurableMutation(
            () => persistDeleteDraw({ drawKey: draw.id }),
            "optimized draw replacement"
          );
        }

        nextDraws.forEach((draw, index) => {
          runDurableMutation(
            () =>
              persistCreateDraw({
                amountCents: dollarsToCents(draw.amount),
                customDate: true,
                drawKey: draw.id,
                ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
                label: draw.label,
                order: index + 1,
                x: draw.x,
              }),
            "optimized draw"
          );
        });
      }

      if (nextDraws.length === 0) {
        toast.success(
          "No draw is needed to maintain the minimum cash reserve."
        );
        return;
      }

      toast.success(
        `Optimized ${nextDraws.length} draw${
          nextDraws.length === 1 ? "" : "s"
        }: ${money(result.totalCost)} total interest and fee cost.`
      );
    },
    [
      canWriteLiveTimeline,
      capitalSpikes,
      draws,
      durablePlanId,
      interestAnnualBps,
      items,
      liveBuildMode,
      minimumCashReserve,
      persistCreateDraw,
      persistDeleteDraw,
      persistence,
      resolvedRange,
      runDurableMutation,
      startingCash,
    ]
  );

  const submitCurrentPlan = useCallback(async () => {
    if (!(durablePlanId && !readOnly)) {
      return;
    }
    setSubmitPending(true);
    setSubmitError("");
    try {
      await persistSubmitPlan();
      setSubmitConfirmOpen(false);
      toast.success("Proposal submitted to lender review.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit proposal.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitPending(false);
    }
  }, [durablePlanId, persistSubmitPlan, readOnly]);

  const approveAndCloseFromLenderDemo = useCallback(async () => {
    if (!(durablePlanId && planStatus === "submitted")) {
      toast.error("This proposal is no longer awaiting approval.");
      return;
    }

    setLenderApprovalPending(true);
    try {
      const result = await approveTimelinePlan({
        adminNote: "Approved and closed from the lender demo timeline.",
        planId: durablePlanId,
        startDate: getDemoApprovalStartDate(),
      });
      if (typeof result?.buildKey === "string") {
        setLenderApprovedBuildKey(result.buildKey);
      }
      toast.success("Proposal approved. Live build is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setLenderApprovalPending(false);
    }
  }, [approveTimelinePlan, durablePlanId, planStatus]);

  useEffect(() => {
    if (share) {
      setSetupComplete(true);
    }
  }, [share]);
  useEffect(() => {
    if (!(durablePlanId && !readOnly)) {
      return;
    }
    if (!durablePlanStateInitialized.current) {
      durablePlanStateInitialized.current = true;
      return;
    }
    const timeout = window.setTimeout(() => {
      runDurableMutation(
        () =>
          persistUpdatePlanState({
            currentDay,
            progressValue,
            rangeMax: resolvedRange.max,
            rangeMin: resolvedRange.min,
            routeState: {
              activeCapitalSpikeId: activeCapitalSpikeId ?? undefined,
              activeDrawId: activeDrawId ?? undefined,
              activeMilestoneKey: activeSelection.itemId,
              selectedPanelOpen,
              straightLine,
            },
            minimumCashReserveCents: dollarsToCents(minimumCashReserve),
            startingCashCents: dollarsToCents(startingCash),
          }),
        "timeline state"
      );
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    activeCapitalSpikeId,
    activeDrawId,
    activeSelection.itemId,
    currentDay,
    durablePlanId,
    progressValue,
    readOnly,
    resolvedRange.max,
    resolvedRange.min,
    persistUpdatePlanState,
    runDurableMutation,
    selectedPanelOpen,
    minimumCashReserve,
    startingCash,
    straightLine,
  ]);
  const cashflowData = useMemo(
    () =>
      buildTimelineCashflowData(
        items,
        draws,
        capitalSpikes,
        resolvedRange,
        startingCash
      ),
    [capitalSpikes, draws, items, resolvedRange, startingCash]
  );
  const cashflowChartData = useMemo(
    () =>
      buildCashflowChartData(cashflowData, items, resolvedRange, startingCash),
    [cashflowData, items, resolvedRange, startingCash]
  );
  const drawAvailabilityData = useMemo(
    () =>
      buildDrawAvailabilityData(
        cashflowData,
        approvedDrawLimit,
        interestAnnualBps
      ),
    [approvedDrawLimit, cashflowData, interestAnnualBps]
  );
  const drawAvailabilityChartData = useMemo(
    () =>
      buildDrawAvailabilityChartData(
        drawAvailabilityData,
        cashflowData,
        items,
        resolvedRange
      ),
    [cashflowData, drawAvailabilityData, items, resolvedRange]
  );
  const cashShortfalls = useMemo(
    () => buildCashShortfallPoints(cashflowData, minimumCashReserve),
    [cashflowData, minimumCashReserve]
  );
  const financialOverview = useMemo(
    () =>
      buildFinancialOverview(
        cashflowData,
        draws,
        resolvedRange,
        interestAnnualBps,
        capitalSpikes
      ),
    [capitalSpikes, cashflowData, draws, interestAnnualBps, resolvedRange]
  );
  const cashUseSummary = useMemo(
    () => buildCashUseSummary(items, draws, capitalSpikes),
    [capitalSpikes, draws, items]
  );
  const drawAvailabilityViolation = useMemo(
    () => findDrawUnlockCapacityViolation(items, draws),
    [draws, items]
  );
  const cashflowExtent = useMemo(
    () => getCashflowChartExtent(cashflowChartData),
    [cashflowChartData]
  );
  const drawAvailabilityExtent = useMemo(
    () => getDrawAvailabilityChartExtent(drawAvailabilityData),
    [drawAvailabilityData]
  );
  const probeCashOnHand =
    probeValue === null
      ? null
      : interpolateLinearCashOnHand(cashflowChartData, probeValue);
  const rawProbeDrawAvailability =
    probeValue === null
      ? null
      : interpolateDrawAvailability(
          drawAvailabilityData,
          Math.round(probeValue)
        );
  const probeDrawAvailability =
    rawProbeDrawAvailability === null
      ? null
      : withHomeEquityInterest(
          rawProbeDrawAvailability,
          capitalSpikes,
          Math.round(probeValue ?? rawProbeDrawAvailability.day)
        );
  const probeInterestPaid = probeDrawAvailability?.totalInterestAccrued ?? null;
  const endingCashOnHand = cashflowData.at(-1)?.cashOnHand ?? startingCash;
  const endingAvailability = withHomeEquityInterest(
    interpolateDrawAvailability(drawAvailabilityData, resolvedRange.max),
    capitalSpikes,
    resolvedRange.max
  );
  const cashflowDrawPosition = getCumulativeDrawPosition(
    probeDrawAvailability ?? endingAvailability
  );
  const timelineSizing = useMemo(
    () => getTimelineResponsiveSizing(isCompactLayout, isPhoneLayout),
    [isCompactLayout, isPhoneLayout]
  );
  const cashflowTicks = useMemo(
    () => getTimelineAlignedTicks(resolvedRange, timelineSizing.pixelsPerUnit),
    [resolvedRange, timelineSizing.pixelsPerUnit]
  );
  const handleChartHotspotDaySelect = useCallback(
    (day: number) => {
      const nextDay = clampNumber(
        Math.round(day),
        resolvedRange.min,
        resolvedRange.max
      );
      setSelectedDay(nextDay);
      setProgressValue(nextDay);
      setProbeValue(null);

      const activeMilestone = items.find((item) => {
        if (!item.data) {
          return false;
        }
        const startDay = Math.round(item.x);
        const endDay = Math.round(getMilestoneEndX(item));
        return nextDay >= startDay && nextDay <= endDay;
      });

      if (activeMilestone) {
        setActiveSelection({
          itemId: activeMilestone.id,
          phase: "inProgress",
        });
      }
    },
    [items, resolvedRange.max, resolvedRange.min]
  );
  const drawAvailabilityHotspotReferenceLines = useMemo(
    () => [
      ...items
        .filter((item) => item.data)
        .map((item) => {
          const endDay = Math.round(
            clampNumber(
              getMilestoneEndX(item),
              resolvedRange.min,
              resolvedRange.max
            )
          );

          return {
            label: undefined,
            onClick: () => handleChartHotspotDaySelect(endDay),
            opacity: 0.42,
            stroke: "oklch(0.67 0.18 275)",
            strokeDasharray: "5 4",
            x: endDay,
          };
        }),
      ...capitalSpikes.map((spike) => {
        const day = Math.round(
          clampNumber(spike.x, resolvedRange.min, resolvedRange.max)
        );
        const isCashInfusion = spike.eventKind === "cashInfusion";

        return {
          label: undefined,
          onClick: () => handleChartHotspotDaySelect(day),
          opacity: 0.5,
          stroke: isCashInfusion
            ? "oklch(0.58 0.18 150)"
            : "oklch(0.62 0.22 35)",
          strokeDasharray: "2 3",
          x: day,
        };
      }),
    ],
    [
      capitalSpikes,
      handleChartHotspotDaySelect,
      items,
      resolvedRange.max,
      resolvedRange.min,
    ]
  );
  const cashflowReferenceLines = useMemo(
    () => [
      ...(showCashflowWarnings
        ? cashShortfalls.map((point) => ({
            label: isPhoneLayout
              ? undefined
              : point.shortfall > 0
                ? `Short ${money(point.shortfall)}`
                : "Cash zero",
            opacity: 0.52,
            stroke: "oklch(0.62 0.22 25)",
            strokeDasharray: "2 3",
            x: point.day,
          }))
        : []),
      ...(isMobileDrawerLayout
        ? [
            {
              label: isPhoneLayout
                ? undefined
                : ["Viewing day", `Day ${Math.round(selectedDay)}`],
              opacity: 0.92,
              stroke: "oklch(0.841 0.238 128.85)",
              strokeDasharray: "1 0",
              x: selectedDay,
            },
          ]
        : []),
      ...(probeValue === null
        ? []
        : [
            {
              label: [
                `Day ${Math.round(probeValue)}`,
                `Cash on hand ${money(probeCashOnHand ?? startingCash)}`,
              ],
              opacity: 0.78,
              stroke: "oklch(0.62 0.22 25)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ]),
    ],
    [
      cashShortfalls,
      isMobileDrawerLayout,
      isPhoneLayout,
      probeCashOnHand,
      probeValue,
      selectedDay,
      showCashflowWarnings,
      startingCash,
    ]
  );
  const drawAvailabilityReferenceLines = useMemo(
    () => [
      ...drawAvailabilityHotspotReferenceLines,
      ...(isMobileDrawerLayout
        ? [
            {
              label: isPhoneLayout
                ? undefined
                : ["Viewing day", `Day ${Math.round(selectedDay)}`],
              opacity: 0.92,
              stroke: "oklch(0.841 0.238 128.85)",
              strokeDasharray: "1 0",
              x: selectedDay,
            },
          ]
        : []),
      ...(probeValue === null
        ? []
        : [
            {
              label: [
                `Delta ${money(
                  probeDrawAvailability?.additionalAvailableDraw ?? 0
                )}`,
                `Interest-bearing ${money(
                  probeDrawAvailability?.interestBearingDraw ?? 0
                )}`,
                `Total interest ${money(
                  probeDrawAvailability?.totalInterestAccrued ?? 0
                )}`,
              ],
              opacity: 0.82,
              stroke: "oklch(0.6 0.18 240)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ]),
    ],
    [
      drawAvailabilityHotspotReferenceLines,
      isMobileDrawerLayout,
      isPhoneLayout,
      probeDrawAvailability,
      probeValue,
      selectedDay,
    ]
  );
  const markers = useMemo<TimelineMarker[]>(
    () => [
      {
        id: "today",
        label: "Today",
        sublabel:
          currentDay === GENERATED_TIMELINE_CURRENT_DAY
            ? "Proposal start"
            : "Site visit",
        tone: "today",
        x: currentDay,
      },
      ...draws.map((draw) => ({
        id: `draw-${draw.id}`,
        label: draw.label,
        sublabel: `${money(draw.amount)} · ${formatTimelineDay(draw.x)}`,
        tone: "accent" as const,
        x: draw.x,
      })),
      ...capitalSpikes.map((spike) => ({
        id: `capital-spike-${spike.id}`,
        label: spike.label,
        sublabel: `${money(spike.amount)} · ${formatTimelineDay(spike.x)}`,
        tone: "warning" as const,
        x: spike.x,
      })),
      {
        id: "policy-limit",
        label: "Policy checkpoint",
        sublabel: "Lender limit",
        tone: "warning",
        x: 154,
      },
    ],
    [capitalSpikes, currentDay, draws]
  );

  const openDrawEditor = (draw: DemoDraw) => {
    setActiveCapitalSpikeId(null);
    setActiveDrawId(draw.id);
    setSelectedPanelOpen(true);
    setProbeValue(Math.round(draw.x));
    setDrawEditDraft({
      amount: String(draw.amount),
      x: String(Math.round(draw.x)),
    });
  };

  const openCapitalSpikeEditor = (spike: DemoCapitalSpike) => {
    setActiveDrawId(null);
    setActiveCapitalSpikeId(spike.id);
    setSelectedPanelOpen(false);
    setCapitalSpikeEditDraft({
      amount: String(spike.amount),
      interestAnnualPercent:
        spike.interestAnnualBps === undefined
          ? ""
          : String(spike.interestAnnualBps / 100),
      label: spike.label,
      x: String(Math.round(spike.x)),
    });
  };

  const addLocalModificationRequest = (
    request: TimelineModificationRequestView
  ) => {
    setModificationRequests((current) => [request, ...current]);
  };

  const requestMilestoneCreation = (requestedX: number) => {
    if (requestedX < 0) {
      toast.error("Construction milestones cannot start before T0.");
      return;
    }
    insertionCount.current += 1;
    const count = insertionCount.current;
    const lane = count % 3 === 0 ? 1 : count % 2 === 0 ? -1 : 0;
    const milestone = {
      budgetCents: dollarsToCents(95_000 + count * 12_500),
      dayEnd: requestedX + DEFAULT_MILESTONE_DURATION_DAYS,
      dayStart: requestedX,
      durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
      evidenceState: "Requested change",
      icon: "change",
      included: true,
      lane,
      markerLabel: "+",
      milestoneKey: `requested-${Date.now()}-${count}`,
      name: `Requested field change ${count}`,
      order: items.length + modificationRequests.length + 1,
      policyState: "Admin approval required",
      status: "ready",
      submilestones: [
        { name: "Scope estimate" },
        { name: "Schedule alignment" },
        { name: "Draw planning" },
      ],
      tone: "warning",
      type: "timeline_demo",
      x: requestedX,
    };
    const optimisticRequest = {
      requestedPayload: { milestone },
      requestType: "createMilestone",
      status: "requested",
    } satisfies TimelineModificationRequestView;
    addLocalModificationRequest(optimisticRequest);
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistRequestModification({
            reason: "Builder requested a live-build milestone change.",
            requestedPayload: { milestone },
            requestType: "createMilestone",
          }),
        "milestone modification request"
      );
    }
  };

  const createInsertedMilestoneItem = (requestedX: number) => {
    insertionCount.current += 1;
    const count = insertionCount.current;
    const lane = count % 3 === 0 ? 1 : count % 2 === 0 ? -1 : 0;

    return {
      data: {
        amount: 95_000 + count * 12_500,
        draw: `Inserted ${count}`,
        durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
        evidence: "Draft package",
        icon: "change",
        name: `Field change ${count}`,
        policy: "Needs sequencing",
        status: "ready",
        subMilestones: [
          "Scope estimate",
          "Schedule alignment",
          "Draw planning",
        ],
      },
      eyebrow: "Inserted milestone",
      id: `inserted-${Date.now()}-${count}`,
      label: `Field change ${count}`,
      lane,
      markerLabel: "+",
      tone: "warning",
      x: requestedX,
    } satisfies TimelineItem<DemoMilestone>;
  };

  const addPlanMilestone = (requestedX: number) => {
    if (!canEditPlanStructure) {
      return;
    }

    const requestedDay = Math.round(requestedX);
    if (requestedDay < 0) {
      toast.error("Construction milestones cannot start before T0.");
      return;
    }
    const createdItem = createInsertedMilestoneItem(requestedDay);
    const result = insertTimelineItemWithSpacing(items, createdItem, {
      minGap: 14,
      range: resolvedRange,
    });
    const normalizedItems = normalizeMilestoneTimelineItems(result.items);
    const expandedRange = expandTimelineRangeForMilestones(
      normalizedItems,
      result.range
    );
    const normalizedInsertedItem =
      normalizedItems.find((item) => item.id === result.insertedItem.id) ??
      result.insertedItem;

    pendingNormalizedInsertSelection.current = {
      itemId: normalizedInsertedItem.id,
      x: normalizedInsertedItem.x,
    };
    pendingExpandedRange.current = expandedRange;
    setSelectedPanelOpen(true);
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setItems(normalizedItems);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, normalizedItems, expandedRange)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateMilestone({
            milestone: timelineItemToMilestoneMutationInput(
              normalizedInsertedItem,
              normalizedItems.findIndex(
                (item) => item.id === normalizedInsertedItem.id
              ) + 1
            ),
          }),
        "milestone creation"
      );
    }
  };

  const addManualDraw = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    if (requestedX < 0) {
      toast.error("Reimbursement draws cannot be scheduled before T0.");
      return;
    }
    drawInsertionCount.current += 1;
    const count = drawInsertionCount.current;
    const owner = findTimelineItemForDay(items, requestedX);
    const nextDrawId = `manual-draw-${Date.now()}-${count}`;
    const maxSchedulableAmount = getMaxSchedulableDrawAmount(
      requestedX,
      items,
      draws,
      { proposedDrawId: nextDrawId },
      approvedDrawLimit
    );

    if (maxSchedulableAmount <= 0) {
      toast.error(DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE);
      return;
    }

    const nextDraw = {
      amount: Math.min(100_000, maxSchedulableAmount),
      customDate: true,
      id: nextDrawId,
      ...(owner ? { itemId: owner.id } : {}),
      label: `Draw ${draws.length + 1}`,
      x: requestedX,
    } satisfies DemoDraw;
    const nextDraws = relabelTimelineDraws([...draws, nextDraw]);
    const sequencedNextDraw =
      nextDraws.find((draw) => draw.id === nextDraw.id) ?? nextDraw;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setDraws((currentDraws) =>
      relabelTimelineDraws([...currentDraws, nextDraw])
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateDraw({
            amountCents: dollarsToCents(sequencedNextDraw.amount),
            customDate: true,
            drawKey: sequencedNextDraw.id,
            ...(sequencedNextDraw.itemId
              ? { itemMilestoneKey: sequencedNextDraw.itemId }
              : {}),
            label: sequencedNextDraw.label,
            order: nextDraws.findIndex((draw) => draw.id === nextDraw.id) + 1,
            x: sequencedNextDraw.x,
          }),
        "draw"
      );
      persistDrawSequenceUpdates(draws, nextDraws, new Set([nextDraw.id]));
    }
  };

  const addCapitalSpike = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextSpike = {
      amount: 35_000,
      eventKind: "cost",
      id: `capital-spike-${Date.now()}-${count}`,
      label: `Capital spike ${count}`,
      x: requestedX,
    } satisfies DemoCapitalSpike;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextSpike].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateCapitalEvent({
            amountCents: dollarsToCents(nextSpike.amount),
            capitalEventKey: nextSpike.id,
            eventKind: "cost",
            label: nextSpike.label,
            order: capitalSpikes.length + 1,
            x: nextSpike.x,
          }),
        "capital event"
      );
    }
  };

  const addCashInfusion = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextInfusion = {
      amount: 50_000,
      eventKind: "cashInfusion",
      id: `cash-infusion-${Date.now()}-${count}`,
      label: `Cash infusion ${count}`,
      x: requestedX,
    } satisfies DemoCapitalSpike;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextInfusion].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateCashInfusion({
            amountCents: dollarsToCents(nextInfusion.amount),
            cashInfusionKey: nextInfusion.id,
            label: nextInfusion.label,
            order: capitalSpikes.length + 1,
            x: nextInfusion.x,
          }),
        "cash infusion"
      );
    }
  };

  const addHomeEquityTakeout = (requestedX: number) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextTakeout = {
      amount: 50_000,
      eventKind: "homeEquityTakeout",
      id: `home-equity-takeout-${Date.now()}-${count}`,
      interestAnnualBps,
      label: `Home Equity Takeout ${count}`,
      x: Math.max(PROPOSAL_TIMELINE_MIN_DAY, Math.round(requestedX)),
    } satisfies DemoCapitalSpike;

    pendingCapitalEventIds.current.add(nextTakeout.id);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextTakeout].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    openCapitalSpikeEditor(nextTakeout);
  };

  const deleteDraw = (drawId: string) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }
    const targetDraw = draws.find((draw) => draw.id === drawId);
    if (targetDraw?.requestStatus === "approved") {
      toast.error("Approved reimbursement draws cannot be deleted.");
      return;
    }

    const nextDraws = relabelTimelineDraws(
      draws.filter((draw) => draw.id !== drawId)
    );
    setActiveDrawId(null);
    setDraws((currentDraws) =>
      relabelTimelineDraws(currentDraws.filter((draw) => draw.id !== drawId))
    );
    if (durablePlanId) {
      runDurableMutation(
        () => persistDeleteDraw({ drawKey: drawId }),
        "draw deletion"
      );
      persistDrawSequenceUpdates(draws, nextDraws);
    }
  };

  const deleteCapitalSpike = (spikeId: string) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      currentSpikes.filter((spike) => spike.id !== spikeId)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteCapitalEvent({
            capitalEventKey: spikeId,
          }),
        "capital event deletion"
      );
    }
  };

  const deleteMilestone = (itemId: string) => {
    if (liveBuildMode) {
      const targetItem = items.find((item) => item.id === itemId);
      if (!targetItem?.data) {
        return;
      }
      const optimisticRequest = {
        milestoneKey: itemId,
        reason: "Builder requested milestone deletion.",
        requestedPayload: {},
        requestType: "deleteMilestone",
        status: "requested",
      } satisfies TimelineModificationRequestView;
      addLocalModificationRequest(optimisticRequest);
      if (durablePlanId) {
        runDurableMutation(
          () =>
            persistRequestModification({
              milestoneKey: itemId,
              reason: "Builder requested milestone deletion.",
              requestedPayload: {},
              requestType: "deleteMilestone",
            }),
          "milestone deletion request"
        );
      }
      return;
    }
    if (!canEditPlanStructure) {
      toast.error("Proposal structure is locked after submission.");
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextItems = normalizeMilestoneTimelineItems(
      items.filter((item) => item.id !== targetItem.id)
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);
    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteMilestone({
            milestoneKey: targetItem.id,
          }),
        "milestone deletion"
      );
    }

    if (activeItemId === targetItem.id) {
      const replacementItem =
        nextItems.find((item) => item.x >= targetItem.x) ??
        nextItems.at(-1) ??
        null;
      setActiveSelection({
        itemId: replacementItem?.id ?? "",
        phase: "inProgress",
      });
      setProgressValue(replacementItem?.x ?? nextRange.min);
      setSelectedPanelOpen(Boolean(replacementItem));
    }
  };

  const updateMilestone = (itemId: string, patch: MilestoneCardUpdate) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    if (liveBuildMode && patch.amount !== undefined) {
      const optimisticRequest = {
        milestoneKey: itemId,
        reason: "Builder requested milestone budget change.",
        requestedPayload: { budgetCents: dollarsToCents(patch.amount) },
        requestType: "updateMilestoneBudget",
        status: "requested",
      } satisfies TimelineModificationRequestView;
      addLocalModificationRequest(optimisticRequest);
      if (durablePlanId) {
        runDurableMutation(
          () =>
            persistRequestModification({
              milestoneKey: itemId,
              reason: "Builder requested milestone budget change.",
              requestedPayload: { budgetCents: dollarsToCents(patch.amount) },
              requestType: "updateMilestoneBudget",
            }),
          "milestone budget request"
        );
      }
      return;
    }

    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              data: item.data
                ? {
                    ...item.data,
                    ...(patch.amount === undefined
                      ? {}
                      : { amount: patch.amount }),
                    ...(patch.drawAvailabilityAmount === undefined
                      ? {}
                      : {
                          drawAvailabilityAmount: patch.drawAvailabilityAmount,
                        }),
                    ...(patch.durationDays === undefined
                      ? {}
                      : { durationDays: patch.durationDays }),
                    ...(patch.initialPaymentAmount === undefined
                      ? {}
                      : { initialPaymentAmount: patch.initialPaymentAmount }),
                  }
                : item.data,
              x: patch.x ?? item.x,
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );
    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "milestone update"
        );
      }
    }

    if (activeItemId === itemId) {
      const nextActiveItem = nextItems.find((item) => item.id === itemId);
      setProgressValue(
        activeSelection.phase === "complete" && nextActiveItem
          ? getMilestoneEndX(nextActiveItem)
          : (nextActiveItem?.x ?? patch.x ?? progressValue)
      );
    }
  };

  const updateSubmilestoneBudget = (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    const currentSubmilestones = resolveMilestoneSubmilestones(
      targetItem.data,
      itemId
    );
    const targetSubmilestone = currentSubmilestones.find(
      (submilestone) => submilestone.key === submilestoneKey
    );

    if (!targetSubmilestone) {
      return;
    }

    const nextBudgetCents = Math.max(0, Math.round(budgetCents));
    const currentAmount = Math.max(0, Math.round(targetItem.data.amount));
    const currentDrawAvailability = getMilestoneDrawAvailabilityAmount(
      targetItem.data
    );
    const drawAvailabilityRatio =
      currentAmount > 0 ? currentDrawAvailability / currentAmount : 0;
    const nextSubmilestones = currentSubmilestones.map((submilestone) =>
      submilestone.key === submilestoneKey
        ? { ...submilestone, budgetCents: nextBudgetCents }
        : submilestone
    );
    const nextAmount = Math.round(
      nextSubmilestones.reduce(
        (total, submilestone) =>
          total + Math.max(0, Math.round(submilestone.budgetCents ?? 0)),
        0
      ) / 100
    );
    const nextDrawAvailabilityAmount = Math.max(
      0,
      Math.round(nextAmount * drawAvailabilityRatio)
    );
    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                amount: nextAmount,
                drawAvailabilityAmount: nextDrawAvailabilityAmount,
                subMilestones: submilestoneNames(nextSubmilestones),
                submilestoneDetails: nextSubmilestones,
              },
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );

    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "sub-milestone budget update"
        );
      }
    }
  };

  const updateSubmilestoneDuration = (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    const currentSubmilestones = resolveMilestoneSubmilestones(
      targetItem.data,
      itemId
    );
    const targetSubmilestone = currentSubmilestones.find(
      (submilestone) => submilestone.key === submilestoneKey
    );

    if (!targetSubmilestone) {
      return;
    }

    const nextDurationDays = Math.max(1, Math.round(durationDays));
    const nextSubmilestones = currentSubmilestones.map((submilestone) =>
      submilestone.key === submilestoneKey
        ? { ...submilestone, durationDays: nextDurationDays }
        : submilestone
    );
    const nextMilestoneDurationDays = Math.max(
      1,
      nextSubmilestones.reduce(
        (total, submilestone) =>
          total + Math.max(1, Math.round(submilestone.durationDays ?? 1)),
        0
      )
    );
    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                durationDays: nextMilestoneDurationDays,
                subMilestones: submilestoneNames(nextSubmilestones),
                submilestoneDetails: nextSubmilestones,
              },
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );

    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "sub-milestone duration update"
        );
      }
    }
  };

  const completeMilestone = (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionClaim: {
                  ...(claim.actualCost === undefined
                    ? {}
                    : { actualCost: claim.actualCost }),
                  completedDay: claim.completedDay,
                  ...(claim.note ? { note: claim.note } : {}),
                  ...(claim.qualityNote
                    ? { qualityNote: claim.qualityNote }
                    : {}),
                  ...(claim.qualityRating === undefined
                    ? {}
                    : { qualityRating: claim.qualityRating }),
                  submittedAt: new Date().toISOString(),
                },
                evidence:
                  (item.data.evidencePackage?.assets.length ?? 0) > 0
                    ? "Submitted package"
                    : "Completion claimed",
                status: "complete",
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistSubmitMilestoneCompletion({
            actualCostCents:
              claim.actualCost === undefined
                ? undefined
                : dollarsToCents(claim.actualCost),
            completedDay: claim.completedDay,
            milestoneKey: itemId,
            note: claim.note,
            qualityNote: claim.qualityNote,
            qualityRating: claim.qualityRating,
          }),
        "milestone completion"
      );
    }
  };

  const addEvidenceFiles = (itemId: string, files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void (async () => {
      const evidenceFiles = await Promise.all(
        files
          .filter(
            (file) =>
              file.type.startsWith("image/") ||
              isHeicLikeEvidenceImage({
                fileName: file.name,
                mimeType: file.type,
              })
          )
          .map((file) => normalizeEvidenceFileForUpload(file))
      );
      if (evidenceFiles.length === 0) {
        return;
      }

      const createdAssets: DemoEvidenceAsset[] = [];
      setItems((currentItems) =>
        currentItems.map((item) => {
          if (!(item.id === itemId && item.data)) {
            return item;
          }

          const existingAssets = item.data.evidencePackage?.assets ?? [];
          const nextAssets = evidenceFiles.map((file, index) => {
            const assetNumber = existingAssets.length + index + 1;

            const asset = {
              fileName: file.name,
              id: `evidence-${itemId}-${Date.now()}-${index}`,
              label: `Evidence image ${assetNumber}`,
              mimeType: file.type || "image/*",
              previewUrl: URL.createObjectURL(file),
              size: file.size,
              tag: item.data?.name ?? item.label ?? "Milestone",
            } satisfies DemoEvidenceAsset;
            createdAssets.push(asset);
            return asset;
          });

          if (nextAssets.length === 0) {
            return item;
          }

          return {
            ...item,
            data: {
              ...item.data,
              evidence: "Submitted package",
              evidencePackage: {
                assets: [...existingAssets, ...nextAssets],
              },
            },
          };
        })
      );
      if (durablePlanId && createdAssets.length > 0) {
        for (const [index, asset] of createdAssets.entries()) {
          const file = evidenceFiles[index];
          if (!file) {
            continue;
          }
          void (async () => {
            const uploadUrl = await persistGenerateEvidenceUploadUrl();
            const response = await fetch(uploadUrl, {
              body: file,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
              method: "POST",
            });
            if (!response.ok) {
              throw new Error("Evidence upload failed.");
            }
            const { storageId } = (await response.json()) as {
              storageId: string;
            };
            await persistCreateEvidenceAsset({
              asset: {
                evidenceKey: asset.id,
                fileName: asset.fileName,
                label: asset.label,
                milestoneKey: itemId,
                mimeType: asset.mimeType,
                sizeBytes: asset.size,
                storageId: storageId as Id<"_storage">,
                tag: asset.tag,
              },
            });
          })().catch((error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Unable to persist evidence.";
            toast.error(message);
          });
        }
      }
    })().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare evidence images.";
      toast.error(message);
    });
  };

  const updateEvidenceAsset = (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data?.evidencePackage
          ? {
              ...item,
              data: {
                ...item.data,
                evidencePackage: {
                  assets: item.data.evidencePackage.assets.map((asset) =>
                    asset.id === assetId
                      ? {
                          ...asset,
                          ...(patch.label === undefined
                            ? {}
                            : { label: patch.label }),
                          ...(patch.tag === undefined
                            ? {}
                            : { tag: patch.tag }),
                        }
                      : asset
                  ),
                },
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistUpdateEvidenceAsset({
            evidenceKey: assetId,
            label: patch.label,
            tag: patch.tag,
          }),
        "evidence asset"
      );
    }
  };

  const removeEvidenceAsset = (itemId: string, assetId: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (!(item.id === itemId && item.data?.evidencePackage)) {
          return item;
        }

        const removedAsset = item.data.evidencePackage.assets.find(
          (asset) => asset.id === assetId
        );
        if (removedAsset?.previewUrl) {
          URL.revokeObjectURL(removedAsset.previewUrl);
        }

        const nextAssets = item.data.evidencePackage.assets.filter(
          (asset) => asset.id !== assetId
        );

        return {
          ...item,
          data: {
            ...item.data,
            evidence:
              nextAssets.length > 0 ? "Submitted package" : "Draft package",
            evidencePackage: { assets: nextAssets },
          },
        };
      })
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteEvidenceAsset({
            evidenceKey: assetId,
          }),
        "evidence deletion"
      );
    }
  };

  const updatePlannedDraw = (
    drawId: string,
    patch: { amount?: number; x?: number },
    options: { closeEditor?: boolean } = {}
  ) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }

    const targetDraw = draws.find((draw) => draw.id === drawId);
    if (!targetDraw) {
      return;
    }

    const nextAmount =
      patch.amount === undefined
        ? targetDraw.amount
        : Math.max(0, Math.round(patch.amount));
    const nextX =
      patch.x === undefined
        ? targetDraw.x
        : Math.max(resolvedRange.min, Math.round(patch.x));

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    const isNonWorseningCapacityEdit =
      nextAmount <= targetDraw.amount && nextX >= targetDraw.x;
    const maxSchedulableAmount = getMaxSchedulableDrawAmount(
      nextX,
      items,
      draws,
      {
        excludeDrawId: drawId,
        proposedDrawId: drawId,
      },
      approvedDrawLimit
    );

    if (!isNonWorseningCapacityEdit && nextAmount > maxSchedulableAmount) {
      toast.error(
        maxSchedulableAmount <= 0
          ? DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE
          : `Only ${money(maxSchedulableAmount)} is unlocked and available to draw by day ${nextX}.`
      );
      return;
    }

    const nextDraws = relabelTimelineDraws(
      draws.map((draw) =>
        draw.id === drawId
          ? {
              ...draw,
              amount: nextAmount,
              customDate: true,
              x: nextX,
            }
          : draw
      )
    );

    const sequencedTargetDraw =
      nextDraws.find((draw) => draw.id === drawId) ?? targetDraw;

    setDraws((currentDraws) =>
      relabelTimelineDraws(
        currentDraws.map((draw) =>
          draw.id === drawId
            ? {
                ...draw,
                amount: nextAmount,
                customDate: true,
                x: nextX,
              }
            : draw
        )
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistUpdateDraw({
            amountCents: dollarsToCents(nextAmount),
            customDate: true,
            drawKey: drawId,
            label: sequencedTargetDraw.label,
            order: nextDraws.findIndex((draw) => draw.id === drawId) + 1,
            x: nextX,
          }),
        "draw update"
      );
      persistDrawSequenceUpdates(draws, nextDraws, new Set([drawId]));
    }
    if (nextX > resolvedRange.max) {
      setRange((currentRange) => ({
        ...currentRange,
        max: nextX,
      }));
    }
    if (options.closeEditor) {
      setActiveDrawId(null);
    }
  };

  const applyDrawEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDrawId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      1,
      Math.round(Number(formData.get("drawAmount") ?? drawEditDraft.amount))
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.round(Number(formData.get("drawDate") ?? drawEditDraft.x))
    );

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    updatePlannedDraw(
      activeDrawId,
      { amount: nextAmount, x: nextX },
      { closeEditor: true }
    );
  };

  const submitDrawRequest = (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => {
    const targetDraw = draws.find((draw) => draw.id === drawId);

    if (!targetDraw) {
      return;
    }

    const nextX =
      request.x === undefined
        ? targetDraw.x
        : clampNumber(
            Math.round(request.x),
            resolvedRange.min,
            resolvedRange.max
          );
    const requestedDraw = { ...targetDraw, x: nextX };
    const limit = liveBuildMode
      ? calculateApprovedDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        )
      : calculateDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        );
    const nextAmount = clampNumber(
      Math.round(request.amount),
      0,
      limit.availableLimit
    );

    setDraws((currentDraws) =>
      currentDraws.map((draw) => {
        if (draw.id !== drawId) {
          return draw;
        }

        const {
          requestReviewNote: _requestReviewNote,
          reviewedAt: _reviewedAt,
          ...draftDraw
        } = draw;

        return {
          ...draftDraw,
          amount: nextAmount,
          customDate: true,
          ...(request.note ? { requestNote: request.note } : {}),
          requestStatus: "requested",
          requestedAt: new Date().toISOString(),
          x: nextX,
        };
      })
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistSubmitDrawRequest({
            amountCents: dollarsToCents(nextAmount),
            drawKey: drawId,
            note: request.note,
            x: nextX,
          }),
        "draw request"
      );
    }
  };

  const reviewDrawRequest = (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => {
    setDraws((currentDraws) =>
      currentDraws.map((draw) =>
        draw.id === drawId
          ? {
              ...draw,
              ...(review.note ? { requestReviewNote: review.note } : {}),
              requestStatus: review.status,
              reviewedAt: new Date().toISOString(),
            }
          : draw
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistReviewDrawRequest({
            drawKey: drawId,
            note: review.note,
            status: review.status,
          }),
        "draw review"
      );
    }
  };

  const reviewModificationRequest = (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => {
    setModificationRequests((currentRequests) =>
      currentRequests.map((candidate) =>
        candidate === request || candidate._id === request._id
          ? {
              ...candidate,
              ...(review.note ? { reviewNote: review.note } : {}),
              status: review.status,
            }
          : candidate
      )
    );

    if (review.status === "approved") {
      if (
        request.requestType === "createMilestone" &&
        request.requestedPayload?.milestone
      ) {
        const milestone = request.requestedPayload.milestone;
        const nextItem = timelineMilestonePayloadToItem(milestone, true);
        setItems((currentItems) =>
          normalizeMilestoneTimelineItems([...currentItems, nextItem])
        );
      }

      if (request.requestType === "deleteMilestone" && request.milestoneKey) {
        setItems((currentItems) =>
          currentItems.filter((item) => item.id !== request.milestoneKey)
        );
      }

      if (
        request.requestType === "updateMilestoneBudget" &&
        request.milestoneKey &&
        typeof request.requestedPayload?.budgetCents === "number"
      ) {
        const nextAmount = request.requestedPayload.budgetCents / 100;
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === request.milestoneKey && item.data
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    amount: nextAmount,
                  },
                }
              : item
          )
        );
      }
    }

    if (durablePlanId && request._id) {
      runDurableMutation(
        () =>
          persistReviewModificationRequest({
            note: review.note,
            requestId: request._id,
            status: review.status,
          }),
        "timeline modification review"
      );
    }
  };

  const reviewMilestoneCompletion = (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionReview: {
                  ...(review.note ? { note: review.note } : {}),
                  reviewedAt: new Date().toISOString(),
                  ...(item.data.completionReview?.siteVisit
                    ? { siteVisit: item.data.completionReview.siteVisit }
                    : {}),
                  status: review.status,
                },
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistReviewMilestoneCompletion({
            milestoneKey: itemId,
            note: review.note,
            status: review.status,
          }),
        "milestone review"
      );
    }
  };

  const requestMilestoneSiteVisit = (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionReview: {
                  ...(item.data.completionReview?.note
                    ? { note: item.data.completionReview.note }
                    : {}),
                  reviewedAt:
                    item.data.completionReview?.reviewedAt ??
                    new Date().toISOString(),
                  siteVisit: {
                    ...(request.includedItemIds
                      ? { includedItemIds: request.includedItemIds }
                      : {}),
                    ...(request.note ? { note: request.note } : {}),
                    requestedAt: new Date().toISOString(),
                    requestedDay: Math.max(0, Math.round(request.requestedDay)),
                    ...(request.status ? { status: request.status } : {}),
                    ...(request.tokenExpiresAt
                      ? { tokenExpiresAt: request.tokenExpiresAt }
                      : {}),
                    ...(request.url ? { url: request.url } : {}),
                    ...(request.visitId ? { visitId: request.visitId } : {}),
                  },
                  status:
                    item.data.completionReview?.status ?? "revisionRequested",
                },
              },
            }
          : item
      )
    );
  };
  const createMilestoneSiteVisit = persistence?.requestMilestoneSiteVisit
    ? (itemId: string, request: TimelineSiteVisitRequestInput) =>
        persistRequestMilestoneSiteVisit({
          includedMilestoneKeys: (request.includedItemIds ?? [itemId]).map(
            (includedItemId) =>
              resolveTimelinePersistenceSiteVisitMilestoneKey(
                includedItemId,
                workspaceMode
              )
          ),
          milestoneKey: resolveTimelinePersistenceSiteVisitMilestoneKey(
            itemId,
            workspaceMode
          ),
          note: request.note,
          requestedDay: request.requestedDay,
        })
    : undefined;
  const recordMilestoneSiteVisit = persistence?.recordMilestoneSiteVisit
    ? (itemId: string, request: TimelineSiteVisitRequestInput) =>
        persistRecordMilestoneSiteVisit({
          milestoneKey: resolveTimelinePersistenceSiteVisitMilestoneKey(
            itemId,
            workspaceMode
          ),
          note: request.note,
          status: request.status,
          visitId: request.visitId,
        })
    : undefined;

  const applyCapitalSpikeEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditPlanStructure) {
      toast.error("Proposal structure is locked after submission.");
      return;
    }
    if (!activeCapitalSpikeId) {
      return;
    }
    const targetSpike = capitalSpikes.find(
      (spike) => spike.id === activeCapitalSpikeId
    );
    if (!targetSpike) {
      return;
    }
    const isHomeEquityTakeout = targetSpike.eventKind === "homeEquityTakeout";

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      0,
      Math.round(
        Number(
          formData.get("capitalSpikeAmount") ?? capitalSpikeEditDraft.amount
        )
      )
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.min(
        resolvedRange.max,
        Math.round(
          Number(formData.get("capitalSpikeDate") ?? capitalSpikeEditDraft.x)
        )
      )
    );
    const nextLabel =
      String(
        formData.get("capitalSpikeLabel") ?? capitalSpikeEditDraft.label
      ).trim() || "Capital spike";
    const nextInterestAnnualBps = isHomeEquityTakeout
      ? Math.round(
          Number(
            formData.get("capitalSpikeInterestAnnualPercent") ??
              capitalSpikeEditDraft.interestAnnualPercent
          ) * 100
        )
      : undefined;

    if (
      !(
        Number.isFinite(nextAmount) &&
        Number.isFinite(nextX) &&
        (!isHomeEquityTakeout ||
          (nextAmount > 0 &&
            nextInterestAnnualBps !== undefined &&
            Number.isFinite(nextInterestAnnualBps) &&
            nextInterestAnnualBps >= 0 &&
            nextInterestAnnualBps <= 10_000))
      )
    ) {
      toast.error(
        isHomeEquityTakeout
          ? "Enter a positive takeout amount and an annual interest rate between 0% and 100%."
          : "Enter a valid capital event amount and date."
      );
      return;
    }

    setCapitalSpikes((currentSpikes) =>
      currentSpikes
        .map((spike) =>
          spike.id === activeCapitalSpikeId
            ? {
                ...spike,
                amount: nextAmount,
                ...(nextInterestAnnualBps === undefined
                  ? {}
                  : { interestAnnualBps: nextInterestAnnualBps }),
                label: nextLabel,
                x: nextX,
              }
            : spike
        )
        .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    );
    if (durablePlanId) {
      const mutationInput = {
        amountCents: dollarsToCents(nextAmount),
        capitalEventKey: activeCapitalSpikeId,
        eventKind: targetSpike.eventKind ?? "cost",
        ...(nextInterestAnnualBps === undefined
          ? {}
          : { interestAnnualBps: nextInterestAnnualBps }),
        label: nextLabel,
        order:
          capitalSpikes.findIndex(
            (spike) => spike.id === activeCapitalSpikeId
          ) + 1,
        x: nextX,
      };
      if (pendingCapitalEventIds.current.has(activeCapitalSpikeId)) {
        runDurableMutation(
          () => persistCreateCapitalEvent(mutationInput),
          "home equity takeout"
        );
        pendingCapitalEventIds.current.delete(activeCapitalSpikeId);
      } else {
        runDurableMutation(
          () => persistUpdateCapitalEvent(mutationInput),
          "capital event update"
        );
      }
    }
    setActiveCapitalSpikeId(null);
  };

  const cancelCapitalSpikeEdit = () => {
    if (
      activeCapitalSpikeId &&
      pendingCapitalEventIds.current.has(activeCapitalSpikeId)
    ) {
      pendingCapitalEventIds.current.delete(activeCapitalSpikeId);
      setCapitalSpikes((currentSpikes) =>
        currentSpikes.filter((spike) => spike.id !== activeCapitalSpikeId)
      );
    }
    setActiveCapitalSpikeId(null);
  };
  // --- Mobile (max-md) day dial + drawer handlers ------------------------
  const mobileFeedItems = useMemo(
    () => items.filter((item) => item.data),
    [items]
  );
  const handleMobileDayChange = useCallback(
    (day: number) => {
      const nextDay = clampNumber(
        Math.round(day),
        resolvedRange.min,
        resolvedRange.max
      );
      setSelectedDay(nextDay);
      setProgressValue(nextDay);
      setProbeValue(null);
      const activeMilestone = mobileFeedItems.find((item) => {
        const startDay = Math.round(item.x);
        const endDay = Math.round(getMilestoneEndX(item));
        return nextDay >= startDay && nextDay <= endDay;
      });
      if (activeMilestone) {
        setActiveSelection({
          itemId: activeMilestone.id,
          phase: "inProgress",
        });
      }
    },
    [mobileFeedItems, resolvedRange.max, resolvedRange.min]
  );
  const handleMobileOpenDraw = useCallback(
    (drawId: string) => {
      const owner = draws.find((draw) => draw.id === drawId);
      // Mirror desktop: inline timing/amount editing is available only when the
      // plan is not in live-execution mode. In live mode draws are requested or
      // reviewed through the action panel, not directly repositioned.
      if (canWriteLiveTimeline && !liveBuildMode) {
        setMobileEditDrawId(drawId);
        return;
      }
      setActiveDrawId(drawId);
      setActiveCapitalSpikeId(null);
      if (owner?.itemId) {
        setActiveSelection({ itemId: owner.itemId, phase: "inProgress" });
      }
      setMobileDetailDrawerRequested(true);
      setSelectedPanelOpen(true);
    },
    [canWriteLiveTimeline, draws, liveBuildMode]
  );
  const handleMobileOpenCapitalEvent = useCallback((capitalSpikeId: string) => {
    setActiveCapitalSpikeId(capitalSpikeId);
    setActiveDrawId(null);
    setMobileDetailDrawerRequested(true);
    setSelectedPanelOpen(true);
  }, []);
  const handleMobileOpenMilestoneDrawer = useCallback((itemId: string) => {
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setActiveSelection({ itemId, phase: "inProgress" });
    setMobileDetailDrawerRequested(true);
    setSelectedPanelOpen(true);
  }, []);
  const mobileEditDatesItem =
    items.find((item) => item.id === mobileEditDatesItemId) ?? null;
  const mobileEditBudgetItem =
    items.find((item) => item.id === mobileEditBudgetItemId) ?? null;
  const mobileEditDraw =
    draws.find((draw) => draw.id === mobileEditDrawId) ?? null;

  useEffect(() => {
    const onCursorChange = collaboration?.onCursorChange;
    if (!onCursorChange || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      onCursorChange({
        x: clampUnit(event.clientX / width),
        y: clampUnit(event.clientY / height),
      });
    };
    const clearCursor = () => onCursorChange(null);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearCursor();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("blur", clearCursor);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearCursor);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearCursor();
    };
  }, [collaboration?.onCursorChange]);

  const lenderLiveBuildHref = resolveDemoLiveBuildHref({
    buildKey: lenderApprovedBuildKey ?? durableMeta?.buildKey,
    liveBuildHref: durableMeta?.liveBuildHref,
  });
  const showLenderDealControls = Boolean(
    demoMode && durableMeta && timelineRole === "lender"
  );
  const showLenderApproveCta = Boolean(
    showLenderDealControls &&
      planStatus === "submitted" &&
      !lenderApprovedBuildKey
  );
  const hasLockedBannerActions = Boolean(lockedBannerActions);
  const showLenderLiveBuildLink = Boolean(
    showLenderDealControls &&
      lenderLiveBuildHref &&
      (planStatus === "approved" || lenderApprovedBuildKey)
  );

  if (!(share || setupComplete)) {
    return (
      <>
        {settingsFallbackActive ? <TimelineDemoSettingsNotice /> : null}
        <TimelineSetupFlow
          baseItems={INITIAL_ITEMS}
          onComplete={completeTimelineSetup}
          settingsTemplates={setupTemplates}
        />
      </>
    );
  }

  const WorkspaceRoot = embedded ? "section" : "main";

  return (
    <WorkspaceRoot
      aria-label={embedded ? "Proposal timeline preview" : undefined}
      className={cn(
        "min-w-0",
        embedded
          ? "bg-transparent px-0 py-0"
          : "min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_34%),linear-gradient(180deg,var(--background),var(--bg-base))]",
        !embedded &&
          (workspaceMode === "live" ? "px-0 py-0" : "px-0 py-0 sm:px-2 sm:py-1")
      )}
    >
      <motion.div
        animate="show"
        className={cn(
          "relative flex flex-col gap-1 sm:gap-6",
          embedded ? "w-full min-w-0" : "mx-auto max-w-full"
        )}
        data-testid="timeline-workspace-root"
        initial={prefersReducedMotion ? false : "hidden"}
        variants={{
          hidden: {},
          show: {
            transition: {
              delayChildren: 0.04,
              staggerChildren: 0.08,
            },
          },
        }}
      >
        <TimelineRemoteCursors cursors={collaboration?.cursors ?? []} />
        {settingsFallbackActive ? <TimelineDemoSettingsNotice /> : null}
        {durableMeta && readOnly ? (
          <div
            aria-label={`Timeline proposal is locked in ${planStatus} status`}
            className="rounded-lg border border-amber-300/60 bg-amber-100/80 p-2 text-amber-950 shadow-sm sm:p-4 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-50"
            data-ixc-ref={
              planStatus === "approved"
                ? "UI-APPROVED-BANNER"
                : planStatus === "archived"
                  ? "UI-ARCHIVED-BANNER"
                  : "UI-SUBMITTED-BANNER"
            }
            data-testid="timeline-locked-banner"
            role="status"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold">
                  {planStatus === "archived"
                    ? "Proposal archived"
                    : proposalMode &&
                        planStatus === "submitted" &&
                        hasLockedBannerActions
                      ? "Lender review decision"
                      : proposalMode && planStatus === "approved"
                        ? "Proposal approved"
                        : proposalMode && planStatus === "closed"
                          ? "Proposal moved to live build"
                          : "Submitted for lender review"}
                </p>
                <p className="mt-1 text-sm">
                  {proposalMode && planStatus === "approved"
                    ? "This reimbursement draw plan is approved and remains read-only until closing creates the active build."
                    : proposalMode && planStatus === "closed"
                      ? "Live execution now belongs to the active build workspace."
                      : proposalMode &&
                          planStatus === "submitted" &&
                          hasLockedBannerActions
                        ? "Review the reimbursement draw packet, record the audit reason, then approve, reject, or request changes."
                        : "This reimbursement draw plan is read-only while lender-admin review controls live in backoffice."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
                {lockedBannerActions}
                <Badge className="w-fit" variant="outline">
                  {planStatus}
                </Badge>
              </div>
            </div>
          </div>
        ) : null}
        {drawAvailabilityViolation ? (
          <Alert
            data-testid="timeline-draw-availability-warning"
            variant="warning"
          >
            <AlertTriangle aria-hidden />
            <AlertTitle>
              Generated draw schedule exceeds maximum availability
            </AlertTitle>
            <AlertDescription>
              {drawAvailabilityViolation.draw.label} schedules{" "}
              {money(drawAvailabilityViolation.draw.amount)} on day{" "}
              {drawAvailabilityViolation.draw.x}, but only{" "}
              {money(drawAvailabilityViolation.limit.availableLimit)} is
              unlocked after the {DEFAULT_DRAW_REVIEW_LAG_DAYS}-day review lag.
              Reduce or move this draw by{" "}
              {money(
                drawAvailabilityViolation.draw.amount -
                  drawAvailabilityViolation.limit.availableLimit
              )}
              .
            </AlertDescription>
          </Alert>
        ) : null}
        {showWorkspaceHeader ? (
          <motion.section
            className="timeline-route-header"
            variants={routeSectionVariants}
          >
            <div className="timeline-route-header__meta max-w-3xl">
              <div className="mb-1 flex items-center gap-2 overflow-x-auto pb-0.5 sm:mb-3 sm:flex-wrap sm:overflow-visible sm:pb-0">
                <Badge variant="success">
                  {liveBuildMode
                    ? "Live build"
                    : proposalMode
                      ? "Proposal mode"
                      : "Capital schedule"}
                </Badge>
                {durableMeta ? (
                  <>
                    <Badge
                      data-ixc-ref="UI-PROPOSAL-SHORT-LINK"
                      variant="outline"
                    >
                      ?proposal={durableMeta.proposalSlug}
                    </Badge>
                    <Badge variant="secondary">{durableMeta.status}</Badge>
                    <Badge
                      data-testid="timeline-durable-save-status"
                      variant={
                        durableSaveStatus === "error"
                          ? "destructive"
                          : durableSavePendingCount > 0
                            ? "warning"
                            : "outline"
                      }
                    >
                      {durableSavePendingCount > 0
                        ? "Saving"
                        : durableSaveStatus === "error"
                          ? "Unsaved changes"
                          : durableSaveStatus === "saved"
                            ? "Saved"
                            : "Ready"}
                    </Badge>
                    {durableSaveStatus === "error" ? (
                      <>
                        <Button
                          onClick={retryDurableMutation}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Retry save
                        </Button>
                        <span
                          aria-live="polite"
                          className="text-muted-foreground text-xs"
                          data-testid="timeline-durable-save-reference"
                        >
                          Changes remain local
                          {durableSaveReference
                            ? `. Reference ${durableSaveReference}.`
                            : "."}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : null}
                <ShareStatusBadges
                  loading={sharedSnapshotLoading}
                  missing={sharedSnapshotMissing}
                  share={share}
                />
              </div>
            </div>
            <div className="timeline-route-header__actions">
              {headerActions}
              {collaboration?.toolbar}
              {allowRoleSwitching ? (
                <TimelineRoleSwitcher
                  onRoleChange={setTimelineRole}
                  role={timelineRole}
                />
              ) : null}
              {showLenderApproveCta ? (
                <Button
                  data-testid="timeline-lender-approve-close"
                  disabled={lenderApprovalPending}
                  onClick={() => void approveAndCloseFromLenderDemo()}
                  size="sm"
                >
                  {lenderApprovalPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  Approve proposal and close deal
                </Button>
              ) : null}
              {showLenderLiveBuildLink && lenderLiveBuildHref ? (
                <Button
                  data-testid="timeline-lender-live-build-link"
                  render={<a href={lenderLiveBuildHref} />}
                  size="sm"
                  variant="secondary"
                >
                  <ExternalLink />
                  Open live build
                </Button>
              ) : null}
              {durableMeta ? (
                <>
                  {planStatus === "draft" ? (
                    <Button
                      data-ixc-ref="UI-SUBMIT-CTA"
                      data-testid="timeline-submit-proposal"
                      disabled={readOnly}
                      onClick={() => {
                        setSubmitError("");
                        setSubmitConfirmOpen(true);
                      }}
                      size="sm"
                    >
                      <ShieldCheck />
                      Submit Proposal
                    </Button>
                  ) : liveBuildMode ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Active build
                    </Button>
                  ) : proposalMode && planStatus === "approved" ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Approved proposal
                    </Button>
                  ) : proposalMode && planStatus === "closed" ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Closed proposal
                    </Button>
                  ) : (
                    <Button
                      aria-disabled="true"
                      data-ixc-ref="UI-LOCKED-SUBMIT"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Submitted
                    </Button>
                  )}
                  <Button
                    render={<a href={durableMeta.backofficeHref} />}
                    size="sm"
                    variant="outline"
                  >
                    <ExternalLink />
                    Backoffice
                  </Button>
                  <Button
                    data-ixc-ref="UI-PROPOSAL-SHORT-LINK"
                    render={<a href={durableMeta.proposalHref} />}
                    size="sm"
                  >
                    {liveBuildMode
                      ? "Build timeline link"
                      : proposalMode
                        ? "Builder proposal link"
                        : "Live proposal link"}
                  </Button>
                </>
              ) : null}
              <Button
                aria-disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                data-testid="timeline-optimize-scenario"
                disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                onClick={() => optimizeCurrentScenario()}
                size="sm"
                variant="secondary"
              >
                <Sparkles />
                Optimize scenario
              </Button>
              <Button
                aria-disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                data-testid="timeline-optimize-three-draw"
                disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                onClick={() => optimizeCurrentScenario(3)}
                size="sm"
                variant="secondary"
              >
                <CircleDollarSign />
                3-draw
              </Button>
              <ShareTimelineMenu {...shareMenuProps} />
              {share || durableMeta ? null : (
                <Button
                  data-testid="timeline-reconfigure-plan"
                  onClick={() => setSetupComplete(false)}
                  size="sm"
                  variant="outline"
                >
                  <ReceiptText />
                  Reconfigure budget
                </Button>
              )}
              <Button
                aria-disabled={!canEditPlanStructure}
                disabled={!canEditPlanStructure}
                onClick={resetCurrentTimeline}
                size="sm"
                variant="outline"
              >
                <RotateCcw />
                Reset
              </Button>
              <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm shadow-xs">
                <Switch
                  checked={straightLine}
                  disabled={readOnly}
                  onCheckedChange={setStraightLine}
                />
                Straight line
              </div>
              <TimelineCashflowToolbar
                metrics={[
                  {
                    label: "Probe",
                    testId: "timeline-cashflow-probe-day",
                    value:
                      probeValue === null
                        ? "Hover chart"
                        : `Day ${Math.round(probeValue)}`,
                  },
                  {
                    label: "Cash",
                    testId: "timeline-cashflow-probe-cash",
                    value:
                      probeCashOnHand === null ? "-" : money(probeCashOnHand),
                  },
                  {
                    label: "Interest paid",
                    testId: "timeline-cashflow-probe-interest-paid",
                    tone: "interest",
                    value:
                      probeInterestPaid === null
                        ? "-"
                        : money(probeInterestPaid),
                  },
                  {
                    label: "Ending cash",
                    testId: "timeline-cashflow-ending-cash",
                    value: money(endingCashOnHand),
                  },
                  {
                    label: "Total unlocked",
                    testId: "timeline-cashflow-total-unlocked",
                    tone: "info",
                    value: money(cashflowDrawPosition.totalUnlocked),
                  },
                  {
                    label: "Total drawn",
                    testId: "timeline-cashflow-total-drawn",
                    tone: "info",
                    value: money(cashflowDrawPosition.totalDrawn),
                  },
                  {
                    label: "Available",
                    testId: "timeline-cashflow-available-to-draw",
                    tone: "positive",
                    value: money(cashflowDrawPosition.availableToDraw),
                  },
                  {
                    label: "Lender cash",
                    testId: "timeline-cashflow-lender-cash-used",
                    tone: "info",
                    value: money(cashUseSummary.lenderCashUsed),
                  },
                  {
                    label: "Builder cash",
                    testId: "timeline-cashflow-builder-cash-used",
                    tone: "positive",
                    value: money(cashUseSummary.builderCashUsed),
                  },
                  {
                    label: "Construction interest",
                    testId: "timeline-cashflow-construction-interest",
                    tone: "interest",
                    value: money(
                      Number(
                        endingAvailability.constructionInterestAccrued ??
                          endingAvailability.totalInterestAccrued
                      )
                    ),
                  },
                  {
                    label: "Home equity interest",
                    testId: "timeline-cashflow-home-equity-interest",
                    tone: "interest",
                    value: money(
                      Number(endingAvailability.homeEquityInterestAccrued ?? 0)
                    ),
                  },
                  {
                    label: "Total interest",
                    testId: "timeline-cashflow-total-interest-paid",
                    tone: "interest",
                    value: money(endingAvailability.totalInterestAccrued),
                  },
                ]}
                warnings={cashShortfalls.map((point) => ({
                  dayLabel: formatTimelineDay(point.day),
                  id: `${point.day}-${point.milestone}`,
                  message: formatCashShortfallMessage(point),
                }))}
              />
            </div>
          </motion.section>
        ) : null}

        {submitConfirmOpen ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
            data-ixc-ref="SCREEN-SUBMIT-MODAL"
            data-testid="timeline-submit-confirm-modal"
            role="dialog"
          >
            <div className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">
                    Submit proposal to lender review?
                  </h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Submission freezes a review snapshot and locks builder edits
                    while lender staff review the reimbursement plan.
                  </p>
                </div>
              </div>
              {submitError ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                  {submitError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  data-ixc-ref="UI-SUBMIT-CANCEL"
                  disabled={submitPending}
                  onClick={() => setSubmitConfirmOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  data-ixc-ref="UI-SUBMIT-CONFIRM"
                  data-testid="timeline-submit-confirm"
                  disabled={submitPending}
                  onClick={() => void submitCurrentPlan()}
                >
                  {submitPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  Submit to lender
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <motion.div
          animate={{
            gridTemplateColumns:
              isCompactLayout || !selectedPanelOpen
                ? "minmax(0, 1fr) 0px"
                : "minmax(0, 1fr) 320px",
          }}
          className="grid min-w-0 gap-y-1 sm:gap-y-6 lg:items-start"
          data-testid="timeline-workspace-grid"
          style={{
            columnGap: isCompactLayout || !selectedPanelOpen ? 0 : 20,
          }}
          transition={{
            duration: 0.26,
            ease: [0.22, 1, 0.36, 1],
          }}
          variants={routeSectionVariants}
        >
          <div
            className="grid min-w-0 gap-1 overflow-x-clip"
            data-testid="timeline-workspace-main"
          >
            <ResponsiveAnalyticsDisclosure
              compact={isCompactLayout}
              label="Cash flow analytics"
            >
              <motion.section
                aria-label="Cash flow analytics detail"
                className="min-w-0 rounded-none border border-border border-x-0 bg-background/92 p-0 shadow-sm backdrop-blur sm:rounded-lg sm:border-x sm:px-4 sm:pt-4 sm:pb-1"
                data-ixc-ref={
                  statusReadOnly ? "UI-SUBMITTED-PANEL-CASHFLOW" : undefined
                }
                data-testid="timeline-cashflow-chart"
                id="timeline-submitted-panel-cashflow"
                variants={routeSectionVariants}
              >
                <div className="flex min-w-0 flex-col gap-1 sm:gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                      <Badge variant="outline">Controlled graph</Badge>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span
                        className="font-medium text-muted-foreground text-xs"
                        data-testid="timeline-cashflow-series-milestone-cost"
                      >
                        Milestone cost
                      </span>
                      <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" />
                      <span
                        className="font-medium text-muted-foreground text-xs"
                        data-testid="timeline-cashflow-series-cash-on-hand"
                      >
                        Cash on hand
                      </span>
                    </div>
                    <h2 className="font-semibold text-lg sm:text-xl">
                      Cash requirement vs draw recovery
                    </h2>
                  </div>
                  <div className="grid w-full min-w-0 max-w-full gap-1 sm:gap-3 lg:ml-auto lg:w-full lg:max-w-2xl 2xl:max-w-4xl">
                    <div className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1.5 sm:hidden">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Initial cash on hand
                      </p>
                      <p className="mt-1 font-semibold text-sm tabular-nums">
                        {money(startingCash)}
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 sm:hidden">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Minimum cash reserve
                      </p>
                      <p className="mt-1 font-semibold text-sm tabular-nums">
                        {money(minimumCashReserve)}
                      </p>
                    </div>
                    <div className="hidden gap-2 sm:ml-auto sm:grid sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label
                          className="text-xs"
                          htmlFor="timeline-starting-cash"
                        >
                          Initial cash on hand
                        </Label>
                        <Input
                          aria-disabled={!canEditPlanStructure}
                          data-testid="timeline-starting-cash-input"
                          disabled={!canEditPlanStructure}
                          id="timeline-starting-cash"
                          min={0}
                          nativeInput
                          onChange={(event) => {
                            const nextValue = Math.max(
                              0,
                              Math.round(Number(event.currentTarget.value))
                            );

                            if (Number.isFinite(nextValue)) {
                              setStartingCash(nextValue);
                            }
                          }}
                          size="sm"
                          step={5000}
                          type="number"
                          value={startingCash}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label
                          className="text-xs"
                          htmlFor="timeline-minimum-cash-reserve"
                        >
                          Minimum cash reserve
                        </Label>
                        <Input
                          aria-disabled={!canEditPlanStructure}
                          data-testid="timeline-minimum-cash-reserve-input"
                          disabled={!canEditPlanStructure}
                          id="timeline-minimum-cash-reserve"
                          min={0}
                          nativeInput
                          onChange={(event) => {
                            const nextValue = Math.max(
                              0,
                              Math.round(Number(event.currentTarget.value))
                            );

                            if (Number.isFinite(nextValue)) {
                              setMinimumCashReserve(nextValue);
                            }
                          }}
                          size="sm"
                          step={5000}
                          type="number"
                          value={minimumCashReserve}
                        />
                      </div>
                    </div>
                    <div
                      aria-label="Cash flow chart display controls"
                      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
                      role="group"
                    >
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-muted-foreground text-xs">
                        <Switch
                          checked={showCashflowWarnings}
                          data-testid="timeline-cashflow-warnings-toggle"
                          onCheckedChange={setShowCashflowWarnings}
                        />
                        Cash warnings
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-muted-foreground text-xs">
                        <Switch
                          checked={showCashflowHoverDetails}
                          data-testid="timeline-cashflow-hover-toggle"
                          onCheckedChange={(checked) => {
                            setShowCashflowHoverDetails(checked);

                            if (!checked) {
                              setProbeValue(null);
                            }
                          }}
                        />
                        Hover details
                      </label>
                    </div>
                  </div>
                </div>
                <TimelineCashflowCompoundChart
                  barSize={timelineSizing.barSize}
                  data={cashflowChartData}
                  hideTooltip={!showCashflowHoverDetails}
                  onHotspotDaySelect={handleChartHotspotDaySelect}
                  onProbeChange={
                    showCashflowHoverDetails ? setProbeValue : undefined
                  }
                  referenceLines={cashflowReferenceLines}
                  xDomain={[resolvedRange.min, resolvedRange.max]}
                  xTicks={cashflowTicks}
                  yAxisWidth={timelineSizing.yAxisWidth}
                  yDomain={[cashflowExtent.min, cashflowExtent.max]}
                />
              </motion.section>
            </ResponsiveAnalyticsDisclosure>

            <motion.section
              className="relative z-30 min-w-0 overflow-visible"
              data-ixc-ref={
                statusReadOnly ? "UI-SUBMITTED-PANEL-TIMELINE" : undefined
              }
              data-testid="timeline-roadmap-grid"
              id="timeline-submitted-panel-timeline"
              role={statusReadOnly ? "tabpanel" : undefined}
              variants={routeSectionVariants}
            >
              {isMobileDrawerLayout ? (
                <MobileTimelineDayDialWorkspace
                  capitalSpikes={capitalSpikes}
                  currentDay={currentDay}
                  draws={draws}
                  insertMenu={
                    canWriteLiveTimeline
                      ? {
                          milestoneLabel: liveBuildMode
                            ? "Request milestone"
                            : "Add milestone",
                          onAddCapitalSpike: addCapitalSpike,
                          onAddCashInfusion: addCashInfusion,
                          onAddDraw: addManualDraw,
                          onAddMilestone: liveBuildMode
                            ? requestMilestoneCreation
                            : canEditPlanStructure
                              ? addPlanMilestone
                              : undefined,
                        }
                      : undefined
                  }
                  items={mobileFeedItems}
                  onDayChange={handleMobileDayChange}
                  onOpenCapitalEvent={handleMobileOpenCapitalEvent}
                  onOpenDraw={handleMobileOpenDraw}
                  onOpenMilestone={handleMobileOpenMilestoneDrawer}
                  range={resolvedRange}
                  selectedDay={selectedDay}
                />
              ) : (
                <>
                  <AnimatedCurvedTimeline<DemoMilestone>
                    activeItemId={activeItemId}
                    activeItemPhase={
                      activeSelection.phase === "complete" ? "end" : "start"
                    }
                    cardWidth={timelineSizing.cardWidth}
                    className="min-w-0"
                    endCardWidth={timelineSizing.endCardWidth}
                    focusedMarkerId={
                      activeDrawId
                        ? `draw-${activeDrawId}`
                        : activeCapitalSpikeId
                          ? `capital-spike-${activeCapitalSpikeId}`
                          : null
                    }
                    formatValue={formatTimelineDay}
                    getItemEndValue={getMilestoneEndX}
                    hoverValue={probeValue}
                    insertion={
                      canWriteLiveTimeline
                        ? {
                            actions: [
                              ...(liveBuildMode
                                ? [
                                    {
                                      icon: (
                                        <Flag className="size-4 text-amber-500" />
                                      ),
                                      id: "request-milestone",
                                      label: "Request milestone",
                                      onSelect: ({ requestedX }) =>
                                        requestMilestoneCreation(requestedX),
                                    },
                                  ]
                                : []),
                              {
                                icon: (
                                  <CircleDollarSign className="size-4 text-rose-500" />
                                ),
                                id: "add-draw",
                                label: "Add draw",
                                onSelect: ({ requestedX }) =>
                                  addManualDraw(requestedX),
                              },
                              {
                                icon: (
                                  <AlertTriangle className="size-4 text-amber-500" />
                                ),
                                id: "add-capital-spike",
                                label: "Add capital spike",
                                onSelect: ({ requestedX }) =>
                                  addCapitalSpike(requestedX),
                              },
                              {
                                icon: (
                                  <Banknote className="size-4 text-emerald-600" />
                                ),
                                id: "add-cash-infusion",
                                label: "Add cash infusion",
                                onSelect: ({ requestedX }) =>
                                  addCashInfusion(requestedX),
                              },
                              ...(proposalMode
                                ? [
                                    {
                                      icon: (
                                        <House className="size-4 text-sky-600" />
                                      ),
                                      id: "add-home-equity-takeout",
                                      label: "Add Home Equity Takeout",
                                      onSelect: ({
                                        requestedX,
                                      }: {
                                        requestedX: number;
                                      }) => addHomeEquityTakeout(requestedX),
                                    },
                                  ]
                                : []),
                            ],
                            createItem: canEditPlanStructure
                              ? createInsertedMilestoneItem
                              : undefined,
                            label: liveBuildMode
                              ? "Request milestone"
                              : "Add milestone",
                            minGap: 14,
                            step: 1,
                          }
                        : undefined
                    }
                    items={timelineItemsForRender}
                    markerStackProximityPx={88}
                    markers={markers}
                    minInlineNodeSpacingPx={72}
                    minNodeSpacingPx={timelineSizing.minNodeSpacingPx}
                    onActiveItemChange={(item) => {
                      setActiveDrawId(null);
                      setActiveCapitalSpikeId(null);
                      setActiveSelection({
                        itemId: item.id,
                        phase: "inProgress",
                      });
                    }}
                    onEndNodeClick={(item) => {
                      setActiveDrawId(null);
                      setActiveCapitalSpikeId(null);
                      setActiveSelection({
                        itemId: item.id,
                        phase: "complete",
                      });
                      setProgressValue(getMilestoneEndX(item));
                      setSelectedPanelOpen(true);
                    }}
                    onHoverValueChange={setProbeValue}
                    onItemsChange={(nextItems, details) => {
                      if (!canEditPlanStructure) {
                        return;
                      }
                      const normalizedItems =
                        normalizeMilestoneTimelineItems(nextItems);
                      const expandedRange = expandTimelineRangeForMilestones(
                        normalizedItems,
                        details.range
                      );
                      const normalizedInsertedItem =
                        details.type === "insert"
                          ? normalizedItems.find(
                              (item) => item.id === details.insertedItem.id
                            )
                          : null;

                      if (normalizedInsertedItem) {
                        pendingNormalizedInsertSelection.current = {
                          itemId: normalizedInsertedItem.id,
                          x: normalizedInsertedItem.x,
                        };
                        setSelectedPanelOpen(true);
                      }

                      pendingExpandedRange.current = expandedRange;
                      setItems(normalizedItems);
                      setDraws((currentDraws) =>
                        syncDemoDrawsWithItems(
                          currentDraws,
                          normalizedItems,
                          expandedRange
                        )
                      );
                      if (durablePlanId) {
                        if (normalizedInsertedItem) {
                          runDurableMutation(
                            () =>
                              persistCreateMilestone({
                                milestone: timelineItemToMilestoneMutationInput(
                                  normalizedInsertedItem,
                                  normalizedItems.findIndex(
                                    (item) =>
                                      item.id === normalizedInsertedItem.id
                                  ) + 1
                                ),
                              }),
                            "milestone creation"
                          );
                        } else {
                          for (const [
                            index,
                            item,
                          ] of normalizedItems.entries()) {
                            runDurableMutation(
                              () =>
                                persistUpdateMilestone({
                                  ...timelineItemToMilestoneMutationInput(
                                    item,
                                    index + 1
                                  ),
                                }),
                              "milestone position"
                            );
                          }
                        }
                      }
                    }}
                    onProgressValueChange={(value, item) => {
                      const pendingSelection =
                        pendingNormalizedInsertSelection.current;

                      if (
                        pendingSelection &&
                        item?.id === pendingSelection.itemId
                      ) {
                        setActiveSelection({
                          itemId: pendingSelection.itemId,
                          phase: "inProgress",
                        });
                        setProgressValue(pendingSelection.x);
                        pendingNormalizedInsertSelection.current = null;
                        return;
                      }

                      setProgressValue(value);
                    }}
                    onRangeChange={(nextRange) => {
                      if (!canEditPlanStructure) {
                        return;
                      }
                      const expandedRange = pendingExpandedRange.current;
                      pendingExpandedRange.current = null;
                      setRange(
                        expandedRange ??
                          expandTimelineRangeForMilestones(items, nextRange)
                      );
                    }}
                    paddingX={timelineSizing.paddingX}
                    pixelsPerUnit={timelineSizing.pixelsPerUnit}
                    progressValue={progressValue}
                    range={range}
                    renderCard={(item, context) => (
                      <TimelineDeleteContextMenu
                        canDelete={canEditPlanStructure || liveBuildMode}
                        deleteDescription={
                          liveBuildMode
                            ? "Create an admin-reviewed deletion request"
                            : "Delete this milestone"
                        }
                        deleteDisabledReason={
                          liveBuildMode
                            ? "Request deletion for admin approval."
                            : "Proposal structure is locked after submission."
                        }
                        deleteLabel={
                          liveBuildMode
                            ? "Request deletion"
                            : "Remove milestone"
                        }
                        kind="milestone"
                        onDelete={() => deleteMilestone(item.id)}
                      >
                        <div className="relative">
                          <MilestoneRequestBadges
                            currentAmount={item.data?.amount}
                            deleteRequested={requestedDeletionByMilestone.has(
                              item.id
                            )}
                            isRequestedCreate={item.id.startsWith("requested-")}
                            requestedAmount={requestedBudgetByMilestone.get(
                              item.id
                            )}
                          />
                          <MilestoneCard
                            active={context.active}
                            complete={hasCompletionClaim(item)}
                            item={item}
                            onUpdate={updateMilestone}
                            readOnly={!canWriteLiveTimeline || item.disabled}
                            reducedMotion={Boolean(prefersReducedMotion)}
                          />
                        </div>
                      </TimelineDeleteContextMenu>
                    )}
                    renderEndNode={(item, context) => (
                      <TimelineEndNodeButton
                        active={context.active}
                        complete={hasCompletionClaim(item)}
                        item={item}
                        onClick={() => {
                          context.activate();
                          setActiveDrawId(null);
                          setActiveCapitalSpikeId(null);
                          setSelectedPanelOpen(true);
                        }}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    )}
                    renderMarker={(marker) => {
                      const drawId = marker.id.startsWith("draw-")
                        ? marker.id.slice("draw-".length)
                        : null;
                      const capitalSpikeId = marker.id.startsWith(
                        "capital-spike-"
                      )
                        ? marker.id.slice("capital-spike-".length)
                        : null;
                      const draw = drawId
                        ? draws.find((candidate) => candidate.id === drawId)
                        : null;
                      const capitalSpike = capitalSpikeId
                        ? capitalSpikes.find(
                            (candidate) => candidate.id === capitalSpikeId
                          )
                        : null;

                      if (!draw) {
                        if (capitalSpike) {
                          return (
                            <TimelineDeleteContextMenu
                              canDelete={
                                canWriteLiveTimeline &&
                                !(
                                  liveBuildMode &&
                                  capitalSpike.eventKind === "homeEquityTakeout"
                                )
                              }
                              deleteDisabledReason="Timeline is locked in this status."
                              deleteLabel={
                                capitalSpike.eventKind === "cashInfusion"
                                  ? "Remove cash infusion"
                                  : capitalSpike.eventKind ===
                                      "homeEquityTakeout"
                                    ? "Remove Home Equity Takeout"
                                    : "Remove capital cost"
                              }
                              kind="capitalSpike"
                              onDelete={() =>
                                deleteCapitalSpike(capitalSpike.id)
                              }
                            >
                              <CapitalSpikeTimelineMarker
                                active={
                                  capitalSpike.id === activeCapitalSpikeId
                                }
                                draft={capitalSpikeEditDraft}
                                maxDay={resolvedRange.max}
                                onApply={applyCapitalSpikeEdit}
                                onCancel={cancelCapitalSpikeEdit}
                                onDraftChange={setCapitalSpikeEditDraft}
                                onOpen={() => {
                                  if (
                                    canWriteLiveTimeline &&
                                    !(
                                      liveBuildMode &&
                                      capitalSpike.eventKind ===
                                        "homeEquityTakeout"
                                    )
                                  ) {
                                    openCapitalSpikeEditor(capitalSpike);
                                  }
                                }}
                                reducedMotion={Boolean(prefersReducedMotion)}
                                spike={capitalSpike}
                              />
                            </TimelineDeleteContextMenu>
                          );
                        }
                        return <TimelineMarkerBadge marker={marker} />;
                      }

                      return (
                        <TimelineDeleteContextMenu
                          canDelete={
                            canWriteLiveTimeline &&
                            draw.requestStatus !== "approved"
                          }
                          deleteDescription="Delete this draw marker"
                          deleteDisabledReason={
                            canWriteLiveTimeline
                              ? "Approved reimbursement draws cannot be deleted."
                              : "Timeline is locked in this status."
                          }
                          kind="draw"
                          onDelete={() => deleteDraw(draw.id)}
                        >
                          <DrawTimelineMarker
                            active={draw.id === activeDrawId}
                            availableAmount={getMaxSchedulableDrawAmount(
                              Math.round(
                                Number(
                                  draw.id === activeDrawId
                                    ? drawEditDraft.x
                                    : draw.x
                                )
                              ) || draw.x,
                              items,
                              draws,
                              {
                                excludeDrawId: draw.id,
                                proposedDrawId: draw.id,
                              },
                              approvedDrawLimit
                            )}
                            currentDay={currentDay}
                            draft={drawEditDraft}
                            draw={draw}
                            inlineEditorEnabled={!liveBuildMode}
                            onApply={applyDrawEdit}
                            onCancel={() => setActiveDrawId(null)}
                            onDraftChange={(draft) => {
                              setDrawEditDraft(draft);
                              const nextDay = Math.round(Number(draft.x));
                              if (Number.isFinite(nextDay)) {
                                setProbeValue(nextDay);
                              }
                            }}
                            onOpen={() => openDrawEditor(draw)}
                            reducedMotion={Boolean(prefersReducedMotion)}
                          />
                        </TimelineDeleteContextMenu>
                      );
                    }}
                    renderNode={(item, context) => (
                      <TimelineDeleteContextMenu
                        canDelete={canEditPlanStructure || liveBuildMode}
                        deleteDescription={
                          liveBuildMode
                            ? "Create an admin-reviewed deletion request"
                            : "Delete this milestone"
                        }
                        deleteDisabledReason={
                          liveBuildMode
                            ? "Request deletion for admin approval."
                            : "Proposal structure is locked after submission."
                        }
                        deleteLabel={
                          liveBuildMode
                            ? "Request deletion"
                            : "Remove milestone"
                        }
                        kind="milestone"
                        onDelete={() => deleteMilestone(item.id)}
                      >
                        <TimelineNodeButton
                          active={context.active}
                          complete={hasCompletionClaim(item)}
                          item={item}
                          onClick={() => {
                            context.activate();
                            setActiveDrawId(null);
                            setActiveCapitalSpikeId(null);
                            setActiveSelection({
                              itemId: item.id,
                              phase: "inProgress",
                            });
                            setProgressValue(item.x);
                            setSelectedPanelOpen(true);
                          }}
                          onDoubleClick={() => setSelectedPanelOpen(false)}
                          reducedMotion={Boolean(prefersReducedMotion)}
                        />
                      </TimelineDeleteContextMenu>
                    )}
                    straightLine={straightLine}
                  />
                </>
              )}
            </motion.section>

            <SelectedDrawMobileDrawer
              activeDraw={activeItemDraw}
              activeItem={activeItem}
              activePanelDraw={activePanelDraw}
              activePanelDrawItem={activePanelDrawItem}
              addEvidenceFiles={addEvidenceFiles}
              canApproveMilestoneCompletion={canApproveMilestoneCompletion}
              contractorPlanning={contractorPlanning}
              drawAvailabilityData={drawAvailabilityData}
              draws={draws}
              items={items}
              liveExecutionEnabled={canUseLiveExecution}
              modificationRequests={modificationRequests}
              onCompleteMilestone={completeMilestone}
              onCreateMilestoneSiteVisit={createMilestoneSiteVisit}
              onOpenChange={(open) => {
                setSelectedPanelOpen(open);
                if (!open) {
                  setMobileDetailDrawerRequested(false);
                }
              }}
              onRecordMilestoneSiteVisit={recordMilestoneSiteVisit}
              onRemoveEvidenceAsset={removeEvidenceAsset}
              onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
              onReviewDrawRequest={reviewDrawRequest}
              onReviewMilestoneCompletion={reviewMilestoneCompletion}
              onReviewModificationRequest={reviewModificationRequest}
              onSubmitDrawRequest={submitDrawRequest}
              onUpdateEvidenceAsset={updateEvidenceAsset}
              onUpdateMilestoneDrawAvailability={
                canWriteLiveTimeline && !liveBuildMode
                  ? (itemId, amount) =>
                      updateMilestone(itemId, {
                        drawAvailabilityAmount: amount,
                      })
                  : undefined
              }
              onUpdatePlannedDraw={updatePlannedDraw}
              onUpdateSubmilestoneBudget={
                canWriteLiveTimeline && !liveBuildMode
                  ? updateSubmilestoneBudget
                  : undefined
              }
              onUpdateSubmilestoneDuration={
                canWriteLiveTimeline && !liveBuildMode
                  ? updateSubmilestoneDuration
                  : undefined
              }
              open={
                Boolean(activeItem) &&
                selectedPanelOpen &&
                isMobileDrawerLayout &&
                mobileDetailDrawerRequested
              }
              overview={financialOverview}
              range={resolvedRange}
              requiresApprovedDrawMilestones={liveBuildMode}
              role={timelineRole}
            />
            <EditDatesSheet
              item={mobileEditDatesItem}
              onClose={() => setMobileEditDatesItemId(null)}
              onCommit={(itemId, patch) => updateMilestone(itemId, patch)}
            />
            <EditBudgetSheet
              item={mobileEditBudgetItem}
              onClose={() => setMobileEditBudgetItemId(null)}
              onCommit={(itemId, patch) => updateMilestone(itemId, patch)}
            />
            <EditDrawSheet
              draw={mobileEditDraw}
              onClose={() => setMobileEditDrawId(null)}
              onCommit={(drawId, patch) => updatePlannedDraw(drawId, patch)}
            />
            <DeleteSheet
              description={
                mobileDeleteTarget?.kind === "draw"
                  ? "Delete this draw marker."
                  : liveBuildMode
                    ? "Create an admin-reviewed deletion request for this milestone."
                    : "Delete this milestone from the plan."
              }
              onClose={() => setMobileDeleteTarget(null)}
              onConfirm={(id) => {
                if (mobileDeleteTarget?.kind === "draw") {
                  deleteDraw(id);
                } else {
                  deleteMilestone(id);
                }
              }}
              requireReason={liveBuildMode}
              target={mobileDeleteTarget}
              title={
                mobileDeleteTarget?.kind === "draw"
                  ? "Delete draw"
                  : liveBuildMode
                    ? "Request milestone deletion"
                    : "Delete milestone"
              }
            />

            <ResponsiveAnalyticsDisclosure
              compact={isCompactLayout}
              label="Draw availability analytics"
            >
              <motion.section
                aria-label="Draw availability analytics detail"
                className="relative z-0 min-w-0 rounded-none border border-border border-x-0 bg-background/92 p-0 shadow-sm backdrop-blur sm:rounded-lg sm:border-x sm:px-4 sm:pt-1 sm:pb-4"
                data-ixc-ref={
                  statusReadOnly ? "UI-SUBMITTED-PANEL-DRAWS" : undefined
                }
                data-testid="timeline-draw-availability-chart"
                id="timeline-submitted-panel-draws"
                variants={routeSectionVariants}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                    <Badge variant="outline">Draw availability</Badge>
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    <span
                      className="font-medium text-muted-foreground text-xs"
                      data-testid="timeline-draw-series-interest-bearing"
                    >
                      Interest-bearing draw
                    </span>
                    <span className="ml-2 h-2 w-2 rounded-full bg-sky-500" />
                    <span
                      className="font-medium text-muted-foreground text-xs"
                      data-testid="timeline-draw-series-additional-available"
                    >
                      Additional available draw
                    </span>
                  </div>
                  <div>
                    {/*<h2 className="font-semibold text-xl">Draw capacity envelope</h2>*/}
                    {/*<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Top line is interest-bearing principal plus available draw;
                lower line is interest-bearing principal.
              </p>*/}
                  </div>
                </div>
                <TimelineDrawAvailabilityChart
                  data={drawAvailabilityChartData}
                  formatMoney={formatCompactMoney}
                  formatTimelineDay={formatTimelineDay}
                  onProbeChange={setProbeValue}
                  referenceLines={drawAvailabilityReferenceLines}
                  xDomain={[resolvedRange.min, resolvedRange.max]}
                  xTicks={cashflowTicks}
                  yAxisWidth={timelineSizing.yAxisWidth}
                  yDomain={[0, drawAvailabilityExtent.max]}
                />
                <DrawAvailabilityMetrics
                  endingAvailability={endingAvailability}
                  probeDrawAvailability={probeDrawAvailability}
                />
                <DrawAvailabilityDeltaReadout
                  probeDrawAvailability={probeDrawAvailability}
                />
              </motion.section>
            </ResponsiveAnalyticsDisclosure>
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {selectedPanelOpen && !isCompactLayout ? (
              <motion.aside
                animate={{
                  filter: "blur(0px)",
                  opacity: 1,
                }}
                className="sticky top-14 z-20 h-[calc(100svh-3.5rem-1rem)] max-h-[calc(100svh-3.5rem-1rem)] min-w-0 self-start overflow-hidden rounded-lg border border-border bg-background/94 shadow-sm backdrop-blur supports-[height:100dvh]:h-[calc(100dvh-3.5rem-1rem)] supports-[height:100dvh]:max-h-[calc(100dvh-3.5rem-1rem)]"
                data-testid="selected-draw-panel"
                exit={{
                  filter: "blur(4px)",
                  opacity: 0,
                }}
                initial={{
                  filter: "blur(4px)",
                  opacity: 0,
                }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="h-full overflow-y-auto p-3 sm:p-4">
                  {activeItem ? (
                    <SelectedContextPanel
                      activeDraw={activeItemDraw}
                      activeItem={activeItem}
                      activePanelDraw={activePanelDraw}
                      activePanelDrawItem={activePanelDrawItem}
                      addEvidenceFiles={addEvidenceFiles}
                      canApproveMilestoneCompletion={
                        canApproveMilestoneCompletion
                      }
                      contractorPlanning={contractorPlanning}
                      drawAvailabilityData={drawAvailabilityData}
                      draws={draws}
                      items={items}
                      liveExecutionEnabled={canUseLiveExecution}
                      modificationRequests={modificationRequests}
                      onCompleteMilestone={completeMilestone}
                      onCreateMilestoneSiteVisit={createMilestoneSiteVisit}
                      onRecordMilestoneSiteVisit={recordMilestoneSiteVisit}
                      onRemoveEvidenceAsset={removeEvidenceAsset}
                      onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
                      onReviewDrawRequest={reviewDrawRequest}
                      onReviewMilestoneCompletion={reviewMilestoneCompletion}
                      onReviewModificationRequest={reviewModificationRequest}
                      onSubmitDrawRequest={submitDrawRequest}
                      onUpdateEvidenceAsset={updateEvidenceAsset}
                      onUpdateMilestoneDrawAvailability={
                        canWriteLiveTimeline && !liveBuildMode
                          ? (itemId, amount) =>
                              updateMilestone(itemId, {
                                drawAvailabilityAmount: amount,
                              })
                          : undefined
                      }
                      onUpdatePlannedDraw={updatePlannedDraw}
                      onUpdateSubmilestoneBudget={
                        canWriteLiveTimeline && !liveBuildMode
                          ? updateSubmilestoneBudget
                          : undefined
                      }
                      onUpdateSubmilestoneDuration={
                        canWriteLiveTimeline && !liveBuildMode
                          ? updateSubmilestoneDuration
                          : undefined
                      }
                      overview={financialOverview}
                      range={resolvedRange}
                      requiresApprovedDrawMilestones={liveBuildMode}
                      role={timelineRole}
                    />
                  ) : null}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </WorkspaceRoot>
  );
}

function ResponsiveAnalyticsDisclosure({
  children,
  compact,
  label,
}: {
  children: ReactNode;
  compact: boolean;
  label: string;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const contentId = `timeline-${label.toLowerCase().replace(/\s+/g, "-")}-content`;

  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);

  if (!compact) {
    return children;
  }

  return (
    <section
      aria-label={`${label} disclosure`}
      className="min-w-0 px-2 sm:px-0"
    >
      <Button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="min-h-11 w-full justify-between"
        onClick={() => setExpanded((current) => !current)}
        type="button"
        variant="outline"
      >
        {label}
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          {expanded ? "Hide" : "Show"}
        </span>
      </Button>
      <div className="mt-2 min-w-0" hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}

function TimelineRemoteCursors({
  cursors,
}: {
  cursors: TimelineWorkspaceRemoteCursor[];
}) {
  const activeCursors = cursors.filter(
    (
      cursor
    ): cursor is TimelineWorkspaceRemoteCursor & {
      cursor: { x: number; y: number };
    } => Boolean(cursor.cursor)
  );

  if (activeCursors.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="timeline-remote-cursors"
    >
      {activeCursors.map((cursor) => {
        const color = cursor.color ?? "oklch(0.54 0.14 240)";
        return (
          <TimelineRemoteCursorMarker
            color={color}
            cursor={cursor.cursor}
            key={cursor.userId}
            name={cursor.name}
          />
        );
      })}
    </div>
  );
}

function TimelineRemoteCursorMarker({
  color,
  cursor,
  name,
}: {
  color: string;
  cursor: { x: number; y: number };
  name: string;
}) {
  const reducedMotion = useReducedMotion();
  const left = `${clampUnit(cursor.x) * 100}%`;
  const top = `${clampUnit(cursor.y) * 100}%`;

  return (
    <motion.div
      animate={{ left, top }}
      className="absolute -translate-x-1 -translate-y-1"
      initial={false}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { bounce: 0, damping: 42, stiffness: 520, type: "spring" }
      }
    >
      <div
        className="drop-shadow-sm"
        data-testid="timeline-remote-cursor-pointer"
        style={{ color }}
      >
        <CursorPointer />
      </div>
      <div
        className="absolute top-4 left-[18px] rounded-lg px-2 py-1 font-medium text-[11px] text-white shadow-lg"
        data-testid="timeline-remote-cursor-label"
        style={{ backgroundColor: color }}
      >
        <span className="block whitespace-nowrap">{name}</span>
      </div>
    </motion.div>
  );
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

interface CounterRef {
  current: number;
}

interface UseTimelineSnapshotSharingArgs {
  activeSelection: ActiveMilestoneSelection;
  approvedDrawLimit?: number;
  capitalSpikeInsertionCount: CounterRef;
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  drawInsertionCount: CounterRef;
  draws: DemoDraw[];
  insertionCount: CounterRef;
  interestAnnualBps: number;
  items: TimelineItem<DemoMilestone>[];
  minimumCashReserve: number;
  progressValue: number;
  resolvedRange: Required<TimelineRange>;
  selectedPanelOpen: boolean;
  setActiveCapitalSpikeId: (value: string | null) => void;
  setActiveDrawId: (value: string | null) => void;
  setActiveSelection: (value: ActiveMilestoneSelection) => void;
  setApprovedDrawLimit: (value: number | undefined) => void;
  setCapitalSpikeEditDraft: (value: CapitalSpikeEditDraft) => void;
  setCapitalSpikes: Dispatch<SetStateAction<DemoCapitalSpike[]>>;
  setCurrentDay: (value: number) => void;
  setDrawEditDraft: (value: DrawEditDraft) => void;
  setDraws: (value: DemoDraw[]) => void;
  setInterestAnnualBps: (value: number) => void;
  setItems: (value: TimelineItem<DemoMilestone>[]) => void;
  setMinimumCashReserve: (value: number) => void;
  setProbeValue: (value: number | null) => void;
  setProgressValue: (value: number) => void;
  setRange: (value: TimelineRange) => void;
  setSelectedDay: (value: number) => void;
  setSelectedPanelOpen: (value: boolean) => void;
  setStartingCash: (value: number) => void;
  setStraightLine: (value: boolean) => void;
  shareUrlPath: string;
  startingCash: number;
  straightLine: boolean;
}

interface ShareTimelineMenuProps {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}

export function normalizeTimelineProbeValue(value: number | null) {
  if (value === null) {
    return null;
  }

  return Number.isFinite(value) ? Math.round(value) : null;
}

function useTimelineProbeState() {
  const [probeValue, setProbeValueState] = useState<number | null>(null);
  const committedValueRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const commitProbeValue = useCallback((value: number | null) => {
    const nextValue = normalizeTimelineProbeValue(value);
    if (committedValueRef.current === nextValue) {
      return;
    }

    committedValueRef.current = nextValue;
    setProbeValueState(nextValue);
  }, []);

  const setProbeValue = useCallback(
    (value: number | null) => {
      const nextValue = normalizeTimelineProbeValue(value);
      pendingValueRef.current = nextValue;

      if (nextValue === null) {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        commitProbeValue(null);
        return;
      }

      if (committedValueRef.current === nextValue) {
        return;
      }

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const pendingValue = pendingValueRef.current;
        pendingValueRef.current = null;
        commitProbeValue(pendingValue);
      });
    },
    [commitProbeValue]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    },
    []
  );

  return [probeValue, setProbeValue] as const;
}

function TimelineDemoSettingsNotice() {
  return (
    <div
      className="mx-auto mb-4 max-w-full rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid="timeline-demo-config-notice"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <strong>Timeline settings missing</strong>
          <p className="mt-1 text-fg-secondary">
            {TIMELINE_DEMO_SETTINGS_MISSING_NOTICE}
          </p>
        </div>
      </div>
    </div>
  );
}

function ShareStatusBadges({
  loading,
  missing,
  share,
}: {
  loading: boolean;
  missing: boolean;
  share: string | null;
}) {
  if (loading) {
    return <Badge variant="outline">Loading shared snapshot</Badge>;
  }

  if (missing) {
    return <Badge variant="destructive">Share not found</Badge>;
  }

  if (share) {
    return <Badge variant="outline">Shared fork</Badge>;
  }

  return null;
}

function useTimelineSnapshotSharing({
  activeSelection,
  approvedDrawLimit,
  capitalSpikeInsertionCount,
  capitalSpikes,
  currentDay,
  drawInsertionCount,
  draws,
  interestAnnualBps,
  insertionCount,
  items,
  progressValue,
  resolvedRange,
  selectedPanelOpen,
  shareUrlPath,
  setActiveCapitalSpikeId,
  setActiveDrawId,
  setActiveSelection,
  setCapitalSpikeEditDraft,
  setCapitalSpikes,
  setCurrentDay,
  setDrawEditDraft,
  setDraws,
  setInterestAnnualBps,
  setItems,
  setProbeValue,
  setProgressValue,
  setRange,
  setSelectedDay,
  setSelectedPanelOpen,
  setApprovedDrawLimit,
  setMinimumCashReserve,
  setStartingCash,
  setStraightLine,
  minimumCashReserve,
  startingCash,
  straightLine,
}: UseTimelineSnapshotSharingArgs) {
  const [{ share }, setTimelineSearch] = useQueryStates(
    timelineWorkspaceSearchParsers
  );
  const shareHydrationEnabled = isCurrentTimelineSharePath(shareUrlPath);
  const hydratedShare = shareHydrationEnabled ? share : null;
  const createTimelineSnapshot = useMutation(
    api.demo_timeline_snapshots.demo_createTimelineSnapshot
  );
  const sharedSnapshot = useQuery(
    api.demo_timeline_snapshots.demo_getTimelineSnapshot,
    hydratedShare && !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? { snapshotId: hydratedShare }
      : "skip"
  );
  const hydratedShareId = useRef<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const initialShareState = useMemo(
    () =>
      initialTimelineShareState(
        NORMALIZED_INITIAL_ITEMS,
        buildDemoDraws(NORMALIZED_INITIAL_ITEMS, INITIAL_RANGE),
        INITIAL_CAPITAL_SPIKES,
        INITIAL_RANGE,
        { itemId: "rough-in", phase: "inProgress" },
        66,
        INITIAL_CURRENT_DAY,
        true,
        STARTING_CASH,
        true,
        0
      ),
    []
  );

  const applyShareState = useCallback(
    (nextState: TimelineShareState) => {
      const hydratedState = normalizeTimelineShareStateForRoute(nextState);

      setItems(hydratedState.items);
      setDraws(hydratedState.draws);
      setCapitalSpikes(hydratedState.capitalSpikes);
      setRange(hydratedState.range);
      setActiveSelection(hydratedState.activeSelection);
      setCurrentDay(hydratedState.currentDay);
      setSelectedDay(hydratedState.progressValue);
      setProgressValue(hydratedState.progressValue);
      setProbeValue(null);
      setActiveDrawId(null);
      setActiveCapitalSpikeId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setCapitalSpikeEditDraft({
        amount: "",
        interestAnnualPercent: "",
        label: "",
        x: "",
      });
      setSelectedPanelOpen(hydratedState.selectedPanelOpen);
      setApprovedDrawLimit(hydratedState.approvedDrawLimit);
      setInterestAnnualBps(
        normalizeInterestAnnualBps(hydratedState.interestAnnualBps)
      );
      setMinimumCashReserve(hydratedState.minimumCashReserve);
      setStartingCash(hydratedState.startingCash);
      setStraightLine(hydratedState.straightLine);
      insertionCount.current = countInsertedTimelineItems(hydratedState.items);
      drawInsertionCount.current = countManualDraws(hydratedState.draws);
      capitalSpikeInsertionCount.current = hydratedState.capitalSpikes.length;
    },
    [
      capitalSpikeInsertionCount,
      drawInsertionCount,
      insertionCount,
      setActiveCapitalSpikeId,
      setActiveDrawId,
      setActiveSelection,
      setCapitalSpikeEditDraft,
      setCapitalSpikes,
      setCurrentDay,
      setDrawEditDraft,
      setDraws,
      setInterestAnnualBps,
      setItems,
      setProbeValue,
      setProgressValue,
      setRange,
      setSelectedDay,
      setSelectedPanelOpen,
      setApprovedDrawLimit,
      setMinimumCashReserve,
      setStartingCash,
      setStraightLine,
    ]
  );

  useEffect(() => {
    if (!hydratedShare) {
      hydratedShareId.current = null;
      return;
    }

    setShareUrl(buildTimelineShareUrl(hydratedShare, shareUrlPath));
  }, [hydratedShare, shareUrlPath]);

  useEffect(() => {
    if (
      !(
        hydratedShare?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        hydratedShareId.current !== hydratedShare
      )
    ) {
      return;
    }

    const storedSnapshot = readLocalTimelineSnapshot(hydratedShare);
    if (storedSnapshot) {
      applyShareState(
        applyTimelineShareSnapshotV2(storedSnapshot, initialShareState)
      );
      hydratedShareId.current = hydratedShare;
    }
  }, [applyShareState, hydratedShare, initialShareState]);

  useEffect(() => {
    if (
      !(
        hydratedShare &&
        sharedSnapshot &&
        hydratedShareId.current !== hydratedShare
      )
    ) {
      return;
    }

    applyShareState(
      applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState)
    );
    hydratedShareId.current = hydratedShare;
  }, [applyShareState, hydratedShare, initialShareState, sharedSnapshot]);

  const resetTimeline = useCallback(() => {
    const localSnapshot = hydratedShare?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? readLocalTimelineSnapshot(hydratedShare)
      : null;
    const nextState = localSnapshot
      ? applyTimelineShareSnapshotV2(localSnapshot, initialShareState)
      : hydratedShare && sharedSnapshot
        ? applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState)
        : initialShareState;

    applyShareState(nextState);
  }, [applyShareState, hydratedShare, initialShareState, sharedSnapshot]);

  const createShareSnapshot = useCallback(async () => {
    setShareOpen(true);
    setShareCreating(true);
    setShareCopied(false);
    setShareError(null);

    try {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        approvedDrawLimit,
        capitalSpikes,
        currentDay,
        draws,
        interestAnnualBps,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        minimumCashReserve,
        startingCash,
        straightLine,
      });
      const snapshotId = await createTimelineSnapshot({ snapshot });
      const nextShareUrl = buildTimelineShareUrl(snapshotId, shareUrlPath);

      if (shareHydrationEnabled) {
        await setTimelineSearch({ share: snapshotId });
      }
      setShareUrl(nextShareUrl);
    } catch {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        approvedDrawLimit,
        capitalSpikes,
        currentDay,
        draws,
        interestAnnualBps,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        minimumCashReserve,
        startingCash,
        straightLine,
      });
      const localShareId = `${LOCAL_TIMELINE_SHARE_PREFIX}${Date.now().toString(
        36
      )}`;
      writeLocalTimelineSnapshot(localShareId, snapshot);
      if (shareHydrationEnabled) {
        await setTimelineSearch({ share: localShareId });
      }
      setShareUrl(buildTimelineShareUrl(localShareId, shareUrlPath));
      setShareError(null);
    } finally {
      setShareCreating(false);
    }
  }, [
    activeSelection,
    approvedDrawLimit,
    capitalSpikes,
    createTimelineSnapshot,
    currentDay,
    draws,
    interestAnnualBps,
    items,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setTimelineSearch,
    shareUrlPath,
    shareHydrationEnabled,
    minimumCashReserve,
    startingCash,
    straightLine,
  ]);

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Unable to copy the link."
      );
    }
  }, [shareUrl]);

  return {
    resetTimeline,
    share: hydratedShare,
    sharedSnapshotLoading: Boolean(
      hydratedShare &&
        !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        sharedSnapshot === undefined
    ),
    sharedSnapshotMissing: Boolean(
      hydratedShare &&
        !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        sharedSnapshot === null
    ),
    shareMenuProps: {
      copied: shareCopied,
      error: shareError,
      loading: shareCreating,
      onCopy: copyShareUrl,
      onCreate: createShareSnapshot,
      onOpenChange: setShareOpen,
      open: shareOpen,
      shareUrl,
    } satisfies ShareTimelineMenuProps,
  };
}

export function isCurrentTimelineSharePath(shareUrlPath: string) {
  if (typeof window === "undefined") {
    return true;
  }
  return (
    normalizeSharePath(window.location.pathname) ===
    normalizeSharePath(shareUrlPath)
  );
}

function normalizeSharePath(path: string) {
  const parsed = new URL(path, "http://drawflow.local");
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return pathname || "/";
}

export function buildDemoDraws(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);

  return items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((item) => createDemoDraw(item, resolvedRange));
}

function syncDemoDrawsWithItems(
  draws: DemoDraw[],
  _items: TimelineItem<DemoMilestone>[],
  range: TimelineRange,
  options?: { preserveLabels?: boolean }
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);
  const clampedDraws = draws.map((draw) => ({
    ...draw,
    x: clampNumber(draw.x, resolvedRange.min, resolvedRange.max),
  }));
  return options?.preserveLabels
    ? sortTimelineDraws(clampedDraws)
    : relabelTimelineDraws(clampedDraws);
}

function sortTimelineDraws(draws: DemoDraw[]) {
  return draws.slice().sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeDrawForOptimizationComparison(draw: DemoDraw) {
  return {
    amountCents: dollarsToCents(draw.amount),
    timingMilliDay: Math.round(draw.x * 1000),
  };
}

function drawSchedulesMatchForOptimization(
  currentDraws: DemoDraw[],
  optimizedDraws: DemoDraw[]
) {
  if (currentDraws.length !== optimizedDraws.length) {
    return false;
  }

  const current = sortTimelineDraws(currentDraws).map(
    normalizeDrawForOptimizationComparison
  );
  const optimized = sortTimelineDraws(optimizedDraws).map(
    normalizeDrawForOptimizationComparison
  );
  return current.every((draw, index) => {
    const optimizedDraw = optimized[index];
    return (
      optimizedDraw !== undefined &&
      draw.amountCents === optimizedDraw.amountCents &&
      draw.timingMilliDay === optimizedDraw.timingMilliDay
    );
  });
}

export function relabelTimelineDraws(draws: DemoDraw[]) {
  return sortTimelineDraws(draws).map((draw, index) => {
    if (!/^draw\s+\d+$/i.test(draw.label.trim())) {
      return draw;
    }

    return {
      ...draw,
      label: `Draw ${String(index + 1).padStart(2, "0")}`,
    };
  });
}

function timelineItemToMilestoneMutationInput(
  item: TimelineItem<DemoMilestone>,
  order: number
) {
  const milestone = item.data;
  return {
    budgetCents: dollarsToCents(milestone?.amount ?? 0),
    dayEnd: Math.round(item.x + (milestone?.durationDays ?? 1)),
    dayStart: Math.round(item.x),
    dependencyKeys: [],
    drawAvailabilityCents: dollarsToCents(
      getMilestoneDrawAvailabilityAmount(milestone)
    ),
    drawKey: milestone?.draw,
    durationDays: milestone?.durationDays ?? 1,
    evidenceState: milestone?.evidence ?? "Draft package",
    icon: milestone?.icon,
    included: true,
    lane: item.lane,
    markerLabel: item.markerLabel,
    milestoneKey: item.id,
    name: milestone?.name ?? item.label ?? "Timeline milestone",
    order,
    policyState: milestone?.policy ?? "Needs sequencing",
    status: milestone?.status,
    submilestones: resolveMilestoneSubmilestones(
      milestone ?? { subMilestones: [], submilestoneDetails: [] },
      item.id
    ).map((submilestone) => ({
      ...(submilestone.budgetCents === undefined
        ? {}
        : { budgetCents: submilestone.budgetCents }),
      ...(submilestone.description
        ? { description: submilestone.description }
        : {}),
      ...(submilestone.durationDays === undefined
        ? {}
        : { durationDays: submilestone.durationDays }),
      key: submilestone.key,
      name: submilestone.name,
      order: submilestone.order,
    })),
    tone: item.tone,
    type: "timeline_demo",
    x: item.x,
  };
}

export function normalizeTimelineShareStateForRoute(
  state: TimelineShareState
): TimelineShareState {
  const range = expandTimelineRangeForMilestones(state.items, state.range);

  return {
    ...state,
    draws: syncDemoDrawsWithItems(state.draws, state.items, range, {
      preserveLabels: true,
    }),
    range,
  };
}

export function expandTimelineRangeForMilestones(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): Required<TimelineRange> {
  const resolvedRange = normalizeDemoRange(range);
  const lastCompletionX = items.reduce(
    (nextMax, item) => Math.max(nextMax, getMilestoneEndX(item)),
    Number.NEGATIVE_INFINITY
  );
  const max = Number.isFinite(lastCompletionX)
    ? Math.max(
        resolvedRange.max,
        resolvedRange.min + 1,
        lastCompletionX + TIMELINE_END_PADDING_DAYS
      )
    : Math.max(
        resolvedRange.max,
        resolvedRange.min + TIMELINE_END_PADDING_DAYS
      );

  return {
    ...resolvedRange,
    max,
  };
}

export function resolveSelectedDrawDate(
  activeItem: TimelineItem<DemoMilestone>,
  activeDraw: DemoDraw | null | undefined,
  range: TimelineRange
): number {
  if (activeDraw) {
    return activeDraw.x;
  }

  return createDemoDraw(
    activeItem,
    expandTimelineRangeForMilestones([activeItem], range)
  ).x;
}

function createDemoDraw(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>
): DemoDraw {
  const milestone = item.data;
  const defaultDrawX = resolveDefaultDrawX(item, range);
  const drawX = clampNumber(
    Math.max(milestone?.drawX ?? defaultDrawX, defaultDrawX),
    range.min,
    range.max
  );

  return {
    amount: getMilestoneDrawAvailabilityAmount(milestone),
    id: `${item.id}-draw`,
    itemId: item.id,
    label: milestone?.draw ?? item.label ?? "Reimbursement draw",
    x: drawX,
  };
}

function findTimelineItemForDay(
  items: TimelineItem<DemoMilestone>[],
  day: number
) {
  const requestedDay = Math.round(day);
  const sortedItems = items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const activeItem = sortedItems.find((item) => {
    const startDay = Math.round(item.x);
    const endDay = Math.round(getMilestoneEndX(item));
    return requestedDay >= startDay && requestedDay <= endDay;
  });

  return (
    activeItem ??
    sortedItems
      .map((item) => ({
        distance: Math.min(
          Math.abs(requestedDay - Math.round(item.x)),
          Math.abs(requestedDay - Math.round(getMilestoneEndX(item)))
        ),
        item,
      }))
      .sort((a, b) => a.distance - b.distance || a.item.x - b.item.x)[0]?.item
  );
}

export function formatTimelineDay(value: number) {
  const day = Math.round(value);
  return day < 0 ? `T−${Math.abs(day)}` : day === 0 ? "T0" : `T+${day}`;
}

function formatTimelineDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size >= 1_000_000) {
    return `${fileSizeFormatter.format(size / 1_000_000)} MB`;
  }

  if (size >= 1000) {
    return `${fileSizeFormatter.format(size / 1000)} KB`;
  }

  return `${size} B`;
}

function hasCompletionClaim(item: TimelineItem<DemoMilestone>) {
  return Boolean(item.data?.completionClaim);
}

function getDrawDomId(draw: DemoDraw) {
  return draw.itemId ?? draw.id;
}

function getDrawRequestStatusLabel(status: DemoDraw["requestStatus"]) {
  if (status === "approved") {
    return "Draw approved";
  }

  if (status === "rejected") {
    return "Draw rejected";
  }

  if (status === "requested") {
    return "Request ready for review";
  }

  return "No builder request";
}

export type DrawTimelineMarkerState =
  | "happened"
  | "planned"
  | "rejected"
  | "requested";

export function getDrawTimelineMarkerState(
  draw: DemoDraw,
  currentDay: number
): DrawTimelineMarkerState {
  if (draw.requestStatus === "requested") {
    return "requested";
  }

  if (draw.requestStatus === "rejected") {
    return "rejected";
  }

  if (draw.requestStatus === "approved" || draw.x <= currentDay) {
    return "happened";
  }

  return "planned";
}

function getDrawTimelineMarkerCopy(state: DrawTimelineMarkerState) {
  if (state === "requested") {
    return "Requested";
  }

  if (state === "happened") {
    return "Happened";
  }

  if (state === "rejected") {
    return "Rejected";
  }

  return "Planned";
}

function calculateApprovedLimitShare(
  items: TimelineItem<DemoMilestone>[],
  totalUnlockedAtDay: number,
  approvedDrawLimit?: number
): number {
  const normalizedApprovedDrawLimit =
    typeof approvedDrawLimit === "number" && Number.isFinite(approvedDrawLimit)
      ? Math.max(0, Math.round(approvedDrawLimit))
      : undefined;

  if (normalizedApprovedDrawLimit === undefined) {
    return 0;
  }

  const maxTotalUnlocked = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }
    return total + getMilestoneRequestableDrawAmount(item.data);
  }, 0);

  const approvedHeadroom = Math.max(
    0,
    normalizedApprovedDrawLimit - maxTotalUnlocked
  );

  if (approvedHeadroom <= 0) {
    return 0;
  }

  if (maxTotalUnlocked <= 0) {
    return approvedHeadroom;
  }

  return totalUnlockedAtDay >= maxTotalUnlocked
    ? approvedHeadroom
    : Math.round((approvedHeadroom * totalUnlockedAtDay) / maxTotalUnlocked);
}

export function calculateDrawRequestLimit(
  targetDraw: DemoDraw,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): DrawRequestLimit {
  const drawDay = targetDraw.x;
  const totalUnlocked = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    const accruedCapacity = getAccruedMilestoneDrawCapacity(item, drawDay);
    return (
      total +
      Math.min(accruedCapacity, getMilestoneRequestableDrawAmount(item.data))
    );
  }, 0);
  const alreadyDrawn = draws.reduce((total, draw) => {
    if (draw.id === targetDraw.id || draw.x > drawDay) {
      return total;
    }

    if (draw.x === drawDay && draw.id.localeCompare(targetDraw.id) > 0) {
      return total;
    }

    return total + draw.amount;
  }, 0);
  const baseAvailableLimit = Math.max(0, totalUnlocked - alreadyDrawn);
  const approvedLimitShare = calculateApprovedLimitShare(
    items,
    totalUnlocked,
    approvedDrawLimit
  );
  const availableLimit = baseAvailableLimit + approvedLimitShare;

  return {
    alreadyDrawn,
    availableLimit,
    remainingAfterRequest: Math.max(0, availableLimit - targetDraw.amount),
    totalUnlocked,
  };
}

function getMilestoneRequestableDrawAmount(milestone: DemoMilestone) {
  const approvedDrawAvailability =
    getMilestoneDrawAvailabilityAmount(milestone);
  const actualCost = milestone.completionClaim?.actualCost;

  if (actualCost === undefined || !Number.isFinite(actualCost)) {
    return approvedDrawAvailability;
  }

  return Math.min(
    approvedDrawAvailability,
    calculateDrawAvailabilityAmount(
      Math.max(0, Math.round(actualCost)),
      DEFAULT_BORROWER_CO_PAY_BPS
    )
  );
}

interface ApprovedDrawRequestLimit extends DrawRequestLimit {
  blockingMilestones: string[];
}

function isMilestoneAdminApproved(item: TimelineItem<DemoMilestone>) {
  return (
    item.data?.completionReview?.status === "approved" ||
    (
      item.data?.completionClaim as
        | (DemoMilestone["completionClaim"] & {
            completionReview?: DemoMilestone["completionReview"];
          })
        | undefined
    )?.completionReview?.status === "approved"
  );
}

export function calculateApprovedDrawRequestLimit(
  targetDraw: DemoDraw,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): ApprovedDrawRequestLimit {
  const drawDay = targetDraw.x;
  const blockingMilestones: string[] = [];
  const totalUnlocked = items.reduce((total, item) => {
    if (!item.data || getMilestoneEndX(item) > drawDay) {
      return total;
    }

    if (!isMilestoneAdminApproved(item)) {
      blockingMilestones.push(item.data.name);
      return total;
    }

    return total + getMilestoneRequestableDrawAmount(item.data);
  }, 0);
  const alreadyDrawn = draws.reduce((total, draw) => {
    if (draw.id === targetDraw.id || draw.x > drawDay) {
      return total;
    }

    if (draw.x === drawDay && draw.id.localeCompare(targetDraw.id) > 0) {
      return total;
    }

    return total + draw.amount;
  }, 0);
  const baseAvailableLimit = Math.max(0, totalUnlocked - alreadyDrawn);
  const approvedLimitShare = calculateApprovedLimitShare(
    items,
    totalUnlocked,
    approvedDrawLimit
  );
  const availableLimit = baseAvailableLimit + approvedLimitShare;

  return {
    alreadyDrawn,
    availableLimit,
    blockingMilestones,
    remainingAfterRequest: Math.max(0, availableLimit - targetDraw.amount),
    totalUnlocked,
  };
}

export function findDrawUnlockCapacityViolation(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): { draw: DemoDraw; limit: DrawRequestLimit } | null {
  const orderedDraws = [...draws].sort(
    (a, b) => a.x - b.x || a.id.localeCompare(b.id)
  );

  for (const draw of orderedDraws) {
    const limit = calculateDrawRequestLimit(
      draw,
      items,
      draws,
      approvedDrawLimit
    );
    if (draw.amount > limit.availableLimit) {
      return { draw, limit };
    }
  }

  return null;
}

export function getMaxSchedulableDrawAmount(
  requestedDay: number,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  options: { excludeDrawId?: string; proposedDrawId?: string } = {},
  approvedDrawLimit?: number
): number {
  const proposedDrawId =
    options.proposedDrawId ?? `__proposed-draw-${requestedDay}`;
  const drawsWithoutExcluded = options.excludeDrawId
    ? draws.filter((draw) => draw.id !== options.excludeDrawId)
    : draws;
  const probeDraw: DemoDraw = {
    amount: Number.MAX_SAFE_INTEGER,
    id: proposedDrawId,
    label: "Proposed draw",
    x: requestedDay,
  };
  let maxAmount = calculateDrawRequestLimit(
    probeDraw,
    items,
    [...drawsWithoutExcluded, probeDraw],
    approvedDrawLimit
  ).availableLimit;

  for (const laterDraw of drawsWithoutExcluded) {
    const proposedComesBeforeLater =
      requestedDay < laterDraw.x ||
      (requestedDay === laterDraw.x &&
        proposedDrawId.localeCompare(laterDraw.id) < 0);

    if (!proposedComesBeforeLater) {
      continue;
    }

    const limitWithoutProposed = calculateDrawRequestLimit(
      laterDraw,
      items,
      drawsWithoutExcluded,
      approvedDrawLimit
    );
    maxAmount = Math.min(
      maxAmount,
      Math.max(0, limitWithoutProposed.availableLimit - laterDraw.amount)
    );
  }

  return Math.max(0, Math.floor(maxAmount));
}

const DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE =
  "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.";

export function buildTimelineCashflowData(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: Required<TimelineRange>,
  startingCash = STARTING_CASH
): CashflowDatum[] {
  const events = [
    ...items
      .filter((item) => item.data)
      .flatMap((item) => {
        const spendEvents = buildMilestoneSpendEvents(item);
        const drawAvailabilityAmount = getMilestoneDrawAvailabilityAmount(
          item.data
        );
        const completionDay = getMilestoneEndX(item);
        const milestoneName = item.data?.name ?? item.label ?? "Milestone";
        const capacityEvents = buildMilestoneDrawCapacityEvents(item);

        return [
          ...spendEvents.map((event) => ({
            amount: event.amount,
            day: clampNumber(event.day, range.min, range.max),
            drawCapacityUnlocked: 0,
            id: event.id,
            label: event.label,
            milestoneDrawAvailability: drawAvailabilityAmount,
            milestoneEndDay: completionDay,
            milestoneId: event.milestoneId,
            milestoneTotalBudget: event.milestoneAmount,
            sortOrder: getMilestoneCashflowSortOrder(event.kind),
            type: "milestone" as const,
          })),
          ...capacityEvents.map((event) => ({
            amount: 0,
            day: clampNumber(event.day, range.min, range.max),
            drawCapacityUnlocked: event.amount,
            id: event.id,
            label: event.label || `${milestoneName} accrued capacity`,
            milestoneDrawAvailability: drawAvailabilityAmount,
            milestoneEndDay: getMilestoneEndX(item),
            milestoneId: event.milestoneId,
            milestoneTotalBudget: item.data?.amount ?? 0,
            sortOrder: 4,
            type: "capacityUnlock" as const,
          })),
        ];
      }),
    ...capitalSpikes.map((spike) => {
      const eventKind = spike.eventKind ?? "cost";
      const isCashSource =
        eventKind === "cashInfusion" || eventKind === "homeEquityTakeout";

      return {
        amount: spike.amount,
        day: clampNumber(spike.x, range.min, range.max),
        drawCapacityUnlocked: 0,
        id: spike.id,
        label: spike.label,
        sortOrder: isCashSource ? 0 : 3,
        type: isCashSource ? "cashInfusion" : "capitalSpike",
      } as const;
    }),
    ...draws.map((draw) => ({
      amount: draw.amount,
      day: clampNumber(draw.x, range.min, range.max),
      drawCapacityUnlocked: 0,
      id: draw.id,
      label: draw.label,
      sortOrder: 5,
      type: "draw" as const,
    })),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
  const data: CashflowDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashInfusionAmount: 0,
      cashOnHand: startingCash,
      day: range.min,
      drawCapacityUnlocked: 0,
      drawAmount: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
      sortOrder: -1,
    },
  ];
  let cashOnHand = startingCash;

  for (const event of events) {
    if (event.type === "milestone") {
      cashOnHand -= event.amount;
      data.push({
        budget: event.amount,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: event.drawCapacityUnlocked,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        milestoneDrawAvailability: event.milestoneDrawAvailability,
        milestoneEndDay: event.milestoneEndDay,
        milestoneId: event.milestoneId,
        milestoneTotalBudget: event.milestoneTotalBudget,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "capacityUnlock") {
      data.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: event.drawCapacityUnlocked,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        milestoneDrawAvailability: event.milestoneDrawAvailability,
        milestoneEndDay: event.milestoneEndDay,
        milestoneId: event.milestoneId,
        milestoneTotalBudget: event.milestoneTotalBudget,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "capitalSpike") {
      cashOnHand -= event.amount;
      data.push({
        budget: 0,
        capitalSpikeAmount: event.amount,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "capitalSpike",
        id: event.id,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "cashInfusion") {
      cashOnHand += event.amount;
      data.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: event.amount,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "cashInfusion",
        id: event.id,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    cashOnHand += event.amount;
    data.push({
      budget: 0,
      capitalSpikeAmount: 0,
      cashInfusionAmount: 0,
      cashOnHand,
      day: event.day,
      drawCapacityUnlocked: 0,
      drawAmount: event.amount,
      event: "draw",
      id: event.id,
      name: event.label,
      sortOrder: event.sortOrder,
    });
  }

  return data;
}

function getMilestoneCashflowSortOrder(
  kind: ReturnType<typeof buildMilestoneSpendEvents>[number]["kind"]
) {
  if (kind === "initial") {
    return 1;
  }

  if (kind === "distributed") {
    return 2;
  }

  return 3;
}

export function densifyCashflowData(
  data: CashflowDatum[],
  range: Required<TimelineRange>
): CashflowDatum[] {
  const grouped = groupCashflowPointsByDay(data);
  const eventDays = data.map((point) => point.day);

  return buildChartProbeDays(range, eventDays).flatMap((day) => {
    const existing = grouped.get(day);

    if (existing) {
      return existing;
    }

    return [
      {
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand: interpolateCashOnHand(data, day),
        day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "start",
        id: `cash-probe-${day}`,
        name: formatTimelineDay(day),
      } satisfies CashflowDatum,
    ];
  });
}

export function buildCashflowChartData(
  accountingData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>,
  startingCash = STARTING_CASH
): CashflowDatum[] {
  const milestoneBars = buildMilestoneCostBars(items, range);
  const milestoneDays = items
    .filter((item) => item.data)
    .flatMap((item) => [item.x, getMilestoneEndX(item)]);
  const eventDays = [
    ...accountingData
      .filter((point) => !isDistributedMilestoneCashflowPoint(point))
      .map((point) => point.day),
    ...milestoneDays,
  ];
  const milestoneBudgetByDay = new Map<number, number>();
  const milestoneReimbursableBudgetByDay = new Map<number, number>();
  const milestoneEndDayByStartDay = new Map<number, number>();

  for (const bar of milestoneBars) {
    milestoneBudgetByDay.set(
      bar.day,
      (milestoneBudgetByDay.get(bar.day) ?? 0) + bar.amount
    );
    milestoneReimbursableBudgetByDay.set(
      bar.day,
      (milestoneReimbursableBudgetByDay.get(bar.day) ?? 0) +
        bar.reimbursableAmount
    );
    milestoneEndDayByStartDay.set(bar.day, bar.endDay);
  }

  return buildCashflowChartEventDays(range, eventDays).map((day) => {
    const dayEvents = accountingData.filter(
      (point) => Math.round(point.day) === day
    );
    const drawAmount = dayEvents.reduce(
      (total, point) => total + point.drawAmount,
      0
    );
    const capitalSpikeAmount = dayEvents.reduce(
      (total, point) => total + point.capitalSpikeAmount,
      0
    );
    const cashInfusionAmount = dayEvents.reduce(
      (total, point) => total + point.cashInfusionAmount,
      0
    );
    const drawCapacityUnlocked = dayEvents.reduce(
      (total, point) => total + point.drawCapacityUnlocked,
      0
    );
    const budget = milestoneBudgetByDay.get(day) ?? 0;
    const reimbursableBudget = Math.min(
      budget,
      milestoneReimbursableBudgetByDay.get(day) ?? budget
    );
    const outOfPocketBudget = Math.max(0, budget - reimbursableBudget);
    const primaryEvent =
      dayEvents.find((point) => point.event === "draw") ??
      dayEvents.find((point) => point.event === "cashInfusion") ??
      dayEvents.find((point) => point.event === "capitalSpike") ??
      dayEvents.find((point) => point.drawCapacityUnlocked > 0) ??
      dayEvents[0];

    return {
      budget,
      capitalSpikeAmount,
      cashInfusionAmount,
      cashOnHand: projectCashOnHandForChart(
        accountingData,
        items,
        day,
        startingCash
      ),
      day,
      drawAmount,
      drawCapacityUnlocked,
      event: budget > 0 ? "milestone" : (primaryEvent?.event ?? "start"),
      id:
        budget > 0
          ? `milestone-cost-gate-${day}`
          : (primaryEvent?.id ?? `cash-probe-${day}`),
      milestoneEndDay:
        budget > 0 ? milestoneEndDayByStartDay.get(day) : undefined,
      name:
        budget > 0
          ? "Milestone cost gate"
          : (primaryEvent?.name ?? formatTimelineDay(day)),
      outOfPocketBudget,
      reimbursableBudget,
    } satisfies CashflowDatum;
  });
}

function buildCashflowChartEventDays(
  range: Required<TimelineRange>,
  eventDays: number[]
): number[] {
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  const days = new Set<number>([min, max]);

  for (const eventDay of eventDays) {
    if (Number.isFinite(eventDay)) {
      days.add(Math.round(clampNumber(eventDay, min, max)));
    }
  }

  return [...days].sort((a, b) => a - b);
}

function buildMilestoneCostBars(
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>
): Array<{
  amount: number;
  day: number;
  endDay: number;
  reimbursableAmount: number;
}> {
  return items
    .filter(
      (item): item is TimelineItem<DemoMilestone> & { data: DemoMilestone } =>
        Boolean(item.data)
    )
    .map((item) => {
      const schedule = getMilestonePaymentSchedule(item);
      const amount = Math.max(0, Math.round(schedule.totalAmount));
      const milestoneDrawAvailability = getMilestoneDrawAvailabilityAmount(
        item.data
      );
      const reimbursableAmount = Math.min(amount, milestoneDrawAvailability);

      return {
        amount,
        day: Math.round(clampNumber(schedule.startX, range.min, range.max)),
        endDay: Math.round(clampNumber(schedule.endX, range.min, range.max)),
        reimbursableAmount,
      };
    })
    .filter((bar) => bar.amount > 0);
}

function projectCashOnHandForChart(
  accountingData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  value: number,
  startingCash = STARTING_CASH
): number {
  const startPoint = accountingData.find((point) => point.event === "start");
  const cashOnHand = startPoint?.cashOnHand ?? startingCash;
  const projectedDistributedSpend = getProjectedDistributedMilestoneSpend(
    items,
    value
  );

  const settledCashOnHand = accountingData
    .filter(
      (point) =>
        point.id !== "start" &&
        point.day <= value &&
        !isDistributedMilestoneCashflowPoint(point)
    )
    .sort(compareCashflowPoints)
    .reduce(
      (total, point) =>
        total +
        point.drawAmount +
        point.cashInfusionAmount -
        point.capitalSpikeAmount -
        point.budget,
      cashOnHand
    );

  return settledCashOnHand - projectedDistributedSpend;
}

function isDistributedMilestoneCashflowPoint(point: CashflowDatum) {
  return point.event === "milestone" && point.id.includes("-distributed-");
}

function getProjectedDistributedMilestoneSpend(
  items: TimelineItem<DemoMilestone>[],
  value: number
): number {
  return items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    const schedule = getMilestonePaymentSchedule(item);
    const distributedAmount = Math.max(
      0,
      Math.round(schedule.distributedAmount)
    );

    if (distributedAmount <= 0 || value <= schedule.startX) {
      return total;
    }

    if (value >= schedule.endX || schedule.endX <= schedule.startX) {
      return total + distributedAmount;
    }

    const progress =
      (value - schedule.startX) / (schedule.endX - schedule.startX);

    return total + distributedAmount * progress;
  }, 0);
}

export function densifyDrawAvailabilityData(
  data: DrawAvailabilityDatum[],
  range: Required<TimelineRange>
): DrawAvailabilityDatum[] {
  const grouped = new Map<number, DrawAvailabilityDatum[]>();

  for (const point of data) {
    const day = Math.round(point.day);
    grouped.set(day, [...(grouped.get(day) ?? []), point]);
  }

  return buildChartProbeDays(
    range,
    data.map((point) => point.day)
  ).flatMap((day) => {
    const existing = grouped.get(day);

    if (existing) {
      return existing;
    }

    return {
      ...interpolateDrawAvailability(data, day),
      day,
      name: formatTimelineDay(day),
    };
  });
}

export function buildDrawAvailabilityChartData(
  availabilityData: DrawAvailabilityDatum[],
  cashflowData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>
): DrawAvailabilityDatum[] {
  const milestoneDays = items
    .filter((item) => item.data)
    .flatMap((item) => [item.x, getMilestoneEndX(item)]);
  const eventDays = [
    ...cashflowData
      .filter((point) => !isDistributedMilestoneCashflowPoint(point))
      .map((point) => point.day),
    ...milestoneDays,
  ];

  return buildCashflowChartEventDays(range, eventDays).map((day) => ({
    ...interpolateDrawAvailability(availabilityData, day),
    day,
    name: formatTimelineDay(day),
  }));
}

export function buildChartProbeDays(
  range: Required<TimelineRange>,
  eventDays: number[],
  intervalDays = CHART_PROBE_INTERVAL_DAYS
): number[] {
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  const days = new Set<number>([min, max]);

  for (const eventDay of eventDays) {
    if (Number.isFinite(eventDay)) {
      days.add(Math.round(clampNumber(eventDay, min, max)));
    }
  }

  for (let day = min; day <= max; day += intervalDays) {
    days.add(day);
  }

  return [...days].sort((a, b) => a - b);
}

export function groupCashflowPointsByDay(data: CashflowDatum[]) {
  const grouped = new Map<number, CashflowDatum[]>();

  for (const point of data) {
    const day = Math.round(point.day);
    grouped.set(day, [...(grouped.get(day) ?? []), point]);
  }

  return grouped;
}

function compareCashflowPoints(left: CashflowDatum, right: CashflowDatum) {
  return (
    left.day - right.day ||
    getCashflowPointSortOrder(left) - getCashflowPointSortOrder(right) ||
    left.id.localeCompare(right.id)
  );
}

function getCashflowPointSortOrder(point: CashflowDatum) {
  if (typeof point.sortOrder === "number" && Number.isFinite(point.sortOrder)) {
    return point.sortOrder;
  }

  if (point.event === "start") {
    return -1;
  }

  if (point.event === "cashInfusion") {
    return 0;
  }

  if (point.event === "milestone") {
    return point.drawCapacityUnlocked > 0 && point.budget <= 0 ? 4 : 2;
  }

  if (point.event === "draw") {
    return 5;
  }

  return 3;
}

export function buildDrawAvailabilityData(
  cashflowData: CashflowDatum[],
  approvedDrawLimit?: number,
  interestAnnualBps = normalizeInterestAnnualBps(undefined)
): DrawAvailabilityDatum[] {
  const sortedCashflowData = [...cashflowData].sort(compareCashflowPoints);
  const normalizedInterestAnnualBps =
    normalizeInterestAnnualBps(interestAnnualBps);
  let unlockedDraw = 0;
  let releasedDraw = 0;
  let totalInterestAccrued = 0;
  let previousDay = sortedCashflowData[0]?.day ?? 0;

  const baseAvailability = sortedCashflowData.map((point) => {
    const day = Math.max(previousDay, point.day);
    totalInterestAccrued += calculateDailyCompoundedInterest(
      releasedDraw + totalInterestAccrued,
      day - previousDay,
      normalizedInterestAnnualBps
    );
    previousDay = day;

    unlockedDraw += point.drawCapacityUnlocked;
    releasedDraw += point.drawAmount;

    const interestBearingDraw = releasedDraw;
    const additionalAvailableDraw = Math.max(0, unlockedDraw - releasedDraw);

    return {
      additionalAvailableDraw,
      day: point.day,
      interestAnnualBps: normalizedInterestAnnualBps,
      interestBearingDraw,
      name: point.name,
      totalInterestAccrued,
      totalAvailableDraw: interestBearingDraw + additionalAvailableDraw,
      totalUnlockedDraw: unlockedDraw,
    };
  });

  const normalizedApprovedDrawLimit =
    typeof approvedDrawLimit === "number" && Number.isFinite(approvedDrawLimit)
      ? Math.max(0, Math.round(approvedDrawLimit))
      : undefined;
  if (normalizedApprovedDrawLimit === undefined) {
    return baseAvailability;
  }

  const baseTopLine = Math.max(
    0,
    ...baseAvailability.map((point) => point.totalAvailableDraw)
  );
  const approvedHeadroom = Math.max(
    0,
    normalizedApprovedDrawLimit - baseTopLine
  );
  if (approvedHeadroom <= 0) {
    return baseAvailability;
  }

  if (baseTopLine <= 0) {
    return baseAvailability.map((point, index) => {
      const additionalAvailableDraw =
        index === baseAvailability.length - 1
          ? point.additionalAvailableDraw + approvedHeadroom
          : point.additionalAvailableDraw;

      return {
        ...point,
        additionalAvailableDraw,
        totalAvailableDraw: point.interestBearingDraw + additionalAvailableDraw,
      };
    });
  }

  return baseAvailability.map((point) => {
    const approvedLimitShare =
      point.totalAvailableDraw >= baseTopLine
        ? approvedHeadroom
        : Math.round(
            (approvedHeadroom * point.totalAvailableDraw) / baseTopLine
          );
    const additionalAvailableDraw =
      point.additionalAvailableDraw + approvedLimitShare;

    return {
      ...point,
      additionalAvailableDraw,
      totalAvailableDraw: point.interestBearingDraw + additionalAvailableDraw,
    };
  });
}

function calculateDailyCompoundedInterest(
  principal: number,
  elapsedDays: number,
  interestAnnualBps: number
): number {
  if (principal <= 0 || elapsedDays <= 0) {
    return 0;
  }

  const dailyRate = interestAnnualBps / 10_000 / 365;
  return principal * ((1 + dailyRate) ** elapsedDays - 1);
}

export function buildCashShortfallPoints(
  cashflowData: CashflowDatum[],
  minimumCashReserve = MINIMUM_POST_MILESTONE_CASH_RESERVE
): CashShortfallPoint[] {
  const reserve = Math.max(0, Math.round(minimumCashReserve));
  return cashflowData.flatMap((point) => {
    if (point.event !== "milestone" || point.budget <= 0) {
      return [];
    }

    const cashBeforeMilestone = point.cashOnHand + point.budget;
    const cashAfterMilestone = point.cashOnHand;

    if (cashAfterMilestone >= reserve) {
      return [];
    }

    return [
      {
        cashBeforeMilestone,
        cashOnHand: point.cashOnHand,
        day: point.day,
        milestone: point.name,
        milestoneCost: point.budget,
        shortfall: Math.max(0, reserve - cashAfterMilestone),
      },
    ];
  });
}

function formatCashShortfallMessage(point: CashShortfallPoint): string {
  if (point.shortfall > 0) {
    return `needs ${money(point.shortfall)} before ${point.milestone}`;
  }

  return `leaves ${money(point.cashOnHand)} after ${point.milestone}`;
}

export function buildFinancialOverview(
  cashflowData: CashflowDatum[],
  draws: DemoDraw[],
  range: Required<TimelineRange>,
  interestAnnualBps = normalizeInterestAnnualBps(undefined),
  capitalSpikes: DemoCapitalSpike[] = []
): FinancialOverview {
  const drawEvents = cashflowData
    .filter((point) => point.event === "draw")
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const normalizedInterestAnnualBps =
    normalizeInterestAnnualBps(interestAnnualBps);
  let principal = 0;
  let previousDay = range.min;
  let interestPaid = 0;

  for (const event of drawEvents) {
    const day = clampNumber(event.day, range.min, range.max);
    interestPaid += calculateDailyCompoundedInterest(
      principal + interestPaid,
      Math.max(0, day - previousDay),
      normalizedInterestAnnualBps
    );
    principal += event.drawAmount;
    previousDay = day;
  }

  interestPaid += calculateDailyCompoundedInterest(
    principal + interestPaid,
    Math.max(0, range.max - previousDay),
    normalizedInterestAnnualBps
  );
  interestPaid += calculateHomeEquityInterestCost(capitalSpikes, range.max);

  return {
    drawCount: draws.length,
    drawFeesPaid: draws.length * DRAW_FEE,
    interestPaid,
    totalDrawReleased: drawEvents.reduce(
      (total, event) => total + event.drawAmount,
      0
    ),
  };
}

export function buildCashUseSummary(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[]
) {
  const milestoneSpend = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    return total + getMilestonePaymentSchedule(item).totalAmount;
  }, 0);
  const costSpikeSpend = capitalSpikes.reduce((total, spike) => {
    if (
      spike.eventKind === "cashInfusion" ||
      spike.eventKind === "homeEquityTakeout"
    ) {
      return total;
    }

    return total + spike.amount;
  }, 0);
  const lenderCashUsed = draws.reduce((total, draw) => total + draw.amount, 0);
  const totalPlannedSpend = milestoneSpend + costSpikeSpend;

  return {
    builderCashUsed: Math.max(0, totalPlannedSpend - lenderCashUsed),
    lenderCashUsed,
    totalPlannedSpend,
  };
}

function normalizeDemoRange(range: TimelineRange): Required<TimelineRange> {
  const min = Number.isFinite(range.min) ? range.min : 0;
  const max =
    Number.isFinite(range.max) && range.max > min ? range.max : min + 1;

  return {
    max,
    min,
    unit: range.unit ?? "",
  };
}

export function getTimelineAlignedTicks(
  range: Required<TimelineRange>,
  pixelsPerUnit: number
): number[] {
  const axisWidth = Math.max(1, (range.max - range.min) * pixelsPerUnit);
  const tickCount = Math.max(5, Math.ceil(axisWidth / 220));

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);

    return Math.round(range.min + (range.max - range.min) * ratio);
  });
}

function getCashflowChartExtent(data: CashflowDatum[]) {
  const values = data.flatMap((item) => [
    item.cashOnHand,
    item.budget,
    item.capitalSpikeAmount,
  ]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padding = (max - min) * 0.12;

  return {
    max: max + padding,
    min: min < 0 ? min - padding : 0,
  };
}

function getDrawAvailabilityChartExtent(data: DrawAvailabilityDatum[]) {
  const max = Math.max(
    1,
    ...data.flatMap((item) => [
      item.additionalAvailableDraw,
      item.interestBearingDraw,
      item.totalAvailableDraw,
    ])
  );

  return {
    max: max * 1.12,
  };
}

function interpolateCashOnHand(data: CashflowDatum[], value: number): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  let cashOnHand = data[0]?.cashOnHand ?? STARTING_CASH;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    cashOnHand = point.cashOnHand;
  }

  return cashOnHand;
}

export function interpolateLinearCashOnHand(
  data: CashflowDatum[],
  value: number
): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  const sorted = [...data].sort(
    (a, b) => a.day - b.day || a.id.localeCompare(b.id)
  );
  let previous = sorted[0];

  if (!previous) {
    return STARTING_CASH;
  }

  if (value <= previous.day) {
    return previous.cashOnHand;
  }

  for (const point of sorted.slice(1)) {
    if (point.day < value) {
      previous = point;
      continue;
    }

    if (point.day === value || point.day === previous.day) {
      return point.cashOnHand;
    }

    const ratio = (value - previous.day) / (point.day - previous.day);

    return (
      previous.cashOnHand + (point.cashOnHand - previous.cashOnHand) * ratio
    );
  }

  return previous.cashOnHand;
}

export function resolveMilestoneDrawPositionDay(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>
): number {
  const unlockDay =
    buildMilestoneDrawCapacityEvents(item)[0]?.day ?? getMilestoneEndX(item);

  return clampNumber(Math.round(unlockDay), range.min, range.max);
}

export function getCumulativeDrawPosition(
  availability: DrawAvailabilityDatum | null | undefined
): CumulativeDrawPosition {
  const totalDrawn = Math.max(0, availability?.interestBearingDraw ?? 0);
  const totalUnlocked = Math.max(
    0,
    availability?.totalUnlockedDraw ??
      // Fallback for sparse fixtures: never prefer policy-inflated additional
      // available draw over explicit unlocked capacity.
      totalDrawn
  );

  return {
    availableToDraw: Math.max(0, totalUnlocked - totalDrawn),
    day: availability?.day ?? 0,
    totalDrawn,
    totalUnlocked,
  };
}

export function resolveMilestoneCumulativeDrawPosition(
  item: TimelineItem<DemoMilestone>,
  drawAvailabilityData: DrawAvailabilityDatum[] | null | undefined,
  range: Required<TimelineRange>
): CumulativeDrawPosition {
  const day = resolveMilestoneDrawPositionDay(item, range);

  return getCumulativeDrawPosition(
    interpolateDrawAvailability(drawAvailabilityData ?? [], day)
  );
}

export function interpolateDrawAvailability(
  data: DrawAvailabilityDatum[] | null | undefined,
  value: number
): DrawAvailabilityDatum {
  const fallback = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalInterestAccrued: 0,
    totalAvailableDraw: 0,
    totalUnlockedDraw: 0,
  };

  if (!data || data.length === 0) {
    return fallback;
  }

  let current = data[0] ?? fallback;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    current = point;
  }

  return {
    ...current,
    day: value,
    totalInterestAccrued:
      current.totalInterestAccrued +
      calculateDailyCompoundedInterest(
        current.interestBearingDraw + current.totalInterestAccrued,
        Math.max(0, value - current.day),
        normalizeInterestAnnualBps(current.interestAnnualBps)
      ),
  };
}

function withHomeEquityInterest(
  availability: DrawAvailabilityDatum,
  capitalSpikes: readonly DemoCapitalSpike[],
  throughDay: number
): DrawAvailabilityDatum {
  const homeEquityInterestAccrued = calculateHomeEquityInterestCost(
    capitalSpikes,
    throughDay
  );
  return {
    ...availability,
    constructionInterestAccrued: availability.totalInterestAccrued,
    homeEquityInterestAccrued,
    totalInterestAccrued:
      availability.totalInterestAccrued + homeEquityInterestAccrued,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function countInsertedTimelineItems(
  items: TimelineItem<DemoMilestone>[]
): number {
  return items.filter((item) => item.id.startsWith("inserted-")).length;
}

function countManualDraws(draws: DemoDraw[]): number {
  return draws.filter((draw) => draw.id.startsWith("manual-draw-")).length;
}

function timelineShareStateSignature(state: TimelineShareState): string {
  return JSON.stringify(state);
}

function buildTimelineShareUrl(
  snapshotId: string,
  shareUrlPath = DEFAULT_TIMELINE_SHARE_PATH
): string {
  if (typeof window === "undefined") {
    return `${shareUrlPath}?share=${encodeURIComponent(snapshotId)}`;
  }

  const url = new URL(shareUrlPath, window.location.origin);
  url.searchParams.set("share", snapshotId);

  return url.toString();
}

export function readLocalTimelineSnapshot(snapshotId: string): unknown {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSnapshot = window.localStorage.getItem(
    `${LOCAL_TIMELINE_SHARE_PREFIX}snapshot:${snapshotId}`
  );

  if (!rawSnapshot) {
    return null;
  }

  try {
    return JSON.parse(rawSnapshot);
  } catch {
    return null;
  }
}

function writeLocalTimelineSnapshot(snapshotId: string, snapshot: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    `${LOCAL_TIMELINE_SHARE_PREFIX}snapshot:${snapshotId}`,
    JSON.stringify(snapshot)
  );
}

function ShareTimelineMenu({
  copied,
  error,
  loading,
  onCopy,
  onCreate,
  onOpenChange,
  open,
  shareUrl,
}: {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}) {
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent("Elm Street build draw roadmap");
  const xHref = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
    : undefined;
  const mailHref = shareUrl
    ? `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
        `Review this DrawFlow roadmap snapshot: ${shareUrl}`
      )}`
    : undefined;

  const handleNativeShare = async () => {
    if (!(canNativeShare && shareUrl)) {
      return;
    }

    await navigator.share({
      title: "Elm Street build draw roadmap",
      url: shareUrl,
    });
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            data-testid="timeline-share-button"
            loading={loading}
            onClick={onCreate}
            size="sm"
            variant="default"
          />
        }
      >
        <Share2 />
        Share
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100vh-1rem)] w-[380px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain"
        data-testid="timeline-share-menu"
        sideOffset={10}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="grid size-28 shrink-0 place-items-center rounded-lg border border-border bg-white p-2 shadow-xs sm:size-36">
            {shareUrl ? (
              <QRCodeSVG
                aria-label="Timeline share QR code"
                data-testid="timeline-share-qr"
                level="M"
                size={96}
                value={shareUrl}
              />
            ) : (
              <QrCode className="size-12 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-100">
              <LinkIcon className="size-3.5" />
              Snapshot link
            </div>
            <h2 className="mt-3 font-semibold text-lg leading-tight">
              Share this roadmap setup
            </h2>
            <p className="mt-1 hidden text-muted-foreground text-sm sm:block">
              Generates an editable fork with the same milestones, draws, range,
              selection, and display controls.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="timeline-share-link">Share URL</Label>
          <Input
            data-testid="timeline-share-url"
            id="timeline-share-link"
            readOnly
            value={shareUrl}
          />
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            disabled={!shareUrl}
            onClick={onCopy}
            size="sm"
            variant="outline"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            disabled={!(shareUrl && canNativeShare)}
            onClick={handleNativeShare}
            size="sm"
            variant="outline"
          >
            <Share2 />
            Native share
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a
                data-testid="timeline-share-x"
                href={xHref}
                rel="noreferrer"
                target="_blank"
              >
                Share on X
              </a>
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink />X
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a data-testid="timeline-share-email" href={mailHref ?? "#"}>
                Share by email
              </a>
            }
            size="sm"
            variant="outline"
          >
            <Mail />
            Email
          </Button>
        </div>

        <p
          className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid="timeline-share-disclaimer"
        >
          live collaboration session under construction
        </p>
        {loading && (
          <div className="mt-3 inline-flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Saving snapshot
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SelectedDrawMobileDrawer({
  activeDraw,
  activePanelDraw,
  activePanelDrawItem,
  canApproveMilestoneCompletion,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  draws,
  items,
  onOpenChange,
  onCompleteMilestone,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onReviewDrawRequest,
  modificationRequests,
  onReviewModificationRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  onUpdateMilestoneDrawAvailability,
  onUpdatePlannedDraw,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  liveExecutionEnabled,
  open,
  overview,
  range,
  requiresApprovedDrawMilestones,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  canApproveMilestoneCompletion: boolean;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone> | null;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  modificationRequests: TimelineModificationRequestView[];
  onOpenChange: (open: boolean) => void;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void>;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown>;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  liveExecutionEnabled: boolean;
  open: boolean;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  requiresApprovedDrawMilestones: boolean;
  role: TimelineDemoRole;
}) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="bottom">
      <DrawerPopup
        className="max-h-[86svh] overflow-x-hidden max-sm:w-full max-sm:max-w-none"
        data-testid="selected-draw-mobile-drawer"
        showBar
      >
        <DrawerPanel
          className="min-w-0 overflow-x-hidden px-4 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
          scrollFade
        >
          <DrawerTitle className="sr-only">
            Selected timeline action
          </DrawerTitle>
          {activeItem ? (
            <SelectedContextPanel
              activeDraw={activeDraw}
              activeItem={activeItem}
              activePanelDraw={activePanelDraw}
              activePanelDrawItem={activePanelDrawItem}
              addEvidenceFiles={addEvidenceFiles}
              canApproveMilestoneCompletion={canApproveMilestoneCompletion}
              contractorPlanning={contractorPlanning}
              drawAvailabilityData={drawAvailabilityData}
              draws={draws}
              items={items}
              liveExecutionEnabled={liveExecutionEnabled}
              modificationRequests={modificationRequests}
              onCompleteMilestone={onCompleteMilestone}
              onCreateMilestoneSiteVisit={onCreateMilestoneSiteVisit}
              onRecordMilestoneSiteVisit={onRecordMilestoneSiteVisit}
              onRemoveEvidenceAsset={onRemoveEvidenceAsset}
              onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
              onReviewDrawRequest={onReviewDrawRequest}
              onReviewMilestoneCompletion={onReviewMilestoneCompletion}
              onReviewModificationRequest={onReviewModificationRequest}
              onSubmitDrawRequest={onSubmitDrawRequest}
              onUpdateEvidenceAsset={onUpdateEvidenceAsset}
              onUpdateMilestoneDrawAvailability={
                onUpdateMilestoneDrawAvailability
              }
              onUpdatePlannedDraw={onUpdatePlannedDraw}
              onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
              onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
              overview={overview}
              range={range}
              requiresApprovedDrawMilestones={requiresApprovedDrawMilestones}
              role={role}
            />
          ) : null}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}

function SelectedContextPanel({
  activeDraw,
  activePanelDraw,
  activePanelDrawItem,
  canApproveMilestoneCompletion,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  draws,
  items,
  onCompleteMilestone,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onReviewDrawRequest,
  modificationRequests,
  onReviewModificationRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  onUpdateMilestoneDrawAvailability,
  onUpdatePlannedDraw,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  liveExecutionEnabled,
  overview,
  range,
  requiresApprovedDrawMilestones,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  canApproveMilestoneCompletion: boolean;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  modificationRequests: TimelineModificationRequestView[];
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void>;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown>;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  liveExecutionEnabled: boolean;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  requiresApprovedDrawMilestones: boolean;
  role: TimelineDemoRole;
}) {
  if (!liveExecutionEnabled) {
    if (activePanelDraw) {
      return (
        <DrawPlanSummaryPanel
          draw={activePanelDraw}
          drawItem={activePanelDrawItem}
          overview={overview}
        />
      );
    }

    return (
      <MilestonePlanSummaryPanel
        activeDraw={activeDraw}
        activeItem={activeItem}
        contractorPlanning={contractorPlanning}
        drawAvailabilityData={drawAvailabilityData}
        onUpdateMilestoneDrawAvailability={onUpdateMilestoneDrawAvailability}
        onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
        onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
        overview={overview}
        range={range}
      />
    );
  }

  if (activePanelDraw) {
    if (role === "lender") {
      return (
        <LenderDrawReviewPanel
          approvedDrawLimit={approvedDrawLimit}
          draw={activePanelDraw}
          drawItem={activePanelDrawItem}
          draws={draws}
          items={items}
          onReviewDrawRequest={onReviewDrawRequest}
        />
      );
    }

    return (
      <DrawRequestPanel
        approvedDrawLimit={approvedDrawLimit}
        draw={activePanelDraw}
        drawItem={activePanelDrawItem}
        draws={draws}
        items={items}
        onSubmitDrawRequest={onSubmitDrawRequest}
        onUpdatePlannedDraw={onUpdatePlannedDraw}
        requiresApprovedMilestones={requiresApprovedDrawMilestones}
      />
    );
  }

  if (role === "lender") {
    return (
      <div className="grid gap-4">
        <TimelineModificationRequestsPanel
          onReviewModificationRequest={onReviewModificationRequest}
          requests={modificationRequests}
        />
        <LenderMilestoneReviewPanel
          activeItem={activeItem}
          canApproveMilestoneCompletion={canApproveMilestoneCompletion}
          contractorPlanning={contractorPlanning}
          items={items}
          onCreateMilestoneSiteVisit={onCreateMilestoneSiteVisit}
          onRecordMilestoneSiteVisit={onRecordMilestoneSiteVisit}
          onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
          onReviewMilestoneCompletion={onReviewMilestoneCompletion}
          overview={overview}
        />
      </div>
    );
  }

  return (
    <MilestoneOperationsPanel
      activeDraw={activeDraw}
      activeItem={activeItem}
      addEvidenceFiles={addEvidenceFiles}
      contractorPlanning={contractorPlanning}
      onCompleteMilestone={onCompleteMilestone}
      onRemoveEvidenceAsset={onRemoveEvidenceAsset}
      onUpdateEvidenceAsset={onUpdateEvidenceAsset}
      onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
      onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
      overview={overview}
      range={range}
    />
  );
}

function DrawPlanSummaryPanel({
  draw,
  drawItem,
  overview,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  overview: FinancialOverview;
}) {
  return (
    <div className="grid gap-4" data-testid="selected-draw-plan-summary">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-sky-500/10 text-sky-600">
          <Banknote className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Planned draw
        </p>
        <h2 className="mt-1 font-semibold text-lg">{draw.label}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Planned amount</dt>
          <dd className="font-semibold tabular-nums">{money(draw.amount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Timing</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(draw.x)}
          </dd>
        </div>
        {draw.requestStatus ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Request status</dt>
            <dd className="font-medium capitalize">{draw.requestStatus}</dd>
          </div>
        ) : null}
      </dl>

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

function MilestonePlanSummaryPanel({
  activeDraw,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  onUpdateMilestoneDrawAvailability,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  overview,
  range,
}: {
  activeDraw: DemoDraw | null;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
}) {
  const milestone = activeItem.data;

  if (!milestone) {
    return null;
  }
  const drawAvailabilityAmount = getMilestoneDrawAvailabilityAmount(milestone);
  const cumulativeDrawPosition = resolveMilestoneCumulativeDrawPosition(
    activeItem,
    drawAvailabilityData,
    range
  );

  return (
    <div className="grid gap-4" data-testid="selected-milestone-plan-summary">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <ReceiptText className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Planned milestone
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Scheduled from {formatTimelineDay(activeItem.x)} to{" "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
        </p>
        <Badge className="mt-3" variant="outline">
          Proposal planning
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Milestone cost</dt>
          <dd className="font-semibold tabular-nums">
            {money(milestone.amount)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw availability unlocked</dt>
          <dd className="font-semibold tabular-nums">
            <EditableNumberChip
              ariaLabel="Draw availability unlocked"
              disabled={!onUpdateMilestoneDrawAvailability}
              formatDisplay={(value) => money(value)}
              inputWidth="5.75rem"
              min={0}
              onCommit={(amount) =>
                onUpdateMilestoneDrawAvailability?.(activeItem.id, amount)
              }
              prefix="$"
              reserveWidth="7.25rem"
              size="metric-sm"
              step={1000}
              testId={`timeline-selected-milestone-draw-availability-${activeItem.id}`}
              value={drawAvailabilityAmount}
              weight="semibold"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-medium tabular-nums">
            {milestone.durationDays} days
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(
              resolveSelectedDrawDate(activeItem, activeDraw, range)
            )}
          </dd>
        </div>
      </dl>

      <section
        aria-label="Cumulative draw position at milestone unlock"
        className="grid gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3"
        data-testid="selected-milestone-cumulative-draw-position"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[10px] text-sky-700 uppercase dark:text-sky-200">
              Cumulative through unlock
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              As of {formatTimelineDay(cumulativeDrawPosition.day)} (includes
              this milestone&apos;s unlock)
            </p>
          </div>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total unlocked</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-total-unlocked"
            >
              {money(cumulativeDrawPosition.totalUnlocked)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total drawn</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-total-drawn"
            >
              {money(cumulativeDrawPosition.totalDrawn)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Available to draw</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-available-to-draw"
            >
              {money(cumulativeDrawPosition.availableToDraw)}
            </dd>
          </div>
        </dl>
      </section>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        onUpdateBudget={
          onUpdateSubmilestoneBudget
            ? (submilestoneKey, budgetCents) =>
                onUpdateSubmilestoneBudget(
                  activeItem.id,
                  submilestoneKey,
                  budgetCents
                )
            : undefined
        }
        onUpdateDuration={
          onUpdateSubmilestoneDuration
            ? (submilestoneKey, durationDays) =>
                onUpdateSubmilestoneDuration(
                  activeItem.id,
                  submilestoneKey,
                  durationDays
                )
            : undefined
        }
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-selected-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-selected-milestone-contractor"
      />

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

function TimelineModificationRequestsPanel({
  onReviewModificationRequest,
  requests,
}: {
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  requests: TimelineModificationRequestView[];
}) {
  const pendingRequests = requests.filter(
    (request) => request.status === "requested"
  );

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <section
      className="grid gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3"
      data-testid="timeline-modification-requests-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[10px] text-amber-800 uppercase dark:text-amber-100">
            Requested timeline changes
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Structural edits apply only after lender admin approval.
          </p>
        </div>
        <Badge variant="warning">{pendingRequests.length}</Badge>
      </div>
      <div className="grid gap-2">
        {pendingRequests.map((request, index) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-background/80 p-2"
            data-testid={`timeline-modification-request-${request._id ?? index}`}
            key={request._id ?? `${request.requestType}-${index}`}
          >
            <div>
              <p className="font-medium text-sm">
                {getTimelineModificationRequestTitle(request)}
              </p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {getTimelineModificationRequestDetail(request)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                disabled={!request._id}
                onClick={() =>
                  onReviewModificationRequest(request, {
                    status: "rejected",
                  })
                }
                size="xs"
                type="button"
                variant="outline"
              >
                Reject
              </Button>
              <Button
                disabled={!request._id}
                onClick={() =>
                  onReviewModificationRequest(request, {
                    status: "approved",
                  })
                }
                size="xs"
                type="button"
              >
                Approve
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function getTimelineModificationRequestTitle(
  request: TimelineModificationRequestView
) {
  if (request.requestType === "createMilestone") {
    return "Request milestone";
  }

  if (request.requestType === "deleteMilestone") {
    return "Request deletion";
  }

  return "Request budget change";
}

function getTimelineModificationRequestDetail(
  request: TimelineModificationRequestView
) {
  if (request.requestType === "createMilestone") {
    return request.requestedPayload?.milestone?.name ?? "New milestone";
  }

  if (request.requestType === "deleteMilestone") {
    return request.milestoneKey ?? "Milestone deletion";
  }

  const requestedBudget =
    typeof request.requestedPayload?.budgetCents === "number"
      ? money(request.requestedPayload.budgetCents / 100)
      : "requested budget";
  return `${request.milestoneKey ?? "Milestone"} to ${requestedBudget}`;
}

function TimelineRoleSwitcher({
  onRoleChange,
  role,
}: {
  onRoleChange: (role: TimelineDemoRole) => void;
  role: TimelineDemoRole;
}) {
  const options = [
    {
      icon: UserRound,
      id: "builder" as const,
      label: "Builder",
      sublabel: "Borrower",
    },
    {
      icon: ShieldCheck,
      id: "lender" as const,
      label: "Lender",
      sublabel: "Backoffice",
    },
  ];

  return (
    <div
      aria-label="Timeline role"
      className="grid grid-cols-2 rounded-lg border border-border bg-background p-0.5 shadow-xs"
      data-testid="timeline-role-switcher"
      role="group"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = role === option.id;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-left font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground text-background shadow-xs"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            data-testid={`timeline-role-${option.id}`}
            key={option.id}
            onClick={() => onRoleChange(option.id)}
            type="button"
          >
            <Icon className="size-3.5" />
            <span className="grid leading-tight">
              <span>{option.label}</span>
              <span className="hidden text-[9px] opacity-70 xl:block">
                {option.sublabel}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MilestoneOperationsPanel({
  activeDraw,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  onCompleteMilestone,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  overview,
  range,
}: {
  activeDraw: DemoDraw | null;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
}) {
  const milestone = activeItem.data;

  if (!milestone) {
    return null;
  }

  const evidenceAssets = milestone.evidencePackage?.assets ?? [];
  const completionClaim = milestone.completionClaim;
  const completed = Boolean(completionClaim);
  const effectiveCost = getMilestoneEffectiveCashSpendAmount(milestone);
  const approvedBudget = Math.max(0, Math.round(milestone.amount));
  const costAdjusted = completionClaim && effectiveCost !== approvedBudget;

  return (
    <div className="grid gap-4" data-testid="selected-draw-details">
      <div>
        <div
          className={cn(
            "mb-3 grid size-10 place-items-center rounded-md",
            completed
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-rose-500/10 text-rose-600"
          )}
        >
          {completed ? (
            <Check className="size-5" />
          ) : (
            <CircleDollarSign className="size-5" />
          )}
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Selected milestone
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {completionClaim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem))
            ? "Completed on "
            : "Milestone completes on "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
          {completionClaim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem)) ? (
            <span className="text-muted-foreground/80">
              {" "}
              (planned {formatTimelineDay(getMilestonePlannedEndX(activeItem))})
            </span>
          ) : null}
        </p>
        <Badge className="mt-3" variant={completed ? "success" : "outline"}>
          {completed ? "Builder marked complete" : "Awaiting completion claim"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Milestone date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(activeItem.x)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(
              resolveSelectedDrawDate(activeItem, activeDraw, range)
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">
            {costAdjusted ? "Effective cost" : "Milestone cost"}
          </dt>
          <dd className="font-semibold tabular-nums">
            {money(costAdjusted ? effectiveCost : approvedBudget)}
          </dd>
        </div>
        {costAdjusted ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Approved budget</dt>
            <dd className="font-medium tabular-nums">
              {money(approvedBudget)}
            </dd>
          </div>
        ) : null}
        {completionClaim ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Completed</dt>
              <dd
                className="font-medium tabular-nums"
                data-testid={`selected-draw-completed-day-${activeItem.id}`}
              >
                {formatTimelineDay(completionClaim.completedDay)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Actual cost</dt>
              <dd
                className="font-semibold tabular-nums"
                data-testid={`selected-draw-actual-cost-${activeItem.id}`}
              >
                {completionClaim.actualCost === undefined
                  ? "Not provided"
                  : money(completionClaim.actualCost)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        onUpdateBudget={
          onUpdateSubmilestoneBudget
            ? (submilestoneKey, budgetCents) =>
                onUpdateSubmilestoneBudget(
                  activeItem.id,
                  submilestoneKey,
                  budgetCents
                )
            : undefined
        }
        onUpdateDuration={
          onUpdateSubmilestoneDuration
            ? (submilestoneKey, durationDays) =>
                onUpdateSubmilestoneDuration(
                  activeItem.id,
                  submilestoneKey,
                  durationDays
                )
            : undefined
        }
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-selected-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-selected-milestone-contractor"
      />

      <CompletionClaimPanel
        activeItem={activeItem}
        evidenceCount={evidenceAssets.length}
        onCompleteMilestone={onCompleteMilestone}
      />

      <EvidencePackagePanel
        activeItem={activeItem}
        addEvidenceFiles={addEvidenceFiles}
        onRemoveEvidenceAsset={onRemoveEvidenceAsset}
        onUpdateEvidenceAsset={onUpdateEvidenceAsset}
      />

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

function LenderMilestoneReviewPanel({
  activeItem,
  canApproveMilestoneCompletion,
  contractorPlanning,
  items,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onReviewMilestoneCompletion,
  overview,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  canApproveMilestoneCompletion: boolean;
  contractorPlanning?: ContractorPlanningModel | null;
  items: TimelineItem<DemoMilestone>[];
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void>;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown>;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  overview: FinancialOverview;
}) {
  const milestone = activeItem.data;
  const usesExternalSiteVisitPersistence = Boolean(onCreateMilestoneSiteVisit);
  const workspace = useQuery(
    api.demo_drawflow.demo_getWorkspace,
    usesExternalSiteVisitPersistence ? "skip" : { scenario: "active" }
  );
  const seedDemo = useMutation(api.demo_drawflow.demo_seedDrawFlowDemo);
  const requestSiteVisit = useMutation(api.demo_drawflow.demo_requestSiteVisit);
  const [siteVisitPending, setSiteVisitPending] = useState(false);
  const [siteVisitError, setSiteVisitError] = useState("");
  useEffect(() => {
    if (workspace?.needsSeed) {
      void seedDemo({});
    }
  }, [seedDemo, workspace?.needsSeed]);

  if (!milestone) {
    return null;
  }

  const claim = milestone.completionClaim;
  const review = milestone.completionReview;
  const siteVisit = review?.siteVisit;
  const effectiveCost = getMilestoneEffectiveCashSpendAmount(milestone);
  const approvedBudget = Math.max(0, Math.round(milestone.amount));
  const costAdjusted = claim && effectiveCost !== approvedBudget;
  const liveSiteVisit = findLiveSiteVisit(workspace, siteVisit?.visitId);
  const liveStatus = normalizeTimelineSiteVisitStatus(
    liveSiteVisit?.status ?? siteVisit?.status,
    liveSiteVisit?.tokenExpiresAt ?? siteVisit?.tokenExpiresAt
  );
  const siteVisitUrl = buildAbsoluteSiteVisitUrl(siteVisit?.url);
  const eligibleSiteVisitItems = items.slice(
    0,
    Math.max(
      0,
      items.findIndex((item) => item.id === activeItem.id)
    ) + 1
  );
  const evidenceAssets = milestone.evidencePackage?.assets ?? [];
  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status =
      submitter?.value === "approved" ? "approved" : "revisionRequested";
    const note = String(formData.get("reviewNote") ?? "").trim();

    onReviewMilestoneCompletion(activeItem.id, {
      ...(note ? { note } : {}),
      status,
    });
  };
  const submitSiteVisit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedDay = Math.round(
      Number(formData.get("siteVisitDay") ?? getMilestoneEndX(activeItem))
    );
    const note = String(formData.get("siteVisitNote") ?? "").trim();
    const includedItemIds = Array.from(
      new Set(
        [
          ...formData.getAll("includedSiteVisitItemId").map(String),
          activeItem.id,
        ].filter(Boolean)
      )
    );

    if (!Number.isFinite(requestedDay)) {
      return;
    }

    setSiteVisitError("");
    setSiteVisitPending(true);
    try {
      const requestPayload = {
        includedItemIds,
        ...(note ? { note } : {}),
        requestedDay,
        status: "requested",
      } satisfies TimelineSiteVisitRequestInput;
      const result = onCreateMilestoneSiteVisit
        ? await onCreateMilestoneSiteVisit(activeItem.id, requestPayload)
        : await requestDemoTimelineSiteVisit({
            activeItem,
            includedItemIds,
            milestone,
            note,
            requestSiteVisit,
            seedDemo,
            workspace,
          });

      onRequestMilestoneSiteVisit(activeItem.id, {
        ...requestPayload,
        ...(result ?? {}),
        ...(result?.url
          ? {
              url: normalizeSiteVisitTokenRoute({
                url: result.url,
              }),
            }
          : {}),
      });
    } catch (error) {
      setSiteVisitError(
        error instanceof Error
          ? error.message
          : "Unable to generate site visit token."
      );
    } finally {
      setSiteVisitPending(false);
    }
  };
  const recordSiteVisitComplete = async () => {
    if (!(siteVisit?.visitId && onRecordMilestoneSiteVisit)) {
      return;
    }
    setSiteVisitError("");
    setSiteVisitPending(true);
    try {
      await onRecordMilestoneSiteVisit(activeItem.id, {
        ...siteVisit,
        note: "Site visit completed from timeline review.",
        requestedDay: siteVisit.requestedDay,
        status: "complete",
        visitId: siteVisit.visitId,
      });
      onRequestMilestoneSiteVisit(activeItem.id, {
        ...siteVisit,
        note: siteVisit.note,
        requestedDay: siteVisit.requestedDay,
        status: "complete",
      });
    } catch (error) {
      setSiteVisitError(
        error instanceof Error ? error.message : "Unable to record site visit."
      );
    } finally {
      setSiteVisitPending(false);
    }
  };

  return (
    <div
      className="grid gap-4"
      data-testid={`lender-milestone-review-panel-${activeItem.id}`}
    >
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-200">
          <ClipboardCheck className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Lender milestone review
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {claim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem))
            ? "Completed on "
            : "Milestone completes on "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
          {claim &&
          Math.round(getMilestonePlannedEndX(activeItem)) !==
            Math.round(getMilestoneEndX(activeItem)) ? (
            <span className="text-muted-foreground/80">
              {" "}
              (planned {formatTimelineDay(getMilestonePlannedEndX(activeItem))})
            </span>
          ) : null}
        </p>
        <Badge
          className="mt-3"
          variant={
            review?.status === "approved"
              ? "success"
              : claim
                ? "outline"
                : "secondary"
          }
        >
          {review?.status === "approved"
            ? "Completion approved"
            : review?.status === "revisionRequested"
              ? "Revision requested"
              : claim
                ? "Claim ready for review"
                : "No completion claim"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">
            {costAdjusted ? "Effective cost" : "Milestone cost"}
          </dt>
          <dd className="font-semibold tabular-nums">
            {money(costAdjusted ? effectiveCost : approvedBudget)}
          </dd>
        </div>
        {costAdjusted ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Approved budget</dt>
            <dd className="font-medium tabular-nums">
              {money(approvedBudget)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Claimed complete</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`lender-milestone-claimed-day-${activeItem.id}`}
          >
            {claim ? formatTimelineDay(claim.completedDay) : "Not claimed"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Actual cost</dt>
          <dd className="font-medium tabular-nums">
            {claim?.actualCost === undefined
              ? "Not provided"
              : money(claim.actualCost)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="font-medium tabular-nums">
            {evidenceAssets.length} images
          </dd>
        </div>
      </dl>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-lender-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-lender-milestone-contractor"
      />

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-milestone-review-form-${activeItem.id}`}
        onSubmit={submitReview}
      >
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Completion review
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {canApproveMilestoneCompletion
              ? "Approve the builder claim or send it back for revision."
              : "Review the builder claim and send it back for revision when more information is required. Final approval is reserved for a lender admin."}
          </p>
        </div>
        {claim?.note ? (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Builder note: </span>
            {claim.note}
          </div>
        ) : null}
        <Textarea
          className="min-h-20 resize-none text-sm"
          data-testid={`lender-milestone-review-note-${activeItem.id}`}
          defaultValue={review?.note ?? ""}
          name="reviewNote"
          placeholder="Review note, missing evidence, or approval context"
        />
        <div
          className={cn(
            "grid gap-2",
            canApproveMilestoneCompletion && "grid-cols-2"
          )}
        >
          <Button
            data-testid={`lender-milestone-request-revision-${activeItem.id}`}
            disabled={!claim}
            name="reviewStatus"
            size="sm"
            type="submit"
            value="revisionRequested"
            variant="outline"
          >
            <AlertTriangle />
            Request revision
          </Button>
          {canApproveMilestoneCompletion ? (
            <Button
              data-testid={`lender-milestone-approve-${activeItem.id}`}
              disabled={!claim}
              name="reviewStatus"
              size="sm"
              type="submit"
              value="approved"
            >
              <Check />
              Approve
            </Button>
          ) : null}
        </div>
      </form>

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-site-visit-form-${activeItem.id}`}
        onSubmit={submitSiteVisit}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-[10px] text-muted-foreground uppercase">
              Site visit request
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Queue field verification without changing borrower state.
            </p>
          </div>
          <Badge
            variant={
              liveStatus === "complete"
                ? "success"
                : siteVisit
                  ? "outline"
                  : "secondary"
            }
          >
            {siteVisit ? liveStatus : "Optional"}
          </Badge>
        </div>
        <div className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Scope
          </span>
          <div className="grid gap-1.5">
            {eligibleSiteVisitItems.map((item) => {
              const checked =
                item.id === activeItem.id ||
                (siteVisit?.includedItemIds?.includes(item.id) ?? false);
              return (
                <label
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs"
                  key={`${activeItem.id}:${item.id}:${siteVisit?.visitId ?? "draft"}`}
                >
                  <input
                    className="size-3.5"
                    defaultChecked={checked}
                    disabled={item.id === activeItem.id || siteVisitPending}
                    name="includedSiteVisitItemId"
                    type="checkbox"
                    value={item.id}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.data?.name ?? item.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Target day
          </span>
          <Input
            data-testid={`lender-site-visit-day-${activeItem.id}`}
            defaultValue={siteVisit?.requestedDay ?? Math.round(activeItem.x)}
            min={0}
            name="siteVisitDay"
            nativeInput
            size="sm"
            type="number"
          />
        </label>
        <Textarea
          className="min-h-20 resize-none text-sm"
          data-testid={`lender-site-visit-note-${activeItem.id}`}
          defaultValue={siteVisit?.note ?? ""}
          name="siteVisitNote"
          placeholder="Inspector assignment, scope to verify, access notes"
        />
        {siteVisitUrl ? (
          <div
            className="grid gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-xs"
            data-testid={`lender-site-visit-share-link-${activeItem.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-emerald-800 dark:text-emerald-100">
                Shareable site visit link
              </span>
              <Badge variant="outline">{liveStatus}</Badge>
            </div>
            <a
              className="break-all font-mono text-[11px] text-primary underline-offset-2 hover:underline"
              href={siteVisitUrl}
              rel="noreferrer"
              target="_blank"
            >
              {siteVisitUrl}
            </a>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!siteVisitUrl}
                onClick={() =>
                  void navigator.clipboard?.writeText(siteVisitUrl)
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy />
                Copy
              </Button>
              <Button
                render={
                  <a href={siteVisitUrl} rel="noreferrer" target="_blank">
                    Open
                  </a>
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <ExternalLink />
                Open
              </Button>
            </div>
            {liveSiteVisit?.tokenExpiresAt ? (
              <p className="text-muted-foreground">
                Token expires{" "}
                {formatTimelineDateTime(liveSiteVisit.tokenExpiresAt)}.
              </p>
            ) : siteVisit?.tokenExpiresAt ? (
              <p className="text-muted-foreground">
                Token expires {formatTimelineDateTime(siteVisit.tokenExpiresAt)}
                .
              </p>
            ) : null}
            {onRecordMilestoneSiteVisit && liveStatus !== "complete" ? (
              <Button
                data-testid={`lender-site-visit-record-${activeItem.id}`}
                disabled={siteVisitPending}
                onClick={recordSiteVisitComplete}
                size="sm"
                type="button"
                variant="outline"
              >
                <Check />
                Record visit complete
              </Button>
            ) : null}
          </div>
        ) : null}
        {siteVisitError ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
            data-testid={`lender-site-visit-error-${activeItem.id}`}
          >
            {siteVisitError}
          </div>
        ) : null}
        <Button
          data-testid={`lender-site-visit-submit-${activeItem.id}`}
          disabled={siteVisitPending || liveStatus === "complete"}
          size="sm"
          type="submit"
          variant="outline"
        >
          {siteVisitPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <MapPinned />
          )}
          {siteVisitPending
            ? "Generating token..."
            : siteVisit
              ? "Regenerate site visit link"
              : "Request site visit"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Evidence queue
        </p>
        <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto pr-1">
          {evidenceAssets.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No evidence submitted yet.
            </p>
          ) : (
            evidenceAssets.map((asset) => (
              <div
                className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs"
                key={asset.id}
              >
                <Eye className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{asset.label}</span>
                <span className="text-muted-foreground">{asset.tag}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

export function DrawRequestPanel({
  draw,
  drawItem,
  draws,
  items,
  onSubmitDrawRequest,
  onUpdatePlannedDraw,
  requiresApprovedMilestones,
  approvedDrawLimit,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  requiresApprovedMilestones: boolean;
  approvedDrawLimit?: number;
}) {
  const [requestedDay, setRequestedDay] = useState(() => Math.round(draw.x));
  const [requestedAmount, setRequestedAmount] = useState(() =>
    Math.round(draw.amount)
  );
  useEffect(() => {
    setRequestedDay(Math.round(draw.x));
    setRequestedAmount(Math.round(draw.amount));
  }, [draw.amount, draw.x]);
  const requestedDraw = { ...draw, x: requestedDay };
  const predictedLimit = calculateDrawRequestLimit(
    requestedDraw,
    items,
    draws,
    approvedDrawLimit
  );
  const requestableLimit = requiresApprovedMilestones
    ? calculateApprovedDrawRequestLimit(
        requestedDraw,
        items,
        draws,
        approvedDrawLimit
      )
    : predictedLimit;
  const blockingMilestones =
    "blockingMilestones" in requestableLimit
      ? requestableLimit.blockingMilestones
      : [];
  const overLimit = requestedAmount > requestableLimit.availableLimit;
  const blockedByMilestoneApproval =
    requiresApprovedMilestones && blockingMilestones.length > 0;
  const requestSubmitted =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestAmountId = `draw-request-amount-${draw.id}`;
  const requestNoteId = `draw-request-note-${draw.id}`;
  const plannedDrawEditable = !requestSubmitted;

  const savePlannedDraw = () => {
    if (!plannedDrawEditable) {
      return;
    }
    onUpdatePlannedDraw(draw.id, {
      amount: requestedAmount,
      x: requestedDay,
    });
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedAmount = Math.round(
      Number(formData.get("drawRequestAmount") ?? draw.amount)
    );
    const requestedX = Math.round(
      Number(formData.get("drawRequestDate") ?? draw.x)
    );
    const note = String(formData.get("drawRequestNote") ?? "").trim();

    if (!(Number.isFinite(requestedAmount) && Number.isFinite(requestedX))) {
      return;
    }

    const requestedDraw = { ...draw, x: requestedX };
    const requestLimit = requiresApprovedMilestones
      ? calculateApprovedDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        )
      : calculateDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        );

    onSubmitDrawRequest(draw.id, {
      amount: Math.min(
        Math.max(0, requestedAmount),
        requestLimit.availableLimit
      ),
      ...(note ? { note } : {}),
      x: requestedX,
    });
  };

  return (
    <div className="grid gap-4" data-testid="selected-draw-details">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-sky-500/10 text-sky-600">
          <Banknote className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Draw request
        </p>
        <h2 className="mt-1 font-semibold text-lg">{draw.label}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
        <Badge
          className="mt-3"
          variant={draw.requestStatus === "approved" ? "success" : "outline"}
        >
          {requestSubmitted
            ? getDrawRequestStatusLabel(draw.requestStatus)
            : "Builder request"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Unlocked by day</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid={`selected-draw-total-unlocked-${getDrawDomId(draw)}`}
          >
            {money(predictedLimit.totalUnlocked)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Already drawn</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-already-drawn-${getDrawDomId(draw)}`}
          >
            {money(requestableLimit.alreadyDrawn)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available draw limit</dt>
          <dd
            className="font-semibold text-sky-700 tabular-nums dark:text-sky-100"
            data-testid={`selected-draw-available-limit-${getDrawDomId(draw)}`}
          >
            {money(requestableLimit.availableLimit)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Remaining after request</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-remaining-limit-${getDrawDomId(draw)}`}
          >
            {money(
              Math.max(0, requestableLimit.availableLimit - requestedAmount)
            )}
          </dd>
        </div>
      </dl>

      {overLimit ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-request-limit-warning-${getDrawDomId(draw)}`}
        >
          The current requested amount is above the available request limit.
          Submitting will clamp the request to{" "}
          {money(requestableLimit.availableLimit)}.
        </div>
      ) : null}

      {blockedByMilestoneApproval ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-approval-blockers-${getDrawDomId(draw)}`}
        >
          Complete and admin-approve these milestones before requesting this
          draw: {blockingMilestones.join(", ")}.
        </div>
      ) : null}

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`selected-draw-request-form-${getDrawDomId(draw)}`}
        key={`${draw.id}-${draw.requestedAt ?? "draft"}-${draw.amount}-${draw.x}`}
        onSubmit={submitRequest}
      >
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Builder draw request
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Request reimbursement up to the unlocked capacity available on this
            draw date.
          </p>
        </div>

        <label
          className="grid gap-1.5"
          htmlFor={`draw-request-date-${draw.id}`}
        >
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Draw date
          </span>
          <Input
            data-testid={`selected-draw-request-date-input-${getDrawDomId(draw)}`}
            id={`draw-request-date-${draw.id}`}
            min={0}
            name="drawRequestDate"
            nativeInput
            onChange={(event) =>
              setRequestedDay(Math.round(Number(event.currentTarget.value)))
            }
            size="sm"
            step={1}
            type="number"
            value={requestedDay}
          />
        </label>

        <label className="grid gap-1.5" htmlFor={requestAmountId}>
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Requested amount
          </span>
          <Input
            data-testid={`selected-draw-request-amount-input-${getDrawDomId(draw)}`}
            id={requestAmountId}
            max={requestableLimit.availableLimit}
            min={0}
            name="drawRequestAmount"
            nativeInput
            onChange={(event) =>
              setRequestedAmount(Math.round(Number(event.currentTarget.value)))
            }
            size="sm"
            step={1000}
            type="number"
            value={requestedAmount}
          />
        </label>

        <label className="grid gap-1.5" htmlFor={requestNoteId}>
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Builder note
          </span>
          <Textarea
            className="min-h-20 resize-none text-sm"
            data-testid={`selected-draw-request-note-${getDrawDomId(draw)}`}
            defaultValue={draw.requestNote ?? ""}
            id={requestNoteId}
            name="drawRequestNote"
            placeholder="Scope covered, evidence reference, or lender context"
          />
        </label>

        <Button
          className="w-full"
          data-testid={`selected-draw-save-planned-${getDrawDomId(draw)}`}
          disabled={!plannedDrawEditable}
          onClick={savePlannedDraw}
          size="sm"
          type="button"
          variant="outline"
        >
          <CalendarDays />
          Save planned draw
        </Button>

        <Button
          className="w-full"
          data-testid={`selected-draw-submit-request-${getDrawDomId(draw)}`}
          disabled={
            blockedByMilestoneApproval || requestableLimit.availableLimit <= 0
          }
          size="sm"
          type="submit"
        >
          <Banknote />
          {requestSubmitted ? "Update draw request" : "Request draw"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Request basis
        </p>
        <p className="mt-2 text-muted-foreground text-xs leading-5">
          Unlocked by day shows scheduled milestone capacity. Request limit ={" "}
          {requiresApprovedMilestones
            ? "admin-approved completed milestone budget"
            : "total completed milestone budget"}{" "}
          unlocked by {formatTimelineDay(requestedDay)} minus prior released
          draws. Completion and evidence are handled from the milestone panel.
        </p>
      </div>
    </div>
  );
}

export function LenderDrawReviewPanel({
  draw,
  drawItem,
  draws,
  items,
  onReviewDrawRequest,
  approvedDrawLimit,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  approvedDrawLimit?: number;
}) {
  const limit = calculateDrawRequestLimit(
    draw,
    items,
    draws,
    approvedDrawLimit
  );
  const hasBuilderRequest =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestedAmountOverLimit = draw.amount > limit.availableLimit;
  const drawDomId = getDrawDomId(draw);
  const reviewTitleId = `lender-draw-review-title-${drawDomId}`;
  const decisionTitleId = `lender-draw-decision-title-${drawDomId}`;
  const reviewNoteId = `lender-draw-review-note-${drawDomId}`;
  const approvalGuidanceId = `lender-draw-approval-guidance-${drawDomId}`;
  const approvalGuidance = hasBuilderRequest
    ? requestedAmountOverLimit
      ? "Approve is unavailable because the requested amount exceeds the available draw limit."
      : ""
    : "Approve is unavailable until the builder files a draw request.";
  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status = submitter?.value === "approved" ? "approved" : "rejected";
    const note = String(formData.get("drawReviewNote") ?? "").trim();

    onReviewDrawRequest(draw.id, {
      ...(note ? { note } : {}),
      status,
    });
  };

  return (
    <section
      aria-labelledby={reviewTitleId}
      className="grid gap-4"
      data-testid={`lender-draw-review-panel-${drawDomId}`}
    >
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <ShieldCheck className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Lender draw review
        </p>
        <h2 className="mt-1 font-semibold text-lg" id={reviewTitleId}>
          {draw.label} lender draw review
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
        <Badge
          className="mt-3"
          variant={draw.requestStatus === "approved" ? "success" : "outline"}
        >
          {getDrawRequestStatusLabel(draw.requestStatus)}
        </Badge>
      </div>

      <dl
        aria-label={`${draw.label} review financial summary`}
        className="grid gap-2 border-border border-t pt-3 text-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Requested amount</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid={`lender-draw-requested-amount-${getDrawDomId(draw)}`}
          >
            {money(draw.amount)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available limit</dt>
          <dd
            className="font-semibold text-sky-700 tabular-nums dark:text-sky-100"
            data-testid={`lender-draw-available-limit-${getDrawDomId(draw)}`}
          >
            {money(limit.availableLimit)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Prior releases</dt>
          <dd className="font-medium tabular-nums">
            {money(limit.alreadyDrawn)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Post-approval capacity</dt>
          <dd className="font-medium tabular-nums">
            {money(Math.max(0, limit.availableLimit - draw.amount))}
          </dd>
        </div>
      </dl>

      {requestedAmountOverLimit ? (
        <div
          aria-label="Requested amount exceeds the available draw limit."
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          role="alert"
        >
          Requested amount exceeds the available draw limit at this point in the
          schedule.
        </div>
      ) : null}

      <form
        aria-labelledby={decisionTitleId}
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-draw-review-form-${drawDomId}`}
        onSubmit={submitReview}
      >
        <div>
          <p
            className="font-medium text-[10px] text-muted-foreground uppercase"
            id={decisionTitleId}
          >
            Draw approval decision
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Review the builder request against unlocked capacity and release
            policy.
          </p>
        </div>
        {draw.requestNote ? (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Builder note: </span>
            {draw.requestNote}
          </div>
        ) : null}
        {hasBuilderRequest ? null : (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-muted-foreground text-xs">
            No builder request has been filed for this draw. The review actions
            stay disabled until a request exists.
          </div>
        )}
        <label className="grid gap-1.5" htmlFor={reviewNoteId}>
          <span className="font-medium text-xs">
            Review reason or condition
          </span>
          <Textarea
            className="min-h-20 resize-none text-sm"
            data-testid={`lender-draw-review-note-${drawDomId}`}
            defaultValue={draw.requestReviewNote ?? ""}
            id={reviewNoteId}
            name="drawReviewNote"
            placeholder="Approval condition, holdback reason, or audit note"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="max-sm:min-h-11"
            data-testid={`lender-draw-reject-${drawDomId}`}
            disabled={!hasBuilderRequest}
            name="drawReviewStatus"
            size="sm"
            type="submit"
            value="rejected"
            variant="outline"
          >
            <X />
            Reject
          </Button>
          <Button
            aria-describedby={approvalGuidance ? approvalGuidanceId : undefined}
            className="max-sm:min-h-11"
            data-testid={`lender-draw-approve-${drawDomId}`}
            disabled={!hasBuilderRequest || requestedAmountOverLimit}
            name="drawReviewStatus"
            size="sm"
            type="submit"
            value="approved"
          >
            <Check />
            Approve
          </Button>
        </div>
        {approvalGuidance ? (
          <p className="text-muted-foreground text-xs" id={approvalGuidanceId}>
            {approvalGuidance}
          </p>
        ) : null}
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Review basis
        </p>
        <p className="mt-2 text-muted-foreground text-xs leading-5">
          Approval is capped by work completed before{" "}
          {formatTimelineDay(draw.x)}, less any prior releases. Site visits and
          completion evidence are reviewed from the milestone panel.
        </p>
      </div>
    </section>
  );
}

async function requestDemoTimelineSiteVisit({
  activeItem,
  includedItemIds,
  milestone,
  note,
  requestSiteVisit,
  seedDemo,
  workspace,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  includedItemIds: string[];
  milestone: DemoMilestone;
  note: string;
  requestSiteVisit: (input: any) => Promise<{
    tokenExpiresAt: number;
    url: string;
    visitId: string;
  }>;
  seedDemo: (input: Record<string, never>) => Promise<unknown>;
  workspace: any;
}): Promise<TimelineSiteVisitRequestInput> {
  if (workspace?.needsSeed) {
    await seedDemo({});
  }
  const result = await requestSiteVisit({
    includedMilestoneKeys: includedItemIds.map(
      resolveTimelineSiteVisitMilestoneKey
    ),
    milestoneKey: resolveTimelineSiteVisitMilestoneKey(activeItem.id),
    persona: "lender_admin",
    reason:
      note ||
      `Field verification requested from timeline for ${milestone.name}.`,
  });
  return {
    tokenExpiresAt: result.tokenExpiresAt,
    url: result.url,
    visitId: result.visitId,
  };
}

function CompletionClaimPanel({
  activeItem,
  evidenceCount,
  onCompleteMilestone,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  evidenceCount: number;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
}) {
  const milestone = activeItem.data;
  const claim = milestone?.completionClaim;
  const schedule = getMilestonePaymentSchedule(activeItem);

  if (!milestone) {
    return null;
  }

  const completeMilestone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const completedDay = Math.max(
      0,
      Math.round(Number(formData.get("completedDay") ?? schedule.endX))
    );
    const actualCostRaw = String(formData.get("actualCost") ?? "").trim();
    const actualCost =
      actualCostRaw.length === 0
        ? undefined
        : Math.max(0, Math.round(Number(actualCostRaw)));
    const qualityRatingRaw = String(formData.get("qualityRating") ?? "").trim();
    const qualityRating =
      qualityRatingRaw.length === 0
        ? undefined
        : Math.max(1, Math.min(5, Math.round(Number(qualityRatingRaw))));
    const note = String(formData.get("completionNote") ?? "").trim();

    if (!Number.isFinite(completedDay)) {
      return;
    }

    if (actualCost !== undefined && !Number.isFinite(actualCost)) {
      return;
    }

    if (qualityRating !== undefined && !Number.isFinite(qualityRating)) {
      return;
    }

    onCompleteMilestone(activeItem.id, {
      ...(actualCost === undefined ? {} : { actualCost }),
      completedDay,
      ...(note ? { note } : {}),
      ...(qualityRating === undefined ? {} : { qualityRating }),
      ...(qualityRating !== undefined && note ? { qualityNote: note } : {}),
    });
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
      data-testid={`selected-draw-completion-form-${activeItem.id}`}
      key={`${activeItem.id}-${claim?.submittedAt ?? "draft"}`}
      onSubmit={completeMilestone}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Indicate completion
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Backdate the claim when work finished; actual cost is optional.
          </p>
        </div>
        <Badge variant={claim ? "success" : "outline"}>
          {claim ? "Filed" : "Builder"}
        </Badge>
      </div>

      {evidenceCount === 0 ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-completion-warning-${activeItem.id}`}
        >
          No evidence images attached. Completion can be filed, but the package
          will still need proof before lender review.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Completion day
          </span>
          <Input
            data-testid={`selected-draw-completion-day-input-${activeItem.id}`}
            defaultValue={
              claim?.completedDay ??
              Math.round(getMilestonePlannedEndX(activeItem))
            }
            min={0}
            name="completedDay"
            nativeInput
            size="sm"
            type="number"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Actual cost
          </span>
          <Input
            data-testid={`selected-draw-actual-cost-input-${activeItem.id}`}
            defaultValue={claim?.actualCost ?? ""}
            min={0}
            name="actualCost"
            nativeInput
            placeholder="Optional"
            size="sm"
            step={1000}
            type="number"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Work quality
          </span>
          <NativeSelect
            data-testid={`selected-draw-quality-rating-${activeItem.id}`}
            defaultValue={
              claim?.qualityRating === undefined
                ? ""
                : String(claim.qualityRating)
            }
            name="qualityRating"
            size="sm"
          >
            <NativeSelectOption value="">Not rated</NativeSelectOption>
            <NativeSelectOption value="5">5 · Excellent</NativeSelectOption>
            <NativeSelectOption value="4">4 · Good</NativeSelectOption>
            <NativeSelectOption value="3">3 · Acceptable</NativeSelectOption>
            <NativeSelectOption value="2">2 · Needs rework</NativeSelectOption>
            <NativeSelectOption value="1">1 · Deficient</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="font-medium text-[10px] text-muted-foreground uppercase">
          Note
        </span>
        <Textarea
          className="min-h-16 resize-none text-sm"
          data-testid={`selected-draw-completion-note-${activeItem.id}`}
          defaultValue={claim?.note ?? ""}
          name="completionNote"
          placeholder="Scope note, variance, or lender context"
        />
      </label>

      <Button
        className="w-full"
        data-testid={`selected-draw-submit-completion-${activeItem.id}`}
        size="sm"
        type="submit"
      >
        <Check />
        {claim ? "Update completion" : "Mark milestone complete"}
      </Button>
    </form>
  );
}

function EvidencePackagePanel({
  activeItem,
  addEvidenceFiles,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const milestone = activeItem.data;
  const assets = milestone?.evidencePackage?.assets ?? [];

  if (!milestone) {
    return null;
  }

  const inputId = `selected-evidence-input-${activeItem.id}`;
  const tagOptions = [milestone.name, ...milestone.subMilestones];
  const acceptFiles = (fileList: FileList | null) => {
    addEvidenceFiles(activeItem.id, Array.from(fileList ?? []));
  };
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
      data-testid={`selected-draw-evidence-package-${activeItem.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Evidence package
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Label images and tag the milestone or sub-milestone they prove.
          </p>
        </div>
        <Badge
          data-testid={`selected-draw-evidence-count-${activeItem.id}`}
          variant="outline"
        >
          {assets.length} images
        </Badge>
      </div>

      <input
        accept="image/*"
        className="sr-only"
        data-testid={`selected-draw-evidence-input-${activeItem.id}`}
        id={inputId}
        multiple
        onChange={handleInputChange}
        type="file"
      />
      <label
        className={cn(
          "grid cursor-pointer place-items-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragging
            ? "border-sky-400 bg-sky-500/10 text-sky-700"
            : "border-border bg-background/60 text-muted-foreground hover:border-sky-300 hover:bg-sky-500/5"
        )}
        data-testid={`selected-draw-evidence-dropzone-${activeItem.id}`}
        htmlFor={inputId}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={handleDrop}
      >
        <UploadCloud className="mb-2 size-5" />
        <span className="font-medium text-xs">Drop labeled proof images</span>
        <span className="mt-1 text-[11px]">or browse from this device</span>
      </label>

      <div className="grid max-h-[34svh] gap-2 overflow-y-auto pr-1">
        {assets.length === 0 ? (
          <div className="rounded-md border border-border bg-background/55 px-3 py-4 text-center text-muted-foreground text-xs">
            No images uploaded.
          </div>
        ) : (
          assets.map((asset) => (
            <EvidenceAssetCard
              asset={asset}
              itemId={activeItem.id}
              key={asset.id}
              onRemoveEvidenceAsset={onRemoveEvidenceAsset}
              onUpdateEvidenceAsset={onUpdateEvidenceAsset}
              tagOptions={tagOptions}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EvidenceAssetCard({
  asset,
  itemId,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
  tagOptions,
}: {
  asset: DemoEvidenceAsset;
  itemId: string;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  tagOptions: string[];
}) {
  return (
    <article
      className="grid grid-cols-[64px_minmax(0,1fr)_32px] gap-2 rounded-md border border-border bg-background/70 p-2"
      data-testid={`selected-draw-evidence-asset-${asset.id}`}
    >
      <div className="grid size-16 place-items-center overflow-hidden rounded-md border border-border bg-muted/35">
        {asset.previewUrl ? (
          <img
            alt=""
            className="size-full object-cover"
            src={asset.previewUrl}
          />
        ) : (
          <FileImage className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
        <Input
          aria-label="Evidence label"
          data-testid={`selected-draw-evidence-label-${asset.id}`}
          nativeInput
          onChange={(event) =>
            onUpdateEvidenceAsset(itemId, asset.id, {
              label: event.currentTarget.value,
            })
          }
          size="sm"
          value={asset.label}
        />
        <select
          aria-label="Evidence tag"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
          data-testid={`selected-draw-evidence-tag-${asset.id}`}
          onChange={(event) =>
            onUpdateEvidenceAsset(itemId, asset.id, {
              tag: event.currentTarget.value,
            })
          }
          value={asset.tag}
        >
          {tagOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="truncate text-[11px] text-muted-foreground">
          {asset.fileName} · {formatFileSize(asset.size)}
        </p>
      </div>
      <button
        aria-label={`Remove ${asset.label}`}
        className="relative z-10 grid size-7 place-items-center self-start rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`selected-draw-evidence-remove-${asset.id}`}
        onClick={() => onRemoveEvidenceAsset(itemId, asset.id)}
        type="button"
      >
        <X className="size-4" />
      </button>
    </article>
  );
}

function DrawAvailabilityMetrics({
  endingAvailability,
  probeDrawAvailability,
}: {
  endingAvailability: DrawAvailabilityDatum;
  probeDrawAvailability: DrawAvailabilityDatum | null;
}) {
  return (
    <div className="mt-3 grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-5">
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Top line
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-total-available"
        >
          {money(endingAvailability.totalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Interest-bearing
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-interest-bearing"
        >
          {money(endingAvailability.interestBearingDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Additional
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-additional-available"
        >
          {money(endingAvailability.additionalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Probe delta
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-probe-delta"
        >
          {probeDrawAvailability === null
            ? "Hover"
            : money(probeDrawAvailability.additionalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Total interest
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-probe-interest-accrued"
        >
          {probeDrawAvailability === null
            ? money(endingAvailability.totalInterestAccrued)
            : money(probeDrawAvailability.totalInterestAccrued)}
        </p>
      </div>
    </div>
  );
}

function DrawAvailabilityDeltaReadout({
  probeDrawAvailability,
}: {
  probeDrawAvailability: DrawAvailabilityDatum | null;
}) {
  return (
    <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-sky-700 dark:text-sky-100">
          <span className="size-2 rounded-full bg-sky-500" />
          Delta between lines
        </span>
        <span
          className="font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-delta-readout"
        >
          {probeDrawAvailability === null
            ? "Hover the chart or roadmap"
            : `${formatTimelineDay(probeDrawAvailability.day)}: ${money(
                probeDrawAvailability.additionalAvailableDraw
              )} delta, ${money(
                probeDrawAvailability.interestBearingDraw
              )} interest-bearing, ${money(
                probeDrawAvailability.totalInterestAccrued
              )} total interest accrued`}
        </span>
      </div>
    </div>
  );
}

function TimelineMarkerBadge({ marker }: { marker: TimelineMarker }) {
  const toneClass = {
    accent:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100",
    neutral: "border-border bg-background text-foreground dark:bg-zinc-950/80",
    today:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    warning:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  }[marker.tone ?? "neutral"];

  return (
    <motion.div
      className="flex flex-col items-center"
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.025, y: -1 }}
    >
      <motion.div
        className={cn(
          "rounded-md border px-2.5 py-1 text-center shadow-sm backdrop-blur",
          toneClass
        )}
        layout
      >
        <div className="whitespace-nowrap font-semibold text-xs">
          {marker.label}
        </div>
        {marker.sublabel && (
          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
            {marker.sublabel}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TimelineDeleteContextMenu({
  canDelete = true,
  children,
  deleteDescription,
  deleteDisabledReason,
  deleteLabel,
  kind,
  onDelete,
}: {
  canDelete?: boolean;
  children: ReactNode;
  deleteDescription?: string;
  deleteDisabledReason?: string;
  deleteLabel?: string;
  kind: "capitalSpike" | "draw" | "milestone";
  onDelete: () => void;
}) {
  const isDraw = kind === "draw";
  const isCapitalSpike = kind === "capitalSpike";
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="block" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="max-h-[calc(100vh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-2 shadow-2xl"
        data-testid="timeline-item-context-menu"
        side="right"
        sideOffset={6}
      >
        <div
          className="px-2 pb-2 font-medium text-[10px] text-muted-foreground uppercase"
          role="presentation"
        >
          {isDraw
            ? "Draw actions"
            : isCapitalSpike
              ? "Capital spike actions"
              : "Milestone actions"}
        </div>
        <ContextMenuItem
          className="flex min-h-12 items-start gap-3 px-2.5 py-2 text-sm"
          disabled={!canDelete}
          onClick={() => {
            if (canDelete) {
              onDelete();
            }
          }}
          variant="destructive"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive">
            <Trash2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {deleteLabel ??
                (isDraw
                  ? "Remove draw"
                  : isCapitalSpike
                    ? "Remove capital spike"
                    : "Remove milestone")}
            </span>
            <span className="mt-0.5 block truncate text-muted-foreground text-xs">
              {deleteDescription ??
                (isDraw && !canDelete
                  ? (deleteDisabledReason ?? "This draw is locked")
                  : isDraw
                    ? "Delete this draw marker"
                    : isCapitalSpike
                      ? "Delete this unexpected cost"
                      : "Delete this milestone")}
            </span>
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MilestoneRequestBadges({
  currentAmount,
  deleteRequested,
  isRequestedCreate,
  requestedAmount,
}: {
  currentAmount?: number;
  deleteRequested: boolean;
  isRequestedCreate: boolean;
  requestedAmount?: number;
}) {
  if (
    !(deleteRequested || isRequestedCreate || requestedAmount !== undefined)
  ) {
    return null;
  }

  return (
    <div className="absolute -top-2 -left-2 z-20 flex max-w-[calc(100%-0.5rem)] flex-wrap gap-1">
      {isRequestedCreate ? (
        <Badge
          className="border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-100"
          data-testid="timeline-requested-milestone-badge"
          variant="outline"
        >
          Requested
        </Badge>
      ) : null}
      {deleteRequested ? (
        <Badge
          className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-100"
          data-testid="timeline-delete-requested-badge"
          variant="outline"
        >
          Deletion requested
        </Badge>
      ) : null}
      {requestedAmount === undefined ? null : (
        <Badge
          className="border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-100"
          data-testid="timeline-budget-requested-badge"
          variant="outline"
        >
          {currentAmount === undefined
            ? money(requestedAmount)
            : `${money(currentAmount)} -> ${money(requestedAmount)}`}
        </Badge>
      )}
    </div>
  );
}

function DrawTimelineMarker({
  active,
  availableAmount,
  currentDay,
  draw,
  draft,
  inlineEditorEnabled,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
}: {
  active: boolean;
  availableAmount?: number;
  currentDay: number;
  draw: DemoDraw;
  draft: DrawEditDraft;
  inlineEditorEnabled: boolean;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: DrawEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
}) {
  const dayInputId = `draw-date-${draw.id}`;
  const amountInputId = `draw-amount-${draw.id}`;
  const markerState = getDrawTimelineMarkerState(draw, currentDay);
  const stateCopy = getDrawTimelineMarkerCopy(markerState);
  const draftDay = Math.round(Number(draft.x));
  const resolvedAvailableAmount =
    typeof availableAmount === "number" && Number.isFinite(availableAmount)
      ? Math.max(0, Math.round(availableAmount))
      : null;
  const markerClasses = {
    happened:
      "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/35 dark:hover:bg-emerald-500/10",
    planned:
      "border-sky-300 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-500/35 dark:hover:bg-sky-500/10",
    rejected:
      "border-rose-300 hover:border-rose-400 hover:bg-rose-50 dark:border-rose-500/35 dark:hover:bg-rose-500/10",
    requested:
      "border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-500/35 dark:hover:bg-amber-500/10",
  } satisfies Record<DrawTimelineMarkerState, string>;
  const activeMarkerClasses = {
    happened: "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
    planned: "border-sky-500 bg-sky-50 dark:bg-sky-500/10",
    rejected: "border-rose-500 bg-rose-50 dark:bg-rose-500/10",
    requested: "border-amber-500 bg-amber-50 dark:bg-amber-500/10",
  } satisfies Record<DrawTimelineMarkerState, string>;
  const labelClasses = {
    happened: "text-emerald-700 dark:text-emerald-100",
    planned: "text-sky-700 dark:text-sky-100",
    rejected: "text-rose-700 dark:text-rose-100",
    requested: "text-amber-700 dark:text-amber-100",
  } satisfies Record<DrawTimelineMarkerState, string>;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${draw.label} date and amount`}
        className={cn(
          "group min-w-28 rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-zinc-950/90",
          markerClasses[markerState],
          active && activeMarkerClasses[markerState]
        )}
        data-state={markerState}
        data-testid={`timeline-draw-marker-${getDrawDomId(draw)}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span
          className={cn(
            "flex items-center justify-center gap-1 font-semibold text-[10px] uppercase tracking-normal",
            labelClasses[markerState]
          )}
        >
          <CircleDollarSign className="size-3" />
          {draw.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(draw.amount)}
        </span>
        <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {formatTimelineDay(draw.x)}
        </span>
        <span
          className={cn(
            "mt-1 inline-flex rounded-full border px-1.5 py-0.5 font-medium text-[9px] uppercase",
            labelClasses[markerState]
          )}
        >
          {stateCopy}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {active && inlineEditorEnabled ? (
          <motion.form
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={`Edit ${draw.label}`}
            className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            data-testid={`timeline-draw-editor-${getDrawDomId(draw)}`}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: -8 }}
            initial={{ filter: "blur(6px)", opacity: 0, scale: 0.96, y: -10 }}
            onSubmit={onApply}
            role="dialog"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="mb-3">
              <p className="font-semibold text-sm">{draw.label}</p>
              <p className="text-muted-foreground text-xs">
                Update release date and reimbursement amount.
              </p>
              {resolvedAvailableAmount === null ? null : (
                <p
                  className="mt-1 text-muted-foreground text-xs tabular-nums"
                  data-testid={`timeline-draw-available-${getDrawDomId(draw)}`}
                >
                  {Number.isFinite(draftDay)
                    ? `${money(resolvedAvailableAmount)} unlocked by day ${draftDay}`
                    : `${money(resolvedAvailableAmount)} unlocked`}
                </p>
              )}
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={dayInputId}>
                  Draw date
                </Label>
                <Input
                  id={dayInputId}
                  min={0}
                  name="drawDate"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({ ...draft, x: event.currentTarget.value })
                  }
                  size="sm"
                  step={1}
                  type="number"
                  value={draft.x}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={amountInputId}>
                  Draw amount
                </Label>
                <Input
                  id={amountInputId}
                  min={1}
                  name="drawAmount"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      amount: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  step="any"
                  type="number"
                  value={draft.amount}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={onCancel}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button size="xs" type="submit">
                Apply
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CapitalSpikeTimelineMarker({
  active,
  draft,
  maxDay,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
  spike,
}: {
  active: boolean;
  draft: CapitalSpikeEditDraft;
  maxDay: number;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: CapitalSpikeEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
  spike: DemoCapitalSpike;
}) {
  const titleInputId = `capital-spike-label-${spike.id}`;
  const dayInputId = `capital-spike-date-${spike.id}`;
  const amountInputId = `capital-spike-amount-${spike.id}`;
  const interestInputId = `capital-spike-interest-${spike.id}`;
  const isCashInfusion = spike.eventKind === "cashInfusion";
  const isHomeEquityTakeout = spike.eventKind === "homeEquityTakeout";
  const isCashSource = isCashInfusion || isHomeEquityTakeout;
  const MarkerIcon = isHomeEquityTakeout
    ? House
    : isCashInfusion
      ? Banknote
      : AlertTriangle;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${spike.label}`}
        className={cn(
          "group min-w-32 rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-zinc-950/90",
          isCashSource
            ? isHomeEquityTakeout
              ? "border-sky-300 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-500/35 dark:hover:bg-sky-500/10"
              : "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/35 dark:hover:bg-emerald-500/10"
            : "border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-500/35 dark:hover:bg-amber-500/10",
          active &&
            (isCashSource
              ? isHomeEquityTakeout
                ? "border-sky-500 bg-sky-50 shadow-sky-500/15 dark:bg-sky-500/10"
                : "border-emerald-500 bg-emerald-50 shadow-emerald-500/15 dark:bg-emerald-500/10"
              : "border-amber-500 bg-amber-50 shadow-amber-500/15 dark:bg-amber-500/10")
        )}
        data-testid={`timeline-capital-spike-marker-${spike.id}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span
          className={cn(
            "flex items-center justify-center gap-1 font-semibold text-[10px] uppercase tracking-normal",
            isCashSource
              ? isHomeEquityTakeout
                ? "text-sky-700 dark:text-sky-100"
                : "text-emerald-700 dark:text-emerald-100"
              : "text-amber-700 dark:text-amber-200"
          )}
        >
          <MarkerIcon className="size-3" />
          {spike.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(spike.amount)}
        </span>
        {isHomeEquityTakeout ? (
          <span className="mt-0.5 block whitespace-nowrap text-[10px] text-sky-700 tabular-nums dark:text-sky-200">
            {((spike.interestAnnualBps ?? 0) / 100).toFixed(2)}% annual
          </span>
        ) : null}
        <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {formatTimelineDay(spike.x)}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {active && (
          <motion.form
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={`Edit ${spike.label}`}
            className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            data-testid={`timeline-capital-spike-editor-${spike.id}`}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: -8 }}
            initial={{ filter: "blur(6px)", opacity: 0, scale: 0.96, y: -10 }}
            onSubmit={onApply}
            role="dialog"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="mb-3">
              <p className="font-semibold text-sm">
                {isHomeEquityTakeout
                  ? "Home Equity Takeout"
                  : isCashInfusion
                    ? "Cash infusion"
                    : "Capital cost"}
              </p>
              <p className="text-muted-foreground text-xs">
                {isHomeEquityTakeout
                  ? "Track the funded amount, takeout date, and annual interest rate."
                  : isCashInfusion
                    ? "Update the borrower cash infusion label, date, and amount."
                    : "Update the unexpected cost label, date, and amount."}
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={titleInputId}>
                  {isCashInfusion
                    ? "Cash infusion title"
                    : isHomeEquityTakeout
                      ? "Loan title"
                      : "Capital cost title"}
                </Label>
                <Input
                  id={titleInputId}
                  name="capitalSpikeLabel"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      label: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  value={draft.label}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={dayInputId}>
                  {isHomeEquityTakeout
                    ? "Takeout date"
                    : isCashInfusion
                      ? "Cash infusion date"
                      : "Capital cost date"}
                </Label>
                <Input
                  id={dayInputId}
                  max={maxDay}
                  min={PROPOSAL_TIMELINE_MIN_DAY}
                  name="capitalSpikeDate"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({ ...draft, x: event.currentTarget.value })
                  }
                  size="sm"
                  step={1}
                  type="number"
                  value={draft.x}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={amountInputId}>
                  {isCashInfusion
                    ? "Cash infusion amount"
                    : isHomeEquityTakeout
                      ? "Takeout amount"
                      : "Capital cost amount"}
                </Label>
                <Input
                  id={amountInputId}
                  min={0}
                  name="capitalSpikeAmount"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      amount: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  step={1000}
                  type="number"
                  value={draft.amount}
                />
              </div>
              {isHomeEquityTakeout ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs" htmlFor={interestInputId}>
                    Annual interest rate
                  </Label>
                  <Input
                    id={interestInputId}
                    max={100}
                    min={0}
                    name="capitalSpikeInterestAnnualPercent"
                    nativeInput
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        interestAnnualPercent: event.currentTarget.value,
                      })
                    }
                    size="sm"
                    step={0.01}
                    type="number"
                    value={draft.interestAnnualPercent}
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={onCancel}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button size="xs" type="submit">
                Apply
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function FinancialOverviewCard({ overview }: { overview: FinancialOverview }) {
  return (
    <article
      className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-card-foreground shadow-sm"
      data-testid="timeline-final-financial-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[11px] text-emerald-700 uppercase dark:text-emerald-200">
            Closeout ledger
          </p>
          <h3 className="mt-1 font-semibold text-sm leading-5">
            Live financial overview
          </h3>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <Flag className="size-5" />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="size-3.5" />
            Released
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-total-draw"
          >
            {money(overview.totalDrawReleased)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ReceiptText className="size-3.5" />
            Draw fees
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-draw-fees"
          >
            {money(overview.drawFeesPaid)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="text-muted-foreground">Interest paid</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-interest-paid"
          >
            {money(overview.interestPaid)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="text-muted-foreground">Draw count</dt>
          <dd className="font-medium tabular-nums">
            {overview.drawCount} x {money(DRAW_FEE)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function TimelineNodeButton({
  active,
  complete,
  item,
  onClick,
  onDoubleClick,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  onDoubleClick?: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.button
      aria-label={`Set progress to ${item.data?.name ?? item.label ?? item.id}`}
      className={cn(
        "grid size-9 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-card text-emerald-600 ring-4 ring-emerald-500/10",
        active &&
          !complete &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700"
      )}
      data-testid={`demo-timeline-node-${item.id}`}
      onClick={onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick?.();
      }}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      {complete || active ? (
        <Banknote
          className="size-4"
          data-testid={`demo-timeline-node-icon-${item.id}`}
        />
      ) : (
        <span className="font-semibold text-xs">{item.markerLabel}</span>
      )}
    </motion.button>
  );
}

export const TimelineDemoWorkspace = TimelineWorkspace;

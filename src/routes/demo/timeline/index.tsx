import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Eye,
  ExternalLink,
  FileImage,
  Flag,
  LinkIcon,
  Loader2,
  Mail,
  MapPinned,
  QrCode,
  ReceiptText,
  RotateCcw,
  Share2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createStandardSchemaV1, parseAsString, useQueryStates } from "nuqs";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
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

import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";
import {
  AnimatedCurvedTimeline,
  type TimelineItem,
  type TimelineMarker,
  type TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  Drawer,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { normalizeSiteVisitTokenRoute } from "#/features/build-workspace-demo/site-visit-token-route-model.ts";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MilestoneCard, type MilestoneCardUpdate } from "./-MilestoneCard.tsx";
import { TimelineCashflowCompoundChart } from "./-TimelineCashflowCompoundChart.tsx";
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
  type ActiveMilestoneSelection,
  buildMilestoneSpendEvents,
  DEFAULT_MILESTONE_DURATION_DAYS,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
  normalizeMilestoneTimelineItems,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";
import {
  applyTimelineShareSnapshotV2,
  buildTimelineShareSnapshotV2,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoEvidenceAsset,
  type DemoMilestone,
  initialTimelineShareState,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";

const timelineSearchParsers = {
  share: parseAsString,
};

export const Route = createFileRoute("/demo/timeline/")({
  component: RouteComponent,
  ssr: false,
  validateSearch: createStandardSchemaV1(timelineSearchParsers, {
    partialOutput: true,
  }),
});

interface DrawEditDraft {
  amount: string;
  x: string;
}

interface CapitalSpikeEditDraft {
  amount: string;
  label: string;
  x: string;
}

type TimelineDemoRole = "builder" | "lender";

interface PendingNormalizedInsertSelection {
  itemId: string;
  x: number;
}

interface TimelineSiteVisitRequestInput {
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
  cashOnHand: number;
  day: number;
  drawAmount: number;
  drawCapacityUnlocked: number;
  event: "capitalSpike" | "draw" | "milestone" | "start";
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface DrawAvailabilityDatum {
  additionalAvailableDraw: number;
  day: number;
  interestBearingDraw: number;
  name: string;
  totalAvailableDraw: number;
  [key: string]: unknown;
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
const DRAW_FEE = 500;
const INTEREST_APR = 0.0925;
const CHART_PROBE_INTERVAL_DAYS = 5;
const MINIMUM_POST_MILESTONE_CASH_RESERVE = 0;
const STARTING_CASH = 400_000;
const INITIAL_CURRENT_DAY = 86;
const GENERATED_TIMELINE_CURRENT_DAY = 0;
const TIMELINE_END_PADDING_DAYS = 5;
const INITIAL_CAPITAL_SPIKES: DemoCapitalSpike[] = [];
const INITIAL_COMPLETION_SUBMITTED_AT = "2026-05-01T14:00:00.000Z";
const LOCAL_TIMELINE_SHARE_PREFIX = "local-timeline-";
const TIMELINE_TO_DEMO_MILESTONE_KEY: Record<string, string> = {
  closeout: "aluminum_windows",
  drywall: "aluminum_windows",
  exterior: "aluminum_windows",
  finishes: "aluminum_windows",
  framing: "framing",
  "rough-in": "aluminum_windows",
  "site-prep": "foundation",
};

const cashflowChartConfig = {
  additionalAvailableDraw: {
    label: "Additional available draw",
    colors: {
      dark: ["oklch(0.72 0.15 240)", "oklch(0.84 0.12 210)"],
      light: ["oklch(0.6 0.18 240)", "oklch(0.72 0.15 240)"],
    },
  },
  cashOnHand: {
    label: "Cash on hand",
    colors: {
      dark: ["oklch(0.78 0.16 85)", "oklch(0.62 0.22 25)"],
      light: ["oklch(0.58 0.2 25)", "oklch(0.72 0.18 45)"],
    },
  },
  budget: {
    label: "Milestone cost",
    colors: {
      dark: ["oklch(0.7 0.18 275)", "oklch(0.76 0.17 235)"],
      light: ["oklch(0.67 0.18 275)", "oklch(0.76 0.17 235)"],
    },
  },
  capitalSpikeAmount: {
    label: "Capital spike",
    colors: {
      dark: ["oklch(0.68 0.2 35)", "oklch(0.78 0.18 55)"],
      light: ["oklch(0.62 0.22 35)", "oklch(0.74 0.18 55)"],
    },
  },
  interestBearingDraw: {
    label: "Interest-bearing draw",
    colors: {
      dark: ["oklch(0.7 0.18 275)", "oklch(0.78 0.14 255)"],
      light: ["oklch(0.65 0.18 275)", "oklch(0.78 0.14 255)"],
    },
  },
  totalAvailableDraw: {
    label: "Interest + available draw",
    colors: {
      dark: ["oklch(0.78 0.16 145)", "oklch(0.72 0.18 165)"],
      light: ["oklch(0.58 0.19 150)", "oklch(0.7 0.18 165)"],
    },
  },
} satisfies ChartConfig;

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
  0,
);
const NORMALIZED_INITIAL_ITEMS = normalizeMilestoneTimelineItems(INITIAL_ITEMS);
const INITIAL_RANGE = expandTimelineRangeForMilestones(
  NORMALIZED_INITIAL_ITEMS,
  BASE_INITIAL_RANGE,
);

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

export function resolveTimelineSiteVisitMilestoneKey(itemId: string) {
  return TIMELINE_TO_DEMO_MILESTONE_KEY[itemId] ?? itemId;
}

export function normalizeTimelineSiteVisitStatus(
  status?: string,
  tokenExpiresAt?: number,
  now = Date.now(),
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
  isPhoneLayout: boolean,
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

export interface TimelineDemoWorkspaceProps {
  durableMeta?: {
    backofficeHref: string;
    proposalHref: string;
    proposalSlug: string;
    status: string;
  };
  durablePlanId?: string;
  initialState?: TimelineShareState;
  planSummary?: {
    includedCount: number;
    templateTitle: string;
    totalBudget: number;
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The demo route is the controlled state orchestration surface for timeline, charts, and sharing.
function RouteComponent() {
  return <TimelineDemoWorkspace />;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the shared demo workspace used by both setup-driven and Convex-hydrated timelines.
export function TimelineDemoWorkspace({
  durableMeta,
  durablePlanId,
  initialState,
  planSummary,
}: TimelineDemoWorkspaceProps = {}) {
  const timelineDemoSettings = useQuery(
    api.demo_settings.getTimelineDemoSettings,
    {},
  );
  const createTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
  );
  const createTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_createTimelineDraw,
  );
  const updateTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_updateTimelineDraw,
  );
  const deleteTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineDraw,
  );
  const submitTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_submitTimelineDrawRequest,
  );
  const reviewTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineDrawRequest,
  );
  const createTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_createTimelineCapitalEvent,
  );
  const updateTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_updateTimelineCapitalEvent,
  );
  const deleteTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineCapitalEvent,
  );
  const createTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_createTimelineMilestone,
  );
  const updateTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_updateTimelineMilestone,
  );
  const deleteTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineMilestone,
  );
  const submitTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_submitTimelineMilestoneCompletion,
  );
  const reviewTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineMilestoneCompletion,
  );
  const updateTimelinePlanState = useMutation(
    api.demo_timeline_plans.demo_updateTimelinePlanState,
  );
  const generateTimelineEvidenceUploadUrl = useMutation(
    api.demo_timeline_plans.demo_generateTimelineEvidenceUploadUrl,
  );
  const createTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_createTimelineEvidenceAsset,
  );
  const updateTimelineEvidenceAssetMutation = useMutation(
    api.demo_timeline_plans.demo_updateTimelineEvidenceAsset,
  );
  const deleteTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineEvidenceAsset,
  );
  const prefersReducedMotion = useReducedMotion();
  const isCompactLayout = useMediaQuery("max-lg");
  const isMobileDrawerLayout = useMediaQuery("max-md");
  const isPhoneLayout = useMediaQuery("max-sm");
  const insertionCount = useRef(0);
  const drawInsertionCount = useRef(0);
  const capitalSpikeInsertionCount = useRef(0);
  const pendingNormalizedInsertSelection =
    useRef<PendingNormalizedInsertSelection | null>(null);
  const pendingExpandedRange = useRef<Required<TimelineRange> | null>(null);
  const workspaceInitialState = useMemo(
    () =>
      initialState
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
            false,
          ),
    [initialState],
  );
  const [items, setItems] = useState<TimelineItem<DemoMilestone>[]>(
    () => workspaceInitialState.items,
  );
  const [draws, setDraws] = useState<DemoDraw[]>(
    () => workspaceInitialState.draws,
  );
  const [capitalSpikes, setCapitalSpikes] = useState<DemoCapitalSpike[]>(
    () => workspaceInitialState.capitalSpikes,
  );
  const [startingCash, setStartingCash] = useState(
    workspaceInitialState.startingCash,
  );
  const [currentDay, setCurrentDay] = useState(
    workspaceInitialState.currentDay,
  );
  const [range, setRange] = useState<TimelineRange>(
    workspaceInitialState.range,
  );
  const [activeSelection, setActiveSelection] =
    useState<ActiveMilestoneSelection>(workspaceInitialState.activeSelection);
  const [progressValue, setProgressValue] = useState(
    workspaceInitialState.progressValue,
  );
  const [probeValue, setProbeValue] = useState<number | null>(null);
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
      label: "",
      x: "",
    });
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(true);
  const [durableSavePendingCount, setDurableSavePendingCount] = useState(0);
  const [durableSaveStatus, setDurableSaveStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [timelineRole, setTimelineRole] = useState<TimelineDemoRole>("builder");
  const [straightLine, setStraightLine] = useState(
    workspaceInitialState.straightLine,
  );
  const [setupComplete, setSetupComplete] = useState(Boolean(initialState));
  const [setupBaseline, setSetupBaseline] = useState<TimelineShareState | null>(
    initialState ?? null,
  );
  const settingsTemplates = useMemo(
    () => normalizeTimelineSettingsProjection(timelineDemoSettings),
    [timelineDemoSettings],
  );
  const setupTemplates = useMemo(
    () => buildTimelineSetupTemplatesFromSettings(settingsTemplates),
    [settingsTemplates],
  );
  const settingsFallbackActive =
    timelineDemoSettings !== undefined && settingsTemplates.length === 0;
  const [timelinePlanSummary, setTimelinePlanSummary] = useState({
    includedCount: planSummary?.includedCount ?? INITIAL_ITEMS.length,
    templateTitle: planSummary?.templateTitle ?? "Elm Street build",
    totalBudget: planSummary?.totalBudget ?? INITIAL_TOTAL_BUDGET,
  });
  const activeItemId = activeSelection.itemId;
  const activeItem =
    items.find((item) => item.id === activeItemId) ?? items[0] ?? null;
  const activeItemDraw = null;
  const activePanelDraw =
    activeDrawId === null
      ? null
      : (draws.find((draw) => draw.id === activeDrawId) ?? null);
  const activePanelDrawItem = null;
  const resolvedRange = useMemo(() => normalizeDemoRange(range), [range]);
  const durablePlanStateInitialized = useRef(false);
  const runDurableMutation = useCallback(
    (operation: Promise<unknown>, label: string) => {
      if (!durablePlanId) {
        return;
      }
      setDurableSavePendingCount((count) => count + 1);
      setDurableSaveStatus("idle");
      operation
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : `Unable to persist ${label}.`;
          setDurableSaveStatus("error");
          toast.error(message);
        })
        .then(() => {
          setDurableSaveStatus((status) =>
            status === "error" ? "error" : "saved",
          );
        })
        .finally(() => {
          setDurableSavePendingCount((count) => Math.max(0, count - 1));
        });
    },
    [durablePlanId],
  );
  const {
    resetTimeline,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    share,
  } = useTimelineSnapshotSharing({
    activeSelection,
    capitalSpikeInsertionCount,
    capitalSpikes,
    drawInsertionCount,
    draws,
    insertionCount,
    items,
    currentDay,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikeEditDraft,
    setCapitalSpikes,
    setDrawEditDraft,
    setDraws,
    setItems,
    setCurrentDay,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedPanelOpen,
    setStartingCash,
    setStraightLine,
    startingCash,
    straightLine,
  });

  const applyTimelineState = useCallback((nextState: TimelineShareState) => {
    const hydratedState = normalizeTimelineShareStateForRoute(nextState);

    setItems(hydratedState.items);
    setDraws(hydratedState.draws);
    setCapitalSpikes(hydratedState.capitalSpikes);
    setRange(hydratedState.range);
    setActiveSelection(hydratedState.activeSelection);
    setCurrentDay(hydratedState.currentDay);
    setProgressValue(hydratedState.progressValue);
    setProbeValue(null);
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setDrawEditDraft({ amount: "", x: "" });
    setCapitalSpikeEditDraft({ amount: "", label: "", x: "" });
    setSelectedPanelOpen(hydratedState.selectedPanelOpen);
    setStartingCash(hydratedState.startingCash);
    setStraightLine(hydratedState.straightLine);
    insertionCount.current = countInsertedTimelineItems(hydratedState.items);
    drawInsertionCount.current = countManualDraws(hydratedState.draws);
    capitalSpikeInsertionCount.current = hydratedState.capitalSpikes.length;
  }, []);

  const completeTimelineSetup = useCallback(
    (result: TimelineSetupResult) => {
      const settingsTemplate = settingsTemplates.find(
        (template) => template.templateKey === result.templateKey,
      );
      const nextRange = settingsTemplate
        ? timelineSettingsRange(result.items)
        : expandTimelineRangeForMilestones(result.items, BASE_INITIAL_RANGE);
      const nextDraws = settingsTemplate
        ? buildDrawsFromActiveScenario(
            settingsTemplate,
            result.items,
            result.totalBudget * 100,
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
        items: result.items,
        progressValue: result.currentDay,
        range: nextRange,
        selectedPanelOpen: Boolean(activeItem),
        startingCash: result.startingCash,
        straightLine: false,
      };

      setTimelinePlanSummary({
        includedCount: result.includedCount,
        templateTitle: result.templateTitle,
        totalBudget: result.totalBudget,
      });
      setSetupBaseline(nextState);
      applyTimelineState(nextState);
      setSetupComplete(true);
      void createTimelinePlan({
        actorPersona: "lender_admin",
        address: "Hamilton, ON",
        buildName: result.templateTitle,
        currentDay: result.currentDay,
        draws: nextDraws.map((draw, index) => ({
          amountCents: draw.amount,
          customDate: Boolean(draw.customDate),
          drawKey: draw.id,
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
              item,
            ): item is TimelineItem<DemoMilestone> & {
              data: DemoMilestone;
            } => Boolean(item.data),
          )
          .map((item, index) => ({
            budgetCents: item.data.amount,
            dayEnd: Math.round(item.x + item.data.durationDays),
            dayStart: Math.round(item.x),
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
            submilestones: item.data.subMilestones.map((name, subIndex) => ({
              key: `${item.id}-sub-${subIndex + 1}`,
              name,
              order: subIndex + 1,
            })),
            tone: item.tone,
            type: "timeline_demo",
            x: item.x,
          })),
        progressValue: result.currentDay,
        rangeMax: nextRange.max,
        rangeMin: nextRange.min,
        startingCashCents: result.startingCash,
        templateTitle: result.templateTitle,
        totalBudgetCents: result.totalBudget,
        workingCapitalLimitCents: result.startingCash,
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
    [applyTimelineState, createTimelinePlan, settingsTemplates],
  );

  const resetCurrentTimeline = useCallback(() => {
    if (share || !setupBaseline) {
      resetTimeline();
      return;
    }

    applyTimelineState(setupBaseline);
  }, [applyTimelineState, resetTimeline, setupBaseline, share]);

  useEffect(() => {
    if (share) {
      setSetupComplete(true);
    }
  }, [share]);
  useEffect(() => {
    if (!durablePlanId) {
      return;
    }
    if (!durablePlanStateInitialized.current) {
      durablePlanStateInitialized.current = true;
      return;
    }
    const timeout = window.setTimeout(() => {
      runDurableMutation(
        updateTimelinePlanState({
          currentDay,
          planId: durablePlanId,
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
          startingCashCents: startingCash,
        }),
        "timeline state",
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
    resolvedRange.max,
    resolvedRange.min,
    runDurableMutation,
    selectedPanelOpen,
    startingCash,
    straightLine,
    updateTimelinePlanState,
  ]);
  const cashflowData = useMemo(
    () =>
      buildTimelineCashflowData(
        items,
        draws,
        capitalSpikes,
        resolvedRange,
        startingCash,
      ),
    [capitalSpikes, draws, items, resolvedRange, startingCash],
  );
  const cashflowChartData = useMemo(
    () =>
      buildCashflowChartData(cashflowData, items, resolvedRange, startingCash),
    [cashflowData, items, resolvedRange, startingCash],
  );
  const drawAvailabilityData = useMemo(
    () => buildDrawAvailabilityData(cashflowData),
    [cashflowData],
  );
  const drawAvailabilityChartData = useMemo(
    () => densifyDrawAvailabilityData(drawAvailabilityData, resolvedRange),
    [drawAvailabilityData, resolvedRange],
  );
  const cashShortfalls = useMemo(
    () => buildCashShortfallPoints(cashflowData),
    [cashflowData],
  );
  const financialOverview = useMemo(
    () => buildFinancialOverview(cashflowData, draws, resolvedRange),
    [cashflowData, draws, resolvedRange],
  );
  const cashflowExtent = useMemo(
    () => getCashflowChartExtent(cashflowChartData),
    [cashflowChartData],
  );
  const drawAvailabilityExtent = useMemo(
    () => getDrawAvailabilityChartExtent(drawAvailabilityData),
    [drawAvailabilityData],
  );
  const probeCashOnHand =
    probeValue === null
      ? null
      : interpolateLinearCashOnHand(cashflowChartData, probeValue);
  const probeDrawAvailability =
    probeValue === null
      ? null
      : interpolateDrawAvailability(
          drawAvailabilityData,
          Math.round(probeValue),
        );
  const endingCashOnHand = cashflowData.at(-1)?.cashOnHand ?? startingCash;
  const endingAvailability = drawAvailabilityData.at(-1) ?? {
    additionalAvailableDraw: 0,
    day: resolvedRange.min,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalAvailableDraw: 0,
  };
  const timelineSizing = useMemo(
    () => getTimelineResponsiveSizing(isCompactLayout, isPhoneLayout),
    [isCompactLayout, isPhoneLayout],
  );
  const cashflowTicks = useMemo(
    () => getTimelineAlignedTicks(resolvedRange, timelineSizing.pixelsPerUnit),
    [resolvedRange, timelineSizing.pixelsPerUnit],
  );
  const cashflowReferenceLines = useMemo(
    () => [
      ...cashShortfalls.map((point) => ({
        label: isPhoneLayout
          ? undefined
          : point.shortfall > 0
            ? `Short ${money(point.shortfall)}`
            : "Cash zero",
        opacity: 0.52,
        stroke: "oklch(0.62 0.22 25)",
        strokeDasharray: "2 3",
        x: point.day,
      })),
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
    [cashShortfalls, isPhoneLayout, probeCashOnHand, probeValue, startingCash],
  );
  const drawAvailabilityReferenceLines = useMemo(
    () =>
      probeValue === null
        ? []
        : [
            {
              label: `Delta ${money(
                probeDrawAvailability?.additionalAvailableDraw ?? 0,
              )}`,
              opacity: 0.82,
              stroke: "oklch(0.6 0.18 240)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ],
    [probeDrawAvailability, probeValue],
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
    [capitalSpikes, currentDay, draws],
  );

  const openDrawEditor = (draw: DemoDraw) => {
    setActiveCapitalSpikeId(null);
    setActiveDrawId(draw.id);
    setSelectedPanelOpen(true);
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
      label: spike.label,
      x: String(Math.round(spike.x)),
    });
  };

  const addManualDraw = (requestedX: number) => {
    drawInsertionCount.current += 1;
    const count = drawInsertionCount.current;
    const nextDraw = {
      amount: 100_000,
      customDate: true,
      id: `manual-draw-${Date.now()}-${count}`,
      label: `Draw ${draws.length + 1}`,
      x: requestedX,
    } satisfies DemoDraw;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setDraws((currentDraws) =>
      [...currentDraws, nextDraw].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id),
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        createTimelineDraw({
          amountCents: nextDraw.amount,
          customDate: true,
          drawKey: nextDraw.id,
          label: nextDraw.label,
          order: draws.length + 1,
          planId: durablePlanId,
          x: nextDraw.x,
        }),
        "draw",
      );
    }
  };

  const addCapitalSpike = (requestedX: number) => {
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextSpike = {
      amount: 35_000,
      id: `capital-spike-${Date.now()}-${count}`,
      label: `Capital spike ${count}`,
      x: requestedX,
    } satisfies DemoCapitalSpike;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextSpike].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id),
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        createTimelineCapitalEvent({
          amountCents: nextSpike.amount,
          capitalEventKey: nextSpike.id,
          label: nextSpike.label,
          order: capitalSpikes.length + 1,
          planId: durablePlanId,
          x: nextSpike.x,
        }),
        "capital event",
      );
    }
  };

  const deleteDraw = (drawId: string) => {
    const targetDraw = draws.find((draw) => draw.id === drawId);
    if (targetDraw?.requestStatus === "approved") {
      toast.error("Approved reimbursement draws cannot be deleted.");
      return;
    }

    setActiveDrawId(null);
    setDraws((currentDraws) =>
      relabelTimelineDraws(currentDraws.filter((draw) => draw.id !== drawId)),
    );
    if (durablePlanId) {
      runDurableMutation(
        deleteTimelineDraw({ drawKey: drawId, planId: durablePlanId }),
        "draw deletion",
      );
    }
  };

  const deleteCapitalSpike = (spikeId: string) => {
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      currentSpikes.filter((spike) => spike.id !== spikeId),
    );
    if (durablePlanId) {
      runDurableMutation(
        deleteTimelineCapitalEvent({
          capitalEventKey: spikeId,
          planId: durablePlanId,
        }),
        "capital event deletion",
      );
    }
  };

  const deleteMilestone = (itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextItems = normalizeMilestoneTimelineItems(
      items.filter((item) => item.id !== targetItem.id),
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);
    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange),
    );
    if (durablePlanId) {
      runDurableMutation(
        deleteTimelineMilestone({
          milestoneKey: targetItem.id,
          planId: durablePlanId,
        }),
        "milestone deletion",
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
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
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
          : item,
      ),
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange),
    );
    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          updateTimelineMilestone({
            ...timelineItemToMilestoneMutationInput(
              nextItem,
              nextItems.findIndex((item) => item.id === itemId) + 1,
            ),
            planId: durablePlanId,
          }),
          "milestone update",
        );
      }
    }

    if (activeItemId === itemId) {
      const nextActiveItem = nextItems.find((item) => item.id === itemId);
      setProgressValue(
        activeSelection.phase === "complete" && nextActiveItem
          ? getMilestoneEndX(nextActiveItem)
          : (nextActiveItem?.x ?? patch.x ?? progressValue),
      );
    }
  };

  const completeMilestone = (
    itemId: string,
    claim: {
      actualCost?: number;
      completedDay: number;
      note?: string;
    },
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
                  submittedAt: new Date().toISOString(),
                },
                evidence:
                  (item.data.evidencePackage?.assets.length ?? 0) > 0
                    ? "Submitted package"
                    : "Completion claimed",
                status: "complete",
              },
            }
          : item,
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        submitTimelineMilestoneCompletion({
          actualCostCents: claim.actualCost,
          completedDay: claim.completedDay,
          milestoneKey: itemId,
          note: claim.note,
          planId: durablePlanId,
        }),
        "milestone completion",
      );
    }
  };

  const addEvidenceFiles = (itemId: string, files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const createdAssets: DemoEvidenceAsset[] = [];
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (!(item.id === itemId && item.data)) {
          return item;
        }

        const existingAssets = item.data.evidencePackage?.assets ?? [];
        const nextAssets = files
          .filter((file) => file.type.startsWith("image/"))
          .map((file, index) => {
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
      }),
    );
    if (durablePlanId && createdAssets.length > 0) {
      for (const [index, asset] of createdAssets.entries()) {
        const file = files.filter((candidate) =>
          candidate.type.startsWith("image/"),
        )[index];
        if (!file) {
          continue;
        }
        void (async () => {
          const uploadUrl = await generateTimelineEvidenceUploadUrl({
            planId: durablePlanId,
          });
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
          await createTimelineEvidenceAsset({
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
            planId: durablePlanId,
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
  };

  const updateEvidenceAsset = (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
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
                      : asset,
                  ),
                },
              },
            }
          : item,
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        updateTimelineEvidenceAssetMutation({
          evidenceKey: assetId,
          label: patch.label,
          planId: durablePlanId,
          tag: patch.tag,
        }),
        "evidence asset",
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
          (asset) => asset.id === assetId,
        );
        if (removedAsset?.previewUrl) {
          URL.revokeObjectURL(removedAsset.previewUrl);
        }

        const nextAssets = item.data.evidencePackage.assets.filter(
          (asset) => asset.id !== assetId,
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
      }),
    );
    if (durablePlanId) {
      runDurableMutation(
        deleteTimelineEvidenceAsset({
          evidenceKey: assetId,
          planId: durablePlanId,
        }),
        "evidence deletion",
      );
    }
  };

  const applyDrawEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDrawId) {
      return;
    }

    const activeDraw = draws.find((draw) => draw.id === activeDrawId);
    if (!activeDraw) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      0,
      Math.round(Number(formData.get("drawAmount") ?? drawEditDraft.amount)),
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.round(Number(formData.get("drawDate") ?? drawEditDraft.x)),
    );

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    setDraws((currentDraws) =>
      currentDraws.map((draw) =>
        draw.id === activeDrawId
          ? {
              ...draw,
              amount: nextAmount,
              customDate: true,
              x: nextX,
            }
          : draw,
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        updateTimelineDraw({
          amountCents: nextAmount,
          customDate: true,
          drawKey: activeDrawId,
          planId: durablePlanId,
          x: nextX,
        }),
        "draw update",
      );
    }
    if (nextX > resolvedRange.max) {
      setRange((currentRange) => ({
        ...currentRange,
        max: nextX,
      }));
    }
    setActiveDrawId(null);
  };

  const submitDrawRequest = (
    drawId: string,
    request: { amount: number; note?: string },
  ) => {
    const targetDraw = draws.find((draw) => draw.id === drawId);

    if (!targetDraw) {
      return;
    }

    const limit = calculateDrawRequestLimit(targetDraw, items, draws);
    const nextAmount = clampNumber(
      Math.round(request.amount),
      0,
      limit.availableLimit,
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
          ...(request.note ? { requestNote: request.note } : {}),
          requestStatus: "requested",
          requestedAt: new Date().toISOString(),
        };
      }),
    );
    if (durablePlanId) {
      runDurableMutation(
        submitTimelineDrawRequest({
          amountCents: nextAmount,
          drawKey: drawId,
          note: request.note,
          planId: durablePlanId,
        }),
        "draw request",
      );
    }
  };

  const reviewDrawRequest = (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" },
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
          : draw,
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        reviewTimelineDrawRequest({
          drawKey: drawId,
          note: review.note,
          planId: durablePlanId,
          status: review.status,
        }),
        "draw review",
      );
    }
  };

  const reviewMilestoneCompletion = (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" },
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
          : item,
      ),
    );
    if (durablePlanId) {
      runDurableMutation(
        reviewTimelineMilestoneCompletion({
          milestoneKey: itemId,
          note: review.note,
          planId: durablePlanId,
          status: review.status,
        }),
        "milestone review",
      );
    }
  };

  const requestMilestoneSiteVisit = (
    itemId: string,
    request: TimelineSiteVisitRequestInput,
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
          : item,
      ),
    );
  };

  const applyCapitalSpikeEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCapitalSpikeId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      0,
      Math.round(
        Number(
          formData.get("capitalSpikeAmount") ?? capitalSpikeEditDraft.amount,
        ),
      ),
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.round(
        Number(formData.get("capitalSpikeDate") ?? capitalSpikeEditDraft.x),
      ),
    );
    const nextLabel =
      String(
        formData.get("capitalSpikeLabel") ?? capitalSpikeEditDraft.label,
      ).trim() || "Capital spike";

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    setCapitalSpikes((currentSpikes) =>
      currentSpikes
        .map((spike) =>
          spike.id === activeCapitalSpikeId
            ? {
                ...spike,
                amount: nextAmount,
                label: nextLabel,
                x: nextX,
              }
            : spike,
        )
        .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id)),
    );
    if (durablePlanId) {
      runDurableMutation(
        updateTimelineCapitalEvent({
          amountCents: nextAmount,
          capitalEventKey: activeCapitalSpikeId,
          label: nextLabel,
          planId: durablePlanId,
          x: nextX,
        }),
        "capital event update",
      );
    }
    if (nextX > resolvedRange.max) {
      setRange((currentRange) => ({
        ...currentRange,
        max: nextX,
      }));
    }
    setActiveCapitalSpikeId(null);
  };

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

  return (
    <main className="min-h-svh overflow-x-clip bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_34%),linear-gradient(180deg,var(--background),var(--bg-base))] px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <motion.div
        animate="show"
        className="mx-auto flex max-w-full flex-col gap-6"
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
        {settingsFallbackActive ? <TimelineDemoSettingsNotice /> : null}
        <motion.section
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
          variants={routeSectionVariants}
        >
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="outline">DrawFlow Roadmap</Badge>
              <Badge variant="success">Capital schedule</Badge>
              {durableMeta ? (
                <>
                  <Badge data-ixc-ref="UI-DURABLE-BADGE" variant="success">
                    <ShieldCheck />
                    Durable Convex plan
                  </Badge>
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
                        ? "Save failed"
                        : durableSaveStatus === "saved"
                          ? "Saved"
                          : "Ready"}
                  </Badge>
                </>
              ) : null}
              <ShareStatusBadges
                loading={sharedSnapshotLoading}
                missing={sharedSnapshotMissing}
                share={share}
              />
            </div>
            <h1 className="text-balance font-semibold text-3xl text-foreground tracking-normal sm:text-4xl">
              {timelinePlanSummary.templateTitle} draw roadmap
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
              {timelinePlanSummary.includedCount} reimbursement milestones
              staged against {money(timelinePlanSummary.totalBudget)} in lender
              policy, evidence review, and borrower working-capital exposure.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <TimelineRoleSwitcher
              onRoleChange={setTimelineRole}
              role={timelineRole}
            />
            {durableMeta ? (
              <>
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
                  Live proposal link
                </Button>
              </>
            ) : null}
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
            <Button onClick={resetCurrentTimeline} size="sm" variant="outline">
              <RotateCcw />
              Reset
            </Button>
            <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm shadow-xs">
              <Switch
                checked={straightLine}
                onCheckedChange={setStraightLine}
              />
              Straight line
            </div>
          </div>
        </motion.section>

        <motion.div
          animate={{
            gridTemplateColumns:
              isCompactLayout || !selectedPanelOpen
                ? "minmax(0, 1fr) 0px"
                : "minmax(0, 1fr) 320px",
          }}
          className="grid min-w-0 gap-y-6 lg:items-start"
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
            className="grid min-w-0 gap-6"
            data-testid="timeline-workspace-main"
          >
            <motion.section
              className="min-w-0 rounded-lg border border-border bg-background/92 p-3 shadow-sm backdrop-blur sm:p-4"
              data-testid="timeline-cashflow-chart"
              variants={routeSectionVariants}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
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
                  <h2 className="font-semibold text-xl">
                    Cash requirement vs draw recovery
                  </h2>
                  <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                    Costs pull borrower cash down as milestone work progresses;
                    draw capacity unlocks at completion and releases replenish
                    cash on their scheduled dates. Capital spikes model
                    unexpected planning costs.
                  </p>
                </div>
                <div className="grid w-full gap-3 lg:w-auto lg:min-w-[560px]">
                  <div className="grid gap-1.5 sm:ml-auto sm:w-56">
                    <Label className="text-xs" htmlFor="timeline-starting-cash">
                      Initial cash on hand
                    </Label>
                    <Input
                      data-testid="timeline-starting-cash-input"
                      id="timeline-starting-cash"
                      min={0}
                      nativeInput
                      onChange={(event) => {
                        const nextValue = Math.max(
                          0,
                          Math.round(Number(event.currentTarget.value)),
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
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Probe
                      </p>
                      <p
                        className="mt-1 font-semibold text-foreground"
                        data-testid="timeline-cashflow-probe-day"
                      >
                        {probeValue === null
                          ? "Hover chart"
                          : `Day ${Math.round(probeValue)}`}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Cash
                      </p>
                      <p
                        className="mt-1 font-semibold text-foreground tabular-nums"
                        data-testid="timeline-cashflow-probe-cash"
                      >
                        {probeCashOnHand === null
                          ? "-"
                          : money(probeCashOnHand)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Ending cash
                      </p>
                      <p
                        className="mt-1 font-semibold text-foreground tabular-nums"
                        data-testid="timeline-cashflow-ending-cash"
                      >
                        {money(endingCashOnHand)}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "min-w-0 rounded-md border px-2.5 py-2 sm:px-3",
                        cashShortfalls.length > 0
                          ? "border-rose-500/30 bg-rose-500/10"
                          : "border-border bg-muted/30",
                      )}
                      data-testid="timeline-cashflow-risk-summary"
                    >
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Cash risk
                      </p>
                      <p className="mt-1 font-semibold text-foreground tabular-nums">
                        {cashShortfalls.length > 0
                          ? `${cashShortfalls.length} flagged`
                          : "Clear"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {cashShortfalls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cashShortfalls.slice(0, 4).map((point) => (
                    <div
                      className="inline-flex max-w-full items-center gap-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-rose-700 text-xs dark:text-rose-100"
                      data-testid="timeline-cash-shortfall-point"
                      key={`${point.day}-${point.milestone}`}
                    >
                      <AlertTriangle className="size-3.5" />
                      <span className="font-medium">
                        {formatTimelineDay(point.day)}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        {formatCashShortfallMessage(point)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <TimelineCashflowCompoundChart
                barSize={timelineSizing.barSize}
                data={cashflowChartData}
                onProbeChange={setProbeValue}
                referenceLines={cashflowReferenceLines}
                xDomain={[resolvedRange.min, resolvedRange.max]}
                xTicks={cashflowTicks}
                yAxisWidth={timelineSizing.yAxisWidth}
                yDomain={[cashflowExtent.min, cashflowExtent.max]}
              />
            </motion.section>

            <motion.section
              className="relative z-30 min-w-0 overflow-visible"
              data-testid="timeline-roadmap-grid"
              variants={routeSectionVariants}
            >
              <AnimatedCurvedTimeline<DemoMilestone>
                activeItemId={activeItemId}
                activeItemPhase={
                  activeSelection.phase === "complete" ? "end" : "start"
                }
                cardWidth={timelineSizing.cardWidth}
                className="min-w-0"
                endCardWidth={timelineSizing.endCardWidth}
                formatValue={(value) => `Day ${Math.round(value)}`}
                getItemEndValue={getMilestoneEndX}
                hoverValue={probeValue}
                insertion={{
                  actions: [
                    {
                      icon: (
                        <CircleDollarSign className="size-4 text-rose-500" />
                      ),
                      id: "add-draw",
                      label: "Add draw",
                      onSelect: ({ requestedX }) => addManualDraw(requestedX),
                    },
                    {
                      icon: <AlertTriangle className="size-4 text-amber-500" />,
                      id: "add-capital-spike",
                      label: "Add capital spike",
                      onSelect: ({ requestedX }) => addCapitalSpike(requestedX),
                    },
                  ],
                  createItem: (requestedX) => {
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
                    };
                  },
                  label: "Add milestone",
                  minGap: 14,
                  step: 1,
                }}
                items={items}
                markers={markers}
                minInlineNodeSpacingPx={72}
                minNodeSpacingPx={timelineSizing.minNodeSpacingPx}
                onActiveItemChange={(item) => {
                  setActiveDrawId(null);
                  setActiveCapitalSpikeId(null);
                  setActiveSelection({ itemId: item.id, phase: "inProgress" });
                }}
                onEndNodeClick={(item) => {
                  setActiveDrawId(null);
                  setActiveCapitalSpikeId(null);
                  setActiveSelection({ itemId: item.id, phase: "complete" });
                  setProgressValue(getMilestoneEndX(item));
                  setSelectedPanelOpen(true);
                }}
                onHoverValueChange={setProbeValue}
                onItemsChange={(nextItems, details) => {
                  const normalizedItems =
                    normalizeMilestoneTimelineItems(nextItems);
                  const expandedRange = expandTimelineRangeForMilestones(
                    normalizedItems,
                    details.range,
                  );
                  const normalizedInsertedItem =
                    details.type === "insert"
                      ? normalizedItems.find(
                          (item) => item.id === details.insertedItem.id,
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
                      expandedRange,
                    ),
                  );
                  if (durablePlanId) {
                    if (normalizedInsertedItem) {
                      runDurableMutation(
                        createTimelineMilestone({
                          milestone: timelineItemToMilestoneMutationInput(
                            normalizedInsertedItem,
                            normalizedItems.findIndex(
                              (item) => item.id === normalizedInsertedItem.id,
                            ) + 1,
                          ),
                          planId: durablePlanId,
                        }),
                        "milestone creation",
                      );
                    } else {
                      for (const [index, item] of normalizedItems.entries()) {
                        runDurableMutation(
                          updateTimelineMilestone({
                            ...timelineItemToMilestoneMutationInput(
                              item,
                              index + 1,
                            ),
                            planId: durablePlanId,
                          }),
                          "milestone position",
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
                  const expandedRange = pendingExpandedRange.current;
                  pendingExpandedRange.current = null;
                  setRange(
                    expandedRange ??
                      expandTimelineRangeForMilestones(items, nextRange),
                  );
                }}
                paddingX={timelineSizing.paddingX}
                pixelsPerUnit={timelineSizing.pixelsPerUnit}
                progressValue={progressValue}
                range={range}
                renderCard={(item, context) => (
                  <TimelineDeleteContextMenu
                    kind="milestone"
                    onDelete={() => deleteMilestone(item.id)}
                  >
                    <MilestoneCard
                      active={context.active}
                      complete={hasCompletionClaim(item)}
                      item={item}
                      onUpdate={updateMilestone}
                      reducedMotion={Boolean(prefersReducedMotion)}
                    />
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
                  const capitalSpikeId = marker.id.startsWith("capital-spike-")
                    ? marker.id.slice("capital-spike-".length)
                    : null;
                  const draw = drawId
                    ? draws.find((candidate) => candidate.id === drawId)
                    : null;
                  const capitalSpike = capitalSpikeId
                    ? capitalSpikes.find(
                        (candidate) => candidate.id === capitalSpikeId,
                      )
                    : null;

                  if (!draw) {
                    if (capitalSpike) {
                      return (
                        <TimelineDeleteContextMenu
                          kind="capitalSpike"
                          onDelete={() => deleteCapitalSpike(capitalSpike.id)}
                        >
                          <CapitalSpikeTimelineMarker
                            active={capitalSpike.id === activeCapitalSpikeId}
                            draft={capitalSpikeEditDraft}
                            onApply={applyCapitalSpikeEdit}
                            onCancel={() => setActiveCapitalSpikeId(null)}
                            onDraftChange={setCapitalSpikeEditDraft}
                            onOpen={() => openCapitalSpikeEditor(capitalSpike)}
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
                      canDelete={draw.requestStatus !== "approved"}
                      deleteDisabledReason="Approved reimbursement draws cannot be deleted."
                      kind="draw"
                      onDelete={() => deleteDraw(draw.id)}
                    >
                      <DrawTimelineMarker
                        active={draw.id === activeDrawId}
                        draft={drawEditDraft}
                        draw={draw}
                        onApply={applyDrawEdit}
                        onCancel={() => setActiveDrawId(null)}
                        onDraftChange={setDrawEditDraft}
                        onOpen={() => openDrawEditor(draw)}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    </TimelineDeleteContextMenu>
                  );
                }}
                renderNode={(item, context) => (
                  <TimelineDeleteContextMenu
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
            </motion.section>

            <SelectedDrawMobileDrawer
              activeDraw={activeItemDraw}
              activeItem={activeItem}
              activePanelDraw={activePanelDraw}
              activePanelDrawItem={activePanelDrawItem}
              addEvidenceFiles={addEvidenceFiles}
              draws={draws}
              items={items}
              onCompleteMilestone={completeMilestone}
              onOpenChange={setSelectedPanelOpen}
              onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
              onRemoveEvidenceAsset={removeEvidenceAsset}
              onReviewDrawRequest={reviewDrawRequest}
              onReviewMilestoneCompletion={reviewMilestoneCompletion}
              onSubmitDrawRequest={submitDrawRequest}
              onUpdateEvidenceAsset={updateEvidenceAsset}
              open={
                Boolean(activeItem) && selectedPanelOpen && isMobileDrawerLayout
              }
              overview={financialOverview}
              range={resolvedRange}
              role={timelineRole}
            />

            <motion.section
              className="relative z-0 min-w-0 rounded-lg border border-border bg-background/92 p-3 shadow-sm backdrop-blur sm:p-4"
              data-testid="timeline-draw-availability-chart"
              variants={routeSectionVariants}
            >
              <div className="flex flex-col gap-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
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
              <EvilComposedChart
                activeDotVariant="default"
                areaConfig={{
                  interestBearingDraw: cashflowChartConfig.interestBearingDraw,
                  additionalAvailableDraw:
                    cashflowChartConfig.additionalAvailableDraw,
                }}
                areaCurveType="stepAfter"
                areaOpacity={0.18}
                areaStacked
                areaVariant="gradient"
                barConfig={{}}
                chartProps={{
                  margin: { bottom: 0, left: 0, right: 12, top: 18 },
                  onMouseLeave: () => setProbeValue(null),
                  onMouseMove: (state) => {
                    const nextValue = getChartProbeValue(state);

                    if (nextValue !== null) {
                      setProbeValue(nextValue);
                    }
                  },
                }}
                className="mt-3 h-[220px] min-w-0 sm:h-[210px]"
                curveType="stepAfter"
                data={drawAvailabilityChartData}
                dotVariant="default"
                hideLegend
                lineConfig={{
                  interestBearingDraw: cashflowChartConfig.interestBearingDraw,
                  totalAvailableDraw: cashflowChartConfig.totalAvailableDraw,
                }}
                referenceLines={drawAvailabilityReferenceLines}
                strokeVariant="solid"
                tooltipRoundness="xl"
                tooltipVariant="frosted-glass"
                xAxisProps={{
                  domain: [resolvedRange.min, resolvedRange.max],
                  height: 26,
                  tickFormatter: formatTimelineDay,
                  ticks: cashflowTicks,
                  type: "number",
                }}
                xDataKey="day"
                yAxisProps={{
                  domain: [0, drawAvailabilityExtent.max],
                  tickFormatter: formatCompactMoney,
                  width: timelineSizing.yAxisWidth,
                }}
                yDataKey="totalAvailableDraw"
              />
              <DrawAvailabilityMetrics
                endingAvailability={endingAvailability}
                probeDrawAvailability={probeDrawAvailability}
              />
              <DrawAvailabilityDeltaReadout
                probeDrawAvailability={probeDrawAvailability}
              />
            </motion.section>
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {selectedPanelOpen && !isMobileDrawerLayout ? (
              <motion.aside
                animate={{
                  filter: "blur(0px)",
                  opacity: 1,
                  scale: 1,
                  x: 0,
                }}
                className="sticky top-5 h-[calc(100svh-2.5rem)] min-w-0 overflow-hidden rounded-lg border border-border bg-background/94 shadow-sm backdrop-blur"
                data-testid="selected-draw-panel"
                exit={{
                  filter: "blur(4px)",
                  opacity: 0,
                  scale: 0.96,
                  x: 24,
                }}
                initial={{
                  filter: "blur(4px)",
                  opacity: 0,
                  scale: 0.96,
                  x: 24,
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
                      draws={draws}
                      items={items}
                      onCompleteMilestone={completeMilestone}
                      onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
                      onRemoveEvidenceAsset={removeEvidenceAsset}
                      onReviewDrawRequest={reviewDrawRequest}
                      onReviewMilestoneCompletion={reviewMilestoneCompletion}
                      onSubmitDrawRequest={submitDrawRequest}
                      onUpdateEvidenceAsset={updateEvidenceAsset}
                      overview={financialOverview}
                      range={resolvedRange}
                      role={timelineRole}
                    />
                  ) : null}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </main>
  );
}

interface CounterRef {
  current: number;
}

interface UseTimelineSnapshotSharingArgs {
  activeSelection: ActiveMilestoneSelection;
  capitalSpikeInsertionCount: CounterRef;
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  drawInsertionCount: CounterRef;
  draws: DemoDraw[];
  insertionCount: CounterRef;
  items: TimelineItem<DemoMilestone>[];
  progressValue: number;
  resolvedRange: Required<TimelineRange>;
  selectedPanelOpen: boolean;
  setActiveCapitalSpikeId: (value: string | null) => void;
  setActiveDrawId: (value: string | null) => void;
  setActiveSelection: (value: ActiveMilestoneSelection) => void;
  setCapitalSpikeEditDraft: (value: CapitalSpikeEditDraft) => void;
  setCapitalSpikes: Dispatch<SetStateAction<DemoCapitalSpike[]>>;
  setCurrentDay: (value: number) => void;
  setDrawEditDraft: (value: DrawEditDraft) => void;
  setDraws: (value: DemoDraw[]) => void;
  setItems: (value: TimelineItem<DemoMilestone>[]) => void;
  setProbeValue: (value: number | null) => void;
  setProgressValue: (value: number) => void;
  setRange: (value: TimelineRange) => void;
  setSelectedPanelOpen: (value: boolean) => void;
  setStartingCash: (value: number) => void;
  setStraightLine: (value: boolean) => void;
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
  capitalSpikeInsertionCount,
  capitalSpikes,
  currentDay,
  drawInsertionCount,
  draws,
  insertionCount,
  items,
  progressValue,
  resolvedRange,
  selectedPanelOpen,
  setActiveCapitalSpikeId,
  setActiveDrawId,
  setActiveSelection,
  setCapitalSpikeEditDraft,
  setCapitalSpikes,
  setCurrentDay,
  setDrawEditDraft,
  setDraws,
  setItems,
  setProbeValue,
  setProgressValue,
  setRange,
  setSelectedPanelOpen,
  setStartingCash,
  setStraightLine,
  startingCash,
  straightLine,
}: UseTimelineSnapshotSharingArgs) {
  const [{ share }, setTimelineSearch] = useQueryStates(timelineSearchParsers);
  const createTimelineSnapshot = useMutation(
    api.demo_timeline_snapshots.demo_createTimelineSnapshot,
  );
  const sharedSnapshot = useQuery(
    api.demo_timeline_snapshots.demo_getTimelineSnapshot,
    share && !share.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? { snapshotId: share }
      : "skip",
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
        false,
      ),
    [],
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
      setProgressValue(hydratedState.progressValue);
      setProbeValue(null);
      setActiveDrawId(null);
      setActiveCapitalSpikeId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setCapitalSpikeEditDraft({ amount: "", label: "", x: "" });
      setSelectedPanelOpen(hydratedState.selectedPanelOpen);
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
      setItems,
      setProbeValue,
      setProgressValue,
      setRange,
      setSelectedPanelOpen,
      setStartingCash,
      setStraightLine,
    ],
  );

  useEffect(() => {
    if (!share) {
      hydratedShareId.current = null;
      return;
    }

    setShareUrl(buildTimelineShareUrl(share));
  }, [share]);

  useEffect(() => {
    if (
      !(
        share?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        hydratedShareId.current !== share
      )
    ) {
      return;
    }

    const storedSnapshot = readLocalTimelineSnapshot(share);
    if (storedSnapshot) {
      applyShareState(
        applyTimelineShareSnapshotV2(storedSnapshot, initialShareState),
      );
      hydratedShareId.current = share;
    }
  }, [applyShareState, initialShareState, share]);

  useEffect(() => {
    if (!(share && sharedSnapshot && hydratedShareId.current !== share)) {
      return;
    }

    applyShareState(
      applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState),
    );
    hydratedShareId.current = share;
  }, [applyShareState, initialShareState, share, sharedSnapshot]);

  const resetTimeline = useCallback(() => {
    const localSnapshot = share?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? readLocalTimelineSnapshot(share)
      : null;
    const nextState = localSnapshot
      ? applyTimelineShareSnapshotV2(localSnapshot, initialShareState)
      : share && sharedSnapshot
        ? applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState)
        : initialShareState;

    applyShareState(nextState);
  }, [applyShareState, initialShareState, share, sharedSnapshot]);

  const createShareSnapshot = useCallback(async () => {
    setShareOpen(true);
    setShareCreating(true);
    setShareCopied(false);
    setShareError(null);

    try {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        capitalSpikes,
        currentDay,
        draws,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        startingCash,
        straightLine,
      });
      const snapshotId = await createTimelineSnapshot({ snapshot });
      const nextShareUrl = buildTimelineShareUrl(snapshotId);

      await setTimelineSearch({ share: snapshotId });
      setShareUrl(nextShareUrl);
    } catch {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        capitalSpikes,
        currentDay,
        draws,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        startingCash,
        straightLine,
      });
      const localShareId = `${LOCAL_TIMELINE_SHARE_PREFIX}${Date.now().toString(
        36,
      )}`;
      writeLocalTimelineSnapshot(localShareId, snapshot);
      await setTimelineSearch({ share: localShareId });
      setShareUrl(buildTimelineShareUrl(localShareId));
      setShareError(null);
    } finally {
      setShareCreating(false);
    }
  }, [
    activeSelection,
    capitalSpikes,
    createTimelineSnapshot,
    currentDay,
    draws,
    items,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setTimelineSearch,
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
        error instanceof Error ? error.message : "Unable to copy the link.",
      );
    }
  }, [shareUrl]);

  return {
    resetTimeline,
    share,
    sharedSnapshotLoading: Boolean(
      share &&
      !share.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
      sharedSnapshot === undefined,
    ),
    sharedSnapshotMissing: Boolean(
      share &&
      !share.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
      sharedSnapshot === null,
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

export function buildDemoDraws(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange,
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
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);
  return draws
    .map((draw) => ({
      ...draw,
      x: clampNumber(draw.x, resolvedRange.min, resolvedRange.max),
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function relabelTimelineDraws(draws: DemoDraw[]) {
  return draws
    .slice()
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((draw, index) => {
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
  order: number,
) {
  const milestone = item.data;
  return {
    budgetCents: milestone?.amount ?? 0,
    dayEnd: Math.round(item.x + (milestone?.durationDays ?? 1)),
    dayStart: Math.round(item.x),
    dependencyKeys: [],
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
    submilestones: (milestone?.subMilestones ?? []).map((name, index) => ({
      key: `${item.id}-sub-${index + 1}`,
      name,
      order: index + 1,
    })),
    tone: item.tone,
    type: "timeline_demo",
    x: item.x,
  };
}

export function normalizeTimelineShareStateForRoute(
  state: TimelineShareState,
): TimelineShareState {
  const range = expandTimelineRangeForMilestones(state.items, state.range);

  return {
    ...state,
    draws: syncDemoDrawsWithItems(state.draws, state.items, range),
    range,
  };
}

export function expandTimelineRangeForMilestones(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange,
): Required<TimelineRange> {
  const resolvedRange = normalizeDemoRange(range);
  const lastCompletionX = items.reduce(
    (nextMax, item) => Math.max(nextMax, getMilestoneEndX(item)),
    Number.NEGATIVE_INFINITY,
  );
  const max = Number.isFinite(lastCompletionX)
    ? Math.max(
        resolvedRange.min + 1,
        lastCompletionX + TIMELINE_END_PADDING_DAYS,
      )
    : resolvedRange.min + TIMELINE_END_PADDING_DAYS;

  return {
    ...resolvedRange,
    max,
  };
}

export function resolveSelectedDrawDate(
  activeItem: TimelineItem<DemoMilestone>,
  activeDraw: DemoDraw | null | undefined,
  range: TimelineRange,
): number {
  if (activeDraw) {
    return activeDraw.x;
  }

  return createDemoDraw(
    activeItem,
    expandTimelineRangeForMilestones([activeItem], range),
  ).x;
}

function createDemoDraw(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>,
): DemoDraw {
  const milestone = item.data;
  const defaultDrawX = resolveDefaultDrawX(item, range);
  const drawX = clampNumber(
    Math.max(milestone?.drawX ?? defaultDrawX, defaultDrawX),
    range.min,
    range.max,
  );

  return {
    amount: milestone?.amount ?? 0,
    id: `${item.id}-draw`,
    label: milestone?.draw ?? item.label ?? "Reimbursement draw",
    x: drawX,
  };
}

function formatTimelineDay(value: number) {
  return `Day ${Math.round(value)}`;
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

function calculateDrawRequestLimit(
  targetDraw: DemoDraw,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
): DrawRequestLimit {
  const drawDay = targetDraw.x;
  const totalUnlocked = items.reduce((total, item) => {
    if (!item.data || getMilestoneEndX(item) > drawDay) {
      return total;
    }

    return total + item.data.amount;
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
  const availableLimit = Math.max(0, totalUnlocked - alreadyDrawn);

  return {
    alreadyDrawn,
    availableLimit,
    remainingAfterRequest: Math.max(0, availableLimit - targetDraw.amount),
    totalUnlocked,
  };
}

export function buildTimelineCashflowData(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: Required<TimelineRange>,
  startingCash = STARTING_CASH,
): CashflowDatum[] {
  const events = [
    ...items
      .filter((item) => item.data)
      .flatMap((item) => {
        const spendEvents = buildMilestoneSpendEvents(item);
        const completionDay = getMilestoneEndX(item);
        const completionSpendEvent = spendEvents.find(
          (event) => event.kind === "completion" && event.day === completionDay,
        );
        const insertedCapacityEvent = {
          amount: 0,
          day: completionDay,
          id: `${item.id}-completion-capacity`,
          kind: "completion" as const,
          label: `${item.data?.name ?? item.label ?? "Milestone"} completion capacity`,
          milestoneAmount: item.data?.amount ?? 0,
          milestoneId: item.id,
          milestoneName: item.data?.name ?? item.label ?? "Milestone",
        };
        const normalizedSpendEvents = completionSpendEvent
          ? spendEvents
          : [...spendEvents, insertedCapacityEvent];
        const completionCapacityEventId =
          completionSpendEvent?.id ?? insertedCapacityEvent.id;

        return normalizedSpendEvents.map((event) => ({
          amount: event.amount,
          day: clampNumber(event.day, range.min, range.max),
          drawCapacityUnlocked:
            event.id === completionCapacityEventId ? event.milestoneAmount : 0,
          id: event.id,
          label: event.label,
          sortOrder: event.kind === "initial" ? 0 : 2,
          type: "milestone" as const,
        }));
      }),
    ...capitalSpikes.map((spike) => ({
      amount: spike.amount,
      day: clampNumber(spike.x, range.min, range.max),
      drawCapacityUnlocked: 0,
      id: spike.id,
      label: spike.label,
      sortOrder: 3,
      type: "capitalSpike" as const,
    })),
    ...draws.map((draw) => ({
      amount: draw.amount,
      day: clampNumber(draw.x, range.min, range.max),
      drawCapacityUnlocked: 0,
      id: draw.id,
      label: draw.label,
      sortOrder: 4,
      type: "draw" as const,
    })),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const data: CashflowDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: startingCash,
      day: range.min,
      drawCapacityUnlocked: 0,
      drawAmount: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
    },
  ];
  let cashOnHand = startingCash;

  for (const event of events) {
    if (event.type === "milestone") {
      cashOnHand -= event.amount;
      data.push({
        budget: event.amount,
        capitalSpikeAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: event.drawCapacityUnlocked,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        name: event.label,
      });
      continue;
    }

    if (event.type === "capitalSpike") {
      cashOnHand -= event.amount;
      data.push({
        budget: 0,
        capitalSpikeAmount: event.amount,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "capitalSpike",
        id: event.id,
        name: event.label,
      });
      continue;
    }

    cashOnHand += event.amount;
    data.push({
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: event.day,
      drawCapacityUnlocked: 0,
      drawAmount: event.amount,
      event: "draw",
      id: event.id,
      name: event.label,
    });
  }

  return data;
}

export function densifyCashflowData(
  data: CashflowDatum[],
  range: Required<TimelineRange>,
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
  startingCash = STARTING_CASH,
): CashflowDatum[] {
  const milestoneBars = buildMilestoneCostBars(items, range);
  const milestoneDays = items
    .filter((item) => item.data)
    .flatMap((item) => [item.x, getMilestoneEndX(item)]);
  const eventDays = [
    ...accountingData.map((point) => point.day),
    ...milestoneDays,
  ];
  const milestoneBudgetByDay = new Map<number, number>();

  for (const bar of milestoneBars) {
    milestoneBudgetByDay.set(
      bar.day,
      (milestoneBudgetByDay.get(bar.day) ?? 0) + bar.amount,
    );
  }

  return buildCashflowChartEventDays(range, eventDays).map((day) => {
    const dayEvents = accountingData.filter(
      (point) => Math.round(point.day) === day,
    );
    const drawAmount = dayEvents.reduce(
      (total, point) => total + point.drawAmount,
      0,
    );
    const capitalSpikeAmount = dayEvents.reduce(
      (total, point) => total + point.capitalSpikeAmount,
      0,
    );
    const budget = milestoneBudgetByDay.get(day) ?? 0;
    const primaryEvent =
      dayEvents.find((point) => point.event === "draw") ??
      dayEvents.find((point) => point.event === "capitalSpike") ??
      dayEvents[0];

    return {
      budget,
      capitalSpikeAmount,
      cashOnHand: projectCashOnHandForChart(
        accountingData,
        items,
        range,
        day,
        startingCash,
      ),
      day,
      drawAmount,
      drawCapacityUnlocked: 0,
      event: budget > 0 ? "milestone" : (primaryEvent?.event ?? "start"),
      id:
        budget > 0
          ? `milestone-cost-gate-${day}`
          : (primaryEvent?.id ?? `cash-probe-${day}`),
      name:
        budget > 0
          ? "Milestone cost gate"
          : (primaryEvent?.name ?? formatTimelineDay(day)),
    } satisfies CashflowDatum;
  });
}

function buildCashflowChartEventDays(
  range: Required<TimelineRange>,
  eventDays: number[],
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
  range: Required<TimelineRange>,
): Array<{ amount: number; day: number }> {
  return items
    .filter((item) => item.data)
    .map((item) => {
      const schedule = getMilestonePaymentSchedule(item);

      return {
        amount: schedule.totalAmount,
        day: Math.round(clampNumber(schedule.startX, range.min, range.max)),
      };
    })
    .filter((bar) => bar.amount > 0);
}

function projectCashOnHandForChart(
  accountingData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>,
  value: number,
  startingCash = STARTING_CASH,
): number {
  const startPoint = accountingData.find((point) => point.event === "start");
  let cashOnHand = startPoint?.cashOnHand ?? startingCash;

  for (const point of accountingData) {
    if (point.day <= value) {
      cashOnHand += point.drawAmount;
      cashOnHand -= point.capitalSpikeAmount;
    }
  }

  for (const item of items) {
    if (!item.data) {
      continue;
    }

    const schedule = getMilestonePaymentSchedule(item);
    const startX = clampNumber(schedule.startX, range.min, range.max);
    const endX = clampNumber(schedule.endX, range.min, range.max);

    if (value < startX) {
      continue;
    }

    if (value >= endX || endX <= startX) {
      cashOnHand -= schedule.totalAmount;
      continue;
    }

    const completionAmount = Math.max(
      0,
      schedule.totalAmount - schedule.initialPaymentAmount,
    );
    cashOnHand -=
      schedule.initialPaymentAmount +
      completionAmount * ((value - startX) / Math.max(1, endX - startX));
  }

  return cashOnHand;
}

export function densifyDrawAvailabilityData(
  data: DrawAvailabilityDatum[],
  range: Required<TimelineRange>,
): DrawAvailabilityDatum[] {
  const grouped = new Map<number, DrawAvailabilityDatum[]>();

  for (const point of data) {
    const day = Math.round(point.day);
    grouped.set(day, [...(grouped.get(day) ?? []), point]);
  }

  return buildChartProbeDays(
    range,
    data.map((point) => point.day),
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

export function buildChartProbeDays(
  range: Required<TimelineRange>,
  eventDays: number[],
  intervalDays = CHART_PROBE_INTERVAL_DAYS,
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

export function buildDrawAvailabilityData(
  cashflowData: CashflowDatum[],
): DrawAvailabilityDatum[] {
  let unlockedDraw = 0;
  let releasedDraw = 0;

  return cashflowData.map((point) => {
    unlockedDraw += point.drawCapacityUnlocked;
    releasedDraw += point.drawAmount;

    const interestBearingDraw = releasedDraw;
    const additionalAvailableDraw = Math.max(0, unlockedDraw - releasedDraw);

    return {
      additionalAvailableDraw,
      day: point.day,
      interestBearingDraw,
      name: point.name,
      totalAvailableDraw: interestBearingDraw + additionalAvailableDraw,
    };
  });
}

export function buildCashShortfallPoints(
  cashflowData: CashflowDatum[],
): CashShortfallPoint[] {
  return cashflowData.flatMap((point) => {
    if (point.event !== "milestone" || point.budget <= 0) {
      return [];
    }

    const cashBeforeMilestone = point.cashOnHand + point.budget;
    const cashAfterMilestone = point.cashOnHand;

    if (cashAfterMilestone > MINIMUM_POST_MILESTONE_CASH_RESERVE) {
      return [];
    }

    return [
      {
        cashBeforeMilestone,
        cashOnHand: point.cashOnHand,
        day: point.day,
        milestone: point.name,
        milestoneCost: point.budget,
        shortfall: Math.max(
          0,
          MINIMUM_POST_MILESTONE_CASH_RESERVE - cashAfterMilestone,
        ),
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

function buildFinancialOverview(
  cashflowData: CashflowDatum[],
  draws: DemoDraw[],
  range: Required<TimelineRange>,
): FinancialOverview {
  const drawEvents = cashflowData
    .filter((point) => point.event === "draw")
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  let principal = 0;
  let previousDay = range.min;
  let interestPaid = 0;

  for (const event of drawEvents) {
    const day = clampNumber(event.day, range.min, range.max);
    interestPaid += principal * INTEREST_APR * ((day - previousDay) / 365);
    principal += event.drawAmount;
    previousDay = day;
  }

  interestPaid += principal * INTEREST_APR * ((range.max - previousDay) / 365);

  return {
    drawCount: draws.length,
    drawFeesPaid: draws.length * DRAW_FEE,
    interestPaid,
    totalDrawReleased: drawEvents.reduce(
      (total, event) => total + event.drawAmount,
      0,
    ),
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
  pixelsPerUnit: number,
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
    ]),
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
  value: number,
): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  const sorted = [...data].sort(
    (a, b) => a.day - b.day || a.id.localeCompare(b.id),
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

function interpolateDrawAvailability(
  data: DrawAvailabilityDatum[],
  value: number,
): DrawAvailabilityDatum {
  const fallback = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalAvailableDraw: 0,
  };

  if (data.length === 0) {
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
  };
}

function getChartProbeValue(state: unknown): number | null {
  if (!isRecord(state)) {
    return null;
  }

  const payloadValue = readChartPayloadValue(state.activePayload);
  if (payloadValue !== null) {
    return payloadValue;
  }

  return toFiniteNumber(state.activeLabel);
}

function readChartPayloadValue(activePayload: unknown): number | null {
  if (!Array.isArray(activePayload)) {
    return null;
  }

  for (const payloadItem of activePayload) {
    if (!(isRecord(payloadItem) && isRecord(payloadItem.payload))) {
      continue;
    }

    const value = toFiniteNumber(payloadItem.payload.day);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
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
  items: TimelineItem<DemoMilestone>[],
): number {
  return items.filter((item) => item.id.startsWith("inserted-")).length;
}

function countManualDraws(draws: DemoDraw[]): number {
  return draws.filter((draw) => draw.id.startsWith("manual-draw-")).length;
}

function buildTimelineShareUrl(snapshotId: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL("/demo/timeline", window.location.origin);
  url.searchParams.set("share", snapshotId);

  return url.toString();
}

function readLocalTimelineSnapshot(snapshotId: string): unknown {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSnapshot = window.localStorage.getItem(
    `${LOCAL_TIMELINE_SHARE_PREFIX}snapshot:${snapshotId}`,
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
    JSON.stringify(snapshot),
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
        `Review this DrawFlow roadmap snapshot: ${shareUrl}`,
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
  addEvidenceFiles,
  activeItem,
  draws,
  items,
  onOpenChange,
  onCompleteMilestone,
  onRequestMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onReviewDrawRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  open,
  overview,
  range,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onOpenChange: (open: boolean) => void;
  onCompleteMilestone: (
    itemId: string,
    claim: { actualCost?: number; completedDay: number; note?: string },
  ) => void;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput,
  ) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" },
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" },
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string },
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
  ) => void;
  open: boolean;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  role: TimelineDemoRole;
}) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="bottom">
      <DrawerPopup
        className="max-h-[86svh]"
        data-testid="selected-draw-mobile-drawer"
        showBar
      >
        <DrawerPanel className="px-4 pt-5 pb-6" scrollFade>
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
              draws={draws}
              items={items}
              onCompleteMilestone={onCompleteMilestone}
              onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
              onRemoveEvidenceAsset={onRemoveEvidenceAsset}
              onReviewDrawRequest={onReviewDrawRequest}
              onReviewMilestoneCompletion={onReviewMilestoneCompletion}
              onSubmitDrawRequest={onSubmitDrawRequest}
              onUpdateEvidenceAsset={onUpdateEvidenceAsset}
              overview={overview}
              range={range}
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
  addEvidenceFiles,
  activeItem,
  draws,
  items,
  onCompleteMilestone,
  onRequestMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onReviewDrawRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  overview,
  range,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onCompleteMilestone: (
    itemId: string,
    claim: { actualCost?: number; completedDay: number; note?: string },
  ) => void;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput,
  ) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" },
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" },
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string },
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
  ) => void;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  role: TimelineDemoRole;
}) {
  if (activePanelDraw) {
    if (role === "lender") {
      return (
        <LenderDrawReviewPanel
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
        draw={activePanelDraw}
        drawItem={activePanelDrawItem}
        draws={draws}
        items={items}
        onSubmitDrawRequest={onSubmitDrawRequest}
      />
    );
  }

  if (role === "lender") {
    return (
      <LenderMilestoneReviewPanel
        activeItem={activeItem}
        items={items}
        onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
        onReviewMilestoneCompletion={onReviewMilestoneCompletion}
        overview={overview}
      />
    );
  }

  return (
    <MilestoneOperationsPanel
      activeDraw={activeDraw}
      activeItem={activeItem}
      addEvidenceFiles={addEvidenceFiles}
      onCompleteMilestone={onCompleteMilestone}
      onRemoveEvidenceAsset={onRemoveEvidenceAsset}
      onUpdateEvidenceAsset={onUpdateEvidenceAsset}
      overview={overview}
      range={range}
    />
  );
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
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
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
  onCompleteMilestone,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
  overview,
  range,
}: {
  activeDraw: DemoDraw | null;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  onCompleteMilestone: (
    itemId: string,
    claim: { actualCost?: number; completedDay: number; note?: string },
  ) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
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

  return (
    <div className="grid gap-4" data-testid="selected-draw-details">
      <div>
        <div
          className={cn(
            "mb-3 grid size-10 place-items-center rounded-md",
            completed
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-rose-500/10 text-rose-600",
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
          Milestone completes on{" "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
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
              resolveSelectedDrawDate(activeItem, activeDraw, range),
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Milestone cost</dt>
          <dd className="font-semibold tabular-nums">
            {money(milestone.amount)}
          </dd>
        </div>
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

      <div className="border-border border-t pt-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Sub-milestones
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {milestone.subMilestones.map((subMilestone) => (
            <span
              className="rounded-md border border-border bg-muted/35 px-2 py-1 text-xs"
              key={subMilestone}
            >
              {subMilestone}
            </span>
          ))}
        </div>
      </div>

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
  items,
  onRequestMilestoneSiteVisit,
  onReviewMilestoneCompletion,
  overview,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  items: TimelineItem<DemoMilestone>[];
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput,
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" },
  ) => void;
  overview: FinancialOverview;
}) {
  const milestone = activeItem.data;
  const workspace = useQuery(api.demo_drawflow.demo_getWorkspace, {
    scenario: "active",
  });
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
  const liveSiteVisit = findLiveSiteVisit(workspace, siteVisit?.visitId);
  const liveStatus = normalizeTimelineSiteVisitStatus(
    liveSiteVisit?.status ?? siteVisit?.status,
    liveSiteVisit?.tokenExpiresAt ?? siteVisit?.tokenExpiresAt,
  );
  const siteVisitUrl = buildAbsoluteSiteVisitUrl(siteVisit?.url);
  const eligibleSiteVisitItems = items.slice(
    0,
    Math.max(
      0,
      items.findIndex((item) => item.id === activeItem.id),
    ) + 1,
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
      Number(formData.get("siteVisitDay") ?? getMilestoneEndX(activeItem)),
    );
    const note = String(formData.get("siteVisitNote") ?? "").trim();
    const includedItemIds = Array.from(
      new Set(
        [
          ...formData.getAll("includedSiteVisitItemId").map(String),
          activeItem.id,
        ].filter(Boolean),
      ),
    );

    if (!Number.isFinite(requestedDay)) {
      return;
    }

    setSiteVisitError("");
    setSiteVisitPending(true);
    try {
      if (workspace?.needsSeed) {
        await seedDemo({});
      }
      const result = await requestSiteVisit({
        includedMilestoneKeys: includedItemIds.map(
          resolveTimelineSiteVisitMilestoneKey,
        ),
        milestoneKey: resolveTimelineSiteVisitMilestoneKey(activeItem.id),
        persona: "lender_admin",
        reason:
          note ||
          `Field verification requested from timeline for ${milestone.name}.`,
      });

      onRequestMilestoneSiteVisit(activeItem.id, {
        includedItemIds,
        ...(note ? { note } : {}),
        requestedDay,
        status: "requested",
        tokenExpiresAt: result.tokenExpiresAt,
        url: normalizeSiteVisitTokenRoute({
          url: result.url,
        }),
        visitId: result.visitId,
      });
    } catch (error) {
      setSiteVisitError(
        error instanceof Error
          ? error.message
          : "Unable to generate site visit token.",
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
          Milestone completes on{" "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
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
          <dt className="text-muted-foreground">Milestone cost</dt>
          <dd className="font-semibold tabular-nums">
            {money(milestone.amount)}
          </dd>
        </div>
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
            Approve the builder claim or send it back for revision.
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
        <div className="grid grid-cols-2 gap-2">
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
          disabled={siteVisitPending || liveStatus === "complete"}
          data-testid={`lender-site-visit-submit-${activeItem.id}`}
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

function DrawRequestPanel({
  draw,
  drawItem,
  draws,
  items,
  onSubmitDrawRequest,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string },
  ) => void;
}) {
  const limit = calculateDrawRequestLimit(draw, items, draws);
  const overLimit = draw.amount > limit.availableLimit;
  const requestSubmitted =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestAmountId = `draw-request-amount-${draw.id}`;
  const requestNoteId = `draw-request-note-${draw.id}`;

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedAmount = Math.round(
      Number(formData.get("drawRequestAmount") ?? draw.amount),
    );
    const note = String(formData.get("drawRequestNote") ?? "").trim();

    if (!Number.isFinite(requestedAmount)) {
      return;
    }

    onSubmitDrawRequest(draw.id, {
      amount: requestedAmount,
      ...(note ? { note } : {}),
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
            {money(limit.totalUnlocked)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Already drawn</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-already-drawn-${getDrawDomId(draw)}`}
          >
            {money(limit.alreadyDrawn)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available draw limit</dt>
          <dd
            className="font-semibold text-sky-700 tabular-nums dark:text-sky-100"
            data-testid={`selected-draw-available-limit-${getDrawDomId(draw)}`}
          >
            {money(limit.availableLimit)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Remaining after request</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-remaining-limit-${getDrawDomId(draw)}`}
          >
            {money(Math.max(0, limit.availableLimit - draw.amount))}
          </dd>
        </div>
      </dl>

      {overLimit ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-request-limit-warning-${getDrawDomId(draw)}`}
        >
          The current requested amount is above the unlocked limit. Submitting
          will clamp the request to {money(limit.availableLimit)}.
        </div>
      ) : null}

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`selected-draw-request-form-${getDrawDomId(draw)}`}
        key={`${draw.id}-${draw.requestedAt ?? "draft"}-${draw.amount}`}
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

        <label className="grid gap-1.5" htmlFor={requestAmountId}>
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Requested amount
          </span>
          <Input
            data-testid={`selected-draw-request-amount-input-${getDrawDomId(draw)}`}
            defaultValue={draw.amount}
            id={requestAmountId}
            max={limit.availableLimit}
            min={0}
            name="drawRequestAmount"
            nativeInput
            size="sm"
            step={1000}
            type="number"
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
          data-testid={`selected-draw-submit-request-${getDrawDomId(draw)}`}
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
          Limit = total completed milestone budget unlocked by{" "}
          {formatTimelineDay(draw.x)} minus prior released draws. Completion and
          evidence are handled from the milestone panel.
        </p>
      </div>
    </div>
  );
}

function LenderDrawReviewPanel({
  draw,
  drawItem,
  draws,
  items,
  onReviewDrawRequest,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" },
  ) => void;
}) {
  const limit = calculateDrawRequestLimit(draw, items, draws);
  const hasBuilderRequest =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestedAmountOverLimit = draw.amount > limit.availableLimit;
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
    <div
      className="grid gap-4"
      data-testid={`lender-draw-review-panel-${getDrawDomId(draw)}`}
    >
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <ShieldCheck className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Lender draw review
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
          {getDrawRequestStatusLabel(draw.requestStatus)}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
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
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100">
          Requested amount exceeds the available draw limit at this point in the
          schedule.
        </div>
      ) : null}

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-draw-review-form-${getDrawDomId(draw)}`}
        onSubmit={submitReview}
      >
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Draw approval
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
        {!hasBuilderRequest ? (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-muted-foreground text-xs">
            No builder request has been filed for this draw. The review actions
            stay disabled until a request exists.
          </div>
        ) : null}
        <Textarea
          className="min-h-20 resize-none text-sm"
          data-testid={`lender-draw-review-note-${getDrawDomId(draw)}`}
          defaultValue={draw.requestReviewNote ?? ""}
          name="drawReviewNote"
          placeholder="Approval condition, holdback reason, or audit note"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid={`lender-draw-reject-${getDrawDomId(draw)}`}
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
            data-testid={`lender-draw-approve-${getDrawDomId(draw)}`}
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
    </div>
  );
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
    claim: { actualCost?: number; completedDay: number; note?: string },
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
      Math.round(Number(formData.get("completedDay") ?? schedule.endX)),
    );
    const actualCostRaw = String(formData.get("actualCost") ?? "").trim();
    const actualCost =
      actualCostRaw.length === 0
        ? undefined
        : Math.max(0, Math.round(Number(actualCostRaw)));
    const note = String(formData.get("completionNote") ?? "").trim();

    if (!Number.isFinite(completedDay)) {
      return;
    }

    if (actualCost !== undefined && !Number.isFinite(actualCost)) {
      return;
    }

    onCompleteMilestone(activeItem.id, {
      ...(actualCost === undefined ? {} : { actualCost }),
      completedDay,
      ...(note ? { note } : {}),
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

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Completion day
          </span>
          <Input
            data-testid={`selected-draw-completion-day-input-${activeItem.id}`}
            defaultValue={claim?.completedDay ?? Math.round(schedule.endX)}
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
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
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
            : "border-border bg-background/60 text-muted-foreground hover:border-sky-300 hover:bg-sky-500/5",
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
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>,
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
    <div className="mt-3 grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-4">
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
                probeDrawAvailability.additionalAvailableDraw,
              )} available for draw`}
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
          toneClass,
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
  deleteDisabledReason,
  kind,
  onDelete,
}: {
  canDelete?: boolean;
  children: ReactNode;
  deleteDisabledReason?: string;
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
              {isDraw
                ? "Remove draw"
                : isCapitalSpike
                  ? "Remove capital spike"
                  : "Remove milestone"}
            </span>
            <span className="mt-0.5 block truncate text-muted-foreground text-xs">
              {isDraw && !canDelete
                ? (deleteDisabledReason ?? "This draw is locked")
                : isDraw
                  ? "Delete this draw marker"
                  : isCapitalSpike
                    ? "Delete this unexpected cost"
                    : "Delete this milestone"}
            </span>
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DrawTimelineMarker({
  active,
  draw,
  draft,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
}: {
  active: boolean;
  draw: DemoDraw;
  draft: DrawEditDraft;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: DrawEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
}) {
  const dayInputId = `draw-date-${draw.id}`;
  const amountInputId = `draw-amount-${draw.id}`;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${draw.label} date and amount`}
        className={cn(
          "group min-w-28 rounded-md border border-rose-200 bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-rose-500/30 dark:bg-zinc-950/90 dark:hover:bg-rose-500/10",
          active &&
            "border-rose-400 bg-rose-50 shadow-rose-500/15 dark:bg-rose-500/10",
        )}
        data-testid={`timeline-draw-marker-${getDrawDomId(draw)}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span className="flex items-center justify-center gap-1 font-semibold text-[10px] text-rose-600 uppercase tracking-normal">
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
      </motion.button>

      <AnimatePresence initial={false}>
        {active && (
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
                  min={0}
                  name="drawAmount"
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

function CapitalSpikeTimelineMarker({
  active,
  draft,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
  spike,
}: {
  active: boolean;
  draft: CapitalSpikeEditDraft;
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

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${spike.label}`}
        className={cn(
          "group min-w-32 rounded-md border border-amber-300 bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-amber-500/35 dark:bg-zinc-950/90 dark:hover:bg-amber-500/10",
          active &&
            "border-amber-500 bg-amber-50 shadow-amber-500/15 dark:bg-amber-500/10",
        )}
        data-testid={`timeline-capital-spike-marker-${spike.id}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span className="flex items-center justify-center gap-1 font-semibold text-[10px] text-amber-700 uppercase tracking-normal dark:text-amber-200">
          <AlertTriangle className="size-3" />
          {spike.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(spike.amount)}
        </span>
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
              <p className="font-semibold text-sm">Capital spike</p>
              <p className="text-muted-foreground text-xs">
                Update the unexpected cost label, date, and amount.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={titleInputId}>
                  Capital spike title
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
                  Capital spike date
                </Label>
                <Input
                  id={dayInputId}
                  min={0}
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
                  Capital spike amount
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
          "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
        active &&
          !complete &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700",
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

function TimelineEndNodeButton({
  active,
  complete,
  item,
  onClick,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.button
      aria-label={`Select completion point for ${
        item.data?.name ?? item.label ?? item.id
      }`}
      className={cn(
        "grid size-8 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
        active &&
          !complete &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700",
      )}
      data-testid={`demo-timeline-end-node-${item.id}`}
      onClick={onClick}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      <Check className="size-4" />
    </motion.button>
  );
}

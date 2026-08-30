import type { CollaborationTagOption } from "../CollaborationRichTextEditor.tsx";

export type SystemPostPrototypeVariant = "A" | "B" | "C";
export type SystemPostPrototypeKind = "milestone" | "draw";
export type SystemPostPrototypeScenario =
  | "active"
  | "archived"
  | "empty"
  | "error"
  | "loading"
  | "reopened"
  | "resolved"
  | "restricted";
export type SystemPostPrototypeRole =
  | "builder"
  | "contractor"
  | "lender_staff"
  | "lender_admin";

export type WorkState =
  | "backlog"
  | "behind_schedule"
  | "in_progress"
  | "in_review"
  | "approved";

export type DrawState =
  | "scheduled"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved"
  | "released";

export interface WorkItem {
  actualCost: string;
  actualEnd: string;
  actualStart: string;
  assignee: string;
  assigneeInitials: string;
  budget: string;
  builderEvidence: string[];
  code: string;
  completedVisitReport: string;
  dependencies: string;
  description: string;
  drawUnlock: string;
  evidence: string;
  fieldNotes: string;
  id: string;
  locationUnverified?: boolean;
  materials: string[];
  orderedSiteVisit: string;
  planned: string;
  plannedEnd: string;
  plannedStart: string;
  progress: number;
  scope: string;
  siteVisit: string;
  state: WorkState;
  suppliers: string[];
  title: string;
  tradespeople: string[];
}

export interface PrototypeEvent {
  actor: string;
  body: string;
  id: string;
  kind: "domain" | "discussion" | "evidence" | "planning";
  time: string;
  title: string;
  workItemId?: string;
}

export const VARIANTS = [
  { label: "Inline workboard", value: "A" },
  { label: "Inline work + history", value: "B" },
  { label: "Tabbed post app", value: "C" },
] as const;

export const ROLE_OPTIONS: { label: string; value: SystemPostPrototypeRole }[] = [
  { label: "Builder", value: "builder" },
  { label: "Contractor", value: "contractor" },
  { label: "Lender staff", value: "lender_staff" },
  { label: "Lender admin", value: "lender_admin" },
];

export const SCENARIO_OPTIONS: {
  label: string;
  value: SystemPostPrototypeScenario;
}[] = [
  { label: "Active", value: "active" },
  { label: "Resolved", value: "resolved" },
  { label: "Reopened", value: "reopened" },
  { label: "Archived", value: "archived" },
  { label: "Restricted", value: "restricted" },
  { label: "Loading", value: "loading" },
  { label: "Empty", value: "empty" },
  { label: "Error", value: "error" },
];

export const STATE_COLUMNS: { key: WorkState; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "behind_schedule", label: "Behind schedule" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
];

export const INITIAL_WORK_ITEMS: WorkItem[] = [
  {
    actualCost: "Not started",
    actualEnd: "—",
    actualStart: "—",
    assignee: "Assignment required",
    assigneeInitials: "?",
    budget: "$18,500",
    builderEvidence: [],
    code: "04.1",
    completedVisitReport: "None",
    description:
      "Set control points, confirm setbacks, and lay out footing lines from the approved site plan.",
    dependencies: "3 of 3 clear",
    drawUnlock: "$18,500 on approval",
    evidence: "0 of 2 required",
    fieldNotes:
      "Survey package is ready; a responsible operator still needs to accept the Work Allocation.",
    id: "layout",
    materials: ["Layout stakes", "Marking paint"],
    orderedSiteVisit: "None",
    planned: "Aug 5–6",
    plannedEnd: "Aug 6",
    plannedStart: "Aug 5",
    progress: 0,
    scope:
      "Survey control, footing corners, elevations, and setback verification.",
    siteVisit: "Not required",
    state: "backlog",
    suppliers: ["GeoPoint Survey Supply"],
    title: "Survey and footing layout",
    tradespeople: ["Assignment required"],
  },
  {
    actualCost: "Not started",
    actualEnd: "—",
    actualStart: "—",
    assignee: "Jordan Franks",
    assigneeInitials: "JF",
    budget: "$42,800",
    builderEvidence: [],
    code: "04.2",
    completedVisitReport: "None",
    description:
      "Install, brace, and verify footing forms before reinforcing steel placement.",
    dependencies: "2 of 2 clear",
    drawUnlock: "$42,800 on approval",
    evidence: "0 of 3 required",
    fieldNotes:
      "Start was missed. Jordan has not acknowledged mobilization or posted a field note.",
    id: "forms",
    materials: ["Form lumber", "Bracing", "Release agent"],
    orderedSiteVisit: "None",
    planned: "Aug 1–4 · missed start",
    plannedEnd: "Aug 4",
    plannedStart: "Aug 1",
    progress: 0,
    scope:
      "Footing formwork, bracing, dimensions, elevations, and pre-pour readiness.",
    siteVisit: "Not required",
    state: "behind_schedule",
    suppliers: ["Ellis Building Supply"],
    title: "Install footing forms",
    tradespeople: ["Jordan Franks", "Northstar Forming"],
  },
  {
    actualCost: "$51,800 committed",
    actualEnd: "—",
    actualStart: "Aug 4",
    assignee: "Alex Lee",
    assigneeInitials: "AL",
    budget: "$67,200",
    builderEvidence: ["Wall forms · north elevation", "Rebar spacing · grid B"],
    code: "04.3",
    completedVisitReport: "Pre-pour inspection · passed with note",
    description:
      "Place reinforcing steel, close wall forms, pour foundation walls, and cure to specification.",
    dependencies: "3 of 3 clear",
    drawUnlock: "$67,200 on approval",
    evidence: "2 of 3 · 1 unverified",
    fieldNotes:
      "North wall pour moved one day for pump access. One photo location attempt was unverified and retained.",
    id: "walls",
    locationUnverified: true,
    materials: ["32 MPa ready-mix", "15M rebar", "Anchor bolts"],
    orderedSiteVisit: "Aug 9 · risk review",
    planned: "Aug 3–10 · started late",
    plannedEnd: "Aug 10",
    plannedStart: "Aug 3",
    progress: 65,
    scope:
      "Reinforcement, wall forming, concrete placement, curing, and anchor layout.",
    siteVisit: "Risk review pending",
    state: "in_progress",
    suppliers: ["Dufferin Concrete", "Atlas Rebar"],
    title: "Pour foundation walls",
    tradespeople: ["Alex Lee", "Northstar Concrete"],
  },
  {
    actualCost: "$28,900 realized",
    actualEnd: "Aug 11",
    actualStart: "Aug 7",
    assignee: "Maya Kim",
    assigneeInitials: "MK",
    budget: "$29,600",
    builderEvidence: [
      "Primer coverage",
      "Membrane termination",
      "Protection board",
    ],
    code: "04.4",
    completedVisitReport: "Waterproofing review · report ready",
    description:
      "Prepare foundation walls and install the approved waterproofing and protection system.",
    dependencies: "4 of 4 clear",
    drawUnlock: "$29,600 pending approval",
    evidence: "3 of 3 · frozen r3",
    fieldNotes:
      "Completion was submitted with Evidence Package revision 3. South elevation termination is highlighted for review.",
    id: "waterproofing",
    materials: ["SBS membrane", "Primer", "Protection board"],
    orderedSiteVisit: "Aug 12 · completed",
    planned: "Aug 7–11",
    plannedEnd: "Aug 11",
    plannedStart: "Aug 7",
    progress: 100,
    scope:
      "Wall preparation, primer, membrane, transitions, termination, and protection board.",
    siteVisit: "Scheduled · Aug 12",
    state: "in_review",
    suppliers: ["Soprema Distribution"],
    title: "Waterproof foundation",
    tradespeople: ["Maya Kim", "Apex Waterproofing"],
  },
  {
    actualCost: "$21,350 realized",
    actualEnd: "Jul 31",
    actualStart: "Jul 28",
    assignee: "Northstar Civil",
    assigneeInitials: "NC",
    budget: "$21,900",
    builderEvidence: [
      "Drain tile outlet",
      "Washed stone lift",
      "Filter cloth overlap",
    ],
    code: "04.5",
    completedVisitReport: "Drainage inspection · approved",
    description:
      "Install perimeter drainage, washed stone, filter cloth, and verified outlet connections.",
    dependencies: "4 of 4 clear",
    drawUnlock: "$21,900 unlocked",
    evidence: "Approved · frozen r2",
    fieldNotes:
      "Outlet invert and stone coverage were verified before backfill authorization.",
    id: "drainage",
    materials: ["100 mm drain tile", "19 mm washed stone", "Filter cloth"],
    orderedSiteVisit: "Jul 31 · completed",
    planned: "Jul 28–31",
    plannedEnd: "Jul 31",
    plannedStart: "Jul 28",
    progress: 100,
    scope:
      "Perimeter drainage, cleanouts, stone cover, filter fabric, and outlet confirmation.",
    siteVisit: "Complete",
    state: "approved",
    suppliers: ["Core Civil Supply", "Lakeshore Aggregates"],
    title: "Install drainage and stone",
    tradespeople: ["Northstar Civil"],
  },
];

export const INITIAL_EVENTS: PrototypeEvent[] = [
  {
    actor: "DrawFlow System",
    body: "The Build-local start date passed without an actual start. This condition is system-controlled.",
    id: "evt-behind",
    kind: "domain",
    time: "Today · 12:00 AM",
    title: "Install footing forms moved behind schedule",
    workItemId: "forms",
  },
  {
    actor: "Maya Kim",
    body: "Submitted completion against frozen Evidence Package revision 3.",
    id: "evt-review",
    kind: "evidence",
    time: "Yesterday · 4:18 PM",
    title: "Waterproof foundation entered review",
    workItemId: "waterproofing",
  },
  {
    actor: "Alex Lee",
    body: "Uploaded two site photos. One location attempt could not be verified; the evidence was preserved for lender review.",
    id: "evt-evidence",
    kind: "evidence",
    time: "Yesterday · 1:42 PM",
    title: "Evidence Package updated",
    workItemId: "walls",
  },
  {
    actor: "Planning revision 7",
    body: "Survey and footing layout was added. No active execution history was replaced.",
    id: "evt-plan",
    kind: "planning",
    time: "Aug 2 · 9:10 AM",
    title: "Approved plan changed after activation",
  },
  {
    actor: "DrawFlow System",
    body: "Five canonical Sub-milestones were materialized from planning revision 6.",
    id: "evt-activated",
    kind: "domain",
    time: "Aug 1 · 12:00 AM",
    title: "Foundation & below-grade activated",
  },
];

export const MAYA_TAG_OPTION: CollaborationTagOption = {
  eyebrow: "Builder",
  id: "maya-kim",
  initials: "MK",
  kind: "participant",
  label: "Maya Kim",
  summary: "Build manager",
};

export const BRIEF_TAG_OPTIONS: CollaborationTagOption[] = [
  MAYA_TAG_OPTION,
  {
    eyebrow: "Contractor",
    id: "alex-lee",
    initials: "AL",
    kind: "participant",
    label: "Alex Lee",
    summary: "Foundation contractor",
  },
  {
    eyebrow: "Document",
    id: "foundation-checklist",
    kind: "document",
    label: "Foundation evidence checklist.pdf",
    summary: "Planning revision 7",
  },
];

export const DRAW_BRIEF_TAG_OPTIONS: CollaborationTagOption[] = [
  MAYA_TAG_OPTION,
  {
    eyebrow: "Lender staff",
    id: "nora-patel",
    initials: "NP",
    kind: "participant",
    label: "Nora Patel",
    summary: "Draw reviewer",
  },
  {
    eyebrow: "Document",
    id: "draw-release-checklist",
    kind: "document",
    label: "Draw release checklist.pdf",
    summary: "Lender policy",
  },
];

export function isSystemPostPrototypeVariant(
  value: unknown
): value is SystemPostPrototypeVariant {
  return value === "A" || value === "B" || value === "C";
}

export function isSystemPostPrototypeKind(
  value: unknown
): value is SystemPostPrototypeKind {
  return value === "milestone" || value === "draw";
}

export function isSystemPostPrototypeRole(
  value: unknown
): value is SystemPostPrototypeRole {
  return ROLE_OPTIONS.some((option) => option.value === value);
}

export function isSystemPostPrototypeScenario(
  value: unknown
): value is SystemPostPrototypeScenario {
  return SCENARIO_OPTIONS.some((option) => option.value === value);
}

export interface VariantProps {
  addCoordinationItem: () => void;
  advanceDraw: () => void;
  advanceSelected: () => void;
  coordinationItems: string[];
  drawState: DrawState;
  events: PrototypeEvent[];
  items: WorkItem[];
  onSelect: (id: string) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  selected: WorkItem | null;
  workflowWritable: boolean;
}

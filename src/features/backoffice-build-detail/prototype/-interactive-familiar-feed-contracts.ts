export type ParticipantId =
  | "connor"
  | "alex"
  | "eva"
  | "jules"
  | "marco"
  | "maya"
  | "noah"
  | "priya";

export type AudienceId =
  | "all"
  | "builder"
  | "builder_lender"
  | "contractors"
  | "custom"
  | "homeowner_builder"
  | "lender";

export type FeedFilter = "actionable" | "all" | "following" | "mentions" | "pinned";
export type PostTab = "actions" | "discussion";
export type ActionView = "board" | "list";
export type ActionStatus = "blocked" | "done" | "in_progress" | "todo";
export type ActionPriority = "high" | "low" | "medium" | "urgent";

export const HTML_CONTENT_PATTERN = /<[a-z][\s\S]*>/i;
export const ENTITY_SUMMARY_PREFIX_PATTERN = /^(Milestone|Sub-milestone) · /;

export interface Participant {
  id: ParticipantId;
  initials: string;
  name: string;
  role:
    | "broker"
    | "builder"
    | "builder_staff"
    | "contractor"
    | "homeowner"
    | "lender"
    | "lender_admin";
  roleLabel: string;
  tone: "amber" | "blue" | "green" | "rose" | "violet";
}

export interface BuildEntity {
  detail: string;
  details: Array<{ label: string; value: string }>;
  id: string;
  kind:
    | "document"
    | "draw"
    | "evidence"
    | "material"
    | "milestone"
    | "site_visit"
    | "submilestone";
  label: string;
  summary: string;
  target: string;
  visibleTo: ParticipantId[];
}

export interface FeedComment {
  authorId: ParticipantId;
  body: string;
  createdAt: string;
  id: string;
  mentionedParticipantIds?: ParticipantId[];
  parentId?: string;
  pinned: boolean;
}

export interface ActionItem {
  assigneeId: ParticipantId;
  description: string;
  dueDate: string;
  id: string;
  identifier: string;
  labels: string[];
  priority: ActionPriority;
  status: ActionStatus;
  title: string;
}

export interface FeedPost {
  actionItems: ActionItem[];
  audienceId: AudienceId;
  authorId: ParticipantId;
  body: string;
  comments: FeedComment[];
  createdAt: string;
  customAudienceIds?: ParticipantId[];
  entityIds: string[];
  followingIds: ParticipantId[];
  id: string;
  mentionedParticipantIds: ParticipantId[];
  pinned: boolean;
}

export interface ActionEditorState extends ActionItem {
  isNew: boolean;
  postId: string;
}

export const PARTICIPANTS: Participant[] = [
  {
    id: "connor",
    initials: "CO",
    name: "Connor O.",
    role: "builder",
    roleLabel: "Builder principal",
    tone: "blue",
  },
  {
    id: "alex",
    initials: "AC",
    name: "Alex Chen",
    role: "builder_staff",
    roleLabel: "Builder PM",
    tone: "amber",
  },
  {
    id: "eva",
    initials: "EP",
    name: "Eva Patel",
    role: "homeowner",
    roleLabel: "Homeowner",
    tone: "rose",
  },
  {
    id: "jules",
    initials: "JM",
    name: "Jules Mercer",
    role: "lender_admin",
    roleLabel: "Lender admin",
    tone: "amber",
  },
  {
    id: "marco",
    initials: "MR",
    name: "Marco Ruiz",
    role: "contractor",
    roleLabel: "Concrete contractor",
    tone: "green",
  },
  {
    id: "maya",
    initials: "MS",
    name: "Maya Singh",
    role: "contractor",
    roleLabel: "Project architect",
    tone: "violet",
  },
  {
    id: "noah",
    initials: "NG",
    name: "Noah Grant",
    role: "broker",
    roleLabel: "Mortgage broker",
    tone: "green",
  },
  {
    id: "priya",
    initials: "PR",
    name: "Priya Raman",
    role: "lender",
    roleLabel: "Lender operations",
    tone: "blue",
  },
];

export const ENTITIES: BuildEntity[] = [
  {
    detail:
      "Foundation work is substantially complete and is awaiting the final engineer-sealed inspection report.",
    details: [
      { label: "Progress", value: "92%" },
      { label: "Draw group", value: "Draw 3" },
      { label: "Owner", value: "Alex Chen" },
    ],
    id: "milestone-foundation",
    kind: "milestone",
    label: "Foundation & footings",
    summary: "Milestone · 92% complete",
    target: "Milestones → Foundation & footings",
    visibleTo: PARTICIPANTS.map((participant) => participant.id),
  },
  {
    detail:
      "The footings inspection is the final dependent step before the foundation milestone can move to lender review.",
    details: [
      { label: "Status", value: "Awaiting sign-off" },
      { label: "Parent", value: "Foundation & footings" },
      { label: "Due", value: "Jul 29" },
    ],
    id: "submilestone-footings",
    kind: "submilestone",
    label: "Footings inspection & sign-off",
    summary: "Sub-milestone · awaiting engineer seal",
    target: "Milestones → Foundation & footings → Footings inspection",
    visibleTo: ["connor", "alex", "jules", "marco", "maya", "noah", "priya"],
  },
  {
    detail:
      "The inspection is complete. The uploaded report is missing the engineer seal required by lender policy.",
    details: [
      { label: "Visit date", value: "Jul 26" },
      { label: "Inspector", value: "Maya Singh" },
      { label: "Report", value: "Seal missing" },
    ],
    id: "visit-sv18",
    kind: "site_visit",
    label: "Site Visit SV-18",
    summary: "Report submitted · seal missing",
    target: "Calendar → Site Visit SV-18",
    visibleTo: ["connor", "alex", "jules", "marco", "maya", "noah", "priya"],
  },
  {
    detail:
      "The third reimbursement draw is assembled but cannot enter final review until EP-204 is complete.",
    details: [
      { label: "Requested", value: "$184,000" },
      { label: "Status", value: "Waiting on evidence" },
      { label: "Fee", value: "$750" },
    ],
    id: "draw-3",
    kind: "draw",
    label: "Draw 3",
    summary: "$184,000 · waiting on evidence",
    target: "Draws → Draw 3",
    visibleTo: ["connor", "alex", "jules", "noah", "priya"],
  },
  {
    detail:
      "Seven of eight lender evidence requirements are satisfied. The sealed inspection report is the only blocker.",
    details: [
      { label: "Complete", value: "7 of 8" },
      { label: "Reviewer", value: "Priya Raman" },
      { label: "Linked draw", value: "Draw 3" },
    ],
    id: "evidence-204",
    kind: "evidence",
    label: "Evidence EP-204",
    summary: "7 of 8 requirements complete",
    target: "Evidence → EP-204",
    visibleTo: ["connor", "alex", "jules", "marco", "maya", "noah", "priya"],
  },
  {
    detail:
      "Concrete is scheduled for delivery Thursday morning. Site access and the pump booking are confirmed.",
    details: [
      { label: "Delivery", value: "Thu · 7:30 AM" },
      { label: "Supplier", value: "MetroMix" },
      { label: "Quantity", value: "48 m³" },
    ],
    id: "material-concrete",
    kind: "material",
    label: "Concrete delivery",
    summary: "Thursday · 7:30 AM",
    target: "Materials → Concrete delivery",
    visibleTo: ["connor", "alex", "eva", "marco", "maya"],
  },
  {
    detail:
      "The issued building permit and June 18 revision are the governing documents for the active foundation work.",
    details: [
      { label: "Status", value: "Issued" },
      { label: "Revision", value: "Jun 18" },
      { label: "File type", value: "PDF" },
    ],
    id: "document-permit",
    kind: "document",
    label: "Building permit",
    summary: "Issued · revised Jun 18",
    target: "Documents → Building permit",
    visibleTo: ["connor", "alex", "eva", "jules", "noah", "priya"],
  },
];

export const INITIAL_POSTS: FeedPost[] = [
  {
    actionItems: [
      {
        assigneeId: "maya",
        description:
          "Upload the engineer-sealed inspection report to Site Visit SV-18.",
        dueDate: "2026-07-28",
        id: "action-184",
        identifier: "DF-184",
        labels: ["Evidence", "Inspection"],
        priority: "urgent",
        status: "blocked",
        title: "Upload stamped inspection report",
      },
      {
        assigneeId: "priya",
        description:
          "Review the corrected report and foundation photo set for Draw 3.",
        dueDate: "2026-07-29",
        id: "action-177",
        identifier: "DF-177",
        labels: ["Lender review"],
        priority: "high",
        status: "in_progress",
        title: "Review foundation evidence",
      },
      {
        assigneeId: "marco",
        description:
          "Hold a follow-up inspection window in case the reviewer requests it.",
        dueDate: "2026-07-30",
        id: "action-190",
        identifier: "DF-190",
        labels: ["Site visit"],
        priority: "medium",
        status: "todo",
        title: "Hold follow-up site visit",
      },
    ],
    audienceId: "builder_lender",
    authorId: "alex",
    body: "Footing inspection is complete. @Maya Singh, the engineer’s seal is the final dependency before Draw 3 can move forward.",
    comments: [
      {
        authorId: "maya",
        body: "I have the engineer’s revised PDF and will upload it against the site visit this afternoon.",
        createdAt: "18m",
        id: "comment-1",
        pinned: false,
      },
      {
        authorId: "priya",
        body: "Once it lands, I can finish the lender review today.",
        createdAt: "12m",
        id: "comment-2",
        parentId: "comment-1",
        pinned: true,
      },
      {
        authorId: "jules",
        body: "Please keep Draw 3 blocked until Priya records the review outcome.",
        createdAt: "7m",
        id: "comment-3",
        parentId: "comment-2",
        pinned: false,
      },
    ],
    createdAt: "Today, 10:42 AM",
    entityIds: ["visit-sv18", "milestone-foundation", "draw-3"],
    followingIds: ["connor", "alex", "jules", "maya", "priya"],
    id: "post-inspection",
    mentionedParticipantIds: ["maya", "priya"],
    pinned: true,
  },
  {
    actionItems: [
      {
        assigneeId: "jules",
        description:
          "Confirm that the revised facility request remains within lender policy.",
        dueDate: "2026-07-31",
        id: "action-201",
        identifier: "DF-201",
        labels: ["Facility", "Approval"],
        priority: "high",
        status: "in_progress",
        title: "Review capital request",
      },
    ],
    audienceId: "lender",
    authorId: "priya",
    body: "The lender team has received a revised capital and term request for internal review.",
    comments: [],
    createdAt: "Today, 9:15 AM",
    entityIds: ["draw-3"],
    followingIds: ["jules", "noah", "priya"],
    id: "post-lender-request",
    mentionedParticipantIds: ["jules"],
    pinned: false,
  },
  {
    actionItems: [
      {
        assigneeId: "alex",
        description: "Keep the west access lane free between 6:30 and 9:30 AM.",
        dueDate: "2026-07-30",
        id: "action-205",
        identifier: "DF-205",
        labels: ["Logistics"],
        priority: "medium",
        status: "todo",
        title: "Clear west access lane",
      },
      {
        assigneeId: "marco",
        description: "Confirm dispatch and pump arrival with the site team.",
        dueDate: "2026-07-30",
        id: "action-206",
        identifier: "DF-206",
        labels: ["Concrete"],
        priority: "medium",
        status: "todo",
        title: "Confirm concrete dispatch",
      },
    ],
    audienceId: "all",
    authorId: "marco",
    body: "Concrete delivery has moved to Thursday at 7:30 AM. Access from the west lane needs to remain clear.",
    comments: [
      {
        authorId: "eva",
        body: "I’ll move the car before 6:30 AM. Thanks for the heads-up.",
        createdAt: "1h",
        id: "comment-4",
        pinned: false,
      },
    ],
    createdAt: "Yesterday, 4:18 PM",
    entityIds: ["material-concrete", "milestone-foundation"],
    followingIds: ["alex", "connor", "eva", "marco"],
    id: "post-concrete",
    mentionedParticipantIds: ["alex"],
    pinned: true,
  },
  {
    actionItems: [],
    audienceId: "homeowner_builder",
    authorId: "eva",
    body: "Will the temporary fencing stay in place through the weekend? We need to coordinate backyard access.",
    comments: [
      {
        authorId: "alex",
        body: "Yes. I’ll post the revised access sketch before Friday.",
        createdAt: "3h",
        id: "comment-5",
        pinned: false,
      },
    ],
    createdAt: "Yesterday, 2:05 PM",
    entityIds: ["milestone-foundation"],
    followingIds: ["alex", "connor", "eva"],
    id: "post-homeowner",
    mentionedParticipantIds: ["alex", "connor"],
    pinned: false,
  },
];

export const AUDIENCE_OPTIONS: Array<{
  id: AudienceId;
  label: string;
  summary: string;
}> = [
  {
    id: "all",
    label: "Everyone on this Build",
    summary: "All 8 current participants",
  },
  {
    id: "builder_lender",
    label: "Builder + lender teams",
    summary: "Builder, lender, and broker participants",
  },
  {
    id: "builder",
    label: "Builder team",
    summary: "Builder principal and staff",
  },
  {
    id: "lender",
    label: "Lender & broker team",
    summary: "Lender, lender admin, and broker",
  },
  {
    id: "homeowner_builder",
    label: "Homeowner + builder team",
    summary: "Homeowner, builder principal, and staff",
  },
  {
    id: "contractors",
    label: "Contractor coordination",
    summary: "Builder team and active contractors",
  },
  {
    id: "custom",
    label: "Custom participants",
    summary: "Choose specific people",
  },
];

export const STATUS_COLUMNS: Array<{ id: ActionStatus; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

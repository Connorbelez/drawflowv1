"use client";

import {
  AtSign,
  Bell,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  Eye,
  FileText,
  Filter,
  Flag,
  HardHat,
  Image,
  List,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SquareKanban,
  Star,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "../MilestoneDetailSheet.tsx";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";

type ParticipantId =
  | "connor"
  | "alex"
  | "eva"
  | "jules"
  | "marco"
  | "maya"
  | "noah"
  | "priya";

type AudienceId =
  | "all"
  | "builder"
  | "builder_lender"
  | "contractors"
  | "custom"
  | "homeowner_builder"
  | "lender";

type FeedFilter = "actionable" | "all" | "following" | "mentions" | "pinned";
type PostTab = "actions" | "discussion";
type ActionView = "board" | "list";
type ActionStatus = "blocked" | "done" | "in_progress" | "todo";
type ActionPriority = "high" | "low" | "medium" | "urgent";

const HTML_CONTENT_PATTERN = /<[a-z][\s\S]*>/i;
const ENTITY_SUMMARY_PREFIX_PATTERN = /^(Milestone|Sub-milestone) · /;

interface Participant {
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

interface BuildEntity {
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

interface FeedComment {
  authorId: ParticipantId;
  body: string;
  createdAt: string;
  id: string;
  mentionedParticipantIds?: ParticipantId[];
  parentId?: string;
  pinned: boolean;
}

interface ActionItem {
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

interface FeedPost {
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

interface ActionEditorState extends ActionItem {
  isNew: boolean;
  postId: string;
}

const PARTICIPANTS: Participant[] = [
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

const ENTITIES: BuildEntity[] = [
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

const INITIAL_POSTS: FeedPost[] = [
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

const AUDIENCE_OPTIONS: Array<{
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

const STATUS_COLUMNS: Array<{ id: ActionStatus; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

export function InteractiveFamiliarFeedPrototype() {
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [viewerId, setViewerId] = useState<ParticipantId>("connor");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [composerAudience, setComposerAudience] = useState<AudienceId>("all");
  const [customAudienceIds, setCustomAudienceIds] = useState<ParticipantId[]>([
    "connor",
    "alex",
  ]);
  const [composerAttachedEntityIds, setComposerAttachedEntityIds] = useState<
    string[]
  >([]);
  const [composerTaggedEntityIds, setComposerTaggedEntityIds] = useState<
    string[]
  >([]);
  const [composerTaggedActionItemIds, setComposerTaggedActionItemIds] =
    useState<string[]>([]);
  const [composerMentionIds, setComposerMentionIds] = useState<ParticipantId[]>(
    []
  );
  const [pickerMode, setPickerMode] = useState<"entities" | null>(null);
  const [postTabs, setPostTabs] = useState<Record<string, PostTab>>({
    "post-inspection": "discussion",
  });
  const [actionViews, setActionViews] = useState<Record<string, ActionView>>({
    "post-inspection": "list",
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [commentMentionDrafts, setCommentMentionDrafts] = useState<
    Record<string, ParticipantId[]>
  >({});
  const [replyTargets, setReplyTargets] = useState<
    Record<string, string | null>
  >({});
  const [actionEditor, setActionEditor] = useState<ActionEditorState | null>(
    null
  );
  const [focusedEntity, setFocusedEntity] = useState<BuildEntity | null>(null);
  const [focusedMilestone, setFocusedMilestone] =
    useState<MilestoneSheetData | null>(null);
  const [draggedAction, setDraggedAction] = useState<{
    actionId: string;
    postId: string;
  } | null>(null);
  const [lastEvent, setLastEvent] = useState(
    "Prototype ready — all changes stay in memory."
  );

  const viewer = participantById(viewerId);
  const tagOptions = useMemo<CollaborationTagOption[]>(() => {
    const people = PARTICIPANTS.map((participant) => ({
      eyebrow: participant.roleLabel,
      id: participant.id,
      initials: participant.initials,
      kind: "participant" as const,
      label: participant.name,
      searchTerms: [participant.role],
      summary: `${participant.roleLabel} on this Build`,
    }));
    const entities = ENTITIES.filter((entity) =>
      entity.visibleTo.includes(viewerId)
    ).map((entity) => ({
      eyebrow: entityKindLabel(entity.kind),
      id: entity.id,
      kind: entity.kind,
      label: entity.label,
      searchTerms: [entity.target],
      summary: entity.summary.replace(ENTITY_SUMMARY_PREFIX_PATTERN, ""),
    }));
    const actions = posts
      .filter((post) => canParticipantViewPost(viewerId, post))
      .flatMap((post) =>
        post.actionItems.map((actionItem) => ({
          eyebrow: "Action Item",
          id: actionItem.id,
          kind: "action_item" as const,
          label: `${actionItem.identifier} · ${actionItem.title}`,
          searchTerms: [
            actionItem.identifier,
            actionItem.title,
            ...actionItem.labels,
          ],
          summary: `${statusLabel(actionItem.status)} · ${participantById(actionItem.assigneeId).name}`,
        }))
      );
    return [...people, ...entities, ...actions];
  }, [posts, viewerId]);
  const composerEntityIds = [
    ...new Set([...composerAttachedEntityIds, ...composerTaggedEntityIds]),
  ];
  const visiblePosts = useMemo(
    () =>
      posts.filter((post) => {
        const searchable = [
          richTextToPlainText(post.body),
          participantById(post.authorId).name,
          ...post.entityIds.map((entityId) => entityById(entityId).label),
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch =
          searchQuery.trim().length === 0 ||
          searchable.includes(searchQuery.trim().toLowerCase());
        if (!matchesSearch) {
          return false;
        }
        if (feedFilter === "pinned") {
          return post.pinned;
        }
        if (feedFilter === "following") {
          return post.followingIds.includes(viewerId);
        }
        if (feedFilter === "mentions") {
          return post.mentionedParticipantIds.includes(viewerId);
        }
        if (feedFilter === "actionable") {
          return post.actionItems.some(
            (item) => item.status !== "done" && item.assigneeId === viewerId
          );
        }
        return true;
      }),
    [feedFilter, posts, searchQuery, viewerId]
  );

  const composerRecipients = resolveAudienceParticipantIds(
    composerAudience,
    customAudienceIds
  );
  const entityConstrainedRecipients = composerTaggedActionItemIds.reduce(
    (current, actionItemId) => {
      const owningPost = posts.find((post) =>
        post.actionItems.some((actionItem) => actionItem.id === actionItemId)
      );
      return owningPost
        ? current.filter((participantId) =>
            canParticipantViewPost(participantId, owningPost)
          )
        : current;
    },
    composerEntityIds.reduce(
      (current, entityId) =>
        current.filter((participantId) =>
          entityById(entityId).visibleTo.includes(participantId)
        ),
      composerRecipients
    )
  );
  const excludedMentions = composerMentionIds.filter(
    (participantId) => !entityConstrainedRecipients.includes(participantId)
  );
  const pinnedVisiblePosts = posts.filter(
    (post) => post.pinned && canParticipantViewPost(viewerId, post)
  );
  const myOpenActions = posts
    .filter((post) => canParticipantViewPost(viewerId, post))
    .flatMap((post) =>
      post.actionItems
        .filter(
          (actionItem) =>
            actionItem.assigneeId === viewerId && actionItem.status !== "done"
        )
        .map((actionItem) => ({ actionItem, postId: post.id }))
    );

  const createPost = () => {
    const body = composerBody.trim();
    if (!richTextHasContent(body) || entityConstrainedRecipients.length === 0) {
      setLastEvent(
        richTextHasContent(body)
          ? "Post blocked — the selected audience cannot access the attached work."
          : "Write an update before posting."
      );
      return;
    }
    const post: FeedPost = {
      actionItems: [],
      audienceId: composerAudience,
      authorId: viewerId,
      body,
      comments: [],
      createdAt: "Just now",
      customAudienceIds:
        composerAudience === "custom" ? customAudienceIds : undefined,
      entityIds: composerEntityIds,
      followingIds: [viewerId],
      id: `post-${Date.now()}`,
      mentionedParticipantIds: composerMentionIds,
      pinned: false,
    };
    setPosts((current) => [post, ...current]);
    setComposerBody("");
    setComposerAttachedEntityIds([]);
    setComposerTaggedEntityIds([]);
    setComposerTaggedActionItemIds([]);
    setComposerMentionIds([]);
    setPickerMode(null);
    setComposerExpanded(false);
    setLastEvent(
      `Posted as ${viewer.name} to ${audienceLabel(composerAudience)} · ${entityConstrainedRecipients.length} recipients.`
    );
  };

  const togglePostPin = (postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, pinned: !post.pinned } : post
      )
    );
    const post = posts.find((candidate) => candidate.id === postId);
    setLastEvent(
      post?.pinned ? "Post unpinned." : "Post pinned for this Build."
    );
  };

  const toggleFollow = (postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              followingIds: post.followingIds.includes(viewerId)
                ? post.followingIds.filter(
                    (participantId) => participantId !== viewerId
                  )
                : [...post.followingIds, viewerId],
            }
          : post
      )
    );
    setLastEvent("Thread notification preference updated.");
  };

  const addComment = (postId: string) => {
    const body = commentDrafts[postId]?.trim();
    if (!richTextHasContent(body)) {
      return;
    }
    const targetPost = posts.find((post) => post.id === postId);
    const requestedMentionIds = commentMentionDrafts[postId] ?? [];
    const mentionedParticipantIds = targetPost
      ? requestedMentionIds.filter((participantId) =>
          canParticipantViewPost(participantId, targetPost)
        )
      : [];
    const excludedMentionCount =
      requestedMentionIds.length - mentionedParticipantIds.length;
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [
                ...post.comments,
                {
                  authorId: viewerId,
                  body,
                  createdAt: "now",
                  id: `comment-${Date.now()}`,
                  mentionedParticipantIds,
                  parentId: replyTargets[postId] ?? undefined,
                  pinned: false,
                },
              ],
              followingIds: post.followingIds.includes(viewerId)
                ? post.followingIds
                : [...post.followingIds, viewerId],
            }
          : post
      )
    );
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setCommentMentionDrafts((current) => ({ ...current, [postId]: [] }));
    setReplyTargets((current) => ({ ...current, [postId]: null }));
    setLastEvent(
      requestedMentionIds.length
        ? `Reply posted · ${mentionedParticipantIds.length} mention notification${mentionedParticipantIds.length === 1 ? "" : "s"} queued${excludedMentionCount ? `; ${excludedMentionCount} excluded by post visibility` : ""}.`
        : "Reply posted with the parent post’s audience."
    );
  };

  const toggleCommentPin = (postId: string, commentId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments.map((comment) =>
                comment.id === commentId
                  ? { ...comment, pinned: !comment.pinned }
                  : comment
              ),
            }
          : post
      )
    );
    setLastEvent("Pinned-reply state updated.");
  };

  const saveAction = () => {
    if (!actionEditor?.title.trim()) {
      return;
    }
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== actionEditor.postId) {
          return post;
        }
        const item: ActionItem = {
          assigneeId: actionEditor.assigneeId,
          description: actionEditor.description,
          dueDate: actionEditor.dueDate,
          id: actionEditor.id,
          identifier: actionEditor.identifier,
          labels: actionEditor.labels,
          priority: actionEditor.priority,
          status: actionEditor.status,
          title: actionEditor.title.trim(),
        };
        return {
          ...post,
          actionItems: actionEditor.isNew
            ? [...post.actionItems, item]
            : post.actionItems.map((actionItem) =>
                actionItem.id === item.id ? item : actionItem
              ),
        };
      })
    );
    setLastEvent(
      actionEditor.isNew
        ? `${actionEditor.identifier} created with inherited post visibility.`
        : `${actionEditor.identifier} updated.`
    );
    setActionEditor(null);
  };

  const updateActionStatus = (
    postId: string,
    actionId: string,
    status: ActionStatus
  ) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              actionItems: post.actionItems.map((actionItem) =>
                actionItem.id === actionId
                  ? { ...actionItem, status }
                  : actionItem
              ),
            }
          : post
      )
    );
    setLastEvent(`Action moved to ${statusLabel(status)}.`);
  };

  const openNewAction = (postId: string) => {
    const sequence =
      posts.reduce((count, post) => count + post.actionItems.length, 0) + 207;
    setActionEditor({
      assigneeId: viewerId,
      description: "",
      dueDate: "2026-07-31",
      id: `action-${Date.now()}`,
      identifier: `DF-${sequence}`,
      isNew: true,
      labels: [],
      postId,
      priority: "medium",
      status: "todo",
      title: "",
    });
  };

  const openExistingAction = (postId: string, actionItem: ActionItem) => {
    setActionEditor({ ...actionItem, isNew: false, postId });
  };

  const openReference = (reference: CollaborationTagReference) => {
    if (reference.kind === "participant") {
      setLastEvent(
        `${reference.label} is a ${reference.eyebrow} on this Build.`
      );
      return;
    }
    if (reference.kind === "action_item") {
      const owningPost = posts.find((post) =>
        post.actionItems.some((actionItem) => actionItem.id === reference.id)
      );
      const actionItem = owningPost?.actionItems.find(
        (candidate) => candidate.id === reference.id
      );
      if (owningPost && actionItem) {
        openExistingAction(owningPost.id, actionItem);
      }
      return;
    }
    const entity = entityById(reference.id);
    if (entity.kind === "milestone" || entity.kind === "submilestone") {
      setFocusedMilestone(toMilestoneSheetData(entity));
      return;
    }
    setFocusedEntity(entity);
  };

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <FeedToolbar
            feedFilter={feedFilter}
            lastEvent={lastEvent}
            onFilterChange={setFeedFilter}
            onSearchChange={setSearchQuery}
            searchQuery={searchQuery}
            visibleCount={visiblePosts.length}
          />

          <Composer
            attachedEntityIds={composerAttachedEntityIds}
            audienceId={composerAudience}
            body={composerBody}
            customAudienceIds={customAudienceIds}
            effectiveRecipients={entityConstrainedRecipients}
            entityIds={composerEntityIds}
            excludedMentionIds={excludedMentions}
            expanded={composerExpanded}
            mentionIds={composerMentionIds}
            onAudienceChange={setComposerAudience}
            onBodyChange={(value, references) => {
              setComposerBody(value);
              setComposerMentionIds(
                references
                  .filter((reference) => reference.kind === "participant")
                  .map((reference) => reference.id as ParticipantId)
              );
              setComposerTaggedEntityIds(
                references
                  .filter(
                    (reference) =>
                      reference.kind !== "participant" &&
                      reference.kind !== "action_item"
                  )
                  .map((reference) => reference.id)
              );
              setComposerTaggedActionItemIds(
                references
                  .filter((reference) => reference.kind === "action_item")
                  .map((reference) => reference.id)
              );
              setComposerExpanded(true);
            }}
            onCancel={() => {
              setComposerExpanded(false);
              setPickerMode(null);
            }}
            onCustomAudienceChange={setCustomAudienceIds}
            onEntityToggle={(entityId) =>
              setComposerAttachedEntityIds((current) =>
                toggleInList(current, entityId)
              )
            }
            onExpand={() => setComposerExpanded(true)}
            onPickerModeChange={setPickerMode}
            onPost={createPost}
            pickerMode={pickerMode}
            tagOptions={tagOptions}
            viewer={viewer}
          />

          <div className="flex flex-col gap-4">
            {visiblePosts.length === 0 ? (
              <EmptyFeed
                onClear={() => {
                  setFeedFilter("all");
                  setSearchQuery("");
                }}
              />
            ) : (
              visiblePosts.map((post) =>
                canParticipantViewPost(viewerId, post) ? (
                  <InteractivePost
                    actionView={actionViews[post.id] ?? "list"}
                    commentDraft={commentDrafts[post.id] ?? ""}
                    commentMentionIds={commentMentionDrafts[post.id] ?? []}
                    draggedAction={draggedAction}
                    key={post.id}
                    onActionDrag={setDraggedAction}
                    onActionDrop={(status) => {
                      if (draggedAction?.postId === post.id) {
                        updateActionStatus(
                          post.id,
                          draggedAction.actionId,
                          status
                        );
                      }
                      setDraggedAction(null);
                    }}
                    onActionOpen={(actionItem) =>
                      openExistingAction(post.id, actionItem)
                    }
                    onActionStatusChange={(actionId, status) =>
                      updateActionStatus(post.id, actionId, status)
                    }
                    onActionViewChange={(view) =>
                      setActionViews((current) => ({
                        ...current,
                        [post.id]: view,
                      }))
                    }
                    onAddAction={() => openNewAction(post.id)}
                    onCommentChange={(body) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: body,
                      }))
                    }
                    onCommentMentionsChange={(mentionIds) =>
                      setCommentMentionDrafts((current) => ({
                        ...current,
                        [post.id]: mentionIds,
                      }))
                    }
                    onCommentPin={(commentId) =>
                      toggleCommentPin(post.id, commentId)
                    }
                    onCommentSubmit={() => addComment(post.id)}
                    onFollow={() => toggleFollow(post.id)}
                    onPin={() => togglePostPin(post.id)}
                    onReferenceOpen={openReference}
                    onReply={(commentId) =>
                      setReplyTargets((current) => ({
                        ...current,
                        [post.id]: commentId,
                      }))
                    }
                    onReplyCancel={() =>
                      setReplyTargets((current) => ({
                        ...current,
                        [post.id]: null,
                      }))
                    }
                    onTabChange={(tab) =>
                      setPostTabs((current) => ({
                        ...current,
                        [post.id]: tab,
                      }))
                    }
                    post={post}
                    replyTargetId={replyTargets[post.id] ?? null}
                    tab={postTabs[post.id] ?? "discussion"}
                    tagOptions={tagOptions.filter((option) =>
                      canReferenceBeUsedInPost(option, post, posts)
                    )}
                    viewerId={viewerId}
                  />
                ) : (
                  <RestrictedPostPlaceholder key={post.id} />
                )
              )
            )}
          </div>
        </section>

        <DailyRail
          myOpenActions={myOpenActions}
          onActionOpen={(postId, actionItem) =>
            openExistingAction(postId, actionItem)
          }
          onPinnedPostOpen={(postId) =>
            document
              .getElementById(`prototype-${postId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          onViewerChange={(participantId) => {
            setViewerId(participantId);
            setLastEvent(
              `Viewing the same Build as ${participantById(participantId).name}.`
            );
          }}
          pinnedPosts={pinnedVisiblePosts}
          viewer={viewer}
        />
      </div>

      <ActionItemSheet
        editor={actionEditor}
        onChange={setActionEditor}
        onClose={() => setActionEditor(null)}
        onSave={saveAction}
        parentAudience={
          actionEditor
            ? audienceLabel(
                posts.find((post) => post.id === actionEditor.postId)
                  ?.audienceId ?? "all"
              )
            : ""
        }
        tagOptions={
          actionEditor
            ? tagOptions.filter((option) => {
                const parentPost = posts.find(
                  (post) => post.id === actionEditor.postId
                );
                return parentPost
                  ? canReferenceBeUsedInPost(option, parentPost, posts)
                  : option.kind === "participant";
              })
            : tagOptions
        }
      />
      <MilestoneDetailSheet
        assignmentsSourceLabel="Prototype Build assignments"
        data={focusedMilestone}
        eventsSourceLabel="Prototype collaboration activity"
        onClose={() => setFocusedMilestone(null)}
      />
      <BuildEntityDetailSheet
        entity={focusedEntity}
        onClose={() => setFocusedEntity(null)}
        onNavigate={(entity) => {
          setLastEvent(`Focused ${entity.target}.`);
          setFocusedEntity(null);
        }}
      />
    </>
  );
}

function FeedToolbar({
  feedFilter,
  lastEvent,
  onFilterChange,
  onSearchChange,
  searchQuery,
  visibleCount,
}: {
  feedFilter: FeedFilter;
  lastEvent: string;
  onFilterChange: (filter: FeedFilter) => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  visibleCount: number;
}) {
  const filters: Array<{ id: FeedFilter; label: string }> = [
    { id: "all", label: "All updates" },
    { id: "following", label: "Following" },
    { id: "mentions", label: "Mentions" },
    { id: "pinned", label: "Pinned" },
    { id: "actionable", label: "Assigned to me" },
  ];
  return (
    <Frame>
      <FramePanel className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {filters.map((filter) => (
              <Button
                className="rounded-full"
                key={filter.id}
                onClick={() => onFilterChange(filter.id)}
                size="sm"
                variant={feedFilter === filter.id ? "secondary" : "ghost"}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <div className="flex min-w-0 items-center gap-2 lg:w-72">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="Search collaboration"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search updates and work…"
              type="search"
              value={searchQuery}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Bell className="size-3.5 text-primary" />
            {lastEvent}
          </p>
          <Badge variant="outline">{visibleCount} feed entries</Badge>
        </div>
      </FramePanel>
    </Frame>
  );
}

function Composer({
  attachedEntityIds,
  audienceId,
  body,
  customAudienceIds,
  effectiveRecipients,
  entityIds,
  excludedMentionIds,
  expanded,
  mentionIds,
  onAudienceChange,
  onBodyChange,
  onCancel,
  onCustomAudienceChange,
  onEntityToggle,
  onExpand,
  onPickerModeChange,
  onPost,
  pickerMode,
  tagOptions,
  viewer,
}: {
  attachedEntityIds: string[];
  audienceId: AudienceId;
  body: string;
  customAudienceIds: ParticipantId[];
  effectiveRecipients: ParticipantId[];
  entityIds: string[];
  excludedMentionIds: ParticipantId[];
  expanded: boolean;
  mentionIds: ParticipantId[];
  onAudienceChange: (audienceId: AudienceId) => void;
  onBodyChange: (body: string, references: CollaborationTagReference[]) => void;
  onCancel: () => void;
  onCustomAudienceChange: (participantIds: ParticipantId[]) => void;
  onEntityToggle: (entityId: string) => void;
  onExpand: () => void;
  onPickerModeChange: (mode: "entities" | null) => void;
  onPost: () => void;
  pickerMode: "entities" | null;
  tagOptions: CollaborationTagOption[];
  viewer: Participant;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[auto_1fr] gap-3 p-4">
        <ParticipantAvatar participant={viewer} />
        <div className="min-w-0">
          <CardTitle className="text-sm">
            Share an update as {viewer.name}
          </CardTitle>
          <CardDescription className="text-xs">
            Audience and referenced work determine who can read everything
            underneath.
          </CardDescription>
        </div>
      </CardHeader>
      <CardPanel className="p-4 pt-0">
        {expanded ? (
          <CollaborationRichTextEditor
            ariaLabel="Prototype post composer"
            editorMinHeightClass="[&_.ProseMirror]:min-h-28"
            onChange={onBodyChange}
            placeholder="Share an update. Type @ to tag a person or anything in this Build."
            tagOptions={tagOptions}
            value={body}
          />
        ) : (
          <button
            className="min-h-20 w-full rounded-lg border bg-background px-3 py-3 text-left text-muted-foreground text-sm"
            onClick={onExpand}
            type="button"
          >
            What should people involved in this Build know?
          </button>
        )}

        {expanded ? (
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-1.5 font-medium text-xs">Audience</p>
                <Select
                  onValueChange={(value) =>
                    onAudienceChange(value as AudienceId)
                  }
                  value={audienceId}
                >
                  <SelectTrigger aria-label="Post audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-muted-foreground text-xs">
                  {AUDIENCE_OPTIONS.find((option) => option.id === audienceId)
                    ?.summary ?? ""}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="font-medium text-xs">
                  Effective audience · {effectiveRecipients.length} people
                </p>
                <div className="mt-2 flex -space-x-2">
                  {effectiveRecipients.slice(0, 6).map((participantId) => (
                    <div
                      className="rounded-full border-2 border-background"
                      key={participantId}
                    >
                      <ParticipantAvatar
                        participant={participantById(participantId)}
                        small
                      />
                    </div>
                  ))}
                </div>
                {entityIds.length > 0 ? (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Limited by the access rules of tagged or attached Build
                    work.
                  </p>
                ) : null}
              </div>
            </div>

            {audienceId === "custom" ? (
              <PickerGrid
                activeIds={customAudienceIds}
                onToggle={(participantId) =>
                  onCustomAudienceChange(
                    toggleInList(customAudienceIds, participantId)
                  )
                }
                participants={PARTICIPANTS}
                title="Choose recipients"
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <AtSign />
                Type @ to tag anything
              </Badge>
              <Button
                onClick={() =>
                  onPickerModeChange(
                    pickerMode === "entities" ? null : "entities"
                  )
                }
                size="sm"
                variant={pickerMode === "entities" ? "secondary" : "ghost"}
              >
                <Paperclip />
                Attach Build item
              </Button>
              <Button
                onClick={() => {
                  if (!attachedEntityIds.includes("evidence-204")) {
                    onEntityToggle("evidence-204");
                  }
                }}
                size="sm"
                variant="ghost"
              >
                <Image />
                Evidence
              </Button>
            </div>

            {pickerMode === "entities" ? (
              <EntityPicker
                activeIds={attachedEntityIds}
                onToggle={onEntityToggle}
                viewerId={viewer.id}
              />
            ) : null}

            {mentionIds.length > 0 || entityIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mentionIds.map((participantId) => (
                  <Badge key={participantId} variant="info">
                    <AtSign />
                    {participantById(participantId).name}
                  </Badge>
                ))}
                {entityIds.map((entityId) => {
                  const attached = attachedEntityIds.includes(entityId);
                  return (
                    <Badge key={entityId} variant="secondary">
                      {attached ? (
                        entityIcon(entityById(entityId).kind)
                      ) : (
                        <AtSign />
                      )}
                      {entityById(entityId).label}
                      {attached ? (
                        <button
                          aria-label={`Remove ${entityById(entityId).label}`}
                          onClick={() => onEntityToggle(entityId)}
                          type="button"
                        >
                          <X />
                        </button>
                      ) : null}
                    </Badge>
                  );
                })}
              </div>
            ) : null}

            <MentionAccessWarning participantIds={excludedMentionIds} />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <Users />
            {audienceLabel(audienceId)}
          </Badge>
          {expanded ? (
            <>
              <Button
                className="ml-auto"
                onClick={onCancel}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !richTextHasContent(body) || effectiveRecipients.length === 0
                }
                onClick={onPost}
                size="sm"
              >
                <Send />
                Post update
              </Button>
            </>
          ) : (
            <Button className="ml-auto" onClick={onExpand} size="sm">
              Compose
            </Button>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}

function MentionAccessWarning({
  participantIds,
}: {
  participantIds: ParticipantId[];
}) {
  if (participantIds.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs">
      <p className="font-medium">
        {participantIds
          .map((participantId) => participantById(participantId).name)
          .join(", ")}{" "}
        will not be notified.
      </p>
      <p className="mt-1 text-muted-foreground">
        A mention never grants access. Change the audience or remove the
        mention.
      </p>
    </div>
  );
}

function PickerGrid({
  activeIds,
  onToggle,
  participants,
  title,
}: {
  activeIds: ParticipantId[];
  onToggle: (participantId: ParticipantId) => void;
  participants: Participant[];
  title: string;
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <p className="mb-2 font-medium text-xs">{title}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {participants.map((participant) => {
            const active = activeIds.includes(participant.id);
            return (
              <Button
                className="h-auto justify-start px-2 py-2 text-left"
                key={participant.id}
                onClick={() => onToggle(participant.id)}
                variant={active ? "secondary" : "ghost"}
              >
                <ParticipantAvatar participant={participant} small />
                <span className="min-w-0">
                  <span className="block truncate text-xs">
                    {participant.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {participant.roleLabel}
                  </span>
                </span>
                {active ? <Check className="ml-auto" /> : null}
              </Button>
            );
          })}
        </div>
      </FramePanel>
    </Frame>
  );
}

function EntityPicker({
  activeIds,
  onToggle,
  viewerId,
}: {
  activeIds: string[];
  onToggle: (entityId: string) => void;
  viewerId: ParticipantId;
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-xs">Attach work from this Build</p>
          <Badge variant="outline">Permission-filtered</Badge>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ENTITIES.filter((entity) => entity.visibleTo.includes(viewerId)).map(
            (entity) => {
              const active = activeIds.includes(entity.id);
              return (
                <Button
                  className="h-auto justify-start px-3 py-2 text-left"
                  key={entity.id}
                  onClick={() => onToggle(entity.id)}
                  variant={active ? "secondary" : "ghost"}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    {entityIcon(entity.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">
                      {entity.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {entity.summary}
                    </span>
                  </span>
                  {active ? <Check /> : <Plus />}
                </Button>
              );
            }
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function InteractivePost({
  actionView,
  commentDraft,
  commentMentionIds,
  draggedAction,
  onActionDrag,
  onActionDrop,
  onActionOpen,
  onActionStatusChange,
  onActionViewChange,
  onAddAction,
  onCommentChange,
  onCommentMentionsChange,
  onCommentPin,
  onCommentSubmit,
  onFollow,
  onPin,
  onReferenceOpen,
  onReply,
  onReplyCancel,
  onTabChange,
  post,
  replyTargetId,
  tab,
  tagOptions,
  viewerId,
}: {
  actionView: ActionView;
  commentDraft: string;
  commentMentionIds: ParticipantId[];
  draggedAction: { actionId: string; postId: string } | null;
  onActionDrag: (dragged: { actionId: string; postId: string } | null) => void;
  onActionDrop: (status: ActionStatus) => void;
  onActionOpen: (actionItem: ActionItem) => void;
  onActionStatusChange: (actionId: string, status: ActionStatus) => void;
  onActionViewChange: (view: ActionView) => void;
  onAddAction: () => void;
  onCommentChange: (body: string) => void;
  onCommentMentionsChange: (mentionIds: ParticipantId[]) => void;
  onCommentPin: (commentId: string) => void;
  onCommentSubmit: () => void;
  onFollow: () => void;
  onPin: () => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  onReplyCancel: () => void;
  onTabChange: (tab: PostTab) => void;
  post: FeedPost;
  replyTargetId: string | null;
  tab: PostTab;
  tagOptions: CollaborationTagOption[];
  viewerId: ParticipantId;
}) {
  const author = participantById(post.authorId);
  const following = post.followingIds.includes(viewerId);
  const pinnedComments = post.comments.filter((comment) => comment.pinned);
  const replyTarget = post.comments.find(
    (comment) => comment.id === replyTargetId
  );
  const excludedCommentMentions = commentMentionIds.filter(
    (participantId) => !canParticipantViewPost(participantId, post)
  );

  return (
    <Card id={`prototype-${post.id}`} render={<article />}>
      <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
        <ParticipantAvatar participant={author} />
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            {author.name}
            <span className="font-normal text-muted-foreground">
              · {author.roleLabel}
            </span>
          </CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {post.createdAt}
            <Badge variant="outline">
              <Users />
              {audienceLabel(post.audienceId)}
            </Badge>
            {post.pinned ? (
              <Badge variant="info">
                <Pin />
                Pinned
              </Badge>
            ) : null}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Post options"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Thread</DropdownMenuLabel>
              <DropdownMenuItem onClick={onPin}>
                <Pin />
                {post.pinned ? "Unpin from Build" : "Pin to Build"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onFollow}>
                <Bell />
                {following ? "Stop following" : "Follow thread"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Paperclip />
                Copy thread link
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardPanel className="p-4 pt-0">
        <RichBody
          body={post.body}
          onReferenceOpen={onReferenceOpen}
          tagOptions={tagOptions}
        />
        {post.entityIds.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {post.entityIds.map((entityId) => {
              const entity = entityById(entityId);
              return (
                <EntityReferenceCard
                  entity={entity}
                  key={entity.id}
                  onOpen={() => onReferenceOpen(buildEntityToReference(entity))}
                />
              );
            })}
          </div>
        ) : null}
      </CardPanel>
      <CardFooter className="block border-t p-0">
        <Tabs
          onValueChange={(value) => onTabChange(value as PostTab)}
          value={tab}
        >
          <TabsList className="w-full justify-start px-4" variant="underline">
            <TabsTab value="discussion">
              <MessageCircle />
              Discussion {post.comments.length}
            </TabsTab>
            <TabsTab value="actions">
              <Flag />
              Action Items {post.actionItems.length}
            </TabsTab>
          </TabsList>
          <TabsPanel className="p-4" value="discussion">
            {pinnedComments.length > 0 ? (
              <div className="mb-3 grid gap-2">
                {pinnedComments.map((comment) => (
                  <div
                    className="flex gap-2 rounded-lg border border-primary/20 bg-primary/4 p-3"
                    key={comment.id}
                  >
                    <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium text-xs">
                        Pinned reply · {participantById(comment.authorId).name}
                      </p>
                      <RichBody
                        body={comment.body}
                        className="mt-1 text-muted-foreground text-xs"
                        onReferenceOpen={onReferenceOpen}
                        tagOptions={tagOptions}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <CommentTree
              comments={post.comments}
              onPin={onCommentPin}
              onReferenceOpen={onReferenceOpen}
              onReply={onReply}
              tagOptions={tagOptions}
            />
            {post.comments.length === 0 ? (
              <p className="py-3 text-center text-muted-foreground text-sm">
                No replies yet. Start the discussion.
              </p>
            ) : null}
            <div className="mt-3 border-t pt-3">
              {replyTarget ? (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span>
                    Replying to {participantById(replyTarget.authorId).name}
                  </span>
                  <Button
                    aria-label="Cancel nested reply"
                    onClick={onReplyCancel}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
              <div className="flex items-start gap-2">
                <ParticipantAvatar
                  participant={participantById(viewerId)}
                  small
                />
                <CollaborationRichTextEditor
                  aria-label="Reply to post"
                  className="min-w-0 flex-1"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-20"
                  onChange={(value, references) => {
                    onCommentChange(value);
                    onCommentMentionsChange(
                      references
                        .filter((reference) => reference.kind === "participant")
                        .map((reference) => reference.id as ParticipantId)
                    );
                  }}
                  placeholder="Write a reply… Type @ to tag people or Build work."
                  tagOptions={tagOptions}
                  value={commentDraft}
                />
                <Button
                  aria-label="Post reply"
                  disabled={!richTextHasContent(commentDraft)}
                  onClick={onCommentSubmit}
                  size="icon-sm"
                >
                  <Send />
                </Button>
              </div>
              <MentionAccessWarning participantIds={excludedCommentMentions} />
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3" />
                Replies inherit: {audienceLabel(post.audienceId)}
              </p>
            </div>
          </TabsPanel>
          <TabsPanel className="p-4" value="actions">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-muted-foreground text-xs">
                <LockKeyhole className="size-3.5" />
                Visibility inherited from this post
              </p>
              <div className="flex gap-1">
                <Button
                  aria-label="Action item list view"
                  onClick={() => onActionViewChange("list")}
                  size="icon-sm"
                  variant={actionView === "list" ? "secondary" : "ghost"}
                >
                  <List />
                </Button>
                <Button
                  aria-label="Action item kanban view"
                  onClick={() => onActionViewChange("board")}
                  size="icon-sm"
                  variant={actionView === "board" ? "secondary" : "ghost"}
                >
                  <SquareKanban />
                </Button>
                <Button onClick={onAddAction} size="sm">
                  <Plus />
                  Action item
                </Button>
              </div>
            </div>
            {post.actionItems.length === 0 ? (
              <EmptyActions onAdd={onAddAction} />
            ) : actionView === "list" ? (
              <ActionItemList
                actionItems={post.actionItems}
                onOpen={onActionOpen}
                onStatusChange={onActionStatusChange}
              />
            ) : (
              <ActionItemBoard
                actionItems={post.actionItems}
                draggedAction={draggedAction}
                onDrag={onActionDrag}
                onDrop={onActionDrop}
                onOpen={onActionOpen}
                postId={post.id}
              />
            )}
          </TabsPanel>
        </Tabs>
      </CardFooter>
    </Card>
  );
}

function EntityReferenceCard({
  entity,
  onOpen,
}: {
  entity: BuildEntity;
  onOpen: () => void;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Card
            aria-label={`Open ${entityKindLabel(entity.kind)}: ${entity.label}`}
            className="group rounded-xl shadow-none transition-colors hover:border-primary/35 hover:bg-primary/3 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
            onClick={onOpen}
            render={<button type="button" />}
          />
        }
      >
        <CardPanel className="flex items-center gap-3 p-3 text-left">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-primary transition-colors group-hover:bg-primary/10">
            {entityIcon(entity.kind)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-xs">
              {entity.label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {entity.summary}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </CardPanel>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3" side="top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {entityIcon(entity.kind)}
          </span>
          <div className="min-w-0">
            <Badge variant="outline">{entityKindLabel(entity.kind)}</Badge>
            <p className="mt-2 font-semibold text-sm">{entity.label}</p>
            <p className="mt-1 text-muted-foreground">{entity.detail}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
          {entity.details.slice(0, 3).map((detail) => (
            <div className="min-w-0" key={detail.label}>
              <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
                {detail.label}
              </p>
              <p className="mt-0.5 truncate font-medium text-xs">
                {detail.value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 font-medium text-primary">
          Open {entityKindLabel(entity.kind)} detail
          <ChevronRight className="size-3" />
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function RichBody({
  body,
  className,
  onReferenceOpen,
  tagOptions,
}: {
  body: string;
  className?: string;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <CollaborationRichTextPreview
      ariaLabel="Collaboration message"
      className={cn(
        "border-0 bg-transparent text-foreground [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0 [&_.ProseMirror]:leading-6",
        className
      )}
      onReferenceOpen={onReferenceOpen}
      tagOptions={tagOptions}
      value={normalizeRichText(body)}
    />
  );
}

function CommentTree({
  comments,
  onPin,
  onReferenceOpen,
  onReply,
  tagOptions,
}: {
  comments: FeedComment[];
  onPin: (commentId: string) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  tagOptions: CollaborationTagOption[];
}) {
  const roots = comments.filter((comment) => !comment.parentId);
  return (
    <div>
      {roots.map((comment) => (
        <CommentNode
          allComments={comments}
          comment={comment}
          depth={0}
          key={comment.id}
          onPin={onPin}
          onReferenceOpen={onReferenceOpen}
          onReply={onReply}
          tagOptions={tagOptions}
        />
      ))}
    </div>
  );
}

function CommentNode({
  allComments,
  comment,
  depth,
  onPin,
  onReferenceOpen,
  onReply,
  tagOptions,
}: {
  allComments: FeedComment[];
  comment: FeedComment;
  depth: number;
  onPin: (commentId: string) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: (commentId: string) => void;
  tagOptions: CollaborationTagOption[];
}) {
  const author = participantById(comment.authorId);
  const replies = allComments.filter(
    (candidate) => candidate.parentId === comment.id
  );
  const visualDepth = Math.min(depth, 2);
  return (
    <div
      className="relative py-2"
      style={{ marginLeft: `${visualDepth * 22}px` }}
    >
      {depth > 0 ? (
        <div className="absolute top-0 -left-3 h-full w-px bg-border" />
      ) : null}
      <div className="flex gap-2">
        <ParticipantAvatar participant={author} small />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-muted/55 px-3 py-2">
            <p className="font-medium text-xs">{author.name}</p>
            {depth > 2 ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Deep reply · ancestor path preserved
              </p>
            ) : null}
            <RichBody
              body={comment.body}
              className="mt-1 text-sm [&_.ProseMirror]:leading-5"
              onReferenceOpen={onReferenceOpen}
              tagOptions={tagOptions}
            />
          </div>
          <div className="mt-1 flex gap-3 px-2 text-muted-foreground text-xs">
            <button onClick={() => onReply(comment.id)} type="button">
              Reply
            </button>
            <button onClick={() => onPin(comment.id)} type="button">
              {comment.pinned ? "Unpin" : "Pin"}
            </button>
            <span>{comment.createdAt}</span>
          </div>
        </div>
      </div>
      {replies.map((reply) => (
        <CommentNode
          allComments={allComments}
          comment={reply}
          depth={depth + 1}
          key={reply.id}
          onPin={onPin}
          onReferenceOpen={onReferenceOpen}
          onReply={onReply}
          tagOptions={tagOptions}
        />
      ))}
    </div>
  );
}

function ActionItemList({
  actionItems,
  onOpen,
  onStatusChange,
}: {
  actionItems: ActionItem[];
  onOpen: (actionItem: ActionItem) => void;
  onStatusChange: (actionId: string, status: ActionStatus) => void;
}) {
  return (
    <div className="grid gap-2">
      {actionItems.map((actionItem) => (
        <Card className="rounded-xl shadow-none" key={actionItem.id}>
          <CardPanel className="flex items-center gap-3 p-3">
            <button
              aria-label={
                actionItem.status === "done"
                  ? `Reopen ${actionItem.title}`
                  : `Complete ${actionItem.title}`
              }
              onClick={() =>
                onStatusChange(
                  actionItem.id,
                  actionItem.status === "done" ? "todo" : "done"
                )
              }
              type="button"
            >
              {actionItem.status === "done" ? (
                <CircleCheck className="size-5 text-success-foreground" />
              ) : (
                <Circle className="size-5 text-muted-foreground" />
              )}
            </button>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => onOpen(actionItem)}
              type="button"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {actionItem.identifier}
                </span>
                <PriorityBadge priority={actionItem.priority} />
                <StatusBadge status={actionItem.status} />
              </span>
              <span
                className={cn(
                  "mt-1 block truncate text-sm",
                  actionItem.status === "done" &&
                    "text-muted-foreground line-through"
                )}
              >
                {actionItem.title}
              </span>
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-xs">
                {participantById(actionItem.assigneeId).name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Due {actionItem.dueDate}
              </p>
            </div>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ActionItemBoard({
  actionItems,
  draggedAction,
  onDrag,
  onDrop,
  onOpen,
  postId,
}: {
  actionItems: ActionItem[];
  draggedAction: { actionId: string; postId: string } | null;
  onDrag: (dragged: { actionId: string; postId: string } | null) => void;
  onDrop: (status: ActionStatus) => void;
  onOpen: (actionItem: ActionItem) => void;
  postId: string;
}) {
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-4">
      {STATUS_COLUMNS.map((column) => {
        const items = actionItems.filter(
          (actionItem) => actionItem.status === column.id
        );
        return (
          <Frame
            className={cn(
              "min-w-56",
              draggedAction?.postId === postId && "ring-1 ring-primary/20"
            )}
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(column.id)}
          >
            <FramePanel className="min-h-40 p-2">
              <div className="flex items-center justify-between px-1 py-1">
                <p className="font-semibold text-xs">{column.label}</p>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              <div className="mt-2 grid gap-2">
                {items.map((actionItem) => (
                  <Card
                    className="cursor-grab rounded-xl shadow-none active:cursor-grabbing"
                    draggable
                    key={actionItem.id}
                    onDragEnd={() => onDrag(null)}
                    onDragStart={() =>
                      onDrag({ actionId: actionItem.id, postId })
                    }
                    render={<button type="button" />}
                  >
                    <CardPanel
                      className="p-3 text-left"
                      onClick={() => onOpen(actionItem)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {actionItem.identifier}
                        </span>
                        <PriorityBadge priority={actionItem.priority} />
                      </div>
                      <p className="mt-2 text-sm leading-5">
                        {actionItem.title}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <ParticipantAvatar
                          participant={participantById(actionItem.assigneeId)}
                          small
                        />
                        <span className="truncate text-[11px] text-muted-foreground">
                          {actionItem.dueDate}
                        </span>
                      </div>
                    </CardPanel>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-2 py-6 text-center text-muted-foreground text-xs">
                    Drop here
                  </div>
                ) : null}
              </div>
            </FramePanel>
          </Frame>
        );
      })}
    </div>
  );
}

function EmptyActions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <Flag className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 font-medium text-sm">No Action Items yet</p>
      <p className="mt-1 text-muted-foreground text-xs">
        Turn discussion into accountable work without leaving the post.
      </p>
      <Button className="mt-3" onClick={onAdd} size="sm" variant="outline">
        <Plus />
        Add the first item
      </Button>
    </div>
  );
}

function DailyRail({
  myOpenActions,
  onActionOpen,
  onPinnedPostOpen,
  onViewerChange,
  pinnedPosts,
  viewer,
}: {
  myOpenActions: Array<{ actionItem: ActionItem; postId: string }>;
  onActionOpen: (postId: string, actionItem: ActionItem) => void;
  onPinnedPostOpen: (postId: string) => void;
  onViewerChange: (participantId: ParticipantId) => void;
  pinnedPosts: FeedPost[];
  viewer: Participant;
}) {
  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">View as participant</p>
              <p className="text-muted-foreground text-xs">
                Feel how permissions change the same feed
              </p>
            </div>
          </div>
          <Select
            onValueChange={(value) => onViewerChange(value as ParticipantId)}
            value={viewer.id}
          >
            <SelectTrigger aria-label="View feed as" className="mt-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["connor", "eva", "priya", "marco"].map((participantId) => {
                const participant = participantById(
                  participantId as ParticipantId
                );
                return (
                  <SelectItem key={participant.id} value={participant.id}>
                    {participant.name} · {participant.roleLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/45 p-3">
            <ParticipantAvatar participant={viewer} />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{viewer.name}</p>
              <p className="truncate text-muted-foreground text-xs">
                {viewer.roleLabel}
              </p>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-start gap-2">
            <Pin className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">Pinned for this Build</p>
              <p className="text-muted-foreground text-xs">
                {pinnedPosts.length} visible threads
              </p>
            </div>
          </div>
          <div className="mt-3">
            {pinnedPosts.map((post) => (
              <button
                className="flex w-full items-center gap-2 border-b py-2 text-left last:border-b-0"
                key={post.id}
                onClick={() => onPinnedPostOpen(post.id)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {richTextToPlainText(post.body).slice(0, 48)}
                    {richTextToPlainText(post.body).length > 48 ? "…" : ""}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {participantById(post.authorId).name} ·{" "}
                    {
                      post.actionItems.filter((item) => item.status !== "done")
                        .length
                    }{" "}
                    open actions
                  </span>
                </span>
              </button>
            ))}
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">My Action Items</p>
              <p className="text-muted-foreground text-xs">
                {myOpenActions.length} open across visible posts
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {myOpenActions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">
                Nothing assigned to {viewer.name}.
              </p>
            ) : (
              myOpenActions.map(({ actionItem, postId }) => (
                <button
                  className="flex items-center gap-2 rounded-lg border bg-background p-2 text-left"
                  key={actionItem.id}
                  onClick={() => onActionOpen(postId, actionItem)}
                  type="button"
                >
                  <Flag
                    className={cn(
                      "size-3.5",
                      actionItem.priority === "urgent"
                        ? "text-destructive"
                        : "text-primary"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">
                      {actionItem.identifier}
                    </span>
                    <span className="block truncate text-xs">
                      {actionItem.title}
                    </span>
                  </span>
                  <StatusBadge status={actionItem.status} />
                </button>
              ))
            )}
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <div>
              <p className="font-semibold text-sm">Build participants</p>
              <p className="text-muted-foreground text-xs">
                8 people · 5 organizations
              </p>
            </div>
          </div>
          <div className="mt-3 flex -space-x-2">
            {PARTICIPANTS.map((participant) => (
              <div
                className="rounded-full border-2 border-background"
                key={participant.id}
                title={`${participant.name} · ${participant.roleLabel}`}
              >
                <ParticipantAvatar participant={participant} small />
              </div>
            ))}
          </div>
          <Button className="mt-3 w-full" size="sm" variant="outline">
            Manage participation
          </Button>
        </FramePanel>
      </Frame>
    </aside>
  );
}

function RestrictedPostPlaceholder() {
  return (
    <Card
      className="border-dashed bg-muted/25 shadow-none"
      render={<article />}
    >
      <CardPanel className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <LockKeyhole className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">Restricted update</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            You do not have permission to view this update.
          </p>
        </div>
        <Button
          className="ml-auto hidden sm:inline-flex"
          size="sm"
          variant="ghost"
        >
          Why can’t I view this?
        </Button>
      </CardPanel>
    </Card>
  );
}

function EmptyFeed({ onClear }: { onClear: () => void }) {
  return (
    <Frame>
      <FramePanel className="p-10 text-center">
        <Filter className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">No updates match this view</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Clear the current filters to return to the complete Build feed.
        </p>
        <Button className="mt-4" onClick={onClear} size="sm" variant="outline">
          Clear filters
        </Button>
      </FramePanel>
    </Frame>
  );
}

function BuildEntityDetailSheet({
  entity,
  onClose,
  onNavigate,
}: {
  entity: BuildEntity | null;
  onClose: () => void;
  onNavigate: (entity: BuildEntity) => void;
}) {
  return (
    <Sheet
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(entity)}
    >
      <SheetPopup side="right" variant="inset">
        {entity ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {entityIcon(entity.kind)}
                </span>
                <Badge variant="outline">{entityKindLabel(entity.kind)}</Badge>
              </div>
              <SheetTitle>{entity.label}</SheetTitle>
              <SheetDescription>{entity.summary}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="grid gap-4">
              <Frame>
                <FramePanel className="p-4">
                  <p className="text-sm leading-6">{entity.detail}</p>
                </FramePanel>
              </Frame>
              <div className="grid grid-cols-2 gap-2">
                {entity.details.map((detail) => (
                  <Card className="shadow-none" key={detail.label}>
                    <CardPanel className="p-3">
                      <p className="text-muted-foreground text-xs">
                        {detail.label}
                      </p>
                      <p className="mt-1 font-semibold text-sm">
                        {detail.value}
                      </p>
                    </CardPanel>
                  </Card>
                ))}
              </div>
              <Frame>
                <FramePanel className="p-4">
                  <p className="font-medium text-xs">Canonical location</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {entity.target}
                  </p>
                </FramePanel>
              </Frame>
            </SheetPanel>
            <SheetFooter>
              <Button onClick={() => onNavigate(entity)}>
                Open and focus in Build
                <ChevronRight />
              </Button>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

function ActionItemSheet({
  editor,
  onChange,
  onClose,
  onSave,
  parentAudience,
  tagOptions,
}: {
  editor: ActionEditorState | null;
  onChange: (editor: ActionEditorState | null) => void;
  onClose: () => void;
  onSave: () => void;
  parentAudience: string;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <Sheet
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(editor)}
    >
      <SheetPopup side="right" variant="inset">
        {editor ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{editor.identifier}</Badge>
                <PriorityBadge priority={editor.priority} />
              </div>
              <SheetTitle>
                {editor.isNew ? "Create Action Item" : editor.title}
              </SheetTitle>
              <SheetDescription>
                Linear-style work attached to the originating post.
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="grid gap-5">
              <div className="rounded-lg border border-primary/20 bg-primary/4 p-3">
                <p className="flex items-center gap-2 font-medium text-xs">
                  <ShieldCheck className="size-4 text-primary" />
                  Audience inherited from the post
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {parentAudience}. This Action Item cannot widen visibility.
                </p>
              </div>

              <EditorField label="Title">
                <Input
                  onChange={(event) =>
                    onChange({ ...editor, title: event.target.value })
                  }
                  value={editor.title}
                />
              </EditorField>
              <EditorField label="Description">
                <CollaborationRichTextEditor
                  ariaLabel="Action Item description"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-28"
                  onChange={(value) =>
                    onChange({ ...editor, description: value })
                  }
                  placeholder="What does done look like? Type @ to tag Build context."
                  tagOptions={tagOptions}
                  value={editor.description}
                />
              </EditorField>
              <div className="grid gap-4 sm:grid-cols-2">
                <EditorField label="Status">
                  <Select
                    onValueChange={(value) =>
                      onChange({
                        ...editor,
                        status: value as ActionStatus,
                      })
                    }
                    value={editor.status}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_COLUMNS.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
                <EditorField label="Priority">
                  <Select
                    onValueChange={(value) =>
                      onChange({
                        ...editor,
                        priority: value as ActionPriority,
                      })
                    }
                    value={editor.priority}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["urgent", "high", "medium", "low"].map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {titleCase(priority)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
              </div>
              <EditorField label="Assignee">
                <Select
                  onValueChange={(value) =>
                    onChange({
                      ...editor,
                      assigneeId: value as ParticipantId,
                    })
                  }
                  value={editor.assigneeId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTICIPANTS.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        {participant.name} · {participant.roleLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditorField>
              <EditorField label="Due date">
                <Input
                  nativeInput
                  onChange={(event) =>
                    onChange({ ...editor, dueDate: event.target.value })
                  }
                  type="date"
                  value={editor.dueDate}
                />
              </EditorField>
              <EditorField label="Labels">
                <Input
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      labels: event.target.value
                        .split(",")
                        .map((label) => label.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Evidence, Draw 3"
                  value={editor.labels.join(", ")}
                />
              </EditorField>
              <div>
                <p className="font-medium text-xs">Activity</p>
                <div className="mt-2 grid gap-3 border-l pl-4 text-xs">
                  <p>
                    <span className="font-medium">Created</span>
                    <span className="ml-2 text-muted-foreground">
                      by {participantById(editor.assigneeId).name}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium">Visibility set</span>
                    <span className="ml-2 text-muted-foreground">
                      inherited from parent post
                    </span>
                  </p>
                </div>
              </div>
            </SheetPanel>
            <SheetFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button disabled={!editor.title.trim()} onClick={onSave}>
                {editor.isNew ? "Create Action Item" : "Save changes"}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

function EditorField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="font-medium text-xs">{label}</span>
      {children}
    </div>
  );
}

function ParticipantAvatar({
  participant,
  small = false,
}: {
  participant: Participant;
  small?: boolean;
}) {
  return (
    <Avatar className={small ? "size-7" : "size-9"}>
      <AvatarFallback
        className={cn(
          participant.tone === "blue" && "bg-blue-100 text-blue-800",
          participant.tone === "amber" && "bg-amber-100 text-amber-800",
          participant.tone === "green" && "bg-emerald-100 text-emerald-800",
          participant.tone === "rose" && "bg-rose-100 text-rose-800",
          participant.tone === "violet" && "bg-violet-100 text-violet-800"
        )}
      >
        {participant.initials}
      </AvatarFallback>
    </Avatar>
  );
}

function PriorityBadge({ priority }: { priority: ActionPriority }) {
  return (
    <Badge
      variant={
        priority === "urgent"
          ? "error"
          : priority === "high"
            ? "warning"
            : "outline"
      }
    >
      <Flag />
      {titleCase(priority)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: ActionStatus }) {
  return (
    <Badge
      variant={
        status === "blocked"
          ? "error"
          : status === "done"
            ? "success"
            : status === "in_progress"
              ? "info"
              : "outline"
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}

function participantById(id: ParticipantId) {
  const participant = PARTICIPANTS.find((candidate) => candidate.id === id);
  if (!participant) {
    throw new Error(`Unknown prototype participant: ${id}`);
  }
  return participant;
}

function entityById(id: string) {
  const entity = ENTITIES.find((candidate) => candidate.id === id);
  if (!entity) {
    throw new Error(`Unknown prototype entity: ${id}`);
  }
  return entity;
}

function buildEntityToReference(
  entity: BuildEntity
): CollaborationTagReference {
  return {
    eyebrow: entityKindLabel(entity.kind),
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    summary: entity.summary,
  };
}

function canReferenceBeUsedInPost(
  option: CollaborationTagOption,
  post: FeedPost,
  posts: FeedPost[]
) {
  if (option.kind === "participant") {
    return true;
  }
  const postRecipients = PARTICIPANTS.filter((participant) =>
    canParticipantViewPost(participant.id, post)
  ).map((participant) => participant.id);
  if (option.kind === "action_item") {
    const owningPost = posts.find((candidate) =>
      candidate.actionItems.some((actionItem) => actionItem.id === option.id)
    );
    return Boolean(
      owningPost &&
        postRecipients.every((participantId) =>
          canParticipantViewPost(participantId, owningPost)
        )
    );
  }
  const entity = entityById(option.id);
  return postRecipients.every((participantId) =>
    entity.visibleTo.includes(participantId)
  );
}

function toMilestoneSheetData(entity: BuildEntity): MilestoneSheetData {
  return {
    canStartWork: false,
    column:
      entity.kind === "submilestone" ? "Awaiting sign-off" : "Evidence review",
    contractors: [
      {
        initials: "MR",
        name: "Marco Ruiz",
        role: "Concrete contractor",
      },
      { initials: "AC", name: "Alex Chen", role: "Builder PM" },
    ],
    drawGroupKey: "draw-3",
    milestoneKey: entity.id,
    name: entity.label,
    recentEvents: [
      {
        _id: `${entity.id}-event-1`,
        actor: "Maya Singh",
        createdAt: Date.now() - 1000 * 60 * 75,
        title: entity.summary,
      },
      {
        _id: `${entity.id}-event-2`,
        actor: "Alex Chen",
        createdAt: Date.now() - 1000 * 60 * 60 * 28,
        title: "Linked to Draw 3 collaboration thread",
      },
    ],
    requestedAmountCents: 18_400_000,
    submittedAt: Date.now() - 1000 * 60 * 60 * 20,
  };
}

function entityKindLabel(kind: BuildEntity["kind"]) {
  if (kind === "site_visit") {
    return "Site Visit";
  }
  if (kind === "submilestone") {
    return "Sub-milestone";
  }
  if (kind === "evidence") {
    return "Evidence Package";
  }
  return titleCase(kind);
}

function richTextHasContent(value: string | undefined) {
  return richTextToPlainText(value ?? "").trim().length > 0;
}

function richTextToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRichText(value: string) {
  if (HTML_CONTENT_PATTERN.test(value)) {
    return value;
  }
  let content = escapeHtml(value);
  for (const participant of PARTICIPANTS) {
    const label = `@${escapeHtml(participant.name)}`;
    content = content.replaceAll(
      label,
      `<span class="rounded bg-primary/10 px-1 font-medium text-primary ring-1 ring-primary/15" data-type="collaboration-reference" data-reference-id="${participant.id}" data-reference-kind="participant" data-label="${escapeHtml(participant.name)}" data-eyebrow="${escapeHtml(participant.roleLabel)}" data-summary="${escapeHtml(`${participant.roleLabel} on this Build`)}">${label}</span>`
    );
  }
  return `<p>${content}</p>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveAudienceParticipantIds(
  audienceId: AudienceId,
  customAudienceIds: ParticipantId[]
): ParticipantId[] {
  if (audienceId === "all") {
    return PARTICIPANTS.map((participant) => participant.id);
  }
  if (audienceId === "custom") {
    return customAudienceIds;
  }
  return PARTICIPANTS.filter((participant) => {
    if (audienceId === "builder") {
      return ["builder", "builder_staff"].includes(participant.role);
    }
    if (audienceId === "lender") {
      return ["broker", "lender", "lender_admin"].includes(participant.role);
    }
    if (audienceId === "builder_lender") {
      return [
        "broker",
        "builder",
        "builder_staff",
        "lender",
        "lender_admin",
      ].includes(participant.role);
    }
    if (audienceId === "homeowner_builder") {
      return ["builder", "builder_staff", "homeowner"].includes(
        participant.role
      );
    }
    return ["builder", "builder_staff", "contractor"].includes(
      participant.role
    );
  }).map((participant) => participant.id);
}

function canParticipantViewPost(participantId: ParticipantId, post: FeedPost) {
  return resolveAudienceParticipantIds(
    post.audienceId,
    post.customAudienceIds ?? []
  ).includes(participantId);
}

function audienceLabel(audienceId: AudienceId) {
  return (
    AUDIENCE_OPTIONS.find((option) => option.id === audienceId)?.label ??
    "Unknown audience"
  );
}

function statusLabel(status: ActionStatus) {
  return STATUS_COLUMNS.find((column) => column.id === status)?.label ?? status;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toggleInList<T>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((candidate) => candidate !== item)
    : [...items, item];
}

function entityIcon(kind: BuildEntity["kind"]) {
  if (kind === "document") {
    return <FileText />;
  }
  if (kind === "site_visit") {
    return <Eye />;
  }
  if (kind === "material") {
    return <HardHat />;
  }
  if (kind === "evidence") {
    return <Image />;
  }
  if (kind === "draw") {
    return <Clock3 />;
  }
  if (kind === "submilestone") {
    return <Flag />;
  }
  return <Star />;
}

"use client";

import type { JSONContent } from "@tiptap/react";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import {
  useConvexConnectionState,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  CalendarClock,
  ChevronDown,
  Flag,
  List,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Send,
  ShieldAlert,
  SquareKanban,
  Users,
  WifiOff,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildActionItemDetailSheet,
  type BuildActionItemSheetTarget,
} from "./BuildActionItemDetailSheet.tsx";
import {
  BuildCollaborationActionItemQueue,
  BuildCollaborationActionItems,
} from "./BuildCollaborationActionItems.tsx";
import { BuildCollaborationApprovalReview } from "./BuildCollaborationApprovalReview.tsx";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  type BuildCollaborationEditingEntity,
  BuildCollaborationEditSheet,
} from "./BuildCollaborationEditSheet.tsx";
import {
  type BuildCollaborationModerationEntity,
  BuildCollaborationModerationSheet,
} from "./BuildCollaborationModerationSheet.tsx";
import {
  BuildCollaborationMutationGate,
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
  useBuildCollaborationPersonalMutation,
} from "./BuildCollaborationMutationGate.tsx";
import { BuildCollaborationNotificationCard } from "./BuildCollaborationNotificationControls.tsx";
import {
  BuildCollaborationReferenceChip,
  BuildCollaborationReferenceSheet,
} from "./BuildCollaborationReference.tsx";
import {
  BuildCollaborationSearch,
  type BuildCollaborationSearchResult,
} from "./BuildCollaborationSearch.tsx";
import { BuildCollaborationThreadSheet } from "./BuildCollaborationThreadSheet.tsx";
import "./build-collaboration.css";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  type BuildCollaborationOfflineDraft,
  buildCollaborationOfflineDraftKey,
  deleteBuildCollaborationOfflineDraft,
  filesFromBuildCollaborationOfflineDraft,
  loadBuildCollaborationOfflineDraft,
  saveBuildCollaborationOfflineDraft,
} from "./build-collaboration-offline-drafts.ts";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type AudienceMode,
  audienceLabel,
  type CollaborationActionItemQueueRow,
  type CollaborationCommentRow,
  type CollaborationDraftBundle,
  type CollaborationDraftSummary,
  type CollaborationFeedEntry,
  type CollaborationFeedPostEntry,
  type CollaborationPlanningReconciliation,
  composerActionItems,
  emptyDocument,
  escapeHtml,
  type FeedFilter,
  type FocusedReference,
  formatTimestamp,
  initials,
  type PostType,
  parseDocument,
  parseDraftBundle,
  plainTextFromDocument,
  postTypeLabel,
  type RawCollaborationTagOption,
  type ReferenceOption,
  reactionLabel,
  roleLabel,
  toBackendReferenceKind,
  toCollaborationTagOption,
  toEditorReferenceKind,
} from "./model.ts";
import { parseBuildCollaborationFocus } from "./referenceFocus.ts";

const BUILD_WORKSPACE_PATH_PATTERN =
  /(\/(?:backoffice|builder-staff|builder|contractor|homeowner)\/builds\/)[^/]+/;
const PLACEHOLDER_VISIBLE_FEED_FILTERS = new Set<FeedFilter>([
  "active_operations",
  "all",
]);

function focusedEntityQueueArgs({
  buildId,
  organizationId,
  reference,
}: {
  buildId: Id<"activeBuilds">;
  organizationId?: string;
  reference: FocusedReference | null;
}) {
  if (
    !reference ||
    reference.entityKind === "participant" ||
    reference.entityKind === "actionItem" ||
    !organizationId
  ) {
    return "skip" as const;
  }
  return {
    buildId,
    entityId: reference.id,
    entityKind: reference.entityKind,
    organizationId,
    scope: "entity" as const,
  };
}

function buildQueueArgs(buildId: Id<"activeBuilds">, organizationId?: string) {
  return organizationId
    ? { buildId, organizationId, scope: "build" as const }
    : ("skip" as const);
}

function buildCollaborationScopeArgs(
  buildId: Id<"activeBuilds">,
  organizationId?: string
) {
  return organizationId ? { buildId, organizationId } : ("skip" as const);
}

function actionItemQueueState(query: {
  loadMore: (count: number) => void;
  results: CollaborationActionItemQueueRow[];
  status: "CanLoadMore" | "Exhausted" | "LoadingFirstPage" | "LoadingMore";
}) {
  return {
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(20),
    loading: query.status === "LoadingFirstPage",
    loadingMore: query.status === "LoadingMore",
    rows: query.results,
  };
}

export function buildActionItemQueueHref(
  currentHref: string,
  buildId: string,
  actionItemId: string
) {
  const url = new URL(currentHref, "http://localhost");
  const nextPath = url.pathname.replace(
    BUILD_WORKSPACE_PATH_PATTERN,
    `$1${encodeURIComponent(buildId)}`
  );
  if (nextPath === url.pathname) {
    throw new Error("Unable to resolve the current Build workspace route.");
  }
  url.pathname = nextPath;
  url.search = "";
  url.searchParams.set("tab", "details");
  url.searchParams.set("focus", `actionItem:${actionItemId}`);
  return `${url.pathname}${url.search}`;
}

export function buildActionItemSheetHref(
  currentHref: string,
  actionItemId?: string
) {
  const url = new URL(currentHref, "http://localhost");
  if (actionItemId) {
    url.searchParams.set("tab", "details");
    url.searchParams.set("focus", `actionItem:${actionItemId}`);
  } else if (url.searchParams.get("focus")?.startsWith("actionItem:")) {
    url.searchParams.delete("focus");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function focusedActionItemIdFromReference(reference?: string) {
  return reference?.startsWith("actionItem:")
    ? reference.slice("actionItem:".length)
    : undefined;
}

function focusedCommentIdFromReference(reference?: string) {
  return reference?.startsWith("comment:")
    ? reference.slice("comment:".length)
    : undefined;
}

function focusedPostIdFromReference(reference?: string) {
  return reference?.startsWith("post:")
    ? reference.slice("post:".length)
    : undefined;
}

function focusedAssetIdFromReference(reference?: string) {
  return reference?.startsWith("asset:")
    ? reference.slice("asset:".length)
    : undefined;
}

const DIRECT_REFERENCE_FOCUS_KINDS = new Set<
  RawCollaborationTagOption["entityKind"]
>([
  "document",
  "draw",
  "evidenceAsset",
  "evidencePackage",
  "material",
  "milestone",
  "participant",
  "siteVisit",
  "submilestone",
]);

function focusedReferenceQueryArgs({
  buildId,
  organizationId,
  reference,
}: {
  buildId: Id<"activeBuilds">;
  organizationId?: string;
  reference?: string;
}) {
  const target = parseBuildCollaborationFocus(reference);
  if (
    !(
      organizationId &&
      target &&
      DIRECT_REFERENCE_FOCUS_KINDS.has(
        target.entityKind as RawCollaborationTagOption["entityKind"]
      )
    )
  ) {
    return "skip" as const;
  }
  return {
    buildId,
    entityId: target.entityId,
    entityKind: target.entityKind as RawCollaborationTagOption["entityKind"],
    organizationId,
  };
}

function focusedActionItemQueryArgs({
  actionItemId,
  buildId,
  organizationId,
}: {
  actionItemId?: string;
  buildId: Id<"activeBuilds">;
  organizationId?: string;
}) {
  if (!(actionItemId && organizationId)) {
    return "skip" as const;
  }
  return { actionItemId, buildId, organizationId };
}

function focusedAssetQueryArgs({
  assetId,
  buildId,
  organizationId,
}: {
  assetId?: string;
  buildId: Id<"activeBuilds">;
  organizationId?: string;
}) {
  if (!(assetId && organizationId)) {
    return "skip" as const;
  }
  return { assetId, buildId, organizationId };
}

function visibleContextValue<T, R>(
  context: ({ state: "visible" } & T) | { state: "revoked" } | undefined,
  select: (visible: { state: "visible" } & T) => R
) {
  return context?.state === "visible" ? select(context) : undefined;
}

function focusedCommentQueryArgs({
  buildId,
  commentId,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  commentId?: string;
  organizationId?: string;
}) {
  if (!(commentId && organizationId)) {
    return "skip" as const;
  }
  return {
    buildId,
    commentId: commentId as Id<"buildCollaborationComments">,
    organizationId,
  };
}

function focusedPostQueryArgs({
  buildId,
  organizationId,
  postId,
}: {
  buildId: Id<"activeBuilds">;
  organizationId?: string;
  postId?: string;
}) {
  if (!(postId && organizationId)) {
    return "skip" as const;
  }
  return { buildId, organizationId, postId };
}

function moderationActionLabel(input: {
  viewerCanAppeal: boolean;
  viewerCanModerate: boolean;
  viewerCanResolveAppeal: boolean;
}) {
  if (input.viewerCanModerate) {
    return "Moderate content";
  }
  if (input.viewerCanAppeal) {
    return "Appeal moderation";
  }
  return "Review moderation appeal";
}

interface CollaborationEditTarget {
  canEdit: boolean;
  document: JSONContent;
  entity: BuildCollaborationEditingEntity;
  references: CollaborationTagReference[];
  revision: number;
}

function useFocusedEntityTarget(input: {
  directlyFocusedReference?: ReferenceOption;
  focusedActionItemId?: Id<"buildActionItems">;
  focusedEntityReference?: string;
  focusedReferenceState?: "revoked" | "visible";
  referenceByKey: Map<string, ReferenceOption>;
  setActionItemSheetTarget: React.Dispatch<
    React.SetStateAction<BuildActionItemSheetTarget | null>
  >;
  setFocusedReference: React.Dispatch<
    React.SetStateAction<FocusedReference | null>
  >;
}) {
  useEffect(() => {
    if (!input.focusedEntityReference) {
      return;
    }
    if (input.focusedReferenceState === "revoked") {
      input.setFocusedReference(null);
      return;
    }
    const reference =
      input.directlyFocusedReference ??
      input.referenceByKey.get(input.focusedEntityReference);
    if (!reference) {
      return;
    }
    if (reference.entityKind === "actionItem") {
      input.setFocusedReference(null);
      input.setActionItemSheetTarget((current) =>
        current?.kind === "detail" && current.actionItemId === reference.id
          ? current
          : {
              actionItemId: reference.id as Id<"buildActionItems">,
              kind: "detail",
            }
      );
      return;
    }
    input.setFocusedReference((current) =>
      current?.entityKind === reference.entityKind &&
      current.id === reference.id
        ? current
        : reference
    );
  }, [
    input.directlyFocusedReference,
    input.focusedEntityReference,
    input.focusedReferenceState,
    input.referenceByKey,
    input.setActionItemSheetTarget,
    input.setFocusedReference,
  ]);
  useEffect(() => {
    if (!input.focusedActionItemId) {
      return;
    }
    input.setActionItemSheetTarget((current) =>
      current?.kind === "detail" &&
      current.actionItemId === input.focusedActionItemId
        ? current
        : {
            actionItemId: input.focusedActionItemId as Id<"buildActionItems">,
            kind: "detail",
          }
    );
  }, [input.focusedActionItemId, input.setActionItemSheetTarget]);
}

function directFocusedReference(
  context:
    | {
        reference: RawCollaborationTagOption;
        state: "visible";
      }
    | { state: "revoked" }
    | undefined
) {
  if (context?.state !== "visible") {
    return;
  }
  return toCollaborationTagOption(context.reference);
}

function actionItemFocusedAssetId(input: {
  actionItemId?: Id<"buildActionItems">;
  assetId?: Id<"buildCollaborationAssets">;
  target: BuildActionItemSheetTarget | null;
}) {
  if (
    input.actionItemId &&
    input.assetId &&
    input.target?.kind === "detail" &&
    input.target.actionItemId === input.actionItemId
  ) {
    return input.assetId;
  }
}

function focusCollaborationReference(input: {
  reference: FocusedReference;
  setActionItemSheetTarget: React.Dispatch<
    React.SetStateAction<BuildActionItemSheetTarget | null>
  >;
  setFocusedReference: React.Dispatch<
    React.SetStateAction<FocusedReference | null>
  >;
}) {
  if (input.reference.entityKind === "actionItem") {
    input.setFocusedReference(null);
    input.setActionItemSheetTarget({
      actionItemId: input.reference.id as Id<"buildActionItems">,
      kind: "detail",
    });
    return;
  }
  input.setFocusedReference(input.reference);
}

interface BuildCollaborationFeedProps {
  buildId: string;
  focusedReference?: string;
  onOpenReference?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  organizationId?: string;
}

const ACTION_ITEM_VIEW_STORAGE_KEY =
  "drawflow:build-collaboration:action-item-view";

function readActionItemViewPreference(): "board" | "list" {
  try {
    return window.localStorage.getItem(ACTION_ITEM_VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "board";
  } catch {
    return "board";
  }
}

export function BuildCollaborationFeed(props: BuildCollaborationFeedProps) {
  const { user } = useAuth();
  const connectionState = useConvexConnectionState();
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  useEffect(() => {
    const markOnline = () => setBrowserOnline(true);
    const markOffline = () => setBrowserOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  // Convex queues writes while disconnected, even when browser networking is
  // reachable. Every shared effect therefore requires a live WebSocket,
  // including the first connection attempt; cold/captive sessions stay private.
  const isOnline = browserOnline && connectionState.isWebSocketConnected;
  const lifecycleState = useQuery(
    api.build_collaboration_lifecycle.getBuildCollaborationLifecycleState,
    buildCollaborationScopeArgs(
      props.buildId as Id<"activeBuilds">,
      props.organizationId
    )
  );
  const collaborationWritable = lifecycleState?.state === "open";
  const sharedMutationsAllowed = isOnline && collaborationWritable;
  const sharedBlockedMessage = isOnline
    ? lifecycleState === undefined
      ? "Collaboration access is still loading. Try again in a moment."
      : "This Build collaboration archive is read-only."
    : "Reconnect before changing shared Build collaboration state. Offline work stays private.";
  return (
    <BuildCollaborationMutationGate
      personalMutationsAllowed={isOnline}
      sharedBlockedMessage={sharedBlockedMessage}
      sharedMutationsAllowed={sharedMutationsAllowed}
    >
      <BuildCollaborationFeedContent
        {...props}
        collaborationState={lifecycleState?.state}
        connectionOnline={isOnline}
        isOnline={sharedMutationsAllowed}
        sessionWorkosUserId={user?.id}
      />
    </BuildCollaborationMutationGate>
  );
}

function BuildCollaborationFeedContent({
  buildId,
  collaborationState,
  connectionOnline,
  focusedReference: focusedEntityReference,
  isOnline,
  organizationId,
  onOpenReference,
  sessionWorkosUserId,
}: BuildCollaborationFeedProps & {
  collaborationState?: "closed" | "open" | "purged";
  connectionOnline: boolean;
  isOnline: boolean;
  sessionWorkosUserId?: string;
}) {
  const activeBuildId = buildId as Id<"activeBuilds">;
  const [filter, setFilter] = useState<FeedFilter>("all");
  const feedScopeArgs = buildCollaborationScopeArgs(
    activeBuildId,
    organizationId,
  );
  const feed = usePaginatedQuery(
    api.build_collaboration.listBuildCollaborationFeed,
    feedScopeArgs === "skip"
      ? "skip"
      : {
          ...feedScopeArgs,
          filter:
            filter === "active_operations" ? "active_operations" : "all",
        },
    { initialNumItems: 20 }
  );
  const viewerBinding = useQuery(
    api.build_collaboration_viewer.getBuildCollaborationViewerBinding,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const viewerRole = viewerBinding?.role;
  const canPublishAnnouncements = Boolean(
    viewerRole &&
      !["builder-staff", "homeowner", "contractor"].includes(viewerRole)
  );
  const canCustomizeAudience = Boolean(
    viewerRole && !["homeowner", "contractor"].includes(viewerRole)
  );
  const rawTagOptions = useQuery(
    api.build_collaboration_references.listBuildCollaborationTagOptions,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const focusedActionItemId = focusedActionItemIdFromReference(
    focusedEntityReference
  );
  const focusedAssetId = focusedAssetIdFromReference(focusedEntityReference);
  const focusedCommentTokenId = focusedCommentIdFromReference(
    focusedEntityReference
  );
  const focusedPostId = focusedPostIdFromReference(focusedEntityReference);
  const focusedActionItemContext = useQuery(
    api.build_collaboration_focus.getFocusedBuildActionItemContext,
    focusedActionItemQueryArgs({
      actionItemId: focusedActionItemId,
      buildId: activeBuildId,
      organizationId,
    })
  ) as
    | {
        actionItemId: Id<"buildActionItems">;
        postId: Id<"buildCollaborationPosts">;
      }
    | null
    | undefined;
  const focusedReferenceContext = useQuery(
    api.build_collaboration_focus.getFocusedBuildCollaborationReference,
    focusedReferenceQueryArgs({
      buildId: activeBuildId,
      organizationId,
      reference: focusedEntityReference,
    })
  );
  const focusedAssetContext = useQuery(
    api.build_collaboration_focus.getFocusedBuildCollaborationAssetContext,
    focusedAssetQueryArgs({
      assetId: focusedAssetId,
      buildId: activeBuildId,
      organizationId,
    })
  ) as
    | {
        actionItemId?: Id<"buildActionItems">;
        assetId: Id<"buildCollaborationAssets">;
        commentId?: Id<"buildCollaborationComments">;
        postId: Id<"buildCollaborationPosts">;
        state: "visible";
      }
    | { state: "revoked" }
    | undefined;
  const focusedAssetCommentId = visibleContextValue(
    focusedAssetContext,
    (context) => context.commentId
  );
  const focusedAssetPostId = visibleContextValue(
    focusedAssetContext,
    (context) => context.postId
  );
  const focusedAssetActionItemId = visibleContextValue(
    focusedAssetContext,
    (context) => context.actionItemId
  );
  const focusedCommentId = focusedCommentTokenId ?? focusedAssetCommentId;
  const focusedCommentContext = useQuery(
    api.build_collaboration_threads.getFocusedBuildCollaborationCommentContext,
    focusedCommentQueryArgs({
      buildId: activeBuildId,
      commentId: focusedCommentId,
      organizationId,
    })
  );
  const focusedCommentPostId = visibleContextValue(
    focusedCommentContext,
    (context) => context.postId
  );
  const focusedPostContext = useQuery(
    api.build_collaboration_focus.getFocusedBuildCollaborationPostContext,
    focusedPostQueryArgs({
      buildId: activeBuildId,
      organizationId,
      postId:
        focusedPostId ??
        focusedAssetPostId ??
        focusedCommentPostId ??
        focusedActionItemContext?.postId,
    })
  ) as
    | { entry: CollaborationFeedPostEntry; state: "visible" }
    | { state: "revoked" }
    | undefined;
  const drafts = useQuery(
    api.build_collaboration_drafts.listMyBuildCollaborationDrafts,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const draftIdentity = useQuery(
    api.build_collaboration_drafts.getMyBuildCollaborationDraftIdentity,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const schedulingCapabilities = useQuery(
    api.build_collaboration_scheduling
      .getBuildCollaborationSchedulingCapabilities,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const personalActionItems = usePaginatedQuery(
    api.build_action_item_queues.listMyBuildActionItemQueue,
    organizationId ? { organizationId } : "skip",
    { initialNumItems: 20 }
  );
  const buildActionItems = usePaginatedQuery(
    api.build_action_item_queues.listBuildActionItemQueue,
    buildQueueArgs(activeBuildId, organizationId),
    { initialNumItems: 20 }
  );
  const saveDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.saveMyBuildCollaborationDraft
  );
  const publishHumanPost = useBuildCollaborationMutation(
    api.build_collaboration.approveAndPublishBuildCollaborationBundle
  );
  const publishDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.approveAndPublishBuildCollaborationDraft
  );
  const discardDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.discardMyBuildCollaborationDraft
  );
  const scheduleDraft = useBuildCollaborationMutation(
    api.build_collaboration_scheduling.approveAndScheduleBuildCollaborationDraft
  );
  const beginAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanAsset = useBuildCollaborationAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useBuildCollaborationMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerExtrasOpen, setComposerExtrasOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("update");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("build_wide");
  const [requestedReaderIds, setRequestedReaderIds] = useState<string[]>([]);
  const [html, setHtml] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [actionTitle, setActionTitle] = useState("");
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [attachmentAssetIds, setAttachmentAssetIds] = useState<
    Id<"buildCollaborationAssets">[]
  >([]);
  const composerAssetStatuses = useQuery(
    api.build_collaboration_assets.listBuildCollaborationAssetStatuses,
    attachmentAssetIds.length > 0 && organizationId
      ? {
          assetIds: attachmentAssetIds,
          buildId: activeBuildId,
          organizationId,
        }
      : "skip"
  );
  const composerAssetStatusById = new Map(
    (composerAssetStatuses ?? []).map((asset) => [asset._id, asset])
  );
  const composerAssets: BuildCollaborationAssetSummary[] =
    attachmentAssetIds.map((assetId) => {
      const asset = composerAssetStatusById.get(assetId);
      return asset
        ? {
            assetId: asset._id,
            contentHashSha256: asset.contentHashSha256,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            scanMessage: asset.scanMessage,
            scanState: asset.scanState,
            sizeBytes: asset.sizeBytes,
            state: asset.state,
            version: asset.version,
          }
        : {
            assetId,
            fileName: "Unavailable governed attachment",
            mimeType: "Metadata unavailable",
            sizeBytes: 0,
            state: "rejected",
            version: 1,
          };
    });
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [editingHumanDraftId, setEditingHumanDraftId] =
    useState<Id<"buildCollaborationDrafts"> | null>(null);
  const [editingHumanDraftRevision, setEditingHumanDraftRevision] = useState<
    number | null
  >(null);
  const [scheduledForInput, setScheduledForInput] = useState("");
  const [offlineCapturedAt, setOfflineCapturedAt] = useState<number | null>(
    null
  );
  const [offlineDraft, setOfflineDraft] =
    useState<BuildCollaborationOfflineDraft | null>(null);
  const [draftConflictMessage, setDraftConflictMessage] = useState<
    string | null
  >(null);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "error" | "idle" | "saved" | "saving"
  >("idle");
  const [reviewingDraftId, setReviewingDraftId] =
    useState<Id<"buildCollaborationDrafts"> | null>(null);
  const offlineDraftKey =
    organizationId && sessionWorkosUserId
      ? buildCollaborationOfflineDraftKey({
          buildId: activeBuildId,
          organizationId,
          workosUserId: sessionWorkosUserId,
        })
      : null;
  useEffect(() => {
    let active = true;
    if (!offlineDraftKey) {
      setOfflineDraft(null);
      return;
    }
    loadBuildCollaborationOfflineDraft(offlineDraftKey)
      .then((draft) => {
        if (active) {
          setOfflineDraft(draft);
        }
      })
      .catch(() => {
        if (active) {
          toast.error("Unable to open the private offline draft store.");
        }
      });
    return () => {
      active = false;
    };
  }, [offlineDraftKey]);
  const latestEditingDraft = editingHumanDraftId
    ? drafts?.find((draft) => draft._id === editingHumanDraftId)
    : undefined;
  const latestEditingDraftBundle = latestEditingDraft
    ? parseDraftBundle(latestEditingDraft.bundleJson)
    : null;
  const [focusedReference, setFocusedReference] =
    useState<FocusedReference | null>(null);
  const [actionItemSheetTarget, setActionItemSheetTarget] =
    useState<BuildActionItemSheetTarget | null>(null);
  const openActionItemSheet = (
    actionItemId: Id<"buildActionItems">,
    historyMode: "push" | "replace" = "push"
  ) => {
    setActionItemSheetTarget({ actionItemId, kind: "detail" });
    const href = buildActionItemSheetHref(window.location.href, actionItemId);
    window.history[historyMode === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      href
    );
  };
  const closeActionItemSheet = () => {
    setActionItemSheetTarget(null);
    window.history.replaceState(
      window.history.state,
      "",
      buildActionItemSheetHref(window.location.href)
    );
  };
  useEffect(() => {
    const handlePopState = () => {
      const actionItemId = focusedActionItemIdFromReference(
        new URL(window.location.href).searchParams.get("focus") ?? undefined
      );
      setActionItemSheetTarget(
        actionItemId
          ? {
              actionItemId: actionItemId as Id<"buildActionItems">,
              kind: "detail",
            }
          : null
      );
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const focusedEntityActionItems = usePaginatedQuery(
    api.build_action_item_queues.listBuildActionItemQueue,
    focusedEntityQueueArgs({
      buildId: activeBuildId,
      organizationId,
      reference: focusedReference,
    }),
    { initialNumItems: 20 }
  );
  const personalQueue = actionItemQueueState(personalActionItems);
  const buildQueue = actionItemQueueState(buildActionItems);
  const entityQueue = actionItemQueueState(focusedEntityActionItems);
  const tagOptions = useMemo<ReferenceOption[]>(
    () => (rawTagOptions ?? []).map(toCollaborationTagOption),
    [rawTagOptions]
  );
  const referenceByKey = useMemo<Map<string, ReferenceOption>>(
    () =>
      new Map(
        tagOptions.map((option) => [`${option.kind}:${option.id}`, option])
      ),
    [tagOptions]
  );
  const directlyFocusedReference = useMemo(
    () => directFocusedReference(focusedReferenceContext),
    [focusedReferenceContext]
  );
  const focusedDetailActionItemId =
    focusedActionItemContext?.actionItemId ?? focusedAssetActionItemId;
  useFocusedEntityTarget({
    directlyFocusedReference,
    focusedActionItemId: focusedDetailActionItemId,
    focusedEntityReference,
    focusedReferenceState: focusedReferenceContext?.state,
    referenceByKey,
    setActionItemSheetTarget,
    setFocusedReference,
  });
  const focusReference = (reference: FocusedReference) => {
    focusCollaborationReference({
      reference,
      setActionItemSheetTarget,
      setFocusedReference,
    });
  };
  const openSearchResult = (result: BuildCollaborationSearchResult) => {
    const target = searchResultReference(result);
    if (onOpenReference) {
      onOpenReference({ ...target, href: result.href });
      return;
    }
    window.history.replaceState(window.history.state, "", result.href);
  };
  const openActionItemSheetReference = (
    reference: CollaborationTagReference
  ) => {
    const option = referenceByKey.get(`${reference.kind}:${reference.id}`);
    if (!option) {
      return;
    }
    if (option.entityKind === "actionItem") {
      openActionItemSheet(option.id as Id<"buildActionItems">);
      return;
    }
    closeActionItemSheet();
    focusReference(option);
  };
  const participants = tagOptions.filter(
    (option) => option.kind === "participant"
  );
  const feedEntries = useMemo(
    () =>
      mergeFocusedPostEntry(
        feed.results as CollaborationFeedEntry[],
        focusedPostContext
      ),
    [feed.results, focusedPostContext]
  );
  useEffect(() => {
    const focusedPostId =
      focusedAssetPostId ??
      focusedCommentPostId ??
      focusedActionItemContext?.postId;
    if (
      !focusedPostId ||
      feedEntries.some(
        (entry) => entry.kind === "post" && entry.post._id === focusedPostId
      ) ||
      feed.status !== "CanLoadMore"
    ) {
      return;
    }
    feed.loadMore(20);
  }, [
    feed,
    feedEntries,
    focusedActionItemContext,
    focusedAssetPostId,
    focusedCommentPostId,
  ]);
  const visibleResults = useMemo(
    () =>
      feedEntries.filter((entry) => {
        if (entry.kind !== "post") {
          // The server deliberately returns restricted placeholders for active
          // operations so that an eligible viewer sees the same page shape and
          // cursor semantics without learning the hidden post. Keep those
          // non-post entries in both canonical feed views; local-only views
          // still operate on readable posts.
          return PLACEHOLDER_VISIBLE_FEED_FILTERS.has(filter);
        }
        if (filter === "pinned") {
          return entry.pins.length > 0;
        }
        if (filter === "following") {
          return entry.following;
        }
        if (filter === "actionable") {
          return entry.actionItems.some(
            (item) => item.status !== "done" && item.status !== "cancelled"
          );
        }
        if (filter === "active_operations") {
          if (entry.post.systemPost) {
            return (
              entry.post.threadState !== "resolved" &&
              entry.post.systemPost.lifecycle !== "resolved"
            );
          }
          return (
            entry.post.threadState !== "resolved" ||
            entry.post.openActionItemCount > 0
          );
        }
        return true;
      }),
    [feedEntries, filter]
  );
  const {
    displayedResults: commentFocusedResults,
    focusedPostEntry: commentFocusedPostEntry,
  } = focusedCommentCollaborationResults({
    context: focusedCommentContext,
    feedEntries,
    focusedCommentId: focusedCommentId as
      | Id<"buildCollaborationComments">
      | undefined,
    visibleResults,
  });
  const displayedResults = focusedPostCollaborationResults({
    feedEntries,
    focusedPostId,
    otherwise: commentFocusedResults,
  });

  const resetComposer = () => {
    setHtml("");
    setDocument(emptyDocument());
    setReferences([]);
    setActionTitle("");
    setAttachmentAssetIds([]);
    setComposerFiles([]);
    setAcknowledgementRequired(false);
    setRequestedReaderIds([]);
    setPostType("update");
    setAudienceMode("build_wide");
    setEditingHumanDraftId(null);
    setEditingHumanDraftRevision(null);
    setScheduledForInput("");
    setOfflineCapturedAt(null);
    setDraftConflictMessage(null);
    setAutosaveStatus("idle");
    setComposerExtrasOpen(false);
    setComposerOpen(false);
  };

  const buildComposerBundle = (
    assets = attachmentAssetIds
  ): CollaborationDraftBundle | null => {
    const plainText = plainTextFromDocument(document);
    if (!plainText) {
      return null;
    }
    return {
      acknowledgementRequired,
      actionItems: composerActionItems(actionTitle),
      attachmentAssetIds: assets,
      audienceMode,
      excludedReaderIds: [],
      notificationEffects: [],
      plainText,
      postType,
      references: references.map((reference, index) => ({
        entityId: reference.id,
        entityKind: toBackendReferenceKind(reference.kind),
        label: reference.label,
        primary:
          index ===
          references.findIndex((candidate) => candidate.kind !== "participant"),
        summary: reference.summary,
      })),
      requestedReaderIds: audienceMode === "custom" ? requestedReaderIds : [],
      sharedMutations: [],
      tiptapJson: JSON.stringify(document),
    };
  };

  const reportComposerFailure = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    if (message.includes("Draft revision conflict")) {
      setDraftConflictMessage(message);
    }
    toast.error(message);
  };

  const hasVerifiedServerDraftIdentity = () => {
    if (
      !(sessionWorkosUserId && draftIdentity) ||
      draftIdentity.workosUserId !== sessionWorkosUserId
    ) {
      toast.error(
        "Your authenticated collaboration identity is still being verified."
      );
      return false;
    }
    return true;
  };

  const preserveConflictedComposer = async (
    error: unknown,
    bundle: CollaborationDraftBundle | null
  ) => {
    const message = error instanceof Error ? error.message : "";
    if (
      !(
        message.includes("Draft revision conflict") &&
        bundle &&
        offlineDraftKey
      )
    ) {
      return;
    }
    const capturedAt = offlineCapturedAt ?? Date.now();
    try {
      const preserved = await saveBuildCollaborationOfflineDraft({
        bundle,
        capturedAt,
        draftId: editingHumanDraftId ?? undefined,
        expectedRevision: editingHumanDraftRevision ?? undefined,
        files: composerFiles,
        key: offlineDraftKey,
        scheduledFor: scheduledForInput
          ? new Date(scheduledForInput).getTime()
          : undefined,
      });
      setOfflineCapturedAt(capturedAt);
      setOfflineDraft(preserved);
    } catch {
      toast.error(
        "The server rejected the stale revision and the private device copy could not be refreshed. Keep this composer open while resolving the conflict."
      );
    }
  };

  const autosaveBundle = buildComposerBundle();
  const autosaveFingerprint = autosaveBundle
    ? JSON.stringify({
        bundle: autosaveBundle,
        files: composerFiles.map((file) => ({
          lastModified: file.lastModified,
          name: file.name,
          size: file.size,
          type: file.type,
        })),
        scheduledForInput,
      })
    : "";
  const lastAutosavedFingerprintRef = useRef("");
  const autosaveInFlightRef = useRef(false);
  const autosaveNowRef = useRef<() => Promise<void>>(async () => undefined);
  autosaveNowRef.current = async () => {
    if (
      !(
        autosaveBundle &&
        autosaveFingerprint &&
        offlineDraftKey &&
        organizationId
      ) ||
      autosaveInFlightRef.current ||
      autosaveFingerprint === lastAutosavedFingerprintRef.current
    ) {
      return;
    }
    autosaveInFlightRef.current = true;
    setAutosaveStatus("saving");
    const capturedAt = Date.now();
    try {
      const privateDraft = await saveBuildCollaborationOfflineDraft({
        bundle: autosaveBundle,
        capturedAt,
        draftId: editingHumanDraftId ?? undefined,
        expectedRevision: editingHumanDraftRevision ?? undefined,
        files: composerFiles,
        key: offlineDraftKey,
        scheduledFor: scheduledForInput
          ? new Date(scheduledForInput).getTime()
          : undefined,
      });
      setOfflineCapturedAt(capturedAt);
      if (!isOnline) {
        setOfflineDraft(privateDraft);
      }
      if (
        isOnline &&
        sessionWorkosUserId &&
        draftIdentity?.workosUserId === sessionWorkosUserId
      ) {
        const saved = await saveDraft({
          ...autosaveBundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId ?? undefined,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          offlineCapturedAt: capturedAt,
          organizationId,
          preparedByAgent: false,
          scheduledFor: scheduledForInput
            ? new Date(scheduledForInput).getTime()
            : undefined,
        });
        setEditingHumanDraftId(saved.draftId);
        setEditingHumanDraftRevision(saved.revision);
      }
      lastAutosavedFingerprintRef.current = autosaveFingerprint;
      setAutosaveStatus("saved");
    } catch (error) {
      await preserveConflictedComposer(error, autosaveBundle);
      setAutosaveStatus("error");
    } finally {
      autosaveInFlightRef.current = false;
    }
  };
  useEffect(() => {
    if (!(composerOpen && autosaveFingerprint) || publishing) {
      return;
    }
    const timer = window.setTimeout(() => {
      void autosaveNowRef.current();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveFingerprint, composerOpen, publishing]);
  useEffect(() => {
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") {
        void autosaveNowRef.current();
      }
    };
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    return () =>
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
  }, []);

  const publishComposerPost = async () => {
    if (!isOnline) {
      toast.error("Reconnect before publishing. Offline work stays private.");
      return;
    }
    if (!(buildComposerBundle() && organizationId) || publishing) {
      toast.error("Write an update before publishing.");
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    setPublishing(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(
        composerFiles,
        {
          abandonAssets,
          beginUpload: beginAssetUpload,
          buildId: activeBuildId,
          contextKind: editingHumanDraftId ? "draft" : "composer",
          contextRecordId: editingHumanDraftId ?? undefined,
          finalizeAndScan: finalizeAndScanAsset,
          organizationId,
          registerUpload: registerAssetUpload,
        }
      );
      const bundle = buildComposerBundle([
        ...new Set([...attachmentAssetIds, ...uploadedAssetIds]),
      ]);
      if (!bundle) {
        throw new Error("Write an update before publishing.");
      }
      if (editingHumanDraftId) {
        const saved = await saveDraft({
          ...bundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          offlineCapturedAt: offlineCapturedAt ?? undefined,
          organizationId,
          preparedByAgent: false,
        });
        setEditingHumanDraftRevision(saved.revision);
        await publishDraft({
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          organizationId,
        });
      } else {
        await publishHumanPost({
          ...bundle,
          buildId: activeBuildId,
          organizationId,
        });
      }
      toast.success("Update published.");
      resetComposer();
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId: activeBuildId,
        organizationId,
        reason: "Post publication failed after asset upload.",
      });
      await preserveConflictedComposer(error, buildComposerBundle());
      reportComposerFailure(error, "Unable to publish update.");
    } finally {
      setPublishing(false);
    }
  };

  const removeComposerAttachment = async (
    asset: BuildCollaborationAssetSummary
  ) => {
    if (publishing) {
      return;
    }
    const retainedAssetIds = attachmentAssetIds.filter(
      (assetId) => assetId !== asset.assetId
    );
    setPublishing(true);
    try {
      if (editingHumanDraftId) {
        const bundle = buildComposerBundle(retainedAssetIds);
        if (!bundle) {
          throw new Error(
            "The draft content must remain valid while removing an attachment."
          );
        }
        const saved = await saveDraft({
          ...bundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          organizationId,
          preparedByAgent: false,
        });
        setEditingHumanDraftRevision(saved.revision);
      } else {
        await abandonGovernedCollaborationAssets({
          abandonAssets,
          assetIds: [asset.assetId],
          buildId: activeBuildId,
          organizationId,
          reason: "Removed from the unpublished composer.",
        });
      }
      setAttachmentAssetIds(retainedAssetIds);
      toast.success(`${asset.fileName} removed.`);
    } catch (error) {
      reportComposerFailure(error, "Unable to remove the attachment.");
    } finally {
      setPublishing(false);
    }
  };

  const persistComposerDraft = async (
    input: { scheduledFor?: number } = {}
  ) => {
    if (!organizationId) {
      throw new Error("The Build organization is unavailable.");
    }
    const bundle = buildComposerBundle();
    if (!bundle) {
      throw new Error("Write an update before saving the draft.");
    }
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      let saved = await ensureComposerDraftId({
        activeBuildId,
        bundle,
        editingHumanDraftId,
        editingHumanDraftRevision,
        offlineCapturedAt,
        organizationId,
        saveDraft,
        scheduledFor: input.scheduledFor,
      });
      uploadedAssetIds = await uploadGovernedCollaborationAssets(
        composerFiles,
        {
          abandonAssets,
          beginUpload: beginAssetUpload,
          buildId: activeBuildId,
          contextKind: "draft",
          contextRecordId: saved.draftId,
          finalizeAndScan: finalizeAndScanAsset,
          organizationId,
          registerUpload: registerAssetUpload,
        }
      );
      if (uploadedAssetIds.length > 0) {
        const finalBundle = buildComposerBundle([
          ...new Set([...attachmentAssetIds, ...uploadedAssetIds]),
        ]);
        if (!finalBundle) {
          throw new Error("The collaboration draft became invalid.");
        }
        saved = await saveDraft({
          ...finalBundle,
          buildId: activeBuildId,
          draftId: saved.draftId,
          expectedRevision: saved.revision,
          offlineCapturedAt: offlineCapturedAt ?? undefined,
          organizationId,
          preparedByAgent: false,
          scheduledFor: input.scheduledFor,
        });
      }
      return saved;
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId: activeBuildId,
        organizationId,
        reason: "Draft persistence failed after asset upload.",
      });
      throw error;
    }
  };

  const saveCurrentDraft = async () => {
    if (!(organizationId && !publishing)) {
      return;
    }
    const bundle = buildComposerBundle();
    if (!bundle) {
      toast.error("Write an update before saving the draft.");
      return;
    }
    if (!isOnline) {
      if (!offlineDraftKey) {
        toast.error("Your private offline draft identity is still loading.");
        return;
      }
      const capturedAt = offlineCapturedAt ?? Date.now();
      try {
        const savedOfflineDraft = await saveBuildCollaborationOfflineDraft({
          bundle,
          capturedAt,
          draftId: editingHumanDraftId ?? undefined,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          files: composerFiles,
          key: offlineDraftKey,
          scheduledFor: scheduledForInput
            ? new Date(scheduledForInput).getTime()
            : undefined,
        });
        setOfflineCapturedAt(capturedAt);
        setOfflineDraft(savedOfflineDraft);
        toast.success("Private offline draft saved on this device.");
      } catch (error) {
        reportComposerFailure(error, "Unable to save the offline draft.");
      }
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    setPublishing(true);
    try {
      await persistComposerDraft();
      if (offlineDraftKey) {
        await deleteBuildCollaborationOfflineDraft(offlineDraftKey);
      }
      setOfflineDraft(null);
      toast.success("Draft saved.");
      resetComposer();
    } catch (error) {
      await preserveConflictedComposer(error, bundle);
      reportComposerFailure(error, "Unable to save draft.");
    } finally {
      setPublishing(false);
    }
  };

  const prepareScheduledPublication = async () => {
    if (!(isOnline && schedulingCapabilities?.canSchedule)) {
      toast.error("Reconnect with a coordinating role before scheduling.");
      return;
    }
    if (!(postType === "update" || postType === "announcement")) {
      toast.error("Only Updates and Announcements can be scheduled.");
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    const scheduledFor = new Date(scheduledForInput).getTime();
    if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() + 60_000) {
      toast.error("Choose a publication time at least one minute from now.");
      return;
    }
    setPublishing(true);
    try {
      const saved = await persistComposerDraft({ scheduledFor });
      if (offlineDraftKey) {
        await deleteBuildCollaborationOfflineDraft(offlineDraftKey);
      }
      setOfflineDraft(null);
      setReviewingDraftId(saved.draftId);
      resetComposer();
      toast.success("Private draft ready for exact human approval.");
    } catch (error) {
      await preserveConflictedComposer(error, buildComposerBundle());
      reportComposerFailure(error, "Unable to prepare the scheduled draft.");
    } finally {
      setPublishing(false);
    }
  };

  const loadBundleIntoComposer = (bundle: CollaborationDraftBundle) => {
    setAcknowledgementRequired(bundle.acknowledgementRequired ?? false);
    setActionTitle(bundle.actionItems[0]?.title ?? "");
    setAttachmentAssetIds(bundle.attachmentAssetIds ?? []);
    setComposerFiles([]);
    setAudienceMode(bundle.audienceMode);
    setDocument(parseDocument(bundle.tiptapJson));
    setHtml(`<p>${escapeHtml(bundle.plainText)}</p>`);
    setPostType(bundle.postType);
    setReferences(
      bundle.references.map((reference) => {
        const option = referenceByKey.get(
          `${reference.entityKind}:${reference.entityId}`
        );
        return {
          eyebrow: option?.eyebrow ?? "Build reference",
          id: reference.entityId,
          kind: option?.kind ?? toEditorReferenceKind(reference.entityKind),
          label: reference.label,
          summary: reference.summary ?? option?.summary ?? "",
        };
      })
    );
    setRequestedReaderIds(bundle.requestedReaderIds);
    setComposerExtrasOpen(
      Boolean(
        bundle.acknowledgementRequired ||
          bundle.actionItems.length > 0 ||
          bundle.attachmentAssetIds.length > 0
      )
    );
    setDraftConflictMessage(null);
    setComposerOpen(true);
  };

  const loadDraftIntoComposer = (draft: CollaborationDraftSummary) => {
    const bundle = parseDraftBundle(draft.bundleJson);
    if (!bundle) {
      toast.error("This draft is invalid and cannot be opened.");
      return;
    }
    loadBundleIntoComposer(bundle);
    setEditingHumanDraftId(draft._id);
    setEditingHumanDraftRevision(draft.revision);
    setOfflineCapturedAt(draft.offlineCapturedAt ?? null);
    setScheduledForInput(
      draft.scheduledFor ? toLocalDateTimeInput(draft.scheduledFor) : ""
    );
  };

  const loadOfflineDraftIntoComposer = () => {
    if (!offlineDraft) {
      return;
    }
    loadBundleIntoComposer(offlineDraft.bundle);
    setComposerFiles(filesFromBuildCollaborationOfflineDraft(offlineDraft));
    setOfflineCapturedAt(offlineDraft.capturedAt);
    setEditingHumanDraftId(
      (offlineDraft.draftId as Id<"buildCollaborationDrafts"> | undefined) ??
        null
    );
    setEditingHumanDraftRevision(offlineDraft.expectedRevision ?? null);
    setScheduledForInput(
      offlineDraft.scheduledFor
        ? toLocalDateTimeInput(offlineDraft.scheduledFor)
        : ""
    );
  };

  const composerExtraCount =
    attachmentAssetIds.length +
    composerFiles.length +
    Number(Boolean(actionTitle.trim())) +
    Number(Boolean(scheduledForInput)) +
    Number(acknowledgementRequired);

  if (!organizationId) {
    return (
      <Frame data-testid="build-collaboration-unavailable">
        <FramePanel>
          <p className="font-medium text-sm">Collaboration unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            The Build must be associated with its originating organization.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  const collaborationSurfaceContent = (
    <>
      <aside
        aria-label="My collaboration work"
        className="build-collaboration-rail build-collaboration-personal-rail order-first xl:order-none"
      >
        <BuildCollaborationActionItemQueue
          compactOnNarrow
          emptyLabel="No open work for you across your authorized Builds."
          hasMore={personalQueue.hasMore}
          loading={personalQueue.loading}
          loadingMore={personalQueue.loadingMore}
          onLoadMore={personalQueue.loadMore}
          onOpen={(row) => {
            if (row.buildId === activeBuildId) {
              openActionItemSheet(row.item._id);
              return;
            }
            window.location.assign(
              buildActionItemQueueHref(
                window.location.href,
                row.buildId,
                row.item._id
              )
            );
          }}
          rows={personalQueue.rows}
          title="My Action Items"
        />
      </aside>

      <FramePanel className="build-collaboration-main space-y-4 p-4">
        {connectionOnline ? null : (
          <Frame data-testid="build-collaboration-offline-banner">
            <FramePanel
              aria-live="polite"
              className="flex items-start gap-3"
              role="status"
            >
              <WifiOff aria-hidden="true" className="mt-0.5 size-4" />
              <div>
                <p className="font-medium text-sm">Private offline mode</p>
                <p className="text-muted-foreground text-xs">
                  Draft text, camera captures, and staged files stay on this
                  device. Publishing and every shared mutation remain blocked
                  until reconnect.
                </p>
              </div>
            </FramePanel>
          </Frame>
        )}
        {collaborationState === undefined ? (
          <Frame data-testid="build-collaboration-lifecycle-loading">
            <FramePanel aria-live="polite" role="status">
              <p className="font-medium text-sm">
                Loading collaboration access…
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Publishing controls will appear after this Build's lifecycle
                state is verified.
              </p>
            </FramePanel>
          </Frame>
        ) : collaborationState === "open" ? null : (
          <Frame data-testid="build-collaboration-read-only-banner">
            <FramePanel aria-live="polite" role="status">
              <p className="font-medium text-sm">Collaboration is read-only</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {collaborationState === "purged"
                  ? "This Build's collaboration content was purged under its retention policy."
                  : "This Build's collaboration archive is closed. Existing activity remains available, but new shared changes are disabled."}
              </p>
            </FramePanel>
          </Frame>
        )}
        {offlineDraft ? (
          <Frame data-testid="build-collaboration-offline-draft">
            <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  Private device draft from{" "}
                  {formatTimestamp(offlineDraft.capturedAt)}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {offlineDraft.bundle.plainText} · {offlineDraft.files.length}{" "}
                  staged file{offlineDraft.files.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                onClick={loadOfflineDraftIntoComposer}
                size="sm"
                type="button"
                variant="outline"
              >
                {connectionOnline ? "Load and reconcile" : "Continue offline"}
              </Button>
            </FramePanel>
          </Frame>
        ) : null}
        {drafts && drafts.length > 0 ? (
          <Frame data-testid="build-collaboration-drafts">
            <FramePanel className="space-y-3">
              <div>
                <p className="font-medium text-sm">Drafts awaiting you</p>
                <p className="text-muted-foreground text-xs">
                  Assistant-prepared drafts require your approval. Your own
                  drafts can publish directly under your name.
                </p>
              </div>
              <div className="space-y-2">
                {drafts.map((draft) => {
                  const bundle = parseDraftBundle(draft.bundleJson);
                  const requiresExactReview =
                    draft.preparedByAgent || Boolean(draft.scheduledFor);
                  const scheduled = draft.state === "scheduled";
                  return (
                    <Card key={draft._id}>
                      <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-sm">
                              {bundle?.plainText ?? "Invalid draft"}
                            </p>
                            {draft.preparedByAgent ? (
                              <Badge variant="outline">Agent prepared</Badge>
                            ) : null}
                            {scheduled ? (
                              <Badge variant="secondary">
                                <CalendarClock
                                  aria-hidden="true"
                                  className="size-3"
                                />
                                Scheduled
                              </Badge>
                            ) : null}
                            {draft.scheduleConflictReason ? (
                              <Badge variant="destructive">
                                Renew approval
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Revision {draft.revision} · saved{" "}
                            {formatTimestamp(draft.updatedAt)}
                            {draft.scheduledFor
                              ? ` · target ${formatTimestamp(draft.scheduledFor)}`
                              : ""}
                          </p>
                          {draft.scheduleConflictReason ? (
                            <p className="mt-1 text-destructive text-xs">
                              {draft.scheduleConflictReason}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {draft.preparedByAgent || scheduled ? null : (
                            <Button
                              onClick={() => loadDraftIntoComposer(draft)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Edit
                            </Button>
                          )}
                          {!scheduled && requiresExactReview ? (
                            <Button
                              disabled={
                                Boolean(draft.scheduledFor) &&
                                !schedulingCapabilities?.canSchedule
                              }
                              onClick={() => setReviewingDraftId(draft._id)}
                              size="sm"
                              type="button"
                            >
                              Review exact bundle
                            </Button>
                          ) : scheduled ? null : (
                            <Button
                              disabled={publishing || !isOnline}
                              onClick={async () => {
                                setPublishing(true);
                                try {
                                  await publishDraft({
                                    buildId: activeBuildId,
                                    draftId: draft._id,
                                    organizationId,
                                  });
                                  toast.success("Draft published.");
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Unable to publish draft."
                                  );
                                } finally {
                                  setPublishing(false);
                                }
                              }}
                              size="sm"
                              type="button"
                            >
                              Publish
                            </Button>
                          )}
                          <Button
                            onClick={async () => {
                              try {
                                await discardDraft({
                                  buildId: activeBuildId,
                                  draftId: draft._id,
                                  organizationId,
                                });
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to discard draft."
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Discard
                          </Button>
                        </div>
                      </CardPanel>
                      {reviewingDraftId === draft._id && bundle ? (
                        <CardPanel className="border-t p-3">
                          <BuildCollaborationApprovalReview
                            approveLabel={
                              draft.scheduledFor
                                ? "Approve exact bundle & schedule"
                                : undefined
                            }
                            buildId={activeBuildId}
                            bundle={bundle}
                            onApprove={async () => {
                              if (publishing) {
                                return;
                              }
                              setPublishing(true);
                              try {
                                if (draft.scheduledFor) {
                                  await scheduleDraft({
                                    buildId: activeBuildId,
                                    draftId: draft._id,
                                    expectedRevision: draft.revision,
                                    organizationId,
                                    scheduledFor: draft.scheduledFor,
                                  });
                                  toast.success(
                                    "Exact bundle approved and scheduled under your name."
                                  );
                                } else {
                                  await publishDraft({
                                    buildId: activeBuildId,
                                    draftId: draft._id,
                                    organizationId,
                                  });
                                  toast.success(
                                    "Draft approved and published under your name."
                                  );
                                }
                                setReviewingDraftId(null);
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to publish draft."
                                );
                              } finally {
                                setPublishing(false);
                              }
                            }}
                            onCancel={() => setReviewingDraftId(null)}
                            organizationId={organizationId}
                            publishing={publishing}
                            scheduledFor={draft.scheduledFor}
                          />
                        </CardPanel>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </FramePanel>
          </Frame>
        ) : null}
        {collaborationState === "open" || !connectionOnline ? (
          <Frame>
            <FramePanel className="p-0">
              <button
                aria-label="What should people involved in this Build know?"
                className="flex w-full items-center gap-3 px-4 py-4 text-left"
                onClick={() => setComposerOpen(true)}
                type="button"
              >
                <Avatar className="size-9">
                  <AvatarFallback>+</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 rounded-full border bg-muted/20 px-4 py-2.5 text-muted-foreground text-sm">
                  What should people involved in this Build know?
                </span>
              </button>
              {composerOpen ? (
                <div className="space-y-3 border-t p-4">
                  {draftConflictMessage ? (
                    <Card data-testid="build-collaboration-draft-conflict">
                      <CardHeader>
                        <div>
                          <CardTitle>Draft changed elsewhere</CardTitle>
                          <CardDescription>
                            Your unsaved composer is preserved. Compare it with
                            the latest private server revision before retrying.
                          </CardDescription>
                        </div>
                        <Badge variant="destructive">Conflict</Badge>
                      </CardHeader>
                      <CardPanel className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide">
                            Your draft
                          </p>
                          <p className="mt-1 text-sm">
                            {plainTextFromDocument(document) || "No content"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide">
                            Latest server revision{" "}
                            {latestEditingDraft?.revision}
                          </p>
                          <p className="mt-1 text-sm">
                            {latestEditingDraftBundle?.plainText ??
                              "Latest content unavailable"}
                          </p>
                          {latestEditingDraft ? (
                            <Button
                              className="mt-2"
                              onClick={() =>
                                loadDraftIntoComposer(latestEditingDraft)
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Use latest revision
                            </Button>
                          ) : null}
                        </div>
                      </CardPanel>
                      <CardPanel className="border-t text-muted-foreground text-xs">
                        {draftConflictMessage}
                      </CardPanel>
                    </Card>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      onValueChange={(value) => setPostType(value as PostType)}
                      value={postType}
                    >
                      <SelectTrigger aria-label="Post type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="update">Update</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                        <SelectItem value="decision">Decision</SelectItem>
                        <SelectItem value="issue">Issue / blocker</SelectItem>
                        {canPublishAnnouncements ? (
                          <SelectItem value="announcement">
                            Announcement
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <Select
                      onValueChange={(value) =>
                        setAudienceMode(value as AudienceMode)
                      }
                      value={audienceMode}
                    >
                      <SelectTrigger aria-label="Post audience">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="build_wide">
                          Everyone on this Build
                        </SelectItem>
                        <SelectItem value="author_tier_and_higher">
                          My role level and above
                        </SelectItem>
                        {canCustomizeAudience ? (
                          <SelectItem value="custom">
                            Custom participants
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                  {audienceMode === "custom" ? (
                    <div className="grid gap-2 rounded-lg border bg-muted/15 p-3 sm:grid-cols-2">
                      {participants.map((participant) => (
                        <label
                          className="flex items-center gap-2 text-sm"
                          key={participant.id}
                        >
                          <input
                            checked={requestedReaderIds.includes(
                              participant.id
                            )}
                            onChange={(event) =>
                              setRequestedReaderIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, participant.id])]
                                  : current.filter(
                                      (id) => id !== participant.id
                                    )
                              )
                            }
                            type="checkbox"
                          />
                          <span>{participant.label}</span>
                        </label>
                      ))}
                      <p className="col-span-full text-muted-foreground text-xs">
                        Participants at your role level and above remain
                        mandatory readers. Referenced work may narrow the final
                        audience.
                      </p>
                    </div>
                  ) : null}
                  <CollaborationRichTextEditor
                    ariaLabel="Build update"
                    editorMinHeightClass="[&_.ProseMirror]:min-h-36"
                    onChange={(nextHtml, nextReferences) => {
                      setHtml(nextHtml);
                      setReferences(nextReferences);
                    }}
                    onDocumentChange={(nextDocument) =>
                      setDocument(nextDocument)
                    }
                    placeholder="Write an update. Type @ to link people, milestones, evidence, site visits, documents, materials, draws, or Action Items."
                    tagOptions={tagOptions}
                    value={html}
                  />
                  {autosaveStatus === "idle" ? null : (
                    <p
                      aria-live="polite"
                      className={cn(
                        "text-xs",
                        autosaveStatus === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                      role="status"
                    >
                      {autosaveStatus === "saving"
                        ? "Saving private draft…"
                        : autosaveStatus === "saved"
                          ? "Private draft autosaved. Publishing still requires you."
                          : "Autosave could not finish. Keep this composer open and retry Save draft."}
                    </p>
                  )}
                  <Collapsible
                    onOpenChange={setComposerExtrasOpen}
                    open={composerExtrasOpen}
                  >
                    <CollapsibleTrigger
                      render={
                        <Button
                          aria-label="Add attachments, scheduling, an Action Item, or acknowledgement"
                          className="w-full justify-between"
                          type="button"
                          variant="outline"
                        />
                      }
                    >
                      <span className="flex items-center gap-2">
                        <Paperclip aria-hidden="true" className="size-4" />
                        Add to update
                        {composerExtraCount > 0 ? (
                          <Badge variant="secondary">
                            {composerExtraCount} selected
                          </Badge>
                        ) : null}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-4 transition-transform",
                          composerExtrasOpen && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 pt-3">
                        {schedulingCapabilities?.canSchedule &&
                        (postType === "update" ||
                          postType === "announcement") ? (
                          <label
                            className="grid gap-1 text-sm sm:max-w-sm"
                            htmlFor="build-collaboration-scheduled-for"
                          >
                            <span className="font-medium">
                              Optional publish time
                            </span>
                            <Input
                              aria-label="Scheduled publication time"
                              id="build-collaboration-scheduled-for"
                              min={toLocalDateTimeInput(
                                minimumScheduledPublicationTimestamp(Date.now())
                              )}
                              onChange={(event) =>
                                setScheduledForInput(event.target.value)
                              }
                              type="datetime-local"
                              value={scheduledForInput}
                            />
                            <span className="text-muted-foreground text-xs">
                              The exact final bundle still requires your
                              approval.
                            </span>
                          </label>
                        ) : null}
                        <ComposerAttachmentInput
                          assets={composerAssets}
                          buildId={activeBuildId}
                          existingCount={attachmentAssetIds.length}
                          files={composerFiles}
                          onFilesChange={setComposerFiles}
                          onRemove={removeComposerAttachment}
                          organizationId={organizationId}
                          savingDraft={Boolean(editingHumanDraftId)}
                        />
                        <div>
                          <label
                            className="sr-only"
                            htmlFor="build-collaboration-action-title"
                          >
                            Optional Action Item title
                          </label>
                          <Input
                            id="build-collaboration-action-title"
                            onChange={(event) =>
                              setActionTitle(event.target.value)
                            }
                            placeholder="Optional Action Item to publish with this post"
                            value={actionTitle}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              checked={acknowledgementRequired}
                              onChange={(event) =>
                                setAcknowledgementRequired(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Require acknowledgement from eligible participants
                            at or below my role level
                          </label>
                          <p className="pl-6 text-muted-foreground text-xs">
                            Acknowledgement confirms review; it is not an
                            approval.
                          </p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <Button
                      className="w-full sm:w-auto"
                      onClick={resetComposer}
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={publishing}
                      onClick={saveCurrentDraft}
                      type="button"
                      variant="outline"
                    >
                      {isOnline ? "Save draft" : "Save privately on device"}
                    </Button>
                    {scheduledForInput &&
                    schedulingCapabilities?.canSchedule &&
                    (postType === "update" || postType === "announcement") ? (
                      <Button
                        className="col-span-2 w-full sm:w-auto"
                        disabled={publishing || !isOnline}
                        onClick={prepareScheduledPublication}
                        type="button"
                        variant="outline"
                      >
                        <CalendarClock aria-hidden="true" className="size-4" />
                        Review & schedule
                      </Button>
                    ) : null}
                    <Button
                      className="col-span-2 w-full sm:w-auto"
                      disabled={publishing || !isOnline}
                      onClick={publishComposerPost}
                      type="button"
                    >
                      <Send aria-hidden="true" className="size-4" />
                      Publish
                    </Button>
                  </div>
                </div>
              ) : null}
            </FramePanel>
          </Frame>
        ) : null}

        <div className="space-y-3">
          <Tabs
            onValueChange={(value) => setFilter(value as FeedFilter)}
            value={filter}
          >
            <TabsList aria-label="Feed filters" variant="underline">
              <TabsTab value="all">All</TabsTab>
              <TabsTab value="active_operations">Active operations</TabsTab>
              <TabsTab value="actionable">Actionable</TabsTab>
              <TabsTab value="pinned">Pinned</TabsTab>
              <TabsTab value="following">Following</TabsTab>
            </TabsList>
          </Tabs>
          <BuildCollaborationSearch
            buildId={activeBuildId}
            onOpen={openSearchResult}
            organizationId={organizationId}
            participants={participants}
          />
        </div>

        {feed.status === "LoadingFirstPage" ? (
          <Frame>
            <FramePanel className="animate-pulse text-muted-foreground text-sm">
              Loading Build collaboration…
            </FramePanel>
          </Frame>
        ) : null}
        <FocusedDiscussionStatus
          focused={Boolean(focusedCommentId)}
          postHydrated={Boolean(commentFocusedPostEntry)}
          state={focusedCommentContext?.state}
        />
        <FocusedPostStatus
          focused={Boolean(focusedPostId)}
          state={focusedPostContext?.state}
        />
        {displayedResults.map((entry) =>
          entry.kind === "restricted" ? (
            <Frame key={entry.placeholderKey}>
              <FramePanel className="flex min-h-24 items-center justify-center gap-2 text-muted-foreground text-sm">
                <LockKeyhole aria-hidden="true" className="size-4" />
                Restricted update
              </FramePanel>
            </Frame>
          ) : entry.kind === "post" ? (
            <CollaborationPostCard
              buildId={activeBuildId}
              entry={entry}
              focusedAssetId={
                focusedAssetContext?.state === "visible" &&
                focusedAssetContext.postId === entry.post._id
                  ? focusedAssetContext.assetId
                  : undefined
              }
              focusedCommentId={
                focusedCommentContext?.state === "visible" &&
                focusedCommentContext.postId === entry.post._id
                  ? focusedCommentContext.focusCommentId
                  : undefined
              }
              focusedPost={entry.post._id === focusedPostId}
              focusedReference={focusedEntityReference}
              key={entry.post._id}
              mutationsAllowed={isOnline}
              onCreateActionItem={(postId) =>
                setActionItemSheetTarget({ kind: "create", postId })
              }
              onFocusReference={focusReference}
              onOpenActionItem={(actionItemId) =>
                openActionItemSheet(actionItemId)
              }
              organizationId={organizationId}
              referenceByKey={referenceByKey}
              tagOptions={tagOptions}
            />
          ) : null
        )}
        {feed.status === "CanLoadMore" ? (
          <Button
            className="w-full"
            onClick={() => feed.loadMore(20)}
            type="button"
            variant="outline"
          >
            Load older activity
          </Button>
        ) : null}
        {feed.status === "Exhausted" && visibleResults.length === 0 ? (
          <Frame>
            <FramePanel className="py-10 text-center text-muted-foreground text-sm">
              No collaboration posts match this view.
            </FramePanel>
          </Frame>
        ) : null}
      </FramePanel>

      <aside
        aria-label="Build collaboration context"
        className="build-collaboration-context-rail build-collaboration-rail"
      >
        <SummaryCard
          description="Important threads for this Build"
          icon={<Pin aria-hidden="true" className="size-4" />}
          title="Pinned"
          value={String(
            feedEntries.filter(
              (entry) => entry.kind === "post" && entry.pins.length > 0
            ).length
          )}
        />
        <BuildCollaborationActionItemQueue
          emptyLabel="No open Action Items on this Build."
          hasMore={buildQueue.hasMore}
          loading={buildQueue.loading}
          loadingMore={buildQueue.loadingMore}
          onLoadMore={buildQueue.loadMore}
          onOpen={(row) => openActionItemSheet(row.item._id)}
          rows={buildQueue.rows}
          title="Build Action Items"
        />
        <SummaryCard
          description="Authorized people and organizations"
          icon={<Users aria-hidden="true" className="size-4" />}
          title="Participants"
          value={String(participants.length)}
        />
        <BuildCollaborationNotificationCard
          activeBuildId={activeBuildId}
          organizationId={organizationId}
        />
      </aside>

      <BuildActionItemDetailSheet
        buildId={activeBuildId}
        focusedAssetId={actionItemFocusedAssetId({
          actionItemId: focusedAssetActionItemId,
          assetId: focusedAssetId as Id<"buildCollaborationAssets"> | undefined,
          target: actionItemSheetTarget,
        })}
        onOpenChange={(open) => {
          if (!open) {
            closeActionItemSheet();
          }
        }}
        onReferenceOpen={openActionItemSheetReference}
        onTargetChange={(nextTarget) => {
          if (nextTarget.kind === "detail") {
            openActionItemSheet(nextTarget.actionItemId);
          } else {
            setActionItemSheetTarget(nextTarget);
          }
        }}
        open={Boolean(actionItemSheetTarget)}
        organizationId={organizationId}
        readOnly={!isOnline}
        tagOptions={tagOptions}
        target={actionItemSheetTarget}
      />
      <BuildCollaborationReferenceSheet
        actionItems={entityQueue.rows}
        actionItemsHasMore={entityQueue.hasMore}
        actionItemsLoading={entityQueue.loading}
        actionItemsLoadingMore={entityQueue.loadingMore}
        focusedWorkspace={
          Boolean(focusedReference) &&
          focusedReference?.entityKind === "participant" &&
          focusedEntityReference ===
            `${focusedReference?.entityKind}:${focusedReference?.id}`
        }
        onLoadMoreActionItems={entityQueue.loadMore}
        onOpenActionItem={(actionItemId) => {
          setFocusedReference(null);
          openActionItemSheet(actionItemId);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setFocusedReference(null);
          }
        }}
        onOpenWorkspace={() => {
          if (!focusedReference) {
            return;
          }
          const reference = focusedReference;
          if (reference.entityKind !== "participant") {
            setFocusedReference(null);
          }
          if (onOpenReference) {
            onOpenReference({
              entityId: reference.id,
              entityKind: reference.entityKind,
              href: reference.href,
            });
          } else {
            window.location.assign(reference.href);
          }
        }}
        reference={focusedReference}
      />
    </>
  );

  const collaborationSurfaceAttributes = {
    "aria-label": "Build collaboration",
    "data-build-id": viewerBinding?.buildId,
    "data-organization-id": viewerBinding?.organizationId,
    "data-testid": "build-collaboration-feed",
    "data-viewer-role": viewerBinding?.role,
    "data-viewer-workos-user-id": viewerBinding?.workosUserId,
  } as const;

  return (
    <Frame>
      <section
        {...collaborationSurfaceAttributes}
        className="build-collaboration-layout"
      >
        {collaborationSurfaceContent}
      </section>
    </Frame>
  );
}

async function ensureComposerDraftId(input: {
  activeBuildId: Id<"activeBuilds">;
  bundle: CollaborationDraftBundle;
  editingHumanDraftId: Id<"buildCollaborationDrafts"> | null;
  editingHumanDraftRevision: number | null;
  offlineCapturedAt: number | null;
  organizationId: string;
  saveDraft: (
    args: CollaborationDraftBundle & {
      buildId: Id<"activeBuilds">;
      draftId?: Id<"buildCollaborationDrafts">;
      expectedRevision?: number;
      offlineCapturedAt?: number;
      organizationId: string;
      preparedByAgent: boolean;
      scheduledFor?: number;
    }
  ) => Promise<{
    bundleJson: string;
    draftId: Id<"buildCollaborationDrafts">;
    revision: number;
  }>;
  scheduledFor?: number;
}) {
  const saved = await input.saveDraft({
    ...input.bundle,
    buildId: input.activeBuildId,
    draftId: input.editingHumanDraftId ?? undefined,
    expectedRevision: input.editingHumanDraftId
      ? (input.editingHumanDraftRevision ?? undefined)
      : undefined,
    offlineCapturedAt: input.offlineCapturedAt ?? undefined,
    organizationId: input.organizationId,
    preparedByAgent: false,
    scheduledFor: input.scheduledFor,
  });
  if (!saved.draftId) {
    throw new Error("The collaboration draft could not be created.");
  }
  return saved;
}

function toLocalDateTimeInput(timestamp: number) {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function minimumScheduledPublicationTimestamp(now: number) {
  const backendThreshold = now + 60_000;
  return Math.ceil((backendThreshold + 1) / 60_000) * 60_000;
}

function ComposerAttachmentInput({
  assets,
  buildId,
  existingCount,
  files,
  onFilesChange,
  onRemove,
  organizationId,
  savingDraft,
}: {
  assets: BuildCollaborationAssetSummary[];
  buildId: Id<"activeBuilds">;
  existingCount: number;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onRemove: (asset: BuildCollaborationAssetSummary) => Promise<void>;
  organizationId: string;
  savingDraft: boolean;
}) {
  const hasAttachments = files.length > 0 || existingCount > 0;
  let status = "";
  if (existingCount > 0) {
    status = `${existingCount} scanned attachment${existingCount === 1 ? "" : "s"} already linked. `;
  }
  if (files.length > 0) {
    status += `${files.length} file${files.length === 1 ? "" : "s"} will be hashed and scanned before ${savingDraft ? "the draft is saved" : "publication"}.`;
  }
  return (
    <div className="space-y-2">
      <label
        className="flex items-center gap-2 font-medium text-sm"
        htmlFor="build-collaboration-attachments"
      >
        <Paperclip aria-hidden="true" className="size-4" />
        Governed attachments
      </label>
      <Input
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        capture="environment"
        id="build-collaboration-attachments"
        multiple
        nativeInput
        onChange={(event) =>
          onFilesChange(Array.from(event.target.files ?? []))
        }
        type="file"
      />
      {hasAttachments ? (
        <p className="text-muted-foreground text-xs">{status}</p>
      ) : null}
      {assets.length > 0 ? (
        <BuildCollaborationAssetList
          assets={assets}
          buildId={buildId}
          onRemove={onRemove}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

function CollaborationPostHeader({
  buildId,
  canEdit,
  coordinationVisible,
  entry,
  mutationsAllowed,
  onEdit,
  onManageThread,
  onModerate,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  canEdit: boolean;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  organizationId: string;
}) {
  const toggleBuildPin = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const togglePersonalPin = useBuildCollaborationPersonalMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const toggleFollow = useBuildCollaborationPersonalMutation(
    api.build_collaboration_threads.toggleBuildCollaborationFollow
  );
  const savePost = (kind: "build" | "personal") =>
    (kind === "build" ? toggleBuildPin : togglePersonalPin)({
      buildId,
      kind,
      organizationId,
      postId: entry.post._id,
    }).catch((error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : kind === "build"
            ? "Unable to pin post."
            : "Unable to save post."
      )
    );
  const followPost = () =>
    toggleFollow({
      buildId,
      organizationId,
      postId: entry.post._id,
    }).catch((error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update follow state."
      )
    );
  const canViewHistory =
    entry.post.viewerIsAuthor ||
    (entry.post.contentState === "active" && entry.post.revision > 1);

  return (
    <CardHeader className="gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-9">
          <AvatarFallback>
            {initials(entry.post.authorDisplayNameSnapshot)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">
            {entry.post.authorDisplayNameSnapshot}
          </CardTitle>
          <CardDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span>{roleLabel(entry.post.authorRole)}</span>
            <span aria-hidden="true">·</span>
            <time>{formatTimestamp(entry.post.createdAt)}</time>
            <PostStatusBadges entry={entry} />
          </CardDescription>
        </div>
        <CollaborationPostActions
          canEdit={canEdit}
          canViewHistory={canViewHistory}
          coordinationVisible={coordinationVisible}
          entry={entry}
          followPost={followPost}
          mutationsAllowed={mutationsAllowed}
          onEdit={onEdit}
          onManageThread={onManageThread}
          onModerate={onModerate}
          savePost={savePost}
        />
      </div>
    </CardHeader>
  );
}

function PostStatusBadges({ entry }: { entry: CollaborationFeedPostEntry }) {
  const contentStatus =
    entry.post.contentState === "tombstoned" ? "Removed" : "Moderated";
  const systemLifecycle = entry.post.systemPost?.lifecycle;
  const announcementProminent = useAnnouncementProminence(
    entry.post.announcementExpiresAt,
    entry.post.announcementProminent
  );
  return (
    <>
      {entry.post.contentState === "active" ? (
        entry.post.revision > 1 ? (
          <Badge variant="outline">Edited</Badge>
        ) : null
      ) : (
        <Badge variant="secondary">{contentStatus}</Badge>
      )}
      <Badge variant="outline">{postTypeLabel(entry.post.postType)}</Badge>
      {entry.post.systemPost ? (
        <Badge variant="secondary">
          System · {entry.post.systemPost.kind === "draw" ? "Draw" : "Milestone"}
        </Badge>
      ) : null}
      {systemLifecycle === "reopened" ? (
        <Badge variant="warning">Reopened</Badge>
      ) : systemLifecycle === "resolved" ||
        entry.post.threadState === "resolved" ? (
        <Badge>Resolved</Badge>
      ) : null}
      {entry.post.postType === "announcement" ? (
        <Badge variant={announcementProminent ? "secondary" : "outline"}>
          {announcementProminent ? "Prominent" : "Prominence expired"}
        </Badge>
      ) : null}
    </>
  );
}

function useAnnouncementProminence(
  expiresAt: number | undefined,
  serverProminent: boolean
) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (expiresAt === undefined || expiresAt <= Date.now()) {
      return;
    }
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(expiresAt - Date.now() + 1, 2_147_483_647)
    );
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);
  return serverProminent && (expiresAt === undefined || expiresAt > now);
}

function CollaborationPostActions({
  canEdit,
  canViewHistory,
  coordinationVisible,
  entry,
  followPost,
  mutationsAllowed,
  onEdit,
  onManageThread,
  onModerate,
  savePost,
}: {
  canEdit: boolean;
  canViewHistory: boolean;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  followPost: () => void;
  mutationsAllowed: boolean;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  savePost: (kind: "build" | "personal") => Promise<unknown>;
}) {
  const canUseModeration =
    entry.post.viewerCanModerate ||
    entry.post.viewerCanAppeal ||
    entry.post.viewerCanResolveAppeal;
  const hasHistoryActions = canViewHistory;
  const hasModerationActions = mutationsAllowed && canUseModeration;
  const hasCoordinationActions = coordinationVisible;
  if (
    !hasHistoryActions &&
    !hasModerationActions &&
    !hasCoordinationActions
  ) {
    return null;
  }
  return (
    <CardAction>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Post actions"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {canViewHistory ? (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil aria-hidden="true" className="size-4" />
                {canEdit ? "Edit post" : "View revision history"}
              </DropdownMenuItem>
            ) : null}
            {mutationsAllowed && canUseModeration ? (
              <DropdownMenuItem onClick={onModerate}>
                <ShieldAlert aria-hidden="true" className="size-4" />
                {moderationActionLabel(entry.post)}
              </DropdownMenuItem>
            ) : null}
            {coordinationVisible && entry.post.contentState === "active" ? (
              <DropdownMenuItem onClick={onManageThread}>
                {mutationsAllowed && entry.post.viewerCanManageThread
                  ? "Manage thread outcome"
                  : "View thread outcome"}
              </DropdownMenuItem>
            ) : null}
            {coordinationVisible ? (
              <>
                <DropdownMenuItem onClick={() => savePost("personal")}>
                  Save privately
                </DropdownMenuItem>
                {mutationsAllowed ? (
                  <DropdownMenuItem onClick={() => savePost("build")}>
                    Pin for Build
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={followPost}>
                  {entry.following ? "Unfollow thread" : "Follow thread"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardAction>
  );
}

function CollaborationPostFooter({
  buildId,
  entry,
  mutationsAllowed,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  organizationId: string;
}) {
  const acknowledge = useBuildCollaborationMutation(
    api.build_collaboration_acknowledgements.acknowledgeBuildCollaborationPost
  );
  const acknowledgePost = async () => {
    try {
      await acknowledge({
        buildId,
        organizationId,
        postId: entry.post._id,
      });
      toast.success("Post acknowledged.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to acknowledge this post."
      );
    }
  };
  const latestReceipt = entry.receipts.reduce(
    (latest, receipt) => Math.max(latest, receipt.lastViewedAt),
    0
  );

  return (
    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-muted-foreground text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {entry.receipts.length > 0
            ? `Seen by ${entry.receipts.length} · ${formatTimestamp(latestReceipt)}`
            : "No view receipts are visible to your role yet"}
        </span>
        {entry.acknowledgement?.required &&
        !entry.acknowledgement.acknowledged ? (
          <Button
            disabled={!mutationsAllowed}
            onClick={acknowledgePost}
            size="sm"
            type="button"
            variant="outline"
          >
            Acknowledge
          </Button>
        ) : entry.acknowledgement?.acknowledged ? (
          <Badge variant="secondary">Acknowledged</Badge>
        ) : null}
      </div>
      <span>{audienceLabel(entry.post.audienceMode)}</span>
    </CardFooter>
  );
}

function ThreadOutcomeSummary({
  entry,
}: {
  entry: CollaborationFeedPostEntry;
}) {
  if (entry.post.threadState !== "resolved") {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-xs">
            {entry.post.postType === "question"
              ? "Accepted answer"
              : entry.post.postType === "decision"
                ? "Decision outcome"
                : entry.post.postType === "issue"
                  ? "Issue disposition"
                  : "Resolution"}
          </p>
          {entry.post.resolvedAt ? (
            <time className="text-muted-foreground text-xs">
              {formatTimestamp(entry.post.resolvedAt)}
            </time>
          ) : null}
        </div>
        {entry.post.postType === "decision" ? (
          <>
            <p className="font-medium text-sm">{entry.post.decisionOutcome}</p>
            <p className="text-muted-foreground text-xs">
              Owner:{" "}
              {entry.post.decisionOwnerDisplayName ??
                "Former Build participant"}
            </p>
          </>
        ) : entry.post.resolutionSummary ? (
          <p className="text-muted-foreground text-sm">
            {entry.post.resolutionSummary}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            This thread has been resolved.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function CollaborationPostCard({
  buildId,
  entry,
  focusedAssetId,
  focusedCommentId,
  focusedPost,
  focusedReference,
  mutationsAllowed,
  onCreateActionItem,
  onFocusReference,
  onOpenActionItem,
  organizationId,
  referenceByKey,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  focusedCommentId?: Id<"buildCollaborationComments">;
  focusedPost: boolean;
  focusedReference?: string;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onFocusReference: (reference: FocusedReference) => void;
  onOpenActionItem: (actionItemId: Id<"buildActionItems">) => void;
  organizationId: string;
  referenceByKey: Map<string, ReferenceOption>;
  tagOptions: ReferenceOption[];
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const planningQueryArgs =
    entry.post.systemPost?.kind === "milestone"
      ? { buildId, organizationId }
      : "skip";
  const planningMetadata = useQuery(
    api.build_collaboration_planning_reconciliation
      .getActiveBuildPlanningReconciliation,
    planningQueryArgs,
  );
  const currentPlanningSnapshot = usePaginatedQuery(
    api.build_collaboration_planning_reconciliation
      .getActiveBuildPlanningReconciliationSnapshot,
    planningQueryArgs,
    { initialNumItems: 100 },
  );
  const activationPlanningSnapshot = usePaginatedQuery(
    api.build_collaboration_planning_reconciliation
      .getActiveBuildPlanningActivationSnapshot,
    planningQueryArgs,
    { initialNumItems: 100 },
  );
  const planningDiffs = usePaginatedQuery(
    api.build_collaboration_planning_reconciliation
      .listActiveBuildPlanningReconciliationDiffs,
    planningQueryArgs,
    { initialNumItems: 100 },
  );
  const planningReconciliation = useMemo(() => {
    if (!planningMetadata) return undefined;
    const pageStillLoading = [
      currentPlanningSnapshot.status,
      activationPlanningSnapshot.status,
      planningDiffs.status,
    ].some((status) => status === "LoadingFirstPage");
    if (pageStillLoading) return undefined;
    const buildIdString = String(buildId);
    const currentSnapshot = planningSnapshotFromEntities(
      buildIdString,
      currentPlanningSnapshot.results,
    );
    const activationSnapshot = planningSnapshotFromEntities(
      buildIdString,
      activationPlanningSnapshot.results,
    );
    const diffsTruncated =
      planningMetadata.diffsTruncated || planningDiffs.status === "CanLoadMore";
    return {
      activation: planningMetadata.activation
        ? {
            ...planningMetadata.activation,
            snapshot: activationSnapshot,
          }
        : null,
      current: {
        revision: planningMetadata.current.revision,
        snapshot: currentSnapshot,
      },
      diffs: planningDiffs.results,
      diffsTruncated,
      materializationPending:
        planningMetadata.materializationPending ||
        activationPlanningSnapshot.status === "CanLoadMore" ||
        currentPlanningSnapshot.status === "CanLoadMore",
      revisionsTruncated: planningMetadata.revisionsTruncated,
      revisions: planningMetadata.revisions,
    };
  }, [
    activationPlanningSnapshot.results,
    activationPlanningSnapshot.status,
    buildId,
    currentPlanningSnapshot.results,
    currentPlanningSnapshot.status,
    planningDiffs.results,
    planningDiffs.status,
    planningMetadata,
  ]);
  useFocusedCollaborationPostCard(cardRef, focusedPost);
  const focusPresentation = focusedPostCardPresentation(focusedPost);
  const [tab, setTab] = useState<"actions" | "discussion" | null>(() =>
    focusedCommentId ? "discussion" : null
  );
  const [actionView, setActionView] = useState<"board" | "list">(
    readActionItemViewPreference
  );
  const [editTarget, setEditTarget] = useState<CollaborationEditTarget | null>(
    null
  );
  const [moderationTarget, setModerationTarget] =
    useState<BuildCollaborationModerationEntity | null>(null);
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const drawCoordinationVisible =
    entry.post.systemPost?.kind !== "draw" ||
    entry.post.systemPost.drawCoordination?.eligible === true;
  const canEdit = Boolean(
    mutationsAllowed &&
      drawCoordinationVisible &&
      entry.post.viewerCanEdit &&
      entry.post.contentState === "active"
  );
  const participants = tagOptions.filter(
    (option) => option.kind === "participant"
  );
  const markViewed = useBuildCollaborationMutation(
    api.build_collaboration_threads.markBuildCollaborationPostViewed
  );
  const transitionAction = useBuildCollaborationMutation(
    api.build_action_item_workflow.transitionBuildActionItem
  );
  const addReplacementComment = useBuildCollaborationMutation(
    api.build_collaboration_threads.addBuildCollaborationComment
  );
  const beginReplacementUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerReplacementUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanReplacement = useBuildCollaborationAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonReplacementAssets = useBuildCollaborationMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );

  useEffect(() => {
    if (focusedCommentId) {
      setTab("discussion");
    }
  }, [focusedCommentId]);

  useEffect(() => {
    if (focusedReference?.startsWith("comment:")) {
      setTab("discussion");
    }
  }, [focusedReference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTION_ITEM_VIEW_STORAGE_KEY, actionView);
    } catch {
      // Browser storage is an optional personal convenience only.
    }
  }, [actionView]);

  useEffect(() => {
    if (
      focusedReference?.startsWith("actionItem:") &&
      entry.actionItems.some(
        (item) => item._id === focusedReference.slice("actionItem:".length)
      )
    ) {
      setTab("actions");
    }
  }, [entry.actionItems, focusedReference]);

  useEffect(() => {
    if (!mutationsAllowed) {
      return;
    }
    const card = cardRef.current;
    if (!(card && typeof IntersectionObserver !== "undefined")) {
      return;
    }
    let visible = false;
    let timer: number | undefined;
    let recorded = false;
    const cancelPendingReceipt = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const scheduleReceipt = () => {
      cancelPendingReceipt();
      if (!(visible && document.visibilityState === "visible") || recorded) {
        return;
      }
      timer = window.setTimeout(() => {
        if (!(visible && document.visibilityState === "visible") || recorded) {
          return;
        }
        recorded = true;
        markViewed({
          buildId,
          organizationId,
          postId: entry.post._id,
        }).catch(() => {
          recorded = false;
        });
      }, 1000);
    };
    const observer = new IntersectionObserver(
      ([intersection]) => {
        visible = Boolean(
          intersection?.isIntersecting && intersection.intersectionRatio >= 0.5
        );
        if (visible) {
          scheduleReceipt();
        } else {
          cancelPendingReceipt();
        }
      },
      { threshold: [0.5] }
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleReceipt();
      } else {
        cancelPendingReceipt();
      }
    };
    observer.observe(card);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelPendingReceipt();
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [buildId, entry.post._id, markViewed, mutationsAllowed, organizationId]);

  const openReference = (reference: CollaborationTagReference) => {
    const option = referenceByKey.get(`${reference.kind}:${reference.id}`);
    if (option) {
      onFocusReference(option);
    }
  };
  const replaceAsset = async (
    asset: BuildCollaborationAssetSummary,
    file: File,
    parentCommentId?: Id<"buildCollaborationComments">
  ) => {
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets([file], {
        abandonAssets: abandonReplacementAssets,
        beginUpload: beginReplacementUpload,
        buildId,
        contextKind: "post",
        contextRecordId: entry.post._id,
        finalizeAndScan: finalizeAndScanReplacement,
        organizationId,
        registerUpload: registerReplacementUpload,
        supersedesAssetId: asset.assetId,
      });
      const plainText = `Replaced ${asset.fileName} v${asset.version} with ${file.name} v${asset.version + 1}.`;
      await addReplacementComment({
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        organizationId,
        parentCommentId,
        plainText,
        postId: entry.post._id,
        references: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: plainText, type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      });
      toast.success("Attachment replacement published.");
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets: abandonReplacementAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Attachment replacement publication failed.",
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to publish the attachment replacement."
      );
    }
  };
  const postEditTarget = () => {
    setEditTarget({
      canEdit,
      document: parseDocument(entry.revision.tiptapJson),
      entity: { kind: "post", postId: entry.post._id },
      references: collaborationReferencesForEditor(
        entry.references,
        referenceByKey
      ),
      revision: entry.post.revision,
    });
  };

  return (
    <Card
      className={focusPresentation.className}
      data-focused={focusPresentation.dataFocused}
      data-testid={`collaboration-post-${entry.post._id}`}
      ref={cardRef}
      tabIndex={focusPresentation.tabIndex}
    >
      <CollaborationPostHeader
        buildId={buildId}
        canEdit={canEdit}
        coordinationVisible={drawCoordinationVisible}
        entry={entry}
        mutationsAllowed={mutationsAllowed}
        onEdit={postEditTarget}
        onManageThread={() => setThreadSheetOpen(true)}
        onModerate={() =>
          setModerationTarget({
            entityId: entry.post._id,
            entityKind: "post",
            expectedRevision: entry.post.revision,
          })
        }
        organizationId={organizationId}
      />
      <CardPanel className="space-y-3 px-4 pb-4">
        <CollaborationRichTextPreview
          ariaLabel="Published Build update"
          className="border-0 bg-transparent [&_.ProseMirror]:px-0"
          onReferenceOpen={openReference}
          tagOptions={tagOptions}
          value={parseDocument(entry.revision.tiptapJson)}
        />
        {entry.post.systemPost ? (
        <SystemPostFacts
            buildId={buildId}
            coordinationVisible={drawCoordinationVisible}
            entry={entry}
            mutationsAllowed={mutationsAllowed}
            onCreateActionItem={onCreateActionItem}
            organizationId={organizationId}
            planningReconciliation={planningReconciliation}
            tagOptions={tagOptions}
          />
        ) : null}
        {entry.references.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.references.map((reference) => {
              const kind = toEditorReferenceKind(reference.entityKind);
              const option = referenceByKey.get(
                `${kind}:${reference.entityId}`
              );
              return (
                <BuildCollaborationReferenceChip
                  key={reference._id}
                  onOpen={() => option && onFocusReference(option)}
                  reference={{
                    eyebrow: option?.eyebrow ?? roleLabel(reference.entityKind),
                    label: option?.label ?? reference.labelSnapshot,
                    summary:
                      option?.summary ??
                      reference.summarySnapshot ??
                      "Referenced on this Build",
                  }}
                />
              );
            })}
          </div>
        ) : null}
        <BuildCollaborationAssetList
          assets={entry.attachments}
          buildId={buildId}
          focusedAssetId={focusedAssetId}
          onReplace={
            mutationsAllowed
              ? (asset, file) => replaceAsset(asset, file)
              : undefined
          }
          organizationId={organizationId}
        />
        <ThreadOutcomeSummary entry={entry} />
      </CardPanel>
      {entry.post.contentState === "active" ? (
        <>
          {drawCoordinationVisible ? <div
            className={cn(
              "grid border-y",
              entry.post.systemPost?.kind === "draw"
                ? "grid-cols-1"
                : "grid-cols-2"
            )}
          >
            <button
              aria-expanded={tab === "discussion"}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 border-r text-sm",
                tab === "discussion" && "bg-primary/10 text-foreground"
              )}
              onClick={() =>
                setTab((current) =>
                  current === "discussion" ? null : "discussion"
                )
              }
              type="button"
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              Discussion {entry.post.commentCount}
            </button>
            {entry.post.systemPost?.kind !== "draw" ? <button
              aria-expanded={tab === "actions"}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 text-sm",
                tab === "actions" && "bg-primary/10 text-foreground"
              )}
              onClick={() =>
                setTab((current) => (current === "actions" ? null : "actions"))
              }
              type="button"
            >
              <Flag aria-hidden="true" className="size-4" />
              Action Items {entry.actionItems.length}
            </button> : null}
          </div> : null}
          {drawCoordinationVisible && tab === "discussion" ? (
            <CollaborationDiscussion
              acceptedCommentId={entry.post.acceptedCommentId}
              buildId={buildId}
              focusedAssetId={focusedAssetId}
              focusedCommentId={focusedCommentId}
              mutationsAllowed={mutationsAllowed}
              onEditComment={setEditTarget}
              onFocusReference={onFocusReference}
              onModerateComment={setModerationTarget}
              onReplaceAsset={replaceAsset}
              organizationId={organizationId}
              postId={entry.post._id}
              referenceByKey={referenceByKey}
              tagOptions={tagOptions}
            />
          ) : tab === "actions" && entry.post.systemPost?.kind !== "draw" ? (
            <CardPanel className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Work stays anchored to this post.
                </p>
                <div className="flex gap-1">
                  <Button
                    aria-label="Show Action Items as a list"
                    aria-pressed={actionView === "list"}
                    onClick={() => setActionView("list")}
                    size="icon-xl"
                    type="button"
                    variant={actionView === "list" ? "secondary" : "ghost"}
                  >
                    <List aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-label="Show Action Items as a board"
                    aria-pressed={actionView === "board"}
                    onClick={() => setActionView("board")}
                    size="icon-xl"
                    type="button"
                    variant={actionView === "board" ? "secondary" : "ghost"}
                  >
                    <SquareKanban aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
              <BuildCollaborationActionItems
                actionView={actionView}
                items={entry.actionItems}
                mutationsAllowed={mutationsAllowed}
                onCreate={() => onCreateActionItem(entry.post._id)}
                onMove={async (
                  actionItemId,
                  status,
                  reason,
                  expectedRevision
                ) => {
                  try {
                    await transitionAction({
                      actionItemId,
                      buildId,
                      expectedRevision,
                      nextStatus: status,
                      organizationId,
                      reason,
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to move Action Item."
                    );
                  }
                }}
                onOpen={onOpenActionItem}
                participants={participants}
              />
            </CardPanel>
          ) : null}
          <CollaborationPostFooter
            buildId={buildId}
            entry={entry}
            mutationsAllowed={mutationsAllowed}
            organizationId={organizationId}
          />
        </>
      ) : (
        <CardFooter className="border-t px-4 py-3 text-muted-foreground text-xs">
          {entry.post.contentState === "tombstoned"
            ? "The visible content was replaced with an auditable tombstone."
            : "The visible content is unavailable while the moderation case is active."}
        </CardFooter>
      )}
      <BuildCollaborationEditSheet
        buildId={buildId}
        canEdit={editTarget?.canEdit ?? false}
        entity={editTarget?.entity ?? null}
        initialDocument={editTarget?.document ?? emptyDocument()}
        initialReferences={editTarget?.references ?? []}
        initialRevision={editTarget?.revision ?? 0}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
          }
        }}
        open={Boolean(editTarget)}
        organizationId={organizationId}
        tagOptions={tagOptions}
      />
      <BuildCollaborationModerationSheet
        buildId={buildId}
        entity={moderationTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setModerationTarget(null);
          }
        }}
        open={Boolean(moderationTarget)}
        organizationId={organizationId}
      />
      <BuildCollaborationThreadSheet
        buildId={buildId}
        onOpenChange={setThreadSheetOpen}
        open={threadSheetOpen}
        organizationId={organizationId}
        postId={entry.post._id}
        readOnly={!mutationsAllowed}
      />
    </Card>
  );
}

type CollaborationSystemPost = NonNullable<
  CollaborationFeedPostEntry["post"]["systemPost"]
>;
type SystemMilestonePlanningSummary = NonNullable<
  CollaborationFeedPostEntry["post"]["planningSummary"]
>;
type PlanningDiff = CollaborationPlanningReconciliation["diffs"][number];

const planningCountLabels = [
  ["backlog", "Backlog"],
  ["behind_schedule", "Behind schedule"],
  ["in_progress", "In progress"],
  ["in_review", "In review"],
  ["approved", "Approved"],
  ["superseded", "Superseded"],
] as const;

const planningAttentionLabels = [
  ["assignmentGaps", "Assignment gaps"],
  ["dependencyExceptions", "Dependency exceptions"],
  ["overdueCompletion", "Overdue completion"],
  ["requiredSiteVisits", "Required site visits"],
  ["reviewSla", "Review SLA"],
] as const;

function planningLifecycleLabel(
  lifecycle: SystemMilestonePlanningSummary["lifecycle"]
) {
  return humanizeEnumLabel(lifecycle);
}

function humanizeEnumLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : value;
}

function planningCategoryLabel(category: PlanningDiff["category"]) {
  switch (category) {
    case "allocations":
      return "Assignments";
    case "dates":
      return "Schedule";
    case "dependencies":
      return "Dependencies";
    case "evidence_requirements":
      return "Evidence requirements";
    case "scope":
      return "Scope";
  }
}

function planningChangeTypeLabel(changeType: PlanningDiff["changeType"]) {
  switch (changeType) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "changed":
      return "changed";
  }
}

function planningEntityTypeLabel(entityType: string) {
  switch (entityType) {
    case "milestone":
      return "Milestone";
    case "submilestone":
      return "Sub-milestone";
    case "budget":
      return "Budget";
    case "draw":
      return "Draw";
    case "allocation":
      return "Assignment";
    case "evidenceRequirement":
      return "Evidence requirement";
    default:
      return entityType;
  }
}

function SystemPostPlanningSummary({
  summary,
}: {
  summary?: SystemMilestonePlanningSummary;
}) {
  if (!summary) {
    return null;
  }
  const counts = planningCountLabels.filter(([key]) => summary.counts[key] > 0);
  const attention = planningAttentionLabels.filter(
    ([key]) => summary.attention[key] > 0
  );
  return (
    <section
      aria-label="Milestone planning summary"
      className="space-y-3 border-t pt-3"
      data-testid="system-post-planning-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-xs">Planning summary</p>
          <p className="text-muted-foreground text-xs">
            Live canonical roadmap state
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={summary.lifecycle === "reopened" ? "warning" : "outline"}
          >
            {planningLifecycleLabel(summary.lifecycle)}
          </Badge>
          <Badge variant={summary.readyForApproval ? "success" : "warning"}>
            {summary.readyForApproval
              ? "Ready for approval"
              : "Not ready for approval"}
          </Badge>
        </div>
      </div>
      {counts.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {counts.map(([key, label]) => (
            <Frame
              className="rounded-md border bg-muted/20 p-0"
              key={key}
            >
              <FramePanel className="rounded-md border-0 bg-transparent px-2 py-1.5 shadow-none">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-sm">{summary.counts[key]}</dd>
              </FramePanel>
            </Frame>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground text-xs">
          No active Sub-milestones are currently projected.
        </p>
      )}
      {attention.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attention.map(([key, label]) => (
            <Badge key={key} variant="warning">
              {label} · {summary.attention[key]}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No planning exceptions are currently reported.
        </p>
      )}
    </section>
  );
}

function planningSnapshotFromEntities(
  buildId: string,
  entities: Array<{
    canonicalId?: string;
    entityKey: string;
    entityType: string;
    planningState: "active" | "superseded";
    snapshot: unknown;
  }>,
) {
  const snapshot = {
    allocations: [] as typeof entities,
    budgets: [] as typeof entities,
    buildId,
    draws: [] as typeof entities,
    evidenceRequirements: [] as typeof entities,
    milestones: [] as typeof entities,
    submilestones: [] as typeof entities,
  };
  for (const entity of entities) {
    if (entity.entityType === "milestone") snapshot.milestones.push(entity);
    else if (entity.entityType === "submilestone") {
      snapshot.submilestones.push(entity);
    } else if (entity.entityType === "draw") snapshot.draws.push(entity);
    else if (entity.entityType === "budget") snapshot.budgets.push(entity);
    else if (entity.entityType === "allocation") {
      snapshot.allocations.push(entity);
    } else if (entity.entityType === "evidenceRequirement") {
      snapshot.evidenceRequirements.push(entity);
    }
  }
  return snapshot;
}

function SystemPostPlanningComparison({
  planningReconciliation,
  systemPost,
}: {
  planningReconciliation?: CollaborationPlanningReconciliation;
  systemPost: CollaborationSystemPost;
}) {
  const activationRevision =
    planningReconciliation?.activation?.revision ??
    systemPost.activationPlanningRevision;
  const currentRevision =
    planningReconciliation?.current.revision ??
    systemPost.currentPlanningRevision;
  const diffs =
    planningReconciliation?.diffs.filter((diff) => {
      const milestoneKey = systemPost.milestoneKey;
      if (!milestoneKey) {
        return false;
      }
      return (
        diff.entityKey === milestoneKey ||
        diff.entityKey.startsWith(`${milestoneKey}:`)
      );
    }) ?? [];
  const hasComparison =
    planningReconciliation !== undefined ||
    activationRevision !== undefined ||
    currentRevision !== undefined;
  if (!hasComparison) {
    return null;
  }
  const changed =
    diffs.length > 0 ||
    (activationRevision !== undefined &&
      currentRevision !== undefined &&
      activationRevision !== currentRevision);
  const categoryCounts = new Map<
    PlanningDiff["category"],
    {
      changeTypes: Map<PlanningDiff["changeType"], number>;
      count: number;
      entityTypes: Set<string>;
    }
  >();
  for (const diff of diffs) {
    const current = categoryCounts.get(diff.category) ?? {
      changeTypes: new Map<PlanningDiff["changeType"], number>(),
      count: 0,
      entityTypes: new Set<string>(),
    };
    current.count += 1;
    current.changeTypes.set(
      diff.changeType,
      (current.changeTypes.get(diff.changeType) ?? 0) + 1
    );
    current.entityTypes.add(diff.entityType);
    categoryCounts.set(diff.category, current);
  }
  return (
    <section
      aria-label="Planning revision comparison"
      className="space-y-3 border-t pt-3"
      data-testid="system-post-planning-comparison"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-xs">Planning revision comparison</p>
          <p className="text-muted-foreground text-xs">
            Activation snapshot versus the current approved plan
          </p>
        </div>
        <Badge
          variant={
            planningReconciliation === undefined
              ? "outline"
              : changed
                ? "warning"
                : "success"
          }
        >
          {planningReconciliation === undefined
            ? "Loading comparison…"
            : changed
              ? "Changed since activation"
              : "Matches activation"}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Activation revision</dt>
          <dd className="font-medium">
            {activationRevision === undefined
              ? "Unavailable"
              : `v${activationRevision}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current revision</dt>
          <dd className="font-medium">
            {currentRevision === undefined
              ? "Unavailable"
              : `v${currentRevision}`}
          </dd>
        </div>
      </dl>
      {planningReconciliation?.revisionsTruncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="planning-revisions-truncated"
          role="status"
        >
          Only the latest 100 planning revisions are shown. Earlier revision
          history is unavailable in this view; the canonical planning record
          remains authoritative.
        </p>
      ) : null}
      {planningReconciliation?.diffsTruncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="planning-diffs-truncated"
          role="status"
        >
          Structured planning diffs are truncated at 10,000 changes. The
          canonical planning record remains authoritative.
        </p>
      ) : null}
      {planningReconciliation === undefined ? (
        <p className="text-muted-foreground text-xs" role="status">
          Loading structured planning changes…
        </p>
      ) : diffs.length === 0 ? (
        planningReconciliation.diffsTruncated || !systemPost.milestoneKey ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid="planning-diffs-indeterminate"
            role="status"
          >
            Structured planning changes cannot be determined because the
            available diff window is truncated. The canonical planning record
            remains authoritative.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            No structured planning changes are recorded after activation.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <p className="font-medium text-xs">
            Structured changes · {diffs.length}
          </p>
          <ul
            aria-label="Structured planning changes"
            className="grid gap-1.5 text-xs sm:grid-cols-2"
          >
            {[...categoryCounts].map(([category, value]) => (
              <li key={category}>
                <Frame className="rounded-md border bg-muted/20 p-0">
                  <FramePanel className="flex items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 shadow-none">
                    <span>{planningCategoryLabel(category)}</span>
                    <span className="text-muted-foreground">
                      {value.count} change{value.count === 1 ? "" : "s"} ·{" "}
                      {[...value.changeTypes]
                        .map(
                          ([changeType, count]) =>
                            String(count) +
                            " " +
                            planningChangeTypeLabel(changeType)
                        )
                        .join(", ")}
                      {" · "}
                      {[...value.entityTypes]
                        .map(planningEntityTypeLabel)
                        .join(", ")}
                    </span>
                  </FramePanel>
                </Frame>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Change values stay governed by the canonical planning record.
          </p>
        </div>
      )}
    </section>
  );
}

type SystemDrawFacts = NonNullable<CollaborationSystemPost["drawFacts"]>;
type DrawCoordinationState = NonNullable<
  CollaborationSystemPost["drawCoordination"]
>;
type HistoricalBackfillFacts = NonNullable<
  CollaborationSystemPost["historicalBackfill"]
>;

function historicalFactLabel(
  fact: HistoricalBackfillFacts["unknownFacts"][number],
) {
  switch (fact) {
    case "start":
      return "start time";
    case "actor":
      return "actor";
    case "evidence":
      return "evidence";
    case "review":
      return "review";
    case "approval":
      return "approval";
    case "disposition":
      return "disposition";
  }
}

function drawFactMoney(amountCents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountCents / 100);
}

function drawFactStatusLabel(value: string) {
  return humanizeEnumLabel(value);
}

function SystemPostDrawFacts({
  buildId,
  coordination,
  coordinationVisible,
  facts,
  mutationsAllowed,
  onCreateActionItem,
  organizationId,
  postId,
}: {
  buildId: Id<"activeBuilds">;
  coordination?: DrawCoordinationState;
  coordinationVisible: boolean;
  facts: SystemDrawFacts;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
}) {
  const join = useBuildCollaborationMutation(
    api.build_draw_coordination.joinDrawCoordination
  );
  const leave = useBuildCollaborationMutation(
    api.build_draw_coordination.leaveDrawCoordination
  );
  const [pending, setPending] = useState(false);
  const updateCoordination = async (action: "join" | "leave") => {
    setPending(true);
    try {
      await (action === "join" ? join : leave)({
        buildId,
        organizationId,
        postId,
      });
      toast.success(action === "join" ? "Joined Draw coordination." : "Left Draw coordination.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update Draw coordination."
      );
    } finally {
      setPending(false);
    }
  };
  const planned = facts.planned;
  const request = facts.request;
  const canCoordinate = coordinationVisible && coordination?.eligible === true;
  return (
    <section
      aria-label="Draw lifecycle facts"
      className="space-y-3 border-t pt-3"
      data-testid="system-post-draw-facts"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-xs">Draw lifecycle</p>
          <p className="text-muted-foreground text-xs">
            Live canonical Draw Request and evidence state
          </p>
        </div>
        <Badge variant="outline">
          {drawFactStatusLabel(facts.review.state)}
        </Badge>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Planned Draw</dt>
          <dd className="font-medium">
            {planned?.label ?? request?.displayId ?? "Unplanned Draw"}
            {planned ? ` · ${drawFactMoney(planned.amountCents)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Request</dt>
          <dd className="font-medium">
            {request
              ? `${request.displayId} · ${drawFactStatusLabel(request.status)}`
              : "Not requested"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Release</dt>
          <dd className="font-medium">{drawFactStatusLabel(facts.release.state)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">
          Evidence · {drawFactStatusLabel(facts.evidence.state)}
        </Badge>
        <Badge variant="secondary">
          Site Visits · {facts.siteVisit.count}
        </Badge>
        <Badge variant="secondary">
          Approval · {drawFactStatusLabel(facts.approval.state)}
        </Badge>
        {facts.disposition ? (
          <Badge variant="warning">
            Disposition · {drawFactStatusLabel(facts.disposition.kind)}
          </Badge>
        ) : null}
      </div>
      {canCoordinate ? (
        <Frame className="rounded-md border bg-background/60 p-0">
          <FramePanel className="flex flex-wrap items-center justify-between gap-2 rounded-md border-0 bg-transparent p-2 shadow-none">
            <div className="flex items-center gap-2 text-xs">
              <Users aria-hidden="true" className="size-4" />
              <span>
                Working audience · {coordination.workingAudienceCount}
              </span>
              {coordination.oversight ? (
                <Badge variant="outline">Oversight only</Badge>
              ) : null}
            </div>
            {!coordination.oversight ? (
              <div className="flex flex-wrap gap-1.5">
                {coordination.canJoin ? (
                  <Button
                    disabled={!mutationsAllowed || pending}
                    onClick={() => updateCoordination("join")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Join coordination
                  </Button>
                ) : null}
                {coordination.canLeave ? (
                  <Button
                    disabled={!mutationsAllowed || pending}
                    onClick={() => updateCoordination("leave")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Leave coordination
                  </Button>
                ) : null}
                <Button
                  disabled={!mutationsAllowed || pending}
                  onClick={() => onCreateActionItem(postId)}
                  size="sm"
                  type="button"
                >
                  Add coordination Action Item
                </Button>
              </div>
            ) : null}
          </FramePanel>
        </Frame>
      ) : (
        <p className="text-muted-foreground text-xs">
          Internal coordination is unavailable for this role.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {coordination?.eligible
          ? "No generated Action Items or Draw board. Discussion remains available; all workflow commands stay in the canonical Draw surfaces."
          : "Canonical Draw facts remain visible. Internal coordination, discussion, and related work are restricted to eligible Build participants."}
      </p>
    </section>
  );
}

function SystemPostFacts({
  buildId,
  coordinationVisible,
  entry,
  mutationsAllowed,
  onCreateActionItem,
  organizationId,
  planningReconciliation,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  organizationId: string;
  planningReconciliation?: CollaborationPlanningReconciliation;
  tagOptions: ReferenceOption[];
}) {
  const systemPost = entry.post.systemPost;
  if (!systemPost) {
    return null;
  }
  const milestoneReference = entry.references.find(
    (reference) => reference.entityKind === "milestone"
  );
  const isDrawSystemPost = systemPost.kind === "draw";
  const drawFacts = isDrawSystemPost ? systemPost.drawFacts : undefined;
  const triggeredByLabel = systemPost.triggeredByWorkosUserId
    ? tagOptions.find(
        (option) =>
          option.kind === "participant" &&
          option.id === systemPost.triggeredByWorkosUserId
      )?.label ?? "Former Build participant"
    : systemPost.triggeredByRole
      ? roleLabel(systemPost.triggeredByRole)
      : "DrawFlow System";
  return (
    <Frame className="border-dashed bg-muted/20" size="sm">
      <FramePanel className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">Canonical facts</Badge>
          <span className="text-muted-foreground">
            Immutable domain binding
          </span>
        </div>
        {systemPost.historicalBackfill ? (
          <section
            aria-label="Historical System Post provenance"
            className="space-y-1 border-y py-2 text-xs"
            data-testid="system-post-historical-backfill"
          >
            <p className="font-medium">Historical backfill</p>
            <p className="text-muted-foreground">
              Materialized from existing canonical records. Missing history is
              preserved as Unknown; no start, actor, evidence, review,
              approval, or disposition facts are inferred.
            </p>
            {systemPost.historicalBackfill.unknownFacts.length > 0 ? (
              <p>
                <span className="font-medium">Unknown historical facts:</span>{" "}
                {systemPost.historicalBackfill.unknownFacts
                  .map(historicalFactLabel)
                  .join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">
              {systemPost.kind === "draw" ? "Draw occurrence" : "Milestone"}
            </dt>
            <dd className="font-medium">
              {systemPost.kind === "draw"
                ? drawFacts?.planned?.drawKey ?? "Canonical Draw"
                : milestoneReference?.labelSnapshot ?? "Canonical Milestone"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Triggered by</dt>
            <dd className="font-medium">
              {triggeredByLabel}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Activation</dt>
            <dd className="font-medium">
              {systemPost.activationReason.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
        {isDrawSystemPost ? (
          drawFacts ? (
            <SystemPostDrawFacts
              buildId={buildId}
              coordination={systemPost.drawCoordination}
              coordinationVisible={coordinationVisible}
              facts={drawFacts}
              mutationsAllowed={mutationsAllowed}
              onCreateActionItem={onCreateActionItem}
              organizationId={organizationId}
              postId={entry.post._id}
            />
          ) : (
            <section
              aria-label="Draw lifecycle facts"
              className="space-y-2 border-t pt-3"
              data-testid="system-post-draw-facts-unavailable"
            >
              <p className="font-medium text-xs">Draw lifecycle facts</p>
              <p className="text-muted-foreground text-xs" role="status">
                Draw facts are unavailable in this view. Open the canonical
                Draw surface for authoritative lifecycle details.
              </p>
            </section>
          )
        ) : (
          <>
            <SystemPostPlanningSummary summary={entry.post.planningSummary} />
            <SystemPostPlanningComparison
              planningReconciliation={planningReconciliation}
              systemPost={systemPost}
            />
          </>
        )}
        {systemPost.recoveryState === "recovery_required" ? (
          <p className="text-amber-700 text-xs dark:text-amber-300">
            Recovery required: add a valid Sub-milestone through the canonical
            roadmap revision before starting work.
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function CollaborationComment({
  accepted,
  buildId,
  focused,
  focusedAssetId,
  mutationsAllowed,
  onEdit,
  onFocusReference,
  onModerate,
  onReplaceAsset,
  onReply,
  onTreeFocus,
  organizationId,
  postId,
  referenceByKey,
  row,
  tabStop,
  tagOptions,
}: {
  accepted: boolean;
  buildId: Id<"activeBuilds">;
  focused: boolean;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  mutationsAllowed: boolean;
  onEdit: (target: CollaborationEditTarget) => void;
  onFocusReference: (reference: FocusedReference) => void;
  onModerate: (target: BuildCollaborationModerationEntity) => void;
  onReplaceAsset: (
    asset: BuildCollaborationAssetSummary,
    file: File,
    parentCommentId?: Id<"buildCollaborationComments">
  ) => Promise<void>;
  onReply: (commentId: Id<"buildCollaborationComments">) => void;
  onTreeFocus: (commentId: Id<"buildCollaborationComments">) => void;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
  referenceByKey: Map<string, ReferenceOption>;
  row: CollaborationCommentRow;
  tabStop: boolean;
  tagOptions: ReferenceOption[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) {
      return;
    }
    containerRef.current?.focus({ preventScroll: true });
  }, [focused]);
  const openReference = (reference: CollaborationTagReference) => {
    const option = referenceByKey.get(`${reference.kind}:${reference.id}`);
    if (option) {
      onFocusReference(option);
    }
  };
  const editComment = () =>
    onEdit({
      canEdit:
        mutationsAllowed &&
        row.comment.viewerIsAuthor &&
        row.comment.contentState === "active",
      document: parseDocument(
        row.revision?.tiptapJson ?? JSON.stringify(emptyDocument())
      ),
      entity: {
        commentId: row.comment._id,
        kind: "comment",
      },
      references: collaborationReferencesForEditor(
        row.references,
        referenceByKey
      ),
      revision: row.comment.revision,
    });
  const canViewHistory =
    row.comment.viewerIsAuthor ||
    (row.comment.contentState === "active" && row.comment.revision > 1);

  return (
    <div
      aria-level={row.comment.logicalDepth + 1}
      className={cn(
        "flex gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        focused && "ring-2 ring-primary/40"
      )}
      data-testid={`collaboration-comment-${row.comment._id}`}
      data-tree-comment-id={row.comment._id}
      onFocus={() => onTreeFocus(row.comment._id)}
      ref={containerRef}
      role="treeitem"
      style={{
        marginLeft: `${Math.min(row.comment.logicalDepth, 2) * 12}px`,
      }}
      tabIndex={tabStop ? 0 : -1}
    >
      <Avatar className="size-7">
        <AvatarFallback>
          {initials(row.comment.authorDisplayNameSnapshot)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-xl bg-muted/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-xs">
            {row.comment.authorDisplayNameSnapshot}
          </span>
          <time className="text-muted-foreground text-xs">
            {formatTimestamp(row.comment.createdAt)}
          </time>
          <CollaborationCommentBadges accepted={accepted} row={row} />
        </div>
        {row.comment.logicalDepth > 2 ? (
          <p className="mt-1 text-muted-foreground text-xs">
            Replying to{" "}
            {row.comment.parentAuthorDisplayNameSnapshot ??
              "an unavailable reply"}
          </p>
        ) : null}
        {row.revision ? (
          <CollaborationRichTextPreview
            ariaLabel="Collaboration reply"
            className="mt-1 border-0 bg-transparent [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
            onReferenceOpen={openReference}
            tagOptions={tagOptions}
            value={parseDocument(row.revision.tiptapJson)}
          />
        ) : null}
        <BuildCollaborationAssetList
          assets={row.attachments}
          buildId={buildId}
          focusedAssetId={focusedAssetId}
          onReplace={
            mutationsAllowed
              ? (asset, file) => onReplaceAsset(asset, file, row.comment._id)
              : undefined
          }
          organizationId={organizationId}
        />
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {mutationsAllowed && row.comment.contentState === "active" ? (
            <Button
              id={`reply-to-${row.comment._id}`}
              onClick={() => onReply(row.comment._id)}
              size="xs"
              type="button"
              variant="ghost"
            >
              Reply
            </Button>
          ) : null}
          <CollaborationCommentReactions
            buildId={buildId}
            mutationsAllowed={mutationsAllowed}
            organizationId={organizationId}
            row={row}
          />
          <CollaborationCommentPin
            buildId={buildId}
            mutationsAllowed={mutationsAllowed}
            organizationId={organizationId}
            postId={postId}
            row={row}
          />
          {canViewHistory ? (
            <Button
              onClick={editComment}
              size="xs"
              type="button"
              variant="ghost"
            >
              {row.comment.viewerIsAuthor &&
              row.comment.contentState === "active"
                ? "Edit"
                : "History"}
            </Button>
          ) : null}
          {mutationsAllowed &&
          (row.comment.viewerCanModerate ||
            row.comment.viewerCanAppeal ||
            row.comment.viewerCanResolveAppeal) ? (
            <Button
              onClick={() =>
                onModerate({
                  entityId: row.comment._id,
                  entityKind: "comment",
                  expectedRevision: row.comment.revision,
                })
              }
              size="xs"
              type="button"
              variant="ghost"
            >
              {moderationActionLabel(row.comment)}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CollaborationCommentBadges({
  accepted,
  row,
}: {
  accepted: boolean;
  row: CollaborationCommentRow;
}) {
  return (
    <>
      {row.comment.contentState === "active" ? (
        row.comment.revision > 1 ? (
          <Badge variant="outline">Edited</Badge>
        ) : null
      ) : (
        <Badge variant="secondary">
          {row.comment.contentState === "tombstoned" ? "Removed" : "Moderated"}
        </Badge>
      )}
      {accepted ? <Badge>Accepted answer</Badge> : null}
      {row.comment.pinCount > 0 ? (
        <Badge variant="outline">
          Pinned
          {row.comment.pinCount > 1 ? ` · ${row.comment.pinCount}` : ""}
        </Badge>
      ) : null}
    </>
  );
}

function CollaborationCommentReactions({
  buildId,
  mutationsAllowed,
  organizationId,
  row,
}: {
  buildId: Id<"activeBuilds">;
  mutationsAllowed: boolean;
  organizationId: string;
  row: CollaborationCommentRow;
}) {
  const reactToComment = useBuildCollaborationMutation(
    api.build_collaboration_threads.reactToBuildCollaborationComment
  );
  if (!mutationsAllowed || row.comment.contentState !== "active") {
    return null;
  }
  const reactionCounts = new Map<
    "acknowledged" | "agree" | "question",
    number
  >();
  for (const reaction of row.reactions ?? []) {
    reactionCounts.set(
      reaction.reaction,
      (reactionCounts.get(reaction.reaction) ?? 0) + 1
    );
  }
  return (
    <fieldset className="inline-flex flex-wrap gap-1">
      <legend className="sr-only">Reply reactions</legend>
      {(["acknowledged", "agree", "question"] as const).map((reaction) => (
        <Button
          key={reaction}
          onClick={() =>
            reactToComment({
              buildId,
              commentId: row.comment._id,
              organizationId,
              reaction,
            }).catch((error) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to react to this reply."
              )
            )
          }
          size="xs"
          type="button"
          variant="ghost"
        >
          {reactionLabel(reaction)}
          {(reactionCounts.get(reaction) ?? 0) > 0
            ? ` ${reactionCounts.get(reaction)}`
            : ""}
        </Button>
      ))}
    </fieldset>
  );
}

function CollaborationCommentPin({
  buildId,
  mutationsAllowed,
  organizationId,
  postId,
  row,
}: {
  buildId: Id<"activeBuilds">;
  mutationsAllowed: boolean;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
  row: CollaborationCommentRow;
}) {
  const togglePin = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  if (!(mutationsAllowed && row.comment.viewerCanPin)) {
    return null;
  }
  return (
    <Button
      aria-pressed={row.comment.viewerPinned}
      onClick={() =>
        togglePin({
          buildId,
          commentId: row.comment._id,
          kind: "reply",
          organizationId,
          postId,
        }).catch((error) =>
          toast.error(
            error instanceof Error ? error.message : "Unable to pin this reply."
          )
        )
      }
      size="xs"
      type="button"
      variant="ghost"
    >
      {row.comment.viewerPinned ? "Unpin reply" : "Pin reply"}
    </Button>
  );
}

function CollaborationDiscussion({
  acceptedCommentId,
  buildId,
  focusedAssetId,
  focusedCommentId,
  mutationsAllowed,
  onEditComment,
  onFocusReference,
  onModerateComment,
  onReplaceAsset,
  organizationId,
  postId,
  referenceByKey,
  tagOptions,
}: {
  acceptedCommentId?: Id<"buildCollaborationComments">;
  buildId: Id<"activeBuilds">;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  focusedCommentId?: Id<"buildCollaborationComments">;
  mutationsAllowed: boolean;
  onEditComment: (target: CollaborationEditTarget) => void;
  onFocusReference: (reference: FocusedReference) => void;
  onModerateComment: (target: BuildCollaborationModerationEntity) => void;
  onReplaceAsset: (
    asset: BuildCollaborationAssetSummary,
    file: File,
    parentCommentId?: Id<"buildCollaborationComments">
  ) => Promise<void>;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
  referenceByKey: Map<string, ReferenceOption>;
  tagOptions: ReferenceOption[];
}) {
  const listComments = useQuery(
    api.build_collaboration_threads.listBuildCollaborationComments,
    { buildId, organizationId, postId }
  );
  const focusedContext = useQuery(
    api.build_collaboration_threads.getFocusedBuildCollaborationCommentContext,
    focusedCommentId
      ? { buildId, commentId: focusedCommentId, organizationId }
      : "skip"
  );
  const addComment = useBuildCollaborationMutation(
    api.build_collaboration_threads.addBuildCollaborationComment
  );
  const beginAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanAsset = useBuildCollaborationAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useBuildCollaborationMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const react = useBuildCollaborationMutation(
    api.build_collaboration_threads.reactToBuildCollaborationPost
  );
  const [replyHtml, setReplyHtml] = useState("");
  const [replyDocument, setReplyDocument] = useState<JSONContent>(
    emptyDocument()
  );
  const [replyReferences, setReplyReferences] = useState<
    CollaborationTagReference[]
  >([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyComposerOpen, setReplyComposerOpen] = useState(false);
  const [replyingTo, setReplyingTo] =
    useState<Id<"buildCollaborationComments">>();
  const [submittingReply, setSubmittingReply] = useState(false);
  const [pendingFocusCommentId, setPendingFocusCommentId] =
    useState<Id<"buildCollaborationComments">>();
  const [activeTreeCommentId, setActiveTreeCommentId] =
    useState<Id<"buildCollaborationComments">>();
  const threadRef = useRef<HTMLDivElement>(null);
  const comments = focusedCommentId
    ? focusedContext?.state === "visible"
      ? focusedContext.rows
      : undefined
    : listComments;
  const effectiveFocusCommentId = focusedCommentId ?? pendingFocusCommentId;
  useEffect(() => {
    if (effectiveFocusCommentId) {
      setActiveTreeCommentId(effectiveFocusCommentId);
    }
  }, [effectiveFocusCommentId]);
  const replyingToRow = (comments ?? []).find(
    (row) => row.comment._id === replyingTo
  );
  const restoreReplyFocus = (commentId?: Id<"buildCollaborationComments">) => {
    if (!commentId) {
      return;
    }
    requestAnimationFrame(() =>
      document.getElementById(`reply-to-${commentId}`)?.focus()
    );
  };

  const submitReply = async () => {
    const plainText = plainTextFromDocument(replyDocument);
    if (!plainText || submittingReply) {
      return;
    }
    setSubmittingReply(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(replyFiles, {
        abandonAssets,
        beginUpload: beginAssetUpload,
        buildId,
        contextKind: "post",
        contextRecordId: postId,
        finalizeAndScan: finalizeAndScanAsset,
        organizationId,
        registerUpload: registerAssetUpload,
      });
      const commentId = await addComment({
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        organizationId,
        parentCommentId: replyingTo,
        plainText,
        postId,
        references: replyReferences.map((reference, index) => ({
          entityId: reference.id,
          entityKind:
            referenceByKey.get(`${reference.kind}:${reference.id}`)
              ?.entityKind ?? toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        tiptapJson: JSON.stringify(replyDocument),
      });
      setReplyHtml("");
      setReplyDocument(emptyDocument());
      setReplyReferences([]);
      setReplyFiles([]);
      setReplyingTo(undefined);
      setReplyComposerOpen(false);
      setPendingFocusCommentId(commentId);
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Reply publication failed after asset upload.",
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to publish reply."
      );
    } finally {
      setSubmittingReply(false);
    }
  };

  const navigateComments = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const items = Array.from(
      threadRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ??
        []
    );
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowUp"
            ? Math.max(currentIndex - 1, 0)
            : Math.min(currentIndex + 1, items.length - 1);
    event.preventDefault();
    const nextItem = items[nextIndex];
    const nextCommentId = nextItem?.dataset.treeCommentId as
      | Id<"buildCollaborationComments">
      | undefined;
    if (nextCommentId) {
      setActiveTreeCommentId(nextCommentId);
    }
    nextItem?.focus();
  };

  return (
    <CardPanel className="space-y-3 p-4">
      {comments === undefined ? (
        <Frame>
          <FramePanel
            aria-live="polite"
            className="text-muted-foreground text-sm"
          >
            Loading discussion…
          </FramePanel>
        </Frame>
      ) : (
        <div
          aria-label="Nested discussion"
          className="space-y-3"
          onKeyDown={navigateComments}
          ref={threadRef}
          role="tree"
        >
          {(comments as CollaborationCommentRow[]).map((row, index) => (
            <CollaborationComment
              accepted={row.comment._id === acceptedCommentId}
              buildId={buildId}
              focused={row.comment._id === effectiveFocusCommentId}
              focusedAssetId={focusedAssetId}
              key={row.comment._id}
              mutationsAllowed={mutationsAllowed}
              onEdit={onEditComment}
              onFocusReference={onFocusReference}
              onModerate={onModerateComment}
              onReplaceAsset={onReplaceAsset}
              onReply={(commentId) => {
                setReplyingTo(commentId);
                setReplyComposerOpen(true);
              }}
              onTreeFocus={setActiveTreeCommentId}
              organizationId={organizationId}
              postId={postId}
              referenceByKey={referenceByKey}
              row={row}
              tabStop={
                activeTreeCommentId
                  ? row.comment._id === activeTreeCommentId
                  : index === 0
              }
              tagOptions={tagOptions}
            />
          ))}
        </div>
      )}
      {mutationsAllowed && replyComposerOpen && replyingTo ? (
        <p className="text-muted-foreground text-xs">
          Replying to{" "}
          {replyingToRow?.comment.authorDisplayNameSnapshot ??
            "an unavailable reply"}
          .{" "}
          <Button
            onClick={() => {
              const priorReply = replyingTo;
              setReplyingTo(undefined);
              setReplyComposerOpen(false);
              restoreReplyFocus(priorReply);
            }}
            size="xs"
            type="button"
            variant="link"
          >
            Cancel
          </Button>
        </p>
      ) : null}
      {mutationsAllowed && replyComposerOpen ? (
        <>
          <CollaborationRichTextEditor
            ariaLabel="Reply to this Build update"
            editorMinHeightClass="[&_.ProseMirror]:min-h-24"
            onChange={(nextHtml, nextReferences) => {
              setReplyHtml(nextHtml);
              setReplyReferences(nextReferences);
            }}
            onDocumentChange={setReplyDocument}
            placeholder="Write a reply. Type @ to link Build work."
            tagOptions={tagOptions}
            value={replyHtml}
          />
          <div className="space-y-1">
            <Input
              aria-label="Reply attachments"
              multiple
              nativeInput
              onChange={(event) =>
                setReplyFiles(Array.from(event.target.files ?? []))
              }
              type="file"
            />
            {replyFiles.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {replyFiles.length} file{replyFiles.length === 1 ? "" : "s"}{" "}
                will be scanned before the reply is published.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {mutationsAllowed ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(["acknowledged", "agree", "question"] as const).map(
              (reaction) => (
                <Button
                  key={reaction}
                  onClick={() =>
                    react({
                      buildId,
                      organizationId,
                      postId,
                      reaction,
                    }).catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Unable to react to this post."
                      )
                    )
                  }
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {reactionLabel(reaction)}
                </Button>
              )
            )}
          </div>
          {replyComposerOpen ? (
            <Button
              disabled={submittingReply}
              onClick={submitReply}
              size="sm"
              type="button"
            >
              <Send aria-hidden="true" className="size-4" />
              Reply
            </Button>
          ) : (
            <Button
              onClick={() => setReplyComposerOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Write a reply…
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          This archived discussion is available to read; replies and reactions
          are disabled.
        </p>
      )}
    </CardPanel>
  );
}

function SummaryCard({
  description,
  icon,
  title,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 p-4">
        <span className="text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {description}
          </CardDescription>
        </div>
        <Badge variant="secondary">{value}</Badge>
      </CardHeader>
    </Card>
  );
}

function FocusedDiscussionStatus({
  focused,
  postHydrated,
  state,
}: {
  focused: boolean;
  postHydrated: boolean;
  state?: "revoked" | "visible";
}) {
  if (!focused) {
    return null;
  }
  if (state === undefined || (state === "visible" && !postHydrated)) {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          Loading focused discussion…
        </FramePanel>
      </Frame>
    );
  }
  if (state === "revoked") {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          This focused discussion is unavailable or your access was revoked.
        </FramePanel>
      </Frame>
    );
  }
  return null;
}

function FocusedPostStatus({
  focused,
  state,
}: {
  focused: boolean;
  state?: "revoked" | "visible";
}) {
  if (!focused || state === "visible") {
    return null;
  }
  return (
    <Frame>
      <FramePanel aria-live="polite" className="text-muted-foreground text-sm">
        {state === "revoked"
          ? "This focused post is unavailable or your access was revoked."
          : "Loading focused post…"}
      </FramePanel>
    </Frame>
  );
}

function mergeFocusedPostEntry(
  entries: CollaborationFeedEntry[],
  context?:
    | { entry: CollaborationFeedPostEntry; state: "visible" }
    | { state: "revoked" }
) {
  if (
    context?.state !== "visible" ||
    entries.some(
      (entry) =>
        entry.kind === "post" && entry.post._id === context.entry.post._id
    )
  ) {
    return entries;
  }
  return [context.entry, ...entries];
}

function focusedPostCollaborationResults({
  feedEntries,
  focusedPostId,
  otherwise,
}: {
  feedEntries: CollaborationFeedEntry[];
  focusedPostId?: string;
  otherwise: CollaborationFeedEntry[];
}) {
  if (!focusedPostId) {
    return otherwise;
  }
  const focusedPostEntry = feedEntries.find(
    (entry): entry is CollaborationFeedPostEntry =>
      entry.kind === "post" && entry.post._id === focusedPostId
  );
  if (!focusedPostEntry) {
    return otherwise;
  }
  return otherwise.some(
    (entry) =>
      entry.kind === "post" && entry.post._id === focusedPostEntry.post._id
  )
    ? otherwise
    : [focusedPostEntry, ...otherwise];
}

function useFocusedCollaborationPostCard(
  cardRef: React.RefObject<HTMLDivElement | null>,
  focused: boolean
) {
  useEffect(() => {
    if (!focused) {
      return;
    }
    cardRef.current?.focus({ preventScroll: true });
  }, [cardRef, focused]);
}

function focusedPostCardPresentation(focused: boolean) {
  if (!focused) {
    return {
      className: undefined,
      dataFocused: undefined,
      tabIndex: undefined,
    };
  }
  return {
    className: "ring-2 ring-primary ring-offset-2",
    dataFocused: "true",
    tabIndex: -1,
  } as const;
}

function focusedCommentCollaborationResults({
  context,
  feedEntries,
  focusedCommentId,
  visibleResults,
}: {
  context?:
    | { state: "revoked" }
    | { postId: Id<"buildCollaborationPosts">; state: "visible" };
  feedEntries: CollaborationFeedEntry[];
  focusedCommentId?: Id<"buildCollaborationComments">;
  visibleResults: CollaborationFeedEntry[];
}) {
  if (!focusedCommentId || context?.state === "revoked") {
    return { displayedResults: visibleResults, focusedPostEntry: undefined };
  }
  if (context?.state !== "visible") {
    return {
      displayedResults: visibleResults,
      focusedPostEntry: undefined,
    };
  }
  const focusedPostEntry = feedEntries.find(
    (entry) => entry.kind === "post" && entry.post._id === context.postId
  );
  return {
    displayedResults:
      focusedPostEntry &&
      !visibleResults.some(
        (entry) =>
          entry.kind === "post" && entry.post._id === focusedPostEntry.post._id
      )
        ? [focusedPostEntry, ...visibleResults]
        : visibleResults,
    focusedPostEntry,
  };
}

function searchResultReference(result: BuildCollaborationSearchResult) {
  if (result.focusEntityKind && result.focusEntityId) {
    return {
      entityId: result.focusEntityId,
      entityKind: result.focusEntityKind,
    };
  }
  switch (result.resultType) {
    case "comment":
      return { entityId: result.commentId ?? result.id, entityKind: "comment" };
    case "actionItem":
      return {
        entityId: result.actionItemId ?? result.id,
        entityKind: "actionItem",
      };
    case "asset":
      return {
        entityId: result.entityId ?? result.id,
        entityKind: "asset",
      };
    case "reference":
      return {
        entityId: result.entityId ?? result.id,
        entityKind: result.entityKind ?? "milestone",
      };
    default:
      return { entityId: result.postId, entityKind: "post" };
  }
}

function collaborationReferencesForEditor(
  references: CollaborationFeedPostEntry["references"],
  referenceByKey: Map<string, ReferenceOption>
) {
  return references.map((reference) => {
    const kind = toEditorReferenceKind(reference.entityKind);
    const option = referenceByKey.get(`${kind}:${reference.entityId}`);
    return {
      eyebrow: option?.eyebrow ?? roleLabel(reference.entityKind),
      id: reference.entityId,
      kind,
      label: option?.label ?? reference.labelSnapshot,
      summary:
        option?.summary ??
        reference.summarySnapshot ??
        "Referenced on this Build",
    };
  });
}

"use client";

import type { JSONContent } from "@tiptap/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  CalendarClock,
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

export function BuildCollaborationFeed(props: BuildCollaborationFeedProps) {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return (
    <BuildCollaborationMutationGate sharedMutationsAllowed={isOnline}>
      <BuildCollaborationFeedContent {...props} isOnline={isOnline} />
    </BuildCollaborationMutationGate>
  );
}

function BuildCollaborationFeedContent({
  buildId,
  focusedReference: focusedEntityReference,
  isOnline,
  organizationId,
  onOpenReference,
}: BuildCollaborationFeedProps & { isOnline: boolean }) {
  const activeBuildId = buildId as Id<"activeBuilds">;
  const feed = usePaginatedQuery(
    api.build_collaboration.listBuildCollaborationFeed,
    buildCollaborationScopeArgs(activeBuildId, organizationId),
    { initialNumItems: 20 }
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
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [composerOpen, setComposerOpen] = useState(false);
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
  const [reviewingDraftId, setReviewingDraftId] =
    useState<Id<"buildCollaborationDrafts"> | null>(null);
  const offlineDraftKey =
    organizationId && draftIdentity?.workosUserId
      ? buildCollaborationOfflineDraftKey({
          buildId: activeBuildId,
          organizationId,
          workosUserId: draftIdentity.workosUserId,
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
    if (option.entityKind !== "actionItem") {
      setActionItemSheetTarget(null);
    }
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
          return filter === "all";
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

  const publishComposerPost = async () => {
    if (!isOnline) {
      toast.error("Reconnect before publishing. Offline work stays private.");
      return;
    }
    if (!(buildComposerBundle() && organizationId) || publishing) {
      toast.error("Write an update before publishing.");
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

  return (
    <section
      aria-label="Build collaboration"
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]"
      data-testid="build-collaboration-feed"
    >
      <div className="min-w-0 space-y-4">
        {isOnline ? null : (
          <Frame data-testid="build-collaboration-offline-banner">
            <FramePanel className="flex items-start gap-3">
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
                {isOnline ? "Load and reconcile" : "Continue offline"}
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
                          Latest server revision {latestEditingDraft?.revision}
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
                      <SelectItem value="announcement">Announcement</SelectItem>
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
                        My tier and higher
                      </SelectItem>
                      <SelectItem value="custom">
                        Custom participants
                      </SelectItem>
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
                          checked={requestedReaderIds.includes(participant.id)}
                          onChange={(event) =>
                            setRequestedReaderIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, participant.id])]
                                : current.filter((id) => id !== participant.id)
                            )
                          }
                          type="checkbox"
                        />
                        <span>{participant.label}</span>
                      </label>
                    ))}
                    <p className="col-span-full text-muted-foreground text-xs">
                      Higher and peer roles remain included automatically.
                    </p>
                  </div>
                ) : null}
                {schedulingCapabilities?.canSchedule &&
                (postType === "update" || postType === "announcement") ? (
                  <label
                    className="grid gap-1 text-sm sm:max-w-sm"
                    htmlFor="build-collaboration-scheduled-for"
                  >
                    <span className="font-medium">Optional publish time</span>
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
                      The exact final bundle still requires your approval.
                    </span>
                  </label>
                ) : null}
                <CollaborationRichTextEditor
                  ariaLabel="Build update"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-36"
                  onChange={(nextHtml, nextReferences) => {
                    setHtml(nextHtml);
                    setReferences(nextReferences);
                  }}
                  onDocumentChange={(nextDocument) => setDocument(nextDocument)}
                  placeholder="Write an update. Type @ to link people, milestones, evidence, site visits, documents, materials, draws, or Action Items."
                  tagOptions={tagOptions}
                  value={html}
                />
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
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    onChange={(event) => setActionTitle(event.target.value)}
                    placeholder="Optional Action Item to publish with this post"
                    value={actionTitle}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={resetComposer}
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
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
                      disabled={publishing || !isOnline}
                      onClick={publishComposerPost}
                      type="button"
                    >
                      <Send aria-hidden="true" className="size-4" />
                      Publish
                    </Button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={acknowledgementRequired}
                    onChange={(event) =>
                      setAcknowledgementRequired(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Require acknowledgement from participants at or below my role
                </label>
              </div>
            ) : null}
          </FramePanel>
        </Frame>

        <div className="space-y-3">
          <Tabs
            onValueChange={(value) => setFilter(value as FeedFilter)}
            value={filter}
          >
            <TabsList aria-label="Feed filters" variant="underline">
              <TabsTab value="all">All</TabsTab>
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
              onCreateActionItem={(postId) =>
                setActionItemSheetTarget({ kind: "create", postId })
              }
              onFocusReference={focusReference}
              onOpenActionItem={(actionItemId) =>
                setActionItemSheetTarget({ actionItemId, kind: "detail" })
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
      </div>

      <aside className="space-y-3">
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
          emptyLabel="No open work for you across your authorized Builds."
          hasMore={personalQueue.hasMore}
          loading={personalQueue.loading}
          loadingMore={personalQueue.loadingMore}
          onLoadMore={personalQueue.loadMore}
          onOpen={(row) => {
            if (row.buildId === activeBuildId) {
              setActionItemSheetTarget({
                actionItemId: row.item._id,
                kind: "detail",
              });
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
        <BuildCollaborationActionItemQueue
          emptyLabel="No open Action Items on this Build."
          hasMore={buildQueue.hasMore}
          loading={buildQueue.loading}
          loadingMore={buildQueue.loadingMore}
          onLoadMore={buildQueue.loadMore}
          onOpen={(row) =>
            setActionItemSheetTarget({
              actionItemId: row.item._id,
              kind: "detail",
            })
          }
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
            setActionItemSheetTarget(null);
          }
        }}
        onReferenceOpen={openActionItemSheetReference}
        open={Boolean(actionItemSheetTarget)}
        organizationId={organizationId}
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
          setActionItemSheetTarget({ actionItemId, kind: "detail" });
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
    </section>
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
  entry,
  onEdit,
  onManageThread,
  onModerate,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  organizationId: string;
}) {
  const togglePin = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  const toggleFollow = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationFollow
  );
  const savePost = (kind: "build" | "personal") =>
    togglePin({
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
  const canEdit =
    entry.post.viewerIsAuthor && entry.post.contentState === "active";
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
          entry={entry}
          followPost={followPost}
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
      {entry.post.threadState === "resolved" ? <Badge>Resolved</Badge> : null}
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
  entry,
  followPost,
  onEdit,
  onManageThread,
  onModerate,
  savePost,
}: {
  canEdit: boolean;
  canViewHistory: boolean;
  entry: CollaborationFeedPostEntry;
  followPost: () => void;
  onEdit: () => void;
  onManageThread: () => void;
  onModerate: () => void;
  savePost: (kind: "build" | "personal") => Promise<unknown>;
}) {
  const canUseModeration =
    entry.post.viewerCanModerate ||
    entry.post.viewerCanAppeal ||
    entry.post.viewerCanResolveAppeal;
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
            {canUseModeration ? (
              <DropdownMenuItem onClick={onModerate}>
                <ShieldAlert aria-hidden="true" className="size-4" />
                {moderationActionLabel(entry.post)}
              </DropdownMenuItem>
            ) : null}
            {entry.post.contentState === "active" ? (
              <DropdownMenuItem onClick={onManageThread}>
                {entry.post.viewerCanManageThread
                  ? "Manage thread outcome"
                  : "View thread outcome"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => savePost("personal")}>
              Save privately
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => savePost("build")}>
              Pin for Build
            </DropdownMenuItem>
            <DropdownMenuItem onClick={followPost}>
              {entry.following ? "Unfollow thread" : "Follow thread"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardAction>
  );
}

function CollaborationPostFooter({
  buildId,
  entry,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  entry: CollaborationFeedPostEntry;
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
            : "No visible receipts yet"}
        </span>
        {entry.acknowledgement?.required &&
        !entry.acknowledgement.acknowledged ? (
          <Button
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
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onFocusReference: (reference: FocusedReference) => void;
  onOpenActionItem: (actionItemId: Id<"buildActionItems">) => void;
  organizationId: string;
  referenceByKey: Map<string, ReferenceOption>;
  tagOptions: ReferenceOption[];
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusedCollaborationPostCard(cardRef, focusedPost);
  const focusPresentation = focusedPostCardPresentation(focusedPost);
  const [tab, setTab] = useState<"actions" | "discussion">("discussion");
  const [actionView, setActionView] = useState<"board" | "list">("list");
  const [editTarget, setEditTarget] = useState<CollaborationEditTarget | null>(
    null
  );
  const [moderationTarget, setModerationTarget] =
    useState<BuildCollaborationModerationEntity | null>(null);
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
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
    markViewed({
      buildId,
      organizationId,
      postId: entry.post._id,
    }).catch(() => undefined);
  }, [buildId, entry.post._id, markViewed, organizationId]);

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
      canEdit:
        entry.post.viewerIsAuthor && entry.post.contentState === "active",
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
        entry={entry}
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
          onReplace={(asset, file) => replaceAsset(asset, file)}
          organizationId={organizationId}
        />
        <ThreadOutcomeSummary entry={entry} />
      </CardPanel>
      {entry.post.contentState === "active" ? (
        <>
          <div className="grid grid-cols-2 border-y">
            <button
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 border-r text-sm",
                tab === "discussion" && "bg-primary/5 text-primary"
              )}
              onClick={() => setTab("discussion")}
              type="button"
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              Discussion {entry.post.commentCount}
            </button>
            <button
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 text-sm",
                tab === "actions" && "bg-primary/5 text-primary"
              )}
              onClick={() => setTab("actions")}
              type="button"
            >
              <Flag aria-hidden="true" className="size-4" />
              Action Items {entry.actionItems.length}
            </button>
          </div>
          {tab === "discussion" ? (
            <CollaborationDiscussion
              acceptedCommentId={entry.post.acceptedCommentId}
              buildId={buildId}
              focusedAssetId={focusedAssetId}
              focusedCommentId={focusedCommentId}
              onEditComment={setEditTarget}
              onFocusReference={onFocusReference}
              onModerateComment={setModerationTarget}
              onReplaceAsset={replaceAsset}
              organizationId={organizationId}
              postId={entry.post._id}
              referenceByKey={referenceByKey}
              tagOptions={tagOptions}
            />
          ) : (
            <CardPanel className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Work stays anchored to this post.
                </p>
                <div className="flex gap-1">
                  <Button
                    aria-pressed={actionView === "list"}
                    onClick={() => setActionView("list")}
                    size="icon-xs"
                    type="button"
                    variant={actionView === "list" ? "secondary" : "ghost"}
                  >
                    <List aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-pressed={actionView === "board"}
                    onClick={() => setActionView("board")}
                    size="icon-xs"
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
              />
            </CardPanel>
          )}
          <CollaborationPostFooter
            buildId={buildId}
            entry={entry}
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
      />
    </Card>
  );
}

function CollaborationComment({
  accepted,
  buildId,
  focused,
  focusedAssetId,
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
        row.comment.viewerIsAuthor && row.comment.contentState === "active",
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
        marginLeft: `${Math.min(row.comment.logicalDepth, 3) * 18}px`,
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
        {row.comment.logicalDepth > 3 ? (
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
          onReplace={(asset, file) =>
            onReplaceAsset(asset, file, row.comment._id)
          }
          organizationId={organizationId}
        />
        {row.comment.contentState === "active" ? (
          <button
            className="mt-1 text-muted-foreground text-xs hover:text-foreground"
            id={`reply-to-${row.comment._id}`}
            onClick={() => onReply(row.comment._id)}
            type="button"
          >
            Reply
          </button>
        ) : null}
        <CollaborationCommentReactions
          buildId={buildId}
          organizationId={organizationId}
          row={row}
        />
        <CollaborationCommentPin
          buildId={buildId}
          organizationId={organizationId}
          postId={postId}
          row={row}
        />
        {canViewHistory ? (
          <button
            className="mt-1 ml-3 text-muted-foreground text-xs hover:text-foreground"
            onClick={editComment}
            type="button"
          >
            {row.comment.viewerIsAuthor && row.comment.contentState === "active"
              ? "Edit"
              : "History"}
          </button>
        ) : null}
        {row.comment.viewerCanModerate ||
        row.comment.viewerCanAppeal ||
        row.comment.viewerCanResolveAppeal ? (
          <button
            className="mt-1 ml-3 text-muted-foreground text-xs hover:text-foreground"
            onClick={() =>
              onModerate({
                entityId: row.comment._id,
                entityKind: "comment",
                expectedRevision: row.comment.revision,
              })
            }
            type="button"
          >
            {moderationActionLabel(row.comment)}
          </button>
        ) : null}
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
  organizationId,
  row,
}: {
  buildId: Id<"activeBuilds">;
  organizationId: string;
  row: CollaborationCommentRow;
}) {
  const reactToComment = useBuildCollaborationMutation(
    api.build_collaboration_threads.reactToBuildCollaborationComment
  );
  if (row.comment.contentState !== "active") {
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
    <fieldset className="mt-1 inline-flex flex-wrap gap-1">
      <legend className="sr-only">Reply reactions</legend>
      {(["acknowledged", "agree", "question"] as const).map((reaction) => (
        <button
          className="rounded px-1.5 py-0.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
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
          type="button"
        >
          {reactionLabel(reaction)}
          {(reactionCounts.get(reaction) ?? 0) > 0
            ? ` ${reactionCounts.get(reaction)}`
            : ""}
        </button>
      ))}
    </fieldset>
  );
}

function CollaborationCommentPin({
  buildId,
  organizationId,
  postId,
  row,
}: {
  buildId: Id<"activeBuilds">;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
  row: CollaborationCommentRow;
}) {
  const togglePin = useBuildCollaborationMutation(
    api.build_collaboration_threads.toggleBuildCollaborationPin
  );
  if (!row.comment.viewerCanPin) {
    return null;
  }
  return (
    <button
      aria-pressed={row.comment.viewerPinned}
      className="mt-1 ml-3 text-muted-foreground text-xs hover:text-foreground"
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
      type="button"
    >
      {row.comment.viewerPinned ? "Unpin reply" : "Pin reply"}
    </button>
  );
}

function CollaborationDiscussion({
  acceptedCommentId,
  buildId,
  focusedAssetId,
  focusedCommentId,
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
              onEdit={onEditComment}
              onFocusReference={onFocusReference}
              onModerate={onModerateComment}
              onReplaceAsset={onReplaceAsset}
              onReply={setReplyingTo}
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
      {replyingTo ? (
        <p className="text-muted-foreground text-xs">
          Replying to{" "}
          {replyingToRow?.comment.authorDisplayNameSnapshot ??
            "an unavailable reply"}
          .{" "}
          <button
            className="underline"
            onClick={() => {
              const priorReply = replyingTo;
              setReplyingTo(undefined);
              restoreReplyFocus(priorReply);
            }}
            type="button"
          >
            Cancel
          </button>
        </p>
      ) : null}
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
            {replyFiles.length} file{replyFiles.length === 1 ? "" : "s"} will be
            scanned before the reply is published.
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["acknowledged", "agree", "question"] as const).map((reaction) => (
            <Button
              key={reaction}
              onClick={() =>
                react({
                  buildId,
                  organizationId,
                  postId,
                  reaction,
                })
              }
              size="xs"
              type="button"
              variant="ghost"
            >
              {reactionLabel(reaction)}
            </Button>
          ))}
        </div>
        <Button
          disabled={submittingReply}
          onClick={submitReply}
          size="sm"
          type="button"
        >
          <Send aria-hidden="true" className="size-4" />
          Reply
        </Button>
      </div>
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

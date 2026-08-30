"use client";

import type { JSONContent } from "@tiptap/react";
import type React from "react";
import { useEffect, } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildDetailTarget,
} from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import type { DrawWorkflowCapabilities } from "../draw-workflow/drawWorkflow.ts";
import {
  type BuildActionItemSheetTarget,
} from "./BuildActionItemDetailSheet.tsx";
import {
  type BuildCollaborationEditingEntity,
} from "./BuildCollaborationEditSheet.tsx";
import "./build-collaboration.css";
import {
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type CollaborationActionItemQueueRow,
  type CollaborationDraftBundle,
  type FeedFilter,
  type FocusedReference,
  type RawCollaborationTagOption,
  type ReferenceOption,
  toCollaborationTagOption,
} from "./model.ts";
import { parseBuildCollaborationFocus } from "./referenceFocus.ts";

const BUILD_WORKSPACE_PATH_PATTERN =
  /(\/(?:backoffice|builder-staff|builder|contractor|homeowner)\/builds\/)[^/]+/;
export const PLACEHOLDER_VISIBLE_FEED_FILTERS = new Set<FeedFilter>([
  "active_operations",
  "all",
]);

export type CollaborationPublicationBundle = Omit<
  CollaborationDraftBundle,
  "attachmentAssetIds"
> & {
  attachmentAssetIds?: Id<"buildCollaborationAssets">[];
};

export function focusedEntityQueueArgs({
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

export function buildQueueArgs(buildId: Id<"activeBuilds">, organizationId?: string) {
  return organizationId
    ? { buildId, organizationId, scope: "build" as const }
    : ("skip" as const);
}

export function buildCollaborationScopeArgs(
  buildId: Id<"activeBuilds">,
  organizationId?: string
) {
  return organizationId ? { buildId, organizationId } : ("skip" as const);
}

export function actionItemQueueState(query: {
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
  return buildDetailTargetQueueHref(currentHref, buildId, {
    actionItemId: actionItemId as Id<"buildActionItems">,
    kind: "actionItem",
  });
}

export function buildDetailTargetQueueHref(
  currentHref: string,
  buildId: string,
  target: BuildDetailTarget
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
  if (target.kind === "submilestone") {
    url.searchParams.set("focus", `submilestone:${target.submilestoneId}`);
    url.searchParams.set("detailTab", "collaboration");
  } else if (target.kind === "draw") {
    url.searchParams.delete("detailTab");
    url.searchParams.set("tab", "details");
    url.searchParams.set("focus", `draw:${target.drawId}`);
  } else if (target.kind === "actionItem") {
    url.searchParams.delete("detailTab");
    url.searchParams.set("tab", "details");
    url.searchParams.set("focus", `actionItem:${target.actionItemId}`);
  } else {
    url.searchParams.delete("detailTab");
    url.searchParams.set("focus", `milestone:${target.milestoneId}`);
  }
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

export function buildDetailTargetSheetHref(
  currentHref: string,
  target: BuildDetailTarget,
  context?: Pick<BuildDetailTargetContext, "selectedTab">
) {
  const url = new URL(currentHref, "http://localhost");
  if (target.kind === "submilestone") {
    url.searchParams.set("focus", `submilestone:${target.submilestoneId}`);
    url.searchParams.set("detailTab", context?.selectedTab ?? "collaboration");
  } else if (target.kind === "draw") {
    url.searchParams.set("tab", "details");
    url.searchParams.set("focus", `draw:${target.drawId}`);
  } else if (target.kind === "actionItem") {
    url.searchParams.set("tab", "details");
    url.searchParams.set("focus", `actionItem:${target.actionItemId}`);
  } else {
    url.searchParams.set("focus", `milestone:${target.milestoneId}`);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function focusedActionItemIdFromReference(reference?: string) {
  return reference?.startsWith("actionItem:")
    ? reference.slice("actionItem:".length)
    : undefined;
}

export function focusedCommentIdFromReference(reference?: string) {
  return reference?.startsWith("comment:")
    ? reference.slice("comment:".length)
    : undefined;
}

export function focusedPostIdFromReference(reference?: string) {
  return reference?.startsWith("post:")
    ? reference.slice("post:".length)
    : undefined;
}

export function focusedAssetIdFromReference(reference?: string) {
  return reference?.startsWith("asset:")
    ? reference.slice("asset:".length)
    : undefined;
}

export const DIRECT_REFERENCE_FOCUS_KINDS = new Set<
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

export function focusedReferenceQueryArgs({
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

export function focusedActionItemQueryArgs({
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

export function focusedAssetQueryArgs({
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

export function visibleContextValue<T, R>(
  context: ({ state: "visible" } & T) | { state: "revoked" } | undefined,
  select: (visible: { state: "visible" } & T) => R
) {
  return context?.state === "visible" ? select(context) : undefined;
}

export function focusedCommentQueryArgs({
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

export function focusedPostQueryArgs({
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

export function moderationActionLabel(input: {
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

export interface CollaborationEditTarget {
  canEdit: boolean;
  document: JSONContent;
  entity: BuildCollaborationEditingEntity;
  references: CollaborationTagReference[];
  revision: number;
}

export function useFocusedEntityTarget(input: {
  detailTargetManaged: boolean;
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
    if (input.detailTargetManaged) {
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
    input.detailTargetManaged,
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

export function directFocusedReference(
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

export function actionItemFocusedAssetId(input: {
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

export function focusCollaborationReference(input: {
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

export interface BuildCollaborationFeedProps {
  buildId: string;
  detailCanGoBack?: boolean;
  detailCanGoForward?: boolean;
  detailResolutionState?:
    | "idle"
    | "integrity_error"
    | "loading"
    | "revoked"
    | "visible";
  drawCapabilities?: DrawWorkflowCapabilities;
  focusedReference?: string;
  onCloseDetailTarget?: () => void;
  onDetailGoBack?: () => void;
  onDetailGoForward?: () => void;
  onOpenReference?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  organizationId?: string;
  resolvedDetailTarget?: BuildDetailTarget;
}

export const ACTION_ITEM_VIEW_STORAGE_KEY =
  "drawflow:build-collaboration:action-item-view";

export function readActionItemViewPreference(): "board" | "list" {
  try {
    return window.localStorage.getItem(ACTION_ITEM_VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "board";
  } catch {
    return "board";
  }
}

export function toLocalDateTimeInput(timestamp: number) {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function minimumScheduledPublicationTimestamp(now: number) {
  const backendThreshold = now + 60_000;
  return Math.ceil((backendThreshold + 1) / 60_000) * 60_000;
}

export async function ensureComposerDraftId(input: {
  activeBuildId: Id<"activeBuilds">;
  bundle: CollaborationPublicationBundle;
  editingHumanDraftId: Id<"buildCollaborationDrafts"> | null;
  editingHumanDraftRevision: number | null;
  offlineCapturedAt: number | null;
  organizationId: string;
  saveDraft: (
    args: CollaborationPublicationBundle & {
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

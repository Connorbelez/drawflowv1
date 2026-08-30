"use client";

import {
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildDetailTarget,
  parseBuildDetailFocus,
} from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import {
  type BuildActionItemSheetTarget,
} from "./BuildActionItemDetailSheet.tsx";
import {
  type BuildCollaborationSearchResult,
} from "./BuildCollaborationSearch.tsx";
import "./build-collaboration.css";
import {
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type CollaborationFeedEntry,
  type CollaborationFeedPostEntry,
  type FeedFilter,
  type FocusedReference,
  type ReferenceOption,
  toCollaborationTagOption,
} from "./model.ts";
import {
  actionItemFocusedAssetId,
  actionItemQueueState,
  buildCollaborationScopeArgs,
  buildDetailTargetSheetHref,
  buildQueueArgs,
  directFocusedReference,
  focusedActionItemIdFromReference,
  focusedActionItemQueryArgs,
  focusedAssetIdFromReference,
  focusedAssetQueryArgs,
  focusedCommentIdFromReference,
  focusedCommentQueryArgs,
  focusedEntityQueueArgs,
  focusedPostIdFromReference,
  focusedPostQueryArgs,
  focusedReferenceQueryArgs,
  focusCollaborationReference,
  type BuildCollaborationFeedProps,
  PLACEHOLDER_VISIBLE_FEED_FILTERS,
  useFocusedEntityTarget,
  visibleContextValue,
} from "./build-collaboration-feed-contracts.ts";
import {
  focusedCommentCollaborationResults,
  focusedPostCollaborationResults,
  mergeFocusedPostEntry,
  searchResultReference,
} from "./build-collaboration-feed-focus.tsx";
import { BuildCollaborationSurface } from "./build-collaboration-feed-surface.tsx";
import { useBuildCollaborationComposer } from "./build-collaboration-feed-composer.tsx";

export function BuildCollaborationFeedContent({
  buildId,
  collaborationState,
  connectionOnline,
  detailCanGoBack,
  detailCanGoForward,
  detailResolutionState,
  drawCapabilities,
  focusedReference: focusedEntityReference,
  isOnline,
  organizationId,
  onCloseDetailTarget,
  onDetailGoBack,
  onDetailGoForward,
  onOpenReference,
  resolvedDetailTarget,
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
    organizationId
  );
  const feed = usePaginatedQuery(
    api.build_collaboration.listBuildCollaborationFeed,
    feedScopeArgs === "skip"
      ? "skip"
      : {
          ...feedScopeArgs,
          filter: filter === "active_operations" ? "active_operations" : "all",
        },
    { initialNumItems: 20 }
  );
  const viewerBinding = useQuery(
    api.build_collaboration_viewer.getBuildCollaborationViewerBinding,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const viewerRole = viewerBinding?.role;
  const viewerRoles = viewerBinding?.roles ?? (viewerRole ? [viewerRole] : []);
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
  const [focusedReference, setFocusedReference] =
    useState<FocusedReference | null>(null);
  const [actionItemSheetTarget, setActionItemSheetTarget] =
    useState<BuildActionItemSheetTarget | null>(null);
  const renderedActionItemSheetTarget =
    actionItemSheetTarget?.kind === "create" ||
    detailResolutionState === undefined ||
    resolvedDetailTarget?.kind === "actionItem"
      ? actionItemSheetTarget
      : null;
  useEffect(() => {
    if (detailResolutionState === undefined) {
      return;
    }
    const detailFocus = parseBuildDetailFocus(focusedEntityReference);
    if (
      !focusedEntityReference ||
      (detailFocus &&
        (detailResolutionState !== "visible" ||
          resolvedDetailTarget?.kind !== "actionItem"))
    ) {
      setActionItemSheetTarget(null);
    }
  }, [
    detailResolutionState,
    focusedEntityReference,
    resolvedDetailTarget?.kind,
  ]);
  const openDetailTarget = (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => {
    if (target.kind === "submilestone") {
      setActionItemSheetTarget(null);
      const href = buildDetailTargetSheetHref(
        window.location.href,
        target,
        context
      );
      if (!onOpenReference) {
        window.history.replaceState(window.history.state, "", href);
        return;
      }
      onOpenReference({
        entityId: target.submilestoneId,
        entityKind: "submilestone",
        href,
      });
      return;
    }
    if (target.kind === "draw") {
      setActionItemSheetTarget(null);
      const href = buildDetailTargetSheetHref(
        window.location.href,
        target,
        context
      );
      if (!onOpenReference) {
        window.history.replaceState(window.history.state, "", href);
        return;
      }
      onOpenReference({
        entityId: String(target.drawId),
        entityKind: "draw",
        href,
      });
      return;
    }
    if (target.kind !== "actionItem") {
      return;
    }
    const actionItemId = target.actionItemId;
    setActionItemSheetTarget({ actionItemId, kind: "detail" });
    const href = buildDetailTargetSheetHref(
      window.location.href,
      target,
      context
    );
    onOpenReference?.({
      entityId: actionItemId,
      entityKind: "actionItem",
      href,
    });
  };
  const closeActionItemSheet = () => {
    setActionItemSheetTarget(null);
    onCloseDetailTarget?.();
  };
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
    resolvedDetailTarget?.kind === "actionItem"
      ? resolvedDetailTarget.actionItemId
      : (focusedAssetActionItemId ??
        (detailResolutionState === undefined
          ? focusedActionItemContext?.actionItemId
          : undefined));
  useFocusedEntityTarget({
    detailTargetManaged:
      detailResolutionState !== undefined &&
      Boolean(parseBuildDetailFocus(focusedEntityReference)),
    directlyFocusedReference,
    focusedActionItemId: focusedDetailActionItemId,
    focusedEntityReference,
    focusedReferenceState: focusedReferenceContext?.state,
    referenceByKey,
    setActionItemSheetTarget,
    setFocusedReference,
  });
  const focusReference = (reference: FocusedReference) => {
    if (reference.kind === "submilestone" && onOpenReference) {
      onOpenReference({
        entityId: reference.id,
        entityKind: reference.kind,
        href: reference.href,
      });
      return;
    }
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
      openDetailTarget({
        actionItemId: option.id as Id<"buildActionItems">,
        kind: "actionItem",
      });
      return;
    }
    if (onOpenReference) {
      onOpenReference({
        entityId: option.id,
        entityKind: option.entityKind,
        href: option.href,
      });
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

  const {
    actionTitle,
    acknowledgementRequired,
    attachmentAssetIds,
    audienceMode,
    autosaveStatus,
    composerAssets,
    composerExtraCount,
    composerFiles,
    composerExtrasOpen,
    composerOpen,
    document,
    discardDraft,
    draftConflictMessage,
    drafts,
    editingHumanDraftId,
    html,
    latestEditingDraft,
    latestEditingDraftBundle,
    loadDraftIntoComposer,
    loadOfflineDraftIntoComposer,
    offlineDraft,
    postType,
    prepareScheduledPublication,
    publishComposerPost,
    publishDraft,
    publishing,
    removeComposerAttachment,
    requestedReaderIds,
    resetComposer,
    reviewingDraftId,
    saveCurrentDraft,
    scheduleDraft,
    schedulingCapabilities,
    scheduledForInput,
    setAcknowledgementRequired,
    setActionTitle,
    setAudienceMode,
    setComposerExtrasOpen,
    setComposerFiles,
    setComposerOpen,
    setDocument,
    setHtml,
    setPostType,
    setPublishing,
    setReferences,
    setRequestedReaderIds,
    setReviewingDraftId,
    setScheduledForInput,
  } = useBuildCollaborationComposer({
    activeBuildId,
    isOnline,
    organizationId,
    referenceByKey,
    sessionWorkosUserId,
  });

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
    <BuildCollaborationSurface
      activeBuildId={activeBuildId}
      actionItemFocusedAssetId={actionItemFocusedAssetId}
      actionTitle={actionTitle}
      acknowledgementRequired={acknowledgementRequired}
      attachmentAssetIds={attachmentAssetIds}
      autosaveStatus={autosaveStatus}
      audienceMode={audienceMode}
      buildQueue={buildQueue}
      canCustomizeAudience={canCustomizeAudience}
      canPublishAnnouncements={canPublishAnnouncements}
      closeActionItemSheet={closeActionItemSheet}
      collaborationState={collaborationState}
      commentFocusedPostEntry={commentFocusedPostEntry}
      composerAssets={composerAssets}
      composerExtraCount={composerExtraCount}
      composerExtrasOpen={composerExtrasOpen}
      composerFiles={composerFiles}
      composerOpen={composerOpen}
      connectionOnline={connectionOnline}
      detailCanGoBack={detailCanGoBack}
      detailCanGoForward={detailCanGoForward}
      discardDraft={discardDraft}
      document={document}
      draftConflictMessage={draftConflictMessage}
      displayedResults={displayedResults}
      drawCapabilities={drawCapabilities}
      drafts={drafts}
      editingHumanDraftId={editingHumanDraftId}
      entityQueue={entityQueue}
      feed={feed}
      feedEntries={feedEntries}
      filter={filter}
      focusedAssetActionItemId={focusedAssetActionItemId}
      focusedAssetContext={focusedAssetContext}
      focusedAssetId={focusedAssetId}
      focusedCommentContext={focusedCommentContext}
      focusedCommentId={focusedCommentId}
      focusedEntityReference={focusedEntityReference}
      focusedPostContext={focusedPostContext}
      focusedPostId={focusedPostId}
      focusedReference={focusedReference}
      focusReference={focusReference}
      html={html}
      isOnline={isOnline}
      latestEditingDraft={latestEditingDraft}
      latestEditingDraftBundle={latestEditingDraftBundle}
      loadDraftIntoComposer={loadDraftIntoComposer}
      loadOfflineDraftIntoComposer={loadOfflineDraftIntoComposer}
      offlineDraft={offlineDraft}
      openActionItemSheetReference={openActionItemSheetReference}
      openDetailTarget={openDetailTarget}
      openSearchResult={openSearchResult}
      onDetailGoBack={onDetailGoBack}
      onDetailGoForward={onDetailGoForward}
      onOpenReference={onOpenReference}
      organizationId={organizationId}
      participants={participants}
      personalQueue={personalQueue}
      postType={postType}
      prepareScheduledPublication={prepareScheduledPublication}
      publishComposerPost={publishComposerPost}
      publishDraft={publishDraft}
      publishing={publishing}
      referenceByKey={referenceByKey}
      renderedActionItemSheetTarget={renderedActionItemSheetTarget}
      removeComposerAttachment={removeComposerAttachment}
      requestedReaderIds={requestedReaderIds}
      resetComposer={resetComposer}
      reviewingDraftId={reviewingDraftId}
      saveCurrentDraft={saveCurrentDraft}
      scheduleDraft={scheduleDraft}
      schedulingCapabilities={schedulingCapabilities}
      setAcknowledgementRequired={setAcknowledgementRequired}
      setActionItemSheetTarget={setActionItemSheetTarget}
      setActionTitle={setActionTitle}
      setAudienceMode={setAudienceMode}
      setComposerExtrasOpen={setComposerExtrasOpen}
      setComposerFiles={setComposerFiles}
      setComposerOpen={setComposerOpen}
      setDocument={setDocument}
      setFilter={setFilter}
      setHtml={setHtml}
      setPostType={setPostType}
      setPublishing={setPublishing}
      setReferences={setReferences}
      setRequestedReaderIds={setRequestedReaderIds}
      setReviewingDraftId={setReviewingDraftId}
      setScheduledForInput={setScheduledForInput}
      setFocusedReference={setFocusedReference}
      scheduledForInput={scheduledForInput}
      tagOptions={tagOptions}
      viewerRole={viewerRole}
      viewerRoles={viewerRoles}
      visibleResults={visibleResults}
    />
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
    <Frame className="build-collaboration-frame rounded-none bg-transparent p-0">
      <section
        {...collaborationSurfaceAttributes}
        className="build-collaboration-layout"
      >
        {collaborationSurfaceContent}
      </section>
    </Frame>
  );
}

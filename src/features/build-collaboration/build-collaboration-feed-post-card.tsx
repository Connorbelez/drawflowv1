"use client";

import {
  Flag,
  List,
  MessageCircle,
  SquareKanban,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardFooter,
  CardPanel,
} from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildDetailTarget,
} from "../build-detail-targets/buildDetailTarget.ts";
import type { DrawWorkflowCapabilities } from "../draw-workflow/drawWorkflow.ts";
import {
  BuildCollaborationActionItems,
} from "./BuildCollaborationActionItems.tsx";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  BuildCollaborationEditSheet,
} from "./BuildCollaborationEditSheet.tsx";
import {
  type BuildCollaborationModerationEntity,
  BuildCollaborationModerationSheet,
} from "./BuildCollaborationModerationSheet.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";
import {
  BuildCollaborationReferenceChip,
} from "./BuildCollaborationReference.tsx";
import { BuildCollaborationThreadSheet } from "./BuildCollaborationThreadSheet.tsx";
import "./build-collaboration.css";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextPreview,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type CollaborationFeedPostEntry,
  emptyDocument,
  type FocusedReference,
  isCanonicalMilestoneItem,
  parseDocument,
  type ReferenceOption,
  roleLabel,
  toEditorReferenceKind,
} from "./model.ts";
import {
  SystemPostExperience,
  systemPostTitle,
} from "./SystemPostExperience.tsx";
import {
  ACTION_ITEM_VIEW_STORAGE_KEY,
  type CollaborationEditTarget,
  readActionItemViewPreference,
} from "./build-collaboration-feed-contracts.ts";
import {
  collaborationReferencesForEditor,
  focusedPostCardPresentation,
  useFocusedCollaborationPostCard,
} from "./build-collaboration-feed-focus.tsx";
import {
  CollaborationPostFooter,
  CollaborationPostHeader,
  ThreadOutcomeSummary,
} from "./build-collaboration-feed-post-parts.tsx";
import { CollaborationDiscussion } from "./build-collaboration-feed-comments.tsx";

export function CollaborationPostCard({
  buildId,
  drawCapabilities,
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
  viewerRole,
  viewerRoles,
}: {
  buildId: Id<"activeBuilds">;
  drawCapabilities?: DrawWorkflowCapabilities;
  entry: CollaborationFeedPostEntry;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  focusedCommentId?: Id<"buildCollaborationComments">;
  focusedPost: boolean;
  focusedReference?: string;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onFocusReference: (reference: FocusedReference) => void;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  organizationId: string;
  referenceByKey: Map<string, ReferenceOption>;
  tagOptions: ReferenceOption[];
  viewerRole?: string;
  viewerRoles?: string[];
}) {
  const cardRef = useRef<HTMLDivElement>(null);
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
  const [resolvedSystemPostExpanded, setResolvedSystemPostExpanded] =
    useState(false);
  const systemEntityTitle = systemPostTitle(entry);
  const isResolvedSystemPost = entry.post.systemPost?.lifecycle === "resolved";
  const resolvedSystemPostContentId = `resolved-system-post-content-${entry.post._id}`;
  const resolvedSystemPostCollapsed =
    isResolvedSystemPost && !resolvedSystemPostExpanded;
  const drawCoordinationVisible =
    entry.post.systemPost?.kind !== "draw" ||
    entry.post.systemPost.drawCoordination?.eligible === true;
  const isDrawSystemPost = entry.post.systemPost?.kind === "draw";
  const visibleActionItems = isDrawSystemPost
    ? entry.actionItems.filter((item) => !isCanonicalMilestoneItem(item))
    : entry.actionItems;
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
    if (
      isResolvedSystemPost &&
      (focusedAssetId || focusedCommentId || focusedReference)
    ) {
      setResolvedSystemPostExpanded(true);
    }
  }, [
    focusedAssetId,
    focusedCommentId,
    focusedReference,
    isResolvedSystemPost,
  ]);

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
        collapseControl={
          isResolvedSystemPost
            ? {
                contentId: resolvedSystemPostContentId,
                expanded: resolvedSystemPostExpanded,
                label: systemEntityTitle ?? "System post",
                onToggle: () =>
                  setResolvedSystemPostExpanded((expanded) => !expanded),
              }
            : undefined
        }
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
      {resolvedSystemPostCollapsed ? null : (
        <>
          <CardPanel
            className="space-y-3 px-4 pb-4"
            id={isResolvedSystemPost ? resolvedSystemPostContentId : undefined}
          >
            {entry.post.systemPost ? (
              <SystemPostExperience
                drawCapabilities={drawCapabilities}
                entry={entry}
                onOpenActionItem={onOpenActionItem}
                viewerRole={viewerRole}
                viewerRoles={viewerRoles}
              />
            ) : (
              <CollaborationRichTextPreview
                ariaLabel="Published Build update"
                className="border-0 bg-transparent [&_.ProseMirror]:px-0"
                onReferenceOpen={openReference}
                tagOptions={tagOptions}
                value={parseDocument(entry.revision.tiptapJson)}
              />
            )}
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
                        eyebrow:
                          option?.eyebrow ?? roleLabel(reference.entityKind),
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
            {entry.post.systemPost ? null : (
              <ThreadOutcomeSummary entry={entry} />
            )}
          </CardPanel>
          {entry.post.contentState === "active" ? (
            <>
              {drawCoordinationVisible ? (
                <div className="grid grid-cols-2 border-y">
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
                  <button
                    aria-expanded={tab === "actions"}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 text-sm",
                      tab === "actions" && "bg-primary/10 text-foreground"
                    )}
                    onClick={() =>
                      setTab((current) =>
                        current === "actions" ? null : "actions"
                      )
                    }
                    type="button"
                  >
                    <Flag aria-hidden="true" className="size-4" />
                    Action Items {visibleActionItems.length}
                  </button>
                </div>
              ) : null}
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
              ) : tab === "actions" ? (
                <CardPanel className="min-w-0 space-y-3 overflow-x-hidden p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs">
                      {isDrawSystemPost
                        ? "User-defined Action Items stay anchored to this Draw post."
                        : "Work stays anchored to this post."}
                    </p>
                    {isDrawSystemPost ? null : (
                      <div className="flex gap-1">
                        <Button
                          aria-label="Show Action Items as a list"
                          aria-pressed={actionView === "list"}
                          onClick={() => setActionView("list")}
                          size="icon-xl"
                          type="button"
                          variant={
                            actionView === "list" ? "secondary" : "ghost"
                          }
                        >
                          <List aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          aria-label="Show Action Items as a board"
                          aria-pressed={actionView === "board"}
                          onClick={() => setActionView("board")}
                          size="icon-xl"
                          type="button"
                          variant={
                            actionView === "board" ? "secondary" : "ghost"
                          }
                        >
                          <SquareKanban aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <BuildCollaborationActionItems
                    actionView={isDrawSystemPost ? "list" : actionView}
                    items={visibleActionItems}
                    mutationsAllowed={mutationsAllowed}
                    onCreate={() => onCreateActionItem(entry.post._id)}
                    onMove={async (
                      actionItemId,
                      status,
                      reason,
                      expectedRevision
                    ) => {
                      if (expectedRevision === undefined) {
                        return;
                      }
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
        </>
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

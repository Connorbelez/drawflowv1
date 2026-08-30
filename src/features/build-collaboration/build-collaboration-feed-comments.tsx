"use client";

import type { JSONContent } from "@tiptap/react";
import {
  useQuery,
} from "convex/react";
import {
  Send,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  CardPanel,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  type BuildCollaborationModerationEntity,
} from "./BuildCollaborationModerationSheet.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";
import "./build-collaboration.css";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type CollaborationCommentRow,
  emptyDocument,
  type FocusedReference,
  formatTimestamp,
  initials,
  parseDocument,
  plainTextFromDocument,
  type ReferenceOption,
  reactionLabel,
  toBackendReferenceKind,
} from "./model.ts";
import {
  type CollaborationEditTarget,
  moderationActionLabel,
} from "./build-collaboration-feed-contracts.ts";
import { collaborationReferencesForEditor } from "./build-collaboration-feed-focus.tsx";

export function CollaborationComment({
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

export function CollaborationDiscussion({
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

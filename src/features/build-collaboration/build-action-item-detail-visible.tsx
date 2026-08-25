"use client";

import type { JSONContent } from "@tiptap/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CalendarClock,
  Clock3,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  SheetDescription,
  SheetFooter,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BUILD_ACTION_ITEM_TAGS,
  type BuildActionItemTag,
} from "../../../convex/build_action_item_tags";
import { BuildDetailTargetHeader as DetailSheetHeader } from "../build-detail-targets/BuildDetailTargetHeader.tsx";
import {
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
  useBuildCollaborationReadMutation,
} from "./BuildCollaborationMutationGate.tsx";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  emptyDocument,
  parseDocument,
  plainTextFromDocument,
  toBackendReferenceKind,
  toEditorReferenceKind,
} from "./model.ts";
import {
  actionItemAge,
  dateInputValue,
  formatCompactDate,
  statusLabel,
} from "./build-action-item-detail-helpers.ts";
import {
  ActionItemCommentCard,
  TagTaxonomyPicker,
} from "./build-action-item-detail-comments.tsx";
import {
  ActionItemStructurePanel,
} from "./build-action-item-detail-structure.tsx";
import {
  ActivityHistory,
  AudienceInheritanceNotice,
  Field,
  PrioritySelect,
  ReadOnlyField,
  RevisionHistory,
} from "./build-action-item-detail-history.tsx";
import { ActionItemWorkflowPanel } from "./build-action-item-detail-workflow.tsx";
import { DetailContext } from "./build-action-item-detail-workflow.tsx";

export type BuildActionItemDetail = FunctionReturnType<
  typeof api.build_action_item_details.getBuildActionItemDetail
>;
export type VisibleBuildActionItemDetail = Extract<
  BuildActionItemDetail,
  { state: "visible" }
>;
type ActionItemDetail = BuildActionItemDetail;
type VisibleActionItemDetail = VisibleBuildActionItemDetail;
type ActionPriority = VisibleActionItemDetail["item"]["priority"];
type ActionWorkKind = VisibleActionItemDetail["item"]["workKind"];
type ActionStatus = VisibleActionItemDetail["item"]["status"];
type WorkflowContext = FunctionReturnType<
  typeof api.build_action_item_workflow.getBuildActionItemWorkflowContext
>;
type VisibleWorkflowContext = Extract<WorkflowContext, { state: "visible" }>;
type StructureContext = FunctionReturnType<
  typeof api.build_action_item_structure.getBuildActionItemStructureContext
>;
type VisibleStructureContext = Extract<StructureContext, { state: "visible" }>;

export type BuildActionItemSheetTarget =
  | {
      actionItemId: Id<"buildActionItems">;
      kind: "detail";
    }
  | {
      kind: "create";
      postId: Id<"buildCollaborationPosts">;
    };

export interface BuildActionItemStructureCapabilities {
  addChecklist?: boolean;
  createChild?: boolean;
  linkRelation?: boolean;
  repairRelation?: boolean;
  toggleChecklist?: boolean;
  unlinkRelation?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The detail sheet intentionally coordinates one live Action Item transaction surface so permissions and revision state never split across parallel editors.
export function VisibleActionItemDetail({
  buildId,
  canGoBack,
  canGoForward,
  detail,
  focusedAssetId,
  onOpenChange,
  onGoBack,
  onGoForward,
  onReferenceOpen,
  organizationId,
  readOnly,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  canGoBack: boolean;
  canGoForward: boolean;
  detail: VisibleActionItemDetail;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onOpenChange: (open: boolean) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  readOnly: boolean;
  tagOptions: CollaborationTagOption[];
}) {
  const updateActionItem = useBuildCollaborationMutation(
    api.build_action_items.updateBuildActionItem
  );
  const addComment = useBuildCollaborationMutation(
    api.build_action_item_details.addBuildActionItemComment
  );
  const toggleCommentReaction = useBuildCollaborationMutation(
    api.build_action_item_details.toggleBuildActionItemCommentReaction
  );
  const markActivityRead = useBuildCollaborationReadMutation(
    api.build_collaboration_inbox.markBuildActionItemActivityRead
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
  const assignActionItem = useBuildCollaborationMutation(
    api.build_action_item_workflow.assignBuildActionItem
  );
  const acceptAssignment = useBuildCollaborationMutation(
    api.build_action_item_workflow.acceptBuildActionItemAssignment
  );
  const transitionActionItem = useBuildCollaborationMutation(
    api.build_action_item_workflow.transitionBuildActionItem
  );
  const workflow = useQuery(
    api.build_action_item_workflow.getBuildActionItemWorkflowContext,
    {
      actionItemId: detail.item.actionItemId,
      buildId,
      organizationId,
    }
  ) as WorkflowContext | undefined;
  const [title, setTitle] = useState(detail.item.title);
  const [priority, setPriority] = useState(detail.item.priority);
  const [dueDate, setDueDate] = useState(dateInputValue(detail.item.dueAt));
  const [labels, setLabels] = useState<BuildActionItemTag[]>(
    detail.labels.filter((label): label is BuildActionItemTag =>
      BUILD_ACTION_ITEM_TAGS.includes(label as BuildActionItemTag)
    )
  );
  const [briefDocument, setBriefDocument] = useState<JSONContent>(() =>
    parseDocument(detail.item.descriptionTiptapJson)
  );
  const [briefReferences, setBriefReferences] = useState<
    CollaborationTagReference[]
  >(() =>
    detail.references
      .map((reference) =>
        tagOptions.find(
          (option) =>
            option.id === reference.entityId &&
            option.kind === toEditorReferenceKind(reference.entityKind)
        )
      )
      .filter((option): option is CollaborationTagOption => Boolean(option))
  );
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefSaveState, setBriefSaveState] = useState<
    "idle" | "saving" | "saved" | "conflict"
  >("idle");
  const [definitionReason, setDefinitionReason] = useState("");
  const [commentHtml, setCommentHtml] = useState("");
  const [commentDocument, setCommentDocument] = useState<JSONContent>(
    emptyDocument()
  );
  const [commentReferences, setCommentReferences] = useState<
    CollaborationTagReference[]
  >([]);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [replyingTo, setReplyingTo] = useState<
    Id<"buildActionItemComments"> | undefined
  >();
  const [saving, setSaving] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [transitionReason, setTransitionReason] = useState("");

  const replaceAsset = async (
    asset: BuildCollaborationAssetSummary,
    file: File
  ) => {
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets([file], {
        abandonAssets: abandonReplacementAssets,
        beginUpload: beginReplacementUpload,
        buildId,
        contextKind: "post",
        contextRecordId: detail.item.originatingPostId,
        finalizeAndScan: finalizeAndScanReplacement,
        organizationId,
        registerUpload: registerReplacementUpload,
        supersedesAssetId: asset.assetId,
      });
      const plainText = `Replaced ${asset.fileName} v${asset.version} with ${file.name} v${asset.version + 1} for ${detail.item.title}.`;
      await addReplacementComment({
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        organizationId,
        plainText,
        postId: detail.item.originatingPostId,
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
      toast.success("Attachment replacement published to the parent thread.");
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets: abandonReplacementAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Action Item attachment replacement failed.",
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to publish the attachment replacement."
      );
    }
  };

  useEffect(() => {
    setTitle(detail.item.title);
    setPriority(detail.item.priority);
    setDueDate(dateInputValue(detail.item.dueAt));
    setLabels(
      detail.labels.filter((label): label is BuildActionItemTag =>
        BUILD_ACTION_ITEM_TAGS.includes(label as BuildActionItemTag)
      )
    );
  }, [
    detail.item.dueAt,
    detail.item.priority,
    detail.item.title,
    detail.labels,
  ]);

  useEffect(() => {
    markActivityRead({
      actionItemId: detail.item.actionItemId,
      buildId,
      organizationId,
    }).catch(() => undefined);
  }, [buildId, detail.item.actionItemId, markActivityRead, organizationId]);

  useEffect(() => {
    if (
      !briefDirty ||
      readOnly ||
      workflow?.state !== "visible" ||
      !workflow.viewerCanEditFields ||
      (workflow.viewerRequiresEditReason && !definitionReason.trim())
    ) {
      return;
    }
    const timeoutId = window.setTimeout(async () => {
      setBriefSaveState("saving");
      try {
        await updateActionItem({
          actionItemId: detail.item.actionItemId,
          buildId,
          descriptionPlainText: plainTextFromDocument(briefDocument),
          descriptionTiptapJson: JSON.stringify(briefDocument),
          expectedRevision: detail.item.currentRevision,
          organizationId,
          reason: definitionReason.trim() || undefined,
          references: briefReferences.map((reference, index) => ({
            entityId: reference.id,
            entityKind: toBackendReferenceKind(reference.kind),
            label: reference.label,
            primary: index === 0,
            summary: reference.summary,
          })),
        });
        setBriefDirty(false);
        setBriefSaveState("saved");
      } catch (error) {
        setBriefSaveState("conflict");
        toast.error(
          error instanceof Error ? error.message : "Unable to save the brief."
        );
      }
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    briefDirty,
    briefDocument,
    briefReferences,
    buildId,
    definitionReason,
    detail.item.actionItemId,
    detail.item.currentRevision,
    organizationId,
    readOnly,
    updateActionItem,
    workflow,
  ]);

  const save = async () => {
    if (detail.item.workKind !== "ordinary" && !dueDate) {
      toast.error("Governed Action Items require a due date.");
      return;
    }
    setSaving(true);
    try {
      await updateActionItem({
        actionItemId: detail.item.actionItemId,
        buildId,
        dueAt: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : null,
        expectedRevision: detail.item.currentRevision,
        labels,
        organizationId,
        priority,
        reason: definitionReason.trim() || undefined,
        title,
      });
      toast.success("Action Item updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update Action Item."
      );
    } finally {
      setSaving(false);
    }
  };
  const comment = async () => {
    if (!(plainTextFromDocument(commentDocument) || commentFiles.length)) {
      return;
    }
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(commentFiles, {
        abandonAssets: abandonReplacementAssets,
        beginUpload: beginReplacementUpload,
        buildId,
        contextKind: "actionItem",
        contextRecordId: detail.item.actionItemId,
        finalizeAndScan: finalizeAndScanReplacement,
        organizationId,
        registerUpload: registerReplacementUpload,
      });
      await addComment({
        actionItemId: detail.item.actionItemId,
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        organizationId,
        parentCommentId: replyingTo,
        references: commentReferences.map((reference, index) => ({
          entityId: reference.id,
          entityKind: toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        tiptapJson: JSON.stringify(commentDocument),
      });
      setCommentDocument(emptyDocument());
      setCommentHtml("");
      setCommentReferences([]);
      setCommentFiles([]);
      setReplyingTo(undefined);
      toast.success(replyingTo ? "Reply added." : "Comment added.");
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets: abandonReplacementAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Action Item comment failed after asset upload.",
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to add comment."
      );
    }
  };
  const assign = async (workosUserId: string | null) => {
    setWorkflowBusy(true);
    try {
      await assignActionItem({
        actionItemId: detail.item.actionItemId,
        assigneeWorkosUserId: workosUserId,
        buildId,
        expectedRevision: detail.item.currentRevision,
        organizationId,
      });
      toast.success(
        workosUserId
          ? "Action Item assignment updated."
          : "Action Item unassigned."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update assignment."
      );
    } finally {
      setWorkflowBusy(false);
    }
  };
  const accept = async () => {
    setWorkflowBusy(true);
    try {
      await acceptAssignment({
        actionItemId: detail.item.actionItemId,
        buildId,
        expectedRevision: detail.item.currentRevision,
        organizationId,
      });
      toast.success("Assignment accepted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to accept assignment."
      );
    } finally {
      setWorkflowBusy(false);
    }
  };
  const transition = async (nextStatus: ActionStatus) => {
    setWorkflowBusy(true);
    try {
      await transitionActionItem({
        actionItemId: detail.item.actionItemId,
        buildId,
        expectedRevision: detail.item.currentRevision,
        nextStatus,
        organizationId,
        reason: transitionReason.trim() || undefined,
      });
      setTransitionReason("");
      toast.success("Action Item status updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update status."
      );
    } finally {
      setWorkflowBusy(false);
    }
  };

  return (
    <>
      <DetailSheetHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={() => onOpenChange(false)}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{statusLabel(detail.item.status)}</Badge>
          {detail.labels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
        </div>
        <SheetTitle>{detail.item.title}</SheetTitle>
        <SheetDescription>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5" />
              {detail.item.assigneeDisplayName ?? "Unassigned"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {actionItemAge(detail.item.createdAt)}
            </span>
            {detail.item.dueAt ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                Due {formatCompactDate(detail.item.dueAt)}
              </span>
            ) : null}
          </span>
        </SheetDescription>
        {detail.item.status === "blocked" && detail.item.blockedReason ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-destructive text-xs">
            Blocked: {detail.item.blockedReason}
          </p>
        ) : null}
      </DetailSheetHeader>
      <SheetPanel className="space-y-6">
        <AudienceInheritanceNotice audienceMode={detail.item.audienceMode} />
        {readOnly ? (
          <Frame>
            <FramePanel className="text-muted-foreground text-sm">
              This archived Action Item is available to read; assignment and
              status changes are disabled.
            </FramePanel>
          </Frame>
        ) : (
          <ActionItemWorkflowPanel
            busy={workflowBusy}
            detail={detail}
            onAccept={accept}
            onAssign={assign}
            onReasonChange={setTransitionReason}
            onTransition={transition}
            reason={transitionReason}
            workflow={workflow}
          />
        )}
        <section className="space-y-3">
          <h3 className="font-semibold text-base leading-snug">
            Work definition
          </h3>
          {!readOnly &&
          workflow?.state === "visible" &&
          workflow.viewerCanEditFields !== false ? (
            <>
              <Field label="Title">
                <Input
                  aria-label="Edit Action Item title"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Priority">
                  <PrioritySelect onChange={setPriority} value={priority} />
                </Field>
                <Field label="Due date">
                  <Input
                    aria-label="Edit Action Item due date"
                    nativeInput
                    onChange={(event) => setDueDate(event.target.value)}
                    type="date"
                    value={dueDate}
                  />
                </Field>
              </div>
            </>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <ReadOnlyField label="Title" value={detail.item.title} />
              <ReadOnlyField label="Priority" value={detail.item.priority} />
              <ReadOnlyField
                label="Due date"
                value={
                  detail.item.dueAt
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(detail.item.dueAt)
                    : "Not set"
                }
              />
            </dl>
          )}
          {!readOnly &&
          workflow?.state === "visible" &&
          workflow.viewerCanEditFields ? (
            <div className="space-y-2">
              <CollaborationRichTextEditor
                ariaLabel="Action Item canonical brief"
                editorMinHeightClass="[&_.ProseMirror]:min-h-32"
                onChange={(_html, nextReferences) => {
                  setBriefReferences(nextReferences);
                  setBriefDirty(true);
                  setBriefSaveState("idle");
                }}
                onDocumentChange={(nextDocument) => {
                  setBriefDocument(nextDocument);
                  setBriefDirty(true);
                  setBriefSaveState("idle");
                }}
                placeholder="Define the canonical brief. Type @ to link people, Action Items, and files."
                tagOptions={tagOptions}
                value={briefDocument}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span
                  aria-live="polite"
                  className={
                    briefSaveState === "conflict"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {briefSaveState === "saving"
                    ? "Saving brief…"
                    : briefSaveState === "saved"
                      ? "Brief saved"
                      : briefSaveState === "conflict"
                        ? "Save conflict — your draft is preserved here."
                        : briefDirty
                          ? workflow.viewerRequiresEditReason &&
                            !definitionReason.trim()
                            ? "Add an override reason to save this manager edit."
                            : "Unsaved changes"
                          : "Canonical brief"}
                </span>
              </div>
            </div>
          ) : (
            <CollaborationRichTextPreview
              ariaLabel="Action Item description"
              onReferenceOpen={onReferenceOpen}
              tagOptions={tagOptions}
              value={parseDocument(detail.item.descriptionTiptapJson)}
            />
          )}
          {!readOnly &&
          workflow?.state === "visible" &&
          workflow.viewerCanEditFields ? (
            <TagTaxonomyPicker labels={labels} onChange={setLabels} />
          ) : null}
          {!readOnly &&
          workflow?.state === "visible" &&
          workflow.viewerRequiresEditReason ? (
            <Field label="Manager override reason">
              <Input
                aria-label="Manager task-definition override reason"
                onChange={(event) => setDefinitionReason(event.target.value)}
                placeholder="Why is this override necessary?"
                value={definitionReason}
              />
            </Field>
          ) : null}
          {!readOnly &&
          workflow?.state === "visible" &&
          workflow.viewerCanEditFields !== false ? (
            <Button disabled={saving} onClick={save} size="sm">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null}
        </section>
        <DetailContext
          buildId={buildId}
          detail={detail}
          focusedAssetId={focusedAssetId}
          onReferenceOpen={onReferenceOpen}
          onReplaceAsset={readOnly ? undefined : replaceAsset}
          organizationId={organizationId}
          tagOptions={tagOptions}
        />
        <ActionItemStructurePanel
          buildId={buildId}
          detail={detail}
          onReferenceOpen={onReferenceOpen}
          organizationId={organizationId}
          overrideReason={definitionReason}
          readOnly={readOnly}
          tagOptions={tagOptions}
        />
        <Frame className="bg-muted/60">
          <FramePanel className="space-y-4 p-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageCircle
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                  <h3 className="font-semibold text-base leading-snug">
                    Discussion
                  </h3>
                </div>
                <Badge variant="outline">{detail.comments.length}</Badge>
              </div>
              {detail.comments
                .filter((entry) => !entry.parentCommentId)
                .map((entry) => (
                  <div className="space-y-2" key={entry.commentId}>
                    <ActionItemCommentCard
                      buildId={buildId}
                      entry={entry}
                      onReact={async (reaction) => {
                        await toggleCommentReaction({
                          actionItemId: detail.item.actionItemId,
                          buildId,
                          commentId: entry.commentId,
                          organizationId,
                          reaction,
                        });
                      }}
                      onReferenceOpen={onReferenceOpen}
                      onReply={() => setReplyingTo(entry.commentId)}
                      organizationId={organizationId}
                      readOnly={readOnly}
                      tagOptions={tagOptions}
                    />
                    {detail.comments
                      .filter(
                        (reply) => reply.parentCommentId === entry.commentId
                      )
                      .map((reply) => (
                        <div
                          className="ml-5 border-l pl-3"
                          key={reply.commentId}
                        >
                          <ActionItemCommentCard
                            buildId={buildId}
                            entry={reply}
                            onReact={async (reaction) => {
                              await toggleCommentReaction({
                                actionItemId: detail.item.actionItemId,
                                buildId,
                                commentId: reply.commentId,
                                organizationId,
                                reaction,
                              });
                            }}
                            onReferenceOpen={onReferenceOpen}
                            onReply={() => setReplyingTo(entry.commentId)}
                            organizationId={organizationId}
                            readOnly={readOnly}
                            tagOptions={tagOptions}
                          />
                        </div>
                      ))}
                  </div>
                ))}
              {replyingTo ? (
                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
                  <span>Replying in thread</span>
                  <Button
                    onClick={() => setReplyingTo(undefined)}
                    size="xs"
                    variant="ghost"
                  >
                    Cancel reply
                  </Button>
                </div>
              ) : null}
              {readOnly ? null : (
                <CollaborationRichTextEditor
                  ariaLabel="Comment on Action Item"
                  editorMinHeightClass="[&_.ProseMirror]:min-h-24"
                  onChange={(nextHtml, nextReferences) => {
                    setCommentHtml(nextHtml);
                    setCommentReferences(nextReferences);
                  }}
                  onDocumentChange={setCommentDocument}
                  placeholder="Add context. Type @ to link Build work."
                  tagOptions={tagOptions}
                  value={commentHtml}
                />
              )}
              {readOnly ? null : (
                <Input
                  aria-label="Attach files to Action Item comment"
                  multiple
                  nativeInput
                  onChange={(event) =>
                    setCommentFiles(Array.from(event.target.files ?? []))
                  }
                  type="file"
                />
              )}
              {readOnly ? null : (
                <Button onClick={comment} size="sm">
                  {replyingTo ? "Add reply" : "Add comment"}
                </Button>
              )}
            </section>
          </FramePanel>
          <FramePanel className="p-4">
            <RevisionHistory detail={detail} />
          </FramePanel>
          <FramePanel className="p-4">
            <ActivityHistory detail={detail} />
          </FramePanel>
        </Frame>
      </SheetPanel>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

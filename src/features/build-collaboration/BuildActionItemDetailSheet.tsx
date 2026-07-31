"use client";

import type { JSONContent } from "@tiptap/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { History, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import { BuildCollaborationReferenceChip } from "./BuildCollaborationReference.tsx";
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
  formatTimestamp,
  parseDocument,
  plainTextFromDocument,
  toBackendReferenceKind,
  toEditorReferenceKind,
} from "./model.ts";

type ActionItemDetail = FunctionReturnType<
  typeof api.build_action_item_details.getBuildActionItemDetail
>;
type VisibleActionItemDetail = Extract<ActionItemDetail, { state: "visible" }>;
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

export function BuildActionItemDetailSheet({
  buildId,
  onCreated,
  onOpenChange,
  onReferenceOpen,
  open,
  organizationId,
  tagOptions,
  target,
}: {
  buildId: Id<"activeBuilds">;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onOpenChange: (open: boolean) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  open: boolean;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
  target: BuildActionItemSheetTarget | null;
}) {
  const actionItemId =
    target?.kind === "detail" ? target.actionItemId : undefined;
  const detail = useQuery(
    api.build_action_item_details.getBuildActionItemDetail,
    open && actionItemId ? { actionItemId, buildId, organizationId } : "skip"
  ) as ActionItemDetail | undefined;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup side="right" variant="inset">
        {target?.kind === "create" ? (
          <ActionItemCreatePanel
            buildId={buildId}
            onCreated={onCreated}
            onOpenChange={onOpenChange}
            organizationId={organizationId}
            postId={target.postId}
            tagOptions={tagOptions}
          />
        ) : (
          <ActionItemDetailPanel
            buildId={buildId}
            detail={detail}
            onOpenChange={onOpenChange}
            onReferenceOpen={onReferenceOpen}
            organizationId={organizationId}
            tagOptions={tagOptions}
          />
        )}
      </SheetPopup>
    </Sheet>
  );
}

function ActionItemCreatePanel({
  buildId,
  expectedParentRevision,
  onCreated,
  onOpenChange,
  organizationId,
  parentActionItemId,
  parentTitle,
  postId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  expectedParentRevision?: number;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  parentActionItemId?: Id<"buildActionItems">;
  parentTitle?: string;
  postId: Id<"buildCollaborationPosts">;
  tagOptions: CollaborationTagOption[];
}) {
  const createActionItem = useMutation(
    api.build_action_items.createBuildActionItem
  );
  const beginAssetUpload = useMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerAssetUpload = useMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanAsset = useAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [priority, setPriority] = useState<ActionPriority>("none");
  const [workKind, setWorkKind] = useState<ActionWorkKind>("ordinary");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [assigneeWorkosUserId, setAssigneeWorkosUserId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [requestId] = useState(() => newActionItemRequestId());
  const [submitting, setSubmitting] = useState(false);
  const participants = tagOptions.filter(
    (option) => option.kind === "participant"
  );
  const effectiveWorkKind = effectiveActionItemWorkKind(workKind, references);

  const create = async () => {
    if (!(title.trim() && plainTextFromDocument(document)) || submitting) {
      toast.error("Add a title and a useful description.");
      return;
    }
    if (effectiveWorkKind !== "ordinary" && !dueDate) {
      toast.error("Governed Action Items require a due date.");
      return;
    }
    setSubmitting(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(files, {
        abandonAssets,
        beginUpload: beginAssetUpload,
        buildId,
        contextKind: "post",
        contextRecordId: postId,
        finalizeAndScan: finalizeAndScanAsset,
        organizationId,
        registerUpload: registerAssetUpload,
      });
      const actionItemId = await createActionItem({
        assigneeWorkosUserId: assigneeWorkosUserId || undefined,
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        descriptionPlainText: plainTextFromDocument(document),
        descriptionTiptapJson: JSON.stringify(document),
        dueAt: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : undefined,
        expectedParentRevision,
        labels: labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        organizationId,
        parentActionItemId,
        postId,
        priority,
        references: references.map((reference, index) => ({
          entityId: reference.id,
          entityKind: toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        requestId,
        title: title.trim(),
        workKind: effectiveWorkKind,
      });
      toast.success("Action Item created.");
      onCreated?.(actionItemId);
      onOpenChange(false);
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Action Item creation failed after asset upload.",
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to create Action Item."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {parentActionItemId ? "New child" : "New Action Item"}
          </Badge>
          <Badge variant="secondary">{priority}</Badge>
        </div>
        <SheetTitle>
          {parentActionItemId
            ? "Create child Action Item"
            : "Create accountable work"}
        </SheetTitle>
        <SheetDescription>
          {parentActionItemId
            ? `Independent work under ${parentTitle ?? "this Action Item"}; visibility remains inherited from the same post.`
            : "The Action Item inherits the post audience and cannot widen it."}
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="space-y-5">
        <AudienceInheritanceNotice />
        <Field label="Title">
          <Input
            aria-label="Action Item title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to happen?"
            value={title}
          />
        </Field>
        <Field label="Description">
          <CollaborationRichTextEditor
            ariaLabel="Action Item description"
            editorMinHeightClass="[&_.ProseMirror]:min-h-32"
            onChange={(nextHtml, nextReferences) => {
              setDescriptionHtml(nextHtml);
              setReferences(nextReferences);
            }}
            onDocumentChange={setDocument}
            placeholder="What does done look like? Type @ to link Build work."
            tagOptions={tagOptions}
            value={descriptionHtml}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <PrioritySelect onChange={setPriority} value={priority} />
          </Field>
          <Field label="Due date">
            <Input
              aria-label="Action Item due date"
              nativeInput
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </Field>
        </div>
        <Field label="Work type">
          <WorkKindSelect onChange={setWorkKind} value={effectiveWorkKind} />
          {effectiveWorkKind === "ordinary" ? null : (
            <p className="text-muted-foreground text-xs">
              Governed work requires a due date and authority acceptance before
              Done.
            </p>
          )}
        </Field>
        <Field label="Assignee">
          <Select
            onValueChange={(value) => setAssigneeWorkosUserId(value ?? "")}
            value={assigneeWorkosUserId}
          >
            <SelectTrigger aria-label="Action Item assignee">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((participant) => (
                <SelectItem key={participant.id} value={participant.id}>
                  {participant.label} · {participant.eyebrow}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Labels">
          <Input
            aria-label="Action Item labels"
            onChange={(event) => setLabels(event.target.value)}
            placeholder="Evidence, Draw 3"
            value={labels}
          />
        </Field>
        <Field label="Attachments">
          <Input
            aria-label="Action Item attachments"
            multiple
            nativeInput
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
          {files.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </p>
          ) : null}
        </Field>
      </SheetPanel>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Cancel
        </Button>
        <Button disabled={submitting} onClick={create}>
          {submitting ? "Creating…" : "Create Action Item"}
        </Button>
      </SheetFooter>
    </>
  );
}

function ActionItemDetailPanel({
  buildId,
  detail,
  onOpenChange,
  onReferenceOpen,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: ActionItemDetail | undefined;
  onOpenChange: (open: boolean) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  if (detail === undefined) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Action Item</SheetTitle>
          <SheetDescription>Loading accountable work…</SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <Frame>
            <FramePanel aria-live="polite">Loading Action Item…</FramePanel>
          </Frame>
        </SheetPanel>
      </>
    );
  }
  if (detail.state === "revoked") {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Action Item unavailable</SheetTitle>
          <SheetDescription>
            The item was removed or its originating post is restricted.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </>
    );
  }
  return (
    <VisibleActionItemDetail
      buildId={buildId}
      detail={detail}
      onOpenChange={onOpenChange}
      onReferenceOpen={onReferenceOpen}
      organizationId={organizationId}
      tagOptions={tagOptions}
    />
  );
}

function VisibleActionItemDetail({
  buildId,
  detail,
  onOpenChange,
  onReferenceOpen,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  onOpenChange: (open: boolean) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  const updateActionItem = useMutation(
    api.build_action_items.updateBuildActionItem
  );
  const addComment = useMutation(
    api.build_action_item_details.addBuildActionItemComment
  );
  const addReplacementComment = useMutation(
    api.build_collaboration_threads.addBuildCollaborationComment
  );
  const beginReplacementUpload = useMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerReplacementUpload = useMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanReplacement = useAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonReplacementAssets = useMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const assignActionItem = useMutation(
    api.build_action_item_workflow.assignBuildActionItem
  );
  const acceptAssignment = useMutation(
    api.build_action_item_workflow.acceptBuildActionItemAssignment
  );
  const transitionActionItem = useMutation(
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
  const [commentHtml, setCommentHtml] = useState("");
  const [commentDocument, setCommentDocument] = useState<JSONContent>(
    emptyDocument()
  );
  const [commentReferences, setCommentReferences] = useState<
    CollaborationTagReference[]
  >([]);
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
  }, [detail.item.dueAt, detail.item.priority, detail.item.title]);

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
        organizationId,
        priority,
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
    if (!plainTextFromDocument(commentDocument)) {
      return;
    }
    try {
      await addComment({
        actionItemId: detail.item.actionItemId,
        buildId,
        organizationId,
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
      toast.success("Comment added.");
    } catch (error) {
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
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{detail.item.status}</Badge>
          <Badge variant="secondary">{detail.item.priority}</Badge>
          <Badge variant="outline">
            Revision {detail.item.currentRevision}
          </Badge>
        </div>
        <SheetTitle>{detail.item.title}</SheetTitle>
        <SheetDescription>
          Created by {detail.item.creatorDisplayName} ·{" "}
          {detail.item.assigneeDisplayName
            ? `assigned to ${detail.item.assigneeDisplayName}`
            : "unassigned"}
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="space-y-6">
        <AudienceInheritanceNotice audienceMode={detail.item.audienceMode} />
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
        <section className="space-y-3">
          <h3 className="font-semibold text-sm">Work definition</h3>
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
          <CollaborationRichTextPreview
            ariaLabel="Action Item description"
            onReferenceOpen={onReferenceOpen}
            tagOptions={tagOptions}
            value={parseDocument(detail.item.descriptionTiptapJson)}
          />
          <Button disabled={saving} onClick={save} size="sm">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </section>
        <DetailContext
          buildId={buildId}
          detail={detail}
          onReferenceOpen={onReferenceOpen}
          onReplaceAsset={replaceAsset}
          organizationId={organizationId}
          tagOptions={tagOptions}
        />
        <ActionItemStructurePanel
          buildId={buildId}
          detail={detail}
          onReferenceOpen={onReferenceOpen}
          organizationId={organizationId}
          tagOptions={tagOptions}
        />
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle aria-hidden="true" className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Discussion</h3>
          </div>
          {detail.comments.map((entry) => (
            <Card key={entry.commentId}>
              <CardPanel className="space-y-1 p-3">
                <p className="font-medium text-xs">
                  {entry.authorDisplayName} ·{" "}
                  <span className="text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </p>
                <CollaborationRichTextPreview
                  ariaLabel="Action Item comment"
                  onReferenceOpen={onReferenceOpen}
                  tagOptions={tagOptions}
                  value={parseDocument(entry.tiptapJson)}
                />
              </CardPanel>
            </Card>
          ))}
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
          <Button onClick={comment} size="sm">
            Add comment
          </Button>
        </section>
        <RevisionHistory detail={detail} />
        <ActivityHistory detail={detail} />
      </SheetPanel>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

function ActionItemWorkflowPanel({
  busy,
  detail,
  onAccept,
  onAssign,
  onReasonChange,
  onTransition,
  reason,
  workflow,
}: {
  busy: boolean;
  detail: VisibleActionItemDetail;
  onAccept: () => void;
  onAssign: (workosUserId: string | null) => void;
  onReasonChange: (reason: string) => void;
  onTransition: (status: ActionStatus) => void;
  reason: string;
  workflow: WorkflowContext | undefined;
}) {
  if (workflow === undefined) {
    return (
      <Frame>
        <FramePanel className="text-muted-foreground text-sm">
          Loading workflow controls…
        </FramePanel>
      </Frame>
    );
  }
  if (workflow.state === "revoked") {
    return null;
  }
  const visibleWorkflow = workflow as VisibleWorkflowContext;
  const reasonRelevant =
    detail.item.status === "blocked" ||
    detail.item.status === "cancelled" ||
    detail.item.status === "done" ||
    visibleWorkflow.availableTransitions.some(
      (status) => status === "blocked" || status === "cancelled"
    );
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {workKindLabel(detail.item.workKind)}
          </Badge>
          <Badge variant="outline">{detail.item.assignmentState}</Badge>
          {detail.item.assignmentState === "requested" ? (
            <Badge>Assignment requested</Badge>
          ) : null}
          {detail.item.requiresAcceptance ? (
            <Badge variant="outline">Governed completion</Badge>
          ) : null}
        </div>
        {visibleWorkflow.assignableParticipants.length > 0 ||
        visibleWorkflow.viewerCanUnassign ? (
          <Field label="Assignment">
            <Select
              disabled={busy}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                onAssign(value === "__unassigned" ? null : value);
              }}
              value={detail.item.assigneeWorkosUserId ?? "__unassigned"}
            >
              <SelectTrigger aria-label="Assign Action Item">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {visibleWorkflow.viewerCanUnassign ? (
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                ) : null}
                {visibleWorkflow.assignableParticipants.map((participant) => (
                  <SelectItem
                    key={participant.workosUserId}
                    value={participant.workosUserId}
                  >
                    {participant.displayName} · {participant.role}
                    {participant.assignmentMode === "request"
                      ? " · requests acceptance"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {visibleWorkflow.viewerCanAcceptAssignment ? (
          <Button disabled={busy} onClick={onAccept} size="sm">
            Accept assignment
          </Button>
        ) : null}
        {reasonRelevant ? (
          <Input
            aria-label="Action Item transition reason"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Reason for blocking, cancellation, or reopening"
            value={reason}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {visibleWorkflow.availableTransitions.map((status) => (
            <Button
              disabled={busy}
              key={status}
              onClick={() => onTransition(status)}
              size="sm"
              variant={status === "done" ? "default" : "outline"}
            >
              {transitionLabel(detail, status)}
            </Button>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function DetailContext({
  buildId,
  detail,
  onReferenceOpen,
  onReplaceAsset,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReplaceAsset: (
    asset: BuildCollaborationAssetSummary,
    file: File
  ) => Promise<void>;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Build context</h3>
      <div className="flex flex-wrap gap-2">
        {detail.labels.map((label) => (
          <Badge key={label} variant="outline">
            {label}
          </Badge>
        ))}
        {detail.references.map((reference) => {
          const option = tagOptions.find(
            (candidate) =>
              candidate.id === reference.entityId &&
              candidate.kind === toEditorReferenceKind(reference.entityKind)
          );
          return option ? (
            <BuildCollaborationReferenceChip
              key={`${reference.entityKind}:${reference.entityId}`}
              onOpen={() => onReferenceOpen(option)}
              reference={option}
            />
          ) : (
            <Badge
              key={`${reference.entityKind}:${reference.entityId}`}
              variant="outline"
            >
              @{reference.label}
            </Badge>
          );
        })}
      </div>
      <BuildCollaborationAssetList
        assets={detail.attachments}
        buildId={buildId}
        onReplace={onReplaceAsset}
        organizationId={organizationId}
      />
    </section>
  );
}

function ActionItemStructurePanel({
  buildId,
  detail,
  onReferenceOpen,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  const structure = useQuery(
    api.build_action_item_structure.getBuildActionItemStructureContext,
    {
      actionItemId: detail.item.actionItemId,
      buildId,
      organizationId,
    }
  ) as StructureContext | undefined;
  const addChecklistItem = useMutation(
    api.build_action_item_structure.addBuildActionItemChecklistItem
  );
  const toggleChecklistItem = useMutation(
    api.build_action_item_structure.toggleBuildActionItemChecklistItem
  );
  const linkActionItems = useMutation(
    api.build_action_item_structure.linkBuildActionItems
  );
  const repairRelation = useMutation(
    api.build_action_item_structure.repairBuildActionItemRelation
  );
  const [checklistLabel, setChecklistLabel] = useState("");
  const [relationKind, setRelationKind] = useState<
    "blocks" | "duplicate" | "related"
  >("blocks");
  const [relatedActionItemId, setRelatedActionItemId] = useState("");
  const [repairReason, setRepairReason] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);
  const [busy, setBusy] = useState(false);
  const relatedOptions = tagOptions.filter(
    (option) =>
      option.kind === "action_item" && option.id !== detail.item.actionItemId
  );

  if (structure === undefined) {
    return (
      <Frame>
        <FramePanel className="p-4 text-muted-foreground text-sm">
          Loading children, checklist, and relationships…
        </FramePanel>
      </Frame>
    );
  }
  if (structure.state === "revoked") {
    return null;
  }
  const visibleStructure = structure as VisibleStructureContext;
  const addChecklist = async () => {
    const label = checklistLabel.trim();
    if (!(label && !busy)) {
      return;
    }
    setBusy(true);
    try {
      await addChecklistItem({
        actionItemId: detail.item.actionItemId,
        buildId,
        expectedRevision: detail.item.currentRevision,
        label,
        organizationId,
        required: true,
      });
      setChecklistLabel("");
      toast.success("Checklist step added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add checklist step."
      );
    } finally {
      setBusy(false);
    }
  };
  const linkRelation = async () => {
    if (!(relatedActionItemId && !busy)) {
      return;
    }
    setBusy(true);
    try {
      await linkActionItems({
        buildId,
        expectedSourceRevision: detail.item.currentRevision,
        kind: relationKind,
        organizationId,
        sourceActionItemId: detail.item.actionItemId,
        targetActionItemId: relatedActionItemId as Id<"buildActionItems">,
      });
      setRelatedActionItemId("");
      toast.success("Action Item relationship added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to link Action Items."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Structured work</h3>
          <p className="text-muted-foreground text-xs">
            First-class children carry ownership; checklist steps do not.
          </p>
        </div>
        {visibleStructure.viewerCanCreateChild &&
        !detail.item.parentActionItemId ? (
          <Button
            onClick={() => setCreatingChild(true)}
            size="sm"
            variant="outline"
          >
            Add child Action Item
          </Button>
        ) : null}
      </div>

      <Frame>
        <FramePanel className="space-y-3 p-4">
          <p className="font-medium text-sm">
            Children · {visibleStructure.children.length}
          </p>
          {visibleStructure.children.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No child Action Items.
            </p>
          ) : (
            <div className="grid gap-2">
              {visibleStructure.children.map((child) => (
                <Card
                  className="text-left transition-colors hover:bg-muted/30"
                  key={child.actionItemId}
                  onClick={() => {
                    const option = tagOptions.find(
                      (candidate) =>
                        candidate.kind === "action_item" &&
                        candidate.id === child.actionItemId
                    );
                    onReferenceOpen(
                      option ?? {
                        eyebrow: "Action Item",
                        id: child.actionItemId,
                        kind: "action_item",
                        label: child.title,
                        summary: `${child.status.replaceAll("_", " ")} · ${child.priority}`,
                      }
                    );
                  }}
                  render={<button type="button" />}
                >
                  <CardPanel className="flex items-center justify-between gap-3 p-3">
                    <span className="font-medium text-sm">{child.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {child.status.replaceAll("_", " ")}
                    </span>
                  </CardPanel>
                </Card>
              ))}
            </div>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-3 p-4">
          <p className="font-medium text-sm">
            Checklist · {visibleStructure.checklist.length}
          </p>
          {visibleStructure.checklist.map((row) => (
            <div
              className="flex items-center gap-2 text-sm"
              key={row.checklistItemId}
            >
              <Checkbox
                aria-label={`Mark ${row.label} ${row.completed ? "incomplete" : "complete"}`}
                checked={row.completed}
                disabled={busy}
                onCheckedChange={async () => {
                  setBusy(true);
                  try {
                    await toggleChecklistItem({
                      buildId,
                      checklistItemId: row.checklistItemId,
                      expectedRevision: detail.item.currentRevision,
                      organizationId,
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to update checklist step."
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <span className={row.completed ? "line-through opacity-64" : ""}>
                {row.label}
              </span>
            </div>
          ))}
          {visibleStructure.viewerCanAddChecklist ? (
            <div className="flex gap-2">
              <Input
                aria-label="New checklist step"
                onChange={(event) => setChecklistLabel(event.target.value)}
                placeholder="Add a lightweight step"
                value={checklistLabel}
              />
              <Button disabled={busy} onClick={addChecklist} size="sm">
                Add
              </Button>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-3 p-4">
          <p className="font-medium text-sm">
            Relationships · {visibleStructure.relations.length}
          </p>
          {visibleStructure.relations.map((relation) => (
            <Card key={relation.relationId}>
              <CardPanel className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {relationDirectionLabel(relation)}
                  </Badge>
                  <span className="font-medium text-sm">
                    {relation.otherActionItemTitle ?? "Restricted Action Item"}
                  </span>
                  {relation.status === "suspended" ? (
                    <Badge variant="destructive">Permission conflict</Badge>
                  ) : null}
                </div>
                {relation.status === "suspended" &&
                relation.sourceRevision !== undefined &&
                visibleStructure.viewerCanRepairRelations ? (
                  <div className="flex gap-2">
                    <Input
                      aria-label="Relationship repair reason"
                      onChange={(event) => setRepairReason(event.target.value)}
                      placeholder="How was access repaired?"
                      value={repairReason}
                    />
                    <Button
                      disabled={busy || !repairReason.trim()}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await repairRelation({
                            buildId,
                            expectedSourceRevision: relation.sourceRevision,
                            organizationId,
                            reason: repairReason.trim(),
                            relationId: relation.relationId,
                          });
                          setRepairReason("");
                          toast.success("Relationship restored.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Unable to repair relationship."
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                      size="sm"
                    >
                      Restore
                    </Button>
                  </div>
                ) : null}
              </CardPanel>
            </Card>
          ))}
          {visibleStructure.viewerCanLinkRelation ? (
            <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]">
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setRelationKind(
                      value as "blocks" | "duplicate" | "related"
                    );
                  }
                }}
                value={relationKind}
              >
                <SelectTrigger aria-label="Relationship type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocks">Blocks</SelectItem>
                  <SelectItem value="related">Related</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => setRelatedActionItemId(value ?? "")}
                value={relatedActionItemId}
              >
                <SelectTrigger aria-label="Related Action Item">
                  <SelectValue placeholder="Choose Action Item" />
                </SelectTrigger>
                <SelectContent>
                  {relatedOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={busy || !relatedActionItemId}
                onClick={linkRelation}
                size="sm"
              >
                Link
              </Button>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <Sheet onOpenChange={setCreatingChild} open={creatingChild}>
        <SheetPopup side="right" variant="inset">
          <ActionItemCreatePanel
            buildId={buildId}
            expectedParentRevision={detail.item.currentRevision}
            onOpenChange={setCreatingChild}
            organizationId={organizationId}
            parentActionItemId={detail.item.actionItemId}
            parentTitle={detail.item.title}
            postId={detail.item.originatingPostId}
            tagOptions={tagOptions}
          />
        </SheetPopup>
      </Sheet>
    </section>
  );
}

function RevisionHistory({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Revision history</h3>
      </div>
      {detail.revisions.map((revision) => {
        const snapshot = parseSnapshot(revision.snapshotJson);
        return (
          <details
            className="rounded-lg border bg-muted/10 px-3 py-2"
            key={revision.revision}
          >
            <summary className="cursor-pointer text-sm">
              Revision {revision.revision} ·{" "}
              {formatTimestamp(revision.createdAt)}
            </summary>
            <p className="mt-2 font-medium text-sm">{snapshot.title}</p>
            <p className="text-muted-foreground text-xs">
              {snapshot.status} · {snapshot.priority} · by{" "}
              {revision.actorDisplayName}
            </p>
          </details>
        );
      })}
    </section>
  );
}

function ActivityHistory({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Activity</h3>
      <div className="space-y-3 border-l pl-4">
        {detail.activity.map((activity) => (
          <div className="text-sm" key={activity.eventId}>
            <p className="font-medium">
              {activity.eventType.replaceAll("_", " ")}
            </p>
            <p className="text-muted-foreground text-xs">
              {activity.actorDisplayName} ·{" "}
              {formatTimestamp(activity.createdAt)}
              {activity.reason ? ` · ${activity.reason}` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AudienceInheritanceNotice({
  audienceMode,
}: {
  audienceMode?: "author_tier_and_higher" | "build_wide" | "custom";
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <p className="flex items-center gap-2 font-medium text-xs">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Audience inherited from the post
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {audienceMode === "custom"
            ? "Restricted to the post’s current readers."
            : audienceMode === "author_tier_and_higher"
              ? "Visible to the author’s role tier and every higher tier."
              : "Visible to everyone who can read the parent post."}{" "}
          This Action Item cannot widen visibility.
        </p>
      </FramePanel>
    </Frame>
  );
}

function PrioritySelect({
  onChange,
  value,
}: {
  onChange: (value: ActionPriority) => void;
  value: ActionPriority;
}) {
  return (
    <Select
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as ActionPriority);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="Action Item priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["urgent", "high", "medium", "low", "none"] as const).map(
          (priority) => (
            <SelectItem key={priority} value={priority}>
              {priority}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}

function WorkKindSelect({
  onChange,
  value,
}: {
  onChange: (value: ActionWorkKind) => void;
  value: ActionWorkKind;
}) {
  const options: Array<{ label: string; value: ActionWorkKind }> = [
    { label: "Ordinary work", value: "ordinary" },
    { label: "Approval", value: "approval" },
    { label: "Evidence", value: "evidence" },
    { label: "Site Visit remediation", value: "site_visit_remediation" },
    { label: "Draw blocker", value: "draw_blocker" },
  ];
  return (
    <Select
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as ActionWorkKind);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="Action Item work type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function parseSnapshot(snapshotJson: string) {
  try {
    return JSON.parse(snapshotJson) as {
      priority: string;
      status: string;
      title: string;
    };
  } catch {
    return { priority: "unknown", status: "unknown", title: "Unavailable" };
  }
}

function dateInputValue(timestamp?: number) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function workKindLabel(workKind: ActionWorkKind) {
  switch (workKind) {
    case "ordinary":
      return "Ordinary work";
    case "approval":
      return "Approval";
    case "evidence":
      return "Evidence";
    case "site_visit_remediation":
      return "Site Visit remediation";
    case "draw_blocker":
      return "Draw blocker";
  }
}

function effectiveActionItemWorkKind(
  selectedWorkKind: ActionWorkKind,
  references: CollaborationTagReference[]
): ActionWorkKind {
  if (selectedWorkKind !== "ordinary") {
    return selectedWorkKind;
  }
  if (references.some((reference) => reference.kind === "draw")) {
    return "draw_blocker";
  }
  if (references.some((reference) => reference.kind === "site_visit")) {
    return "site_visit_remediation";
  }
  if (references.some((reference) => reference.kind === "evidence")) {
    return "evidence";
  }
  return "ordinary";
}

function relationDirectionLabel(
  relation: VisibleStructureContext["relations"][number]
) {
  if (relation.kind === "blocks") {
    return relation.direction === "outgoing" ? "Blocks" : "Blocked by";
  }
  return relation.kind === "duplicate" ? "Duplicate" : "Related";
}

function transitionLabel(
  detail: VisibleActionItemDetail,
  status: ActionStatus
) {
  if (status === "in_review" && detail.item.requiresAcceptance) {
    return "Submit for review";
  }
  if (status === "done" && detail.item.requiresAcceptance) {
    return "Accept Done";
  }
  if (
    (detail.item.status === "blocked" ||
      detail.item.status === "cancelled" ||
      detail.item.status === "done") &&
    status !== "cancelled"
  ) {
    return `Reopen to ${status.replaceAll("_", " ")}`;
  }
  return status.replaceAll("_", " ");
}

function newActionItemRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`;
}

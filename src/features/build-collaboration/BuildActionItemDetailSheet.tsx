"use client";

import type { JSONContent } from "@tiptap/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  History,
  MessageCircle,
  Play,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
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
  BUILD_ACTION_ITEM_TAGS,
  type BuildActionItemTag,
} from "../../../convex/build_action_item_tags";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
  type MilestoneStartConfirmation,
} from "../backoffice-build-detail/MilestoneStartDialog.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
  useBuildCollaborationReadMutation,
} from "./BuildCollaborationMutationGate.tsx";
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
  focusedAssetId,
  onCreated,
  onOpenChange,
  onReferenceOpen,
  onTargetChange,
  open,
  organizationId,
  readOnly = false,
  tagOptions,
  target,
}: {
  buildId: Id<"activeBuilds">;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onOpenChange: (open: boolean) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onTargetChange?: (target: BuildActionItemSheetTarget) => void;
  open: boolean;
  organizationId: string;
  readOnly?: boolean;
  tagOptions: CollaborationTagOption[];
  target: BuildActionItemSheetTarget | null;
}) {
  const actionItemId =
    target?.kind === "detail" ? target.actionItemId : undefined;
  const detail = useQuery(
    api.build_action_item_details.getBuildActionItemDetail,
    open && actionItemId ? { actionItemId, buildId, organizationId } : "skip"
  ) as ActionItemDetail | undefined;
  const [history, setHistory] = useState<Id<"buildActionItems">[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const navigatingHistory = useRef(false);
  useEffect(() => {
    if (!(open && actionItemId)) {
      if (!open) {
        setHistory([]);
        setHistoryIndex(-1);
      }
      return;
    }
    if (navigatingHistory.current) {
      navigatingHistory.current = false;
      return;
    }
    setHistory((current) => {
      if (current[historyIndex] === actionItemId) {
        return current;
      }
      const next = [...current.slice(0, historyIndex + 1), actionItemId];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [actionItemId, historyIndex, open]);
  const navigateHistory = (offset: -1 | 1) => {
    const nextIndex = historyIndex + offset;
    const nextActionItemId = history[nextIndex];
    if (!nextActionItemId) {
      return;
    }
    navigatingHistory.current = true;
    setHistoryIndex(nextIndex);
    onTargetChange?.({ actionItemId: nextActionItemId, kind: "detail" });
  };
  return (
    <Sheet modal={false} onOpenChange={onOpenChange} open={open}>
      <SheetPopup
        backdropClassName="hidden"
        className="pointer-events-auto h-svh max-h-svh w-full max-w-none shadow-2xl sm:w-[min(34vw,32rem)] sm:min-w-[24rem]"
        showCloseButton={false}
        side="right"
        viewportClassName="pointer-events-none"
      >
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
            canGoBack={historyIndex > 0}
            canGoForward={
              historyIndex >= 0 && historyIndex < history.length - 1
            }
            detail={detail}
            focusedAssetId={focusedAssetId}
            onGoBack={() => navigateHistory(-1)}
            onGoForward={() => navigateHistory(1)}
            onOpenChange={onOpenChange}
            onReferenceOpen={onReferenceOpen}
            organizationId={organizationId}
            readOnly={readOnly}
            tagOptions={tagOptions}
          />
        )}
      </SheetPopup>
    </Sheet>
  );
}

function DetailSheetHeader({
  canGoBack,
  canGoForward,
  children,
  onClose,
  onGoBack,
  onGoForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  children: ReactNode;
  onClose: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}) {
  return (
    <SheetHeader className="sticky top-0 z-20 border-b bg-background/96 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous linked Action Item"
            disabled={!canGoBack}
            onClick={onGoBack}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label="Next linked Action Item"
            disabled={!canGoForward}
            onClick={onGoForward}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <Button
          aria-label="Close Action Item detail"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {children}
    </SheetHeader>
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
  const createActionItem = useBuildCollaborationMutation(
    api.build_action_items.createBuildActionItem
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
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [priority, setPriority] = useState<ActionPriority>("none");
  const [workKind, setWorkKind] = useState<ActionWorkKind>("ordinary");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState<BuildActionItemTag[]>([]);
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
        labels,
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
        <TagTaxonomyPicker labels={labels} onChange={setLabels} />
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
  detail: ActionItemDetail | undefined;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onOpenChange: (open: boolean) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  readOnly: boolean;
  tagOptions: CollaborationTagOption[];
}) {
  if (detail === undefined) {
    return (
      <>
        <DetailSheetHeader
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onClose={() => onOpenChange(false)}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
        >
          <SheetTitle>Action Item</SheetTitle>
          <SheetDescription>Loading accountable work…</SheetDescription>
        </DetailSheetHeader>
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
        <DetailSheetHeader
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onClose={() => onOpenChange(false)}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
        >
          <SheetTitle>Action Item unavailable</SheetTitle>
          <SheetDescription>
            The item was removed or its originating post is restricted.
          </SheetDescription>
        </DetailSheetHeader>
        <SheetFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </>
    );
  }
  return (
    <VisibleActionItemDetail
      buildId={buildId}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      detail={detail}
      focusedAssetId={focusedAssetId}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onOpenChange={onOpenChange}
      onReferenceOpen={onReferenceOpen}
      organizationId={organizationId}
      readOnly={readOnly}
      tagOptions={tagOptions}
    />
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The detail sheet intentionally coordinates one live Action Item transaction surface so permissions and revision state never split across parallel editors.
function VisibleActionItemDetail({
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
  const startCanonicalMilestone = useBuildCollaborationMutation(
    api.production_proposals.startActiveBuildMilestone
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
  const [canonicalStartRequest, setCanonicalStartRequest] =
    useState<MilestoneStartDialogRequest | null>(null);

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

  const openCanonicalStart = () => {
    const command = detail.item.systemPresentation?.startCommand;
    if (!command?.allowed || readOnly) {
      return;
    }
    setCanonicalStartRequest({
      action: "start",
      buildName: command.buildName,
      dependencyBlockers: command.dependencyBlockers,
      milestoneKey: command.milestoneKey,
      milestoneName: command.milestoneName,
      plannedStartDate: command.plannedStartDate,
      scope: command.scope,
      source: command.source,
      startParent: false,
      submilestoneKey: command.submilestoneKey,
      submilestoneName: command.submilestoneName,
    });
  };

  const confirmCanonicalStart = async (
    input: MilestoneStartConfirmation
  ) => {
    if (input.action !== "start" || input.actualStartedAt === undefined) {
      throw new Error("An actual start is required.");
    }
    await startCanonicalMilestone({
      actualStartedAt: input.actualStartedAt,
      buildId,
      dependencyOverrideReason: input.dependencyOverrideReason,
      idempotencyKey: input.idempotencyKey,
      milestoneKey: input.milestoneKey,
      source: input.source,
      startParent: false,
      submilestoneKey: input.submilestoneKey,
      workosOrganizationId: organizationId,
    });
    toast.success("Canonical Sub-milestone start recorded.");
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
          {detail.item.systemMode === "generated_milestone_submilestone" ? (
            <Badge variant="secondary">System · Milestone</Badge>
          ) : null}
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
        {detail.item.systemMode === "generated_milestone_submilestone" ? (
          <CanonicalMilestoneActionItemFacts
            detail={detail}
            onStart={openCanonicalStart}
            readOnly={readOnly}
          />
        ) : null}
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
      {canonicalStartRequest ? (
        <MilestoneStartDialog
          onClose={() => setCanonicalStartRequest(null)}
          onConfirm={confirmCanonicalStart}
          request={canonicalStartRequest}
        />
      ) : null}
    </>
  );
}

function CanonicalMilestoneActionItemFacts({
  detail,
  onStart,
  readOnly,
}: {
  detail: VisibleActionItemDetail;
  onStart?: () => void;
  readOnly: boolean;
}) {
  const milestoneReference = detail.references.find(
    (reference) => reference.entityKind === "milestone"
  );
  const submilestoneReference = detail.references.find(
    (reference) => reference.entityKind === "submilestone"
  );
  return (
    <Frame className="border-dashed bg-muted/20" size="sm">
      <FramePanel className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">Canonical Sub-milestone</Badge>
          {detail.item.systemPresentation ? (
            <Badge
              variant={
                detail.item.systemPresentation.column === "behind_schedule"
                  ? "warning"
                  : "outline"
              }
            >
              {systemPresentationLabel(detail.item.systemPresentation.column)}
            </Badge>
          ) : null}
          {detail.item.systemPresentation?.attention ===
          "overdue_completion" ? (
            <Badge variant="destructive">Overdue completion</Badge>
          ) : null}
          {detail.item.systemPresentation?.executionOwnership?.state ===
          "assignment_required" ? (
            <Badge variant="warning">Assignment required</Badge>
          ) : null}
          <span className="text-muted-foreground">System-owned binding</span>
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <ReadOnlyField
            label="Milestone"
            value={milestoneReference?.label ?? "Canonical Milestone"}
          />
          <ReadOnlyField
            label="Sub-milestone"
            value={submilestoneReference?.label ?? detail.item.title}
          />
        </dl>
        {detail.item.systemPresentation?.state === "unknown" ? (
          <p className="text-muted-foreground text-xs">
            Schedule state unavailable
            {detail.item.systemPresentation.unknownReason
              ? `: ${detail.item.systemPresentation.unknownReason}`
              : ""}
          </p>
        ) : null}
        {detail.item.systemPresentation?.startCommand?.allowed &&
        !readOnly ? (
          <Button onClick={onStart} size="sm" type="button">
            <Play aria-hidden="true" className="size-4" />
            Start work
          </Button>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Status, completion, ownership, and identity follow the canonical
          roadmap. Start work is a canonical milestone command; this
          collaboration card is not an independent workflow.
        </p>
      </FramePanel>
    </Frame>
  );
}

function systemPresentationLabel(
  column: NonNullable<
    VisibleActionItemDetail["item"]["systemPresentation"]
  >["column"]
) {
  switch (column) {
    case "approved":
      return "Approved";
    case "backlog":
      return "Backlog";
    case "behind_schedule":
      return "Behind Schedule";
    case "in_progress":
      return "In Progress";
    case "in_review":
      return "In Review";
  }
}

const ACTION_ITEM_REACTIONS = ["acknowledged", "agree", "question"] as const;

function ActionItemCommentCard({
  buildId,
  entry,
  onReact,
  onReferenceOpen,
  onReply,
  organizationId,
  readOnly,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  entry: VisibleActionItemDetail["comments"][number];
  onReact: (reaction: (typeof ACTION_ITEM_REACTIONS)[number]) => Promise<void>;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReply: () => void;
  organizationId: string;
  readOnly: boolean;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <Card>
      <CardPanel className="space-y-2 p-3">
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
        {entry.attachments.length ? (
          <BuildCollaborationAssetList
            assets={entry.attachments}
            buildId={buildId}
            organizationId={organizationId}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          {ACTION_ITEM_REACTIONS.map((reaction) => {
            const summary = entry.reactions.find(
              (candidate) => candidate.reaction === reaction
            );
            return (
              <Button
                aria-pressed={summary?.viewerHasReacted ?? false}
                disabled={readOnly}
                key={reaction}
                onClick={async () => {
                  await onReact(reaction);
                }}
                size="xs"
                variant={summary?.viewerHasReacted ? "secondary" : "ghost"}
              >
                {reaction === "acknowledged"
                  ? "✓"
                  : reaction === "agree"
                    ? "👍"
                    : "?"}
                {summary?.count ? ` ${summary.count}` : ""}
              </Button>
            );
          })}
          {readOnly ? null : (
            <Button onClick={onReply} size="xs" variant="ghost">
              Reply
            </Button>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}

function TagTaxonomyPicker({
  labels,
  onChange,
}: {
  labels: BuildActionItemTag[];
  onChange: (labels: BuildActionItemTag[]) => void;
}) {
  return (
    <Field label="Tags">
      <div className="flex flex-wrap gap-1.5">
        {BUILD_ACTION_ITEM_TAGS.map((label) => {
          const selected = labels.includes(label);
          return (
            <Button
              aria-pressed={selected}
              key={label}
              onClick={() =>
                onChange(
                  selected
                    ? labels.filter((candidate) => candidate !== label)
                    : [...labels, label]
                )
              }
              size="xs"
              type="button"
              variant={selected ? "secondary" : "outline"}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </Field>
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
  const [pendingStatus, setPendingStatus] = useState<ActionStatus | null>(null);
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
  const assignmentStateLabel =
    detail.item.assignmentState === "requested"
      ? "Acceptance requested"
      : detail.item.assignmentState === "assigned"
        ? "Assigned"
        : "Unassigned";
  const statusOptions = Array.from(
    new Set([detail.item.status, ...visibleWorkflow.availableTransitions])
  );
  const transitionNeedsReason = (nextStatus: ActionStatus) =>
    nextStatus === "blocked" ||
    (detail.item.status === "done" && nextStatus !== "done");
  const selectedAssigneeLabel = (value: unknown) => {
    if (!value || value === "__unassigned") {
      return "Unassigned";
    }
    const participant = visibleWorkflow.assignableParticipants.find(
      (candidate) => candidate.workosUserId === value
    );
    return (
      participant?.displayName ??
      detail.item.assigneeDisplayName ??
      "Assigned participant"
    );
  };
  const chooseStatus = (nextStatus: ActionStatus) => {
    if (nextStatus === detail.item.status) {
      setPendingStatus(null);
      onReasonChange("");
      return;
    }
    if (transitionNeedsReason(nextStatus)) {
      setPendingStatus(nextStatus);
      onReasonChange("");
      return;
    }
    setPendingStatus(null);
    onTransition(nextStatus);
  };
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {workKindLabel(detail.item.workKind)}
          </Badge>
          <Badge variant="outline">{assignmentStateLabel}</Badge>
          {detail.item.requiresAcceptance ? (
            <Badge variant="outline">Governed completion</Badge>
          ) : null}
        </div>
        {visibleWorkflow.assignableParticipants.length > 0 ||
        visibleWorkflow.viewerCanUnassign ? (
          <Field label="Assignee">
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
                <SelectValue placeholder="Unassigned">
                  {(value) => selectedAssigneeLabel(value)}
                </SelectValue>
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
        <Field label="Status">
          <NativeSelect
            aria-label="Change Action Item status"
            className="w-full [&_[data-slot=native-select]]:h-9 [&_[data-slot=native-select]]:rounded-lg [&_[data-slot=native-select]]:bg-background [&_[data-slot=native-select]]:text-sm"
            disabled={busy || visibleWorkflow.availableTransitions.length === 0}
            onChange={(event) => {
              chooseStatus(event.currentTarget.value as ActionStatus);
            }}
            value={pendingStatus ?? detail.item.status}
          >
            {statusOptions.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {statusLabel(status)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {pendingStatus ? (
          <Frame>
            <FramePanel className="space-y-3 bg-muted/20 p-3">
              <Field
                label={
                  pendingStatus === "blocked"
                    ? "Blocking reason"
                    : "Reopening reason"
                }
              >
                <Input
                  aria-label="Action Item transition reason"
                  onChange={(event) => onReasonChange(event.target.value)}
                  placeholder={
                    pendingStatus === "blocked"
                      ? "What is preventing progress?"
                      : "Why should this Action Item be reopened?"
                  }
                  value={reason}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  disabled={busy}
                  onClick={() => {
                    setPendingStatus(null);
                    onReasonChange("");
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  disabled={busy || !reason.trim()}
                  onClick={() => {
                    onTransition(pendingStatus);
                    setPendingStatus(null);
                  }}
                  size="sm"
                >
                  {transitionLabel(detail, pendingStatus)}
                </Button>
              </div>
            </FramePanel>
          </Frame>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function DetailContext({
  buildId,
  detail,
  focusedAssetId,
  onReferenceOpen,
  onReplaceAsset,
  organizationId,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  onReplaceAsset?: (
    asset: BuildCollaborationAssetSummary,
    file: File
  ) => Promise<void>;
  organizationId: string;
  tagOptions: CollaborationTagOption[];
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-base leading-snug">Build context</h3>
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
        focusedAssetId={focusedAssetId}
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
  overrideReason,
  readOnly,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  detail: VisibleActionItemDetail;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
  organizationId: string;
  overrideReason: string;
  readOnly: boolean;
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
  const addChecklistItem = useBuildCollaborationMutation(
    api.build_action_item_structure.addBuildActionItemChecklistItem
  );
  const toggleChecklistItem = useBuildCollaborationMutation(
    api.build_action_item_structure.toggleBuildActionItemChecklistItem
  );
  const linkActionItems = useBuildCollaborationMutation(
    api.build_action_item_structure.linkBuildActionItems
  );
  const unlinkActionItems = useBuildCollaborationMutation(
    api.build_action_item_structure.unlinkBuildActionItemRelation
  );
  const repairRelation = useBuildCollaborationMutation(
    api.build_action_item_structure.repairBuildActionItemRelation
  );
  const [checklistLabel, setChecklistLabel] = useState("");
  const [relationKind, setRelationKind] = useState<"duplicate" | "related">(
    "related"
  );
  const [relatedActionItemId, setRelatedActionItemId] = useState("");
  const [dependsOnActionItemId, setDependsOnActionItemId] = useState("");
  const [unblocksActionItemId, setUnblocksActionItemId] = useState("");
  const [repairReason, setRepairReason] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);
  const [busy, setBusy] = useState(false);
  const relatedOptions = tagOptions.filter(
    (option) =>
      option.kind === "action_item" && option.id !== detail.item.actionItemId
  );

  useEffect(() => {
    if (readOnly) {
      setCreatingChild(false);
    }
  }, [readOnly]);

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
        expectedGoverningRevision: detail.item.currentRevision,
        expectedSourceRevision: detail.item.currentRevision,
        governingActionItemId: detail.item.actionItemId,
        kind: relationKind,
        organizationId,
        reason: overrideReason.trim() || undefined,
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
  const linkDependency = async (direction: "depends_on" | "unblocks") => {
    const otherId =
      direction === "depends_on" ? dependsOnActionItemId : unblocksActionItemId;
    if (!(otherId && !busy)) {
      return;
    }
    setBusy(true);
    try {
      await linkActionItems({
        buildId,
        expectedGoverningRevision: detail.item.currentRevision,
        governingActionItemId: detail.item.actionItemId,
        kind: "blocks",
        organizationId,
        reason: overrideReason.trim() || undefined,
        sourceActionItemId:
          direction === "depends_on"
            ? (otherId as Id<"buildActionItems">)
            : detail.item.actionItemId,
        targetActionItemId:
          direction === "depends_on"
            ? detail.item.actionItemId
            : (otherId as Id<"buildActionItems">),
      });
      if (direction === "depends_on") {
        setDependsOnActionItemId("");
      } else {
        setUnblocksActionItemId("");
      }
      toast.success("Dependency added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add dependency."
      );
    } finally {
      setBusy(false);
    }
  };
  const unlinkDependency = async (
    relationId: Id<"buildActionItemRelations">
  ) => {
    setBusy(true);
    try {
      await unlinkActionItems({
        buildId,
        expectedGoverningRevision: detail.item.currentRevision,
        governingActionItemId: detail.item.actionItemId,
        organizationId,
        reason: overrideReason.trim() || undefined,
        relationId,
      });
      toast.success("Dependency removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove dependency."
      );
    } finally {
      setBusy(false);
    }
  };
  const openRelatedActionItem = (
    actionItemId: Id<"buildActionItems">,
    title: string
  ) => {
    const option = relatedOptions.find(
      (candidate) => candidate.id === actionItemId
    );
    onReferenceOpen(
      option ?? {
        eyebrow: "Action Item",
        id: actionItemId,
        kind: "action_item",
        label: title,
        summary: "Linked Action Item",
      }
    );
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base leading-snug">
            Structured work
          </h3>
          <p className="text-muted-foreground text-xs">
            First-class children carry ownership; checklist steps do not.
          </p>
        </div>
        {!readOnly &&
        visibleStructure.viewerCanCreateChild &&
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
                disabled={busy || readOnly}
                onCheckedChange={async () => {
                  if (readOnly) {
                    return;
                  }
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
          {!readOnly && visibleStructure.viewerCanAddChecklist ? (
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

      <div className="grid gap-3">
        <DependencyDisclosure
          busy={busy}
          label="Depends on"
          onAdd={() => linkDependency("depends_on")}
          onOpen={openRelatedActionItem}
          onRemove={unlinkDependency}
          onSelectionChange={setDependsOnActionItemId}
          options={relatedOptions}
          readOnly={readOnly || !visibleStructure.viewerCanLinkRelation}
          relations={visibleStructure.relations.filter(
            (relation) =>
              relation.kind === "blocks" && relation.direction === "incoming"
          )}
          selection={dependsOnActionItemId}
        />
        <DependencyDisclosure
          busy={busy}
          label="Unblocks"
          onAdd={() => linkDependency("unblocks")}
          onOpen={openRelatedActionItem}
          onRemove={unlinkDependency}
          onSelectionChange={setUnblocksActionItemId}
          options={relatedOptions}
          readOnly={readOnly || !visibleStructure.viewerCanLinkRelation}
          relations={visibleStructure.relations.filter(
            (relation) =>
              relation.kind === "blocks" && relation.direction === "outgoing"
          )}
          selection={unblocksActionItemId}
        />
      </div>

      <Frame>
        <FramePanel className="space-y-3 p-4">
          <p className="font-medium text-sm">
            Related ·{" "}
            {
              visibleStructure.relations.filter(
                (relation) => relation.kind !== "blocks"
              ).length
            }
          </p>
          {visibleStructure.relations
            .filter((relation) => relation.kind !== "blocks")
            .map((relation) => (
              <Card key={relation.relationId}>
                <CardPanel className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {relationDirectionLabel(relation)}
                    </Badge>
                    <span className="font-medium text-sm">
                      {relation.otherActionItemTitle ??
                        "Restricted Action Item"}
                    </span>
                    {relation.status === "suspended" ? (
                      <Badge variant="destructive">Permission conflict</Badge>
                    ) : null}
                  </div>
                  {relation.status === "suspended" &&
                  !readOnly &&
                  relation.sourceRevision !== undefined &&
                  visibleStructure.viewerCanRepairRelations ? (
                    <div className="flex gap-2">
                      <Input
                        aria-label="Relationship repair reason"
                        onChange={(event) =>
                          setRepairReason(event.target.value)
                        }
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
                              expectedSourceRevision:
                                relation.sourceRevision as number,
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
          {!readOnly && visibleStructure.viewerCanLinkRelation ? (
            <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]">
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setRelationKind(value as "duplicate" | "related");
                  }
                }}
                value={relationKind}
              >
                <SelectTrigger aria-label="Relationship type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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

      {!readOnly && creatingChild ? (
        <Frame>
          <FramePanel className="p-0">
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
          </FramePanel>
        </Frame>
      ) : null}
    </section>
  );
}

function DependencyDisclosure({
  busy,
  label,
  onAdd,
  onOpen,
  onRemove,
  onSelectionChange,
  options,
  readOnly,
  relations,
  selection,
}: {
  busy: boolean;
  label: string;
  onAdd: () => void;
  onOpen: (actionItemId: Id<"buildActionItems">, title: string) => void;
  onRemove: (relationId: Id<"buildActionItemRelations">) => void;
  onSelectionChange: (value: string) => void;
  options: CollaborationTagOption[];
  readOnly: boolean;
  relations: VisibleStructureContext["relations"];
  selection: string;
}) {
  const visible = relations.slice(0, 2);
  const hiddenCount = Math.max(0, relations.length - visible.length);
  return (
    <Frame>
      <FramePanel className="p-0">
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-90"
            />
            <span className="shrink-0 font-medium text-sm">
              {label} · {relations.length}
            </span>
            <span className="flex min-w-0 items-center gap-1 overflow-hidden group-open:hidden">
              {visible.map((relation) => (
                <Badge className="max-w-32 truncate" key={relation.relationId}>
                  {relation.otherActionItemTitle ?? "Restricted Action Item"}
                </Badge>
              ))}
              {hiddenCount ? (
                <Badge
                  aria-label={`${hiddenCount} more dependencies`}
                  variant="outline"
                >
                  …
                </Badge>
              ) : null}
            </span>
          </summary>
          <div className="space-y-2 border-t p-3">
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {relations.length === 0 ? (
                <p className="px-1 py-2 text-muted-foreground text-xs">
                  No linked Action Items.
                </p>
              ) : (
                relations.map((relation) => (
                  <div
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                    key={relation.relationId}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {relation.otherActionItemTitle ??
                        "Restricted Action Item"}
                    </span>
                    {relation.otherActionItemId ? (
                      <Button
                        onClick={() =>
                          onOpen(
                            relation.otherActionItemId as Id<"buildActionItems">,
                            relation.otherActionItemTitle ?? "Action Item"
                          )
                        }
                        size="xs"
                        variant="ghost"
                      >
                        Open
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      </Button>
                    ) : null}
                    {!readOnly && relation.status === "active" ? (
                      <Button
                        disabled={busy}
                        onClick={() => onRemove(relation.relationId)}
                        size="xs"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            {readOnly ? null : (
              <div className="flex gap-2">
                <Select
                  onValueChange={(value) => onSelectionChange(value ?? "")}
                  value={selection}
                >
                  <SelectTrigger aria-label={`Add ${label} dependency`}>
                    <SelectValue placeholder="Choose Action Item" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button disabled={busy || !selection} onClick={onAdd} size="sm">
                  Add
                </Button>
              </div>
            )}
          </div>
        </details>
      </FramePanel>
    </Frame>
  );
}

function RevisionHistory({ detail }: { detail: VisibleActionItemDetail }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h3 className="font-semibold text-base leading-snug">
          Revision history
        </h3>
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
      <h3 className="font-semibold text-base leading-snug">Activity</h3>
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
  const visibilityLabel =
    audienceMode === "custom"
      ? "Restricted visibility"
      : audienceMode === "author_tier_and_higher"
        ? "Visible to the post’s role tier and above"
        : "Visible to all";
  return (
    <p
      aria-label={`Visibility: ${visibilityLabel}`}
      className="flex items-center gap-2 text-muted-foreground text-xs"
    >
      <ShieldCheck aria-hidden="true" className="size-4 text-success" />
      {visibilityLabel}
    </p>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
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

function actionItemAge(createdAt: number) {
  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "1 day old";
  }
  return `${days} days old`;
}

function formatCompactDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(timestamp);
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

function statusLabel(status: ActionStatus) {
  switch (status) {
    case "todo":
      return "To do";
    case "in_progress":
      return "In progress";
    case "in_review":
      return "In review";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
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
    return `Reopen to ${statusLabel(status)}`;
  }
  return statusLabel(status);
}

function newActionItemRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`;
}

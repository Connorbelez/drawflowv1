"use client";

import type { JSONContent } from "@tiptap/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildActionItemTag,
} from "../../../convex/build_action_item_tags";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextEditor,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  emptyDocument,
  plainTextFromDocument,
  toBackendReferenceKind,
} from "./model.ts";
import {
  effectiveActionItemWorkKind,
  newActionItemRequestId,
} from "./build-action-item-detail-helpers.ts";
import {
  AudienceInheritanceNotice,
  Field,
  PrioritySelect,
  WorkKindSelect,
} from "./build-action-item-detail-history.tsx";
import { TagTaxonomyPicker } from "./build-action-item-detail-comments.tsx";

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

export function ActionItemCreatePanel({
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

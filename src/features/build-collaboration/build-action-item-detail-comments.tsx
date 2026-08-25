"use client";
import type { FunctionReturnType } from "convex/server";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BUILD_ACTION_ITEM_TAGS,
  type BuildActionItemTag,
} from "../../../convex/build_action_item_tags";
import {
  BuildCollaborationAssetList,
} from "./BuildCollaborationAssetList.tsx";
import {
  CollaborationRichTextPreview,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  formatTimestamp,
  parseDocument,
} from "./model.ts";
import { Field } from "./build-action-item-detail-history.tsx";

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

const ACTION_ITEM_REACTIONS = ["acknowledged", "agree", "question"] as const;

export function ActionItemCommentCard({
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

export function TagTaxonomyPicker({
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

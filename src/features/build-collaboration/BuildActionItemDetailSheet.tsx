"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Sheet,
  SheetPopup,
} from "#/components/ui/sheet.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import {
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import { ActionItemCreatePanel } from "./build-action-item-detail-create.tsx";
import { ActionItemDetailPanel } from "./build-action-item-detail-panels.tsx";

export { ActionItemCommentCard } from "./build-action-item-detail-comments.tsx";
export { ActionItemStructurePanel } from "./build-action-item-detail-structure.tsx";
export {
  ActivityHistory,
  RevisionHistory,
} from "./build-action-item-detail-history.tsx";

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

export function BuildActionItemDetailSheet({
  buildId,
  canGoBack = false,
  canGoForward = false,
  focusedAssetId,
  onCreated,
  onOpenChange,
  onOpenCanonicalTarget,
  onGoBack = () => undefined,
  onGoForward = () => undefined,
  onReferenceOpen,
  open,
  organizationId,
  readOnly = false,
  tagOptions,
  target,
}: {
  buildId: Id<"activeBuilds">;
  canGoBack?: boolean;
  canGoForward?: boolean;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onCreated?: (actionItemId: Id<"buildActionItems">) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onReferenceOpen: (reference: CollaborationTagReference) => void;
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
  return (
    <Sheet modal={false} onOpenChange={onOpenChange} open={open}>
      <SheetPopup
        backdropClassName="hidden"
        className="pointer-events-auto h-svh max-h-svh w-full max-w-none shadow-2xl sm:w-[min(34vw,32rem)] sm:min-w-[24rem]"
        onKeyDown={(event) => {
          const historyShortcut =
            event.altKey &&
            !(event.ctrlKey || event.metaKey || event.shiftKey) &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight");
          if (!historyShortcut) {
            return;
          }
          event.preventDefault();
          if (event.key === "ArrowLeft" && canGoBack) {
            onGoBack();
          }
          if (event.key === "ArrowRight" && canGoForward) {
            onGoForward();
          }
        }}
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
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            detail={detail}
            focusedAssetId={focusedAssetId}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
            onOpenCanonicalTarget={onOpenCanonicalTarget}
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

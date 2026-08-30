"use client";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  SheetDescription,
  SheetFooter,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BuildDetailTargetHeader as DetailSheetHeader } from "../build-detail-targets/BuildDetailTargetHeader.tsx";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { VisibleActionItemDetail } from "./build-action-item-detail-visible.tsx";
import {
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  classifyCollaborationActionItem,
} from "./model.ts";

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

export function ActionItemDetailPanel({
  buildId,
  canGoBack,
  canGoForward,
  detail,
  focusedAssetId,
  onOpenCanonicalTarget,
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
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
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
  if (detail.item.systemMode === "generated_milestone_submilestone") {
    const classification = classifyCollaborationActionItem({
      _id: detail.item.actionItemId,
      canonicalBuildSubmilestoneId: detail.item.canonicalBuildSubmilestoneId,
      systemMode: detail.item.systemMode,
      systemPresentation: detail.item.systemPresentation,
    });
    if (classification.target.kind !== "submilestone") {
      return (
        <CanonicalCompanionUnavailablePanel
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onOpenChange={onOpenChange}
        />
      );
    }
    return (
      <CanonicalCompanionRedirectPanel
        actionItemId={detail.item.actionItemId}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canonicalId={classification.target.submilestoneId}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onOpenCanonicalTarget={onOpenCanonicalTarget}
        onOpenChange={onOpenChange}
      />
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

export function CanonicalCompanionUnavailablePanel({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onOpenChange,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <DetailSheetHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={() => onOpenChange(false)}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
      >
        <Badge variant="secondary">Generated companion</Badge>
        <SheetTitle>Canonical detail unavailable</SheetTitle>
        <SheetDescription>
          This generated companion has no valid Sub-milestone binding and
          cannot be edited as a generic Action Item.
        </SheetDescription>
      </DetailSheetHeader>
      <SheetFooter>
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

export function CanonicalCompanionRedirectPanel({
  actionItemId,
  canGoBack,
  canGoForward,
  canonicalId,
  onGoBack,
  onGoForward,
  onOpenCanonicalTarget,
  onOpenChange,
}: {
  actionItemId: Id<"buildActionItems">;
  canGoBack: boolean;
  canGoForward: boolean;
  canonicalId?: Id<"buildSubmilestones"> | null;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const redirectKey =
    canonicalId && onOpenCanonicalTarget
      ? `${actionItemId}:${canonicalId}`
      : null;
  const redirectedKey = useRef<string | null>(null);
  useEffect(() => {
    if (
      !(canonicalId && onOpenCanonicalTarget && redirectKey) ||
      redirectedKey.current === redirectKey
    ) {
      return;
    }
    redirectedKey.current = redirectKey;
    onOpenCanonicalTarget(
      {
        companionId: actionItemId,
        kind: "submilestone",
        submilestoneId: canonicalId,
      },
      { selectedTab: "collaboration" }
    );
  }, [actionItemId, canonicalId, onOpenCanonicalTarget, redirectKey]);
  return (
    <>
      <DetailSheetHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={() => onOpenChange(false)}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
      >
        <Badge variant="secondary">Generated companion</Badge>
        <SheetTitle>Sub-milestone collaboration</SheetTitle>
        <SheetDescription>
          This generated Action Item is a collaboration companion. Its canonical
          scope, evidence, assignments, materials, and review are owned by the
          unified Sub-milestone detail surface.
        </SheetDescription>
      </DetailSheetHeader>
      <SheetPanel>
        <Frame>
          <FramePanel className="space-y-3 text-sm">
            {canonicalId && onOpenCanonicalTarget ? (
              <p aria-live="polite">Opening the canonical Sub-milestone…</p>
            ) : (
              <>
                <p className="font-medium">Canonical detail unavailable</p>
                <p className="text-muted-foreground">
                  This generated companion has no valid Sub-milestone binding.
                  It cannot be edited as a generic Action Item.
                </p>
              </>
            )}
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

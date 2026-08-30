"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import { BuildCollaborationReferenceChip } from "./BuildCollaborationReference.tsx";
import {
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  toEditorReferenceKind,
} from "./model.ts";
import {
  statusLabel,
  transitionLabel,
  workKindLabel,
} from "./build-action-item-detail-helpers.ts";
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

export function ActionItemWorkflowPanel({
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

export function DetailContext({
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

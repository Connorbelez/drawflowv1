"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";

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

export function parseSnapshot(snapshotJson: string) {
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

export function dateInputValue(timestamp?: number) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

export function actionItemAge(createdAt: number) {
  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "1 day old";
  }
  return `${days} days old`;
}

export function formatCompactDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(timestamp);
}

export function workKindLabel(workKind: ActionWorkKind) {
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

export function statusLabel(status: ActionStatus) {
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

export function effectiveActionItemWorkKind(
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

export function relationDirectionLabel(
  relation: VisibleStructureContext["relations"][number]
) {
  if (relation.kind === "blocks") {
    return relation.direction === "outgoing" ? "Blocks" : "Blocked by";
  }
  return relation.kind === "duplicate" ? "Duplicate" : "Related";
}

export function transitionLabel(
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

export function newActionItemRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`;
}

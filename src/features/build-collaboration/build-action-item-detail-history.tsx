"use client";

import type { FunctionReturnType } from "convex/server";
import {
  History,
  ShieldCheck,
} from "lucide-react";
import { Label } from "#/components/ui/label.tsx";
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
  formatTimestamp,
} from "./model.ts";
import { parseSnapshot } from "./build-action-item-detail-helpers.ts";

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

export function RevisionHistory({
  detail,
}: {
  detail: VisibleActionItemDetail;
}) {
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

export function ActivityHistory({
  detail,
}: {
  detail: VisibleActionItemDetail;
}) {
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

export function AudienceInheritanceNotice({
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

export function PrioritySelect({
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

export function WorkKindSelect({
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

export function Field({
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

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

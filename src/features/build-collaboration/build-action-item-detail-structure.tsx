"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
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
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";
import {
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import { ActionItemCreatePanel } from "./build-action-item-detail-create.tsx";
import { relationDirectionLabel } from "./build-action-item-detail-helpers.ts";

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

export function ActionItemStructurePanel({
  capabilities,
  buildId,
  detail,
  onReferenceOpen,
  organizationId,
  overrideReason,
  readOnly,
  tagOptions,
}: {
  capabilities?: BuildActionItemStructureCapabilities;
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
  const canCreateChild =
    capabilities?.createChild ??
    (structure?.state === "visible" ? structure.viewerCanCreateChild : false);

  useEffect(() => {
    if (readOnly || !canCreateChild) {
      setCreatingChild(false);
    }
  }, [canCreateChild, readOnly]);

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
  const canAddChecklist =
    capabilities?.addChecklist ?? visibleStructure.viewerCanAddChecklist;
  const canLinkRelation =
    capabilities?.linkRelation ?? visibleStructure.viewerCanLinkRelation;
  const canRepairRelation =
    capabilities?.repairRelation ?? visibleStructure.viewerCanRepairRelations;
  const canToggleChecklist = capabilities?.toggleChecklist ?? true;
  const canUnlinkRelation =
    capabilities?.unlinkRelation ?? visibleStructure.viewerCanLinkRelation;
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
        {!readOnly && canCreateChild && !detail.item.parentActionItemId ? (
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
                disabled={busy || readOnly || !canToggleChecklist}
                onCheckedChange={async () => {
                  if (readOnly || !canToggleChecklist) {
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
          {!readOnly && canAddChecklist ? (
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
          canAdd={canLinkRelation}
          canRemove={canUnlinkRelation}
          label="Depends on"
          onAdd={() => linkDependency("depends_on")}
          onOpen={openRelatedActionItem}
          onRemove={unlinkDependency}
          onSelectionChange={setDependsOnActionItemId}
          options={relatedOptions}
          readOnly={readOnly || !(canLinkRelation || canUnlinkRelation)}
          relations={visibleStructure.relations.filter(
            (relation) =>
              relation.kind === "blocks" && relation.direction === "incoming"
          )}
          selection={dependsOnActionItemId}
        />
        <DependencyDisclosure
          busy={busy}
          canAdd={canLinkRelation}
          canRemove={canUnlinkRelation}
          label="Unblocks"
          onAdd={() => linkDependency("unblocks")}
          onOpen={openRelatedActionItem}
          onRemove={unlinkDependency}
          onSelectionChange={setUnblocksActionItemId}
          options={relatedOptions}
          readOnly={readOnly || !(canLinkRelation || canUnlinkRelation)}
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
                  canRepairRelation ? (
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
          {!readOnly && canLinkRelation ? (
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

      {!readOnly && canCreateChild && creatingChild ? (
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

export function DependencyDisclosure({
  busy,
  canAdd,
  canRemove,
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
  canAdd: boolean;
  canRemove: boolean;
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
                    {!readOnly && canRemove && relation.status === "active" ? (
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
            {readOnly || !canAdd ? null : (
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

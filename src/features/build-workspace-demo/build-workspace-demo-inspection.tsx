import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { parseNumber } from "./build-workspace-demo-contracts";
import { Field } from "./build-workspace-demo-issues";
import type { DependencyHardness } from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function DependencyList({
  dependencies,
}: {
  dependencies: ReturnType<typeof useBuildWorkspace>["dependencies"];
}) {
  const workspace = useBuildWorkspace();
  const [error, setError] = useState("");

  if (dependencies.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">No dependencies attached.</p>
    );
  }

  return (
    <div className="grid gap-2">
      {error ? (
        <div
          className="rounded-md border border-red-300/30 bg-red-500/10 p-2 text-red-700 text-xs dark:text-red-100"
          data-testid="dependency-error"
        >
          {error}
        </div>
      ) : null}
      {dependencies.map((dependency) => {
        const from = workspace.milestones.find(
          (milestone) => milestone.id === dependency.fromMilestoneId
        );
        const to = workspace.milestones.find(
          (milestone) => milestone.id === dependency.toMilestoneId
        );

        return (
          <div
            className="grid gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs sm:grid-cols-[1fr_auto_auto]"
            key={dependency.id}
          >
            <div className="min-w-0 truncate">
              {from?.code} blocks {to?.code}
            </div>
            <NativeSelect
              data-testid={`dependency-hardness-${dependency.id}`}
              disabled={
                dependency.isSystem ||
                workspace.build.proposalStatus === "submitted"
              }
              onChange={(event) => {
                setError("");
                void workspace
                  .setDependencyHardness(
                    dependency.id,
                    event.currentTarget.value as DependencyHardness
                  )
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Dependency update failed."
                    )
                  );
              }}
              value={dependency.hardness}
            >
              <NativeSelectOption value="hard">Hard</NativeSelectOption>
              <NativeSelectOption value="soft">Soft</NativeSelectOption>
            </NativeSelect>
            <Button
              data-testid={`dependency-remove-${dependency.id}`}
              disabled={workspace.build.proposalStatus === "submitted"}
              onClick={() => {
                setError("");
                void workspace
                  .removeDependency(dependency.id)
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Dependency removal failed."
                    )
                  );
              }}
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function InspectionDrawer({
  drawer,
  onClose,
}: {
  drawer: "audit" | "outbox";
  onClose: () => void;
}) {
  const workspace = useBuildWorkspace();
  const items =
    drawer === "audit" ? workspace.auditEvents : workspace.outboxEvents;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 max-h-[70vh] w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-popover shadow-2xl shadow-foreground/15"
      data-testid={`workspace-${drawer}-drawer`}
    >
      <div className="flex items-center justify-between border-border border-b p-3">
        <h2 className="font-semibold text-sm">
          {drawer === "audit" ? "Audit Events" : "Event Outbox"}
        </h2>
        <Button onClick={onClose} size="icon-xs" variant="ghost">
          Close
        </Button>
      </div>
      <div className="grid max-h-[58vh] gap-2 overflow-auto p-3">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-xs">No records yet.</p>
        ) : (
          items.map((item: any) => (
            <div
              className="rounded-md border border-border bg-muted/30 p-2 text-xs"
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {drawer === "audit" ? item.message : item.eventType}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {format(new Date(item.timestamp), "MMM d, HH:mm")}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {drawer === "audit"
                  ? `${item.actor} / ${item.command}`
                  : `${item.status} / ${item.relatedEntity}`}
              </p>
              <p className="mt-1 text-muted-foreground">
                {drawer === "audit" ? item.reason : item.payloadPreview}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AddMilestoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useBuildWorkspace();
  const [name, setName] = useState("Exterior envelope");
  const [cost, setCost] = useState("188000");
  const [duration, setDuration] = useState("24");
  const [drawGroupId, setDrawGroupId] = useState(
    workspace.drawGroups[0]?.id ?? ""
  );

  const addMilestone = () => {
    workspace.addMilestone({
      drawGroupId,
      estimatedCost: parseNumber(cost, 0),
      estimatedDurationDays: Math.max(1, parseNumber(duration, 14)),
      name,
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="border-border bg-popover text-foreground sm:max-w-md"
        data-testid="add-milestone-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              data-testid="add-milestone-name-input"
              onChange={(event) => setName(event.currentTarget.value)}
              value={name}
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Cost">
              <Input
                data-testid="add-milestone-cost-input"
                inputMode="numeric"
                onChange={(event) => setCost(event.currentTarget.value)}
                value={cost}
              />
            </Field>
            <Field label="Days">
              <Input
                data-testid="add-milestone-days-input"
                inputMode="numeric"
                onChange={(event) => setDuration(event.currentTarget.value)}
                value={duration}
              />
            </Field>
            <Field label="Draw">
              <NativeSelect
                className="w-full"
                data-testid="add-milestone-draw-select"
                onChange={(event) => setDrawGroupId(event.currentTarget.value)}
                value={drawGroupId}
              >
                {workspace.drawGroups.map((drawGroup) => (
                  <NativeSelectOption key={drawGroup.id} value={drawGroup.id}>
                    {drawGroup.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="add-milestone-submit"
            disabled={!name.trim()}
            onClick={addMilestone}
          >
            <Plus />
            Add milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

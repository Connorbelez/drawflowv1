import { format } from "date-fns";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { ProductionProposalDrawScheduleEditor } from "#/features/production-proposals/ProductionProposalDrawScheduleEditor.tsx";
import { compactMoney, statusLabels } from "./build-workspace-demo-contracts";
import type { DrawGroup, DrawGroupPatch } from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function DrawGroupDetailSheet({
  draw,
  open,
  onOpenChange,
}: {
  draw: DrawGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useBuildWorkspace();
  const [drawAmounts, setDrawAmounts] = useState<Record<string, string>>({});
  const [drawLabels, setDrawLabels] = useState<Record<string, string>>({});
  const [drawTimingDays, setDrawTimingDays] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState("");
  const canEditDraws =
    Boolean(workspace.updateDrawGroup) &&
    !(
      workspace.mode === "proposal" &&
      workspace.build.proposalStatus === "submitted"
    );
  const timingDay = draw.timingDay ?? 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    setDrawAmounts({ [draw.id]: String(draw.amount) });
    setDrawLabels({ [draw.id]: draw.label });
    setDrawTimingDays({ [draw.id]: String(timingDay) });
    setError("");
  }, [draw.amount, draw.id, draw.label, open, timingDay]);

  const updateDraw = async (
    _drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      timingDay: number;
    }
  ) => {
    if (!workspace.updateDrawGroup) {
      return;
    }
    setError("");
    const drawPatch: DrawGroupPatch = {
      amount: patch.amountCents / 100,
      label: patch.label,
      timingDay: patch.timingDay,
    };
    try {
      await workspace.updateDrawGroup(draw.id, drawPatch);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update draw."
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto border-border bg-popover text-foreground sm:max-w-lg"
        data-testid="draw-detail-sheet"
      >
        <SheetHeader className="border-border border-b">
          <SheetTitle className="text-foreground">Edit draw</SheetTitle>
          <SheetDescription>
            Update the selected reimbursement draw row used by the Gantt plan.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="grid gap-4">
          <div className="grid gap-1 text-muted-foreground text-xs">
            <span className="font-medium text-foreground">{draw.label}</span>
            <span>
              {compactMoney(draw.amount)} / {statusLabels[draw.status]}
            </span>
            <span>
              Planned day {timingDay} /{" "}
              {format(draw.plannedAt ?? draw.eligibleAt, "MMM d, yyyy")}
            </span>
          </div>
          {error ? (
            <div
              className="border-red-300/40 border-l-2 bg-red-500/10 px-3 py-2 text-red-700 text-xs dark:text-red-100"
              data-testid="draw-detail-error"
            >
              {error}
            </div>
          ) : null}
          <ProductionProposalDrawScheduleEditor
            canEditDraws={canEditDraws}
            drawAmounts={drawAmounts}
            drawLabels={drawLabels}
            draws={[
              {
                amountCents: Math.round(draw.amount * 100),
                drawKey: draw.id,
                label: draw.label,
                timingDay,
              },
            ]}
            drawTimingDays={drawTimingDays}
            onAmountChange={(drawKey, value) =>
              setDrawAmounts((current) => ({ ...current, [drawKey]: value }))
            }
            onCommit={updateDraw}
            onLabelChange={(drawKey, value) =>
              setDrawLabels((current) => ({ ...current, [drawKey]: value }))
            }
            onTimingChange={(drawKey, value) =>
              setDrawTimingDays((current) => ({
                ...current,
                [drawKey]: value,
              }))
            }
          />
        </SheetPanel>
        <SheetFooter>
          <Button
            data-testid="draw-detail-close"
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

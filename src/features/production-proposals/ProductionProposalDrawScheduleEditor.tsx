import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";

export interface ProductionProposalDrawScheduleRow {
  amountCents: number;
  drawKey: string;
  label: string;
  timingDay: number;
}

export interface ProductionProposalDrawSchedulePatch {
  amountCents: number;
  label: string;
  timingDay: number;
}

export interface ProductionProposalDrawScheduleEditorProps {
  canEditDraws: boolean;
  drawAmounts: Record<string, string>;
  drawLabels: Record<string, string>;
  draws: ProductionProposalDrawScheduleRow[];
  drawTimingDays: Record<string, string>;
  onAmountChange: (drawKey: string, value: string) => void;
  onCommit: (
    drawKey: string,
    patch: ProductionProposalDrawSchedulePatch,
  ) => void;
  onLabelChange: (drawKey: string, value: string) => void;
  onTimingChange: (drawKey: string, value: string) => void;
}

export function ProductionProposalDrawScheduleEditor({
  canEditDraws,
  drawAmounts,
  drawLabels,
  draws,
  drawTimingDays,
  onAmountChange,
  onCommit,
  onLabelChange,
  onTimingChange,
}: ProductionProposalDrawScheduleEditorProps) {
  if (draws.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No proposal draw rows are available for review edits.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {draws.map((draw) => {
        const amountValue =
          drawAmounts[draw.drawKey] ??
          centsToDollarInputValue(draw.amountCents);
        const labelValue = drawLabels[draw.drawKey] ?? draw.label;
        const timingValue =
          drawTimingDays[draw.drawKey] ?? String(draw.timingDay);
        const isDirty =
          parseDollarAmountToCents(amountValue) !== draw.amountCents ||
          labelValue.trim() !== draw.label ||
          parseInteger(timingValue) !== draw.timingDay;

        return (
          <fieldset
            className="grid gap-3 border-b pb-4 last:border-b-0 last:pb-0"
            key={draw.drawKey}
          >
            <legend className="mb-1 font-medium text-sm">
              {draw.drawKey}
            </legend>
            <div className="grid gap-2">
              <Label htmlFor={`draw-label-${draw.drawKey}`}>
                {draw.drawKey} label
              </Label>
              <Input
                id={`draw-label-${draw.drawKey}`}
                onChange={(event) =>
                  onLabelChange(draw.drawKey, event.target.value)
                }
                value={labelValue}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`draw-amount-${draw.drawKey}`}>
                  Amount dollars
                </Label>
                <Input
                  id={`draw-amount-${draw.drawKey}`}
                  inputMode="decimal"
                  onChange={(event) =>
                    onAmountChange(draw.drawKey, event.target.value)
                  }
                  placeholder="$0"
                  value={amountValue}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`draw-timing-${draw.drawKey}`}>
                  Timing day
                </Label>
                <Input
                  id={`draw-timing-${draw.drawKey}`}
                  inputMode="numeric"
                  onChange={(event) =>
                    onTimingChange(draw.drawKey, event.target.value)
                  }
                  value={timingValue}
                />
              </div>
            </div>
            <div>
              <Button
                disabled={!(canEditDraws && isDirty)}
                onClick={() =>
                  onCommit(draw.drawKey, {
                    amountCents: parseDollarAmountToCents(amountValue),
                    label: labelValue,
                    timingDay: parseInteger(timingValue),
                  })
                }
                size="sm"
                variant="outline"
              >
                Save draw row
              </Button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function centsToDollarInputValue(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export function parseDollarAmountToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

export function parseInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

import {
  Check,
  FileImage,
  UploadCloud,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useState,
} from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import {
  getMilestonePaymentSchedule,
  getMilestonePlannedEndX,
} from "./-timeline-milestone-schedule.ts";
import {
  money,
  resolveTimelineSiteVisitMilestoneKey,
} from "./TimelineWorkspaceDefaults.ts";
import { formatFileSize, formatTimelineDay } from "./TimelineWorkspaceDrawUtils.ts";
import type {
  DrawAvailabilityDatum,
  TimelineCompletionClaimInput,
  TimelineSiteVisitRequestInput,
} from "./TimelineWorkspaceTypes.ts";
import type {
  DemoEvidenceAsset,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";

export async function requestDemoTimelineSiteVisit({
  activeItem,
  includedItemIds,
  milestone,
  note,
  requestSiteVisit,
  seedDemo,
  workspace,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  includedItemIds: string[];
  milestone: DemoMilestone;
  note: string;
  requestSiteVisit: (input: any) => Promise<{
    tokenExpiresAt: number;
    url: string;
    visitId: string;
  }>;
  seedDemo: (input: Record<string, never>) => Promise<unknown>;
  workspace: any;
}): Promise<TimelineSiteVisitRequestInput> {
  if (workspace?.needsSeed) {
    await seedDemo({});
  }
  const result = await requestSiteVisit({
    includedMilestoneKeys: includedItemIds.map(
      resolveTimelineSiteVisitMilestoneKey
    ),
    milestoneKey: resolveTimelineSiteVisitMilestoneKey(activeItem.id),
    persona: "lender_admin",
    reason:
      note ||
      `Field verification requested from timeline for ${milestone.name}.`,
  });
  return {
    requestedDay: Math.round(activeItem.x),
    tokenExpiresAt: result.tokenExpiresAt,
    url: result.url,
    visitId: result.visitId,
  };
}

export function CompletionClaimPanel({
  activeItem,
  evidenceCount,
  onCompleteMilestone,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  evidenceCount: number;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
}) {
  const milestone = activeItem.data;
  const claim = milestone?.completionClaim;
  const schedule = getMilestonePaymentSchedule(activeItem);

  if (!milestone) {
    return null;
  }

  const completeMilestone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const completedDay = Math.max(
      0,
      Math.round(Number(formData.get("completedDay") ?? schedule.endX))
    );
    const actualCostRaw = String(formData.get("actualCost") ?? "").trim();
    const actualCost =
      actualCostRaw.length === 0
        ? undefined
        : Math.max(0, Math.round(Number(actualCostRaw)));
    const qualityRatingRaw = String(formData.get("qualityRating") ?? "").trim();
    const qualityRating =
      qualityRatingRaw.length === 0
        ? undefined
        : Math.max(1, Math.min(5, Math.round(Number(qualityRatingRaw))));
    const note = String(formData.get("completionNote") ?? "").trim();

    if (!Number.isFinite(completedDay)) {
      return;
    }

    if (actualCost !== undefined && !Number.isFinite(actualCost)) {
      return;
    }

    if (qualityRating !== undefined && !Number.isFinite(qualityRating)) {
      return;
    }

    onCompleteMilestone(activeItem.id, {
      ...(actualCost === undefined ? {} : { actualCost }),
      completedDay,
      ...(note ? { note } : {}),
      ...(qualityRating === undefined ? {} : { qualityRating }),
      ...(qualityRating !== undefined && note ? { qualityNote: note } : {}),
    });
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
      data-testid={`selected-draw-completion-form-${activeItem.id}`}
      key={`${activeItem.id}-${claim?.submittedAt ?? "draft"}`}
      onSubmit={completeMilestone}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Indicate completion
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Backdate the claim when work finished; actual cost is optional.
          </p>
        </div>
        <Badge variant={claim ? "success" : "outline"}>
          {claim ? "Filed" : "Builder"}
        </Badge>
      </div>

      {evidenceCount === 0 ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-completion-warning-${activeItem.id}`}
        >
          No evidence images attached. Completion can be filed, but the package
          will still need proof before lender review.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Completion day
          </span>
          <Input
            data-testid={`selected-draw-completion-day-input-${activeItem.id}`}
            defaultValue={
              claim?.completedDay ??
              Math.round(getMilestonePlannedEndX(activeItem))
            }
            min={0}
            name="completedDay"
            nativeInput
            size="sm"
            type="number"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Actual cost
          </span>
          <Input
            data-testid={`selected-draw-actual-cost-input-${activeItem.id}`}
            defaultValue={claim?.actualCost ?? ""}
            min={0}
            name="actualCost"
            nativeInput
            placeholder="Optional"
            size="sm"
            step={1000}
            type="number"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Work quality
          </span>
          <NativeSelect
            data-testid={`selected-draw-quality-rating-${activeItem.id}`}
            defaultValue={
              claim?.qualityRating === undefined
                ? ""
                : String(claim.qualityRating)
            }
            name="qualityRating"
            size="sm"
          >
            <NativeSelectOption value="">Not rated</NativeSelectOption>
            <NativeSelectOption value="5">5 · Excellent</NativeSelectOption>
            <NativeSelectOption value="4">4 · Good</NativeSelectOption>
            <NativeSelectOption value="3">3 · Acceptable</NativeSelectOption>
            <NativeSelectOption value="2">2 · Needs rework</NativeSelectOption>
            <NativeSelectOption value="1">1 · Deficient</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="font-medium text-[10px] text-muted-foreground uppercase">
          Note
        </span>
        <Textarea
          className="min-h-16 resize-none text-sm"
          data-testid={`selected-draw-completion-note-${activeItem.id}`}
          defaultValue={claim?.note ?? ""}
          name="completionNote"
          placeholder="Scope note, variance, or lender context"
        />
      </label>

      <Button
        className="w-full"
        data-testid={`selected-draw-submit-completion-${activeItem.id}`}
        size="sm"
        type="submit"
      >
        <Check />
        {claim ? "Update completion" : "Mark milestone complete"}
      </Button>
    </form>
  );
}

export function EvidencePackagePanel({
  activeItem,
  addEvidenceFiles,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
}: {
  activeItem: TimelineItem<DemoMilestone>;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const milestone = activeItem.data;
  const assets = milestone?.evidencePackage?.assets ?? [];

  if (!milestone) {
    return null;
  }

  const inputId = `selected-evidence-input-${activeItem.id}`;
  const tagOptions = [milestone.name, ...milestone.subMilestones];
  const acceptFiles = (fileList: FileList | null) => {
    addEvidenceFiles(activeItem.id, Array.from(fileList ?? []));
  };
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
      data-testid={`selected-draw-evidence-package-${activeItem.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Evidence package
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Label images and tag the milestone or sub-milestone they prove.
          </p>
        </div>
        <Badge
          data-testid={`selected-draw-evidence-count-${activeItem.id}`}
          variant="outline"
        >
          {assets.length} images
        </Badge>
      </div>

      <input
        accept="image/*"
        className="sr-only"
        data-testid={`selected-draw-evidence-input-${activeItem.id}`}
        id={inputId}
        multiple
        onChange={handleInputChange}
        type="file"
      />
      <label
        className={cn(
          "grid cursor-pointer place-items-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragging
            ? "border-sky-400 bg-sky-500/10 text-sky-700"
            : "border-border bg-background/60 text-muted-foreground hover:border-sky-300 hover:bg-sky-500/5"
        )}
        data-testid={`selected-draw-evidence-dropzone-${activeItem.id}`}
        htmlFor={inputId}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={handleDrop}
      >
        <UploadCloud className="mb-2 size-5" />
        <span className="font-medium text-xs">Drop labeled proof images</span>
        <span className="mt-1 text-[11px]">or browse from this device</span>
      </label>

      <div className="grid max-h-[34svh] gap-2 overflow-y-auto pr-1">
        {assets.length === 0 ? (
          <div className="rounded-md border border-border bg-background/55 px-3 py-4 text-center text-muted-foreground text-xs">
            No images uploaded.
          </div>
        ) : (
          assets.map((asset) => (
            <EvidenceAssetCard
              asset={asset}
              itemId={activeItem.id}
              key={asset.id}
              onRemoveEvidenceAsset={onRemoveEvidenceAsset}
              onUpdateEvidenceAsset={onUpdateEvidenceAsset}
              tagOptions={tagOptions}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function EvidenceAssetCard({
  asset,
  itemId,
  onRemoveEvidenceAsset,
  onUpdateEvidenceAsset,
  tagOptions,
}: {
  asset: DemoEvidenceAsset;
  itemId: string;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  tagOptions: string[];
}) {
  return (
    <article
      className="grid grid-cols-[64px_minmax(0,1fr)_32px] gap-2 rounded-md border border-border bg-background/70 p-2"
      data-testid={`selected-draw-evidence-asset-${asset.id}`}
    >
      <div className="grid size-16 place-items-center overflow-hidden rounded-md border border-border bg-muted/35">
        {asset.previewUrl ? (
          <img
            alt=""
            className="size-full object-cover"
            src={asset.previewUrl}
          />
        ) : (
          <FileImage className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
        <Input
          aria-label="Evidence label"
          data-testid={`selected-draw-evidence-label-${asset.id}`}
          nativeInput
          onChange={(event) =>
            onUpdateEvidenceAsset(itemId, asset.id, {
              label: event.currentTarget.value,
            })
          }
          size="sm"
          value={asset.label}
        />
        <select
          aria-label="Evidence tag"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
          data-testid={`selected-draw-evidence-tag-${asset.id}`}
          onChange={(event) =>
            onUpdateEvidenceAsset(itemId, asset.id, {
              tag: event.currentTarget.value,
            })
          }
          value={asset.tag}
        >
          {tagOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="truncate text-[11px] text-muted-foreground">
          {asset.fileName} · {formatFileSize(asset.size)}
        </p>
      </div>
      <button
        aria-label={`Remove ${asset.label}`}
        className="relative z-10 grid size-7 place-items-center self-start rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`selected-draw-evidence-remove-${asset.id}`}
        onClick={() => onRemoveEvidenceAsset(itemId, asset.id)}
        type="button"
      >
        <X className="size-4" />
      </button>
    </article>
  );
}

export function DrawAvailabilityMetrics({
  endingAvailability,
  probeDrawAvailability,
}: {
  endingAvailability: DrawAvailabilityDatum;
  probeDrawAvailability: DrawAvailabilityDatum | null;
}) {
  return (
    <div className="mt-3 grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-5">
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Top line
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-total-available"
        >
          {money(endingAvailability.totalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Interest-bearing
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-interest-bearing"
        >
          {money(endingAvailability.interestBearingDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Additional
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-additional-available"
        >
          {money(endingAvailability.additionalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Probe delta
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-probe-delta"
        >
          {probeDrawAvailability === null
            ? "Hover"
            : money(probeDrawAvailability.additionalAvailableDraw)}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 sm:px-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Total interest
        </p>
        <p
          className="mt-1 font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-probe-interest-accrued"
        >
          {probeDrawAvailability === null
            ? money(endingAvailability.totalInterestAccrued)
            : money(probeDrawAvailability.totalInterestAccrued)}
        </p>
      </div>
    </div>
  );
}

export function DrawAvailabilityDeltaReadout({
  probeDrawAvailability,
}: {
  probeDrawAvailability: DrawAvailabilityDatum | null;
}) {
  return (
    <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-sky-700 dark:text-sky-100">
          <span className="size-2 rounded-full bg-sky-500" />
          Delta between lines
        </span>
        <span
          className="font-semibold text-foreground tabular-nums"
          data-testid="timeline-draw-delta-readout"
        >
          {probeDrawAvailability === null
            ? "Hover the chart or roadmap"
            : `${formatTimelineDay(probeDrawAvailability.day)}: ${money(
                probeDrawAvailability.additionalAvailableDraw
              )} delta, ${money(
                probeDrawAvailability.interestBearingDraw
              )} interest-bearing, ${money(
                probeDrawAvailability.totalInterestAccrued
              )} total interest accrued`}
        </span>
      </div>
    </div>
  );
}

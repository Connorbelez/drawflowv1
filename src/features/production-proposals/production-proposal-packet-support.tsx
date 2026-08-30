import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Check,
  Database,
  FileText,
  Landmark,
  Layers3,
  Pencil,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { type ReactNode } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Select } from "#/components/ui/select.tsx";
import {
  type BuildPermitViewerDocument,
  BuildPermitViewerDrawer,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import type { ProductionDocument } from "./production-proposal-surface-contracts";
import { formatPacketDate } from "./production-proposal-packet-utils.tsx";
import { formatCents } from "./production-proposal-surface-shared";

export function PacketClosingFinancialsSummary({
  approvedAmountCents,
  borrowerCoPayCents,
  closingGapCents,
  closingState,
  lenderDrawPolicyLimitCents,
  mergedWithReview = false,
  scheduledReimbursementsCents,
  totalBudgetCents,
  borrowerStartingCashCents,
}: {
  approvedAmountCents: number;
  borrowerCoPayCents: number;
  closingGapCents: number;
  closingState: string;
  lenderDrawPolicyLimitCents: number;
  mergedWithReview?: boolean;
  scheduledReimbursementsCents: number;
  totalBudgetCents: number;
  borrowerStartingCashCents: number;
}) {
  return (
    <div className="grid gap-4">
      {mergedWithReview ? null : (
        <div className="grid gap-2 sm:grid-cols-3">
          <PacketSummaryMetric
            icon={<Banknote className="size-4" />}
            label="Budget"
            value={formatCents(totalBudgetCents)}
          />
          <PacketSummaryMetric
            icon={<Landmark className="size-4" />}
            label="Approved principal"
            value={formatCents(approvedAmountCents)}
          />
          <PacketSummaryMetric
            icon={<ReceiptText className="size-4" />}
            label="Scheduled reimbursements"
            value={formatCents(scheduledReimbursementsCents)}
          />
        </div>
      )}

      <div className="grid gap-3">
        <PacketFinancialProgress
          label="Scheduled reimbursements"
          referenceCents={totalBudgetCents}
          valueCents={scheduledReimbursementsCents}
        />
        <PacketFinancialProgress
          label="Borrower Contribution"
          referenceCents={totalBudgetCents}
          valueCents={borrowerCoPayCents}
        />
        {mergedWithReview ? null : (
          <PacketFinancialProgress
            label="Borrower starting cash"
            referenceCents={totalBudgetCents}
            valueCents={borrowerStartingCashCents}
          />
        )}
      </div>

      <dl className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
        <PacketCompactDetail
          label="Draw policy limit"
          value={formatCents(lenderDrawPolicyLimitCents)}
        />
        <PacketCompactDetail
          label="Funding gap"
          value={formatCents(closingGapCents)}
        />
        <PacketCompactDetail label="Closing state" value={closingState} />
      </dl>
    </div>
  );
}

export function PacketBuildDetailsSummary({
  drawCount,
  milestoneCount,
  permitFileName,
  permitWaiverReason,
  projectDurationDays,
  submilestoneCount,
}: {
  drawCount: number;
  milestoneCount: number;
  permitFileName?: string;
  permitWaiverReason?: string;
  projectDurationDays: number;
  submilestoneCount: number;
}) {
  const permitStatus = permitFileName
    ? "Permit linked"
    : permitWaiverReason
      ? "Permit waived"
      : "Permit missing";
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PacketSummaryMetric
          icon={<Layers3 className="size-4" />}
          label="Milestones"
          value={String(milestoneCount)}
        />
        <PacketSummaryMetric
          icon={<ClipboardListIcon />}
          label="Submilestones"
          value={String(submilestoneCount)}
        />
        <PacketSummaryMetric
          icon={<WalletCards className="size-4" />}
          label="Draws"
          value={String(drawCount)}
        />
        <PacketSummaryMetric
          icon={<CalendarClock className="size-4" />}
          label="Duration"
          value={`${projectDurationDays} days`}
        />
      </div>
      <div className="flex flex-wrap items-start gap-3 border-t pt-3">
        <div className="min-w-48 flex-1">
          <div className="text-muted-foreground text-xs">Permit</div>
          <div className="mt-1 truncate font-medium text-sm">
            {permitFileName ?? permitWaiverReason ?? "No permit packet linked"}
          </div>
        </div>
        <Badge
          variant={
            permitFileName
              ? "success"
              : permitWaiverReason
                ? "outline"
                : "warning"
          }
        >
          {permitStatus}
        </Badge>
      </div>
    </div>
  );
}

export function PacketPermitUploadPanel({
  canUpload,
  onUpload,
  permit,
  permitViewerDocument,
  permitWaiverReason,
}: {
  canUpload: boolean;
  onUpload: (files: File[]) => Promise<void>;
  permit?: ProductionDocument;
  permitViewerDocument?: BuildPermitViewerDocument | null;
  permitWaiverReason?: string;
}) {
  if (permit) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-foreground ring-1 ring-primary/25">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Permit PDF linked</Badge>
              <span className="truncate font-medium text-sm">
                {permit.fileName}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              This packet is available for lender review and closing checks.
            </p>
          </div>
        </div>
        <BuildPermitViewerDrawer permit={permitViewerDocument} size="sm" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/45 p-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background text-warning shadow-xs/5 ring-1 ring-border">
          <AlertTriangle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={permitWaiverReason ? "outline" : "warning"}>
              {permitWaiverReason ? "Permit waived" : "Permit missing"}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Approval requires permit upload or audited waiver.
            </span>
          </div>
          {permitWaiverReason ? (
            <p className="mt-1 text-sm">{permitWaiverReason}</p>
          ) : null}
        </div>
      </div>
      {canUpload ? (
        <FileUploader
          accept="application/pdf,.pdf,.png,.jpg,.jpeg"
          actionLabel="Upload permit"
          description="Drop the issued permit or browse from your device."
          helperText="PDF preferred. Images are accepted when the municipality issued the permit as an image."
          inputLabel="Select permit document"
          multiple={false}
          onUpload={onUpload}
          title="Permit packet"
        />
      ) : null}
    </div>
  );
}

function PacketSummaryMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/45 px-3 py-2 ring-1 ring-border/70">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background text-muted-foreground shadow-xs/5 ring-1 ring-border">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-muted-foreground text-xs">{label}</div>
        <div className="truncate font-semibold text-sm">{value}</div>
      </div>
    </div>
  );
}

function PacketCompactDetail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function PacketFinancialProgress({
  label,
  referenceCents,
  valueCents,
}: {
  label: string;
  referenceCents: number;
  valueCents: number;
}) {
  const percent =
    referenceCents > 0
      ? Math.min(100, Math.max(0, (valueCents / referenceCents) * 100))
      : 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatCents(valueCents)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ClipboardListIcon() {
  return <Database className="size-4" />;
}

export function PacketProposedStartDateControl({
  canEdit,
  draft,
  editing,
  onCancel,
  onDraftChange,
  onEdit,
  onSave,
  pending,
  value,
}: {
  canEdit: boolean;
  draft: string;
  editing: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  pending: boolean;
  value?: string;
}) {
  if (editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          aria-label="Proposed start date"
          className="h-8 w-38"
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          type="date"
          value={draft}
        />
        <Button
          aria-label="Save proposed start date"
          loading={pending}
          onClick={onSave}
          size="icon-xs"
          title="Save proposed start date"
        >
          <Check aria-hidden />
        </Button>
        <Button
          aria-label="Cancel proposed start date edit"
          disabled={pending}
          onClick={onCancel}
          size="icon-xs"
          title="Cancel edit"
          variant="ghost"
        >
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>{value ? formatPacketDate(value) : "Not set"}</span>
      {canEdit ? (
        <Button
          aria-label="Edit proposed start date"
          onClick={onEdit}
          size="icon-xs"
          title="Edit proposed start date"
          variant="ghost"
        >
          <Pencil aria-hidden />
        </Button>
      ) : null}
    </span>
  );
}

export function PacketComputedMilestoneValue({
  align = "left",
  label,
  value,
}: {
  align?: "left" | "right";
  label: string;
  value: string;
}) {
  return (
    <div
      className={`grid gap-0.5 ${align === "right" ? "justify-items-end" : ""}`}
    >
      <span>{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export function PacketDateDisplayToggle({
  mode,
  onModeChange,
}: {
  mode: "relative" | "real";
  onModeChange: (mode: "relative" | "real") => void;
}) {
  return (
    <div
      aria-label="Packet date display"
      className="inline-flex rounded-lg border bg-background p-0.5"
      role="group"
    >
      <Button
        aria-pressed={mode === "relative"}
        onClick={() => onModeChange("relative")}
        size="sm"
        variant={mode === "relative" ? "secondary" : "ghost"}
      >
        Relative
      </Button>
      <Button
        aria-pressed={mode === "real"}
        onClick={() => onModeChange("real")}
        size="sm"
        variant={mode === "real" ? "secondary" : "ghost"}
      >
        Real dates
      </Button>
    </div>
  );
}

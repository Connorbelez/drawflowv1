import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { EditableNumberChip } from "#/components/ui/editable-chip.tsx";
import type { ProductionProposal } from "./production-proposal-surface-contracts";
import {
  productionProposalActionErrorMessage,
  statusLabel,
  formatCents,
  formatInterestAnnualBps,
  formatInterestRateDraft,
  parseInterestRateDraftToBps,
} from "./production-proposal-surface-shared";

export function ProposalReviewHeaderSummary({
  approvedAmountCents,
  canEditApprovedAmount,
  canEditInterestRate,
  minimumApprovedAmountCents,
  onUpdateApprovedAmount,
  onUpdateInterestRate,
  proposal,
}: {
  approvedAmountCents: number;
  canEditApprovedAmount: boolean;
  canEditInterestRate: boolean;
  minimumApprovedAmountCents: number;
  onUpdateApprovedAmount?: (
    approvedAmountCents: number
  ) => Promise<unknown> | unknown;
  onUpdateInterestRate?: (
    interestAnnualBps: number
  ) => Promise<unknown> | unknown;
  proposal: ProductionProposal;
}) {
  const [optimisticApprovedAmount, setOptimisticApprovedAmount] = useState<{
    previousCents: number;
    valueCents: number;
  } | null>(null);
  const visibleApprovedAmountCents =
    optimisticApprovedAmount?.valueCents ?? approvedAmountCents;
  const approvedAmountDollars = visibleApprovedAmountCents / 100;
  const interestAnnualBps = proposal.interestAnnualBps ?? 925;
  const [approvedAmountPending, setApprovedAmountPending] = useState(false);
  const [interestPending, setInterestPending] = useState(false);

  useEffect(() => {
    if (!optimisticApprovedAmount) {
      return;
    }
    if (
      approvedAmountCents === optimisticApprovedAmount.valueCents ||
      approvedAmountCents !== optimisticApprovedAmount.previousCents
    ) {
      setOptimisticApprovedAmount(null);
    }
  }, [approvedAmountCents, optimisticApprovedAmount]);

  async function saveApprovedAmount(nextApprovedAmountDollars: number) {
    if (!onUpdateApprovedAmount) {
      return;
    }
    const nextApprovedAmountCents = Math.max(
      0,
      Math.round(nextApprovedAmountDollars * 100)
    );
    if (!Number.isFinite(nextApprovedAmountCents)) {
      toast.error("Enter a valid approved amount.");
      return;
    }
    const normalizedApprovedAmountCents = Math.max(
      minimumApprovedAmountCents,
      nextApprovedAmountCents
    );
    setOptimisticApprovedAmount({
      previousCents: approvedAmountCents,
      valueCents: normalizedApprovedAmountCents,
    });
    setApprovedAmountPending(true);
    try {
      await onUpdateApprovedAmount(normalizedApprovedAmountCents);
      toast.success("Approved amount updated.");
    } catch (error) {
      setOptimisticApprovedAmount(null);
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setApprovedAmountPending(false);
    }
  }

  async function saveInterestRate(nextInterestAnnualBps: number) {
    if (!onUpdateInterestRate) {
      return;
    }
    if (!Number.isFinite(nextInterestAnnualBps)) {
      toast.error("Enter a valid interest rate.");
      return;
    }
    setInterestPending(true);
    try {
      await onUpdateInterestRate(nextInterestAnnualBps);
      toast.success("Interest rate updated.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setInterestPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 text-muted-foreground text-xs lg:justify-end">
      <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
      <span className="max-w-full break-words">{proposal.buildName}</span>
      <span aria-hidden>·</span>
      <span className="max-w-full break-words">{proposal.location}</span>
      <HeaderFinancialMetric
        label="Total budget"
        value={formatCents(proposal.totalBudgetCents)}
      />
      {canEditApprovedAmount ? (
        <HeaderEditableMetric
          label="Total approved"
          pending={approvedAmountPending}
          value={
            <EditableNumberChip
              ariaLabel="Total approved"
              disabled={approvedAmountPending}
              formatDisplay={(value) => formatCents(value * 100)}
              formatDraft={(value) => String(Math.round(value * 100) / 100)}
              inputMode="decimal"
              inputWidth="5.8rem"
              min={0}
              onCommit={(value) => {
                saveApprovedAmount(value);
              }}
              reserveWidth="7.4rem"
              size="metric-sm"
              step={1000}
              testId="proposal-header-approved-amount-chip"
              tone="light"
              value={approvedAmountDollars}
              weight="semibold"
            />
          }
        />
      ) : (
        <HeaderFinancialMetric
          label="Total approved"
          value={formatCents(visibleApprovedAmountCents)}
        />
      )}
      {canEditInterestRate ? (
        <HeaderEditableMetric
          label="Interest rate"
          pending={interestPending}
          value={
            <EditableNumberChip
              ariaLabel="Interest rate"
              disabled={interestPending}
              formatDisplay={(value) => formatInterestAnnualBps(value)}
              formatDraft={(value) => formatInterestRateDraft(value)}
              inputMode="decimal"
              inputWidth="3.5rem"
              min={0}
              onCommit={(value) => {
                saveInterestRate(value);
              }}
              parseCommit={parseInterestRateDraftToBps}
              reserveWidth="4.8rem"
              size="metric-sm"
              step={0.25}
              testId="proposal-header-interest-rate-chip"
              tone="light"
              value={interestAnnualBps}
              weight="semibold"
            />
          }
        />
      ) : (
        <HeaderFinancialMetric
          label="Interest rate"
          value={formatInterestAnnualBps(interestAnnualBps)}
        />
      )}
    </div>
  );
}

function HeaderEditableMetric({
  label,
  pending,
  value,
}: {
  label: string;
  pending?: boolean;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="shrink-0">{value}</span>
      {pending ? (
        <span className="shrink-0 text-muted-foreground text-xs">Saving</span>
      ) : null}
    </span>
  );
}

function HeaderFinancialMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-xs/5">
      <span className="text-muted-foreground">{label}</span>
      <strong className="font-semibold text-foreground tabular-nums">
        {value}
      </strong>
    </span>
  );
}

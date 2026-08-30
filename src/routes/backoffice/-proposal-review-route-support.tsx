import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import { ProposalLifecycleActions } from "#/features/production-proposals/ProposalLifecycleActions.tsx";

export type ProposalReviewSearch = {
  tab?:
    | "calendar"
    | "closing"
    | "contractors"
    | "draws"
    | "gantt"
    | "milestones"
    | "materials"
    | "packet"
    | "review"
    | "staff"
    | "timeline";
  timeframe?: CalendarTimeframe;
};

export type ProposalReviewRouteTab = NonNullable<ProposalReviewSearch["tab"]>;

const PROPOSAL_REVIEW_TABS = new Set<ProposalReviewRouteTab>([
  "calendar",
  "closing",
  "contractors",
  "draws",
  "gantt",
  "milestones",
  "materials",
  "packet",
  "review",
  "staff",
  "timeline",
]);
const PROPOSAL_REVIEW_TIMEFRAMES = new Set<CalendarTimeframe>([
  "agenda",
  "day",
  "month",
  "quarter",
  "week",
]);

export function validateProposalReviewSearch(
  search: Record<string, unknown>
): ProposalReviewSearch {
  const candidateTab =
    typeof search.tab === "string"
      ? (search.tab as ProposalReviewRouteTab)
      : undefined;
  const tab =
    candidateTab && PROPOSAL_REVIEW_TABS.has(candidateTab)
      ? candidateTab
      : undefined;
  const candidateTimeframe =
    typeof search.timeframe === "string"
      ? (search.timeframe as CalendarTimeframe)
      : undefined;
  const timeframe =
    candidateTimeframe && PROPOSAL_REVIEW_TIMEFRAMES.has(candidateTimeframe)
      ? candidateTimeframe
      : undefined;

  return {
    ...(tab ? { tab } : {}),
    ...(timeframe ? { timeframe } : {}),
  };
}

export function resolveProposalReviewRouteTab(
  search: ProposalReviewSearch
): ProposalReviewRouteTab {
  return search.tab ?? "packet";
}

export function shouldLoadProposalCalendarWorkspace(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "calendar";
}

export function shouldLoadProposalContractorPlanning(
  activeTab: ProposalReviewRouteTab
) {
  return (
    activeTab === "contractors" ||
    activeTab === "gantt" ||
    activeTab === "milestones"
  );
}

export function shouldLoadProposalReviewBuilders(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "packet" || activeTab === "review";
}

export function shouldMountProposalStaffPanel(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "staff";
}

export function BackofficeProposalLifecycleActions({
  activeBuildId,
  closingPolicyReady,
  onActivated,
  proposal,
  workosOrganizationId,
}: {
  activeBuildId?: string | null;
  closingPolicyReady: boolean;
  onActivated: (buildId: string) => Promise<void> | void;
  proposal: {
    _id: string;
    buildName: string;
    interestAnnualBps?: number;
    principalCents?: number;
    status: string;
  };
  workosOrganizationId: string;
}) {
  if (proposal.status === "approved" && !closingPolicyReady) {
    return (
      <p className="text-pretty text-muted-foreground text-sm" role="status">
        Lock the review policy above before recording closing.
      </p>
    );
  }

  return (
    <ProposalLifecycleActions
      capabilities={{
        canActivateClosedProposal:
          proposal.status === "closed" && !activeBuildId,
        canRecordClosing: proposal.status === "approved" && closingPolicyReady,
      }}
      embedded
      onActivated={onActivated}
      proposal={{
        _id: proposal._id,
        buildName: proposal.buildName,
        interestAnnualBps: proposal.interestAnnualBps,
        principalCents: proposal.principalCents,
      }}
      testId="backoffice-proposal-lifecycle-actions"
      workosOrganizationId={workosOrganizationId}
    />
  );
}

export function ProposalTimelineReviewBannerActions({
  hasPermitOrWaiver,
  onApprove,
  onReject,
  onRequestChanges,
}: {
  hasPermitOrWaiver: boolean;
  onApprove: (
    reason: string,
    permitWaiverReason?: string
  ) => Promise<unknown> | unknown;
  onReject: (reason: string) => Promise<unknown> | unknown;
  onRequestChanges: (reason: string) => Promise<unknown> | unknown;
}) {
  const [reason, setReason] = useState("");
  const [permitWaiverReason, setPermitWaiverReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<
    "approve" | "reject" | "requestChanges" | null
  >(null);
  const reviewReason = reason.trim();
  const waiverReason = permitWaiverReason.trim();

  async function runDecision(
    decision: "approve" | "reject" | "requestChanges"
  ) {
    if (!reviewReason) {
      toast.error("Decision reason required.", {
        description:
          "Add the audit reason before requesting changes, rejecting, or approving.",
      });
      return;
    }
    if (decision === "approve" && !hasPermitOrWaiver && !waiverReason) {
      toast.error("Permit waiver reason required.", {
        description:
          "No permit PDF is linked, so approval needs a recorded waiver reason.",
      });
      return;
    }

    setPendingDecision(decision);
    try {
      if (decision === "approve") {
        await onApprove(reviewReason, waiverReason || undefined);
      } else if (decision === "reject") {
        await onReject(reviewReason);
      } else {
        await onRequestChanges(reviewReason);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update proposal review."
      );
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <div
      className="grid w-full min-w-0 gap-2 sm:min-w-96"
      data-testid="timeline-proposal-review-actions"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="timeline-proposal-review-reason">Decision reason</Label>
        <Input
          id="timeline-proposal-review-reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required audit reason"
          value={reason}
        />
      </div>
      {hasPermitOrWaiver ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="timeline-proposal-permit-waiver">
            Permit waiver reason
          </Label>
          <Textarea
            id="timeline-proposal-permit-waiver"
            onChange={(event) => setPermitWaiverReason(event.target.value)}
            placeholder="Required before approving without a permit PDF"
            rows={2}
            value={permitWaiverReason}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("requestChanges")}
          size="sm"
          variant="outline"
        >
          {pendingDecision === "requestChanges"
            ? "Requesting..."
            : "Request Changes"}
        </Button>
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("reject")}
          size="sm"
          variant="destructive"
        >
          {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
        </Button>
        <Button
          data-testid="timeline-approve-proposal"
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("approve")}
          size="sm"
        >
          {pendingDecision === "approve" ? "Approving..." : "Approve Proposal"}
        </Button>
      </div>
    </div>
  );
}

export function DeferredProposalTabPanel({
  label,
  loading = false,
}: {
  label: string;
  loading?: boolean;
}) {
  return (
    <Frame>
      <FramePanel className="flex min-h-40 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? `Loading ${label.toLowerCase()}...` : label}
        </div>
      </FramePanel>
    </Frame>
  );
}

export function ProductionProposalNotFound({ planId }: { planId: string }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-4">
      <Frame className="mx-auto max-w-2xl">
        <FramePanel className="p-6">
          <Badge variant="outline">Production proposal</Badge>
          <h1 className="mt-3 font-semibold text-2xl tracking-tight">
            Proposal not found
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            No production proposal exists for {planId}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button render={<a href="/backoffice/proposals" />}>
              Back to proposals
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

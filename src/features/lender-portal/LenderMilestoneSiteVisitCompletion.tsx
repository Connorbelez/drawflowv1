"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const SITE_VISIT_PAGE_SIZE = 10;

type SiteVisitCandidate = FunctionReturnType<
  typeof api.lender_portal_phase5.listLenderMilestoneSiteVisitCompletions
>["page"][number];

export function LenderMilestoneSiteVisitCompletion({
  milestoneId,
}: {
  milestoneId: string;
}) {
  const { loadMore, results, status } = usePaginatedQuery(
    api.lender_portal_phase5.listLenderMilestoneSiteVisitCompletions,
    { milestoneId: milestoneId as Id<"buildMilestones"> },
    { initialNumItems: SITE_VISIT_PAGE_SIZE }
  );
  const completeSiteVisit = useMutation(
    api.lender_portal_phase5.completeLenderMilestoneSiteVisit
  );

  if (status === "LoadingFirstPage") {
    return (
      <Frame data-testid="lender-site-visit-loading">
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-4 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Loading Site Visit work…
        </FramePanel>
      </Frame>
    );
  }

  if (results.length === 0 && status === "Exhausted") {
    return null;
  }

  return (
    <section
      aria-labelledby="lender-site-visit-completion-heading"
      className="space-y-3"
      data-testid="lender-site-visit-completion"
    >
      <div>
        <h2
          className="text-balance font-semibold text-base"
          id="lender-site-visit-completion-heading"
        >
          Site Visit completion
        </h2>
        <p className="max-w-[68ch] text-pretty text-muted-foreground text-sm">
          Record the field report only after the required photo evidence is
          attached. The result is audited and stays with this Milestone.
        </p>
      </div>
      {results.map((candidate) => (
        <SiteVisitCompletionForm
          candidate={candidate}
          key={candidate.siteVisitId}
          onComplete={async (report) => {
            await completeSiteVisit({
              expectedVisitUpdatedAt: candidate.updatedAt,
              idempotencyKey: crypto.randomUUID(),
              milestoneId: milestoneId as Id<"buildMilestones">,
              report,
              visitId: candidate.siteVisitId,
            });
          }}
        />
      ))}
      {status === "Exhausted" ? null : (
        <Button
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(SITE_VISIT_PAGE_SIZE)}
          type="button"
          variant="outline"
        >
          {status === "LoadingMore" ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          Load more Site Visits
        </Button>
      )}
    </section>
  );
}

function SiteVisitCompletionForm({
  candidate,
  onComplete,
}: {
  candidate: SiteVisitCandidate;
  onComplete: (report: string) => Promise<void>;
}) {
  const fieldId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState("");

  const submit = async () => {
    const normalizedReport = report.trim();
    if (!normalizedReport) {
      setError("Enter a field report before completing this Site Visit.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onComplete(normalizedReport);
      toast.success("Site Visit completed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete this Site Visit. Refresh and try again."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Frame>
      <FramePanel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Requested Site Visit</p>
            <p className="mt-1 text-muted-foreground text-xs tabular-nums">
              Requested {formatDate(candidate.requestedAt)} ·{" "}
              {candidate.photoCount} photo
              {candidate.photoCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {candidate.locationUnverifiedPhotoCount > 0 ? (
              <Badge variant="warning">
                <AlertTriangle aria-hidden="true" />
                Location unverified
              </Badge>
            ) : null}
            {candidate.canComplete ? (
              <Badge variant="outline">
                <CheckCircle2 aria-hidden="true" />
                Ready for report
              </Badge>
            ) : null}
          </div>
        </div>

        {candidate.completionBlocker === "permission_required" ? (
          <p className="text-pretty text-muted-foreground text-sm">
            This Site Visit is read-only. A lender team member with Site Visit
            review permission can complete it.
          </p>
        ) : candidate.completionBlocker === "photo_required" ? (
          <p className="text-pretty text-muted-foreground text-sm">
            At least one field photo must be attached before the report can be
            completed.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await submit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={fieldId}>Field report</Label>
              <Textarea
                aria-describedby={error ? `${fieldId}-error` : undefined}
                aria-invalid={error ? true : undefined}
                disabled={pending}
                id={fieldId}
                maxLength={4000}
                onChange={(event) => setReport(event.target.value)}
                placeholder="Summarize the work verified during this Site Visit."
                required
                rows={4}
                value={report}
              />
              {error ? (
                <p
                  className="text-destructive text-sm"
                  id={`${fieldId}-error`}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button disabled={pending} type="submit">
                {pending ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                Complete Site Visit
              </Button>
            </div>
          </form>
        )}
      </FramePanel>
    </Frame>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : new Intl.DateTimeFormat("en-CA", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      }).format(date);
}

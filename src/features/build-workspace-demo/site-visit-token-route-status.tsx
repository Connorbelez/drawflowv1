import {
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Lock,
} from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import {
  deriveBuildCode,
  formatVisitDay,
  formatVisitTime,
  type SubmittedSummary,
  type UnavailableVisitState,
  type VisitBuild,
} from "./site-visit-token-route-contracts";
import {
  formatSiteVisitBytes,
  resolveSiteVisitUnavailableCopy,
} from "./site-visit-token-route-model";
import { OutcomeCard } from "./site-visit-token-route-panels";
import { MobileShell } from "./site-visit-token-route-shell";

export function SiteVisitLoadingState({ buildId }: { buildId: string }) {
  return (
    <MobileShell
      build={null}
      buildCode={deriveBuildCode(buildId)}
      status="loading"
      statusText="Loading"
      timeText="Resolving"
    >
      <OutcomeCard
        body="Resolving the tokenized visit packet."
        icon={<LoaderCircle className="size-6 animate-spin" />}
        title="Loading site visit"
        tone="neutral"
      />
    </MobileShell>
  );
}

export function SiteVisitSubmittedState({
  buildId,
  initialBuild,
  submittedSummary,
}: {
  buildId: string;
  initialBuild?: VisitBuild | null;
  submittedSummary: SubmittedSummary;
}) {
  const submittedBuild = initialBuild ?? null;
  return (
    <MobileShell
      build={submittedBuild}
      buildCode={deriveBuildCode(buildId, submittedBuild)}
      status="complete"
      statusText="Complete"
      timeText={`Submitted ${formatVisitTime(submittedSummary.completedAt)}`}
    >
      <OutcomeCard
        body={`Your report and ${submittedSummary.fileCount} evidence files are now visible to the lender admin. This token has been consumed.`}
        detailItems={[
          ["Visit ID", `SVT_${submittedSummary.visitId}`],
          [
            "Submitted",
            `${formatVisitTime(submittedSummary.completedAt)} · ${formatVisitDay(
              submittedSummary.completedAt
            )}`,
          ],
          ["Recommendation", submittedSummary.recommendation],
          [
            "Files stored",
            `${submittedSummary.fileCount} · ${formatSiteVisitBytes(
              submittedSummary.totalBytes
            )}`,
          ],
        ]}
        icon={<Check className="size-6" />}
        title="Site visit recorded"
        tone="success"
      />
    </MobileShell>
  );
}

export function SiteVisitUnavailableState({
  buildId,
  onRequestNewLink,
  onReplacementReasonChange,
  replacementError,
  replacementReason,
  replacementReference,
  requestingReplacement,
  visitState,
}: {
  buildId: string;
  onRequestNewLink: () => Promise<void>;
  onReplacementReasonChange: (reason: string) => void;
  replacementError: string;
  replacementReason: string;
  replacementReference: string;
  requestingReplacement: boolean;
  visitState: UnavailableVisitState;
}) {
  const copy = resolveSiteVisitUnavailableCopy(visitState);
  const build = visitState.build ?? null;
  const consumed = visitState.reason === "consumed";
  const expired = visitState.reason === "expired";
  const detailItems: [string, string][] = consumed
    ? [
        ["Report status", "Submitted · read only"],
        [
          "Submitted",
          `${formatVisitTime(visitState.visit?.completedAt)} · ${formatVisitDay(visitState.visit?.completedAt)}`,
        ],
        ["Build", deriveBuildCode(buildId, build)],
        ["Milestone", visitState.visit?.milestoneKey ?? "Assigned visit"],
      ]
    : expired
      ? [
          [
            "Token issued",
            `${formatVisitTime(visitState.visit?.createdAt)} · ${formatVisitDay(visitState.visit?.createdAt)}`,
          ],
          [
            "Expired at",
            `${formatVisitTime(visitState.visit?.tokenExpiresAt)} · ${formatVisitDay(visitState.visit?.tokenExpiresAt)}`,
          ],
          ["Build", deriveBuildCode(buildId, build)],
          ["Reason", "Visit window elapsed"],
        ]
      : [
          ["Reason", "Build and assignment do not match"],
          ["Build", deriveBuildCode(buildId, build)],
          ["Next action", "Return to the assignment or contact the requester"],
          ["Support", "ops@drawflow.app"],
        ];
  return (
    <MobileShell
      build={build}
      buildCode={deriveBuildCode(buildId, build)}
      status={consumed ? "complete" : "expired"}
      statusText={consumed ? "Complete" : expired ? "Expired" : "Invalid"}
      timeText={consumed ? "Read only" : "Token void"}
    >
      <OutcomeCard
        actions={
          copy.canRequestReplacement ? (
            <div className="mt-6 grid gap-3 border-t pt-5 text-left">
              {replacementReference ? (
                <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
                  <p className="font-medium">New-link request recorded</p>
                  <p className="mt-1">
                    Reference {replacementReference}. The requester has an
                    auditable task to issue a separate link.
                  </p>
                </div>
              ) : (
                <>
                  <label className="grid gap-2 text-sm">
                    Reason for another link
                    <textarea
                      className="min-h-20 rounded-md border bg-background p-2 text-foreground"
                      onChange={(event) =>
                        onReplacementReasonChange(event.currentTarget.value)
                      }
                      value={replacementReason}
                    />
                  </label>
                  <Button
                    disabled={
                      requestingReplacement || !replacementReason.trim()
                    }
                    onClick={() => void onRequestNewLink()}
                    type="button"
                  >
                    {requestingReplacement ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ExternalLink />
                    )}
                    Request a new link
                  </Button>
                </>
              )}
              {replacementError ? (
                <p className="text-destructive text-sm" role="alert">
                  {replacementError}
                </p>
              ) : null}
            </div>
          ) : null
        }
        body={copy.body}
        detailItems={detailItems}
        icon={
          consumed ? (
            <CheckCircle2 className="size-6" />
          ) : expired ? (
            <Clock3 className="size-6" />
          ) : (
            <Lock className="size-6" />
          )
        }
        stamp={copy.stamp}
        title={copy.title}
        tone={consumed ? "neutral" : "danger"}
      />
    </MobileShell>
  );
}

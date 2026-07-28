import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "#/lib/fairLendConfig.ts";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/backoffice/contractors/onboarding")({
  staticData: {
    breadcrumb: { label: "Onboarding review", to: "/backoffice/contractors" },
  },
  component: ContractorOnboardingReview,
});

/**
 * Backoffice contractor onboarding review queue (PRD §7.2, §9). Approve,
 * reject, request changes, or merge self-service onboardings. Approval requests
 * WorkOS contractor role promotion (backend-enforced).
 */
function ContractorOnboardingReview() {
  const workosOrganizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;
  const onboardingApi = api.contractorOnboarding;
  const reviews = useQuery(onboardingApi.listContractorOnboardingReviews, {
    workosOrganizationId,
  });
  const approve = useMutation(onboardingApi.approveContractorOnboarding);
  const reject = useMutation(onboardingApi.rejectContractorOnboarding);
  const requestChanges = useMutation(onboardingApi.requestContractorOnboardingChanges);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Contractor operations
          </p>
          <h1 className="mt-1 font-semibold text-2xl">Onboarding review</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            Self-service contractor onboardings awaiting review. Approve to
            request WorkOS contractor role promotion, reject with a reason, or
            request changes.
          </p>
        </header>

        <Frame>
          <FramePanel className="p-0">
            {reviews === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading reviews…</p>
            ) : reviews.length === 0 ? (
              <p className="p-5 text-muted-foreground text-sm">
                No onboarding applications awaiting review.
              </p>
            ) : (
              <ul className="divide-y">
                {reviews.map((review) => (
                  <li key={review._id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {review.contractor?.name ?? "Unnamed applicant"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {review.applicantNormalizedEmail ??
                            review.contractor?.email ??
                            "No email on file"}{" "}
                          · {review.status.replace(/_/g, " ")}
                        </p>
                      </div>
                      <StatusTone status={review.status} />
                    </div>

                    {review.status === "pending_backoffice_review" ||
                    review.status === "changes_requested" ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          busy={busyId === review._id}
                          disabled={busyId !== null && busyId !== review._id}
                          label="Approve"
                          onClick={async () => {
                            setBusyId(review._id);
                            try {
                              await approve({
                                reviewId: review._id,
                                workosOrganizationId,
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        />
                        <ActionButton
                          busy={busyId === review._id}
                          disabled={busyId !== null && busyId !== review._id}
                          label="Request changes"
                          variant="outline"
                          onClick={async () => {
                            setBusyId(review._id);
                            try {
                              await requestChanges({
                                reviewId: review._id,
                                reason: "Please update your profile details.",
                                workosOrganizationId,
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        />
                        <ActionButton
                          busy={busyId === review._id}
                          disabled={busyId !== null && busyId !== review._id}
                          label="Reject"
                          variant="outline"
                          onClick={async () => {
                            setBusyId(review._id);
                            try {
                              await reject({
                                reason: "Not approved.",
                                reviewId: review._id,
                                workosOrganizationId,
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        />
                      </div>
                    ) : null}

                    {review.reviewDecisionNote ? (
                      <p className="text-muted-foreground text-xs">
                        Last decision: {review.reviewDecisionNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

function ActionButton({
  busy,
  disabled,
  label,
  onClick,
  variant,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  variant?: "outline";
}) {
  return (
    <Button
      disabled={busy || disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant={variant}
    >
      {busy ? "Working…" : label}
    </Button>
  );
}

function StatusTone({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "approved_pending_workos"
        ? "bg-blue-100 text-blue-700"
        : status === "rejected"
          ? "bg-red-100 text-red-700"
          : status === "changes_requested"
            ? "bg-amber-100 text-amber-700"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

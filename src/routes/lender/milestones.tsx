import {
  createFileRoute,
  type ErrorComponentProps,
  useNavigate,
} from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { LenderMilestoneQueue } from "#/features/lender-portal/LenderMilestoneQueue.tsx";
import {
  LenderNotificationReviewSurface,
  LenderReviewSurface,
} from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import type { LenderPortalMilestoneQueueRow } from "../../../convex/lender_portal_phase5_contracts";

interface LenderMilestoneSearch {
  milestoneId?: string;
  reviewCycleId?: string;
  reviewCycleNumber?: number;
}

export function validateLenderMilestoneSearch(
  search: Record<string, unknown>
): LenderMilestoneSearch {
  return {
    ...(typeof search.milestoneId === "string"
      ? { milestoneId: search.milestoneId }
      : {}),
    ...(typeof search.reviewCycleId === "string"
      ? { reviewCycleId: search.reviewCycleId }
      : {}),
    ...(typeof search.reviewCycleNumber === "string" &&
    Number.isSafeInteger(Number(search.reviewCycleNumber))
      ? { reviewCycleNumber: Number(search.reviewCycleNumber) }
      : {}),
  };
}

export const Route = createFileRoute("/lender/milestones")({
  component: LenderMilestoneQueueRoute,
  errorComponent: LenderMilestoneQueueError,
  staticData: {
    breadcrumb: {
      label: "Milestones",
      to: "/lender/milestones",
    },
  },
  validateSearch: validateLenderMilestoneSearch,
});

export function lenderMilestoneReviewSearch(
  row: Pick<
    LenderPortalMilestoneQueueRow,
    "milestoneId" | "reviewCycleId" | "reviewCycleNumber"
  >
) {
  return {
    milestoneId: String(row.milestoneId),
    reviewCycleId: String(row.reviewCycleId),
    reviewCycleNumber: row.reviewCycleNumber,
  };
}

export function lenderMilestoneOrdinaryReviewSearch(
  row: Pick<LenderPortalMilestoneQueueRow, "milestoneId">
) {
  return { milestoneId: String(row.milestoneId) };
}

function LenderMilestoneQueueError({ reset }: ErrorComponentProps) {
  return (
    <LenderShell activeNavigation="Milestones" pageTitle="Milestone queue">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/30 p-4 pt-12">
        <Frame className="mx-auto max-w-2xl">
          <FramePanel className="p-8">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Milestone queue
            </p>
            <h1 className="mt-3 font-semibold text-2xl">
              Assigned requests could not load
            </h1>
            <p className="mt-3 max-w-lg text-muted-foreground text-sm leading-6">
              DrawFlow could not verify the current lender assignment and review
              cycles. No Milestone request data was shown.
            </p>
            <Button className="mt-6" onClick={reset} variant="outline">
              Try again
            </Button>
          </FramePanel>
        </Frame>
      </main>
    </LenderShell>
  );
}

function LenderMilestoneQueueRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const notificationTarget =
    search.milestoneId &&
    search.reviewCycleId &&
    search.reviewCycleNumber !== undefined
      ? {
          milestoneId: search.milestoneId,
          reviewCycleId: search.reviewCycleId,
          reviewCycleNumber: search.reviewCycleNumber,
        }
      : null;
  const ordinaryTarget =
    search.milestoneId &&
    search.reviewCycleId === undefined &&
    search.reviewCycleNumber === undefined
      ? { milestoneId: search.milestoneId }
      : null;

  return (
    <LenderShell activeNavigation="Milestones" pageTitle="Milestone queue">
      {notificationTarget ? (
        <LenderNotificationReviewSurface
          onClose={() => navigate({ search: {}, to: "/lender/milestones" })}
          reviewCycleId={notificationTarget.reviewCycleId}
          reviewCycleNumber={notificationTarget.reviewCycleNumber}
          target={{
            kind: "milestone",
            milestoneId: notificationTarget.milestoneId,
          }}
          viewerWorkosUserId={context.userId as string}
        />
      ) : ordinaryTarget ? (
        <LenderReviewSurface
          onClose={() => navigate({ search: {}, to: "/lender/milestones" })}
          target={{
            kind: "milestone",
            milestoneId: ordinaryTarget.milestoneId,
          }}
          viewerWorkosUserId={context.userId as string}
        />
      ) : (
        <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
          <LenderMilestoneQueue
            onOpenReview={(row) => {
              navigate({
                search: lenderMilestoneOrdinaryReviewSearch(row),
                to: "/lender/milestones",
              });
            }}
          />
        </div>
      )}
    </LenderShell>
  );
}

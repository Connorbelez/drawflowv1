import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderNotificationReviewSurface } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import { LenderMilestoneQueueVariantC } from "../lender.milestones-prototype.tsx";

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
  component: LenderMilestoneQueue,
  staticData: {
    breadcrumb: {
      label: "Milestones",
      to: "/lender/milestones",
    },
  },
  validateSearch: validateLenderMilestoneSearch,
});
function LenderMilestoneQueue() {
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
      ) : (
        <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
          <main className="mx-auto min-w-0 max-w-[1440px] p-4">
            <LenderMilestoneQueueVariantC />
          </main>
        </div>
      )}
    </LenderShell>
  );
}

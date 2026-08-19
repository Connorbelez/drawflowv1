import {
  createFileRoute,
  type ErrorComponentProps,
  useNavigate,
} from "@tanstack/react-router";

import { LenderShell } from "#/components/lender-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { LenderDrawQueue } from "#/features/lender-portal/LenderDrawQueue.tsx";
import {
  LenderNotificationReviewSurface,
  LenderReviewSurface,
} from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";

interface LenderDrawSearch {
  drawRequestId?: string;
  reviewCycleId?: string;
  reviewCycleNumber?: number;
}

export function validateLenderDrawSearch(
  search: Record<string, unknown>
): LenderDrawSearch {
  const reviewCycleNumber =
    typeof search.reviewCycleNumber === "number"
      ? search.reviewCycleNumber
      : typeof search.reviewCycleNumber === "string"
        ? Number(search.reviewCycleNumber)
        : Number.NaN;
  return {
    ...(typeof search.drawRequestId === "string"
      ? { drawRequestId: search.drawRequestId }
      : {}),
    ...(typeof search.reviewCycleId === "string"
      ? { reviewCycleId: search.reviewCycleId }
      : {}),
    ...(Number.isSafeInteger(reviewCycleNumber) && reviewCycleNumber > 0
      ? { reviewCycleNumber }
      : {}),
  };
}

export function lenderDrawReviewSearch(row: {
  currentReviewCycleId: string | null;
  currentReviewCycleNumber: number | null;
  drawRequestId: string;
}): LenderDrawSearch | null {
  if (
    row.currentReviewCycleId === null ||
    row.currentReviewCycleNumber === null
  ) {
    return null;
  }
  return {
    drawRequestId: String(row.drawRequestId),
    reviewCycleId: String(row.currentReviewCycleId),
    reviewCycleNumber: row.currentReviewCycleNumber,
  };
}

export function lenderDrawOrdinaryReviewSearch(row: {
  currentReviewCycleId: string | null;
  currentReviewCycleNumber: number | null;
  drawRequestId: string;
}): LenderDrawSearch | null {
  if (
    row.currentReviewCycleId === null ||
    row.currentReviewCycleNumber === null
  ) {
    return null;
  }
  return { drawRequestId: String(row.drawRequestId) };
}

export const Route = createFileRoute("/lender/draws")({
  component: LenderDrawQueueRoute,
  errorComponent: LenderDrawQueueError,
  staticData: {
    breadcrumb: {
      label: "Draws",
      to: "/lender/draws",
    },
  },
  validateSearch: validateLenderDrawSearch,
});

function LenderDrawQueueError({ reset }: ErrorComponentProps) {
  return (
    <LenderShell activeNavigation="Draws" pageTitle="Draw queue">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/30 p-4 pt-12">
        <Frame className="mx-auto max-w-2xl">
          <FramePanel className="p-8">
            <h1 className="font-semibold text-2xl">
              Assigned Draw requests could not load
            </h1>
            <p className="mt-3 max-w-lg text-muted-foreground text-sm leading-6">
              DrawFlow could not verify the current lender assignment, review
              cycle, and pooled funding facts. No Draw request data was shown.
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

function LenderDrawQueueRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const notificationTarget =
    search.drawRequestId &&
    search.reviewCycleId &&
    search.reviewCycleNumber !== undefined
      ? {
          drawRequestId: search.drawRequestId,
          reviewCycleId: search.reviewCycleId,
          reviewCycleNumber: search.reviewCycleNumber,
        }
      : null;
  const ordinaryTarget =
    search.drawRequestId &&
    search.reviewCycleId === undefined &&
    search.reviewCycleNumber === undefined
      ? { drawRequestId: search.drawRequestId }
      : null;

  return (
    <LenderShell activeNavigation="Draws" pageTitle="Draw queue">
      {notificationTarget ? (
        <LenderNotificationReviewSurface
          onClose={() => navigate({ search: {}, to: "/lender/draws" })}
          reviewCycleId={notificationTarget.reviewCycleId}
          reviewCycleNumber={notificationTarget.reviewCycleNumber}
          target={{
            drawRequestId: notificationTarget.drawRequestId,
            kind: "draw",
          }}
          viewerWorkosUserId={context.userId as string}
        />
      ) : ordinaryTarget ? (
        <LenderReviewSurface
          onClose={() => navigate({ search: {}, to: "/lender/draws" })}
          target={{
            drawRequestId: ordinaryTarget.drawRequestId,
            kind: "draw",
          }}
          viewerWorkosUserId={context.userId as string}
        />
      ) : (
        <LenderDrawQueue
          onOpenBuild={(buildId) =>
            navigate({
              params: { buildId },
              to: "/lender/builds/$buildId",
            })
          }
          onOpenReview={(row) => {
            const nextSearch = lenderDrawOrdinaryReviewSearch(row);
            if (nextSearch) {
              navigate({ search: nextSearch, to: "/lender/draws" });
            }
          }}
        />
      )}
    </LenderShell>
  );
}

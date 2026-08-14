import { createFileRoute } from "@tanstack/react-router";
import { LenderPrototypeShell } from "#/components/prototype/LenderPrototypeShell.tsx";
import { LenderMilestoneReviewPrototype } from "#/features/lender-milestone-review-prototype/LenderMilestoneReviewPrototype.tsx";

// The selected Variant A remains on a clearly throwaway route.
export const Route = createFileRoute("/lender/milestone-review-prototype")({
  component: LenderMilestoneReviewPrototypeRoute,
  validateSearch: () => ({ variant: "A" as const }),
});

function LenderMilestoneReviewPrototypeRoute() {
  return (
    <LenderPrototypeShell
      activeNavigation="Milestones"
      pageTitle="Framing & structural shell"
    >
      <LenderMilestoneReviewPrototype variant="A" />
    </LenderPrototypeShell>
  );
}

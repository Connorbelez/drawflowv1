import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LenderPrototypeShell } from "#/components/prototype/LenderPrototypeShell.tsx";
import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import {
  isLenderMilestoneReviewVariant,
  LENDER_MILESTONE_REVIEW_VARIANTS,
  LenderMilestoneReviewPrototype,
} from "#/features/lender-milestone-review-prototype/LenderMilestoneReviewPrototype.tsx";

// Four lender Milestone review structures, switchable via ?variant=, on a clearly throwaway route.
export const Route = createFileRoute("/lender/milestone-review-prototype")({
  component: LenderMilestoneReviewPrototypeRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    variant: isLenderMilestoneReviewVariant(search.variant)
      ? search.variant
      : "A",
  }),
});

function LenderMilestoneReviewPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <LenderPrototypeShell
      activeNavigation="Milestones"
      pageTitle="Framing & structural shell"
    >
      <LenderMilestoneReviewPrototype variant={variant} />
      <PrototypeVariantSwitcher
        current={variant}
        onChange={(nextVariant) => {
          if (!isLenderMilestoneReviewVariant(nextVariant)) {
            return;
          }
          navigate({
            replace: true,
            search: { variant: nextVariant },
            to: "/lender/milestone-review-prototype",
          });
        }}
        variants={LENDER_MILESTONE_REVIEW_VARIANTS}
      />
    </LenderPrototypeShell>
  );
}

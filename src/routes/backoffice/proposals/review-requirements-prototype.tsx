import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  type ReviewRequirementsPrototypeVariant,
  ReviewRequirementsSetupPrototype,
  reviewRequirementsPrototypeVariants,
} from "#/components/prototypes/BackOfficeReviewRequirementsSetupPrototype.tsx";

interface ReviewRequirementsPrototypeSearch {
  variant: ReviewRequirementsPrototypeVariant;
}

function isPrototypeVariant(
  value: unknown
): value is ReviewRequirementsPrototypeVariant {
  return reviewRequirementsPrototypeVariants.some(
    (variant) => variant.key === value
  );
}

export const Route = createFileRoute(
  "/backoffice/proposals/review-requirements-prototype"
)({
  validateSearch: (
    search: Record<string, unknown>
  ): ReviewRequirementsPrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  staticData: {
    breadcrumb: {
      label: "Review requirements prototype",
      to: "/backoffice/proposals/review-requirements-prototype",
    },
  },
  component: ReviewRequirementsPrototypeRoute,
});

function ReviewRequirementsPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ReviewRequirementsSetupPrototype
      onVariantChange={(nextVariant) =>
        navigate({
          replace: true,
          search: { variant: nextVariant },
        })
      }
      variant={variant}
    />
  );
}

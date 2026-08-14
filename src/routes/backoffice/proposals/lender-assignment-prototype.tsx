import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  BackOfficeLenderAssignmentPrototype,
  type LenderAssignmentPrototypeVariant,
  lenderAssignmentPrototypeVariants,
} from "#/components/prototypes/BackOfficeLenderAssignmentPrototype.tsx";

interface LenderAssignmentPrototypeSearch {
  variant: LenderAssignmentPrototypeVariant;
}

function isPrototypeVariant(
  value: unknown
): value is LenderAssignmentPrototypeVariant {
  return lenderAssignmentPrototypeVariants.some(
    (variant) => variant.key === value
  );
}

export const Route = createFileRoute(
  "/backoffice/proposals/lender-assignment-prototype"
)({
  validateSearch: (
    search: Record<string, unknown>
  ): LenderAssignmentPrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  staticData: {
    breadcrumb: {
      label: "Lender assignment prototype",
      to: "/backoffice/proposals/lender-assignment-prototype",
    },
  },
  component: LenderAssignmentPrototypeRoute,
});

function LenderAssignmentPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <BackOfficeLenderAssignmentPrototype
      key={variant}
      onVariantChange={(nextVariant) =>
        navigate({ replace: true, search: { variant: nextVariant } })
      }
      variant={variant}
    />
  );
}

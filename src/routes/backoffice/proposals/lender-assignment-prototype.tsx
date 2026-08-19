import { createFileRoute } from "@tanstack/react-router";

import { BackOfficeLenderAssignmentPrototype } from "#/components/prototypes/BackOfficeLenderAssignmentPrototype.tsx";

interface LenderAssignmentPrototypeSearch {
  variant: "A";
}

export const Route = createFileRoute(
  "/backoffice/proposals/lender-assignment-prototype"
)({
  validateSearch: (): LenderAssignmentPrototypeSearch => ({ variant: "A" }),
  staticData: {
    breadcrumb: {
      label: "Lender assignment prototype",
      to: "/backoffice/proposals/lender-assignment-prototype",
    },
  },
  component: BackOfficeLenderAssignmentPrototype,
});

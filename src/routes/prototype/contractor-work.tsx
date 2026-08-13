import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  type ContractorWorkPrototypeVariant,
  ContractorWorkWorkspacePrototype,
  isContractorWorkPrototypeVariant,
} from "#/features/contractor/prototype/ContractorWorkWorkspacePrototype.tsx";

interface ContractorWorkPrototypeSearch {
  variant?: ContractorWorkPrototypeVariant;
}

export const Route = createFileRoute("/prototype/contractor-work")({
  component: ContractorWorkPrototypeRoute,
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>
  ): ContractorWorkPrototypeSearch => ({
    variant: isContractorWorkPrototypeVariant(search.variant)
      ? search.variant
      : undefined,
  }),
});

function ContractorWorkPrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const variant = search.variant ?? "B";

  const updateVariant = useCallback(
    (nextVariant: ContractorWorkPrototypeVariant) => {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, variant: nextVariant }),
      });
    },
    [navigate]
  );

  return (
    <ContractorWorkWorkspacePrototype
      onVariantChange={updateVariant}
      variant={variant}
    />
  );
}

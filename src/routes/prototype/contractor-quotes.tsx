import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  ContractorQuotesWorkspacePrototype,
  isContractorQuotesPrototypeMode,
  isContractorQuotesPrototypeVariant,
  type ContractorQuotesPrototypeMode,
  type ContractorQuotesPrototypeVariant,
} from "#/features/contractor/prototype/ContractorQuotesWorkspacePrototype.tsx";

interface ContractorQuotesPrototypeSearch {
  mode?: ContractorQuotesPrototypeMode;
  variant?: ContractorQuotesPrototypeVariant;
}

export const Route = createFileRoute("/prototype/contractor-quotes")({
  component: ContractorQuotesPrototypeRoute,
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): ContractorQuotesPrototypeSearch => ({
    mode: isContractorQuotesPrototypeMode(search.mode)
      ? search.mode
      : undefined,
    variant: isContractorQuotesPrototypeVariant(search.variant)
      ? search.variant
      : undefined,
  }),
});

function ContractorQuotesPrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const mode = search.mode ?? "my";
  const variant = search.variant ?? "A";

  const updateSearch = useCallback(
    (next: Partial<ContractorQuotesPrototypeSearch>) => {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, ...next }),
      });
    },
    [navigate],
  );

  return (
    <ContractorQuotesWorkspacePrototype
      mode={mode}
      onModeChange={(nextMode) => updateSearch({ mode: nextMode })}
      onVariantChange={(nextVariant) => updateSearch({ variant: nextVariant })}
      variant={variant}
    />
  );
}

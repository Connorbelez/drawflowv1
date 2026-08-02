import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  ActionItemExperiencePrototype,
  isActionItemPrototypeVariant,
  type ActionItemPrototypeVariant,
} from "#/features/build-collaboration/prototype/ActionItemExperiencePrototype.tsx";

interface ActionItemPrototypeSearch {
  variant?: ActionItemPrototypeVariant;
}

export const Route = createFileRoute("/prototype/action-items")({
  component: ActionItemsPrototypeRoute,
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>
  ): ActionItemPrototypeSearch => ({
    variant: isActionItemPrototypeVariant(search.variant)
      ? search.variant
      : undefined,
  }),
});

function ActionItemsPrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const variant = search.variant ?? "A";
  const onVariantChange = useCallback(
    (nextVariant: string) => {
      if (!isActionItemPrototypeVariant(nextVariant)) return;
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, variant: nextVariant }),
      });
    },
    [navigate]
  );

  return (
    <ActionItemExperiencePrototype
      onVariantChange={onVariantChange}
      variant={variant}
    />
  );
}

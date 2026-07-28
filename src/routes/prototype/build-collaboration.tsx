import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  BuildCollaborationPrototype,
  type BuildCollaborationVariant,
  isBuildCollaborationVariant,
} from "#/features/backoffice-build-detail/prototype/BuildCollaborationPrototype.tsx";

interface BuildCollaborationPrototypeSearch {
  variant?: BuildCollaborationVariant;
}

export const Route = createFileRoute("/prototype/build-collaboration")({
  component: BuildCollaborationPrototypeRoute,
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>
  ): BuildCollaborationPrototypeSearch => ({
    variant: isBuildCollaborationVariant(search.variant)
      ? search.variant
      : undefined,
  }),
});

function BuildCollaborationPrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const variant = search.variant ?? "A";
  const onVariantChange = useCallback(
    (nextVariant: string) => {
      if (!isBuildCollaborationVariant(nextVariant)) {
        return;
      }
      navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          variant: nextVariant,
        }),
      });
    },
    [navigate]
  );

  return (
    <BuildCollaborationPrototype
      onVariantChange={onVariantChange}
      variant={variant}
    />
  );
}

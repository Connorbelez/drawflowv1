import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  isSystemPostPrototypeKind,
  isSystemPostPrototypeRole,
  isSystemPostPrototypeScenario,
  isSystemPostPrototypeVariant,
  SystemPostExperiencePrototype,
  type SystemPostPrototypeKind,
  type SystemPostPrototypeRole,
  type SystemPostPrototypeScenario,
  type SystemPostPrototypeVariant,
} from "#/features/build-collaboration/prototype/SystemPostExperiencePrototype.tsx";

interface SystemPostPrototypeSearch {
  post?: SystemPostPrototypeKind;
  role?: SystemPostPrototypeRole;
  scenario?: SystemPostPrototypeScenario;
  variant?: SystemPostPrototypeVariant;
}

export const Route = createFileRoute("/prototype/system-posts")({
  component: SystemPostsPrototypeRoute,
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>
  ): SystemPostPrototypeSearch => ({
    post: isSystemPostPrototypeKind(search.post) ? search.post : undefined,
    role: isSystemPostPrototypeRole(search.role) ? search.role : undefined,
    scenario: isSystemPostPrototypeScenario(search.scenario)
      ? search.scenario
      : undefined,
    variant: isSystemPostPrototypeVariant(search.variant)
      ? search.variant
      : undefined,
  }),
});

function SystemPostsPrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const post = search.post ?? "milestone";
  const role = search.role ?? "builder";
  const scenario = search.scenario ?? "active";
  const variant = search.variant ?? "A";

  const updateSearch = useCallback(
    (next: Partial<Required<SystemPostPrototypeSearch>>) => {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, ...next }),
      });
    },
    [navigate]
  );

  return (
    <SystemPostExperiencePrototype
      onPostChange={(next) => updateSearch({ post: next })}
      onRoleChange={(next) => updateSearch({ role: next })}
      onScenarioChange={(next) => updateSearch({ scenario: next })}
      onVariantChange={(next) => updateSearch({ variant: next })}
      post={post}
      role={role}
      scenario={scenario}
      variant={variant}
    />
  );
}

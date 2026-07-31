import { createFileRoute } from "@tanstack/react-router";

import {
  ExternalQuoteResponsePrototype,
  isExternalQuotePrototypeScenario,
  isExternalQuotePrototypeVariant,
} from "#/features/quote-solicitation/ExternalQuoteResponse.prototype.tsx";

export const Route = createFileRoute("/quote/$quoteInvitationToken")({
  validateSearch: (search: Record<string, unknown>) => ({
    scenario: isExternalQuotePrototypeScenario(search.scenario)
      ? search.scenario
      : "returning-draft",
    variant: isExternalQuotePrototypeVariant(search.variant)
      ? search.variant
      : "scope-passport",
  }),
  component: ExternalQuotePrototypeRoute,
});

function ExternalQuotePrototypeRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <ExternalQuoteResponsePrototype
      onScenarioChange={(scenario) =>
        navigate({ search: (current) => ({ ...current, scenario }) })
      }
      onVariantChange={(variant) =>
        navigate({ search: (current) => ({ ...current, variant }) })
      }
      scenario={search.scenario}
      variant={search.variant}
    />
  );
}

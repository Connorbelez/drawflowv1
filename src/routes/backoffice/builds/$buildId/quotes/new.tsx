import { createFileRoute } from "@tanstack/react-router";

import {
  normalizeQuoteRoundOrganizationId,
  QuoteRoundComposerRoute,
} from "#/features/quote-solicitation/QuoteRoundComposerRoute.tsx";
import type { QuoteRoundComposerSearch } from "#/routes/builder/builds/$buildId/quotes/new.tsx";

function normalizeRoundId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/backoffice/builds/$buildId/quotes/new")({
  validateSearch: (
    search: Record<string, unknown>
  ): QuoteRoundComposerSearch => {
    const roundId = normalizeRoundId(search.roundId);
    return roundId ? { roundId } : {};
  },
  component: BackofficeQuoteRoundComposerRoute,
});

function BackofficeQuoteRoundComposerRoute() {
  const { buildId } = Route.useParams();
  const { roundId } = Route.useSearch();
  const context = Route.useRouteContext();
  return (
    <QuoteRoundComposerRoute
      buildId={buildId}
      organizationId={normalizeQuoteRoundOrganizationId(context.organizationId)}
      roundId={roundId}
      routeBase="/backoffice"
    />
  );
}

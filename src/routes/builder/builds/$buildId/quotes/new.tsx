import { createFileRoute } from "@tanstack/react-router";

import {
  normalizeQuoteRoundOrganizationId,
  QuoteRoundComposerRoute,
  resolveQuoteRoundRepublishCapacity,
} from "#/features/quote-solicitation/QuoteRoundComposerRoute.tsx";

export interface QuoteRoundComposerSearch {
  roundId?: string;
}

function normalizeRoundId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/builder/builds/$buildId/quotes/new")({
  validateSearch: (
    search: Record<string, unknown>
  ): QuoteRoundComposerSearch => {
    const roundId = normalizeRoundId(search.roundId);
    return roundId ? { roundId } : {};
  },
  component: BuilderQuoteRoundComposerRoute,
});

function BuilderQuoteRoundComposerRoute() {
  const { buildId } = Route.useParams();
  const { roundId } = Route.useSearch();
  const context = Route.useRouteContext();
  return (
    <QuoteRoundComposerRoute
      buildId={buildId}
      organizationId={normalizeQuoteRoundOrganizationId(context.organizationId)}
      republishCapacity={resolveQuoteRoundRepublishCapacity("/builder", [
        context.role,
        ...(context.roles ?? []),
      ])}
      roundId={roundId}
      routeBase="/builder"
    />
  );
}

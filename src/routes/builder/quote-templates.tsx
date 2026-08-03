import { createFileRoute } from "@tanstack/react-router";

import { QuoteTemplateRegistry } from "#/features/quote-solicitation/QuoteTemplateRegistry.tsx";

export const Route = createFileRoute("/builder/quote-templates")({
  component: BuilderQuoteTemplatesRoute,
});

function BuilderQuoteTemplatesRoute() {
  const context = Route.useRouteContext();
  return (
    <QuoteTemplateRegistry
      workosOrganizationId={context.organizationId as string}
    />
  );
}

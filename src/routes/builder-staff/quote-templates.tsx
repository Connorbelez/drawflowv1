import { createFileRoute } from "@tanstack/react-router";

import { QuoteTemplateRegistry } from "#/features/quote-solicitation/QuoteTemplateRegistry.tsx";

export const Route = createFileRoute("/builder-staff/quote-templates")({
  component: BuilderStaffQuoteTemplatesRoute,
});

function BuilderStaffQuoteTemplatesRoute() {
  const context = Route.useRouteContext();
  return (
    <QuoteTemplateRegistry
      workosOrganizationId={context.organizationId as string}
    />
  );
}

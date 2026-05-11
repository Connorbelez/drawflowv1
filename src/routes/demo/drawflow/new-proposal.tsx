import { createFileRoute } from "@tanstack/react-router";
import { BuilderNewProposalRoute } from "#/features/builder-proposal-demo/BuilderProposalDemo.tsx";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/drawflow/new-proposal")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    draftId:
      typeof search.draftId === "string" && search.draftId.length > 0
        ? search.draftId
        : undefined,
  }),
  component: NewProposalRoute,
});

function NewProposalRoute() {
  const { draftId } = Route.useSearch();
  return (
    <BuilderNewProposalRoute
      draftId={draftId as Id<"demo_builderProposalDrafts"> | undefined}
    />
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/proposals/")({
  staticData: {
    breadcrumb: { label: "Proposals", to: "/contractor/proposals" },
  },
  component: ContractorProposals,
});

/**
 * Active proposal assignments (PRD §8.4, user story 20). Labeled planning/
 * pending so tentative work is not confused with active execution (user story
 * 21).
 */
function ContractorProposals() {
  const items = useQuery(api.contractorWorkspace.listContractorWorkItems, {});
  const proposals = (items ?? []).filter((i) => i.objectType === "proposal");

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <h1 className="font-semibold text-2xl">Proposals</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            Proposals where you are included in planning work. These are pending
            until the proposal is approved and closed.
          </p>
        </header>

        <Frame>
          <FramePanel className="p-0">
            {items === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading…</p>
            ) : proposals.length === 0 ? (
              <p className="p-5 text-muted-foreground text-sm">
                No active proposal assignments.
              </p>
            ) : (
              <ul className="divide-y">
                {proposals.map((item) => (
                  <li key={item._id} className="p-4">
                    <Link
                      to="/contractor/proposals/$proposalId"
                      params={{ proposalId: item.parentId }}
                      className="block"
                    >
                      <p className="text-sm font-medium">{item.parentName}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.milestoneName} · {item.role}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

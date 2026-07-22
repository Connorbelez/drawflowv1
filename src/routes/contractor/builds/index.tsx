import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/builds/")({
  staticData: {
    breadcrumb: { label: "Builds", to: "/contractor/builds" },
  },
  component: ContractorBuilds,
});

/**
 * Active build assignments (PRD §8.5, user story 19).
 */
function ContractorBuilds() {
  const items = useQuery(api.contractorWorkspace.listContractorWorkItems, {});
  const builds = (items ?? []).filter((i) => i.objectType === "build");

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <h1 className="font-semibold text-2xl">Builds</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            Active builds you are working on.
          </p>
        </header>

        <Frame>
          <FramePanel className="p-0">
            {items === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading…</p>
            ) : builds.length === 0 ? (
              <p className="p-5 text-muted-foreground text-sm">
                No active build assignments.
              </p>
            ) : (
              <ul className="divide-y">
                {builds.map((item) => (
                  <li key={item._id} className="p-4">
                    <Link
                      to="/contractor/builds/$buildId"
                      params={{ buildId: item.parentId }}
                      search={{ assignmentId: undefined }}
                      className="block"
                    >
                      <p className="font-medium text-sm">{item.parentName}</p>
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/builds/$buildId")({
  staticData: {
    breadcrumb: { label: "Build", to: "/contractor/builds" },
  },
  component: ContractorBuildDetail,
});

/**
 * Active build detail (PRD §8.5). Scope-limited; raw ratings and financing
 * never reach the contractor (backend-enforced redaction).
 */
function ContractorBuildDetail() {
  const { buildId } = Route.useParams();
  const detail = useQuery(api.contractorWorkspace.getContractorBuildDetail, {
    buildId: buildId as Id<"activeBuilds">,
  });

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <p className="text-muted-foreground text-sm">Loading build…</p>
      </main>
    );
  }

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">Active build</p>
          <h1 className="mt-1 font-semibold text-2xl">
            {detail.build.buildName}
          </h1>
          {detail.build.location ? (
            <p className="mt-1 text-muted-foreground text-sm">
              {detail.build.location}
            </p>
          ) : null}
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <Frame className="lg:col-span-2">
            <FramePanel className="p-0">
              <div className="border-b p-4">
                <h2 className="font-semibold text-sm">Your assigned scope</h2>
              </div>
              <ul className="divide-y">
                {detail.assignedScope.map((scope) => (
                  <li key={scope.assignmentId} className="p-4">
                    <p className="text-sm font-medium">{scope.milestoneName}</p>
                    <p className="text-muted-foreground text-xs">
                      {scope.role} · {scope.status}
                    </p>
                  </li>
                ))}
              </ul>
            </FramePanel>
          </Frame>

          <div className="flex flex-col gap-5">
            <Frame>
              <FramePanel className="flex flex-col gap-2 p-4">
                <h2 className="font-semibold text-sm">Builder contact</h2>
                {detail.builderContact ? (
                  <div className="text-sm">
                    <p className="font-medium">
                      {detail.builderContact.displayName}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No builder contact available.
                  </p>
                )}
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel className="flex flex-col gap-2 p-4">
                <h2 className="font-semibold text-sm">Permit documents</h2>
                {detail.permitDocuments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No permit documents shared yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detail.permitDocuments.map((doc) => (
                      <li key={doc._id} className="text-sm">
                        {doc.fileName}
                      </li>
                    ))}
                  </ul>
                )}
              </FramePanel>
            </Frame>
          </div>
        </div>
      </div>
    </main>
  );
}

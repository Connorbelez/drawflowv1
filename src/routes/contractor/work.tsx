import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/work")({
  staticData: {
    breadcrumb: { label: "Work", to: "/contractor/work" },
  },
  component: ContractorWorkList,
});

/**
 * Unified work list (PRD §8.3). All active assigned scope items across
 * proposals/builds, sorted by urgency/date.
 */
function ContractorWorkList() {
  const items = useQuery(api.contractorWorkspace.listContractorWorkItems, {});

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <h1 className="font-semibold text-2xl">Work</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            All active assigned scope, sorted by urgency. Proposal work is
            labeled planning/pending — do not confuse tentative work with active
            execution.
          </p>
        </header>

        <Frame>
          <FramePanel className="p-0">
            {items === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading work…</p>
            ) : items.length === 0 ? (
              <p className="p-5 text-muted-foreground text-sm">
                You have no active assignments yet.
              </p>
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li
                    key={item._id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            item.objectType === "proposal"
                              ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                              : "rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
                          }
                        >
                          {item.objectType === "proposal" ? "Planning" : "Active"}
                        </span>
                        <p className="truncate text-sm font-medium">
                          {item.milestoneName}
                        </p>
                      </div>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        {item.parentName} · {item.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <StatusPill label="Status" value={item.status} />
                      <StatusPill
                        label="Ack"
                        value={humanize(item.acknowledgementStatus)}
                      />
                      <StatusPill
                        label="Evidence"
                        value={humanize(item.evidenceStatus)}
                      />
                    </div>
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

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-[10px] uppercase">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

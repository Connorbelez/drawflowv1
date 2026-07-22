import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/schedule")({
  staticData: {
    breadcrumb: { label: "Schedule", to: "/contractor/schedule" },
  },
  component: ContractorSchedule,
});

/**
 * Contractor schedule (PRD §8.6). Events scoped to the contractor's assigned
 * milestones/submilestones only — unrelated project schedule data never
 * appears.
 */
function ContractorSchedule() {
  const events = useQuery(api.contractorWorkspace.listContractorScheduleEvents, {});

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <h1 className="font-semibold text-2xl">Schedule</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            Milestone starts, ends, and coordination reminders scoped to your
            assignments.
          </p>
        </header>

        <Frame>
          <FramePanel className="p-0">
            {events === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading schedule…</p>
            ) : events.length === 0 ? (
              <p className="p-5 text-muted-foreground text-sm">
                No scheduled events for your assignments yet.
              </p>
            ) : (
              <ul className="divide-y">
                {events.map((event) => (
                  <li
                    key={event._id}
                    className="flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {event.parentName}
                        {event.milestoneKey ? ` · ${event.milestoneKey}` : ""}
                      </p>
                    </div>
                    <time className="text-muted-foreground text-xs tabular-nums">
                      {formatDateTime(event.startsAt)}
                    </time>
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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

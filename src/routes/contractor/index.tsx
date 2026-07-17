import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Hammer,
  ImageUp,
  TrendingUp,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contractor/")({
  staticData: {
    breadcrumb: { label: "Dashboard", to: "/contractor" },
  },
  component: ContractorDashboard,
});

/**
 * Contractor dashboard (PRD §8.2). The first screen answers: where am I
 * working, what is next, and what does DrawFlow need from me? Mobile-friendly
 * and centered on work, schedule, evidence, and scope.
 */
function ContractorDashboard() {
  const summary = useQuery(api.contractorWorkspace.getContractorWorkspaceSummary, {});

  if (summary === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-muted-foreground text-sm">Loading workspace…</p>
        </div>
      </main>
    );
  }

  const counts = summary.counts;

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Contractor workspace
          </p>
          <h1 className="mt-1 font-semibold text-2xl">
            Welcome back{summary.contractor.name ? `, ${summary.contractor.name}` : ""}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            Your assigned work, upcoming schedule, and evidence queue across
            FairLend builds and proposals.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Hammer className="size-4" />}
            label="Active builds"
            value={String(counts.activeBuildAssignments)}
            to="/contractor/work"
          />
          <MetricCard
            icon={<ClipboardList className="size-4" />}
            label="Active proposals"
            value={String(counts.activeProposalAssignments)}
            to="/contractor/work"
          />
          <MetricCard
            icon={<CalendarClock className="size-4" />}
            label="Next 14 days"
            value={String(counts.upcomingScheduleEvents)}
            to="/contractor/schedule"
          />
          <MetricCard
            icon={<ImageUp className="size-4" />}
            label="Evidence queue"
            value={String(counts.evidenceQueue)}
            to="/contractor/evidence"
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-3">
          <Frame className="lg:col-span-2">
            <FramePanel className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Today &amp; next 14 days</h2>
                <Button
                  render={<Link to="/contractor/schedule" />}
                  size="sm"
                  variant="ghost"
                >
                  Full schedule
                </Button>
              </div>
              {summary.upcomingScheduleEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No upcoming scheduled work in the next 14 days.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {summary.upcomingScheduleEvents.slice(0, 6).map((event: any) => (
                    <li
                      key={event._id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {event.parentName}
                        </p>
                      </div>
                      <time className="text-muted-foreground text-xs">
                        {formatDate(event.startsAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </FramePanel>
          </Frame>

          <div className="flex flex-col gap-5">
            <ProfileReadinessCard percent={summary.profileReadiness.completenessPercent} missing={summary.profileReadiness.missingFields} />
            <Frame>
              <FramePanel className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <h2 className="font-semibold text-sm">Pending clarifications</h2>
                </div>
                <p className="text-muted-foreground text-sm">
                  {counts.pendingClarifications} open scope item
                  {counts.pendingClarifications === 1 ? "" : "s"} awaiting action.
                </p>
                <Button
                  render={<Link to="/contractor/work" />}
                  size="sm"
                  variant="outline"
                >
                  Review work list
                </Button>
              </FramePanel>
            </Frame>
          </div>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  to: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
            {icon}
          </span>
          <div>
            <CardTitle className="text-lg">{value}</CardTitle>
            <p className="text-muted-foreground text-xs">{label}</p>
          </div>
        </div>
        <Button
          render={<Link to={to as never} />}
          size="sm"
          variant="ghost"
        >
          <TrendingUp className="size-4" />
        </Button>
      </CardHeader>
    </Card>
  );
}

function ProfileReadinessCard({
  percent,
  missing,
}: {
  percent: number;
  missing: string[];
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="font-semibold text-sm">Profile readiness</h2>
        <div className="flex items-center gap-2">
          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums">{percent}%</span>
        </div>
        {missing.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Suggested: {missing.join(", ")}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">All key fields complete.</p>
        )}
        <Button
          render={<Link to="/contractor/profile" />}
          size="sm"
          variant="outline"
        >
          Edit profile
        </Button>
      </FramePanel>
    </Frame>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

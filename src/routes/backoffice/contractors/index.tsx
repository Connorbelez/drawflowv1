import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Gauge,
  Plus,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  ContractorQuickAddDrawer,
  type ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  getVisualContractorList,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";

export const Route = createFileRoute("/backoffice/contractors/")({
  staticData: {
    breadcrumb: {
      label: "Contractors",
      to: "/backoffice/contractors",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveResult = useQuery(
    contractorApi.listContractors,
    visualFixture
      ? "skip"
      : {
          search: search || undefined,
          workosOrganizationId,
        },
  );
  const result = visualFixture ? getVisualContractorList() : liveResult;
  const createContractor = useMutation(contractorApi.createContractorProfile);

  const capabilityCount = result?.summary?.capabilityKeys?.length ?? 0;
  const contractors = result?.contractors ?? [];
  const activeCount = result?.summary?.activeCount ?? 0;
  const averageRate = useMemo(() => {
    const rates = contractors
      .map((contractor: any) => contractor.defaultPayRateCents)
      .filter((rate: unknown): rate is number => typeof rate === "number");
    if (rates.length === 0) return null;
    return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
  }, [contractors]);

  const createProfile = async ({
    contractor,
  }: {
    contractor: ContractorProfileDraft;
  }) => {
    if (!result?.brokerage?._id) {
      throw new Error("Brokerage provisioning is required first.");
    }
    await createContractor({
      ...contractor,
      brokerageId: result.brokerage._id,
      workosOrganizationId,
    });
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              Backoffice roster
            </p>
            <h1 className="mt-1 font-semibold text-2xl">Contractors</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              Brokerage-scoped contractor profiles for build enrollment,
              milestone assignment, performance history, and future scheduling.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/backoffice/onboard-contractor" />}>
              <UserRound />
              Onboard contractor
            </Button>
            <Button onClick={() => setDrawerOpen(true)} type="button">
              <Plus />
              Add contractor
            </Button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard
            icon={<Gauge className="size-4" />}
            label="Active profiles"
            value={result === undefined ? "..." : String(activeCount)}
          />
          <MetricCard
            icon={<Wrench className="size-4" />}
            label="Capability tags"
            value={result === undefined ? "..." : String(capabilityCount)}
          />
          <MetricCard
            icon={<CalendarClock className="size-4" />}
            label="Average rate"
            value={averageRate === null ? "Unrated" : centsPerUnit(averageRate)}
          />
        </section>

        <Frame>
          <FramePanel className="grid gap-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-sm">Roster</h2>
                <p className="text-muted-foreground text-xs">
                  Search by company, trade, city, capability, or equipment.
                </p>
              </div>
              <span className="relative block w-full sm:w-80">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  nativeInput
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Search contractors"
                  value={search}
                />
              </span>
            </div>

            {result === undefined ? (
              <div className="grid gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    className="h-20 animate-pulse rounded-lg bg-muted"
                    key={index}
                  />
                ))}
              </div>
            ) : contractors.length === 0 ? (
              <Empty className="min-h-72">
                <EmptyTitle>No contractor profiles</EmptyTitle>
                <EmptyDescription>
                  Create the first contractor profile to track work history,
                  capabilities, schedule, and quality signals.
                </EmptyDescription>
                <Button onClick={() => setDrawerOpen(true)} type="button">
                  <Plus />
                  Add contractor
                </Button>
              </Empty>
            ) : (
              <div className="grid gap-2">
                {contractors.map((contractor: any) => (
                  <Link
                    className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={contractor._id}
                    params={{ contractorId: contractor._id }}
                    to="/backoffice/contractors/$contractorId"
                  >
                    <Card className="transition-colors hover:bg-accent/40">
                      <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <h3 className="truncate font-semibold text-sm">
                              {contractor.name}
                            </h3>
                            <Badge variant="outline">
                              {contractor.kind ?? "company"}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground text-xs">
                            {(contractor.trades ?? []).join(", ") ||
                              "No trades"}
                            {contractor.city ? ` · ${contractor.city}` : ""}
                          </p>
                        </div>
                        <ChipList
                          empty="No capabilities"
                          values={(contractor.capabilities ?? []).map(
                            (capability: any) => capability.label,
                          )}
                        />
                        <ChipList
                          empty="No equipment"
                          values={(contractor.equipment ?? []).map(
                            (equipment: any) => equipment.name,
                          )}
                        />
                        <div className="text-left md:text-right">
                          <p className="font-semibold text-sm tabular-nums">
                            {contractor.defaultPayRateCents
                              ? centsPerUnit(
                                  contractor.defaultPayRateCents,
                                  contractor.defaultPayRateUnit,
                                )
                              : "Rate unset"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {contractor.onboardingStatus === "account_linked"
                              ? "Account linked"
                              : "Profile only"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </FramePanel>
        </Frame>
      </div>

      <ContractorQuickAddDrawer
        createLabel="Create profile"
        onCreate={createProfile}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        title="Create contractor profile"
      />
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-4">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <div>
          <CardTitle className="text-sm">{value}</CardTitle>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
      </CardHeader>
    </Card>
  );
}

function ChipList({ empty, values }: { empty: string; values: string[] }) {
  const visible = values.slice(0, 3);
  if (visible.length === 0) {
    return <p className="text-muted-foreground text-xs">{empty}</p>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visible.map((value) => (
        <Badge className="max-w-full truncate" key={value} variant="secondary">
          {value}
        </Badge>
      ))}
      {values.length > visible.length ? (
        <Badge variant="outline">+{values.length - visible.length}</Badge>
      ) : null}
    </div>
  );
}

function centsPerUnit(value: number, unit = "hour") {
  return `$${Math.round(value / 100).toLocaleString()}/${unit}`;
}

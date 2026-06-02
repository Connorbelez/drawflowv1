import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Gauge,
  Plus,
  UserRound,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  ContractorQuickAddDrawer,
  type ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  ContractorRosterTable,
  type ContractorRosterRow,
} from "#/features/contractors/ContractorRosterTable.tsx";
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
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveResult = useQuery(
    contractorApi.listContractors,
    visualFixture
      ? "skip"
      : {
          includeInactive: true,
          workosOrganizationId,
        },
  );
  const result = visualFixture ? getVisualContractorList() : liveResult;
  const createContractor = useMutation(contractorApi.createContractorProfile);

  const capabilityCount = result?.summary?.capabilityKeys?.length ?? 0;
  const contractors = (result?.contractors ?? []) as ContractorRosterRow[];
  const activeCount = contractors.filter(
    (contractor) => (contractor.status ?? "active") === "active",
  ).length;
  const averageRate = useMemo(() => {
    const rates = contractors
      .map((contractor) => contractor.defaultPayRateCents)
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
            <ContractorRosterTable
              contractors={contractors}
              detailHrefFor={(contractor) =>
                `/backoffice/contractors/${contractor._id}`
              }
              onAddContractor={() => setDrawerOpen(true)}
              pending={result === undefined}
            />
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

function centsPerUnit(value: number, unit = "hour") {
  return `$${Math.round(value / 100).toLocaleString()}/${unit}`;
}

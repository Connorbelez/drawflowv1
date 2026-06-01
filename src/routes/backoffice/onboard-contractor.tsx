import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BadgeCheck, Link2, Plus, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  ContractorQuickAddDrawer,
  type ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  buildWorkosUserOptions,
  VISUAL_WORKOS_USER_OPTIONS,
  WorkosUserAutocomplete,
} from "#/features/contractors/WorkosUserAutocomplete.tsx";
import {
  getVisualContractorList,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";
import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/backoffice/onboard-contractor")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  ssr: false,
  staticData: {
    breadcrumb: {
      label: "Onboard contractor",
      to: "/backoffice/onboard-contractor",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveResult = useQuery(
    contractorApi.listContractors,
    visualFixture
      ? "skip"
      : {
          workosOrganizationId,
        },
  );
  const workosProjection = useQuery(
    api.workosProjection.listUserManagement,
    visualFixture ? "skip" : {},
  );
  const result = visualFixture ? getVisualContractorList() : liveResult;
  const workosUserOptions = useMemo(
    () =>
      visualFixture
        ? VISUAL_WORKOS_USER_OPTIONS
        : buildWorkosUserOptions(workosProjection, workosOrganizationId),
    [visualFixture, workosProjection, workosOrganizationId],
  );
  const createContractor = useMutation(contractorApi.createContractorProfile);
  const linkAccount = useMutation(contractorApi.linkContractorProfileToWorkosUser);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [workosUserId, setWorkosUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const contractors = result?.contractors ?? [];
  const selectedContractor = useMemo(
    () =>
      contractors.find(
        (contractor: any) => contractor._id === selectedContractorId,
      ) ?? contractors[0],
    [contractors, selectedContractorId],
  );

  const createProfile = async ({
    contractor,
  }: {
    contractor: ContractorProfileDraft;
  }) => {
    if (!result?.brokerage?._id) {
      throw new Error("Brokerage provisioning is required first.");
    }
    const contractorId = await createContractor({
      ...contractor,
      brokerageId: result.brokerage._id,
      workosOrganizationId,
    });
    setSelectedContractorId(String(contractorId));
    setMessage("Contractor profile created. Link a WorkOS user when ready.");
  };

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault();
    const contractorId = selectedContractor?._id;
    if (!contractorId || !workosUserId.trim() || pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await linkAccount({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
        workosUserId: workosUserId.trim(),
      });
      setWorkosUserId("");
      setMessage("Contractor account linked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
              to="/backoffice/contractors"
            >
              <ArrowLeft className="size-4" />
              Contractors
            </Link>
            <h1 className="mt-3 font-semibold text-2xl">
              Onboard contractor
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              Create the operating profile, connect the authenticated account,
              then assign the contractor to build and milestone work.
            </p>
          </div>
          <Button onClick={() => setDrawerOpen(true)} type="button">
            <Plus />
            Create profile
          </Button>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <StepCard
            icon={<UserRound className="size-4" />}
            label="Profile"
            state={contractors.length > 0 ? "Ready" : "Needed"}
            title="Operating record"
          />
          <StepCard
            icon={<Link2 className="size-4" />}
            label="Identity"
            state={
              selectedContractor?.accountWorkosUserId
                ? "Linked"
                : "Optional"
            }
            title="WorkOS user"
          />
          <StepCard
            icon={<BadgeCheck className="size-4" />}
            label="Activation"
            state="Build assignment"
            title="Milestone scope"
          />
        </section>

        <Frame>
          <FramePanel className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base">Select contractor</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                {contractors.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                    Create a contractor profile to start onboarding.
                  </p>
                ) : (
                  <NativeSelect
                    className="w-full"
                    onChange={(event) =>
                      setSelectedContractorId(event.currentTarget.value)
                    }
                    value={selectedContractor?._id ?? ""}
                  >
                    {contractors.map((contractor: any) => (
                      <NativeSelectOption
                        key={contractor._id}
                        value={contractor._id}
                      >
                        {contractor.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
                {selectedContractor ? (
                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {selectedContractor.name}
                      </p>
                      <Badge variant="outline">
                        {selectedContractor.kind ?? "company"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {(selectedContractor.trades ?? []).join(", ") ||
                        "No trades recorded"}
                      {selectedContractor.city
                        ? ` · ${selectedContractor.city}`
                        : ""}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base">
                  Link authenticated user
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                <form className="grid gap-3" onSubmit={submitLink}>
                  <WorkosUserAutocomplete
                    disabled={pending}
                    onValueChange={setWorkosUserId}
                    options={workosUserOptions}
                    value={workosUserId}
                  />
                  {error ? (
                    <p className="text-destructive text-xs">{error}</p>
                  ) : null}
                  {message ? (
                    <p className="text-success text-xs">{message}</p>
                  ) : null}
                  <Button
                    disabled={!selectedContractor || !workosUserId.trim() || pending}
                    type="submit"
                  >
                    <Link2 />
                    {pending ? "Linking..." : "Link account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </FramePanel>
        </Frame>
      </div>

      <ContractorQuickAddDrawer
        createLabel="Create profile"
        description="Capture schedule, pay rate, capabilities, and equipment before assigning the contractor to build work."
        onCreate={createProfile}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        title="Create contractor profile"
      />
    </main>
  );
}

function StepCard({
  icon,
  label,
  state,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  state: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 p-4">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {label} · {state}
          </p>
        </div>
      </CardHeader>
    </Card>
  );
}

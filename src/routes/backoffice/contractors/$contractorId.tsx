import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  DollarSign,
  Link2,
  Star,
} from "lucide-react";
import { useState } from "react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  getVisualContractorDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";

export const Route = createFileRoute("/backoffice/contractors/$contractorId")({
  staticData: {
    breadcrumb: {
      label: "Contractor detail",
      to: "/backoffice/contractors",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { contractorId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveDetail = useQuery(
    contractorApi.getContractorDetail,
    visualFixture
      ? "skip"
      : {
          contractorId: contractorId as Id<"contractorProfiles">,
          workosOrganizationId,
        },
  );
  const detail = visualFixture
    ? getVisualContractorDetail(contractorId)
    : liveDetail;
  const linkAccount = useMutation(contractorApi.linkContractorProfileToWorkosUser);
  const [workosUserId, setWorkosUserId] = useState("");
  const [pendingLink, setPendingLink] = useState(false);
  const [linkError, setLinkError] = useState("");

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame>
          <FramePanel className="p-5 text-sm">Loading contractor...</FramePanel>
        </Frame>
      </main>
    );
  }

  const profile = detail.profile;
  const workHistory = detail.workHistory ?? [];
  const ratings = detail.ratings ?? [];
  const performance = detail.performance ?? {};
  const averageRating = performance.averageQualityRating;

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workosUserId.trim()) return;
    setPendingLink(true);
    setLinkError("");
    try {
      await linkAccount({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
        workosUserId: workosUserId.trim(),
      });
      setWorkosUserId("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingLink(false);
    }
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
              to="/backoffice/contractors"
            >
              <ArrowLeft className="size-4" />
              Contractors
            </Link>
            <h1 className="mt-3 font-semibold text-2xl">{profile.name}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {profile.trades?.join(", ") || "No trades recorded"}
              {profile.city ? ` · ${profile.city}` : ""}
            </p>
          </div>
          <Badge variant={profile.accountWorkosUserId ? "success" : "outline"}>
            {profile.accountWorkosUserId ? "Account linked" : "Profile only"}
          </Badge>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <MetricCard
            icon={<BriefcaseBusiness className="size-4" />}
            label="Build / milestone records"
            value={String(workHistory.length)}
          />
          <MetricCard
            icon={<Star className="size-4" />}
            label="Avg quality"
            value={averageRating === null ? "No ratings" : `${averageRating}/5`}
          />
          <MetricCard
            icon={<BadgeCheck className="size-4" />}
            label="Ratings"
            value={String(ratings.length)}
          />
          <MetricCard
            icon={<DollarSign className="size-4" />}
            label="Tracked spend"
            value={formatCurrencyCents(performance.totalActualCostCents ?? 0)}
          />
          <MetricCard
            icon={<Camera className="size-4" />}
            label="Tagged photos"
            value={String(
              workHistory.reduce(
                (sum: number, row: any) => sum + row.evidencePhotos.length,
                0,
              ),
            )}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <Frame>
            <FramePanel className="grid gap-4 p-4 sm:p-5">
              <div>
                <h2 className="font-semibold text-sm">Work history</h2>
                <p className="text-muted-foreground text-xs">
                  Only evidence photos tagged to assigned milestone or
                  submilestone work are shown here.
                </p>
              </div>

              {workHistory.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
                  No build or milestone assignments have been recorded for this
                  contractor.
                </p>
              ) : (
                <div className="grid gap-3">
                  {workHistory.map((row: any) => (
                    <Card key={row._id}>
                      <CardHeader className="p-4 pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">
                              {row.buildName}
                            </CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">
                              {row.milestoneName} · {row.role}
                              {row.postHoc ? " · post-hoc" : ""}
                            </p>
                          </div>
                          <Badge variant="outline">{row.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 p-4 pt-2">
                        <ChipList
                          empty="Milestone-level assignment"
                          values={row.submilestones.map(
                            (submilestone: any) => submilestone.name,
                          )}
                        />
                        <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
                          <MiniStat
                            label="Estimated"
                            value={formatCurrencyCents(row.estimatedCostCents)}
                          />
                          <MiniStat
                            label="Actual"
                            value={formatCurrencyCents(row.actualCostCents)}
                          />
                          <MiniStat
                            label="Hours"
                            value={formatHours(row.actualHours ?? row.estimatedHours)}
                          />
                          {row.costNotes ? (
                            <p className="text-muted-foreground text-xs sm:col-span-3">
                              {row.costNotes}
                            </p>
                          ) : null}
                        </div>
                        {row.evidencePhotos.length === 0 ? (
                          <p className="text-muted-foreground text-xs">
                            No tagged evidence photos for this assigned scope.
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {row.evidencePhotos.map((photo: any) => (
                              <figure
                                className="overflow-hidden rounded-lg border bg-muted/30"
                                key={photo.evidenceKey}
                              >
                                {photo.previewUrl ? (
                                  <img
                                    alt={photo.label}
                                    className="aspect-video w-full object-cover"
                                    src={photo.previewUrl}
                                  />
                                ) : (
                                  <div className="grid aspect-video place-items-center text-muted-foreground">
                                    <Camera className="size-5" />
                                  </div>
                                )}
                                <figcaption className="p-2 text-xs">
                                  <p className="truncate font-medium">
                                    {photo.label}
                                  </p>
                                  <p className="truncate text-muted-foreground">
                                    {photo.submilestoneKey ?? photo.milestoneKey}
                                  </p>
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </FramePanel>
          </Frame>

          <div className="grid gap-4 content-start">
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base">Operating profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 pt-0">
                <DetailRow
                  label="Rate"
                  value={
                    profile.defaultPayRateCents
                      ? centsPerUnit(
                          profile.defaultPayRateCents,
                          profile.defaultPayRateUnit,
                        )
                      : "Unset"
                  }
                />
                <DetailRow label="Email" value={profile.email ?? "Unset"} />
                <DetailRow label="Phone" value={profile.phone ?? "Unset"} />
                <ChipList
                  empty="No capabilities"
                  label="Capabilities"
                  values={(profile.capabilities ?? []).map(
                    (capability: any) => capability.label,
                  )}
                />
                <ChipList
                  empty="No equipment"
                  label="Equipment"
                  values={(profile.equipment ?? []).map(
                    (equipment: any) => equipment.name,
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base">Contractor account</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                <p className="text-muted-foreground text-sm">
                  Link this profile to an authenticated WorkOS user when the
                  contractor is onboarded as a contractor user type.
                </p>
                <form className="grid gap-2" onSubmit={submitLink}>
                  <Input
                    nativeInput
                    onChange={(event) => setWorkosUserId(event.currentTarget.value)}
                    placeholder="user_..."
                    value={workosUserId}
                  />
                  {linkError ? (
                    <p className="text-destructive text-xs">{linkError}</p>
                  ) : null}
                  <Button disabled={pendingLink} type="submit">
                    <Link2 />
                    {pendingLink ? "Linking..." : "Link account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
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
      <CardHeader className="flex-row items-center gap-2 p-4">
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

function ChipList({
  empty,
  label,
  values,
}: {
  empty: string;
  label?: string;
  values: string[];
}) {
  return (
    <div className="grid gap-2">
      {label ? (
        <p className="text-muted-foreground text-xs uppercase">{label}</p>
      ) : null}
      {values.length === 0 ? (
        <p className="text-muted-foreground text-xs">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.map((value) => (
            <Badge key={value} variant="secondary">
              {value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function centsPerUnit(value: number, unit = "hour") {
  return `${formatCurrencyCents(value)}/${unit}`;
}

function formatCurrencyCents(value?: number) {
  if (typeof value !== "number") return "Unset";
  return `$${Math.round(value / 100).toLocaleString()}`;
}

function formatHours(value?: number) {
  if (typeof value !== "number") return "Unset";
  return `${value.toLocaleString()}h`;
}

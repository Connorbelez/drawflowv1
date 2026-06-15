"use client";

import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  DollarSign,
  Link2,
  Pencil,
  Star,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

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
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "./ContractorQuickAddDrawer";
import {
  WorkosUserAutocomplete,
  type WorkosUserOption,
} from "./WorkosUserAutocomplete";

export type ContractorDetailView = {
  performance?: {
    averageQualityRating?: number | null;
    totalActualCostCents?: number;
  };
  profile: {
    accountWorkosUserId?: string;
    availabilityWindows?: unknown[];
    capabilities?: Array<{
      capabilityKey?: string;
      label: string;
      milestoneArchetypeKey?: string;
      trade?: string;
    }>;
    city?: string;
    defaultPayRateCents?: number;
    defaultPayRateUnit?: string;
    email?: string;
    equipment?: Array<{
      equipmentKey?: string;
      name: string;
      quantity?: number;
    }>;
    kind?: "company" | "individual";
    name: string;
    phone?: string;
    status?: "active" | "inactive";
    trades?: string[];
  };
  identityLinks?: Array<{
    _id: string;
    confidence?: number;
    peerBrokerageId?: string;
    peerContractorId: string;
    peerName: string;
    reason?: string;
    status: string;
  }>;
  intelligence?: {
    activeBuildAssignmentCount?: number;
    capabilityPerformance?: Array<{
      averageRating?: number | null;
      capabilityKey: string;
      label: string;
      ratingCount: number;
      totalActualCostCents: number;
      totalEstimatedCostCents: number;
    }>;
    plannedAssignmentCount?: number;
    scheduledHours?: number;
    utilizationPercent?: number | null;
    weeklyWindowHours?: number;
  };
  ratings?: Array<unknown>;
  workHistory?: ContractorWorkHistoryRow[];
};

export type ContractorWorkHistoryRow = {
  _id: string;
  actualCostCents?: number;
  actualHours?: number;
  buildId: string;
  buildName: string;
  buildStatus?: string;
  costNotes?: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  evidencePhotos: Array<{
    evidenceKey: string;
    label: string;
    milestoneKey: string;
    previewUrl?: string | null;
    submilestoneKey?: string;
  }>;
  milestoneKey: string;
  milestoneName: string;
  postHoc?: boolean;
  role: string;
  status: string;
  submilestones: Array<{ key: string; name: string }>;
};

export type ContractorAccountLinkControls = {
  error?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onWorkosUserIdChange: (value: string) => void;
  pending?: boolean;
  workosUserId: string;
  workosUserOptions: WorkosUserOption[];
};

export type ContractorProfileManagementControls = {
  error?: string;
  onSaveProfile: (draft: ContractorProfileDraft) => Promise<void> | void;
  onSetStatus: (status: "active" | "inactive") => Promise<void> | void;
  pending?: boolean;
};

export function ContractorDetailSurface({
  accountLink,
  backHref,
  backLabel,
  buildHrefForWorkHistory,
  detail,
  emptyWorkHistory = "No build or milestone assignments have been recorded for this contractor.",
  management,
  rightRailFooter,
}: {
  accountLink?: ContractorAccountLinkControls;
  backHref: string;
  backLabel: string;
  buildHrefForWorkHistory?: (row: ContractorWorkHistoryRow) => string;
  detail: ContractorDetailView;
  emptyWorkHistory?: string;
  management?: ContractorProfileManagementControls;
  rightRailFooter?: ReactNode;
}) {
  const { performance = {}, profile } = detail;
  const workHistory = detail.workHistory ?? [];
  const ratings = detail.ratings ?? [];
  const averageRating = performance.averageQualityRating;
  const [editOpen, setEditOpen] = useState(false);
  const editDraft = useMemo(() => contractorProfileToDraft(profile), [profile]);

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a
              className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
              href={backHref}
            >
              <ArrowLeft className="size-4" />
              {backLabel}
            </a>
            <h1 className="mt-3 font-semibold text-2xl">{profile.name}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {profile.trades?.join(", ") || "No trades recorded"}
              {profile.city ? ` / ${profile.city}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={profile.accountWorkosUserId ? "success" : "outline"}
            >
              {profile.accountWorkosUserId ? "Account linked" : "Profile only"}
            </Badge>
            <Badge
              variant={profile.status === "inactive" ? "outline" : "secondary"}
            >
              {profile.status === "inactive" ? "Inactive" : "Active"}
            </Badge>
            {management ? (
              <Button onClick={() => setEditOpen(true)} type="button">
                <Pencil />
                Edit profile
              </Button>
            ) : null}
          </div>
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
            value={
              typeof averageRating === "number"
                ? `${averageRating}/5`
                : "No ratings"
            }
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
                (sum, row) => sum + row.evidencePhotos.length,
                0
              )
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
                  {emptyWorkHistory}
                </p>
              ) : (
                <div className="grid gap-3">
                  {workHistory.map((row) => (
                    <Card key={row._id}>
                      <CardHeader className="p-4 pb-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">
                              {buildHrefForWorkHistory ? (
                                <a
                                  className="hover:text-primary"
                                  href={buildHrefForWorkHistory(row)}
                                >
                                  {row.buildName}
                                </a>
                              ) : (
                                row.buildName
                              )}
                            </CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">
                              {row.milestoneName} / {row.role}
                              {row.postHoc ? " / post-hoc" : ""}
                            </p>
                          </div>
                          <Badge variant="outline">{row.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 p-4 pt-2">
                        <ChipList
                          empty="Milestone-level assignment"
                          values={row.submilestones.map(
                            (submilestone) => submilestone.name
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
                            value={formatHours(
                              row.actualHours ?? row.estimatedHours
                            )}
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
                            {row.evidencePhotos.map((photo) => (
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
                                    {photo.submilestoneKey ??
                                      photo.milestoneKey}
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

          <div className="grid content-start gap-4">
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
                          profile.defaultPayRateUnit
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
                    (capability) => capability.label
                  )}
                />
                <ChipList
                  empty="No equipment"
                  label="Equipment"
                  values={(profile.equipment ?? []).map(
                    (equipment) => equipment.name
                  )}
                />
                {management ? (
                  <div className="grid gap-2 border-t pt-3">
                    {management.error ? (
                      <p className="text-destructive text-xs">
                        {management.error}
                      </p>
                    ) : null}
                    <Button
                      disabled={management.pending}
                      onClick={() =>
                        management.onSetStatus(
                          profile.status === "inactive" ? "active" : "inactive"
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {profile.status === "inactive"
                        ? "Reactivate profile"
                        : "Deactivate profile"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {detail.intelligence ? (
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-base">
                    Scheduling and performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 pt-0">
                  <DetailRow
                    label="Active assignments"
                    value={String(
                      detail.intelligence.activeBuildAssignmentCount ?? 0
                    )}
                  />
                  <DetailRow
                    label="Planned assignments"
                    value={String(
                      detail.intelligence.plannedAssignmentCount ?? 0
                    )}
                  />
                  <DetailRow
                    label="Scheduled hours"
                    value={formatHours(detail.intelligence.scheduledHours)}
                  />
                  <DetailRow
                    label="Utilization"
                    value={
                      detail.intelligence.utilizationPercent === null ||
                      detail.intelligence.utilizationPercent === undefined
                        ? "Unscheduled"
                        : `${detail.intelligence.utilizationPercent}%`
                    }
                  />
                  <ChipList
                    empty="No capability analytics yet"
                    label="Capability analytics"
                    values={(
                      detail.intelligence.capabilityPerformance ?? []
                    ).map(
                      (row) =>
                        `${row.label}: ${
                          row.averageRating === null ||
                          row.averageRating === undefined
                            ? "unrated"
                            : `${row.averageRating}/5`
                        }`
                    )}
                  />
                </CardContent>
              </Card>
            ) : null}

            {(detail.identityLinks ?? []).length > 0 ? (
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Linked identities</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 p-4 pt-0">
                  {(detail.identityLinks ?? []).map((link) => (
                    <div
                      className="rounded-lg border bg-background/60 p-3"
                      key={link._id}
                    >
                      <p className="font-medium text-sm">{link.peerName}</p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {link.status}
                        {link.confidence === undefined
                          ? ""
                          : ` / ${Math.round(link.confidence * 100)}% confidence`}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {accountLink ? (
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-base">
                    Contractor account
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 pt-0">
                  <p className="text-muted-foreground text-sm">
                    Link this profile to an authenticated WorkOS user when the
                    contractor is onboarded as a contractor user type.
                  </p>
                  <form className="grid gap-2" onSubmit={accountLink.onSubmit}>
                    <WorkosUserAutocomplete
                      disabled={accountLink.pending}
                      onValueChange={accountLink.onWorkosUserIdChange}
                      options={accountLink.workosUserOptions}
                      value={accountLink.workosUserId}
                    />
                    {accountLink.error ? (
                      <p className="text-destructive text-xs">
                        {accountLink.error}
                      </p>
                    ) : null}
                    <Button
                      disabled={
                        !accountLink.workosUserId.trim() || accountLink.pending
                      }
                      type="submit"
                    >
                      <Link2 />
                      {accountLink.pending ? "Linking..." : "Link account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {rightRailFooter}
          </div>
        </section>
      </div>
      {management ? (
        <ContractorQuickAddDrawer
          createLabel={management.pending ? "Saving..." : "Save profile"}
          description="Update schedule, equipment, capabilities, pay profile, and contact details for allocation and performance analysis."
          initialDraft={editDraft}
          onCreate={async ({ contractor }) => {
            await management.onSaveProfile(contractor);
            setEditOpen(false);
          }}
          onOpenChange={setEditOpen}
          open={editOpen}
          title="Edit contractor profile"
        />
      ) : null}
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
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
  if (typeof value !== "number") {
    return "Unset";
  }
  return `$${Math.round(value / 100).toLocaleString()}`;
}

function formatHours(value?: number) {
  if (typeof value !== "number") {
    return "Unset";
  }
  return `${value.toLocaleString()}h`;
}

function contractorProfileToDraft(
  profile: ContractorDetailView["profile"]
): ContractorProfileDraft {
  return {
    availabilityWindows:
      (profile.availabilityWindows as ContractorProfileDraft["availabilityWindows"]) ??
      [],
    capabilities: (profile.capabilities ?? []).map((capability) => ({
      capabilityKey:
        capability.capabilityKey ?? slugFromLabel(capability.label),
      label: capability.label,
      milestoneArchetypeKey: capability.milestoneArchetypeKey,
      trade: capability.trade,
    })),
    city: profile.city,
    defaultPayRateCents: profile.defaultPayRateCents,
    defaultPayRateUnit:
      profile.defaultPayRateUnit === "day" ||
      profile.defaultPayRateUnit === "fixed"
        ? profile.defaultPayRateUnit
        : "hour",
    email: profile.email,
    equipment: (profile.equipment ?? []).map((equipment) => ({
      equipmentKey: equipment.equipmentKey ?? slugFromLabel(equipment.name),
      name: equipment.name,
      quantity: equipment.quantity ?? 1,
    })),
    kind: profile.kind ?? "company",
    name: profile.name,
    phone: profile.phone,
    trades: profile.trades ?? [],
  };
}

function slugFromLabel(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "contractor"
  );
}

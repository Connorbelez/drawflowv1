"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { initialsFor } from "./format";

type AttachedContractor = {
  _id: string;
  contractorId?: string;
  name: string;
  role: string;
  city?: string;
  email?: string;
  hourlyRateCents?: number;
  trades?: string[];
};

type AvailableContractor = {
  _id: Id<"demo_contractors"> | string;
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "hour" | "day" | "fixed";
  email?: string;
  name: string;
  onboardingStatus?: "profile_only" | "invited" | "account_linked";
  skills?: string[];
  trades?: string[];
};

interface ContractorActions {
  onAttachExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreateAndAttach?: (input: {
    contractor: ContractorProfileDraft;
    role: string;
  }) =>
    | Promise<void | string | { contractorId?: string }>
    | void
    | string
    | { contractorId?: string };
  onInviteCreatedContractor?: (contractorId: string) => Promise<void> | void;
  sourceLabel?: string;
}

interface ContractorsCardProps {
  actions?: ContractorActions;
  availableContractors: AvailableContractor[];
  buildId: Id<"demo_builds"> | string;
  canAssignToMilestone?: boolean;
  contractorDetailHrefFor?: (contractorId: string) => string;
  contractors: AttachedContractor[];
}

export function ContractorsCard({
  actions,
  buildId,
  canAssignToMilestone = false,
  contractors,
  availableContractors,
  contractorDetailHrefFor,
}: ContractorsCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAvailableContractors: ContractorDrawerAvailableContractor[] =
    availableContractors.map((contractor) => ({
      _id: String(contractor._id),
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades ?? contractor.skills ?? [],
    }));

  return (
    <Card
      className="self-start"
      data-testid="build-detail-contractors"
      id="contractors"
    >
      <CardHeader className="flex-row items-center justify-between gap-3 p-4">
        <div>
          <CardTitle className="text-sm">
            Contractors{" "}
            <span className="text-[11px] text-muted-foreground">
              {actions?.sourceLabel ?? "demo_contractors"}
            </span>
          </CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            {contractors.length} attached
          </p>
        </div>
        <Button
          data-testid="contractors-open-add"
          onClick={() => setDrawerOpen(true)}
          size="sm"
          type="button"
        >
          Add contractor
        </Button>
      </CardHeader>
      <CardContent
        className="grid auto-rows-max content-start items-start gap-2 p-4 pt-0"
        data-testid="build-detail-contractors-list"
      >
        {contractors.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
            No contractors yet.
          </p>
        ) : (
          contractors.map((contractor) => {
            const profileId = contractor.contractorId ?? contractor._id;
            const detailHref = contractorDetailHrefFor?.(profileId);
            return (
              <div
                className="group flex items-center gap-3 self-start rounded-lg border bg-background/55 p-3 transition-colors hover:bg-accent/45 data-[drag-enabled=true]:cursor-grab data-[drag-enabled=true]:active:cursor-grabbing"
                data-contractor-id={profileId}
                data-drag-enabled={canAssignToMilestone ? "true" : undefined}
                data-testid={`build-detail-contractor-${contractor._id}`}
                draggable={canAssignToMilestone}
                key={contractor._id}
                onDragStart={(event) => {
                  if (!canAssignToMilestone) {
                    return;
                  }
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(
                    "application/x-drawflow-contractor-id",
                    profileId
                  );
                  event.dataTransfer.setData("text/plain", profileId);
                }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/16 font-semibold text-primary text-xs">
                  {initialsFor(contractor.name)}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">
                    {detailHref ? (
                      <a
                        className="hover:text-primary"
                        data-testid={`build-detail-contractor-link-${profileId}`}
                        href={detailHref}
                      >
                        {contractor.name}
                      </a>
                    ) : (
                      contractor.name
                    )}
                    <span className="ml-2 font-normal text-[11px] text-muted-foreground">
                      {contractor.role}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {(contractor.trades ?? []).join(", ") || "No trades"}
                    {contractor.city ? ` / ${contractor.city}` : ""}
                    {contractor.hourlyRateCents
                      ? ` / $${Math.round(contractor.hourlyRateCents / 100)}/hr`
                      : ""}
                    {contractor.email ? ` / ${contractor.email}` : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      {drawerOpen ? (
        <ContractorBuildQuickAddDrawer
          actions={actions}
          availableContractors={drawerAvailableContractors}
          buildId={buildId}
          onOpenChange={setDrawerOpen}
          open={drawerOpen}
        />
      ) : null}
    </Card>
  );
}

function ContractorBuildQuickAddDrawer({
  actions,
  availableContractors,
  buildId,
  onOpenChange,
  open,
}: {
  actions?: ContractorActions;
  availableContractors: ContractorDrawerAvailableContractor[];
  buildId: Id<"demo_builds"> | string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  if (actions?.onAttachExisting || actions?.onCreateAndAttach) {
    return (
      <ContractorQuickAddDrawer
        availableContractors={availableContractors}
        createLabel="Create and add"
        description="Create or attach a contractor with equipment, capability, pay, and contact data before assigning milestone work."
        onAttachExisting={actions.onAttachExisting}
        onCreate={({ contractor, role }) =>
          actions.onCreateAndAttach?.({
            contractor,
            role: role ?? contractor.trades[0] ?? "Contractor",
          })
        }
        onInviteCreatedContractor={actions.onInviteCreatedContractor}
        onOpenChange={onOpenChange}
        open={open}
        requireRole
        title="Add contractor to build"
      />
    );
  }
  return (
    <DemoContractorBuildQuickAddDrawer
      availableContractors={availableContractors}
      buildId={buildId}
      onOpenChange={onOpenChange}
      open={open}
    />
  );
}

function DemoContractorBuildQuickAddDrawer({
  availableContractors,
  buildId,
  onOpenChange,
  open,
}: {
  availableContractors: ContractorDrawerAvailableContractor[];
  buildId: Id<"demo_builds"> | string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const demoAttach = useMutation(
    api.demo_drawflow_backoffice.demo_attachContractorToBuild
  );
  const demoCreate = useMutation(
    api.demo_drawflow_backoffice.demo_createAndAttachContractor
  );

  return (
    <ContractorQuickAddDrawer
      availableContractors={availableContractors}
      createLabel="Create and add"
      description="Create or attach a contractor with equipment, capability, pay, and contact data before assigning milestone work."
      onAttachExisting={({ contractorId, role }) =>
        demoAttach({
          buildId: buildId as Id<"demo_builds">,
          contractorId: contractorId as Id<"demo_contractors">,
          role,
        })
      }
      onCreate={({ contractor, role }) =>
        demoCreate({
          buildId: buildId as Id<"demo_builds">,
          contractor: {
            city: contractor.city ?? "",
            email: contractor.email,
            hourlyRateCents: contractor.defaultPayRateCents ?? 0,
            kind: contractor.kind,
            name: contractor.name,
            phone: contractor.phone,
            skills: contractor.capabilities.map(
              (capability) => capability.label
            ),
            trades: contractor.trades,
          },
          role: role ?? contractor.trades[0] ?? "Contractor",
        })
      }
      onOpenChange={onOpenChange}
      open={open}
      requireRole
      title="Add contractor to build"
    />
  );
}

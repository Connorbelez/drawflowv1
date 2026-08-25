import { AlertTriangle, Building2, Database, HardHat } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import type {
  BrokerageProvisioningProjection,
  UserManagementHandlers,
} from "./-user-management-types";

export function ProvisioningAlerts({
  brokerageProvisioning,
  onProvisionBrokerageProfile,
  onProvisionBuilderProfile,
  onProvisionFairLendBrokerage,
}: {
  brokerageProvisioning: BrokerageProvisioningProjection | undefined;
  onProvisionBrokerageProfile: UserManagementHandlers["onProvisionBrokerageProfile"];
  onProvisionBuilderProfile: UserManagementHandlers["onProvisionBuilderProfile"];
  onProvisionFairLendBrokerage: UserManagementHandlers["onProvisionFairLendBrokerage"];
}): ReactElement | null {
  const [saving, setSaving] = useState<string | null>(null);

  if (!brokerageProvisioning) {
    return null;
  }
  const orgs = brokerageProvisioning.organizations ?? [];
  const missingBrokerage = orgs.filter((row) => row.needsBrokerageProfile);
  const missingBuilder = orgs.filter((row) => row.needsBuilderProfile);
  const fairLend = brokerageProvisioning.fairLendBootstrap;
  const fairLendRow = orgs.find(
    (row) => row.workosOrganizationId === fairLend?.workosOrganizationId
  );

  if (
    missingBrokerage.length === 0 &&
    missingBuilder.length === 0 &&
    fairLendRow?.hasBrokerageProfile
  ) {
    return null;
  }

  return (
    <section
      aria-label="Provisioning to-dos"
      className="flex flex-col gap-2 rounded-xl border bg-warning/4 p-3"
    >
      <div className="flex items-center gap-2 px-1">
        <AlertTriangle aria-hidden className="size-4 text-warning-foreground" />
        <h2 className="font-medium text-sm">Provisioning to-dos</h2>
      </div>
      <div className="grid gap-2">
        {!fairLendRow?.hasBrokerageProfile && fairLend ? (
          <ProvisioningCard
            actionLabel="Seed FairLendBrokerage"
            description={`Bootstrap the platform brokerage (${fairLend.workosOrganizationId}) and seed its principal broker.`}
            disabled={saving === "fairlend"}
            icon={<Database className="size-4" />}
            onAction={async () => {
              setSaving("fairlend");
              try {
                await onProvisionFairLendBrokerage();
              } finally {
                setSaving(null);
              }
            }}
            title="FairLendBrokerage bootstrap"
            tone="primary"
          />
        ) : null}
        {missingBrokerage.map((row) => {
          const principal =
            row.brokerMemberships.find((membership) =>
              membership.roleSlugs.includes("principle-broker")
            ) ?? row.brokerMemberships[0];
          const key = `brokerage:${row.workosOrganizationId}`;
          return (
            <ProvisioningCard
              actionLabel="Create brokerage profile"
              description={
                principal
                  ? `${row.brokerMemberships.length} broker membership${row.brokerMemberships.length === 1 ? "" : "s"} · Principal candidate ${principal.email ?? principal.workosUserId}`
                  : `${row.brokerMemberships.length} broker membership${row.brokerMemberships.length === 1 ? "" : "s"}`
              }
              disabled={saving === key}
              icon={<Building2 className="size-4" />}
              key={key}
              onAction={async () => {
                setSaving(key);
                try {
                  await onProvisionBrokerageProfile({
                    displayName: row.name,
                    legalName: row.name,
                    principalBrokerWorkosUserId: principal?.workosUserId,
                    workosOrganizationId: row.workosOrganizationId,
                  });
                } finally {
                  setSaving(null);
                }
              }}
              title={row.name}
              tone="warning"
            />
          );
        })}
        {missingBuilder.map((row) => {
          const owner = row.builderMemberships[0];
          const key = `builder:${row.workosOrganizationId}`;
          return (
            <ProvisioningCard
              actionLabel="Create builder profile"
              description={
                owner
                  ? `${row.builderMemberships.length} builder membership${row.builderMemberships.length === 1 ? "" : "s"} · Owner candidate ${owner.email ?? owner.workosUserId}`
                  : `${row.builderMemberships.length} builder membership${row.builderMemberships.length === 1 ? "" : "s"}`
              }
              disabled={saving === key}
              icon={<HardHat className="size-4" />}
              key={key}
              onAction={async () => {
                setSaving(key);
                try {
                  await onProvisionBuilderProfile({
                    displayName: row.name,
                    ownerWorkosUserId: owner?.workosUserId,
                    workosOrganizationId: row.workosOrganizationId,
                  });
                } finally {
                  setSaving(null);
                }
              }}
              title={row.name}
              tone="warning"
            />
          );
        })}
      </div>
    </section>
  );
}

function ProvisioningCard({
  actionLabel,
  description,
  disabled,
  icon,
  onAction,
  title,
  tone,
}: {
  actionLabel: string;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onAction: () => Promise<void>;
  title: string;
  tone: "primary" | "warning";
}): ReactElement {
  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={
            tone === "primary"
              ? "mt-0.5 grid size-7 place-items-center rounded-md bg-primary/12 text-primary"
              : "mt-0.5 grid size-7 place-items-center rounded-md bg-warning/16 text-warning-foreground"
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <Button
        disabled={disabled}
        onClick={() => {
          onAction();
        }}
        size="sm"
        variant={tone === "primary" ? "default" : "outline"}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

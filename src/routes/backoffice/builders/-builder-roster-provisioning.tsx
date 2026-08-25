import { HardHat, UserPlus } from "lucide-react";
import { type ReactElement, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import type { BuilderRosterHandlers } from "./-builder-roster-surface";
import {
  type AssignableBrokerage,
  initials,
  type UnprovisionedBuilder,
} from "./-builder-roster-types";

export function UnprovisionedBuildersPanel({
  assignableBrokerages,
  brokerOptionsPending,
  candidates,
  onProvision,
  pending,
}: {
  assignableBrokerages: AssignableBrokerage[];
  brokerOptionsPending: boolean;
  candidates: UnprovisionedBuilder[] | undefined;
  onProvision: BuilderRosterHandlers["onProvisionBuilder"];
  pending: boolean;
}): ReactElement | null {
  const canonicalCandidates = canonicalizeUnprovisionedBuilders(candidates);
  // Hide entirely once loaded and empty: nothing to provision.
  if (!pending && canonicalCandidates.length === 0) {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <HardHat aria-hidden className="size-4 text-warning-foreground" />
          <h2 className="font-medium text-sm">Builders awaiting a profile</h2>
          {canonicalCandidates.length > 0 ? (
            <Badge size="sm" variant="outline">
              {canonicalCandidates.length}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          These users hold a builder role but have no builder profile yet.
          Provision one to start underwriting their proposals.
        </p>
        {pending && !candidates ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {canonicalCandidates.map((candidate) => (
              <li
                className="flex items-center justify-between gap-3 p-3"
                key={candidate.workosMembershipId}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-8">
                    {candidate.profilePictureUrl ? (
                      <AvatarImage alt="" src={candidate.profilePictureUrl} />
                    ) : null}
                    <AvatarFallback className="text-[0.7rem]">
                      {initials(candidate.name, candidate.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-sm">
                      {candidate.name ??
                        candidate.email ??
                        candidate.workosUserId}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {candidate.email ?? candidate.workosUserId}
                      {candidate.brokerageDisplayName
                        ? ` \u00b7 ${candidate.brokerageDisplayName}`
                        : ""}
                    </div>
                  </div>
                </div>
                <ProvisionBuilderDialog
                  assignableBrokerages={assignableBrokerages}
                  brokerOptionsPending={brokerOptionsPending}
                  candidate={candidate}
                  onProvision={onProvision}
                />
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

function canonicalizeUnprovisionedBuilders(
  candidates: UnprovisionedBuilder[] | undefined
) {
  const canonical = new Map<string, UnprovisionedBuilder>();
  for (const candidate of candidates ?? []) {
    const existing = canonical.get(candidate.workosMembershipId);
    canonical.set(
      candidate.workosMembershipId,
      existing
        ? {
            ...existing,
            roleSlugs: [
              ...new Set([...existing.roleSlugs, ...candidate.roleSlugs]),
            ],
          }
        : candidate
    );
  }
  return [...canonical.values()];
}

function ProvisionBuilderDialog({
  assignableBrokerages,
  brokerOptionsPending,
  candidate,
  onProvision,
}: {
  assignableBrokerages: AssignableBrokerage[];
  brokerOptionsPending: boolean;
  candidate: UnprovisionedBuilder;
  onProvision: BuilderRosterHandlers["onProvisionBuilder"];
}): ReactElement {
  const [open, setOpen] = useState(false);
  // Default the company name to the owner's name, then email local part, per
  // the convention that builders fall back to their owner's identity.
  const ownerFallback =
    candidate.name?.trim() ||
    candidate.email?.split("@")[0]?.trim() ||
    candidate.workosUserId;
  const [name, setName] = useState(ownerFallback);
  const brokerage = assignableBrokerages.find(
    (option) => option.workosOrganizationId === candidate.workosOrganizationId
  );
  const brokers = brokerage?.brokers ?? [];
  const defaultBrokerWorkosUserId =
    brokers.find((broker) => broker.isPrincipal)?.workosUserId ??
    brokers[0]?.workosUserId ??
    "";
  const [assignedBrokerWorkosUserId, setAssignedBrokerWorkosUserId] = useState(
    defaultBrokerWorkosUserId
  );
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const brokerageName = candidate.brokerageDisplayName?.trim().toLowerCase();
  const mirrorsBrokerage =
    brokerageName !== undefined && trimmed.toLowerCase() === brokerageName;
  const selectedBroker = brokers.find(
    (broker) => broker.workosUserId === assignedBrokerWorkosUserId
  );
  const invalid =
    trimmed.length === 0 || mirrorsBrokerage || !selectedBroker || saving;

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(ownerFallback);
          setAssignedBrokerWorkosUserId(defaultBrokerWorkosUserId);
        }
      }}
      open={open}
    >
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <UserPlus className="size-3.5" />
        Create profile
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create builder profile</DialogTitle>
          <DialogDescription>
            Provision a builder profile for{" "}
            {candidate.name ?? candidate.email ?? candidate.workosUserId} and
            link them as the owner account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-1">
          <Label htmlFor="builder-company-name">Builder company name</Label>
          <Input
            autoFocus
            id="builder-company-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Northwind Custom Homes"
            value={name}
          />
          {mirrorsBrokerage ? (
            <p className="text-destructive text-xs">
              The builder name must differ from the brokerage name.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Defaults to the owner's name. Edit to use the real company name.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 py-1">
          <Label htmlFor={`builder-broker-${candidate.workosMembershipId}`}>
            Assigned broker
          </Label>
          <Select
            disabled={brokerOptionsPending || brokers.length === 0}
            items={brokers.map((broker) => broker.workosUserId) as never}
            onValueChange={(value) =>
              setAssignedBrokerWorkosUserId(value ?? "")
            }
            value={assignedBrokerWorkosUserId || undefined}
          >
            <SelectTrigger
              id={`builder-broker-${candidate.workosMembershipId}`}
            >
              <SelectValue>
                {(value) => {
                  const broker = brokers.find(
                    (option) => option.workosUserId === value
                  );
                  return (
                    broker?.name ??
                    broker?.email ??
                    (brokerOptionsPending
                      ? "Loading brokers..."
                      : "Select broker")
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {brokers.map((broker) => (
                <SelectItem
                  key={broker.workosUserId}
                  onClick={() =>
                    setAssignedBrokerWorkosUserId(broker.workosUserId)
                  }
                  value={broker.workosUserId}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {broker.name ?? broker.email ?? broker.workosUserId}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {broker.email ?? broker.workosUserId}
                      {broker.isPrincipal ? " · Principal broker" : ""}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!brokerOptionsPending && brokers.length === 0 ? (
            <p className="text-destructive text-xs" role="alert">
              No active eligible brokers are available for this brokerage.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Required. Only active broker members of this brokerage can be
              assigned.
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            }
          />
          <Button
            disabled={invalid}
            onClick={async () => {
              setSaving(true);
              try {
                await onProvision({
                  assignedBrokerWorkosUserId,
                  displayName: trimmed,
                  ownerWorkosUserId: candidate.workosUserId,
                  workosOrganizationId: candidate.workosOrganizationId,
                });
                setOpen(false);
              } finally {
                setSaving(false);
              }
            }}
            type="button"
          >
            {saving ? "Creating..." : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

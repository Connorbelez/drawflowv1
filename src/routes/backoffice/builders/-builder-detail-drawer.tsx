"use client";

import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CircleUserRound,
  Hammer,
  Link2Off,
  Mail,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { cn } from "#/lib/utils.ts";

import type { BuilderRosterHandlers } from "./-builder-roster-surface";
import {
  type BuilderAccount,
  type BuilderBuild,
  type BuilderProposal,
  type BuilderRow,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  initials,
  PROPOSAL_STATUS_META,
  STAGE_META,
} from "./-builder-roster-types";

interface BuilderDetailDrawerProps
  extends Pick<
    BuilderRosterHandlers,
    "onLinkAccount" | "onSetProfileStatus" | "onUnlinkAccount"
  > {
  builder: BuilderRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function BuilderDetailDrawer({
  builder,
  onLinkAccount,
  onOpenChange,
  onSetProfileStatus,
  onUnlinkAccount,
  open,
}: BuilderDetailDrawerProps): ReactElement | null {
  if (!builder) {
    return null;
  }
  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="right">
      <DrawerPopup className="sm:max-w-xl" position="right" showCloseButton>
        <DrawerHeader className="gap-3">
          <div className="flex items-start gap-3 pe-8">
            <Avatar className="size-11 rounded-xl">
              {builder.ownerAccount?.profilePictureUrl ? (
                <AvatarImage
                  alt=""
                  src={builder.ownerAccount.profilePictureUrl}
                />
              ) : null}
              <AvatarFallback className="rounded-xl bg-primary/12 font-semibold text-primary-foreground text-sm">
                {initials(builder.displayName, builder.ownerAccount?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-lg">
                {builder.displayName}
              </DrawerTitle>
              <DrawerDescription className="flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                {builder.brokerage?.displayName ?? builder.organizationName}
              </DrawerDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STAGE_META[builder.stage].tone}>
              {STAGE_META[builder.stage].label}
            </Badge>
            <Badge
              variant={builder.status === "active" ? "outline" : "secondary"}
            >
              {builder.status}
            </Badge>
            <span className="text-muted-foreground text-xs">
              Provisioned {formatDate(builder.createdAt)}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {STAGE_META[builder.stage].hint}
          </p>
        </DrawerHeader>

        <DrawerPanel className="pt-0">
          <Tabs defaultValue="overview">
            <TabsList className="w-full" variant="underline">
              <TabsTab value="overview">Overview</TabsTab>
              <TabsTab value="accounts">
                Accounts
                <CountChip value={builder.accountCount} />
              </TabsTab>
              <TabsTab value="proposals">
                Proposals
                <CountChip value={builder.proposalCount} />
              </TabsTab>
              <TabsTab value="builds">
                Builds
                <CountChip value={builder.builds.length} />
              </TabsTab>
            </TabsList>

            <TabsPanel className="pt-4" value="overview">
              <OverviewTab builder={builder} />
            </TabsPanel>
            <TabsPanel className="pt-4" value="accounts">
              <AccountsTab
                builder={builder}
                onLinkAccount={onLinkAccount}
                onUnlinkAccount={onUnlinkAccount}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="proposals">
              <ProposalsTab builder={builder} />
            </TabsPanel>
            <TabsPanel className="pt-4" value="builds">
              <BuildsTab builds={builder.builds} />
            </TabsPanel>
          </Tabs>
        </DrawerPanel>

        <DrawerFooter>
          <Button
            onClick={() =>
              onSetProfileStatus({
                builderProfileId: builder._id,
                status: builder.status === "active" ? "inactive" : "active",
              })
            }
            variant={
              builder.status === "active" ? "destructive-outline" : "outline"
            }
          >
            {builder.status === "active"
              ? "Deactivate builder"
              : "Reactivate builder"}
          </Button>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}

function CountChip({ value }: { value: number }): ReactElement {
  return (
    <span className="ms-1 rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground tabular-nums">
      {value}
    </span>
  );
}

function OverviewTab({ builder }: { builder: BuilderRow }): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric
          hint="Open proposals"
          label="Proposed capital"
          value={formatCurrency(builder.proposedCapitalCents)}
        />
        <Metric
          label="Approved capital"
          value={formatCurrency(builder.approvedCapitalCents)}
        />
        <Metric
          label="Active build budget"
          value={formatCurrency(builder.activeBuildCapitalCents)}
        />
        <Metric
          label="Last activity"
          value={formatRelativeTime(builder.lastActivityAt)}
        />
      </div>

      <Separator />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
        <DetailRow icon={<Building2 />} label="Brokerage">
          {builder.brokerage?.displayName ?? "\u2014"}
        </DetailRow>
        <DetailRow icon={<ShieldCheck />} label="Organization">
          <span className="font-mono text-xs">
            {builder.workosOrganizationId}
          </span>
        </DetailRow>
        {builder.legalName ? (
          <DetailRow icon={<CircleUserRound />} label="Legal name">
            {builder.legalName}
          </DetailRow>
        ) : null}
        <DetailRow icon={<CalendarClock />} label="Updated">
          {formatDate(builder.updatedAt)}
        </DetailRow>
      </dl>
    </div>
  );
}

function Metric({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-heading font-semibold text-lg tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="text-[0.65rem] text-muted-foreground/72">{hint}</div>
      ) : null}
    </div>
  );
}

function DetailRow({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}): ReactElement {
  return (
    <>
      <dt className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground [&_svg]:size-3.5 [&_svg]:opacity-70">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </>
  );
}

function AccountsTab({
  builder,
  onLinkAccount,
  onUnlinkAccount,
}: {
  builder: BuilderRow;
  onLinkAccount: BuilderRosterHandlers["onLinkAccount"];
  onUnlinkAccount: BuilderRosterHandlers["onUnlinkAccount"];
}): ReactElement {
  if (builder.accounts.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No linked accounts</EmptyTitle>
        <EmptyDescription>
          This builder profile has no active account links. Use Invite builder
          to provision an owner account.
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {builder.accounts.map((account) => (
        <AccountCard
          account={account}
          builderProfileId={builder._id}
          isOnlyOwner={
            account.role === "owner" &&
            builder.accounts.filter((a) => a.role === "owner").length === 1
          }
          key={account.linkId}
          onLinkAccount={onLinkAccount}
          onUnlinkAccount={onUnlinkAccount}
        />
      ))}
    </div>
  );
}

function AccountCard({
  account,
  builderProfileId,
  isOnlyOwner,
  onLinkAccount,
  onUnlinkAccount,
}: {
  account: BuilderAccount;
  builderProfileId: string;
  isOnlyOwner: boolean;
  onLinkAccount: BuilderRosterHandlers["onLinkAccount"];
  onUnlinkAccount: BuilderRosterHandlers["onUnlinkAccount"];
}): ReactElement {
  const [pending, setPending] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <Avatar className="size-9">
        {account.profilePictureUrl ? (
          <AvatarImage alt="" src={account.profilePictureUrl} />
        ) : null}
        <AvatarFallback className="bg-muted text-xs">
          {initials(account.name, account.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm">
            {account.name ?? account.email ?? account.workosUserId}
          </span>
          {account.status ? (
            <Badge
              size="sm"
              variant={account.status === "active" ? "success" : "outline"}
            >
              {account.status}
            </Badge>
          ) : null}
        </div>
        {account.email ? (
          <span className="flex items-center gap-1 truncate text-muted-foreground text-xs">
            <Mail className="size-3" />
            {account.email}
            {account.emailVerified ? null : (
              <span className="text-warning-foreground"> (unverified)</span>
            )}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          disabled={pending || isOnlyOwner}
          onValueChange={(value) =>
            run(() =>
              onLinkAccount({
                builderProfileId,
                role: value as "owner" | "staff",
                workosUserId: account.workosUserId,
              })
            )
          }
          value={account.role}
        >
          <SelectTrigger className="h-7 w-24" size="sm">
            <UserCog className="size-3.5 opacity-70" />
            <SelectValue>{(value) => roleLabel(value as string)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
        <Button
          aria-label="Unlink account"
          disabled={pending || isOnlyOwner}
          onClick={() => run(() => onUnlinkAccount(account.linkId))}
          size="icon-sm"
          variant="ghost"
        >
          <Link2Off />
        </Button>
      </div>
    </div>
  );
}

function roleLabel(value: string): string {
  return value === "owner" ? "Owner" : "Staff";
}

function ProposalsTab({ builder }: { builder: BuilderRow }): ReactElement {
  if (builder.proposals.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No proposals</EmptyTitle>
        <EmptyDescription>
          This builder has not started a proposal yet.
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {builder.proposals.map((proposal) => (
        <ProposalCard key={proposal._id} proposal={proposal} />
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
}: {
  proposal: BuilderProposal;
}): ReactElement {
  const meta = PROPOSAL_STATUS_META[proposal.status];
  const timestamp =
    proposal.closedAt ??
    proposal.approvedAt ??
    proposal.submittedAt ??
    proposal.updatedAt;
  return (
    <Link
      className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50"
      params={{ planId: proposal._id }}
      to="/backoffice/proposals/$planId"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">
            {proposal.buildName}
          </span>
          <Badge size="sm" variant={meta.tone}>
            {meta.label}
          </Badge>
        </div>
        <span className="truncate text-muted-foreground text-xs">
          {proposal.location}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-medium text-sm tabular-nums">
          {formatCurrency(proposal.totalBudgetCents)}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function BuildsTab({ builds }: { builds: BuilderBuild[] }): ReactElement {
  if (builds.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No active builds</EmptyTitle>
        <EmptyDescription>
          No proposal has progressed to an active build yet.
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {builds.map((build) => (
        <Link
          className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50"
          key={build._id}
          params={{ buildId: build._id }}
          to="/backoffice/builds/$buildId"
        >
          <Hammer
            className={cn(
              "size-4 shrink-0",
              build.status === "active"
                ? "text-primary-foreground"
                : "text-muted-foreground"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm">
                {build.buildName}
              </span>
              <Badge
                size="sm"
                variant={build.status === "active" ? "success" : "info"}
              >
                {build.status === "active" ? "Active" : "Future start"}
              </Badge>
            </div>
            <span className="truncate text-muted-foreground text-xs">
              {build.location}
              {" · starts "}
              {build.startDate}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-medium text-sm tabular-nums">
              {formatCurrency(build.totalBudgetCents)}
            </span>
          </div>
          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ))}
    </div>
  );
}

import {
  ArrowRight,
  Building2,
  Check,
  FileLock2,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  UserRoundCog,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

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
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import type { DirectoryUser } from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import { UserManagementDirectoryTable } from "#/routes/backoffice/-user-management-surface.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";

export type LenderOrganizationOperation =
  | "invite"
  | "change-access"
  | "deactivate"
  | "transfer-principal";

export interface LenderOrganizationManagementVariantEProps {
  activeMemberCount: number;
  administrationContext: string;
  directoryUsers: DirectoryUser[];
  headingLevel?: 1 | 2;
  mode: "production" | "prototype";
  moreMembersAvailable?: boolean;
  onLoadMoreMembers?: () => void;
  onOpenOperation: (operation: LenderOrganizationOperation) => void;
  onOpenUser: (workosUserId: string) => void;
  organizationName: string;
  organizationsById: Map<string, WorkosOrganizationRow>;
  pending: boolean;
  pendingMemberCount?: number;
  pendingMembers?: Array<{
    assignmentId: string;
    email: string;
    reconciliationReason?: string;
    status: "conflict_rejected" | "pending";
  }>;
  pendingMoreMembers?: boolean;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
}

/** The approved Variant E composition, shared by prototype and production. */
export function LenderOrganizationManagementVariantE({
  activeMemberCount,
  administrationContext,
  directoryUsers,
  headingLevel = 1,
  mode,
  moreMembersAvailable = false,
  onLoadMoreMembers,
  onOpenOperation,
  onOpenUser,
  organizationName,
  organizationsById,
  pending,
  pendingMemberCount = 0,
  pendingMembers = [],
  pendingMoreMembers = false,
  provisioningByOrg,
}: LenderOrganizationManagementVariantEProps) {
  const [memberQuery, setMemberQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending" | "inactive"
  >("all");
  const visibleDirectoryUsers = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLowerCase();
    return directoryUsers.filter((entry) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          entry.displayName,
          entry.user.email,
          ...entry.memberships.flatMap((membership) => [
            membership.roleSlug,
            ...(membership.roleSlugs ?? []),
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        entry.memberships.some((membership) =>
          statusFilter === "inactive"
            ? membership.status === "inactive" ||
              membership.status === "deleted"
            : membership.status === statusFilter
        );
      return matchesQuery && matchesStatus;
    });
  }, [directoryUsers, memberQuery, statusFilter]);
  const statusFilters = [
    { count: directoryUsers.length, key: "all", label: "All" },
    {
      count: directoryUsers.filter((entry) =>
        entry.memberships.some((membership) => membership.status === "active")
      ).length,
      key: "active",
      label: "Active",
    },
    {
      count:
        directoryUsers.filter((entry) =>
          entry.memberships.some(
            (membership) => membership.status === "pending"
          )
        ).length + pendingMemberCount,
      key: "pending",
      label: "Pending",
    },
    {
      count: directoryUsers.filter((entry) =>
        entry.memberships.some(
          (membership) =>
            membership.status === "inactive" || membership.status === "deleted"
        )
      ).length,
      key: "inactive",
      label: "Deactivated",
    },
  ] as const;
  const production = mode === "production";
  const DirectoryHeading = headingLevel === 1 ? "h2" : "h3";
  const PendingHeading = headingLevel === 1 ? "h3" : "h4";

  return (
    <div className="space-y-5">
      <PageHeading
        description={
          production
            ? "Manage the application lender organization, its assigned members, and WorkOS-first access changes."
            : "The production User Management table and membership sheet, composed into the lender workspace with operational workflows staged safely in memory."
        }
        eyebrow={
          production
            ? "Lender organization"
            : "Variant E · Shared user management"
        }
        headingLevel={headingLevel}
        production={production}
        title="Organization members"
      />
      <OrganizationSummaryStrip
        activeMemberCount={activeMemberCount}
        administrationContext={administrationContext}
        organizationName={organizationName}
        pendingMemberCount={pendingMemberCount}
        production={production}
      />
      <Frame>
        <FramePanel
          aria-label="Shared user management directory"
          className="flex flex-col gap-0 overflow-hidden p-0"
          role="region"
        >
          <div className="flex flex-col gap-4 border-b p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <DirectoryHeading className="font-semibold text-sm">
                  Organization members
                </DirectoryHeading>
                <p className="mt-1 text-muted-foreground text-xs">
                  {production
                    ? "Current assigned lenders and shared WorkOS membership state"
                    : "Exact Back Office table component and visual fixture · E3, E4"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {production ? (
                  <Badge variant="secondary">WorkOS projection</Badge>
                ) : (
                  <>
                    <Badge variant="outline">shadcn Table</Badge>
                    <Badge variant="outline">TanStack Table</Badge>
                    <Badge variant="secondary">Operational sheet</Badge>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 max-w-sm flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search organization members"
                    className="pl-7"
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search name, email, or role"
                    size="sm"
                    type="search"
                    value={memberQuery}
                  />
                </div>
                <fieldset className="flex flex-wrap gap-1">
                  <legend className="sr-only">Membership status</legend>
                  {statusFilters.map((filter) => (
                    <Button
                      aria-pressed={statusFilter === filter.key}
                      key={filter.key}
                      onClick={() => setStatusFilter(filter.key)}
                      size="xs"
                      variant={
                        statusFilter === filter.key ? "secondary" : "ghost"
                      }
                    >
                      {filter.label}
                      <span className="tabular-nums">{filter.count}</span>
                    </Button>
                  ))}
                </fieldset>
              </div>
              <Button
                onClick={() => onOpenOperation("invite")}
                size="sm"
                variant="outline"
              >
                <UserPlus />
                Invite member
              </Button>
            </div>
          </div>
          <UserManagementDirectoryTable
            emptyMessage={
              statusFilter === "pending" && pendingMemberCount > 0
                ? "Pending invitations appear below until WorkOS reconciliation completes."
                : "No organization members match this view."
            }
            onRowClick={onOpenUser}
            organizationsById={organizationsById}
            pending={pending}
            provisioningByOrg={provisioningByOrg}
            rowActionVerb="View"
            rows={visibleDirectoryUsers}
          />
          {production && pendingMembers.length > 0 ? (
            <section
              aria-labelledby="pending-lender-members"
              className="border-t"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <PendingHeading
                  className="font-medium text-sm"
                  id="pending-lender-members"
                >
                  Pending reconciliation
                </PendingHeading>
                <Badge variant="outline">{pendingMembers.length} waiting</Badge>
              </div>
              <div className="divide-y border-t">
                {pendingMembers.map((member) => (
                  <div
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    key={member.assignmentId}
                  >
                    <p className="break-words font-medium text-sm">
                      {member.email}
                    </p>
                    <div className="text-start sm:max-w-md sm:text-end">
                      <Badge
                        variant={
                          member.status === "pending" ? "secondary" : "outline"
                        }
                      >
                        {member.status === "pending"
                          ? "Waiting for WorkOS"
                          : "Needs Back Office review"}
                      </Badge>
                      <p className="mt-1 break-words text-muted-foreground text-xs leading-5">
                        {member.status === "pending"
                          ? "Access remains unavailable until the WorkOS membership projection reconciles."
                          : (member.reconciliationReason ??
                            "The invitation could not be reconciled to one lender organization.")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {moreMembersAvailable && onLoadMoreMembers ? (
            <div className="flex justify-center border-t p-3">
              <Button
                disabled={pendingMoreMembers}
                onClick={onLoadMoreMembers}
                size="sm"
                variant="ghost"
              >
                {pendingMoreMembers ? "Loading members…" : "Load more members"}
              </Button>
            </div>
          ) : null}
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Membership context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckLine text="Select a member to inspect their WorkOS organization membership" />
            <CheckLine text="Stage access and deactivation operations from the membership sheet" />
            <CheckLine text="Review the complete draft and downstream impact before execution" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Policy boundary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BoundaryLine
              text={
                production
                  ? "Membership commands wait for canonical WorkOS projection reconciliation"
                  : "No invitation delivery, WorkOS mutation, role assignment, or policy change"
              }
            />
            <BoundaryLine text="No quorum eligibility or satisfaction claim" />
            <BoundaryLine text="Pre-closing review requirements remain Back Office-owned" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function LenderMemberAdministrationDetails({
  activeMembershipCount,
  historyCount,
  member,
  mode,
  onOpenOperation,
  organizationName,
  showTransfer = true,
}: {
  activeMembershipCount: number;
  historyCount?: number;
  member: DirectoryUser;
  mode: "production" | "prototype";
  onOpenOperation: (operation: LenderOrganizationOperation) => void;
  organizationName: string;
  showTransfer?: boolean;
}) {
  const membership = member.memberships[0];
  const roleSlugs = membership?.roleSlugs ?? [];
  const principalProtected = roleSlugs.includes("principle-broker");
  const production = mode === "production";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold text-sm">
            Access and administration
          </h3>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            Stage member operations, validate drafts, and review downstream
            effects.
            {production
              ? " Commands apply through WorkOS."
              : " Drafts stay local and never call WorkOS."}
          </p>
        </div>
        <Badge variant="outline">
          {production ? "Active organization" : "E1–E9"}
        </Badge>
      </div>
      <Tabs defaultValue="access">
        <TabsList
          className="w-full justify-start overflow-x-auto"
          variant="underline"
        >
          <TabsTab value="access">Access</TabsTab>
          <TabsTab value="administration">Administration</TabsTab>
          <TabsTab value="review">Review relationship</TabsTab>
          <TabsTab value="history">History</TabsTab>
        </TabsList>
        <TabsPanel className="pt-3" value="access">
          <div className="flex flex-col divide-y">
            <SheetFact label="Active organization" value={organizationName} />
            <SheetFact
              label="Account status"
              value={member.user.status ?? "Unknown"}
            />
            <SheetFact
              label="Membership state"
              value={membership?.status ?? "Unknown"}
            />
            <SheetFact
              label="Access scope"
              value={roleSlugs.join(" · ") || "No active role"}
            />
            {showTransfer ? (
              <SheetFact
                label="Principal Broker protection"
                value={
                  principalProtected
                    ? "Transfer-of-control required before replacement"
                    : "Not the protected Principal Broker"
                }
              />
            ) : null}
          </div>
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="administration">
          <WorkflowPreview
            action="Organization-level control"
            buttonLabel="Start invite"
            description="Invite brokers and staff inside the active organization. Stage an email and verified starting role before reviewing the draft."
            icon={UserPlus}
            onSelect={() => onOpenOperation("invite")}
            title="Invite or add member"
          />
          <WorkflowPreview
            action="Member-level control"
            buttonLabel="Stage access change"
            description="Change a non-protected member's WorkOS roles through the canonical WorkOS action boundary. Review current and proposed access together."
            icon={UserRoundCog}
            onSelect={() => onOpenOperation("change-access")}
            title="Change member access"
          />
          <WorkflowPreview
            action={
              principalProtected
                ? "Protected for this member"
                : "Member-level control"
            }
            buttonLabel="Review deactivation"
            description={
              showTransfer
                ? "Deactivation ends future access and actions while preserving membership and decision history. Principal Broker deactivation requires transfer-of-control first."
                : "Deactivation ends future access and actions while preserving membership and decision history."
            }
            icon={UserMinus}
            onSelect={() => onOpenOperation("deactivate")}
            title="Deactivate member"
          />
          {principalProtected && showTransfer ? (
            <WorkflowPreview
              action="Protected workflow"
              buttonLabel="Transfer control"
              description="Select an eligible active replacement, provide an audit reason, and review the protected transfer before execution."
              icon={ShieldCheck}
              onSelect={() => onOpenOperation("transfer-principal")}
              title="Transfer Principal Broker control"
            />
          ) : null}
          <WorkflowPreview
            action="Back Office boundary"
            buttonLabel="Back Office only"
            description="Review requirements and approval policy are owned by Back Office. Organization management does not introduce another manager role."
            disabled
            icon={LockKeyhole}
            title="Review-requirements administration"
          />
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="review">
          <div className="flex flex-col divide-y">
            <SheetFact
              label="Verified active memberships shown"
              value={String(activeMembershipCount)}
            />
            <SheetFact
              label="Eligibility or satisfaction"
              value="Not derived on this surface"
            />
            <SheetFact
              label="Policy owner"
              value="Back Office pre-closing review requirements"
            />
          </div>
          <div className="flex gap-3 border-t pt-3 text-muted-foreground text-xs leading-5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Membership changes affect eligibility inputs, recipient routing,
              work queues, and audit. This sheet explains that relationship; it
              cannot change approval policy.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel className="space-y-3 pt-3" value="history">
          <div className="flex flex-col divide-y">
            <SheetFact label="Identity source" value="WorkOS projection" />
            <SheetFact
              label="Membership record"
              value={membership?.workosMembershipId ?? "Not available"}
            />
            <SheetFact
              label="Organization audit entries"
              value={
                production
                  ? historyCount === undefined
                    ? "Recorded in canonical audit history"
                    : String(historyCount)
                  : "None · prototype drafts are discarded"
              }
            />
            <SheetFact
              label="Decision history"
              value="Preserved in canonical review workflows"
            />
          </div>
          <div className="flex gap-3 border-t pt-3 text-muted-foreground text-xs leading-5">
            <History className="mt-0.5 size-4 shrink-0" />
            <p>
              Material production commands retain actor, role, prior and new
              state, time, warnings, and reason.
            </p>
          </div>
        </TabsPanel>
      </Tabs>
    </section>
  );
}

function PageHeading({
  description,
  eyebrow,
  headingLevel,
  production,
  title,
}: {
  description: string;
  eyebrow: string;
  headingLevel: 1 | 2;
  production: boolean;
  title: string;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
          {eyebrow}
        </p>
        <Heading className="mt-2 font-heading font-semibold text-2xl tracking-tight md:text-3xl">
          {title}
        </Heading>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {description}
        </p>
      </div>
      <Badge className="w-fit" variant="outline">
        {production
          ? "Canonical organization access"
          : "No organization or policy writes"}
      </Badge>
    </header>
  );
}

function OrganizationSummaryStrip({
  activeMemberCount,
  administrationContext,
  organizationName,
  pendingMemberCount,
  production,
}: {
  activeMemberCount: number;
  administrationContext: string;
  organizationName: string;
  pendingMemberCount: number;
  production: boolean;
}) {
  return (
    <Frame>
      <FramePanel className="grid gap-0 p-0 sm:grid-cols-3">
        <SummaryFact
          icon={Building2}
          label="Active organization"
          value={organizationName}
        />
        <SummaryFact
          icon={UserRoundCheck}
          label={production ? "Assigned members" : "Verified active members"}
          value={
            production
              ? `${activeMemberCount} active · ${pendingMemberCount} pending`
              : String(activeMemberCount)
          }
        />
        <SummaryFact
          icon={ShieldCheck}
          label="Administration context"
          value={administrationContext}
        />
      </FramePanel>
    </Frame>
  );
}

function SummaryFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <div className="flex size-9 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

function SheetFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <p className="font-medium text-xs">{label}</p>
      <p className="text-sm sm:text-right">{value}</p>
    </div>
  );
}

function WorkflowPreview({
  action,
  buttonLabel,
  description,
  disabled = false,
  icon: Icon,
  onSelect,
  title,
}: {
  action: string;
  buttonLabel: string;
  description: string;
  disabled?: boolean;
  icon: typeof UserPlus;
  onSelect?: () => void;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium text-sm">{title}</p>
            <Badge variant="outline">{action}</Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            {description}
          </p>
          <Button
            className="mt-3"
            disabled={disabled}
            onClick={onSelect}
            size="sm"
            variant="outline"
          >
            {buttonLabel}
            {disabled ? <LockKeyhole /> : <ArrowRight />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <Line icon={<Check className="size-3.5" />} text={text} tone="primary" />
  );
}

function BoundaryLine({ text }: { text: string }) {
  return (
    <Line icon={<FileLock2 className="size-3.5" />} text={text} tone="muted" />
  );
}

function Line({
  icon,
  text,
  tone,
}: {
  icon: ReactNode;
  text: string;
  tone: "muted" | "primary";
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={
          tone === "primary"
            ? "flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary"
            : "flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

import {
  createFileRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2, Mail, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";

import { LenderShell } from "#/components/lender-shell.tsx";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";

import { api } from "../../../convex/_generated/api";

type LenderOrganizationView = FunctionReturnType<
  typeof api.lenderOrganizations.getCurrentLenderOrganization
>;
type LenderMemberPage = FunctionReturnType<
  typeof api.lenderOrganizations.listCurrentLenderOrganizationMembers
>;
type LenderMember = LenderMemberPage["page"][number];

export const Route = createFileRoute("/lender/organization")({
  beforeLoad: ({ context, location }) =>
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "lender",
    }),
  component: LenderOrganization,
  errorComponent: LenderOrganizationError,
  staticData: {
    breadcrumb: {
      label: "Organization",
      to: "/lender/organization",
    },
  },
});

function LenderOrganizationError({ error, reset }: ErrorComponentProps) {
  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 p-4 pt-12 md:p-8">
        <Frame className="mx-auto max-w-2xl">
          <FramePanel className="p-8">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Lender organization
            </p>
            <h1 className="mt-3 font-heading font-semibold text-2xl">
              Organization access could not load
            </h1>
            <p className="mt-3 max-w-lg text-muted-foreground text-sm leading-6">
              DrawFlow could not resolve your application organization. No
              WorkOS directory data was exposed.
            </p>
            <Button className="mt-6" onClick={reset} variant="outline">
              Try again
            </Button>
            <p className="mt-4 text-muted-foreground text-xs">
              {error instanceof Error ? error.message : "Access check failed"}
            </p>
          </FramePanel>
        </Frame>
      </main>
    </LenderShell>
  );
}

function LenderOrganization() {
  const view = useQuery(
    api.lenderOrganizations.getCurrentLenderOrganization,
    {}
  ) as LenderOrganizationView | undefined;
  const memberPage = usePaginatedQuery(
    api.lenderOrganizations.listCurrentLenderOrganizationMembers,
    view?.organization ? {} : "skip",
    { initialNumItems: 25 }
  );
  const members = [...(memberPage.results as LenderMember[])].sort(
    (left, right) => left.name.localeCompare(right.name)
  );

  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 pb-20">
        {view === undefined ||
        (view.organization && memberPage.status === "LoadingFirstPage") ? (
          <OrganizationLoadingState />
        ) : view.organization === null ? (
          <UnassignedOrganizationState />
        ) : (
          <AssignedOrganizationState
            loadMore={() => memberPage.loadMore(25)}
            memberPageStatus={memberPage.status}
            members={members}
            view={view}
          />
        )}
      </main>
    </LenderShell>
  );
}

function OrganizationLoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      <div className="h-10 w-80 animate-pulse rounded bg-muted" />
      <Frame>
        <FramePanel className="h-48 animate-pulse bg-muted/40" />
      </Frame>
    </div>
  );
}

function UnassignedOrganizationState() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center p-4 md:p-8">
      <Frame className="w-full">
        <FramePanel className="relative overflow-hidden p-8 md:p-12">
          <div className="pointer-events-none absolute -top-28 -right-20 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative max-w-xl">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </div>
            <p className="mt-8 text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Lender organization
            </p>
            <Empty className="items-start px-0 py-0 text-left">
              <EmptyTitle className="mt-2 font-heading text-3xl">
                Your DrawFlow organization is still being arranged.
              </EmptyTitle>
              <EmptyDescription className="max-w-lg text-left text-base leading-7">
                A DrawFlow admin needs to attach your lender account to an
                application organization before lender work can begin. Your
                shared identity is signed in, but no lender organization is
                attached yet.
              </EmptyDescription>
            </Empty>
            <Button
              className="mt-8"
              render={
                <a href="mailto:support@fairlend.ca?subject=DrawFlow%20lender%20organization%20access" />
              }
            >
              <Mail />
              Contact DrawFlow admin
            </Button>
            <p className="mt-4 text-muted-foreground text-xs">
              No organization directory or membership details are available
              until the assignment is active.
            </p>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function AssignedOrganizationState({
  loadMore,
  memberPageStatus,
  members,
  view,
}: {
  loadMore: () => void;
  memberPageStatus:
    | "CanLoadMore"
    | "Exhausted"
    | "LoadingFirstPage"
    | "LoadingMore";
  members: LenderMember[];
  view: LenderOrganizationView;
}) {
  const organization = view.organization;
  if (!organization) {
    return null;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header className="max-w-3xl">
        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
          Application organization
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading font-semibold text-3xl tracking-tight">
              {organization.displayName}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              Your DrawFlow lender organization, governed by{" "}
              {organization.brokerageName}.
            </p>
          </div>
          <Badge variant="outline">Active</Badge>
        </div>
      </header>

      <Frame>
        <FramePanel className="grid gap-0 p-0 sm:grid-cols-3">
          <OrganizationStat
            icon={<Building2 />}
            label="Parent Brokerage"
            value={organization.brokerageName}
          />
          <OrganizationStat
            icon={<Users />}
            label="Loaded assigned members"
            value={String(members.length)}
          />
          <OrganizationStat
            icon={<ShieldCheck />}
            label="Access model"
            value="Shared policy"
          />
        </FramePanel>
      </Frame>

      <section aria-labelledby="workflow-access-heading">
        <Frame>
          <FramePanel className="p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  Organization policy
                </p>
                <h2
                  className="mt-2 font-heading font-semibold text-xl"
                  id="workflow-access-heading"
                >
                  Shared workflow access
                </h2>
                <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                  These controls are set for the whole lender organization by
                  DrawFlow Back Office. Your WorkOS role limits the actions you
                  can take within the enabled workflow.
                </p>
              </div>
              <Badge variant="secondary">Read only</Badge>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <PermissionRow
                enabled={organization.permissions.proposalReview}
                label="Proposal review"
              />
              <PermissionRow
                enabled={organization.permissions.milestoneDecisions}
                label="Milestone decisions"
              />
              <PermissionRow
                enabled={organization.permissions.drawDecisions}
                label="Draw decisions"
              />
              <PermissionRow
                enabled={organization.permissions.siteVisitReview}
                label="Site visit review"
              />
            </div>
          </FramePanel>
        </Frame>
      </section>

      <section aria-labelledby="members-heading">
        <Frame>
          <FramePanel className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 p-6 md:p-7">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  Assigned people
                </p>
                <h2
                  className="mt-2 font-heading font-semibold text-xl"
                  id="members-heading"
                >
                  Organization members
                </h2>
                <p className="mt-2 text-muted-foreground text-sm">
                  Only people attached to this application organization appear
                  here.
                </p>
              </div>
              <Badge className="tabular-nums" variant="outline">
                {members.length} loaded
              </Badge>
            </div>
            <Separator />
            <div className="divide-y">
              {members.length === 0 ? (
                <div className="p-8 text-muted-foreground text-sm">
                  No other members are visible yet.
                </div>
              ) : (
                members.map((member) => (
                  <div
                    className="flex items-center justify-between gap-4 px-6 py-4 md:px-7"
                    key={member.assignmentId}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage
                          alt={member.name}
                          src={member.profilePictureUrl}
                        />
                        <AvatarFallback>
                          {initials(member.name, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {member.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {member.roleSlugs.map((role) => (
                        <Badge key={role} variant="secondary">
                          {formatRole(role)}
                        </Badge>
                      ))}
                      {member.canMakeFinalDecision ? (
                        <Badge
                          className="hidden sm:inline-flex"
                          variant="outline"
                        >
                          Decision authority
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            {memberPageStatus === "CanLoadMore" ||
            memberPageStatus === "LoadingMore" ? (
              <div className="flex justify-center border-t p-4">
                <Button
                  disabled={memberPageStatus === "LoadingMore"}
                  onClick={loadMore}
                  variant="outline"
                >
                  {memberPageStatus === "LoadingMore"
                    ? "Loading members…"
                    : "Load more members"}
                </Button>
              </div>
            ) : null}
          </FramePanel>
        </Frame>
      </section>
    </div>
  );
}

function OrganizationStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-5 sm:border-r last:sm:border-r-0">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

function PermissionRow({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border p-4">
      <span className="text-sm">{label}</span>
      <Badge variant={enabled ? "default" : "outline"}>
        {enabled ? "Enabled" : "Not enabled"}
      </Badge>
    </div>
  );
}

function formatRole(role: string) {
  return role
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function initials(name: string, email: string) {
  const value = name.trim() || email.split("@")[0] || "?";
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
}

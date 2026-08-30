import {
  ArrowRight,
  ChevronRight,
  Database,
  FileLock2,
  Landmark,
  Users,
} from "lucide-react";

import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import { Separator } from "../components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  organization,
  organizationMembers,
  type OrganizationMember,
  type RoleContext,
  type RoleDefinition,
} from "./-lender-organization-management-contracts";
import {
  BoundaryLine,
  BoundaryNote,
  BriefSection,
  CheckLine,
  EmptySearch,
  FactRow,
  FactTile,
  MemberContextRail,
  MemberIdentity,
  OrganizationIdentity,
  OrganizationSummaryStrip,
  PageHeading,
  RoleBadges,
  RoleContextFilter,
  RelationshipDomain,
  SearchField,
  UnresolvedManagerNote,
} from "./-lender-organization-management-shared";

export interface VariantProps {
  currentMember: OrganizationMember | undefined;
  filteredMembers: readonly OrganizationMember[];
  filteredRoles: readonly RoleDefinition[];
  onQueryChange: (query: string) => void;
  onRoleContextChange: (context: "all" | RoleContext) => void;
  onSelectMember: (email: string) => void;
  query: string;
  roleContext: "all" | RoleContext;
}

export function VariantA({
  currentMember,
  filteredMembers,
  onQueryChange,
  onSelectMember,
  query,
}: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A dense organization ledger with the selected membership explained in a fixed context rail."
        eyebrow="Variant A · Directory ledger"
        title="Organization directory"
      />
      <OrganizationSummaryStrip />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Frame>
          <FramePanel className="p-0">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-sm">Active memberships</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Exact rows from the Back Office visual fixture · E3, E4
                </p>
              </div>
              <SearchField onChange={onQueryChange} query={query} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>WorkOS roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow
                    className="cursor-pointer"
                    key={member.email}
                    onClick={() => onSelectMember(member.email)}
                  >
                    <TableCell>
                      <MemberIdentity member={member} />
                    </TableCell>
                    <TableCell>
                      <RoleBadges roles={member.roleLabels} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Active</Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredMembers.length === 0 ? <EmptySearch /> : null}
          </FramePanel>
        </Frame>
        <MemberContextRail member={currentMember} />
      </div>
    </div>
  );
}

export function VariantB({
  filteredRoles,
  onRoleContextChange,
  roleContext,
}: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A role-first atlas that separates organization administration from operating access."
        eyebrow="Variant B · Role atlas"
        title="Who operates this organization?"
      />
      <Frame>
        <FramePanel className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <OrganizationIdentity />
            <RoleContextFilter
              onChange={onRoleContextChange}
              value={roleContext}
            />
          </div>
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Verified active member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizationMembers.map((member) => (
              <div className="space-y-3" key={member.email}>
                <MemberIdentity member={member} />
                <RoleBadges roles={member.roleLabels} />
                <Separator />
                <BoundaryNote
                  icon={Database}
                  text="This membership is a WorkOS projection. This prototype does not edit it."
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <Frame>
          <FramePanel className="p-0">
            <div className="grid border-b px-5 py-3 text-muted-foreground text-xs md:grid-cols-[10rem_12rem_minmax(0,1fr)]">
              <span>Context</span>
              <span>Canonical role</span>
              <span>Meaning here</span>
            </div>
            <div className="divide-y">
              {filteredRoles.map((role) => (
                <div
                  className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_12rem_minmax(0,1fr)] md:items-center"
                  key={role.slug}
                >
                  <Badge className="w-fit" variant="outline">
                    {role.context === "administration"
                      ? "Administration"
                      : "Operations"}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{role.label}</p>
                    <p className="font-mono text-muted-foreground text-xs">
                      {role.slug}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-sm leading-6">
                    {role.summary}
                  </p>
                </div>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </div>
      <UnresolvedManagerNote />
    </div>
  );
}

export function VariantC({ currentMember }: VariantProps) {
  return (
    <div className="space-y-5">
      <PageHeading
        description="A relationship view that makes the ownership boundary between membership and review policy explicit."
        eyebrow="Variant C · Quorum bridge"
        title="Organization membership meets review requirements"
      />
      <Frame>
        <FramePanel className="p-5 lg:p-7">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]">
            <RelationshipDomain
              badge="WorkOS-owned"
              description="Organization, active membership, and role grants are projected into DrawFlow for read access."
              icon={Users}
              source="E1, E3, E4"
              title="Organization administration"
            >
              {currentMember ? <MemberIdentity member={currentMember} /> : null}
              {currentMember ? (
                <RoleBadges roles={currentMember.roleLabels} />
              ) : null}
            </RelationshipDomain>
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 py-4 text-center">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="h-px w-8 bg-border" />
                <ArrowRight className="size-4" />
                <span className="h-px w-8 bg-border" />
              </div>
              <Badge variant="secondary">Read relationship only</Badge>
              <p className="max-w-40 text-muted-foreground text-xs leading-5">
                Membership context may inform a review, but does not define the
                policy.
              </p>
            </div>
            <RelationshipDomain
              badge="Back Office-configured"
              description="The transferred proposal contract shows Back Office and lender quorum as peer requirements."
              icon={FileLock2}
              source="E5, E6"
              title="Pre-closing review requirements"
            >
              <FactRow
                label="Approval groups"
                value="Back Office + lender quorum"
              />
              <FactRow
                label="Representative quorum"
                value="2 active lender members"
              />
            </RelationshipDomain>
          </div>
        </FramePanel>
      </Frame>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What this surface can explain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckLine text="Which WorkOS organization is active" />
            <CheckLine text="Which projected memberships are active" />
            <CheckLine text="Which canonical roles are attached" />
            <CheckLine text="How review policy references a lender quorum" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What this surface cannot decide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BoundaryLine text="Who is eligible to count toward quorum" />
            <BoundaryLine text="Whether the shown organization satisfies quorum" />
            <BoundaryLine text="How review requirements are configured" />
            <BoundaryLine text="Any invitation, membership, or role change" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function VariantD({ currentMember }: VariantProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeading
        description="A calm administrative briefing that reads top-to-bottom as a boundary-aware organization record."
        eyebrow="Variant D · Administration brief"
        title="FairLendBrokerage organization brief"
      />
      <Frame>
        <FramePanel className="p-0">
          <div className="grid gap-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="border-b p-5 lg:border-r lg:border-b-0">
              <div className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Landmark className="size-6" />
              </div>
              <p className="mt-4 font-heading font-semibold text-xl">
                {organization.name}
              </p>
              <Badge className="mt-2" variant="success">
                {organization.status}
              </Badge>
              <Separator className="my-5" />
              <p className="text-muted-foreground text-xs leading-5">
                {organization.sourceLabel}
              </p>
            </aside>
            <div className="divide-y">
              <BriefSection
                index="01"
                source="E3, E4"
                title="Active membership"
              >
                {currentMember ? (
                  <MemberIdentity member={currentMember} />
                ) : null}
                {currentMember ? (
                  <RoleBadges roles={currentMember.roleLabels} />
                ) : null}
              </BriefSection>
              <BriefSection
                index="02"
                source="E1, E2"
                title="Administration boundary"
              >
                <p className="text-muted-foreground text-sm leading-6">
                  Admin and Principal Broker have canonical user-management
                  capability. This prototype presents the boundary only and
                  exposes no write control.
                </p>
              </BriefSection>
              <BriefSection
                index="03"
                source="E5, E6"
                title="Review relationship"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FactTile
                    label="Review groups"
                    value="Back Office + lender quorum"
                  />
                  <FactTile
                    label="Representative quorum"
                    value="2 active lender members"
                  />
                </div>
                <p className="mt-3 text-muted-foreground text-xs leading-5">
                  The review rule is presented as external context. Organization
                  administration does not own or change it.
                </p>
              </BriefSection>
              <BriefSection
                index="04"
                source="E1, E7"
                title="Unresolved terminology"
              >
                <UnresolvedManagerNote compact />
              </BriefSection>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

import {
  Building2,
  BookOpenCheck,
  Check,
  CircleHelp,
  FileLock2,
  Filter,
  ListFilter,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import {
  organization,
  organizationMembers,
  type OrganizationMember,
  type RoleContext,
} from "./-lender-organization-management-contracts";
import { cn } from "../lib/utils";

export function PrototypeNotice({ onShowEvidence }: { onShowEvidence: () => void }) {
  return (
    <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-2 text-center font-medium text-xs">
        <Badge variant="warning">Throwaway prototype</Badge>
        <span>
          Operational workflow simulation · verified fixture data · drafts stay
          local · no persistence
        </span>
        <Button onClick={onShowEvidence} size="xs" variant="outline">
          <BookOpenCheck className="size-3.5" />
          Evidence map
        </Button>
      </div>
    </div>
  );
}

export function EvidencePanel({
  evidenceSources,
}: {
  evidenceSources: readonly {
    key: string;
    label: string;
    path: string;
  }[];
}) {
  return (
    <div className="border-b bg-background px-4 py-4">
      <div className="mx-auto grid max-w-[1440px] gap-3 md:grid-cols-2 xl:grid-cols-3">
        {evidenceSources.map((source) => (
          <div className="flex gap-3" key={source.key}>
            <Badge className="h-fit" variant="outline">
              {source.key}
            </Badge>
            <div>
              <p className="font-medium text-xs">{source.label}</p>
              <p className="mt-1 font-mono text-muted-foreground text-xs leading-5">
                {source.path}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeading({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-heading font-semibold text-2xl tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {description}
        </p>
      </div>
      <Badge className="w-fit" variant="outline">
        No organization or policy writes
      </Badge>
    </header>
  );
}

export function OrganizationSummaryStrip() {
  return (
    <Frame>
      <FramePanel className="grid gap-0 p-0 sm:grid-cols-3">
        <SummaryFact
          icon={Building2}
          label="Active organization"
          value={organization.name}
        />
        <SummaryFact
          icon={UserRoundCheck}
          label="Verified active members"
          value={String(organizationMembers.length)}
        />
        <SummaryFact
          icon={ShieldCheck}
          label="Administration context"
          value="Admin · Principal Broker"
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

export function OrganizationIdentity() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Building2 className="size-5" />
      </div>
      <div>
        <p className="font-semibold">{organization.name}</p>
        <p className="text-muted-foreground text-xs">
          Active WorkOS organization · E3, E4
        </p>
      </div>
    </div>
  );
}

export function SearchField({
  onChange,
  query,
}: {
  onChange: (query: string) => void;
  query: string;
}) {
  return (
    <div className="relative w-full md:max-w-xs">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search active organization members"
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name, email, or role"
        value={query}
      />
    </div>
  );
}

export function RoleContextFilter({
  onChange,
  value,
}: {
  onChange: (context: "all" | RoleContext) => void;
  value: "all" | RoleContext;
}) {
  const options = [
    ["all", "All verified roles"],
    ["administration", "Administration"],
    ["operations", "Operations"],
  ] as const;
  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">Filter roles</legend>
      {options.map(([key, label]) => (
        <Button
          key={key}
          onClick={() => onChange(key)}
          size="sm"
          variant={value === key ? "default" : "ghost"}
        >
          {key === "all" ? <ListFilter /> : <Filter />}
          {label}
        </Button>
      ))}
    </fieldset>
  );
}

export function MemberIdentity({ member }: { member: OrganizationMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar>
        <AvatarFallback>{member.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{member.name}</p>
        <p className="truncate text-muted-foreground text-xs">{member.email}</p>
      </div>
    </div>
  );
}

export function RoleBadges({ roles }: { roles: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <Badge key={role} variant="secondary">
          {role}
        </Badge>
      ))}
    </div>
  );
}

export function MemberContextRail({
  member,
}: {
  member: OrganizationMember | undefined;
}) {
  return (
    <Frame>
      <FramePanel className="p-5">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          Membership context
        </p>
        {member ? (
          <div className="mt-4 space-y-4">
            <MemberIdentity member={member} />
            <RoleBadges roles={member.roleLabels} />
            <Separator />
            <FactRow label="Organization" value={organization.name} />
            <FactRow label="Membership status" value="Active" />
            <FactRow label="Source" value="WorkOS projection" />
            <Separator />
            <BoundaryNote
              icon={FileLock2}
              text="No current source maps this member to quorum eligibility. Do not infer readiness from role labels."
            />
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function RelationshipDomain({
  badge,
  children,
  description,
  icon: Icon,
  source,
  title,
}: {
  badge: string;
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  source: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted">
            <Icon className="size-5" />
          </div>
          <Badge variant="outline">{badge}</Badge>
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Separator />
        {children}
        <p className="pt-1 text-muted-foreground text-xs">Source {source}</p>
      </CardContent>
    </Card>
  );
}

export function BriefSection({
  children,
  index,
  source,
  title,
}: {
  children: ReactNode;
  index: string;
  source: string;
  title: string;
}) {
  return (
    <section className="grid gap-4 p-5 sm:grid-cols-[3rem_minmax(0,1fr)] md:p-6">
      <span className="font-mono text-muted-foreground text-xs">{index}</span>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">{title}</h2>
          <span className="text-muted-foreground text-xs">Source {source}</span>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </section>
  );
}

export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-primary border-l-2 pl-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

export function BoundaryNote({
  icon: Icon,
  text,
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <div className="flex gap-3 text-muted-foreground text-xs leading-5">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}

export function CheckLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3.5" />
      </span>
      <span>{text}</span>
    </div>
  );
}

export function BoundaryLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileLock2 className="size-3.5" />
      </span>
      <span>{text}</span>
    </div>
  );
}

export function UnresolvedManagerNote({ compact = false }: { compact?: boolean }) {
  return (
    <Frame className={cn(compact && "border-0 shadow-none")}>
      <FramePanel className={cn("flex gap-3 p-4", compact && "p-0")}>
        <CircleHelp className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium text-sm">“Manager” remains unresolved</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            No canonical WorkOS role slug named manager exists in the inspected
            sources. This prototype uses Admin and Principal Broker and does not
            infer a manager alias.
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function EmptySearch() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Search className="size-5 text-muted-foreground" />
      <p className="font-medium text-sm">No verified fixture member matches</p>
      <p className="text-muted-foreground text-xs">
        This prototype will not generate a placeholder member.
      </p>
    </div>
  );
}

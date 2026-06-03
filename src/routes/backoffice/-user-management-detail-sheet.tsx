"use client";

import {
  Building2,
  CheckCircle2,
  HardHat,
  Mail,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserMinus,
} from "lucide-react";
import { type ReactElement, useId, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";

import type {
  OrganizationProvisioning,
  UserManagementHandlers,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosUserRow,
} from "./-user-management-types";

const BROKER_ROLES = ["principle-broker", "broker", "broker-staff"];
const BUILDER_ROLES = ["builder", "builder-staff"];

export interface DirectoryUser {
  displayName: string;
  initials: string;
  memberships: WorkosMembershipRow[];
  user: WorkosUserRow;
}

type SheetHandlers = Pick<
  UserManagementHandlers,
  | "onCreateMembership"
  | "onLinkBuilderAccount"
  | "onProvisionBrokerageProfile"
  | "onProvisionBuilderProfile"
  | "onReactivateMembership"
  | "onRemoveMembership"
  | "onRoleUpdate"
  | "onUnlinkBuilderAccount"
>;

export function UserDetailSheet({
  directoryUser,
  handlers,
  onOpenChange,
  organizationsById,
  provisioningByOrg,
  roleOptions,
  workspaceOrganizations,
}: {
  directoryUser: DirectoryUser | null;
  handlers: SheetHandlers;
  onOpenChange: (open: boolean) => void;
  organizationsById: Map<string, WorkosOrganizationRow>;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  roleOptions: string[];
  workspaceOrganizations: WorkosOrganizationRow[];
}): ReactElement {
  return (
    <Sheet onOpenChange={onOpenChange} open={directoryUser !== null}>
      <SheetContent className="w-full min-w-0 sm:max-w-2xl">
        {directoryUser ? (
          <UserDetailBody
            directoryUser={directoryUser}
            handlers={handlers}
            organizationsById={organizationsById}
            provisioningByOrg={provisioningByOrg}
            roleOptions={roleOptions}
            workspaceOrganizations={workspaceOrganizations}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function UserDetailBody({
  directoryUser,
  handlers,
  organizationsById,
  provisioningByOrg,
  roleOptions,
  workspaceOrganizations,
}: {
  directoryUser: DirectoryUser;
  handlers: SheetHandlers;
  organizationsById: Map<string, WorkosOrganizationRow>;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  roleOptions: string[];
  workspaceOrganizations: WorkosOrganizationRow[];
}): ReactElement {
  const { user, memberships, displayName, initials } = directoryUser;
  const status = user.status ?? "unknown";

  const availableOrganizations = useMemo(
    () =>
      workspaceOrganizations.filter(
        (organization) =>
          !memberships.some(
            (membership) =>
              membership.workosOrganizationId ===
                organization.workosOrganizationId &&
              membership.status !== "deleted"
          )
      ),
    [workspaceOrganizations, memberships]
  );

  return (
    <>
      <SheetHeader className="gap-3 border-b">
        <div className="flex items-center gap-3 pr-8">
          <Avatar className="size-11 bg-secondary text-secondary-foreground">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <SheetTitle className="truncate text-base sm:text-lg">
              {displayName}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-1.5 text-xs">
              <Mail aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{user.email}</span>
            </SheetDescription>
          </div>
          <Badge variant={status === "active" ? "success" : "outline"}>
            {status}
          </Badge>
        </div>
        <p className="font-mono text-[0.6875rem] text-muted-foreground/80">
          {user.workosUserId}
        </p>
      </SheetHeader>
      <SheetPanel className="flex flex-col gap-6">
        <MembershipsSection
          handlers={handlers}
          memberships={memberships}
          organizationsById={organizationsById}
          roleOptions={roleOptions}
        />
        <AddMembershipSection
          availableOrganizations={availableOrganizations}
          onCreateMembership={handlers.onCreateMembership}
          roleOptions={roleOptions}
          userId={user.workosUserId ?? ""}
        />
        <ProfilesSection
          handlers={handlers}
          memberships={memberships}
          provisioningByOrg={provisioningByOrg}
          workosUserId={user.workosUserId ?? ""}
        />
      </SheetPanel>
      <SheetFooter variant="bare">
        <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
      </SheetFooter>
    </>
  );
}

function MembershipsSection({
  handlers,
  memberships,
  organizationsById,
  roleOptions,
}: {
  handlers: SheetHandlers;
  memberships: WorkosMembershipRow[];
  organizationsById: Map<string, WorkosOrganizationRow>;
  roleOptions: string[];
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        count={memberships.length}
        title="Organization memberships"
      />
      {memberships.length === 0 ? (
        <EmptyHint>
          This account belongs to no organization yet. Add one below.
        </EmptyHint>
      ) : (
        <div className="flex flex-col gap-2.5">
          {memberships.map((membership) => (
            <MembershipCard
              handlers={handlers}
              key={membership.workosMembershipId}
              membership={membership}
              organizationName={
                organizationsById.get(membership.workosOrganizationId)?.name ??
                membership.workosOrganizationId
              }
              roleOptions={roleOptions}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MembershipCard({
  handlers,
  membership,
  organizationName,
  roleOptions,
}: {
  handlers: SheetHandlers;
  membership: WorkosMembershipRow;
  organizationName: string;
  roleOptions: string[];
}): ReactElement {
  const [saving, setSaving] = useState(false);
  const selectedRoles = useMemo(
    () => selectedRoleSlugs(membership),
    [membership]
  );
  const isDeleted = membership.status === "deleted";

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{organizationName}</p>
          <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {membership.workosMembershipId}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <MembershipStatusBadge status={membership.status} />
          {membership.status === "inactive" ? (
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await handlers.onReactivateMembership(
                    membership.workosMembershipId
                  );
                } finally {
                  setSaving(false);
                }
              }}
              size="xs"
              variant="outline"
            >
              <RotateCcw />
              Reactivate
            </Button>
          ) : null}
          {isDeleted ? null : (
            <ConfirmButton
              confirmLabel="Remove membership"
              description={`This revokes ${organizationName} access for this account. The membership is removed in WorkOS and can only be restored by re-inviting.`}
              disabled={saving}
              onConfirm={async () => {
                setSaving(true);
                try {
                  await handlers.onRemoveMembership(
                    membership.workosMembershipId
                  );
                } finally {
                  setSaving(false);
                }
              }}
              title="Remove this membership?"
            >
              <UserMinus />
              Remove
            </ConfirmButton>
          )}
        </div>
      </div>
      <RoleEditor
        disabled={saving || isDeleted}
        onSubmit={async (args) => {
          setSaving(true);
          try {
            await handlers.onRoleUpdate({
              membershipId: membership.workosMembershipId,
              ...args,
            });
          } finally {
            setSaving(false);
          }
        }}
        primaryRoleSlug={membership.roleSlug}
        roleOptions={[...new Set([...roleOptions, ...selectedRoles])]}
        roleSlugs={selectedRoles}
      />
    </div>
  );
}

function MembershipStatusBadge({
  status,
}: {
  status?: WorkosMembershipRow["status"];
}): ReactElement {
  const variant: BadgeProps["variant"] =
    status === "active"
      ? "success"
      : status === "pending"
        ? "warning"
        : status === "inactive"
          ? "outline"
          : "error";
  return <Badge variant={variant}>{status ?? "unknown"}</Badge>;
}

function AddMembershipSection({
  availableOrganizations,
  onCreateMembership,
  roleOptions,
  userId,
}: {
  availableOrganizations: WorkosOrganizationRow[];
  onCreateMembership: UserManagementHandlers["onCreateMembership"];
  roleOptions: string[];
  userId: string;
}): ReactElement | null {
  const [organizationId, setOrganizationId] = useState(
    availableOrganizations[0]?.workosOrganizationId ?? ""
  );
  const [saving, setSaving] = useState(false);

  if (!userId || roleOptions.length === 0) {
    return null;
  }
  if (availableOrganizations.length === 0) {
    return null;
  }

  const effectiveOrgId =
    organizationId &&
    availableOrganizations.some(
      (o) => o.workosOrganizationId === organizationId
    )
      ? organizationId
      : availableOrganizations[0]?.workosOrganizationId;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-input border-dashed p-3.5">
      <SectionLabel title="Add to organization" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground text-xs" htmlFor="add-org">
          Organization
        </label>
        <NativeSelect
          aria-label="Organization"
          id="add-org"
          onChange={(event) => setOrganizationId(event.target.value)}
          value={effectiveOrgId}
        >
          {availableOrganizations.map((organization) => (
            <NativeSelectOption
              key={organization.workosOrganizationId}
              value={organization.workosOrganizationId}
            >
              {organization.name ?? organization.workosOrganizationId}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <RoleEditor
        disabled={saving}
        onSubmit={async ({ primaryRoleSlug, roleSlugs }) => {
          if (!effectiveOrgId) {
            return;
          }
          setSaving(true);
          try {
            await onCreateMembership({
              organizationId: effectiveOrgId,
              primaryRoleSlug,
              roleSlugs,
              userId,
            });
          } finally {
            setSaving(false);
          }
        }}
        roleOptions={roleOptions}
        roleSlugs={[]}
        submitIcon={<Plus />}
        submitLabel="Add membership"
      />
    </section>
  );
}

function ProfilesSection({
  handlers,
  memberships,
  provisioningByOrg,
  workosUserId,
}: {
  handlers: SheetHandlers;
  memberships: WorkosMembershipRow[];
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  workosUserId: string;
}): ReactElement | null {
  const orgs = useMemo(() => {
    const rows: Array<{
      isBroker: boolean;
      isBuilder: boolean;
      provisioning: OrganizationProvisioning;
    }> = [];
    const seen = new Set<string>();
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const provisioning = provisioningByOrg.get(
        membership.workosOrganizationId
      );
      if (!provisioning) {
        continue;
      }
      if (seen.has(membership.workosOrganizationId)) {
        continue;
      }
      seen.add(membership.workosOrganizationId);
      const slugs = normalizedRoles(membership);
      rows.push({
        isBroker: slugs.some((r) => BROKER_ROLES.includes(r)),
        isBuilder: slugs.some((r) => BUILDER_ROLES.includes(r)),
        provisioning,
      });
    }
    return rows;
  }, [memberships, provisioningByOrg]);

  if (orgs.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel count={orgs.length} title="Workspace profiles" />
      <div className="flex flex-col gap-2.5">
        {orgs.map(({ provisioning, isBroker, isBuilder }) => (
          <ProfileRow
            handlers={handlers}
            isBroker={isBroker}
            isBuilder={isBuilder}
            key={provisioning.workosOrganizationId}
            provisioning={provisioning}
            workosUserId={workosUserId}
          />
        ))}
      </div>
    </section>
  );
}

function ProfileRow({
  handlers,
  isBroker,
  isBuilder,
  provisioning,
  workosUserId,
}: {
  handlers: SheetHandlers;
  isBroker: boolean;
  isBuilder: boolean;
  provisioning: OrganizationProvisioning;
  workosUserId: string;
}): ReactElement {
  const [savingBrokerage, setSavingBrokerage] = useState(false);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const existingLink = provisioning.builderAccountLinks.find(
    (link) => link.workosUserId === workosUserId
  );
  const linkedAsBuilder = existingLink !== undefined;

  const showBrokerageAction = isBroker && !provisioning.hasBrokerageProfile;
  const showBuilderProvision = isBuilder && !provisioning.hasBuilderProfile;
  const showLinkActions =
    isBuilder &&
    provisioning.hasBuilderProfile &&
    provisioning.builderProfile !== null;

  const linkAs = async (role: "owner" | "staff") => {
    if (!provisioning.builderProfile) {
      return;
    }
    setSavingBuilder(true);
    try {
      await handlers.onLinkBuilderAccount({
        builderProfileId: provisioning.builderProfile._id,
        role,
        workosUserId,
      });
    } finally {
      setSavingBuilder(false);
    }
  };

  const unlink = async () => {
    if (!existingLink) {
      return;
    }
    setSavingBuilder(true);
    try {
      await handlers.onUnlinkBuilderAccount(existingLink._id);
    } finally {
      setSavingBuilder(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{provisioning.name}</p>
          <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {provisioning.workosOrganizationId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProfileBadge
            icon={<Building2 className="size-3" />}
            label="Brokerage profile"
            present={provisioning.hasBrokerageProfile}
          />
          <ProfileBadge
            icon={<HardHat className="size-3" />}
            label="Builder profile"
            present={provisioning.hasBuilderProfile}
          />
          {linkedAsBuilder ? (
            <Badge variant="info">
              <HardHat className="size-3" />
              Builder {existingLink.role}
            </Badge>
          ) : null}
        </div>
      </div>
      {showBrokerageAction ||
      showBuilderProvision ||
      showLinkActions ||
      linkedAsBuilder ? (
        <div className="flex flex-wrap items-center gap-2 border-border/60 border-t pt-3">
          {showBrokerageAction ? (
            <Button
              disabled={savingBrokerage}
              onClick={async () => {
                setSavingBrokerage(true);
                try {
                  await handlers.onProvisionBrokerageProfile({
                    displayName: provisioning.name,
                    legalName: provisioning.name,
                    principalBrokerWorkosUserId: workosUserId,
                    workosOrganizationId: provisioning.workosOrganizationId,
                  });
                } finally {
                  setSavingBrokerage(false);
                }
              }}
              size="sm"
              variant="default"
            >
              <Building2 />
              Create brokerage profile
            </Button>
          ) : null}
          {showBuilderProvision ? (
            <Button
              disabled={savingBuilder || !provisioning.hasBrokerageProfile}
              onClick={async () => {
                setSavingBuilder(true);
                try {
                  await handlers.onProvisionBuilderProfile({
                    displayName: provisioning.name,
                    ownerWorkosUserId: workosUserId,
                    workosOrganizationId: provisioning.workosOrganizationId,
                  });
                } finally {
                  setSavingBuilder(false);
                }
              }}
              size="sm"
              variant="default"
            >
              <HardHat />
              Create builder profile
            </Button>
          ) : null}
          {showLinkActions && !linkedAsBuilder ? (
            <>
              <Button
                disabled={savingBuilder}
                onClick={() => {
                  linkAs("owner");
                }}
                size="sm"
                variant="default"
              >
                <HardHat />
                Link as owner
              </Button>
              <Button
                disabled={savingBuilder}
                onClick={() => {
                  linkAs("staff");
                }}
                size="sm"
                variant="outline"
              >
                <Plus />
                Link as staff
              </Button>
            </>
          ) : null}
          {linkedAsBuilder ? (
            <ConfirmButton
              confirmLabel="Unlink account"
              description={`This detaches the account from the ${provisioning.name} builder profile. They lose builder access until re-linked.`}
              disabled={savingBuilder}
              onConfirm={unlink}
              title="Unlink builder account?"
            >
              <UserMinus />
              Unlink builder account
            </ConfirmButton>
          ) : null}
          {showBuilderProvision && !provisioning.hasBrokerageProfile ? (
            <span className="text-muted-foreground text-xs">
              Provision the brokerage profile first.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileBadge({
  icon,
  label,
  present,
}: {
  icon: ReactElement;
  label: string;
  present: boolean;
}): ReactElement {
  return (
    <Badge variant={present ? "success" : "outline"}>
      {present ? <CheckCircle2 className="size-3" /> : icon}
      {label}
    </Badge>
  );
}

function ConfirmButton({
  children,
  confirmLabel,
  description,
  disabled,
  onConfirm,
  title,
}: {
  children: React.ReactNode;
  confirmLabel: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
  title: string;
}): ReactElement {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button disabled={disabled} size="xs" variant="destructive-outline" />
        }
      >
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <AlertDialogClose
            onClick={() => {
              onConfirm();
            }}
            render={<Button variant="destructive" />}
          >
            {confirmLabel}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleEditor({
  disabled,
  onSubmit,
  primaryRoleSlug,
  roleOptions,
  roleSlugs,
  submitIcon = <ShieldCheck />,
  submitLabel = "Save roles",
}: {
  disabled?: boolean;
  onSubmit: (args: {
    primaryRoleSlug?: string;
    roleSlugs: string[];
  }) => Promise<void>;
  primaryRoleSlug?: string;
  roleOptions: string[];
  roleSlugs: string[];
  submitIcon?: ReactElement;
  submitLabel?: string;
}): ReactElement {
  const primaryRoleId = useId();
  const initialRoles = roleSlugs;
  const initialPrimary = primaryRoleSlug ?? initialRoles[0] ?? "";
  // Signature of the server-confirmed roles. When a mutation lands and the
  // parent feeds new props for the same membership, reset local edit state so
  // the editor reflects the persisted truth instead of a stale draft.
  const baseline = `${initialPrimary}\u0000${[...initialRoles].sort().join(",")}`;
  const [syncedBaseline, setSyncedBaseline] = useState(baseline);
  const [selected, setSelected] = useState(initialRoles);
  const [primary, setPrimary] = useState(initialPrimary);
  if (baseline !== syncedBaseline) {
    setSyncedBaseline(baseline);
    setSelected(initialRoles);
    setPrimary(initialPrimary);
  }
  const selectedActive = roleOptions.filter((role) => selected.includes(role));
  const dirty =
    selected.length !== initialRoles.length ||
    selected.some((role) => !initialRoles.includes(role)) ||
    primary !== initialPrimary;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {roleOptions.map((role) => {
          const checked = selected.includes(role);
          return (
            // biome-ignore lint/a11y/noLabelWithoutControl: wraps custom Checkbox component
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1 text-xs"
              key={role}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => {
                  const isChecked = next === true;
                  const updated = isChecked
                    ? [...selected, role]
                    : selected.filter((r) => r !== role);
                  setSelected(updated);
                  if (!isChecked && primary === role) {
                    setPrimary(updated[0] ?? "");
                  }
                  if (isChecked && !primary) {
                    setPrimary(role);
                  }
                }}
              />
              <span className="font-medium">{role}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="text-muted-foreground text-xs"
          htmlFor={primaryRoleId}
        >
          Primary
        </label>
        <NativeSelect
          aria-label="Primary role"
          disabled={disabled || selectedActive.length === 0}
          id={primaryRoleId}
          onChange={(event) => setPrimary(event.target.value)}
          value={primary}
        >
          {selectedActive.map((role) => (
            <NativeSelectOption key={role} value={role}>
              {role}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="ms-auto">
          <Button
            disabled={disabled || selected.length === 0 || !primary || !dirty}
            onClick={() =>
              onSubmit({ primaryRoleSlug: primary, roleSlugs: selected })
            }
            size="sm"
            type="button"
          >
            {submitIcon}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  count,
  title,
}: {
  count?: number;
  title: string;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h3>
      {typeof count === "number" ? (
        <span className="text-muted-foreground/80 text-xs tabular-nums">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <p className="rounded-lg border border-input border-dashed bg-muted/24 p-3 text-muted-foreground text-sm">
      {children}
    </p>
  );
}

function selectedRoleSlugs(membership: WorkosMembershipRow): string[] {
  const set = new Set<string>();
  if (membership.roleSlug) {
    set.add(membership.roleSlug);
  }
  for (const role of membership.roleSlugs ?? []) {
    set.add(role);
  }
  return [...set];
}

function normalizedRoles(membership: WorkosMembershipRow): string[] {
  const set = new Set<string>();
  if (membership.roleSlug) {
    set.add(membership.roleSlug);
  }
  for (const role of membership.roleSlugs ?? []) {
    set.add(role);
  }
  return [...set];
}

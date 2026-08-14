"use client";

import {
  Building2,
  CheckCircle2,
  HardHat,
  LoaderCircle,
  Mail,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserMinus,
} from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react";
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
import { canonicalizeWorkosMembershipRows } from "./-user-management-types";

const BROKER_ROLES = ["principle-broker", "broker", "broker-staff"];
const BUILDER_ROLES = ["builder", "builder-staff"];

export interface DirectoryUser {
  displayName: string;
  initials: string;
  memberships: WorkosMembershipRow[];
  user: Omit<WorkosUserRow, "_creationTime" | "_id"> &
    Partial<Pick<WorkosUserRow, "_creationTime" | "_id">>;
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
  readOnly = false,
  readOnlyBadgeLabel = "Read-only",
  readOnlySupplement,
  roleOptionsByOrganization,
  workspaceOrganizations,
}: {
  directoryUser: DirectoryUser | null;
  handlers?: SheetHandlers;
  onOpenChange: (open: boolean) => void;
  organizationsById: Map<string, WorkosOrganizationRow>;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  readOnly?: boolean;
  readOnlyBadgeLabel?: string;
  readOnlySupplement?: ReactNode;
  roleOptionsByOrganization: Map<string, string[]>;
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
            readOnly={readOnly}
            readOnlyBadgeLabel={readOnlyBadgeLabel}
            readOnlySupplement={readOnlySupplement}
            roleOptionsByOrganization={roleOptionsByOrganization}
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
  readOnly,
  readOnlyBadgeLabel,
  readOnlySupplement,
  roleOptionsByOrganization,
  workspaceOrganizations,
}: {
  directoryUser: DirectoryUser;
  handlers?: SheetHandlers;
  organizationsById: Map<string, WorkosOrganizationRow>;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  readOnly: boolean;
  readOnlyBadgeLabel: string;
  readOnlySupplement?: ReactNode;
  roleOptionsByOrganization: Map<string, string[]>;
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
          <div className="flex items-center gap-1.5">
            {readOnly ? (
              <Badge variant="outline">{readOnlyBadgeLabel}</Badge>
            ) : null}
            <Badge variant={status === "active" ? "success" : "outline"}>
              {status}
            </Badge>
          </div>
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
          readOnly={readOnly}
          roleOptionsByOrganization={roleOptionsByOrganization}
        />
        {readOnly ? (
          <ProfilesSection
            memberships={memberships}
            provisioningByOrg={provisioningByOrg}
            readOnly
            workosUserId={user.workosUserId ?? ""}
          />
        ) : null}
        {readOnlySupplement}
        {readOnly || !handlers ? null : (
          <>
            <AddMembershipSection
              availableOrganizations={availableOrganizations}
              onCreateMembership={handlers.onCreateMembership}
              roleOptionsByOrganization={roleOptionsByOrganization}
              userId={user.workosUserId ?? ""}
              workspaceOrganizations={workspaceOrganizations}
            />
            <ProfilesSection
              handlers={handlers}
              memberships={memberships}
              provisioningByOrg={provisioningByOrg}
              workosUserId={user.workosUserId ?? ""}
            />
          </>
        )}
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
  readOnly,
  roleOptionsByOrganization,
}: {
  handlers?: SheetHandlers;
  memberships: WorkosMembershipRow[];
  organizationsById: Map<string, WorkosOrganizationRow>;
  readOnly: boolean;
  roleOptionsByOrganization: Map<string, string[]>;
}): ReactElement {
  const canonicalMemberships = useMemo(
    () => canonicalizeWorkosMembershipRows(memberships),
    [memberships]
  );
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        count={canonicalMemberships.length}
        title="Organization memberships"
      />
      {canonicalMemberships.length === 0 ? (
        <EmptyHint>
          {readOnly
            ? "No organization membership is projected for this account."
            : "This account belongs to no organization yet. Add one below."}
        </EmptyHint>
      ) : (
        <div className="flex flex-col gap-2.5">
          {canonicalMemberships.map((membership) => (
            <MembershipCard
              handlers={handlers}
              key={membership._id ?? membership.workosMembershipId}
              membership={membership}
              organizationName={organizationDisplayLabel(
                organizationsById.get(membership.workosOrganizationId),
                organizationsById.values(),
                membership.workosOrganizationId
              )}
              readOnly={readOnly}
              roleOptions={
                roleOptionsByOrganization.get(
                  membership.workosOrganizationId
                ) ?? []
              }
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
  readOnly,
  roleOptions,
}: {
  handlers?: SheetHandlers;
  membership: WorkosMembershipRow;
  organizationName: string;
  readOnly: boolean;
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
          {!readOnly && handlers && membership.status === "inactive" ? (
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
          {readOnly || !handlers || isDeleted ? null : (
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
      {readOnly || !handlers ? (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs">Roles</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedRoles.length > 0 ? (
              selectedRoles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                  {role === membership.roleSlug ? " · Primary" : ""}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">No roles</span>
            )}
          </div>
        </div>
      ) : (
        <RoleEditor
          disabled={isDeleted}
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
          pending={saving}
          primaryRoleSlug={membership.roleSlug}
          roleOptions={[...new Set([...roleOptions, ...selectedRoles])]}
          roleSlugs={selectedRoles}
        />
      )}
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
  roleOptionsByOrganization,
  userId,
  workspaceOrganizations,
}: {
  availableOrganizations: WorkosOrganizationRow[];
  onCreateMembership: UserManagementHandlers["onCreateMembership"];
  roleOptionsByOrganization: Map<string, string[]>;
  userId: string;
  workspaceOrganizations: WorkosOrganizationRow[];
}): ReactElement | null {
  const [organizationId, setOrganizationId] = useState(
    availableOrganizations[0]?.workosOrganizationId ?? ""
  );
  const [saving, setSaving] = useState(false);

  if (!userId) {
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
  const roleOptions = effectiveOrgId
    ? (roleOptionsByOrganization.get(effectiveOrgId) ?? [])
    : [];

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
              {organizationDisplayLabel(
                organization,
                workspaceOrganizations,
                organization.workosOrganizationId
              )}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <RoleEditor
        disabled={roleOptions.length === 0}
        key={effectiveOrgId}
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
        pending={saving}
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
  readOnly = false,
  workosUserId,
}: {
  handlers?: SheetHandlers;
  memberships: WorkosMembershipRow[];
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  readOnly?: boolean;
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
            readOnly={readOnly}
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
  readOnly,
  workosUserId,
}: {
  handlers?: SheetHandlers;
  isBroker: boolean;
  isBuilder: boolean;
  provisioning: OrganizationProvisioning;
  readOnly: boolean;
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
    if (!(provisioning.builderProfile && handlers)) {
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
    if (!(existingLink && handlers)) {
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
      {!readOnly &&
      handlers &&
      (showBrokerageAction ||
        showBuilderProvision ||
        showLinkActions ||
        linkedAsBuilder) ? (
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
  pending = false,
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
  pending?: boolean;
  primaryRoleSlug?: string;
  roleOptions: string[];
  roleSlugs: string[];
  submitIcon?: ReactElement;
  submitLabel?: string;
}): ReactElement {
  const primaryRoleId = useId();
  const initialRoles = roleSlugs;
  const initialPrimary = primaryRoleSlug ?? initialRoles[0] ?? "";
  const propBaseline = roleSignature(initialPrimary, initialRoles);
  const [seenPropBaseline, setSeenPropBaseline] = useState(propBaseline);
  const [committedBaseline, setCommittedBaseline] = useState(propBaseline);
  const [selected, setSelected] = useState(initialRoles);
  const [primary, setPrimary] = useState(initialPrimary);
  const [submitError, setSubmitError] = useState<string | null>(null);
  if (propBaseline !== seenPropBaseline) {
    setSeenPropBaseline(propBaseline);
    setCommittedBaseline(propBaseline);
    setSelected(initialRoles);
    setPrimary(initialPrimary);
    setSubmitError(null);
  }
  const currentBaseline = roleSignature(primary, selected);
  const selectedActive = roleOptions.filter((role) => selected.includes(role));
  const dirty = currentBaseline !== committedBaseline;

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
                disabled={disabled || pending}
                onCheckedChange={(next) => {
                  setSubmitError(null);
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
          disabled={disabled || pending || selectedActive.length === 0}
          id={primaryRoleId}
          onChange={(event) => {
            setSubmitError(null);
            setPrimary(event.target.value);
          }}
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
            aria-busy={pending}
            disabled={
              disabled || pending || selected.length === 0 || !primary || !dirty
            }
            onClick={async () => {
              const submittedPrimary = primary;
              const submittedRoles = selected;
              setSubmitError(null);
              try {
                await onSubmit({
                  primaryRoleSlug: submittedPrimary,
                  roleSlugs: submittedRoles,
                });
              } catch (error) {
                setSubmitError(roleEditorErrorMessage(error));
                return;
              }
              setCommittedBaseline(
                roleSignature(submittedPrimary, submittedRoles)
              );
            }}
            size="sm"
            type="button"
          >
            {pending ? <LoaderCircle className="animate-spin" /> : submitIcon}
            {pending
              ? submitLabel === "Add membership"
                ? "Adding..."
                : "Saving..."
              : submitLabel}
          </Button>
        </div>
      </div>
      {selected.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Select at least one role to continue.
        </p>
      ) : null}
      {submitError ? (
        <p className="text-destructive text-xs" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}

function roleSignature(primaryRoleSlug: string, roleSlugs: string[]): string {
  return `${primaryRoleSlug}\u0000${[...roleSlugs].sort().join(",")}`;
}

function roleEditorErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The role change could not be saved. Try again.";
}

function organizationDisplayLabel(
  organization: WorkosOrganizationRow | undefined,
  organizations: Iterable<WorkosOrganizationRow>,
  fallbackId: string
): string {
  const name = organization?.name?.trim() || fallbackId;
  const duplicateName =
    organization?.name &&
    [...organizations].filter((candidate) => candidate.name === name).length >
      1;
  return duplicateName ? `${name} · ${compactWorkosId(fallbackId)}` : name;
}

function compactWorkosId(id: string): string {
  if (id.length <= 16) {
    return id;
  }
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
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

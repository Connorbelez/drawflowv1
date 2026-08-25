import {
  Building2,
  Copy,
  Link2,
  Search,
  UserPlus,
  UserRoundCog,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "#/components/ui/combobox.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  type BrokerAssignmentBrokerage,
  BrokerAssignmentDialog,
} from "#/features/broker-assignments/BrokerAssignmentDialog.tsx";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";
import type {
  ProductionProposal,
  ProductionProposalIdentity,
  ProductionProposalAssignment,
  ProductionBuilderOption,
} from "./production-proposal-surface-contracts";
import {
  productionProposalActionErrorMessage,
  Section,
} from "./production-proposal-surface-shared";

export function BuilderAssignmentSection({
  assignment,
  assignableBrokerages,
  brokerOptionsPending,
  builders,
  onAssignBroker,
  onAssignBuilder,
  onCreateClaimLink,
  onOnboardBuilder,
  onUnassignBuilder,
  proposal,
}: {
  assignment?: ProductionProposalAssignment | null;
  assignableBrokerages: BrokerAssignmentBrokerage[];
  brokerOptionsPending: boolean;
  builders: ProductionBuilderOption[];
  onAssignBroker?: (
    assignedBrokerWorkosUserId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onAssignBuilder?: (builderProfileId: string) => Promise<unknown> | unknown;
  onCreateClaimLink?: () =>
    | Promise<{ claimPath: string; claimToken: string; expiresAt: number }>
    | { claimPath: string; claimToken: string; expiresAt: number };
  onOnboardBuilder?: () => void;
  onUnassignBuilder?: () => Promise<unknown> | unknown;
  proposal: ProductionProposal;
}) {
  const builderAssigned =
    assignment?.builderAssigned ?? Boolean(assignment?.builder);
  const [selectedBuilderId, setSelectedBuilderId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [brokerDialogOpen, setBrokerDialogOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [claimLink, setClaimLink] = useState("");
  const [claimExpiresAt, setClaimExpiresAt] = useState<number | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => toast.success("Builder claim link copied."),
  });
  const canCreateClaimLink =
    proposal.status === "draft" &&
    !builderAssigned &&
    Boolean(onCreateClaimLink);
  const canManageAssignment =
    proposal.status !== "closed" &&
    !builderAssigned &&
    Boolean(onAssignBuilder || onOnboardBuilder || canCreateClaimLink);
  const canUnassignBuilder =
    proposal.status === "draft" &&
    builderAssigned &&
    Boolean(onUnassignBuilder);
  const canAssignBroker =
    proposal.status !== "closed" &&
    Boolean(onAssignBroker) &&
    Boolean(assignment?.brokerage?._id);
  const brokerAssignmentTarget = {
    _id: assignment?.builder?._id ?? proposal._id ?? "proposal",
    brokerage: assignment?.brokerage?._id
      ? { _id: assignment.brokerage._id }
      : null,
    brokerAssignment: {
      assignedBrokerWorkosUserId: assignment?.broker?.workosUserId,
      broker: assignment?.broker,
    },
    displayName: assignment?.builder?.displayName ?? proposal.buildName,
  };

  useEffect(() => {
    if (builderAssigned) {
      setSelectedBuilderId("");
      setClaimLink("");
      setClaimExpiresAt(null);
    }
  }, [builderAssigned]);

  async function handleAssignBuilder() {
    if (!(onAssignBuilder && selectedBuilderId)) {
      return;
    }
    setAssigning(true);
    try {
      await onAssignBuilder(selectedBuilderId);
      toast.success("Builder assigned.");
      setSelectedBuilderId("");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setAssigning(false);
    }
  }

  async function handleCreateClaimLink() {
    if (!onCreateClaimLink) {
      return;
    }
    setCreatingLink(true);
    try {
      const result = await onCreateClaimLink();
      const url = buildAbsoluteClaimUrl(result.claimPath);
      setClaimLink(url);
      setClaimExpiresAt(result.expiresAt);
      copyToClipboard(url);
      toast.success("Builder claim link created.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleUnassignBuilder() {
    if (!onUnassignBuilder) {
      return;
    }
    setUnassigning(true);
    try {
      await onUnassignBuilder();
      toast.success("Builder unassigned.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setUnassigning(false);
    }
  }

  const builderAccounts = proposalBuilderAccounts(assignment?.builder);

  return (
    <Section
      action={
        builderAssigned && assignment?.builder?.status ? (
          <Badge variant="success">
            {assignment.builder.status === "active"
              ? "Active builder"
              : assignment.builder.status}
          </Badge>
        ) : undefined
      }
      title="Parties & assignment"
    >
      <div className="grid gap-5">
        {assignment?.builder ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10 border">
                  <AvatarFallback className="bg-muted text-foreground">
                    <Building2 aria-hidden className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-base">
                    {assignment.builder.displayName}
                  </p>
                  <p className="truncate text-muted-foreground text-sm">
                    {assignment.builder.legalName ??
                      assignment.builder.ownerEmail ??
                      "Builder organization"}
                  </p>
                </div>
              </div>
              <Badge variant="outline">
                <UsersRound aria-hidden />
                {builderAccounts.length}{" "}
                {builderAccounts.length === 1 ? "member" : "members"}
              </Badge>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-sm">Owner and staff</h3>
                <span className="text-muted-foreground text-xs">
                  Active builder accounts
                </span>
              </div>
              {builderAccounts.length > 0 ? (
                <ul className="grid gap-2">
                  {builderAccounts.map((account) => (
                    <BuilderTeamMember
                      key={account.workosUserId}
                      member={account}
                    />
                  ))}
                </ul>
              ) : (
                <div className="border-border border-y py-4 text-muted-foreground text-sm">
                  No active owner or staff accounts are linked to this builder.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="size-10 border border-dashed">
                <AvatarFallback>
                  <UsersRound
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <p className="font-semibold">No builder attached</p>
                <p className="max-w-[62ch] text-muted-foreground text-sm">
                  Link an onboarded builder, or create a new builder account and
                  attach it to this Build Proposal automatically.
                </p>
              </div>
            </div>

            {canManageAssignment ? (
              <div className="grid gap-3">
                {onAssignBuilder ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="grid gap-1">
                      <Label htmlFor="production-builder-assignee">
                        Existing builder
                      </Label>
                      <BuilderProfileAutocomplete
                        disabled={assigning}
                        id="production-builder-assignee"
                        onValueChange={setSelectedBuilderId}
                        options={builders}
                        value={selectedBuilderId}
                      />
                    </div>
                    <Button
                      disabled={!selectedBuilderId}
                      loading={assigning}
                      onClick={handleAssignBuilder}
                      size="sm"
                    >
                      <Link2 aria-hidden />
                      Link builder
                    </Button>
                  </div>
                ) : null}
                {onOnboardBuilder ? (
                  <Button
                    onClick={onOnboardBuilder}
                    size="sm"
                    variant="outline"
                  >
                    <UserPlus aria-hidden />
                    Onboard new builder
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Builder assignment is locked at this proposal stage.
              </p>
            )}
          </div>
        )}

        {canUnassignBuilder ? (
          <div className="border-t pt-4">
            <Button
              loading={unassigning}
              onClick={handleUnassignBuilder}
              size="sm"
              variant="destructive-outline"
            >
              <UserRoundX aria-hidden />
              Unassign builder
            </Button>
          </div>
        ) : null}

        {canCreateClaimLink ? (
          <div className="grid gap-3 border-t pt-4">
            {onCreateClaimLink ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Builder self-claim link</Label>
                  {assignment?.claimLinkActive && !claimLink ? (
                    <Badge variant="outline">Active link exists</Badge>
                  ) : null}
                </div>
                <Button
                  disabled={!onCreateClaimLink}
                  loading={creatingLink}
                  onClick={handleCreateClaimLink}
                  size="sm"
                  variant="outline"
                >
                  <Link2 aria-hidden />
                  {assignment?.claimLinkActive || claimLink
                    ? "Regenerate self-claim link"
                    : "Create self-claim link"}
                </Button>
                {claimLink ? (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <Input readOnly value={claimLink} />
                      <Button
                        aria-label="Copy builder claim link"
                        onClick={() => copyToClipboard(claimLink)}
                        size="icon"
                        variant="outline"
                      >
                        <Copy aria-hidden />
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {isCopied ? "Copied. " : ""}
                      {claimExpiresAt
                        ? `Expires ${formatDateTime(claimExpiresAt)}.`
                        : "No expiration recorded."}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <dl className="grid gap-3 border-t pt-4 text-sm">
          <AssignmentIdentityRow
            action={
              canAssignBroker ? (
                <Button
                  aria-label={`${assignment?.broker ? "Change" : "Assign"} broker for ${brokerAssignmentTarget.displayName}`}
                  onClick={() => setBrokerDialogOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <UserRoundCog aria-hidden />
                  {assignment?.broker ? "Change broker" : "Assign broker"}
                </Button>
              ) : undefined
            }
            label="Broker"
            secondary={assignment?.broker?.email}
            value={formatProposalIdentity(assignment?.broker)}
          />
          <AssignmentIdentityRow
            label="Brokerage"
            secondary={assignment?.brokerage?.workosOrganizationId}
            value={
              assignment?.brokerage?.displayName ??
              assignment?.brokerage?.legalName ??
              "Unknown brokerage"
            }
          />
        </dl>

        <BrokerAssignmentDialog
          brokerages={assignableBrokerages}
          brokerOptionsPending={brokerOptionsPending}
          description={
            assignment?.builder
              ? "Choose the broker accountable for this Build Proposal and its attached Builder relationship. Existing active assignments are transferred, not deleted."
              : "Choose the broker accountable for this Build Proposal and record the assignment reason."
          }
          onAssign={async ({ assignedBrokerWorkosUserId, reason }) => {
            if (!onAssignBroker) {
              return;
            }
            await onAssignBroker(assignedBrokerWorkosUserId, reason);
          }}
          onAssigned={() => {
            setBrokerDialogOpen(false);
            toast.success(
              assignment?.broker ? "Broker reassigned." : "Broker assigned."
            );
          }}
          onOpenChange={setBrokerDialogOpen}
          open={brokerDialogOpen}
          reasonHelpText="Required. This reason is written to the proposal audit trail and, when attached, the Builder assignment history."
          reasonPlaceholder="Explain why this broker should own this Build Proposal."
          targetLabel={assignment?.builder ? "Builder" : "Build Proposal"}
          targets={[brokerAssignmentTarget]}
        />
      </div>
    </Section>
  );
}

type BuilderTeamMemberIdentity = ProductionProposalIdentity & {
  role?: string;
};

function proposalBuilderAccounts(
  builder: ProductionProposalAssignment["builder"]
): BuilderTeamMemberIdentity[] {
  if (!builder) {
    return [];
  }
  const accounts = [...(builder.accounts ?? [])];
  if (accounts.length === 0 && builder.ownerEmail) {
    accounts.push({
      email: builder.ownerEmail,
      role: "owner",
      workosUserId: `owner:${builder.ownerEmail}`,
    });
  }
  return accounts.sort((left, right) => {
    const roleOrder =
      Number(right.role === "owner") - Number(left.role === "owner");
    if (roleOrder !== 0) {
      return roleOrder;
    }
    return builderTeamMemberName(left).localeCompare(
      builderTeamMemberName(right)
    );
  });
}

function BuilderTeamMember({ member }: { member: BuilderTeamMemberIdentity }) {
  const displayName = builderTeamMemberName(member);
  return (
    <li className="flex min-w-0 items-center gap-3 border-border border-t pt-2 first:border-t-0 first:pt-0">
      <Avatar className="size-8 border">
        <AvatarFallback>
          {builderTeamMemberInitials(displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{displayName}</p>
        <p className="truncate text-muted-foreground text-xs">
          {member.email ?? member.workosUserId}
        </p>
      </div>
      <Badge size="sm" variant={member.role === "owner" ? "info" : "outline"}>
        {member.role === "owner" ? "Owner" : "Staff"}
      </Badge>
    </li>
  );
}

function AssignmentIdentityRow({
  action,
  label,
  secondary,
  value,
}: {
  action?: ReactNode;
  label: string;
  secondary?: string | null;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-start-1 min-w-0">
        <span className="block truncate font-medium">{value}</span>
        {secondary ? (
          <span className="block truncate text-muted-foreground text-xs">
            {secondary}
          </span>
        ) : null}
      </dd>
      {action ? (
        <dd className="col-start-2 row-span-2 row-start-1 self-center">
          {action}
        </dd>
      ) : null}
    </div>
  );
}

function builderTeamMemberName(member: BuilderTeamMemberIdentity) {
  return member.name?.trim() || member.email?.trim() || member.workosUserId;
}

function builderTeamMemberInitials(value: string) {
  const segments = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    segments
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase())
      .join("") || "BT"
  );
}

function BuilderProfileAutocomplete({
  disabled,
  id,
  onValueChange,
  options,
  value,
}: {
  disabled?: boolean;
  id: string;
  onValueChange: (value: string) => void;
  options: ProductionBuilderOption[];
  value: string;
}) {
  const selectedOption = useMemo(
    () => options.find((option) => option._id === value),
    [options, value]
  );
  const [query, setQuery] = useState(() =>
    selectedOption ? formatBuilderOptionInputValue(selectedOption) : ""
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(
      selectedOption ? formatBuilderOptionInputValue(selectedOption) : ""
    );
  }, [selectedOption]);

  const filteredOptions = useMemo(
    () => filterBuilderOptions(options, query),
    [options, query]
  );

  function handleInputValueChange(
    nextQuery: string,
    eventDetails: { reason: string }
  ) {
    setQuery(nextQuery);
    if (eventDetails.reason === "input-change") {
      if (
        selectedOption &&
        nextQuery !== formatBuilderOptionInputValue(selectedOption)
      ) {
        onValueChange("");
      }
      setOpen(!disabled);
    }
  }

  return (
    <Combobox<ProductionBuilderOption>
      autoHighlight
      filter={null}
      inputValue={query}
      isItemEqualToValue={(option, currentValue) =>
        option._id === currentValue._id
      }
      items={filteredOptions}
      itemToStringLabel={formatBuilderOptionInputValue}
      itemToStringValue={(option) => option._id}
      modal={false}
      onInputValueChange={handleInputValueChange}
      onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
      onValueChange={(option) => {
        onValueChange(option?._id ?? "");
        setQuery(option ? formatBuilderOptionInputValue(option) : "");
        setOpen(false);
      }}
      open={open && !disabled}
      openOnInputClick
      value={selectedOption ?? null}
    >
      <ComboboxInput
        aria-label="Builder assignee"
        disabled={disabled}
        id={id}
        onClick={() => setOpen(!disabled)}
        onFocus={() => setOpen(!disabled)}
        placeholder="Search builder name or email..."
        showClear
        showTrigger
        startAddon={<Search aria-hidden />}
      />
      <ComboboxPopup>
        <ComboboxEmpty>
          {options.length === 0
            ? "No active builders are available in this brokerage."
            : "No builders match this search."}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: ProductionBuilderOption) => (
            <ComboboxItem
              className="min-h-12 px-2.5 py-2"
              key={option._id}
              value={option}
            >
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.displayName}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {option.email ??
                      option.workosUserIds?.[0] ??
                      "Builder profile"}
                  </span>
                </span>
                <Badge className="max-w-28 truncate" variant="outline">
                  Builder
                </Badge>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

function filterBuilderOptions(
  options: ProductionBuilderOption[],
  query: string
) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return options;
  }
  return options.filter((option) => {
    const haystack = normalizeSearch(
      [option.displayName, option.email, ...(option.workosUserIds ?? [])]
        .filter(Boolean)
        .join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  });
}

function formatBuilderOptionInputValue(option: ProductionBuilderOption) {
  return option.email
    ? `${option.displayName} (${option.email})`
    : option.displayName;
}

function formatProposalIdentity(
  identity: ProductionProposalIdentity | null | undefined
) {
  if (!identity) {
    return "Unassigned";
  }
  return (
    identity.name?.trim() || identity.email?.trim() || identity.workosUserId
  );
}

function buildAbsoluteClaimUrl(claimPath: string) {
  if (/^https?:\/\//i.test(claimPath)) {
    return claimPath;
  }
  if (typeof window === "undefined") {
    return claimPath;
  }
  return `${window.location.origin}${claimPath.startsWith("/") ? "" : "/"}${claimPath}`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

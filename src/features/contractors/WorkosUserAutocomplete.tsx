"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { cn } from "#/lib/utils.ts";

export type WorkosUserOption = {
  email?: string;
  membershipStatus?: string;
  name?: string;
  organizationName?: string;
  roleSlugs?: string[];
  status?: string;
  workosUserId: string;
};

type WorkosUserDirectoryProjection = {
  memberships?: Array<{
    roleSlug?: string;
    roleSlugs?: string[];
    status?: string;
    workosOrganizationId: string;
    workosUserId: string;
  }>;
  organizations?: Array<{
    name?: string;
    workosOrganizationId: string;
  }>;
  users?: Array<{
    email?: string;
    name?: string;
    roleSlugs?: string[];
    roles?: string;
    status?: string;
    workosUserId?: string;
  }>;
};

export const VISUAL_WORKOS_USER_OPTIONS: WorkosUserOption[] = [
  {
    email: "principal@fairlend.local",
    membershipStatus: "active",
    name: "FairLend Principal Broker",
    organizationName: "FairLendBrokerage",
    roleSlugs: ["admin", "principle-broker"],
    status: "active",
    workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
  },
  {
    email: "maya.singh@northstar.example",
    membershipStatus: "active",
    name: "Maya Singh",
    organizationName: "FairLendBrokerage",
    roleSlugs: ["contractor"],
    status: "active",
    workosUserId: "user_visual_contractor_masonry",
  },
  {
    email: "alex.morgan@oaklinebuilds.com",
    membershipStatus: "active",
    name: "Alex Morgan",
    organizationName: "Oakline Lending",
    roleSlugs: ["builder"],
    status: "active",
    workosUserId: "user_visual_builder",
  },
];

export function WorkosUserAutocomplete({
  className,
  description = "Search by name, email, organization, role, or WorkOS ID.",
  disabled,
  label = "WorkOS user",
  onValueChange,
  options,
  placeholder = "Search WorkOS users...",
  value,
}: {
  className?: string;
  description?: string;
  disabled?: boolean;
  label?: string;
  onValueChange: (value: string) => void;
  options: WorkosUserOption[];
  placeholder?: string;
  value: string;
}) {
  const selectedOption = useMemo(
    () => options.find((option) => option.workosUserId === value),
    [options, value],
  );
  const [query, setQuery] = useState(() =>
    selectedOption ? formatWorkosUserInputValue(selectedOption) : "",
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption ? formatWorkosUserInputValue(selectedOption) : "");
  }, [selectedOption]);

  const filteredOptions = useMemo(
    () => filterWorkosUserOptions(options, query).slice(0, 12),
    [options, query],
  );

  const selectOption = (option: WorkosUserOption) => {
    onValueChange(option.workosUserId);
    setQuery(formatWorkosUserInputValue(option));
    setOpen(false);
  };

  const clearSelectionIfQueryChanged = (nextQuery: string) => {
    if (nextQuery.trim().length === 0) {
      onValueChange("");
      return;
    }
    if (
      selectedOption &&
      nextQuery !== formatWorkosUserInputValue(selectedOption)
    ) {
      onValueChange("");
    }
  };

  return (
    <Field className={cn("w-full gap-1.5", className)}>
      <FieldLabel className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </FieldLabel>
      <Autocomplete
        autoHighlight="always"
        filter={null}
        itemToStringValue={formatWorkosUserInputValue}
        items={filteredOptions}
        keepHighlight
        modal={false}
        onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          clearSelectionIfQueryChanged(nextQuery);
          setOpen(!disabled);
        }}
        open={open && !disabled}
        openOnInputClick
        value={query}
      >
        <AutocompleteInput
          aria-label={label}
          disabled={disabled}
          placeholder={placeholder}
          showClear
          showTrigger
          startAddon={<Search aria-hidden="true" />}
        />
        <AutocompletePopup>
          <AutocompleteEmpty>
            {options.length === 0
              ? "No WorkOS users are available from the directory sync."
              : "No WorkOS users match this search."}
          </AutocompleteEmpty>
          <AutocompleteList>
            {(option: WorkosUserOption) => (
              <AutocompleteItem
                className="grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2"
                key={option.workosUserId}
                onClick={() => selectOption(option)}
                value={option}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.name || option.email || option.workosUserId}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {option.email ?? option.workosUserId}
                  </span>
                </span>
                <span className="flex max-w-36 flex-col items-end gap-1">
                  <Badge className="max-w-full truncate" variant="outline">
                    {formatRoleSummary(option.roleSlugs)}
                  </Badge>
                  <span className="max-w-full truncate text-muted-foreground text-[0.6875rem]">
                    {option.organizationName ??
                      option.membershipStatus ??
                      option.status ??
                      "Directory user"}
                  </span>
                </span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {value ? (
        <p className="text-muted-foreground text-xs">
          Selected WorkOS ID: <span className="font-mono">{value}</span>
        </p>
      ) : null}
    </Field>
  );
}

export function buildWorkosUserOptions(
  projection: WorkosUserDirectoryProjection | undefined,
  workosOrganizationId?: string,
): WorkosUserOption[] {
  if (!projection) {
    return [];
  }

  const organizationsById = new Map(
    (projection.organizations ?? []).map((organization) => [
      organization.workosOrganizationId,
      organization,
    ]),
  );
  const membershipsByUserId = new Map<
    string,
    NonNullable<WorkosUserDirectoryProjection["memberships"]>
  >();

  for (const membership of projection.memberships ?? []) {
    if (membership.status === "deleted") {
      continue;
    }
    if (
      workosOrganizationId &&
      membership.workosOrganizationId !== workosOrganizationId
    ) {
      continue;
    }

    const memberships = membershipsByUserId.get(membership.workosUserId) ?? [];
    memberships.push(membership);
    membershipsByUserId.set(membership.workosUserId, memberships);
  }

  const optionsByUserId = new Map<string, WorkosUserOption>();

  for (const user of projection.users ?? []) {
    if (!user.workosUserId) {
      continue;
    }
    const memberships = membershipsByUserId.get(user.workosUserId) ?? [];
    if (workosOrganizationId && memberships.length === 0) {
      continue;
    }

    const membership = pickPrimaryMembership(memberships);
    optionsByUserId.set(user.workosUserId, {
      email: user.email,
      membershipStatus: membership?.status,
      name: user.name,
      organizationName: membership
        ? organizationsById.get(membership.workosOrganizationId)?.name ??
          membership.workosOrganizationId
        : undefined,
      roleSlugs: membership ? membershipRoleSlugs(membership) : user.roleSlugs,
      status: user.status,
      workosUserId: user.workosUserId,
    });
  }

  for (const [workosUserId, memberships] of membershipsByUserId) {
    if (optionsByUserId.has(workosUserId)) {
      continue;
    }
    const membership = pickPrimaryMembership(memberships);
    optionsByUserId.set(workosUserId, {
      membershipStatus: membership?.status,
      organizationName: membership
        ? organizationsById.get(membership.workosOrganizationId)?.name ??
          membership.workosOrganizationId
        : undefined,
      roleSlugs: membership ? membershipRoleSlugs(membership) : [],
      workosUserId,
    });
  }

  return [...optionsByUserId.values()].sort((left, right) =>
    formatWorkosUserInputValue(left).localeCompare(
      formatWorkosUserInputValue(right),
    ),
  );
}

function filterWorkosUserOptions(
  options: WorkosUserOption[],
  query: string,
): WorkosUserOption[] {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return options;
  }

  return options.filter((option) => {
    const haystack = normalizeSearch(
      [
        option.name,
        option.email,
        option.workosUserId,
        option.organizationName,
        option.status,
        option.membershipStatus,
        ...(option.roleSlugs ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

function formatWorkosUserInputValue(option: WorkosUserOption): string {
  const identity = option.name?.trim() || option.email?.trim();
  if (!identity) {
    return option.workosUserId;
  }
  return option.email && option.email !== identity
    ? `${identity} (${option.email})`
    : identity;
}

function formatRoleSummary(roleSlugs: string[] | undefined): string {
  if (!roleSlugs || roleSlugs.length === 0) {
    return "No role";
  }
  return roleSlugs.length === 1
    ? roleSlugs[0]
    : `${roleSlugs[0]} +${roleSlugs.length - 1}`;
}

function membershipRoleSlugs(membership: {
  roleSlug?: string;
  roleSlugs?: string[];
}): string[] {
  const set = new Set<string>();
  if (membership.roleSlug) {
    set.add(membership.roleSlug);
  }
  for (const roleSlug of membership.roleSlugs ?? []) {
    set.add(roleSlug);
  }
  return [...set];
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickPrimaryMembership<
  Membership extends { status?: string; workosOrganizationId: string },
>(memberships: Membership[]): Membership | undefined {
  return (
    memberships.find((membership) => membership.status === "active") ??
    memberships[0]
  );
}

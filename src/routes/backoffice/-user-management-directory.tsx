import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  HardHat,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { formatRoleSlug } from "#/lib/auth/rbac.ts";
import type { DirectoryUser } from "./-user-management-detail-sheet";
import {
  computeProfileFlags,
  organizationLabel,
  type ProfileFilter,
  type SortMode,
  type StatusFilter,
  uniqueRoles,
} from "./-user-management-logic";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
  WorkosPermissionRow,
  WorkosReceiptRow,
  WorkosRoleRow,
} from "./-user-management-types";

const SKELETON_CELL_WIDTHS = ["11rem", "6rem", "8rem", "7rem", "4rem"];

export function DirectoryPanel({
  filtered,
  onClearFilters,
  onOrganizationFilter,
  onProfileFilter,
  onRowClick,
  onRoleFilter,
  onSearch,
  onSortMode,
  onStatusFilter,
  organizationFilter,
  organizationsById,
  organizationOptions,
  pending,
  profileFilter,
  provisioningByOrg,
  query,
  roleFilter,
  roleOptions,
  sortMode,
  statusFilter,
  total,
}: {
  filtered: DirectoryUser[];
  onClearFilters: () => void;
  onOrganizationFilter: (organizationId: string) => void;
  onProfileFilter: (profile: ProfileFilter) => void;
  onRowClick: (workosUserId: string) => void;
  onRoleFilter: (role: string) => void;
  onSearch: (value: string) => void;
  onSortMode: (mode: SortMode) => void;
  onStatusFilter: (status: StatusFilter) => void;
  organizationFilter: string;
  organizationsById: Map<string, WorkosOrganizationRow>;
  organizationOptions: WorkosOrganizationRow[];
  pending: boolean;
  profileFilter: ProfileFilter;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  query: string;
  roleFilter: string;
  roleOptions: string[];
  sortMode: SortMode;
  statusFilter: StatusFilter;
  total: number;
}): ReactElement {
  const activeFilterCount = [
    query.trim(),
    organizationFilter !== "all",
    profileFilter !== "all",
    roleFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length;

  return (
    <Frame>
      <FramePanel
        aria-label="People"
        className="flex flex-col gap-0 overflow-hidden p-0"
        role="region"
      >
        <div className="grid gap-3 border-b px-3.5 py-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search people"
                className="pl-7"
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search name, email, user ID, org"
                size="sm"
                type="search"
                value={query}
              />
            </div>
            <p className="text-muted-foreground text-xs tabular-nums">
              {filtered.length} of {total}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:justify-end">
            <FilterSelect
              id="filter-role"
              label="Role"
              onChange={onRoleFilter}
              value={roleFilter}
            >
              <NativeSelectOption value="all">All roles</NativeSelectOption>
              {roleOptions.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {role}
                </NativeSelectOption>
              ))}
            </FilterSelect>
            <FilterSelect
              id="filter-org"
              label="Org"
              onChange={onOrganizationFilter}
              value={organizationFilter}
            >
              <NativeSelectOption value="all">All orgs</NativeSelectOption>
              {organizationOptions
                .slice()
                .sort((a, b) =>
                  organizationLabel(a).localeCompare(organizationLabel(b))
                )
                .map((organization) => (
                  <NativeSelectOption
                    key={organization.workosOrganizationId}
                    value={organization.workosOrganizationId}
                  >
                    {organizationLabel(organization)}
                  </NativeSelectOption>
                ))}
            </FilterSelect>
            <FilterSelect
              id="filter-status"
              label="Status"
              onChange={(value) => onStatusFilter(value as StatusFilter)}
              value={statusFilter}
            >
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
              <NativeSelectOption value="pending">Pending</NativeSelectOption>
            </FilterSelect>
            <FilterSelect
              id="filter-profile"
              label="Profile"
              onChange={(value) => onProfileFilter(value as ProfileFilter)}
              value={profileFilter}
            >
              <NativeSelectOption value="all">All profiles</NativeSelectOption>
              <NativeSelectOption value="missing">Any gap</NativeSelectOption>
              <NativeSelectOption value="brokerage-missing">
                Brokerage gap
              </NativeSelectOption>
              <NativeSelectOption value="builder-missing">
                Builder gap
              </NativeSelectOption>
              <NativeSelectOption value="linked">Linked</NativeSelectOption>
              <NativeSelectOption value="complete">Complete</NativeSelectOption>
            </FilterSelect>
            <FilterSelect
              id="sort-directory"
              label="Order"
              onChange={(value) => onSortMode(value as SortMode)}
              value={sortMode}
            >
              <NativeSelectOption value="attention">
                Needs attention
              </NativeSelectOption>
              <NativeSelectOption value="name-asc">Name A-Z</NativeSelectOption>
              <NativeSelectOption value="role">Role</NativeSelectOption>
              <NativeSelectOption value="org-count">
                Most orgs
              </NativeSelectOption>
              <NativeSelectOption value="status">Status</NativeSelectOption>
            </FilterSelect>
          </div>
        </div>

        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/24 px-3.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
              <SlidersHorizontal className="size-3.5" />
              {activeFilterCount} active filter
              {activeFilterCount === 1 ? "" : "s"}
            </span>
            <Button onClick={onClearFilters} size="xs" variant="ghost">
              Clear filters
            </Button>
          </div>
        ) : null}

        <UserManagementDirectoryTable
          onRowClick={onRowClick}
          organizationsById={organizationsById}
          pending={pending}
          provisioningByOrg={provisioningByOrg}
          rows={filtered}
        />
      </FramePanel>
    </Frame>
  );
}

function FilterSelect({
  children,
  id,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-initial">
      <label className="text-foreground text-xs" htmlFor={id}>
        {label}
      </label>
      <NativeSelect
        aria-label={`${label} filter`}
        className="min-w-0 flex-1 sm:flex-initial"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </NativeSelect>
    </div>
  );
}

export function UserManagementDirectoryTable({
  emptyMessage = "No people match the current filters.",
  onRowClick,
  organizationsById,
  pending,
  provisioningByOrg,
  rowActionVerb = "Manage",
  rows,
}: {
  emptyMessage?: string;
  onRowClick: (workosUserId: string) => void;
  organizationsById: Map<string, WorkosOrganizationRow>;
  pending: boolean;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  rowActionVerb?: "Manage" | "View";
  rows: DirectoryUser[];
}): ReactElement {
  const columns = useMemo<ColumnDef<DirectoryUser>[]>(
    () => [
      {
        cell: ({ row }) => (
          <PersonCell
            entry={row.original}
            onOpen={() => onRowClick(row.original.user.workosUserId ?? "")}
            rowActionVerb={rowActionVerb}
          />
        ),
        header: "Person",
        id: "person",
      },
      {
        cell: ({ row }) => <RolesCell entry={row.original} />,
        header: "Roles",
        id: "roles",
      },
      {
        cell: ({ row }) => (
          <OrganizationsCell
            entry={row.original}
            organizationsById={organizationsById}
          />
        ),
        header: "Organizations",
        id: "organizations",
      },
      {
        cell: ({ row }) => (
          <ProfilesCell
            entry={row.original}
            provisioningByOrg={provisioningByOrg}
          />
        ),
        header: "Profiles",
        id: "profiles",
      },
      {
        cell: ({ row }) => (
          <UserStatusBadge status={row.original.user.status} />
        ),
        header: "Status",
        id: "status",
      },
    ],
    [onRowClick, organizationsById, provisioningByOrg, rowActionVerb]
  );
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) =>
      String(row.user._id ?? row.user.workosUserId ?? row.user.authId),
  });

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className="hover:bg-transparent" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  className={
                    header.column.id === "person"
                      ? "w-[36%]"
                      : header.column.id === "status"
                        ? "text-right"
                        : undefined
                  }
                  key={header.id}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {pending ? (
            <PlaceholderRows columnCount={columns.length} />
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="py-10 text-center text-muted-foreground text-sm"
                colSpan={columns.length}
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                className="cursor-pointer transition-colors hover:bg-accent/40 has-[button[data-row-trigger]:focus-visible]:bg-accent/40"
                key={row.id}
                onClick={() => onRowClick(row.original.user.workosUserId ?? "")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={
                      cell.column.id === "status" ? "text-right" : undefined
                    }
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PersonCell({
  entry,
  onOpen,
  rowActionVerb,
}: {
  entry: DirectoryUser;
  onOpen: () => void;
  rowActionVerb: "Manage" | "View";
}): ReactElement {
  const { displayName, initials, user } = entry;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 bg-secondary text-secondary-foreground">
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <button
          aria-label={`${rowActionVerb} ${displayName}`}
          className="block min-w-0 max-w-full truncate rounded-sm text-left font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-row-trigger
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          type="button"
        >
          {displayName}
        </button>
        <p className="truncate text-muted-foreground text-xs">
          {user.email ?? user.workosUserId}
        </p>
      </div>
    </div>
  );
}

function RolesCell({ entry }: { entry: DirectoryUser }): ReactElement {
  const distinctRoles = uniqueRoles(entry.memberships);
  if (distinctRoles.length === 0) {
    return <span className="text-muted-foreground text-xs">No roles</span>;
  }
  return (
    <div className="flex max-w-[18rem] flex-wrap gap-1">
      {distinctRoles.slice(0, 3).map((role) => (
        <Badge key={role} variant="secondary">
          {formatRoleSlug(role)}
        </Badge>
      ))}
      {distinctRoles.length > 3 ? (
        <Badge
          title={distinctRoles.slice(3).map(formatRoleSlug).join(", ")}
          variant="outline"
        >
          +{distinctRoles.length - 3}
        </Badge>
      ) : null}
    </div>
  );
}

function OrganizationsCell({
  entry,
  organizationsById,
}: {
  entry: DirectoryUser;
  organizationsById: Map<string, WorkosOrganizationRow>;
}): ReactElement {
  const orgsForUser = entry.memberships.filter(
    (membership) => membership.status === "active"
  );
  if (orgsForUser.length === 0) {
    return <span className="text-muted-foreground text-xs">No orgs</span>;
  }
  return (
    <ul className="flex max-w-[20rem] flex-col gap-0.5">
      {orgsForUser.slice(0, 2).map((membership) => (
        <li
          className="truncate text-xs"
          key={membership._id ?? membership.workosMembershipId}
        >
          {organizationsById.get(membership.workosOrganizationId)?.name ??
            membership.workosOrganizationId}
        </li>
      ))}
      {orgsForUser.length > 2 ? (
        <li
          className="text-muted-foreground text-xs"
          title={orgsForUser
            .slice(2)
            .map(
              (membership) =>
                organizationsById.get(membership.workosOrganizationId)?.name ??
                membership.workosOrganizationId
            )
            .join(", ")}
        >
          +{orgsForUser.length - 2} more
        </li>
      ) : null}
    </ul>
  );
}

function ProfilesCell({
  entry,
  provisioningByOrg,
}: {
  entry: DirectoryUser;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
}): ReactElement {
  const profileFlags = computeProfileFlags(
    entry.memberships,
    provisioningByOrg
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {profileFlags.brokerage ? (
        <Badge variant="success">
          <Building2 className="size-3" />
          Brokerage
        </Badge>
      ) : profileFlags.needsBrokerage ? (
        <Badge variant="warning">
          <AlertTriangle className="size-3" />
          Brokerage missing
        </Badge>
      ) : null}
      {profileFlags.builder ? (
        <Badge variant="success">
          <HardHat className="size-3" />
          Builder
        </Badge>
      ) : profileFlags.needsBuilder ? (
        <Badge variant="warning">
          <AlertTriangle className="size-3" />
          Builder missing
        </Badge>
      ) : null}
      {profileFlags.brokerage ||
      profileFlags.builder ||
      profileFlags.needsBrokerage ||
      profileFlags.needsBuilder ? null : (
        <span className="text-muted-foreground text-xs">—</span>
      )}
    </div>
  );
}

function UserStatusBadge({ status }: { status?: string | null }): ReactElement {
  const variant: BadgeProps["variant"] =
    status === "active"
      ? "success"
      : status === "inactive"
        ? "outline"
        : status === "pending"
          ? "warning"
          : "outline";
  return <Badge variant={variant}>{status ?? "unknown"}</Badge>;
}

function PlaceholderRows({
  columnCount,
}: {
  columnCount: number;
}): ReactElement {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
        <TableRow key={index}>
          {Array.from({ length: columnCount }, (_, cellIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
            <TableCell key={cellIndex}>
              <div
                className="h-4 max-w-full animate-pulse rounded bg-muted"
                style={{ width: SKELETON_CELL_WIDTHS[cellIndex] ?? "5rem" }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DirectorySources({
  organizationRoles,
  organizations,
  permissions,
  receipts,
  roles,
}: {
  organizationRoles: WorkosRoleRow[];
  organizations: WorkosOrganizationRow[];
  permissions: WorkosPermissionRow[];
  receipts: WorkosReceiptRow[];
  roles: WorkosRoleRow[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="Directory infrastructure"
      className="rounded-xl border bg-card/40"
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">Directory infrastructure</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {organizations.length} orgs · {roles.length} roles ·{" "}
          {organizationRoles.length} org roles · {permissions.length}{" "}
          permissions · {receipts.length} webhook receipts
        </span>
      </button>
      {open ? (
        <div className="grid gap-4 border-t p-3.5 lg:grid-cols-2">
          <CompactTable
            caption="Organizations"
            columns={["Name", "Status", "WorkOS ID"]}
            getRowId={(row, index) => row._id ?? `organization-${index}`}
            renderRow={(row) => [
              row.name ?? "—",
              row.status ?? "—",
              <span className="font-mono text-xs" key="id">
                {row.workosOrganizationId}
              </span>,
            ]}
            rows={organizations}
          />
          <CompactTable
            caption="Roles"
            columns={["Slug", "Name", "Status", "Resource"]}
            getRowId={(row, index) => row._id ?? row.slug ?? `role-${index}`}
            renderRow={(row) => [
              <span className="font-mono text-xs" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
              row.resourceTypeSlug ?? "—",
            ]}
            rows={roles}
          />
          <CompactTable
            caption="Organization roles"
            columns={["Slug", "Name", "Status", "Org"]}
            getRowId={(row, index) =>
              row._id ??
              `${row.workosOrganizationId ?? "org"}:${row.slug}:${index}`
            }
            renderRow={(row) => [
              <span className="font-mono text-xs" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
              <span className="font-mono text-xs" key="org">
                {row.workosOrganizationId ?? "—"}
              </span>,
            ]}
            rows={organizationRoles}
          />
          <CompactTable
            caption="Permissions"
            columns={["Slug", "Name", "Status"]}
            getRowId={(row, index) =>
              row._id ?? row.slug ?? `permission-${index}`
            }
            renderRow={(row) => [
              <span className="font-mono text-xs" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
            ]}
            rows={permissions}
          />
          <CompactTable
            caption="Webhook receipts"
            columns={["Event", "Status", "Event ID"]}
            getRowId={(row, index) =>
              row._id ?? row.eventId ?? `receipt-${index}`
            }
            renderRow={(row) => [
              row.eventType,
              row.status,
              <span className="font-mono text-xs" key="id">
                {row.eventId}
              </span>,
            ]}
            rows={receipts}
          />
        </div>
      ) : null}
    </section>
  );
}

function CompactTable<T>({
  caption,
  columns,
  getRowId,
  renderRow,
  rows,
}: {
  caption: string;
  columns: string[];
  getRowId: (row: T, index: number) => string;
  renderRow: (row: T) => ReactNode[];
  rows: T[];
}): ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-muted/40 px-3 py-2">
        <h4 className="font-medium text-xs">{caption}</h4>
      </div>
      <div className="max-h-72 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-xs"
                  colSpan={columns.length}
                >
                  No records
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={getRowId(row, index)}>
                  {renderRow(row).map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable column order
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

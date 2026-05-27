import { useAction, useQuery } from "convex/react";
import { CheckCircle2, RefreshCw, Shield, UserPlus } from "lucide-react";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardHeader, CardPanel, CardTitle } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";

export const Route = createFileRoute("/backoffice/user-management")({
  component: UserManagementRoute,
});

function UserManagementRoute() {
  const projections = useQuery(api.workosProjection.listUserManagement, {});
  const syncStatus = useQuery(api.workosProjection.listSyncStatus, {});
  const inviteUser = useAction(api.workosManagement.inviteUser);
  const updateMembershipRole = useAction(
    api.workosManagement.updateMembershipRole
  );
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [roleSlug, setRoleSlug] = useState("builder");
  const [accepted, setAccepted] = useState<string | null>(null);

  const pending = projections === undefined || syncStatus === undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-xl">User management</FrameTitle>
          <FrameDescription>
            WorkOS-owned users, organizations, roles, permissions, memberships,
            and webhook sync state.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_12rem_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await inviteUser({ email, organizationId, roleSlug });
              setAccepted(`${result.operation}: ${result.sync}`);
            }}
          >
            <Input
              aria-label="Invite email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="new.builder@example.com"
              required
              type="email"
              value={email}
            />
            <Input
              aria-label="Organization ID"
              onChange={(event) => setOrganizationId(event.target.value)}
              placeholder="org_..."
              required
              value={organizationId}
            />
            <Input
              aria-label="Role slug"
              onChange={(event) => setRoleSlug(event.target.value)}
              required
              value={roleSlug}
            />
            <Button type="submit">
              <UserPlus />
              Invite
            </Button>
          </form>
          {accepted ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" />
              {accepted}
            </p>
          ) : null}
        </FramePanel>
      </Frame>

      {pending ? (
        <Frame>
          <FramePanel className="flex items-center gap-2 text-muted-foreground text-sm">
            <RefreshCw className="size-4 animate-spin" />
            Loading WorkOS projections
          </FramePanel>
        </Frame>
      ) : (
        <>
          <ProjectionTable
            columns={["email", "status", "workosUserId"]}
            rows={projections.users}
            title="Users"
          />
          <ProjectionTable
            columns={["name", "status", "workosOrganizationId"]}
            rows={projections.organizations}
            title="Organizations"
          />
          <MembershipTable
            onRoleUpdate={async (membershipId, nextRoleSlug) => {
              const result = await updateMembershipRole({
                membershipId,
                roleSlug: nextRoleSlug,
              });
              setAccepted(`${result.operation}: ${result.sync}`);
            }}
            rows={projections.memberships}
          />
          <ProjectionTable
            columns={["slug", "status", "resourceTypeSlug"]}
            rows={projections.roles}
            title="Roles"
          />
          <ProjectionTable
            columns={["slug", "name", "status", "workosOrganizationId"]}
            rows={projections.organizationRoles}
            title="Organization roles"
          />
          <ProjectionTable
            columns={["slug", "name", "status"]}
            rows={projections.permissions}
            title="Permissions"
          />
          <ProjectionTable
            columns={["eventType", "status", "eventId"]}
            rows={syncStatus.receipts}
            title="Webhook receipts"
          />
        </>
      )}
    </div>
  );
}

function ProjectionTable({
  columns,
  rows,
  title,
}: {
  columns: string[];
  rows: any[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardPanel>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id ?? row.eventId ?? row.slug}>
                {columns.map((column) => (
                  <TableCell key={column}>{String(row[column] ?? "")}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  );
}

function MembershipTable({
  onRoleUpdate,
  rows,
}: {
  onRoleUpdate: (membershipId: string, roleSlug: string) => Promise<void>;
  rows: any[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Memberships</CardTitle>
      </CardHeader>
      <CardPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id}>
                <TableCell>{row.workosUserId}</TableCell>
                <TableCell>{row.workosOrganizationId}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.roleSlug}</TableCell>
                <TableCell>
                  <Button
                    onClick={() =>
                      onRoleUpdate(row.workosMembershipId, row.roleSlug ?? "member")
                    }
                    size="sm"
                    variant="outline"
                  >
                    <Shield />
                    Sync role
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Mail, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";

import { LenderShell } from "#/components/lender-shell.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";

export const Route = createFileRoute("/lender/organization")({
  component: LenderOrganization,
  staticData: {
    breadcrumb: {
      label: "Organization",
      to: "/lender/organization",
    },
  },
});

interface PlaceholderMember {
  email: string;
  initials: string;
  name: string;
  reviewAccess: string;
  role: string;
  status: "Active";
}

// TODO(lender-portal): replace this local organization view model with the
// canonical lender organization and membership projections. Until those exist,
// do not reuse Back Office user-management records as lender data.
const LENDER_ORGANIZATION_PLACEHOLDER = {
  members: [
    {
      email: "morgan.lee@example.test",
      initials: "ML",
      name: "Morgan Lee",
      reviewAccess: "Can participate in lender reviews",
      role: "Organization administrator",
      status: "Active",
    },
    {
      email: "alex.rivera@example.test",
      initials: "AR",
      name: "Alex Rivera",
      reviewAccess: "Can participate in lender reviews",
      role: "Lender reviewer",
      status: "Active",
    },
  ] satisfies readonly PlaceholderMember[],
  name: "Meridian Capital",
} as const;

function LenderOrganization() {
  const [selectedMember, setSelectedMember] =
    useState<PlaceholderMember | null>(null);

  return (
    <LenderShell activeNavigation="Organization" pageTitle="Organization">
      <main className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                Lender organization
              </p>
              <h1 className="mt-1 font-semibold text-2xl">
                {LENDER_ORGANIZATION_PLACEHOLDER.name}
              </h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Organization members and their lender review access.
              </p>
            </div>
            <Badge variant="outline">Placeholder data</Badge>
          </header>

          <Frame>
            <FramePanel className="flex gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div>
                <p className="font-medium text-sm">
                  Read-only organization view
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Membership changes will be connected when the lender
                  organization administration contract is implemented.
                </p>
              </div>
            </FramePanel>
          </Frame>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 font-medium text-sm">
              <Users
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              Members
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Organization role</TableHead>
                    <TableHead>Review access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Open member details</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LENDER_ORGANIZATION_PLACEHOLDER.members.map((member) => (
                    <TableRow key={member.email}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar size="sm">
                            <AvatarFallback>{member.initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{member.name}</p>
                            <p className="truncate text-muted-foreground text-xs">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{member.role}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {member.reviewAccess}
                      </TableCell>
                      <TableCell>
                        <Badge variant="success">{member.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => setSelectedMember(member)}
                          size="sm"
                          variant="outline"
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      <MemberDetailSheet
        member={selectedMember}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMember(null);
          }
        }}
      />
    </LenderShell>
  );
}

function MemberDetailSheet({
  member,
  onOpenChange,
}: {
  member: PlaceholderMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={member !== null}>
      <SheetPopup className="w-full sm:max-w-xl" side="right">
        {member ? (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3 pr-8">
                <Avatar className="size-11">
                  <AvatarFallback>{member.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{member.name}</SheetTitle>
                  <SheetDescription className="mt-1 flex items-center gap-1.5">
                    <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetPanel className="space-y-6">
              <DetailFact label="Organization role" value={member.role} />
              <DetailFact label="Review access" value={member.reviewAccess} />
              <DetailFact label="Membership status" value={member.status} />
              {/* TODO(lender-portal): connect role changes, invitations, and
                  deactivation only after their canonical commands and audit
                  trail are implemented. */}
              <Frame>
                <FramePanel>
                  <p className="font-medium text-sm">
                    No changes available yet
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Membership administration will be available in a later
                    implementation pass.
                  </p>
                </FramePanel>
              </Frame>
            </SheetPanel>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

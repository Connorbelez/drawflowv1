"use client";

import {
  FileKey2,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserMinus,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "#/components/ui/combobox.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";

const WHITESPACE_PATTERN = /\s+/u;
const DEFAULT_SUPPORTING_CONTEXT_DISCLOSURE =
  "Submission creates durable Build cost context; it does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";

export interface CostDocumentDraftAccessPerson {
  displayName: string;
  email?: string;
  roleLabel: string;
  workosUserId: string;
}

export interface CostDocumentDraftCollaborator
  extends CostDocumentDraftAccessPerson {
  grantedAt?: number;
}

export interface CostDocumentDraftCollaborationProps {
  busy?: boolean;
  canManageAccess: boolean;
  collaborators: CostDocumentDraftCollaborator[];
  creator: CostDocumentDraftAccessPerson;
  draftReference: string;
  eligibleCollaborators: CostDocumentDraftAccessPerson[];
  error?: string;
  onGrant: (input: {
    expectedRevision: number;
    granteeWorkosUserId: string;
  }) => Promise<unknown> | unknown;
  onRevoke: (input: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => Promise<unknown> | unknown;
  revision: number;
  supportingContextDisclosure?: string;
  title: string;
}

/**
 * The production Share-step ledger for one exact Cost Document Draft.
 *
 * Authorization and candidate eligibility are deliberately server-derived.
 * This component renders only the capabilities and people returned by the
 * exact-Draft projection; it never infers authority from a role label.
 */
export function CostDocumentDraftCollaboration({
  busy = false,
  canManageAccess,
  collaborators,
  creator,
  draftReference,
  eligibleCollaborators,
  error,
  onGrant,
  onRevoke,
  revision,
  supportingContextDisclosure = DEFAULT_SUPPORTING_CONTEXT_DISCLOSURE,
  title,
}: CostDocumentDraftCollaborationProps) {
  const [selectedCandidate, setSelectedCandidate] =
    useState<CostDocumentDraftAccessPerson | null>(null);
  const [candidatePickerOpen, setCandidatePickerOpen] = useState(false);
  const [pendingRevocation, setPendingRevocation] =
    useState<CostDocumentDraftCollaborator | null>(null);
  const [saving, setSaving] = useState(false);
  const interactionBusy = busy || saving;

  const grant = async () => {
    if (!selectedCandidate || interactionBusy) {
      return;
    }
    setSaving(true);
    try {
      await onGrant({
        expectedRevision: revision,
        granteeWorkosUserId: selectedCandidate.workosUserId,
      });
      setSelectedCandidate(null);
    } catch {
      // The route coordinator owns the durable error message so a refreshed
      // server projection can remain visible beside it.
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (!pendingRevocation || interactionBusy) {
      return;
    }
    setSaving(true);
    try {
      await onRevoke({
        collaboratorWorkosUserId: pendingRevocation.workosUserId,
        expectedRevision: revision,
      });
      setPendingRevocation(null);
    } catch {
      // Keep the current ledger visible; the route coordinator renders the
      // sanitized server error and refreshed revision.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Frame data-testid="cost-document-draft-collaboration">
      <FrameHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">
            <FileKey2 /> Exact Draft
          </Badge>
          <Badge variant="outline">
            {draftReference} · Revision {revision}
          </Badge>
        </div>
        <div>
          <FrameTitle className="text-lg">Share this Draft</FrameTitle>
          <FrameDescription className="mt-1 max-w-3xl">
            Access applies only to {title}. It never reveals any other Cost
            Document in this batch, and it ends when this Draft is submitted.
          </FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className="rounded-t-none border-t-0 p-3 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">Draft access</h3>
                <p className="text-muted-foreground text-xs">
                  Creator ownership never changes.
                </p>
              </div>
              <Badge variant={collaborators.length > 0 ? "success" : "outline"}>
                {collaborators.length > 0
                  ? `Shared with ${collaborators.length} ${collaborators.length === 1 ? "person" : "people"}`
                  : "Private Draft"}
              </Badge>
            </div>

            <div className="space-y-3">
              <AccessPersonCard
                description="Can edit · manages Draft access · only person who can submit or discard"
                person={creator}
                relationship={`Creator · ${creator.roleLabel}`}
              />
              {collaborators.map((collaborator) => (
                <AccessPersonCard
                  action={
                    canManageAccess ? (
                      <Button
                        aria-label={`Revoke ${collaborator.displayName} Draft access`}
                        className="min-h-11"
                        disabled={interactionBusy}
                        onClick={() => setPendingRevocation(collaborator)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <UserMinus /> Revoke
                      </Button>
                    ) : null
                  }
                  description="Can read, edit, allocate, and manage source pages as themselves"
                  key={collaborator.workosUserId}
                  person={collaborator}
                  relationship={`Collaborator · ${collaborator.roleLabel}`}
                />
              ))}
            </div>

            {pendingRevocation ? (
              <Alert className="mt-4" variant="warning">
                <UserMinus />
                <AlertTitle>
                  Remove {pendingRevocation.displayName}'s access?
                </AlertTitle>
                <AlertDescription>
                  Access ends immediately. All prior contributions remain
                  attributed to {pendingRevocation.displayName} in history.
                </AlertDescription>
                <div className="col-start-2 mt-3 flex flex-wrap gap-2">
                  <Button
                    aria-label="Confirm revocation"
                    className="min-h-11"
                    disabled={interactionBusy}
                    loading={saving}
                    onClick={revoke}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Confirm revocation
                  </Button>
                  <Button
                    className="min-h-11"
                    disabled={interactionBusy}
                    onClick={() => setPendingRevocation(null)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Keep access
                  </Button>
                </div>
              </Alert>
            ) : null}

            {canManageAccess ? (
              <Card className="mt-4">
                <CardPanel className="space-y-3 p-3 sm:p-4">
                  <div>
                    <p className="font-semibold text-sm">
                      Add a Builder collaborator
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs leading-5">
                      Candidates are current Builder owners and active Builder
                      Staff on this Build. Eligibility is rechecked whenever
                      access is used.
                    </p>
                  </div>
                  <Combobox
                    items={eligibleCollaborators}
                    itemToStringLabel={(person) => person.displayName}
                    onInputValueChange={() => setCandidatePickerOpen(true)}
                    onOpenChange={setCandidatePickerOpen}
                    onValueChange={(person) => {
                      setSelectedCandidate(person);
                      setCandidatePickerOpen(false);
                    }}
                    open={candidatePickerOpen}
                    value={selectedCandidate}
                  >
                    <ComboboxInput
                      aria-label="Search eligible collaborators"
                      inputClassName="min-h-11 sm:min-h-11"
                      onFocus={() => setCandidatePickerOpen(true)}
                      placeholder="Search participant name"
                      startAddon={<Search />}
                    />
                    <ComboboxPopup>
                      <ComboboxEmpty>
                        No eligible collaborators found.
                      </ComboboxEmpty>
                      <ComboboxList>
                        {(person) => (
                          <ComboboxItem
                            key={person.workosUserId}
                            value={person}
                          >
                            <span>
                              <span className="block font-medium">
                                {person.displayName}
                              </span>
                              <span className="block text-muted-foreground text-xs">
                                {person.email ?? person.roleLabel}
                              </span>
                            </span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxPopup>
                  </Combobox>
                  {selectedCandidate ? (
                    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
                      <Avatar>
                        <AvatarFallback>
                          {personInitials(selectedCandidate.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {selectedCandidate.displayName}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {selectedCandidate.email ??
                            selectedCandidate.roleLabel}
                        </p>
                      </div>
                      <Badge variant="success">Eligible now</Badge>
                    </div>
                  ) : null}
                  {selectedCandidate ? (
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>
                        Give {selectedCandidate.displayName} exact-Draft access?
                      </AlertTitle>
                      <AlertDescription>
                        They can contribute as themselves to this Draft only.
                        They cannot submit, discard, manage access, or see
                        sibling Cost Documents.
                      </AlertDescription>
                      <div className="col-start-2 mt-3 flex flex-wrap gap-2">
                        <Button
                          aria-label="Confirm Draft access"
                          className="min-h-11"
                          disabled={interactionBusy}
                          loading={saving}
                          onClick={grant}
                          size="sm"
                          type="button"
                        >
                          Confirm Draft access
                        </Button>
                        <Button
                          className="min-h-11"
                          disabled={interactionBusy}
                          onClick={() => setSelectedCandidate(null)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </Alert>
                  ) : null}
                </CardPanel>
              </Card>
            ) : (
              <Alert className="mt-4">
                <LockKeyhole />
                <AlertTitle>
                  Draft access cannot be changed from your current capacity.
                </AlertTitle>
                <AlertDescription>
                  Only an eligible Builder-side Draft creator can manage
                  collaborators. Your edits are still recorded as your own work;
                  collaboration never transfers authorship.
                </AlertDescription>
              </Alert>
            )}
          </section>

          <aside className="space-y-3">
            <Alert>
              <ShieldCheck />
              <AlertTitle>Every change keeps its actual actor</AlertTitle>
              <AlertDescription>
                Collaborators act as themselves. They cannot impersonate the
                creator or become the recorded submitter.
              </AlertDescription>
            </Alert>
            {canManageAccess ? (
              <Card>
                <CardPanel className="space-y-3 p-3 sm:p-4">
                  <p className="font-semibold text-sm">Creator-only controls</p>
                  <CreatorBoundary label="Manage Draft access" />
                  <CreatorBoundary label="Discard this Draft" />
                  <CreatorBoundary label="Submit the batch" />
                </CardPanel>
              </Card>
            ) : null}
            <p className="px-1 text-muted-foreground text-xs leading-5">
              Removing Build participation ends future access immediately. Prior
              contributions remain attributed in history.
            </p>
            <p className="px-1 text-muted-foreground text-xs leading-5">
              {supportingContextDisclosure}
            </p>
          </aside>
        </div>

        {error ? (
          <Alert className="mt-5" variant="error">
            <AlertTitle>Draft access not changed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function AccessPersonCard({
  action,
  description,
  person,
  relationship,
}: {
  action?: React.ReactNode;
  description: string;
  person: CostDocumentDraftAccessPerson;
  relationship: string;
}) {
  return (
    <Card>
      <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <Avatar>
          <AvatarFallback>{personInitials(person.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">{person.displayName}</p>
            <Badge variant="outline">{relationship}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {description}
          </p>
        </div>
        {action}
      </CardPanel>
    </Card>
  );
}

function CreatorBoundary({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <LockKeyhole className="size-3.5 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <Badge variant="outline">Creator</Badge>
    </div>
  );
}

function personInitials(displayName: string) {
  const parts = displayName.trim().split(WHITESPACE_PATTERN).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

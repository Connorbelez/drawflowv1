import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { RefreshCw, Search, UserPlus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
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
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { LenderOrganizationDefaultReviewPolicy } from "#/features/lender-organization-management/LenderOrganizationDefaultReviewPolicy.tsx";
import {
  LenderOrganizationManagementVariantE,
  type LenderOrganizationOperation,
} from "#/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx";
import type { DirectoryUser } from "#/routes/backoffice/-user-management-detail-sheet.tsx";
import type {
  OrganizationProvisioning,
  WorkosOrganizationRow,
} from "#/routes/backoffice/-user-management-types.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  type ControlPlaneMember,
  formatAssignableUserInputValue,
  formatRole,
  initials,
  type Permissions,
  permissionEntries,
  type UnassignedUser,
  WorkosReconciliationNotice,
  type WorkosReconciliationState,
} from "./-lender-control-plane-support.tsx";

type OrganizationPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizations
>;
type OrganizationRow = OrganizationPage["page"][number];
type MemberPage = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;
type MemberEntry = MemberPage["page"][number];
type PendingInvitation = Extract<
  MemberEntry,
  { kind: "pending_invitation" }
>["pendingInvitation"];
interface ControlPlaneMemberResult {
  members: ControlPlaneMember[];
  pendingInvitations: PendingInvitation[];
}
type LenderOrganizationId = Id<"lenderOrganizations">;

export interface LenderOrganizationDetailSheetProps {
  changeReason: string;
  directoryUsers: DirectoryUser[];
  existingUserOpen: boolean;
  existingUserQuery: string;
  filteredExistingUsers: UnassignedUser[];
  memberPage: {
    loadMore: (numItems: number) => void;
    status: string;
  };
  members: ControlPlaneMemberResult | undefined;
  onOpenAssignmentDraft: (
    user: UnassignedUser,
    lenderOrganizationId: LenderOrganizationId
  ) => void;
  onOpenChange: (open: boolean) => void;
  onOpenOperation: (operation: LenderOrganizationOperation) => void;
  onOpenUser: (workosUserId: string) => void;
  onReconcileAssignments: (input: {
    lenderOrganizationId: LenderOrganizationId;
  }) => Promise<unknown>;
  onRetryReconciliation?: () => void;
  onSetOrganizationStatus: (input: {
    lenderOrganizationId: LenderOrganizationId;
    reason: string;
    status: "active" | "inactive";
  }) => Promise<unknown>;
  onUpdatePermissions: (input: {
    lenderOrganizationId: LenderOrganizationId;
    permissions: Permissions;
    reason: string;
  }) => Promise<unknown>;
  open: boolean;
  organizationsById: Map<string, WorkosOrganizationRow>;
  permissionDraft: Permissions;
  policyAuditReason: string;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  reconciliation: WorkosReconciliationState | null;
  run: (operation: () => Promise<unknown>, message: string) => Promise<void>;
  selectedExistingUser: UnassignedUser | null;
  selectedOrganization: OrganizationRow | null;
  setExistingUserOpen: (open: boolean) => void;
  setExistingUserQuery: (query: string) => void;
  setPermissionDraft: Dispatch<SetStateAction<Permissions>>;
  setPolicyAuditReason: (reason: string) => void;
  setSelectedExistingUser: (user: UnassignedUser | null) => void;
  unassignedUserCount: number;
}

export function LenderOrganizationDetailSheet({
  changeReason,
  directoryUsers,
  existingUserOpen,
  existingUserQuery,
  filteredExistingUsers,
  memberPage,
  members,
  onOpenAssignmentDraft,
  onOpenChange,
  onOpenOperation,
  onOpenUser,
  onReconcileAssignments,
  onRetryReconciliation,
  onSetOrganizationStatus,
  onUpdatePermissions,
  open,
  organizationsById,
  permissionDraft,
  policyAuditReason,
  provisioningByOrg,
  reconciliation,
  run,
  selectedExistingUser,
  selectedOrganization,
  setExistingUserOpen,
  setExistingUserQuery,
  setPermissionDraft,
  setPolicyAuditReason,
  setSelectedExistingUser,
  unassignedUserCount,
}: LenderOrganizationDetailSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup className="w-full sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>
            {selectedOrganization?.displayName ?? "Lender organization"}
          </SheetTitle>
          <SheetDescription>
            Application ownership, membership assignments, and shared workflow
            policy.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-6 overflow-y-auto px-6 pb-8">
          {selectedOrganization ? (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Organization state</p>
                    <p className="text-muted-foreground text-xs">
                      Soft deactivation retains assignment history.
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      run(
                        () =>
                          onSetOrganizationStatus({
                            lenderOrganizationId: selectedOrganization.id,
                            status:
                              selectedOrganization.status === "active"
                                ? "inactive"
                                : "active",
                            reason: changeReason,
                          }),
                        selectedOrganization.status === "active"
                          ? "Organization deactivated"
                          : "Organization reactivated"
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    {selectedOrganization.status === "active"
                      ? "Deactivate"
                      : "Reactivate"}
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <div>
                  <p className="font-medium text-sm">Add existing user</p>
                  <p className="text-muted-foreground text-xs">
                    Select an active lender user from the shared WorkOS
                    directory who is not assigned to another Lender
                    Organization.
                  </p>
                </div>
                <Combobox<UnassignedUser>
                  autoHighlight
                  filter={null}
                  inputValue={existingUserQuery}
                  isItemEqualToValue={(left, right) =>
                    left.workosUserId === right.workosUserId
                  }
                  items={filteredExistingUsers}
                  itemToStringLabel={(user) =>
                    user ? `${user.name} ${user.email}` : ""
                  }
                  itemToStringValue={(user) => user.workosUserId}
                  modal={false}
                  onInputValueChange={(nextQuery, details) => {
                    setExistingUserQuery(nextQuery);
                    if (details.reason === "input-change") {
                      if (
                        selectedExistingUser &&
                        nextQuery !==
                          formatAssignableUserInputValue(selectedExistingUser)
                      ) {
                        setSelectedExistingUser(null);
                      }
                      setExistingUserOpen(true);
                    }
                  }}
                  onOpenChange={setExistingUserOpen}
                  onValueChange={(user) => {
                    setSelectedExistingUser(user ?? null);
                    setExistingUserQuery(
                      user ? formatAssignableUserInputValue(user) : ""
                    );
                    setExistingUserOpen(false);
                  }}
                  open={
                    existingUserOpen && selectedOrganization.status === "active"
                  }
                  openOnInputClick
                  value={selectedExistingUser}
                >
                  <ComboboxInput
                    aria-label="Add an existing lender user"
                    disabled={selectedOrganization.status !== "active"}
                    onClick={() => setExistingUserOpen(true)}
                    onFocus={() => setExistingUserOpen(true)}
                    placeholder="Search by name or email…"
                    showClear
                    showTrigger
                    startAddon={<Search aria-hidden />}
                  />
                  <ComboboxPopup>
                    <ComboboxEmpty>
                      {unassignedUserCount
                        ? "No unassigned lender users match this search."
                        : "No eligible unassigned lender users are available."}
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(user: UnassignedUser) => (
                        <ComboboxItem
                          className="min-h-12 px-2.5 py-2"
                          key={user.workosUserId}
                          value={user}
                        >
                          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                                {initials(user.name, user.email)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {user.name}
                                </span>
                                <span className="block truncate text-muted-foreground text-xs">
                                  {user.email}
                                </span>
                              </span>
                            </span>
                            <Badge variant="outline">
                              {formatRole(user.roleSlugs[0] ?? "lender")}
                            </Badge>
                          </span>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxPopup>
                </Combobox>
                {selectedExistingUser ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border bg-muted/30 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {selectedExistingUser.name}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {selectedExistingUser.email}
                      </p>
                    </div>
                    <Button
                      disabled={selectedOrganization.status !== "active"}
                      onClick={() =>
                        onOpenAssignmentDraft(
                          selectedExistingUser,
                          selectedOrganization.id
                        )
                      }
                      size="sm"
                    >
                      <UserPlus />
                      Add to organization
                    </Button>
                  </div>
                ) : null}
              </section>

              <Separator />

              <section className="space-y-3">
                <div>
                  <p className="font-medium text-sm">Workflow policy</p>
                  <p className="text-muted-foreground text-xs">
                    One shared policy caps every assigned lender.
                  </p>
                </div>
                <div className="grid gap-2">
                  {permissionEntries(permissionDraft).map(
                    ([key, label, enabled]) => (
                      <button
                        aria-pressed={enabled}
                        className="flex items-center justify-between border px-3 py-3 text-left text-sm hover:bg-muted/40"
                        key={key}
                        onClick={() =>
                          setPermissionDraft((current) => ({
                            ...current,
                            [key]: !current[key],
                          }))
                        }
                        type="button"
                      >
                        <span>{label}</span>
                        <Badge variant={enabled ? "default" : "outline"}>
                          {enabled ? "Enabled" : "Off"}
                        </Badge>
                      </button>
                    )
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lender-policy-audit-reason">
                    Policy audit reason <span aria-hidden="true">*</span>
                  </Label>
                  <Textarea
                    aria-describedby="lender-policy-audit-reason-hint"
                    aria-required="true"
                    id="lender-policy-audit-reason"
                    onChange={(event) =>
                      setPolicyAuditReason(event.target.value)
                    }
                    required
                    value={policyAuditReason}
                  />
                  <p
                    className="text-muted-foreground text-xs"
                    id="lender-policy-audit-reason-hint"
                  >
                    Required. Explain why this workflow policy is changing.
                  </p>
                </div>
                <Button
                  disabled={!policyAuditReason.trim()}
                  onClick={() => {
                    const reason = policyAuditReason.trim();
                    if (!reason) {
                      return;
                    }
                    run(async () => {
                      await onUpdatePermissions({
                        lenderOrganizationId: selectedOrganization.id,
                        permissions: permissionDraft,
                        reason,
                      });
                      setPolicyAuditReason("");
                    }, "Workflow policy saved");
                  }}
                  size="sm"
                >
                  Save policy
                </Button>
              </section>

              <Separator />

              <LenderOrganizationDefaultReviewPolicyPanel
                lenderOrganizationId={selectedOrganization.id}
              />

              <Separator />

              <section className="space-y-3">
                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      run(
                        () =>
                          onReconcileAssignments({
                            lenderOrganizationId: selectedOrganization.id,
                          }),
                        "Organization assignments reconciled"
                      )
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <RefreshCw />
                    Reconcile WorkOS projection
                  </Button>
                </div>
                {reconciliation?.lenderOrganizationId ===
                selectedOrganization.id ? (
                  <WorkosReconciliationNotice
                    onRetry={onRetryReconciliation}
                    state={reconciliation}
                  />
                ) : null}
                <LenderOrganizationManagementVariantE
                  activeMemberCount={directoryUsers.length}
                  administrationContext="Back Office Admin"
                  directoryUsers={directoryUsers}
                  headingLevel={2}
                  mode="production"
                  onOpenOperation={onOpenOperation}
                  onOpenUser={onOpenUser}
                  organizationName={selectedOrganization.displayName}
                  organizationsById={organizationsById}
                  pending={members === undefined}
                  pendingMemberCount={members?.pendingInvitations.length ?? 0}
                  pendingMembers={members?.pendingInvitations ?? []}
                  provisioningByOrg={provisioningByOrg}
                />
                {memberPage.status === "CanLoadMore" ||
                memberPage.status === "LoadingMore" ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <p className="text-muted-foreground text-xs">
                      Counts include loaded members.
                    </p>
                    <Button
                      disabled={memberPage.status === "LoadingMore"}
                      onClick={() => memberPage.loadMore(25)}
                      variant="outline"
                    >
                      {memberPage.status === "LoadingMore"
                        ? "Loading members…"
                        : "Load more members"}
                    </Button>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function LenderOrganizationDefaultReviewPolicyPanel({
  lenderOrganizationId,
}: {
  lenderOrganizationId: LenderOrganizationId;
}) {
  const defaultReviewPolicy = useQuery(
    api.lenderOrganizationReviewPolicies
      .getLenderOrganizationDefaultReviewPolicy,
    { lenderOrganizationId }
  );
  const saveDefaultReviewPolicy = useMutation(
    api.lenderOrganizationReviewPolicies
      .saveLenderOrganizationDefaultReviewPolicy
  );

  if (defaultReviewPolicy === undefined) {
    return (
      <Frame aria-busy="true" aria-label="Loading default review requirements">
        <FramePanel className="p-5 text-muted-foreground text-sm">
          Loading default review requirements…
        </FramePanel>
      </Frame>
    );
  }

  return (
    <LenderOrganizationDefaultReviewPolicy
      defaultReviewPolicy={defaultReviewPolicy}
      key={`${lenderOrganizationId}:${defaultReviewPolicy.version ?? "baseline"}`}
      onSave={(command) =>
        saveDefaultReviewPolicy({
          ...command,
          lenderOrganizationId,
        })
      }
    />
  );
}

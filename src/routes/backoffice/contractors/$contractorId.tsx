import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { ContractorDetailSurface } from "#/features/contractors/ContractorDetailSurface.tsx";
import type { ContractorProfileDraft } from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  getVisualContractorDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";
import {
  buildWorkosUserOptions,
  VISUAL_WORKOS_USER_OPTIONS,
} from "#/features/contractors/WorkosUserAutocomplete.tsx";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/backoffice/contractors/$contractorId")({
  staticData: {
    breadcrumb: {
      label: "Contractor detail",
      to: "/backoffice/contractors",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { contractorId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveDetail = useQuery(
    contractorApi.getContractorDetail,
    visualFixture
      ? "skip"
      : {
          contractorId: contractorId as Id<"contractorProfiles">,
          workosOrganizationId,
        }
  );
  const detail = visualFixture
    ? getVisualContractorDetail(contractorId)
    : liveDetail;
  const workosProjection = useQuery(
    api.workosProjection.listUserManagement,
    visualFixture ? "skip" : {}
  );
  const workosUserOptions = visualFixture
    ? VISUAL_WORKOS_USER_OPTIONS
    : buildWorkosUserOptions(workosProjection, workosOrganizationId);
  const linkAccount = useMutation(
    contractorApi.linkContractorProfileToWorkosUser
  );
  const updateProfile = useMutation(contractorApi.updateContractorProfile);
  const setStatus = useMutation(contractorApi.setContractorProfileStatus);
  const [workosUserId, setWorkosUserId] = useState("");
  const [pendingLink, setPendingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [pendingManage, setPendingManage] = useState(false);
  const [manageError, setManageError] = useState("");
  const [pendingIdentity, setPendingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState("");

  const onboardingApi = (api as any).contractorOnboarding;
  const mergeApi = (api as any).contractorMerge;
  const sendInvite = useMutation(onboardingApi.sendContractorProfileInvite);
  const revokeInvite = useMutation(onboardingApi.revokeContractorProfileInvite);
  const deactivateProfile = useMutation(mergeApi.deactivateContractorProfile);
  const unlinkAccount = useMutation(mergeApi.unlinkContractorAccount);
  const mergeProfiles = useMutation(mergeApi.mergeContractorProfiles);
  const duplicateHints = useQuery(
    mergeApi.listContractorDuplicateHints,
    visualFixture
      ? "skip"
      : {
          contractorId: contractorId as Id<"contractorProfiles">,
          workosOrganizationId,
        }
  );
  const [mergeTargetId, setMergeTargetId] = useState("");

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame>
          <FramePanel className="p-5 text-sm">Loading contractor...</FramePanel>
        </Frame>
      </main>
    );
  }

  const submitLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workosUserId.trim()) {
      return;
    }
    setPendingLink(true);
    setLinkError("");
    try {
      await linkAccount({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
        workosUserId: workosUserId.trim(),
      });
      setWorkosUserId("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingLink(false);
    }
  };

  const saveProfile = async (contractor: ContractorProfileDraft) => {
    setPendingManage(true);
    setManageError("");
    try {
      await updateProfile({
        ...contractor,
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
      });
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setPendingManage(false);
    }
  };

  const updateStatus = async (status: "active" | "inactive") => {
    setPendingManage(true);
    setManageError("");
    try {
      await setStatus({
        contractorId: contractorId as Id<"contractorProfiles">,
        reason:
          status === "inactive"
            ? "Profile deactivated from contractor detail."
            : "Profile reactivated from contractor detail.",
        status,
        workosOrganizationId,
      });
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingManage(false);
    }
  };

  const onSendInvite = async () => {
    setPendingIdentity(true);
    setIdentityError("");
    try {
      await sendInvite({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
      });
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingIdentity(false);
    }
  };

  const onDeactivate = async () => {
    setPendingIdentity(true);
    setIdentityError("");
    try {
      await deactivateProfile({
        contractorId: contractorId as Id<"contractorProfiles">,
        reason: "Deactivated from backoffice contractor detail.",
        workosOrganizationId,
      });
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingIdentity(false);
    }
  };

  const onUnlink = async () => {
    setPendingIdentity(true);
    setIdentityError("");
    try {
      await unlinkAccount({
        contractorId: contractorId as Id<"contractorProfiles">,
        reason: "Unlinked from backoffice contractor detail.",
        workosOrganizationId,
      });
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingIdentity(false);
    }
  };

  const onMerge = async () => {
    const target = mergeTargetId.trim();
    if (!target) {
      return;
    }
    setPendingIdentity(true);
    setIdentityError("");
    try {
      // Merge the current profile INTO the chosen canonical target. The target
      // survives; the current profile is preserved as an alias (PRD §6.3).
      await mergeProfiles({
        canonicalContractorId: target as Id<"contractorProfiles">,
        loserContractorIds: [contractorId as Id<"contractorProfiles">],
        reason: "Resolved duplicate from backoffice contractor detail.",
        workosOrganizationId,
      });
      setMergeTargetId("");
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingIdentity(false);
    }
  };

  void revokeInvite;

  return (
    <>
      <ContractorDetailSurface
        accountLink={{
          error: linkError,
          onSubmit: submitLink,
          onWorkosUserIdChange: setWorkosUserId,
          pending: pendingLink,
          workosUserId,
          workosUserOptions,
        }}
        backHref="/backoffice/contractors"
        backLabel="Contractors"
        buildHrefForWorkHistory={(row) => `/backoffice/builds/${row.buildId}`}
        detail={detail}
        management={{
          error: manageError,
          onSaveProfile: saveProfile,
          onSetStatus: updateStatus,
          pending: pendingManage,
        }}
      />
      {!visualFixture && (
        <main className="bg-muted/30 px-4 pb-10 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            <Frame>
              <FramePanel className="flex flex-col gap-4 p-4 sm:p-5">
                <div>
                  <h2 className="font-semibold text-sm">Identity operations</h2>
                  <p className="text-muted-foreground text-xs">
                    Reviewed actions only — invite, merge, deactivate, and unlink
                    are audited (PRD §11.3).
                  </p>
                </div>
                {identityError ? (
                  <p className="text-destructive text-xs">{identityError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pendingIdentity}
                    onClick={onSendInvite}
                    size="sm"
                    type="button"
                  >
                    Send invite
                  </Button>
                  <Button
                    disabled={pendingIdentity}
                    onClick={onDeactivate}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Deactivate
                  </Button>
                  <Button
                    disabled={pendingIdentity}
                    onClick={onUnlink}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Unlink account
                  </Button>
                </div>

                <div className="border-t pt-3">
                  <h3 className="font-medium text-sm">
                    Resolve duplicate (merge into canonical)
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Merge this profile into another canonical profile. The
                    canonical survives; this profile is preserved as an alias and
                    its assignments migrate.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="border-input bg-background min-w-[16rem] flex-1 rounded-md border px-3 py-1.5 text-sm"
                      onChange={(e) => setMergeTargetId(e.target.value)}
                      placeholder="Canonical contractor id"
                      value={mergeTargetId}
                    />
                    <Button
                      disabled={pendingIdentity || !mergeTargetId.trim()}
                      onClick={onMerge}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Merge
                    </Button>
                  </div>
                </div>

                {!visualFixture && duplicateHints?.hints?.length ? (
                  <div className="border-t pt-3">
                    <h3 className="font-medium text-sm">Duplicate hints</h3>
                    <ul className="mt-1 flex flex-col gap-1">
                      {duplicateHints.hints.map((hint: any) => (
                        <li
                          key={hint.contractorId}
                          className="text-muted-foreground text-xs"
                        >
                          {hint.name} — {hint.kind} match (
                          {hint.confidence})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </FramePanel>
            </Frame>
          </div>
        </main>
      )}
    </>
  );
}

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

  return (
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
  );
}

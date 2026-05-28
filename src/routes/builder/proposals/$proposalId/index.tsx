import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
  ProductionProposalDraftEditorSurface,
  ProductionProposalPackageSurface,
  type ProductionProposalDraftSavePayload,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityProposalDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  component: BuilderProductionProposalRoute,
});

function BuilderProductionProposalRoute() {
  const { proposalId } = Route.useParams();
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const typedProposalId = proposalId as Id<"buildProposals">;
  const detailQuery = useQuery(
    api.production_proposals.getProposalDetail,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        },
  );
  const detail = visualFixtureEnabled
    ? getVisualParityProposalDetail()
    : detailQuery;
  const saveDraft = useMutation(
    api.production_proposals.saveDraftProposalPackage,
  );
  const generateDocumentUploadUrl = useMutation(
    api.production_proposals.generateProposalDocumentUploadUrl,
  );
  const submit = useMutation(api.production_proposals.submitProposal);

  if (!detail) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production proposal...
        </div>
      </div>
    );
  }

  if (detail.proposal.status === "draft") {
    return (
      <ProductionProposalDraftEditorSurface
        detail={detail}
        onSave={(payload: ProductionProposalDraftSavePayload) =>
          void saveDraft({
            ...payload,
            documents: payload.documents?.map((document) => ({
              ...document,
              storageId: document.storageId as Id<"_storage"> | undefined,
            })),
            proposalId: typedProposalId,
            workosOrganizationId,
          })
        }
        onSubmit={() =>
          void submit({ proposalId: typedProposalId, workosOrganizationId })
        }
        onUploadDocument={async (file) => {
          const uploadUrl = await generateDocumentUploadUrl({
            proposalId: typedProposalId,
            workosOrganizationId,
          });
          const response = await fetch(uploadUrl, {
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            method: "POST",
          });
          if (!response.ok) {
            throw new Error("Document upload failed.");
          }
          const { storageId } = (await response.json()) as {
            storageId: string;
          };
          return { storageId };
        }}
      />
    );
  }

  return (
    <ProductionProposalPackageSurface
      action={
        <Button
          onClick={() =>
            void navigate({
              params: { proposalId },
              to: "/builder/proposals/$proposalId/roadmap",
            })
          }
          size="sm"
          variant="outline"
        >
          Roadmap
        </Button>
      }
      detail={detail}
      onSubmit={() =>
        void submit({ proposalId: typedProposalId, workosOrganizationId })
      }
    />
  );
}

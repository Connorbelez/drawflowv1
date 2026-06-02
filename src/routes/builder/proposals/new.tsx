import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  PRODUCTION_SETUP_BASE_ITEMS,
  productionTemplatesToTimelineSetupTemplates,
  timelineSetupResultToDraftPackage,
} from "#/features/production-proposals/timelineSetupAdapter.ts";
import {
  getVisualParityCreateContext,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import {
  TimelineSetupFlow,
  type TimelineSetupResult,
} from "#/features/timeline-workspace/-TimelineSetupFlow.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/builder/proposals/new")({
  ssr: false,
  component: NewProductionProposalRoute,
});

function NewProductionProposalRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const createContextQuery = useQuery(
    api.production_proposals.getBuilderProposalCreateContext,
    visualFixtureEnabled ? "skip" : { workosOrganizationId }
  );
  const createContext = visualFixtureEnabled
    ? getVisualParityCreateContext()
    : createContextQuery;
  const createDraft = useMutation(api.production_proposals.createDraftProposal);
  const saveDraft = useMutation(
    api.production_proposals.saveDraftProposalPackage
  );
  const generateDocumentUploadUrl = useMutation(
    api.production_proposals.generateProposalDocumentUploadUrl
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const setupTemplates = useMemo(
    () => productionTemplatesToTimelineSetupTemplates(createContext?.templates),
    [createContext?.templates]
  );

  async function createProductionProposal(result: TimelineSetupResult) {
    if (!createContext) {
      setError("Proposal workspace is still loading. Try again in a moment.");
      return;
    }

    setIsCreating(true);
    setError("");
    try {
      const packagePayload = timelineSetupResultToDraftPackage(result);
      const proposalId = await createDraft({
        brokerageId: createContext.brokerage._id,
        builderProfileId: createContext.builderProfile._id,
        buildName: packagePayload.buildName,
        location: packagePayload.location,
        workosOrganizationId,
      });
      const uploadedPermitDocuments = await Promise.all(
        result.permitFiles.map(async (file) => {
          const uploadUrl = await generateDocumentUploadUrl({
            proposalId,
            workosOrganizationId,
          });
          const response = await fetch(uploadUrl, {
            body: file,
            headers: {
              "Content-Type": file.type || "application/pdf",
            },
            method: "POST",
          });
          if (!response.ok) {
            throw new Error(`Permit upload failed for ${file.name}.`);
          }
          const { storageId } = (await response.json()) as {
            storageId: string;
          };
          return {
            documentType: "permit" as const,
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
            storageId,
          };
        })
      );
      await saveDraft({
        ...packagePayload,
        documents: [
          ...(packagePayload.documents ?? []),
          ...uploadedPermitDocuments,
        ],
        proposalId,
        workosOrganizationId,
      });
      await navigate({
        params: { proposalId },
        to: result.redirectToDurableRoute
          ? "/builder/proposals/$proposalId/roadmap"
          : "/builder/proposals/$proposalId",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Production proposal creation failed."
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
      {isCreating || error ? (
        <Frame className="mx-auto mt-3 w-[min(96vw,1120px)]">
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <Badge variant={error ? "destructive" : "outline"}>
                {error ? "Needs attention" : "Saving production proposal"}
              </Badge>
              <span className="text-muted-foreground text-sm">
                {error ||
                  "Persisting the setup worksheet into production proposal tables."}
              </span>
            </div>
            {isCreating ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Button onClick={() => setError("")} size="sm" variant="outline">
                Dismiss
              </Button>
            )}
          </FramePanel>
        </Frame>
      ) : null}
      <TimelineSetupFlow
        baseItems={PRODUCTION_SETUP_BASE_ITEMS}
        contractorOptions={createContext?.availableContractors ?? []}
        onComplete={(result) => void createProductionProposal(result)}
        settingsTemplates={setupTemplates}
      />
    </>
  );
}

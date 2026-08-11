"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import {
  type SubmilestoneFieldGuidance,
  SubmilestoneFieldGuidanceEditor,
} from "./SubmilestoneFieldGuidanceEditor.tsx";

interface FieldGuidanceQueryResult {
  guidance:
    | (SubmilestoneFieldGuidance & {
        _id: string;
        proposalSubmilestoneId: string;
        updatedAt: number;
      })
    | null;
  readiness: {
    missingSections: Array<"whatToVerify" | "cameraAngles">;
    readyForSiteVisit: boolean;
  };
}

export interface ActiveBuildSubmilestoneGuidanceControllerProps {
  buildSubmilestoneId: string;
  onDirtyChange?: (dirty: boolean) => void;
  proposalSubmilestoneId?: string;
  readOnly?: boolean;
  rowName?: string;
  subMilestoneName: string;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId?: string;
}

const BACKOFFICE_CAPACITIES = new Set<BuildCollaborationRole>([
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
]);

function canReadGuidance(viewerCapacity?: BuildCollaborationRole) {
  // A missing capacity is not an authenticated audience. Require the route
  // adapter to resolve one explicitly before reading canonical Guidance.
  return viewerCapacity !== undefined && viewerCapacity !== "homeowner";
}

function canEditGuidance(
  viewerCapacity: BuildCollaborationRole | undefined,
  readOnly: boolean
) {
  return (
    !readOnly &&
    Boolean(viewerCapacity && BACKOFFICE_CAPACITIES.has(viewerCapacity))
  );
}

/**
 * Reads canonical Field Guidance through the Proposal Sub-milestone lineage.
 * Active Build route/capacity policy is kept here; the reusable editor only
 * owns local dirty/save state and never infers viewer roles.
 */
export function ActiveBuildSubmilestoneGuidanceController({
  buildSubmilestoneId,
  onDirtyChange,
  proposalSubmilestoneId,
  readOnly = false,
  rowName,
  subMilestoneName,
  viewerCapacity,
  workosOrganizationId,
}: ActiveBuildSubmilestoneGuidanceControllerProps) {
  const canRead =
    canReadGuidance(viewerCapacity) &&
    Boolean(proposalSubmilestoneId && workosOrganizationId);
  const queryResult = useQuery(
    api.submilestone_field_guidance.getSubmilestoneFieldGuidance,
    canRead
      ? {
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          workosOrganizationId: workosOrganizationId as string,
        }
      : "skip"
  ) as FieldGuidanceQueryResult | null | undefined;
  const saveGuidance = useMutation(
    api.submilestone_field_guidance.saveSubmilestoneFieldGuidance
  );
  const editable = canEditGuidance(viewerCapacity, readOnly) && canRead;

  useEffect(() => {
    if (!canRead) {
      onDirtyChange?.(false);
    }
  }, [canRead, onDirtyChange]);

  if (!canRead) {
    return null;
  }
  if (queryResult == null) {
    return (
      <Frame
        data-testid={`active-build-field-guidance-loading-${buildSubmilestoneId}`}
      >
        <FramePanel>
          <p className="text-muted-foreground text-sm">
            Loading Field Guidance…
          </p>
        </FramePanel>
      </Frame>
    );
  }

  const onSave = editable
    ? async (guidance: SubmilestoneFieldGuidance) => {
        await saveGuidance({
          cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
          workosOrganizationId: workosOrganizationId as string,
        });
      }
    : undefined;

  return (
    <SubmilestoneFieldGuidanceEditor
      canEdit={editable}
      guidance={queryResult.guidance}
      id={buildSubmilestoneId}
      onDirtyChange={onDirtyChange}
      onSave={onSave}
      readOnly={readOnly || !editable}
      rowName={rowName}
      sectionTestId={`active-build-submilestone-guidance-${buildSubmilestoneId}`}
      subMilestoneName={subMilestoneName}
      testIdPrefix="active-build-submilestone"
    />
  );
}

export { canEditGuidance, canReadGuidance };

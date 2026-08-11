import { useEffect, useMemo, useRef, useState } from "react";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type { MaterialPlanningActions } from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  TimelineMilestoneWorksheetTable,
  type TimelineScheduleDisplayMode,
  type WorksheetContractorActions,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import type { ScopeRevisionSurfaceRoute } from "../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx";

import {
  contractorOptionsFromPlanning,
  type ProductionProposalWorksheetDetail,
  productionProposalDetailToWorksheetRows,
} from "./productionMilestoneWorksheetAdapter.ts";

export const PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS = 600;

export function ProductionProposalMilestoneWorksheet({
  contractorActions,
  contractorPlanning,
  detail,
  footerExtra,
  materialPlanningActions,
  onPersistRows,
  scopeRoute,
  scopeWorkosOrganizationId,
  showHeading = false,
  templateTitle,
}: {
  contractorActions?: WorksheetContractorActions;
  contractorPlanning?: ContractorPlanningModel | null;
  detail: ProductionProposalWorksheetDetail;
  footerExtra?: React.ReactNode;
  materialPlanningActions?: MaterialPlanningActions;
  onPersistRows?: (
    rows: TimelineMilestoneWorksheetRow[]
  ) => void | Promise<void>;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  showHeading?: boolean;
  templateTitle: string;
}) {
  const contractorOptions = useMemo(
    () => contractorOptionsFromPlanning(contractorPlanning),
    [contractorPlanning]
  );
  const projectedRows = useMemo(
    () => productionProposalDetailToWorksheetRows(detail, contractorPlanning),
    [contractorPlanning, detail]
  );
  const projectedSignature = useMemo(
    () => JSON.stringify(projectedRows),
    [projectedRows]
  );
  const lastAppliedSignatureRef = useRef("");
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRowsRef = useRef<TimelineMilestoneWorksheetRow[] | null>(null);
  const [rows, setRows] = useState(projectedRows);
  const proposedStartDate = detail.proposal.proposedStartDate;
  const [scheduleDisplayMode, setScheduleDisplayMode] =
    useState<TimelineScheduleDisplayMode>(
      proposedStartDate ? "dates" : "tOffsets"
    );
  const [cascadeBudgetEdits, setCascadeBudgetEdits] = useState(false);

  useEffect(() => {
    if (lastAppliedSignatureRef.current === projectedSignature) {
      return;
    }
    lastAppliedSignatureRef.current = projectedSignature;
    setRows(projectedRows);
  }, [projectedRows, projectedSignature]);

  useEffect(
    () => () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    },
    []
  );

  const handleRowsChange = (
    nextRows: TimelineMilestoneWorksheetRow[],
    meta: TimelineMilestoneWorksheetRowsChangeMeta = { commit: true }
  ): void | Promise<void> => {
    setRows(nextRows);
    pendingRowsRef.current = nextRows;

    if (!onPersistRows || meta.commit === false) {
      return;
    }

    if (meta.save) {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
      return Promise.resolve(onPersistRows(nextRows)).then(() => {
        if (pendingRowsRef.current === nextRows) {
          pendingRowsRef.current = null;
        }
      });
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      const pendingRows = pendingRowsRef.current;
      if (!pendingRows) {
        return;
      }
      try {
        Promise.resolve(onPersistRows(pendingRows)).catch(() => undefined);
      } catch {
        // The callback normally returns a Promise; swallow sync failures too.
      }
    }, PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS);
  };

  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeBudgetEdits}
      contractorActions={contractorActions}
      contractorOptions={contractorOptions}
      footerExtra={footerExtra}
      materialPlanningActions={materialPlanningActions}
      mode="setup"
      onCascadeBudgetEditsChange={setCascadeBudgetEdits}
      onRowsChange={handleRowsChange}
      onScheduleDisplayModeChange={setScheduleDisplayMode}
      proposalSubmittedAt={detail.proposal.submittedAt}
      proposedStartDate={proposedStartDate}
      rows={rows}
      scheduleDisplayMode={scheduleDisplayMode}
      scopeRoute={scopeRoute}
      scopeWorkosOrganizationId={scopeWorkosOrganizationId}
      showHeading={showHeading}
      templateTitle={templateTitle}
    />
  );
}

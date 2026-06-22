import {
  TimelineMilestoneWorksheetTable,
  type TimelineScheduleDisplayMode,
  type TimelineMilestoneWorksheetRow,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";

import {
  contractorOptionsFromPlanning,
  productionProposalDetailToWorksheetRows,
  type ProductionProposalWorksheetDetail,
} from "./productionMilestoneWorksheetAdapter.ts";

const PERSIST_DEBOUNCE_MS = 400;

export function ProductionProposalMilestoneWorksheet({
  contractorPlanning,
  detail,
  footerExtra,
  onPersistRows,
  showHeading = false,
  templateTitle,
}: {
  contractorPlanning?: ContractorPlanningModel | null;
  detail: ProductionProposalWorksheetDetail;
  footerExtra?: React.ReactNode;
  onPersistRows?: (rows: TimelineMilestoneWorksheetRow[]) => void | Promise<void>;
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

  const handleRowsChange = (nextRows: TimelineMilestoneWorksheetRow[]) => {
    setRows(nextRows);
    pendingRowsRef.current = nextRows;

    if (!onPersistRows) {
      return;
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
      void onPersistRows(pendingRows);
    }, PERSIST_DEBOUNCE_MS);
  };

  return (
    <TimelineMilestoneWorksheetTable
      contractorOptions={contractorOptions}
      footerExtra={footerExtra}
      mode="setup"
      onRowsChange={handleRowsChange}
      onScheduleDisplayModeChange={setScheduleDisplayMode}
      proposedStartDate={proposedStartDate}
      rows={rows}
      scheduleDisplayMode={scheduleDisplayMode}
      showHeading={showHeading}
      templateTitle={templateTitle}
    />
  );
}

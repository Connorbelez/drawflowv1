"use client";

import { TimelineSetupFlow as SetupFlow } from "./TimelineSetupFlowComponent.tsx";
import {
  normalizeDurationText as normalizeDuration,
  parsePercentTextToBps as parsePercent,
  resolveTimelineSetupAddress as resolveAddress,
  DEFAULT_SETUP_ADDRESS as setupAddress,
  SUB_MILESTONE_BANK as subMilestoneBank,
} from "./TimelineSetupFlowContracts.ts";
import {
  buildPlanningPayloadFromSetupRows as buildPlanningPayload,
  buildTimelineSetupScenarioDraws as buildScenarioDraws,
  fitScenarioDrawsToCompletedWorkEligibility as fitScenarioDraws,
  selectTimelineSetupScenario as selectScenario,
} from "./TimelineSetupFlowPlanning.ts";
import {
  buildTimelineItemsFromSetupRows as buildItems,
  createCustomMilestoneRow as createCustomRow,
  createRowsFromTemplate as createRows,
  formatRowType as rowTypeLabel,
  budgetWorkbookDraftToSetupRows as workbookDraftToRows,
} from "./TimelineSetupFlowTemplates.ts";

export const DEFAULT_SETUP_ADDRESS = setupAddress;
export const SUB_MILESTONE_BANK = subMilestoneBank;
export const parsePercentTextToBps = parsePercent;
export const normalizeDurationText = normalizeDuration;
export const budgetWorkbookDraftToSetupRows = workbookDraftToRows;
export const createCustomMilestoneRow = createCustomRow;
export const formatRowType = rowTypeLabel;
export const createRowsFromTemplate = createRows;
export const buildTimelineItemsFromSetupRows = buildItems;
export const selectTimelineSetupScenario = selectScenario;
export const buildTimelineSetupScenarioDraws = buildScenarioDraws;
export const fitScenarioDrawsToCompletedWorkEligibility = fitScenarioDraws;
export const buildPlanningPayloadFromSetupRows = buildPlanningPayload;
export const resolveTimelineSetupAddress = resolveAddress;
export const TimelineSetupFlow = SetupFlow;

export type {
  SubMilestoneBankItem,
  TimelineSetupBrokerOption,
  TimelineSetupContractorAssignment,
  TimelineSetupCostItem,
  TimelineSetupDrawResult,
  TimelineSetupFlowProps,
  TimelineSetupMilestoneRow,
  TimelineSetupPreset,
  TimelineSetupPresetSubMilestone,
  TimelineSetupResult,
  TimelineSetupScenario,
  TimelineSetupScenarioDraw,
  TimelineSetupSubMilestone,
  TimelineSetupTemplate,
} from "./TimelineSetupFlowContracts.ts";

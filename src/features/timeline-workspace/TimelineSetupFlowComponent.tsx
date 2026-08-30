"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  isValidIsoDateOnly,
  todayIsoDate,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import { parseBudgetWorkbookFile } from "#/features/proposal-import/budget-workbook-schema.ts";
import type { GoogleAddressPlaceDetails } from "#/lib/google-maps.ts";
import type {
  TimelineMilestoneWorksheetRowsChangeMeta,
  TimelineScheduleDisplayMode,
} from "./-TimelineMilestoneWorksheetTable.tsx";
import {
  getReimbursementBps,
  TOTAL_REIMBURSEMENT_BPS,
} from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_SETUP_ADDRESS,
  DEFAULT_SETUP_BUDGET_TEXT,
  DEFAULT_SETUP_CASH_TEXT,
  DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT,
  formatBpsPercent,
  GENERATED_TIMELINE_CURRENT_DAY,
  resolveTimelineSetupAddress,
  rowBudgetCents,
  rowDurationDays,
  setupRowsBudgetCents,
  validCurrencyCents,
  validPercentBps,
  type SetupStep,
  type TimelineSetupFlowProps,
  type TimelineSetupMilestoneRow,
  type TimelineSetupTemplate,
} from "./TimelineSetupFlowContracts.ts";
import {
  buildPlanningPayloadFromSetupRows,
  buildTimelineSetupScenarioDraws,
  selectTimelineSetupScenario,
} from "./TimelineSetupFlowPlanning.ts";
import {
  BudgetStep,
  CornerMarker,
  TemplateStep,
} from "./TimelineSetupFlowPresentation.tsx";
import {
  budgetWorkbookDraftToSetupRows,
  buildDefaultTemplate,
  buildTimelineItemsFromSetupRows,
  createRowsFromTemplate,
  secondaryTemplates,
} from "./TimelineSetupFlowTemplates.ts";
import "./-timeline-setup-flow.css";

import { useTimelineSetupAssistant } from "./TimelineSetupFlowAssistant.ts";

export function TimelineSetupFlow({
  baseItems,
  brokerOptions,
  contractorActions,
  contractorOptions = [],
  defaultAssignedBrokerWorkosUserId,
  onComplete,
  settingsTemplates,
}: TimelineSetupFlowProps) {
  const reducedMotion = useReducedMotion();
  const templates = useMemo(
    () =>
      settingsTemplates && settingsTemplates.length > 0
        ? settingsTemplates
        : [buildDefaultTemplate(baseItems), ...secondaryTemplates()],
    [baseItems, settingsTemplates]
  );
  const defaultTemplate =
    templates.find((template) => template.isDefault) ?? templates[0];
  const [step, setStep] = useState<SetupStep>("template");
  const [assignedBrokerWorkosUserId, setAssignedBrokerWorkosUserId] = useState(
    defaultAssignedBrokerWorkosUserId ?? ""
  );
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(
    defaultTemplate?.templateKey ?? ""
  );
  const [budgetText, setBudgetText] = useState(DEFAULT_SETUP_BUDGET_TEXT);
  const [cashText, setCashText] = useState(DEFAULT_SETUP_CASH_TEXT);
  const [loanPercentageText, setLoanPercentageText] = useState(
    DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT
  );
  const [proposedStartDate, setProposedStartDate] = useState(todayIsoDate);
  const [scheduleDisplayMode, setScheduleDisplayMode] =
    useState<TimelineScheduleDisplayMode>("dates");
  const [cascadeBudgetEdits, setCascadeBudgetEdits] = useState(false);
  const [projectAddress, setProjectAddress] = useState(DEFAULT_SETUP_ADDRESS);
  const [projectAddressPlace, setProjectAddressPlace] =
    useState<GoogleAddressPlaceDetails | null>(null);
  const [permitFiles, setPermitFiles] = useState<File[]>([]);
  const [permitsSkipped, setPermitsSkipped] = useState(false);
  const [importedBudgetTitle, setImportedBudgetTitle] = useState("");
  const [rows, setRows] = useState<TimelineSetupMilestoneRow[]>(() =>
    defaultTemplate
      ? createRowsFromTemplate(
          defaultTemplate,
          parseCurrencyToCents(DEFAULT_SETUP_BUDGET_TEXT)
        )
      : []
  );
  const [error, setError] = useState("");
  const [assistantNotice, setAssistantNotice] = useState("");
  const selectedTemplate =
    templates.find(
      (template) => template.templateKey === selectedTemplateKey
    ) ?? defaultTemplate;

  useEffect(() => {
    if (
      defaultTemplate &&
      !templates.some(
        (template) => template.templateKey === selectedTemplateKey
      )
    ) {
      setSelectedTemplateKey(defaultTemplate.templateKey);
      setRows(
        createRowsFromTemplate(
          defaultTemplate,
          parseCurrencyToCents(DEFAULT_SETUP_BUDGET_TEXT)
        )
      );
    }
  }, [defaultTemplate, selectedTemplateKey, templates]);

  useEffect(() => {
    if (!brokerOptions) {
      return;
    }
    setAssignedBrokerWorkosUserId((current) => {
      if (brokerOptions.some((broker) => broker.workosUserId === current)) {
        return current;
      }
      return brokerOptions.some(
        (broker) =>
          broker.workosUserId === defaultAssignedBrokerWorkosUserId &&
          broker.isPrincipal
      )
        ? (defaultAssignedBrokerWorkosUserId ?? "")
        : "";
    });
  }, [brokerOptions, defaultAssignedBrokerWorkosUserId]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, []);

  const regenerateRows = (
    template: TimelineSetupTemplate,
    nextBudgetText: string
  ) => {
    const budgetCents = parseCurrencyToCents(nextBudgetText);

    if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
      setError("Enter a positive total project budget before generating rows.");
      return false;
    }

    setRows(createRowsFromTemplate(template, budgetCents));
    setError("");
    return true;
  };

  const continueToBudget = () => {
    if (!selectedTemplate) {
      setError("Select a construction template.");
      return;
    }

    if (
      brokerOptions &&
      !brokerOptions.some(
        (broker) => broker.workosUserId === assignedBrokerWorkosUserId
      )
    ) {
      setError(
        brokerOptions.length === 0
          ? "No active broker is available for this organization."
          : "Select an assigned broker before continuing."
      );
      return;
    }

    const budgetCents = validCurrencyCents(budgetText);
    const cashCents = validCurrencyCents(cashText);
    const loanPercentageBps = validPercentBps(loanPercentageText);

    if (!(Number.isFinite(budgetCents) && budgetCents > 0)) {
      setError("Enter a positive total project budget.");
      return;
    }

    if (!(Number.isFinite(cashCents) && cashCents > 0)) {
      setError("Enter a positive borrower starting cash amount.");
      return;
    }

    if (
      !(
        Number.isFinite(loanPercentageBps) &&
        loanPercentageBps >= 0 &&
        loanPercentageBps <= TOTAL_REIMBURSEMENT_BPS
      )
    ) {
      setError("Enter a Loan Percentage between 0% and 100%.");
      return;
    }

    if (!isValidIsoDateOnly(proposedStartDate)) {
      setError("Enter a proposed start date before continuing.");
      return;
    }

    if (regenerateRows(selectedTemplate, budgetText)) {
      setStep("budget");
    }
  };

  const completeSetup = ({
    redirectToDurableRoute,
  }: {
    redirectToDurableRoute: boolean;
  }) => {
    const invalidRow = rows.find((row) => {
      const budget = rowBudgetCents(row);
      const duration = rowDurationDays(row);

      return !(
        row.excluded ||
        (Number.isFinite(budget) &&
          budget > 0 &&
          Number.isFinite(duration) &&
          duration > 0)
      );
    });
    const cashCents = validCurrencyCents(cashText);
    const loanPercentageBps = validPercentBps(loanPercentageText);

    if (!rows.some((row) => !row.excluded)) {
      setError("Keep at least one milestone active.");
      return;
    }

    if (invalidRow) {
      setError(`${invalidRow.name} needs a positive budget and duration.`);
      return;
    }

    if (!(Number.isFinite(cashCents) && cashCents > 0)) {
      setError("Enter positive borrower starting cash.");
      return;
    }

    if (
      !(
        Number.isFinite(loanPercentageBps) &&
        loanPercentageBps >= 0 &&
        loanPercentageBps <= TOTAL_REIMBURSEMENT_BPS
      )
    ) {
      setError("Enter a Loan Percentage between 0% and 100%.");
      return;
    }

    if (!isValidIsoDateOnly(proposedStartDate)) {
      setError("Enter a proposed start date before generating a timeline.");
      return;
    }

    const budgetCents = setupRowsBudgetCents(rows);
    const totalBudget = rows
      .filter((row) => !row.excluded)
      .reduce((sum, row) => sum + Math.round(rowBudgetCents(row) / 100), 0);
    const borrowerCoPayBps =
      TOTAL_REIMBURSEMENT_BPS -
      Math.min(
        TOTAL_REIMBURSEMENT_BPS,
        Math.max(0, Math.round(loanPercentageBps))
      );
    const reimbursementBps = getReimbursementBps(borrowerCoPayBps);
    const borrowerCoPayCents = Math.round(
      (budgetCents * borrowerCoPayBps) / TOTAL_REIMBURSEMENT_BPS
    );
    const reimbursableBudgetCents = Math.round(
      (budgetCents * reimbursementBps) / TOTAL_REIMBURSEMENT_BPS
    );
    const items = buildTimelineItemsFromSetupRows(rows, borrowerCoPayBps);
    const scenarioDraws = buildTimelineSetupScenarioDraws({
      budgetCents,
      items,
      scenario: selectTimelineSetupScenario(selectedTemplate),
      startingCashCents: Math.round(cashCents),
    });
    const planningPayload = buildPlanningPayloadFromSetupRows(rows);
    const activeItem = items[0];

    setError("");
    onComplete({
      activeItemId: activeItem?.id ?? "",
      ...(assignedBrokerWorkosUserId ? { assignedBrokerWorkosUserId } : {}),
      borrowerCoPayBps,
      borrowerCoPayCents,
      contractorAssignments: planningPayload.contractorAssignments,
      currentDay: GENERATED_TIMELINE_CURRENT_DAY,
      draws: scenarioDraws,
      includedCount: items.length,
      items,
      permitFiles,
      costItems: planningPayload.costItems,
      projectAddress: resolveTimelineSetupAddress(projectAddress),
      ...(projectAddressPlace
        ? {
            projectAddressLatitude: projectAddressPlace.latitude,
            projectAddressLongitude: projectAddressPlace.longitude,
            projectAddressPlaceId: projectAddressPlace.placeId,
          }
        : {}),
      proposedStartDate,
      redirectToDurableRoute,
      reimbursableBudgetCents,
      reimbursementBps,
      startingCash: Math.round(cashCents / 100),
      templateKey: selectedTemplate?.templateKey ?? "",
      templateTitle:
        importedBudgetTitle || selectedTemplate?.title || "Timeline plan",
      totalBudget,
    });
  };

  const selectTemplate = useCallback(
    (templateKey: string) => {
      setSelectedTemplateKey(templateKey);
      setImportedBudgetTitle("");
      const nextTemplate = templates.find(
        (template) => template.templateKey === templateKey
      );

      if (nextTemplate) {
        regenerateRows(nextTemplate, budgetText);
      }
    },
    [budgetText, templates]
  );

  useTimelineSetupAssistant({
    budgetText,
    continueToBudget,
    selectTemplate,
    settingsTemplates,
    templates,
    setAssistantNotice,
    setBudgetText,
    setCascadeBudgetEdits,
    setCashText,
    setError,
    setLoanPercentageText,
    setPermitsSkipped,
    setProjectAddress,
    setProjectAddressPlace,
    setProposedStartDate,
    setRows,
    setStep,
  });

  const importBudgetFile = async (file: File) => {
    const draft = await parseBudgetWorkbookFile(file);
    const totalBudgetCents = Math.round(draft.totalBudget * 100);
    const loanPercentageBps = Math.min(
      TOTAL_REIMBURSEMENT_BPS,
      Math.max(
        0,
        Math.round(
          (draft.totalDrawableAmount / Math.max(1, draft.totalBudget)) *
            TOTAL_REIMBURSEMENT_BPS
        )
      )
    );

    setBudgetText(formatCurrency(totalBudgetCents));
    setLoanPercentageText(formatBpsPercent(loanPercentageBps));
    setImportedBudgetTitle(draft.buildName);
    setRows(budgetWorkbookDraftToSetupRows(draft));
    setError("");

    return draft;
  };

  return (
    <div className="timeline-setup-shell">
      <CornerMarker position="top-left" />
      <CornerMarker position="top-right" />
      <CornerMarker position="bottom-left" />
      <CornerMarker position="bottom-right" />
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="timeline-setup-frame"
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        transition={{
          duration: reducedMotion ? 0 : 0.32,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <header className="timeline-setup-header">
          <div>
            <span>DrawFlow timeline setup</span>
            <strong>Reimbursement roadmap generator</strong>
          </div>
          <span>Saved</span>
        </header>

        {step === "template" ? (
          <TemplateStep
            assignedBrokerWorkosUserId={assignedBrokerWorkosUserId}
            assistantNotice={assistantNotice}
            brokerOptions={brokerOptions}
            budgetText={budgetText}
            cashText={cashText}
            error={error}
            loanPercentageText={loanPercentageText}
            onAssignedBrokerChange={(workosUserId) => {
              setAssignedBrokerWorkosUserId(workosUserId);
              setError("");
            }}
            onBudgetTextChange={(value) => {
              setBudgetText(value);
              setError("");
            }}
            onCashTextChange={(value) => {
              setCashText(value);
              setError("");
            }}
            onContinue={continueToBudget}
            onLoanPercentageTextChange={(value) => {
              setLoanPercentageText(value);
              setError("");
            }}
            onPermitFilesChange={setPermitFiles}
            onPermitSkipChange={setPermitsSkipped}
            onProjectAddressChange={(value) => {
              setProjectAddress(value);
              setProjectAddressPlace(null);
            }}
            onProjectPlaceSelect={(details) => {
              setProjectAddressPlace(details);
              if (details) {
                setProjectAddress(details.formattedAddress);
              }
            }}
            onProposedStartDateChange={(value) => {
              setProposedStartDate(value);
              setError("");
            }}
            onTemplateSelect={selectTemplate}
            permitFiles={permitFiles}
            permitsSkipped={permitsSkipped}
            projectAddress={projectAddress}
            proposedStartDate={proposedStartDate}
            selectedTemplateKey={selectedTemplateKey}
            templates={templates}
          />
        ) : (
          <BudgetStep
            cascadeBudgetEdits={cascadeBudgetEdits}
            cashText={cashText}
            contractorActions={contractorActions}
            contractorOptions={contractorOptions}
            error={error}
            onBack={() => setStep("template")}
            onBudgetFileImport={importBudgetFile}
            onCascadeBudgetEditsChange={setCascadeBudgetEdits}
            onComplete={completeSetup}
            onRowsChange={(
              nextRows,
              _meta?: TimelineMilestoneWorksheetRowsChangeMeta
            ) => {
              setRows(nextRows);
              if (!cascadeBudgetEdits) {
                setBudgetText(formatCurrency(setupRowsBudgetCents(nextRows)));
              }
              setError("");
            }}
            onScheduleDisplayModeChange={setScheduleDisplayMode}
            permitFiles={permitFiles}
            projectAddress={projectAddress}
            proposedStartDate={proposedStartDate}
            rows={rows}
            scheduleDisplayMode={scheduleDisplayMode}
            targetBudgetCents={validCurrencyCents(budgetText)}
            templateTitle={
              importedBudgetTitle || selectedTemplate?.title || "Timeline plan"
            }
          />
        )}
      </motion.div>
    </div>
  );
}

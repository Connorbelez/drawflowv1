"use client";

import {
  Calendar,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Info,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { FramePanel } from "#/components/ui/frame.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { formatCurrency } from "#/features/builder-proposal-demo/template-helpers.ts";
import type { BudgetWorkbookProposalDraft } from "#/features/proposal-import/budget-workbook-schema.ts";
import type { GoogleAddressPlaceDetails } from "#/lib/google-maps.ts";
import { cn } from "#/lib/utils.ts";
import {
  type TimelineMilestoneWorksheetContractorOption,
  TimelineMilestoneWorksheetTable,
  type TimelineScheduleDisplayMode,
} from "./-TimelineMilestoneWorksheetTable.tsx";
import { TOTAL_REIMBURSEMENT_BPS } from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";
import {
  formatBpsPercent,
  normalizeCurrencyText,
  normalizePercentText,
  type SetupStep,
  STRIP_LEADING_DOLLAR,
  TEMPLATE_THUMBNAILS,
  type TimelineSetupBrokerOption,
  type TimelineSetupMilestoneRow,
  type TimelineSetupTemplate,
  validCurrencyCents,
  validPercentBps,
} from "./TimelineSetupFlowContracts.ts";

export function TemplateStep({
  assignedBrokerWorkosUserId,
  brokerOptions,
  budgetText,
  cashText,
  error,
  loanPercentageText,
  onAssignedBrokerChange,
  onBudgetTextChange,
  onCashTextChange,
  onContinue,
  onLoanPercentageTextChange,
  onPermitFilesChange,
  onPermitSkipChange,
  onProjectAddressChange,
  onProjectPlaceSelect,
  onProposedStartDateChange,
  onTemplateSelect,
  permitFiles,
  permitsSkipped,
  projectAddress,
  proposedStartDate,
  selectedTemplateKey,
  templates,
  assistantNotice,
}: {
  assignedBrokerWorkosUserId: string;
  assistantNotice?: string;
  brokerOptions?: TimelineSetupBrokerOption[];
  budgetText: string;
  cashText: string;
  error: string;
  loanPercentageText: string;
  onAssignedBrokerChange: (workosUserId: string) => void;
  onBudgetTextChange: (value: string) => void;
  onCashTextChange: (value: string) => void;
  onContinue: () => void;
  onLoanPercentageTextChange: (value: string) => void;
  onPermitFilesChange: (files: File[]) => void;
  onPermitSkipChange: (skipped: boolean) => void;
  onProjectAddressChange: (value: string) => void;
  onProjectPlaceSelect: (details: GoogleAddressPlaceDetails | null) => void;
  onProposedStartDateChange: (value: string) => void;
  onTemplateSelect: (templateKey: string) => void;
  permitFiles: File[];
  permitsSkipped: boolean;
  projectAddress: string;
  proposedStartDate: string;
  selectedTemplateKey: string;
  templates: TimelineSetupTemplate[];
}) {
  const selectedTemplate = templates.find(
    (template) => template.templateKey === selectedTemplateKey
  );
  const selectedBroker = brokerOptions?.find(
    (broker) => broker.workosUserId === assignedBrokerWorkosUserId
  );
  const budgetCents = validCurrencyCents(budgetText);
  const cashCents = validCurrencyCents(cashText);
  const loanPercentageBps = validPercentBps(loanPercentageText);
  const normalizedLoanPercentageBps = Number.isFinite(loanPercentageBps)
    ? Math.min(
        TOTAL_REIMBURSEMENT_BPS,
        Math.max(0, Math.round(loanPercentageBps))
      )
    : Number.NaN;
  const borrowerContributionBps = Number.isFinite(normalizedLoanPercentageBps)
    ? TOTAL_REIMBURSEMENT_BPS - normalizedLoanPercentageBps
    : Number.NaN;
  const loanAmountCents =
    Number.isFinite(budgetCents) && Number.isFinite(normalizedLoanPercentageBps)
      ? Math.round(
          (budgetCents * normalizedLoanPercentageBps) / TOTAL_REIMBURSEMENT_BPS
        )
      : Number.NaN;
  const borrowerContributionCents =
    Number.isFinite(budgetCents) && Number.isFinite(borrowerContributionBps)
      ? Math.round(
          (budgetCents * borrowerContributionBps) / TOTAL_REIMBURSEMENT_BPS
        )
      : Number.NaN;

  return (
    <div
      className="timeline-setup-panel timeline-setup-template-panel"
      data-testid="timeline-setup-template-screen"
    >
      <ProposalProgressSection step="template" />

      <section className="timeline-setup-main">
        <BlueprintPanel
          description="Choose a template that best matches your project."
          title="1. Select Template"
        >
          {assistantNotice ? (
            <div
              className="mb-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-primary text-sm"
              data-testid="timeline-setup-assistant-notice"
            >
              {assistantNotice}
            </div>
          ) : null}
          <div className="timeline-template-grid">
            {templates.map((template) => {
              const selected = template.templateKey === selectedTemplateKey;

              return (
                <button
                  aria-label={`${selected ? "Selected" : "Select"} ${template.title} template`}
                  aria-pressed={selected}
                  className={cn(
                    "timeline-template-card",
                    selected && "is-selected"
                  )}
                  data-agent-action="select_proposal_template"
                  data-agent-id={`proposal-template:${template.templateKey}`}
                  data-testid={`timeline-setup-template-card-${template.templateKey}`}
                  key={template.templateKey}
                  onClick={() => onTemplateSelect(template.templateKey)}
                  type="button"
                >
                  <img
                    alt={`${template.title} blueprint`}
                    className="timeline-template-thumb"
                    height={96}
                    src={TEMPLATE_THUMBNAILS[template.templateKey]}
                    width={128}
                  />
                  <span className="timeline-template-card-copy">
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </span>
                  <span className="timeline-template-radio">
                    {selected ? <Check aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </BlueprintPanel>

        <BlueprintPanel className="timeline-setup-budget-input-panel">
          <DateSetupField
            label="Proposed Start Date"
            note="Used as the calendar anchor for milestone planning. Past dates are allowed."
            onChange={onProposedStartDateChange}
            testId="timeline-setup-proposed-start-date-input"
            value={proposedStartDate}
          />
          <CurrencySetupField
            label="Total Budget"
            note=""
            onChange={onBudgetTextChange}
            testId="timeline-setup-budget-input"
            value={budgetText}
          />
          <CurrencySetupField
            label="Borrower Starting Cash"
            note="The borrower's own cash available at the start of the build, before any reimbursement draws are released."
            onChange={onCashTextChange}
            testId="timeline-setup-cash-input"
            value={cashText}
          />
          <PercentSetupField
            label="Loan Percentage"
            note="Percentage of each completed milestone funded by the loan. An 80% Loan Percentage means the borrower contributes the remaining 20%."
            onChange={onLoanPercentageTextChange}
            testId="timeline-setup-loan-percentage-input"
            value={loanPercentageText}
          />
        </BlueprintPanel>

        <BlueprintPanel>
          <GoogleAddressAutocomplete
            className="timeline-setup-address-field"
            inputRender={
              <input
                aria-label="Project address"
                data-testid="timeline-setup-address-input"
              />
            }
            label={
              <span>
                Project Address <em>(optional)</em>
              </span>
            }
            onChange={onProjectAddressChange}
            onPlaceSelect={(_suggestion, details) =>
              onProjectPlaceSelect(details)
            }
            placeholder="Enter project address"
            value={projectAddress}
          />
        </BlueprintPanel>

        {brokerOptions ? (
          <BlueprintPanel
            description="Choose the broker responsible for this proposal and its resulting Build."
            title="4. Assigned Broker"
          >
            <Field className="w-full gap-1.5">
              <FieldLabel>Assigned broker</FieldLabel>
              <Select
                disabled={brokerOptions.length === 0}
                onValueChange={(value) =>
                  onAssignedBrokerChange(value as string)
                }
                value={assignedBrokerWorkosUserId || undefined}
              >
                <SelectTrigger
                  aria-label="Assigned broker"
                  data-testid="timeline-setup-assigned-broker-select"
                  size="lg"
                >
                  <SelectValue placeholder="Select an active broker">
                    {selectedBroker?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {brokerOptions.map((broker) => (
                    <SelectItem
                      key={broker.workosUserId}
                      value={broker.workosUserId}
                    >
                      {broker.name}
                      {broker.isPrincipal ? " — Principal broker" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {brokerOptions.length === 0
                  ? "No active broker members are available in this organization."
                  : selectedBroker?.isPrincipal
                    ? "Defaulted to your organization’s principal broker."
                    : selectedBroker?.email ||
                      "This broker will own proposal review and Build handoff."}
              </FieldDescription>
            </Field>
          </BlueprintPanel>
        ) : null}

        <BlueprintPanel
          className={cn(brokerOptions && "timeline-setup-permit-panel-wide")}
          description="Upload building permits or other required approvals."
          title={brokerOptions ? "5. Build Permits" : "4. Build Permits"}
        >
          <BlueprintPermitUploader
            files={permitFiles}
            onFilesChange={(files) => {
              onPermitFilesChange(files);
              if (files.length > 0) {
                onPermitSkipChange(false);
              }
            }}
          />
          <div className="timeline-permit-footer">
            <span>
              <FileText aria-hidden="true" />
              Permits can be skipped for now. You'll be required to upload
              before final submission.
            </span>
            <button
              aria-pressed={permitsSkipped}
              data-testid="timeline-setup-skip-permits"
              onClick={() => onPermitSkipChange(true)}
              type="button"
            >
              {permitsSkipped ? "Skipped" : "Skip for now"}
            </button>
          </div>
        </BlueprintPanel>

        {error ? (
          <p
            className="timeline-blueprint-error"
            data-testid="timeline-setup-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>

      <aside className="timeline-setup-sidecar">
        <BlueprintSummaryCard
          assignedBrokerName={selectedBroker?.name}
          borrowerContributionBps={borrowerContributionBps}
          borrowerContributionCents={borrowerContributionCents}
          budgetCents={budgetCents}
          cashCents={cashCents}
          loanAmountCents={loanAmountCents}
          loanPercentageBps={normalizedLoanPercentageBps}
          projectAddress={projectAddress}
          selectedTemplateTitle={selectedTemplate?.title}
        />
        <BlueprintAsideCard icon={<ClipboardCheck aria-hidden="true" />}>
          <h2>What happens next</h2>
          <p>
            We'll use your selected template to automatically generate
            milestones and default draw groups.
          </p>
          <ul>
            <li>Milestone schedule will be created</li>
            <li>Draw groups and line items will be added</li>
            <li>You can edit everything in the next step</li>
          </ul>
        </BlueprintAsideCard>
        <BlueprintAsideCard icon={<ShieldCheck aria-hidden="true" />}>
          <h2>Compliance Note</h2>
          <strong>Permits required before final submission</strong>
          <p>
            Building permits and other required approvals must be uploaded
            before you can submit this proposal for review and funding.
          </p>
        </BlueprintAsideCard>
        <Button
          className="timeline-setup-primary"
          data-testid="timeline-setup-continue-budget"
          onClick={onContinue}
        >
          Continue to milestone budget
          <ChevronRight />
        </Button>
      </aside>
    </div>
  );
}

export function ProposalProgressSection({ step }: { step: SetupStep }) {
  return (
    <section className="timeline-proposal-progress-section">
      <p className="timeline-proposal-step-label">
        Step {step === "template" ? "1" : "2"} of 4 -{" "}
        {step === "template" ? "Project Setup" : "Milestones & Budget"}
      </p>
      <StepRail step={step} />
    </section>
  );
}

export function BlueprintPanel({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}) {
  return (
    <section className={cn("timeline-blueprint-panel", className)}>
      {title ? (
        <div className="timeline-blueprint-panel-heading">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function CurrencySetupField({
  label,
  note,
  onChange,
  testId,
  value,
}: {
  label: string;
  note: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <label className="timeline-setup-money-field">
      <span>
        {label} <Info aria-hidden="true" />
      </span>
      <div className="timeline-setup-money-input">
        <span>$</span>
        <input
          aria-label={label}
          data-testid={testId}
          onBlur={(event) =>
            onChange(normalizeCurrencyText(event.currentTarget.value))
          }
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value.replace(STRIP_LEADING_DOLLAR, "")}
        />
      </div>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

export function PercentSetupField({
  label,
  note,
  onChange,
  testId,
  value,
}: {
  label: string;
  note: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <label className="timeline-setup-money-field">
      <span>
        {label} <Info aria-hidden="true" />
      </span>
      <div className="timeline-setup-money-input timeline-setup-percent-input">
        <input
          aria-label={label}
          data-testid={testId}
          onBlur={(event) =>
            onChange(normalizePercentText(event.currentTarget.value))
          }
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value.replace("%", "")}
        />
        <span>%</span>
      </div>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

export function DateSetupField({
  label,
  note,
  onChange,
  testId,
  value,
}: {
  label: string;
  note: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openDatePicker = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
  };

  return (
    <label className="timeline-setup-money-field">
      <span>
        {label} <Info aria-hidden="true" />
      </span>
      <div className="timeline-setup-money-input timeline-setup-date-input">
        <input
          aria-label={label}
          data-testid={testId}
          onChange={(event) => onChange(event.currentTarget.value)}
          ref={inputRef}
          type="date"
          value={value}
        />
        <button
          aria-label={`Open ${label} calendar`}
          data-testid={`${testId}-picker`}
          onClick={(event) => {
            event.preventDefault();
            openDatePicker();
          }}
          type="button"
        >
          <Calendar aria-hidden="true" />
        </button>
      </div>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

export function BlueprintSummaryCard({
  assignedBrokerName,
  borrowerContributionBps,
  borrowerContributionCents,
  budgetCents,
  cashCents,
  loanAmountCents,
  loanPercentageBps,
  projectAddress,
  selectedTemplateTitle,
}: {
  assignedBrokerName?: string;
  borrowerContributionBps: number;
  borrowerContributionCents: number;
  budgetCents: number;
  cashCents: number;
  loanAmountCents: number;
  loanPercentageBps: number;
  projectAddress: string;
  selectedTemplateTitle?: string;
}) {
  const formatMaybeCurrency = (value: number) =>
    Number.isFinite(value) ? formatCurrency(value) : "--";

  return (
    <div className="timeline-setup-side-card">
      <h2>Proposal Summary</h2>
      <dl>
        {assignedBrokerName ? (
          <div>
            <dt>Assigned Broker</dt>
            <dd>{assignedBrokerName}</dd>
          </div>
        ) : null}
        <div>
          <dt>Template</dt>
          <dd>{selectedTemplateTitle ?? "Not selected"}</dd>
        </div>
        <div>
          <dt>Total Budget</dt>
          <dd>{formatMaybeCurrency(budgetCents)}</dd>
        </div>
        <div>
          <dt>Borrower Starting Cash</dt>
          <dd>{formatMaybeCurrency(cashCents)}</dd>
        </div>
        <div>
          <dt>Loan Percentage</dt>
          <dd>
            {formatBpsPercent(loanPercentageBps)} ·{" "}
            {formatMaybeCurrency(loanAmountCents)}
          </dd>
        </div>
        <div>
          <dt>Borrower Contribution</dt>
          <dd>
            {formatBpsPercent(borrowerContributionBps)} ·{" "}
            {formatMaybeCurrency(borrowerContributionCents)}
          </dd>
        </div>
        <div>
          <dt>Project Address</dt>
          <dd>{projectAddress || "Not provided"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function BlueprintAsideCard({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="timeline-setup-side-card timeline-setup-side-card-icon">
      <div className="timeline-setup-side-icon">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function BlueprintPermitUploader({
  files,
  onFilesChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }
    const nextFiles = Array.from(fileList);
    onFilesChange([
      ...files,
      ...nextFiles.filter(
        (file) =>
          !files.some(
            (existing) =>
              existing.name === file.name && existing.size === file.size
          )
      ),
    ]);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  return (
    <div className="timeline-permit-uploader">
      <input
        aria-label="Permit file input"
        className="sr-only"
        data-testid="timeline-setup-permit-input"
        multiple
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <button
        className={cn("timeline-permit-dropzone", isDragging && "is-dragging")}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
        type="button"
      >
        <FileText aria-hidden="true" />
        <strong>
          Drag & drop files here, or <span>browse</span>
        </strong>
        <small>PNG, JPG, PDF, etc. up to 5MB each</small>
      </button>
      {files.length > 0 ? (
        <div className="timeline-permit-file-list">
          {files.map((file) => (
            <span key={`${file.name}-${file.size}`}>
              <FileText aria-hidden="true" />
              {file.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BudgetStep({
  cascadeBudgetEdits,
  cashText,
  contractorOptions,
  error,
  onBudgetFileImport,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onRowsChange,
  onScheduleDisplayModeChange,
  projectAddress,
  permitFiles,
  proposedStartDate,
  rows,
  scheduleDisplayMode,
  targetBudgetCents,
  templateTitle,
}: {
  cascadeBudgetEdits: boolean;
  cashText: string;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  error: string;
  onBudgetFileImport: (file: File) => Promise<BudgetWorkbookProposalDraft>;
  onBack: () => void;
  onCascadeBudgetEditsChange: (enabled: boolean) => void;
  onComplete: (options: { redirectToDurableRoute: boolean }) => void;
  onRowsChange: (rows: TimelineSetupMilestoneRow[]) => void;
  onScheduleDisplayModeChange: (mode: TimelineScheduleDisplayMode) => void;
  permitFiles: File[];
  projectAddress: string;
  proposedStartDate: string;
  rows: TimelineSetupMilestoneRow[];
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  targetBudgetCents: number;
  templateTitle: string;
}) {
  const budgetImportInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<
    | { message: string; tone: "error" | "success" }
    | { message: ""; tone: "idle" }
  >({ message: "", tone: "idle" });
  const [isImporting, setIsImporting] = useState(false);

  const importBudgetFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportState({ message: "", tone: "idle" });
    try {
      const draft = await onBudgetFileImport(file);
      setImportState({
        message: `Imported ${draft.milestones.length} milestones and ${draft.milestones.reduce(
          (count, milestone) => count + milestone.submilestones.length,
          0
        )} budget lines from ${file.name}.`,
        tone: "success",
      });
    } catch (caught) {
      setImportState({
        message:
          caught instanceof Error
            ? caught.message
            : "Budget workbook import failed.",
        tone: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeBudgetEdits}
      cashText={cashText}
      contractorOptions={contractorOptions}
      error={error}
      leadingContent={
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProposalProgressSection step="budget" />
            <BuildPermitViewerDrawer
              permit={firstPermitDocument(
                permitFiles.map((file) => ({
                  documentType: "permit",
                  file,
                  fileName: file.name,
                  mimeType: file.type || "application/pdf",
                }))
              )}
              size="sm"
            />
          </div>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Upload className="size-4 text-muted-foreground" />
                Import milestone budget
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Upload a DrawFlow budget .xlsx or exported Budget Import .csv to
                replace the worksheet with the milestone and sub-milestone
                breakdown.
              </p>
              {importState.message ? (
                <p
                  className={cn(
                    "mt-2 text-xs",
                    importState.tone === "error"
                      ? "text-destructive"
                      : "text-emerald-600"
                  )}
                  data-testid="timeline-budget-import-status"
                >
                  {importState.message}
                </p>
              ) : null}
            </div>
            <Button
              disabled={isImporting}
              onClick={() => budgetImportInputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              {isImporting ? "Importing..." : "Upload budget"}
            </Button>
            <input
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              aria-label="Upload milestone budget workbook"
              className="sr-only"
              data-testid="timeline-budget-import-input"
              disabled={isImporting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                importBudgetFile(file);
              }}
              ref={budgetImportInputRef}
              type="file"
            />
          </FramePanel>
        </div>
      }
      mode="setup"
      onBack={onBack}
      onCascadeBudgetEditsChange={onCascadeBudgetEditsChange}
      onComplete={onComplete}
      onRowsChange={(nextRows) =>
        onRowsChange(nextRows as TimelineSetupMilestoneRow[])
      }
      onScheduleDisplayModeChange={onScheduleDisplayModeChange}
      projectAddress={projectAddress}
      proposedStartDate={proposedStartDate}
      rows={rows}
      scheduleDisplayMode={scheduleDisplayMode}
      showHeading
      targetBudgetCents={targetBudgetCents}
      templateTitle={templateTitle}
    />
  );
}

export function StepRail({ step }: { step: SetupStep }) {
  const activeIndex = step === "template" ? 0 : 1;
  const steps = [
    "Project Setup",
    "Milestones & Budget",
    "Schedule & Draw Groups",
    "Review & Submit",
  ];

  return (
    <ol aria-label="Timeline setup steps" className="timeline-setup-step-rail">
      {steps.map((label, index) => (
        <li
          aria-current={index === activeIndex ? "step" : undefined}
          className={cn(
            index === activeIndex && "is-active",
            index < activeIndex && "is-complete"
          )}
          key={label}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

export function CornerMarker({
  position,
}: {
  position: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}) {
  return (
    <span aria-hidden="true" className={`timeline-corner-marker ${position}`} />
  );
}

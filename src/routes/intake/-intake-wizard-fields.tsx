import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, FileText, Upload } from "lucide-react";
import type { ReactElement } from "react";
import { useRef } from "react";

import { Card } from "#/components/ui/card.tsx";

import type { IntakeAnswers } from "./-intake-contracts.ts";

export function FieldGroup({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}): ReactElement {
  return (
    <section className="bp-field-group">
      <h2>{label}</h2>
      {children}
    </section>
  );
}

export function BuildPermitDisclosure({
  fileName,
  onClear,
  onFileSelected,
}: {
  fileName: string;
  onClear: () => void;
  onFileSelected: (fileName: string) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <details className="bp-permit-disclosure">
      <summary className="bp-permit-trigger">
        <span className="bp-permit-trigger-icon">
          <Upload aria-hidden="true" strokeWidth={1.8} />
        </span>
        <span className="bp-permit-trigger-copy">
          <strong>Already have a build permit?</strong>
          <small>
            Upload it now and we&apos;ll skip straight to final contact.
          </small>
        </span>
        <em>{fileName ? "Permit attached" : "Optional fast track"}</em>
        <ChevronDown aria-hidden="true" strokeWidth={1.9} />
      </summary>
      <div className="bp-permit-panel" id="bp-permit-upload-panel">
        <div className="bp-permit-panel-inner">
          <label className="bp-permit-upload">
            <input
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFileSelected(file.name);
                }
              }}
              ref={inputRef}
              type="file"
            />
            <Upload aria-hidden="true" strokeWidth={1.8} />
            <span>Upload build permit</span>
            <small>PDF or image file</small>
          </label>

          {fileName ? (
            <div className="bp-permit-file">
              <FileText aria-hidden="true" strokeWidth={1.8} />
              <span>{fileName}</span>
              <button
                onClick={() => {
                  onClear();
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
                type="button"
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export function SelectableCard({
  active,
  children,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  children: string;
  icon: LucideIcon;
  onClick: () => void;
}): ReactElement {
  return (
    <Card
      className={
        active
          ? "bp-status-option bp-select-card is-selected"
          : "bp-status-option bp-select-card"
      }
      render={<button aria-pressed={active} onClick={onClick} type="button" />}
    >
      <OptionCardIcon icon={Icon} />
      <span>{children}</span>
      {active ? (
        <Check aria-hidden="true" className="bp-status-check" strokeWidth={2} />
      ) : null}
    </Card>
  );
}

export function OptionCardIcon({ icon: Icon }: { icon: LucideIcon }): ReactElement {
  return (
    <span aria-hidden="true" className="bp-option-icon">
      <Icon strokeWidth={1.7} />
    </span>
  );
}

export function SelectableChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={active ? "bp-chip-option is-selected" : "bp-chip-option"}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function TextField({
  icon: Icon,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  icon: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "email" | "tel" | "text";
  value: string;
}): ReactElement {
  return (
    <label className="bp-text-field">
      <span>{label}</span>
      <div className="bp-address-input">
        <Icon aria-hidden="true" strokeWidth={1.8} />
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
    </label>
  );
}

export function toggleMultiValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  if (value === "None yet" || value === "Not sure") {
    return [value];
  }
  return [
    ...values.filter((item) => item !== "None yet" && item !== "Not sure"),
    value,
  ];
}

export function buildProjectSummary(answers: IntakeAnswers): string[] {
  const primaryNeed = answers.financingNeeds[0] ?? "Financing path";
  const secondaryNeed = answers.financingNeeds[1];
  const teamSummary =
    answers.projectTeam.length > 0
      ? `${answers.projectTeam[0]}${
          answers.projectTeam.length > 1
            ? ` + ${answers.projectTeam.length - 1} more`
            : ""
        }`
      : "Team pending";
  return [
    answers.address || "Property details pending",
    answers.siteControl,
    answers.buildType,
    `${answers.unitCount} units`,
    answers.projectStage,
    primaryNeed,
    secondaryNeed,
    answers.financingTimeline,
    `${answers.requestedLoan} request`,
    `${answers.projectCost} total cost`,
    `${answers.borrowerEquity} equity`,
    teamSummary,
    answers.borrowerExperience,
    answers.contactRole,
  ].filter(Boolean);
}

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  LockKeyhole,
  Mail,
  Phone,
  Plus,
  Upload,
  User,
  Users,
} from "lucide-react";
import type { ReactElement } from "react";

import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { Card } from "#/components/ui/card.tsx";
import blueprintImage from "./assets/Landing Page Blueprint.png";
import multiplexImage from "./assets/Multiplex Transparent Asset.png";
import sitePlanBlueprintFieldImage from "./assets/Property Site Plan Blueprint Field.webp";
import sitePlanForegroundImage from "./assets/Property Site Plan Foreground.webp";
import {
  buildTypeOptions,
  equityRangeOptions,
  experienceOptions,
  financingNeedOptions,
  financingTimelineOptions,
  loanRangeOptions,
  propertyStatusOptions,
  projectStageOptions,
  stepVisuals,
  teamOptions,
  trustItems,
  type IntakeAnswers,
  type WizardStep,
  unitCountOptions,
  contactRoleOptions,
} from "./-intake-contracts.ts";
import {
  BuildPermitDisclosure,
  FieldGroup,
  OptionCardIcon,
  SelectableCard,
  SelectableChip,
  TextField,
  toggleMultiValue,
} from "./-intake-wizard-fields.tsx";

export function BuildPathStepProgress({
  step,
  total = 7,
}: {
  step: number;
  total?: number;
}): ReactElement {
  return (
    <div className="bp-step">
      <span>
        Step {step} of {total}
      </span>
      <span aria-hidden="true" className="bp-step-dots">
        {Array.from({ length: total }, (_, index) => index + 1).map(
          (dotStep) => (
            <i
              className={dotStep === step ? "is-active" : undefined}
              key={dotStep}
            />
          )
        )}
      </span>
    </div>
  );
}

export function BuildPathHeroStart({
  onStart,
}: {
  onStart: () => void;
}): ReactElement {
  return (
    <>
      <div aria-hidden="true" className="bp-annotation bp-annotation-plan">
        Modern multiplex
        <span>6 units</span>
        <span>Lot size&nbsp;&nbsp;60&apos; x 100&apos;</span>
        <span>Zoning&nbsp;&nbsp;RM-2</span>
      </div>
      <div aria-hidden="true" className="bp-annotation bp-annotation-return">
        Smart design.
        <span>Strong returns.</span>
      </div>
      <div aria-hidden="true" className="bp-dashed-arc" />

      <div className="bp-copy">
        <BuildPathStepProgress step={1} />

        <h1 id="bp-hero-title">
          <span>Build financing that </span>
          <span>moves with the work</span>
        </h1>

        <p className="bp-subtitle">
          Plan draws around real construction progress,{" "}
          <span>
            not rigid schedules that ignore what is happening on site.
          </span>
        </p>

        <ul className="bp-trust-row">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card className="bp-trust-chip" key={item.label} render={<li />}>
                <span aria-hidden="true" className="bp-trust-icon">
                  <Icon strokeWidth={1.9} />
                </span>
                <span>{item.label}</span>
              </Card>
            );
          })}
        </ul>
      </div>

      <img
        alt=""
        aria-hidden="true"
        className="bp-blueprint"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={955}
        loading="eager"
        src={blueprintImage}
        width={1328}
      />
      <img
        alt=""
        aria-hidden="true"
        className="bp-multiplex"
        decoding="async"
        draggable={false}
        fetchPriority="high"
        height={987}
        loading="eager"
        src={multiplexImage}
        width={1418}
      />

      <button
        aria-label="Continue to project review"
        className="bp-orb"
        onClick={onStart}
        type="button"
      >
        <ArrowRight strokeWidth={1.8} />
      </button>

      <div className="bp-cta-stack">
        <button className="bp-primary-cta" onClick={onStart} type="button">
          <span>Start project review</span>
          <ArrowRight aria-hidden="true" strokeWidth={1.8} />
        </button>
        <button className="bp-secondary-cta" type="button">
          I&apos;m just exploring
        </button>
        <p className="bp-secure-note">
          <LockKeyhole aria-hidden="true" strokeWidth={1.9} />
          <span>Your information is secure and never shared.</span>
        </p>
      </div>
    </>
  );
}

export function BuildPathPropertyStep({
  answers,
  onBack,
  onContinue,
  updateAnswer,
}: {
  answers: IntakeAnswers;
  onBack: () => void;
  onContinue: () => void;
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void;
}): ReactElement {
  return (
    <div className="bp-form-stage">
      <div className="bp-site-plan-panel">
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-field"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanBlueprintFieldImage}
          width={1536}
        />
        <img
          alt=""
          aria-hidden="true"
          className="bp-site-plan-foreground"
          decoding="async"
          draggable={false}
          height={1024}
          loading="eager"
          src={sitePlanForegroundImage}
          width={1536}
        />

        <div className="bp-site-plan-notes bp-site-plan-notes-top">
          <p>Property site plan</p>
          <span>Lot area</span>
          <strong>14,200 sq ft</strong>
          <span>Zoning</span>
          <strong>R-3</strong>
          <span>Topography</span>
          <strong>Level</strong>
        </div>

        <div className="bp-buildable-note">
          <span>Buildable area</span>
          <strong>8,560 sq ft</strong>
        </div>

        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-depth"
        >
          142&apos;-0&quot;
        </div>
        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-width"
        >
          100&apos;-0&quot;
        </div>
        <div
          aria-hidden="true"
          className="bp-site-dimension bp-site-dimension-front"
        >
          <span>Front setback</span>
          <strong>20&apos;-0&quot;</strong>
        </div>

        <div className="bp-site-legend">
          <p>Legend</p>
          <span>
            <i />
            Property line
          </span>
          <span>
            <i />
            Setback line
          </span>
          <span>
            <i />
            Building footprint
          </span>
        </div>

        <div className="bp-site-summary">
          <p>Site summary</p>
          <span>
            <i />
            14,200 sq ft
          </span>
          <span>
            <i />
            0.33 acres
          </span>
          <span>
            <i />
            Level topography
          </span>
        </div>
      </div>

      <Card className="bp-form-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <div className="bp-form-content">
          <p className="bp-form-kicker">Property / site details</p>
          <h1 id="bp-form-title">Where is the build?</h1>
          <p className="bp-form-subtitle">
            Tell us about the property you plan to build on so we can match you
            with the right financing options.
          </p>

          <GoogleAddressAutocomplete
            className="bp-address-field bp-address-autocomplete"
            id="intake-property-address"
            inputRender={
              <input
                aria-label="Project property address"
                data-testid="intake-property-address-input"
              />
            }
            label="Project property address"
            onChange={(nextAddress) => updateAnswer("address", nextAddress)}
            onPlaceSelect={(_suggestion, details) => {
              if (details?.formattedAddress) {
                updateAnswer("address", details.formattedAddress);
              }
            }}
            placeholder="Start typing the project address"
            value={answers.address}
          />

          <fieldset className="bp-status-fieldset">
            <legend>Current property status</legend>
            <div className="bp-status-grid">
              {propertyStatusOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Card
                    className={
                      answers.siteControl === option.value
                        ? "bp-status-option is-selected"
                        : "bp-status-option"
                    }
                    key={option.label}
                    render={
                      <button
                        aria-pressed={answers.siteControl === option.value}
                        onClick={() =>
                          updateAnswer("siteControl", option.value)
                        }
                        type="button"
                      />
                    }
                  >
                    <OptionCardIcon icon={Icon} />
                    <span>{option.label}</span>
                    {answers.siteControl === option.value ? (
                      <Check
                        aria-hidden="true"
                        className="bp-status-check"
                        strokeWidth={2}
                      />
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </fieldset>

          <BuildPermitDisclosure
            fileName={answers.buildPermitFileName}
            onClear={() => updateAnswer("buildPermitFileName", "")}
            onFileSelected={(fileName) =>
              updateAnswer("buildPermitFileName", fileName)
            }
          />

          <button
            className="bp-form-continue"
            onClick={onContinue}
            type="button"
          >
            <span>Continue</span>
            <ArrowRight aria-hidden="true" strokeWidth={1.8} />
          </button>

          <button className="bp-form-back" onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
            Back
          </button>
        </div>
      </Card>
    </div>
  );
}

export function BuildPathWizardStep({
  answers,
  onBack,
  onContinue,
  step,
  summaryItems,
  updateAnswer,
}: {
  answers: IntakeAnswers;
  onBack: () => void;
  onContinue: () => void;
  step: WizardStep;
  summaryItems: string[];
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void;
}): ReactElement {
  const content = getWizardStepContent(step, answers, updateAnswer);

  return (
    <div className="bp-form-stage bp-wizard-stage">
      <BuildPathVisualPanel
        answers={answers}
        step={step}
        summaryItems={summaryItems}
      />

      <Card className="bp-form-panel bp-wizard-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <div className="bp-form-content" key={step}>
          <p className="bp-form-kicker">{content.kicker}</p>
          <h1 id="bp-form-title">{content.title}</h1>
          <p className="bp-form-subtitle">{content.subtitle}</p>

          <div className="bp-wizard-fields">{content.fields}</div>

          <div className="bp-wizard-actions">
            <button
              className="bp-form-continue"
              onClick={onContinue}
              type="button"
            >
              <span>{step === 7 ? "Submit project" : "Continue"}</span>
              <ArrowRight aria-hidden="true" strokeWidth={1.8} />
            </button>

            <button className="bp-form-back" onClick={onBack} type="button">
              <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
              Back
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function getWizardStepContent(
  step: WizardStep,
  answers: IntakeAnswers,
  updateAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ) => void
): {
  fields: ReactElement;
  kicker: string;
  subtitle: string;
  title: string;
} {
  switch (step) {
    case 3:
      return {
        kicker: "Build profile",
        title: "What are you building?",
        subtitle:
          "Shape the project profile so we can separate construction, bridge, and take-out paths early.",
        fields: (
          <>
            <FieldGroup label="Project type">
              <div className="bp-option-grid bp-option-grid-three">
                {buildTypeOptions.map((option) => (
                  <SelectableCard
                    active={answers.buildType === option.label}
                    icon={option.icon}
                    key={option.label}
                    onClick={() => updateAnswer("buildType", option.label)}
                  >
                    {option.label}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Units after completion">
              <div className="bp-chip-grid">
                {unitCountOptions.map((option) => (
                  <SelectableChip
                    active={answers.unitCount === option}
                    key={option}
                    onClick={() => updateAnswer("unitCount", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Current project stage">
              <div className="bp-stage-timeline">
                {projectStageOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectStage === option}
                    key={option}
                    onClick={() => updateAnswer("projectStage", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 4:
      return {
        kicker: "Financing path",
        title: "What do you need financed?",
        subtitle:
          "Select every need that applies. DrawFlow can route a mixed capital stack without forcing one answer too early.",
        fields: (
          <>
            <FieldGroup label="Financing needs">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {financingNeedOptions.map((option) => (
                  <SelectableChip
                    active={answers.financingNeeds.includes(option)}
                    key={option}
                    onClick={() =>
                      updateAnswer(
                        "financingNeeds",
                        toggleMultiValue(answers.financingNeeds, option)
                      )
                    }
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="When do you need funding or guidance?">
              <div className="bp-option-grid">
                {financingTimelineOptions.map((option) => (
                  <SelectableCard
                    active={answers.financingTimeline === option}
                    icon={CalendarClock}
                    key={option}
                    onClick={() => updateAnswer("financingTimeline", option)}
                  >
                    {option}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 5:
      return {
        kicker: "Capital snapshot",
        title: "What size is the capital stack?",
        subtitle:
          "Ranges are enough for the first review. This keeps the conversation practical without forcing a polished budget.",
        fields: (
          <>
            <FieldGroup label="Estimated loan request">
              <div className="bp-chip-grid">
                {loanRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.requestedLoan === option}
                    key={option}
                    onClick={() => updateAnswer("requestedLoan", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Estimated total project cost">
              <div className="bp-chip-grid">
                {loanRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectCost === option}
                    key={option}
                    onClick={() => updateAnswer("projectCost", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Borrower equity or cash available">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {equityRangeOptions.map((option) => (
                  <SelectableChip
                    active={answers.borrowerEquity === option}
                    key={option}
                    onClick={() => updateAnswer("borrowerEquity", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 6:
      return {
        kicker: "Execution readiness",
        title: "Who is already on the project?",
        subtitle:
          "The team picture helps a lender understand how quickly the build can move from plan to verifiable progress.",
        fields: (
          <>
            <FieldGroup label="Project team">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {teamOptions.map((option) => (
                  <SelectableChip
                    active={answers.projectTeam.includes(option)}
                    key={option}
                    onClick={() =>
                      updateAnswer(
                        "projectTeam",
                        toggleMultiValue(answers.projectTeam, option)
                      )
                    }
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Borrower or project experience">
              <div className="bp-option-grid bp-option-grid-experience">
                {experienceOptions.map((option) => (
                  <SelectableCard
                    active={answers.borrowerExperience === option}
                    icon={Users}
                    key={option}
                    onClick={() => updateAnswer("borrowerExperience", option)}
                  >
                    {option}
                  </SelectableCard>
                ))}
              </div>
            </FieldGroup>
          </>
        ),
      };
    case 7:
      return {
        kicker: "Review contact",
        title: "Where should we send the next step?",
        subtitle:
          "A DrawFlow reviewer can use this profile to point you toward suitable construction, bridge, or take-out financing options.",
        fields: (
          <>
            <FieldGroup label="Your role">
              <div className="bp-chip-grid bp-chip-grid-dense">
                {contactRoleOptions.map((option) => (
                  <SelectableChip
                    active={answers.contactRole === option}
                    key={option}
                    onClick={() => updateAnswer("contactRole", option)}
                  >
                    {option}
                  </SelectableChip>
                ))}
              </div>
            </FieldGroup>

            <div className="bp-contact-grid">
              <TextField
                icon={User}
                label="Name"
                onChange={(value) => updateAnswer("name", value)}
                placeholder="Your full name"
                value={answers.name}
              />
              <TextField
                icon={Mail}
                label="Email"
                onChange={(value) => updateAnswer("email", value)}
                placeholder="you@example.com"
                type="email"
                value={answers.email}
              />
              <TextField
                icon={Phone}
                label="Phone"
                onChange={(value) => updateAnswer("phone", value)}
                placeholder="Best phone number"
                type="tel"
                value={answers.phone}
              />
              <label className="bp-text-field bp-notes-field">
                <span>Anything else we should know?</span>
                <textarea
                  onChange={(event) => updateAnswer("notes", event.target.value)}
                  placeholder="Optional notes about timing, lender conversations, or project constraints"
                  value={answers.notes}
                />
              </label>
            </div>

            <p className="bp-final-note">
              <LockKeyhole aria-hidden="true" strokeWidth={1.8} />
              No credit check, no obligation, and no documents required to
              start.
            </p>
          </>
        ),
      };
    default:
      return {
        kicker: "DrawFlow intake",
        title: "Review your project",
        subtitle: "Continue through the remaining project details.",
        fields: <></>,
      };
  }
}

function BuildPathVisualPanel({
  answers,
  step,
  summaryItems,
}: {
  answers: IntakeAnswers;
  step: WizardStep;
  summaryItems: string[];
}): ReactElement {
  const visual = stepVisuals[(step > 1 ? step : 2) as keyof typeof stepVisuals];
  const splitSummary = step >= 4 && step <= 7;
  const bottomSummaryItems = summaryItems.slice(0, 5);
  const topSummaryItems = getVisualTopSummaryItems(step, summaryItems);

  return (
    <div className="bp-wizard-visual">
      <img
        alt=""
        aria-hidden="true"
        className="bp-wizard-art"
        decoding="async"
        draggable={false}
        height={1024}
        key={visual.image}
        loading="eager"
        src={visual.image}
        width={1536}
      />

      <div
        aria-hidden="true"
        className="bp-visual-annotation bp-visual-annotation-top"
      >
        {visual.label}
        <span>{visual.title}</span>
      </div>

      <div className="bp-visual-card">
        <p>{answers.buildType}</p>
        <strong>{answers.unitCount} units</strong>
        <span>{answers.projectStage}</span>
      </div>

      {topSummaryItems.length > 0 ? (
        <div className="bp-visual-summary bp-visual-summary-top">
          {topSummaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}

      <div
        className={
          splitSummary
            ? "bp-visual-summary bp-visual-summary-bottom"
            : "bp-visual-summary"
        }
      >
        {bottomSummaryItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function getVisualTopSummaryItems(
  step: WizardStep,
  summaryItems: string[]
): string[] {
  switch (step) {
    case 4:
      return summaryItems.slice(5, 8);
    case 5:
      return summaryItems.slice(5, 11);
    case 6:
      return summaryItems.slice(8, 13);
    case 7:
      return summaryItems.slice(9, 14);
    default:
      return [];
  }
}

export function BuildPathSuccessStep({
  answers,
  onAddAnother,
  onBack,
  summaryItems,
}: {
  answers: IntakeAnswers;
  onAddAnother: () => void;
  onBack: () => void;
  summaryItems: string[];
}): ReactElement {
  return (
    <div className="bp-form-stage bp-wizard-stage">
      <BuildPathVisualPanel
        answers={answers}
        step={8}
        summaryItems={summaryItems}
      />

      <Card className="bp-form-panel bp-wizard-panel bp-success-panel">
        <div aria-hidden="true" className="bp-form-panel-glow" />
        <p className="bp-form-kicker">Project received</p>
        <h1 id="bp-form-title">Your build profile is ready.</h1>
        <p className="bp-form-subtitle">
          We have enough to route the project for an initial construction
          financing review and identify the likely next documents.
        </p>

        <div className="bp-success-seal">
          <Check aria-hidden="true" strokeWidth={2} />
          Intake complete
        </div>

        <div className="bp-success-summary">
          {summaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <div className="bp-success-actions">
          <button className="bp-form-continue" type="button">
            <span>Book review call</span>
            <CalendarDays aria-hidden="true" strokeWidth={1.8} />
          </button>
          <button className="bp-upload-button" type="button">
            <Upload aria-hidden="true" strokeWidth={1.8} />
            Upload documents
          </button>
        </div>

        <button className="bp-add-another" onClick={onAddAnother} type="button">
          <Plus aria-hidden="true" strokeWidth={1.8} />
          Start another project
        </button>

        <button className="bp-form-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
          Back
        </button>
      </Card>
    </div>
  );
}

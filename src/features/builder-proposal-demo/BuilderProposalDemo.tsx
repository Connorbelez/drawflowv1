import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { CinematicRoadmap } from "./CinematicRoadmap";
import { useBuilderProposalDemo } from "./convex-builder-proposal-adapter";
import {
  formatCurrency,
  formatSignedCurrency,
  parseCurrencyToCents,
} from "./template-helpers";
import type {
  BuilderProposalDraftProjection,
  BuilderProposalMilestone,
  BuilderProposalTemplate,
} from "./types";
import "./proposal-builder.css";

const DEFAULT_BUDGET_TEXT = "$1,850,000";
const DEFAULT_START_DATE = "2026-06-01";

function cx(...classes: Array<false | null | string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                      */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: "template", label: "Build type & budget" },
  { key: "milestones", label: "Milestones" },
  { key: "boundary", label: "Boundary & submit" },
];

function StepIndicator({ currentStep }: { currentStep: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="pb-step-indicator">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        return (
          <div key={step.key}>
            <div
              className={cx(
                "pb-step",
                isActive && "active",
                isCompleted && "completed"
              )}
            >
              <span className="pb-step-dot" />
              {step.label}
            </div>
            {index < STEPS.length - 1 && (
              <div className={cx("pb-step-line", isCompleted && "completed")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Auto-save Indicator                                                 */
/* ------------------------------------------------------------------ */

function AutoSaveIndicator({ saving }: { saving?: boolean }) {
  return (
    <div className={cx("pb-autosave", saving && "saving")}>
      {saving && <span className="pb-autosave-dot" />}
      {saving ? "Saving..." : "Saved"}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resizable Split Panel                                               */
/* ------------------------------------------------------------------ */

function ResizableSplit({
  left,
  right,
  defaultLeftPercent = 42,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLeftPercent?: number;
}) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!(isDragging && containerRef.current)) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(30, Math.min(60, pct)));
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div
      className="pb-split"
      ref={containerRef}
      style={{ ["--split-left" as string]: `${leftWidth}%` }}
    >
      <div
        className="pb-scroll"
        style={{
          minWidth: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {left}
      </div>
      <div
        aria-orientation="vertical"
        className="pb-split-handle"
        onMouseDown={() => setIsDragging(true)}
        role="separator"
      />
      <div
        className="pb-roadmap-panel"
        style={{
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {right}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Proposal Builder Shell                                              */
/* ------------------------------------------------------------------ */

function ProposalBuilderShell({
  action,
  children,
  eyebrow,
  rightPanel,
  step,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  rightPanel: ReactNode;
  step: "template" | "milestones" | "boundary";
  title: string;
}) {
  return (
    <div className="proposal-builder">
      <header className="pb-shell-header">
        <div className="pb-shell-titlebar">
          <div className="pb-shell-titlecopy">
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--pb-fg-tertiary)",
              }}
            >
              {eyebrow}
            </p>
            <h1
              style={{
                fontSize: "clamp(20px, 2.5vw, 28px)",
                fontWeight: 700,
                color: "var(--pb-fg)",
                lineHeight: 1.2,
                marginTop: 2,
              }}
            >
              {title}
            </h1>
          </div>
          <div className="pb-shell-steps">
            <StepIndicator currentStep={step} />
          </div>
        </div>
        <div className="pb-shell-actions">
          <AutoSaveIndicator />
          {action}
        </div>
      </header>

      <div style={{ height: "calc(100vh - 73px)" }}>
        <ResizableSplit
          left={<div className="pb-left-panel">{children}</div>}
          right={
            <div
              className="pb-right-panel"
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--pb-fg-tertiary)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Live roadmap</span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--pb-accent)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--pb-accent)",
                      boxShadow: "0 0 6px var(--pb-accent-glow)",
                    }}
                  />
                  Real-time
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>{rightPanel}</div>
            </div>
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Buttons                                                             */
/* ------------------------------------------------------------------ */

function PrimaryButton({
  children,
  className,
  disabled,
  id,
  onClick,
  testId,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  onClick?: () => void;
  testId?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cx("pb-btn pb-btn-primary", className)}
      data-testid={testId}
      disabled={disabled}
      id={id}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  className,
  disabled,
  id,
  onClick,
  testId,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      className={cx("pb-btn pb-btn-secondary", className)}
      data-testid={testId}
      disabled={disabled}
      id={id}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric Tile                                                         */
/* ------------------------------------------------------------------ */

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-metric">
      <div className="pb-metric-value">{value}</div>
      <div className="pb-metric-label">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Readiness Line                                                      */
/* ------------------------------------------------------------------ */

function ReadinessLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-readiness">
      <span className="pb-readiness-label">{label}</span>
      <span className="pb-readiness-value">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "50vh",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: "center",
          padding: "32px",
          borderRadius: 8,
          border: "1px solid var(--pb-border)",
          background: "var(--pb-elevated)",
        }}
      >
        <Ban
          size={28}
          style={{ color: "var(--pb-fg-tertiary)", margin: "0 auto" }}
        />
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginTop: 12,
            color: "var(--pb-fg)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 13,
            marginTop: 8,
            color: "var(--pb-fg-secondary)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Route                                                     */
/* ------------------------------------------------------------------ */

export function BuilderDashboardRoute() {
  const navigate = useNavigate();
  const { dashboard, isLoading, resetDemo, startDraft } =
    useBuilderProposalDemo();
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const metrics = dashboard?.dashboard.metrics;

  async function handleStart() {
    setIsStarting(true);
    try {
      const result = await startDraft({});
      await navigate({
        search: { draftId: result.draftId },
        to: "/demo/drawflow/new-proposal",
      });
    } finally {
      setIsStarting(false);
    }
  }

  async function handleReset() {
    setIsResetting(true);
    try {
      await resetDemo({});
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="proposal-builder pb-dashboard-page">
      <div className="pb-dashboard-wrap">
        <div className="pb-dashboard-header">
          <div>
            <p className="pb-eyebrow">
              {dashboard?.orgKey ?? "org_fairlend_demo"} / Harbor & Pine
              Builders
            </p>
            <h1 className="pb-dashboard-title">Builder dashboard</h1>
          </div>
          <div className="pb-action-group">
            <SecondaryButton
              disabled={isResetting}
              onClick={handleReset}
              testId="builder-dashboard-reset"
            >
              <RefreshCw size={14} />
              Reset demo
            </SecondaryButton>
            <PrimaryButton
              disabled={isStarting}
              id="dashboard-new-proposal-button"
              onClick={handleStart}
              testId="builder-dashboard-new-proposal"
            >
              <Plus size={15} />
              New proposal
            </PrimaryButton>
          </div>
        </div>

        {dashboard?.needsSeed ? (
          <div className="pb-alert-warning" style={{ marginBottom: 16 }}>
            Template seed is being prepared. Use reset if the demo does not
            populate.
          </div>
        ) : null}

        <div
          className="pb-dashboard-shell"
          data-testid="builder-dashboard-shell"
        >
          <section className="pb-dashboard-hero">
            <div className="pb-dashboard-panel pb-dashboard-panel-primary">
              <div className="pb-panel-heading">
                <Building2 size={18} style={{ color: "var(--pb-accent)" }} />
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--pb-fg)",
                  }}
                >
                  Proposal pipeline
                </h2>
              </div>
              <div className="pb-metric-grid">
                <MetricTile
                  label="Draft proposals"
                  value={isLoading ? "..." : String(metrics?.draftCount ?? 0)}
                />
                <MetricTile
                  label="Ready for workspace"
                  value={isLoading ? "..." : String(metrics?.readyCount ?? 0)}
                />
                <MetricTile
                  label="Budget in planning"
                  value={
                    isLoading
                      ? "..."
                      : formatCurrency(metrics?.planningBudgetCents ?? 0, {
                          compact: true,
                        })
                  }
                />
              </div>
            </div>

            <div className="pb-dashboard-cta pb-dashboard-panel">
              <div className="pb-panel-heading">
                <WalletCards size={18} style={{ color: "var(--pb-accent)" }} />
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--pb-fg)",
                  }}
                >
                  Start a reimbursable build
                </h2>
              </div>
              <p className="pb-dashboard-copy">
                Choose a build type, enter a budget, tune milestones, and set
                borrower cash availability before workspace setup.
              </p>
              <div className="pb-status-pill">Reimbursement only</div>
            </div>
          </section>

          <section className="pb-workspace-card-grid">
            {(dashboard?.dashboard.workspaceCards ?? []).map((card) => (
              <article
                className="pb-workspace-card"
                data-testid={`builder-dashboard-card-${card.title
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
                key={card.title}
              >
                <h3 className="pb-card-title">{card.title}</h3>
                <p className="pb-card-copy">{card.description}</p>
                {card.href ? (
                  <a
                    href={card.href}
                    style={{
                      display: "inline-flex",
                      marginTop: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--pb-accent)",
                      textDecoration: "none",
                    }}
                  >
                    Separate workspace demo
                  </a>
                ) : null}
              </article>
            ))}
          </section>

          {dashboard?.drafts.length ? (
            <section className="pb-dashboard-panel pb-draft-panel">
              <h2 className="pb-section-title">
                Recent builder proposal drafts
              </h2>
              <div className="pb-draft-list">
                {dashboard.drafts.slice(0, 5).map((draft) => (
                  <div
                    className="pb-draft-row"
                    data-testid="builder-dashboard-draft-row"
                    key={draft._id}
                  >
                    <strong style={{ color: "var(--pb-fg)" }}>
                      {draft.proposalNumber}
                    </strong>
                    <span style={{ color: "var(--pb-fg-secondary)" }}>
                      {draft.templateTitle ?? "Template not selected"}
                    </span>
                    <span style={{ color: "var(--pb-fg-secondary)" }}>
                      {formatCurrency(draft.currentBudgetCents)}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--pb-accent)",
                      }}
                    >
                      {draft.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  New Proposal Orchestrator                                           */
/* ------------------------------------------------------------------ */

export function BuilderNewProposalRoute({
  draftId,
}: {
  draftId?: Id<"demo_builderProposalDrafts">;
}) {
  const navigate = useNavigate();
  const { dashboard, isLoading, startDraft } = useBuilderProposalDemo(draftId);
  const projection = dashboard?.activeDraft;
  const [isStarting, setIsStarting] = useState(false);

  async function handleCreateDraft() {
    setIsStarting(true);
    try {
      const result = await startDraft({});
      await navigate({
        search: { draftId: result.draftId },
        to: "/demo/drawflow/new-proposal",
      });
    } finally {
      setIsStarting(false);
    }
  }

  if (!draftId) {
    return (
      <div className="proposal-builder">
        <div style={{ padding: "24px 32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--pb-fg-tertiary)",
                }}
              >
                No active draft
              </p>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--pb-fg)",
                }}
              >
                Start a proposal draft
              </h1>
            </div>
            <PrimaryButton disabled={isStarting} onClick={handleCreateDraft}>
              <Plus size={14} />
              Create draft
            </PrimaryButton>
          </div>
          <EmptyState
            body="The new proposal workflow needs a stable draft ID so edits can autosave and audit events can attach to the proposal."
            title="Create a draft before selecting a template"
          />
        </div>
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="proposal-builder">
        <div style={{ padding: "24px 32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--pb-fg-tertiary)",
                }}
              >
                Loading draft
              </p>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--pb-fg)",
                }}
              >
                New proposal
              </h1>
            </div>
          </div>
          <div
            data-testid="builder-proposal-loading"
            style={{ display: "grid", gap: 12 }}
          >
            <div
              style={{
                height: 80,
                borderRadius: 8,
                background: "var(--pb-elevated)",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
            <div
              style={{
                height: 256,
                borderRadius: 8,
                background: "var(--pb-elevated)",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                animationDelay: "0.2s",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!projection) {
    return (
      <div className="proposal-builder">
        <div style={{ padding: "24px 32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--pb-fg-tertiary)",
                }}
              >
                Draft not found
              </p>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--pb-fg)",
                }}
              >
                New proposal
              </h1>
            </div>
            <PrimaryButton disabled={isStarting} onClick={handleCreateDraft}>
              <Plus size={14} />
              New stable draft
            </PrimaryButton>
          </div>
          <EmptyState
            body="This draft ID is not available in the demo org. Start a fresh draft to continue the isolated flow."
            title="Builder proposal draft not found"
          />
        </div>
      </div>
    );
  }

  if (projection.draft.status === "workspace_ready") {
    return <BoundaryScreen projection={projection} />;
  }

  if (projection.milestones.length === 0) {
    return (
      <TemplateBudgetScreen
        projection={projection}
        templates={dashboard.templates}
      />
    );
  }

  return <MilestoneEditorScreen projection={projection} />;
}

/* ------------------------------------------------------------------ */
/*  Template & Budget Screen                                           */
/* ------------------------------------------------------------------ */

function TemplateBudgetScreen({
  projection,
  templates,
}: {
  projection: BuilderProposalDraftProjection;
  templates: BuilderProposalTemplate[];
}) {
  const { generateMilestones } = useBuilderProposalDemo(projection.draft._id);
  const defaultTemplate =
    templates.find((template) => template.isDefault) ?? templates[0];
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(
    projection.draft.templateKey ?? defaultTemplate?.templateKey ?? ""
  );
  const [budgetText, setBudgetText] = useState(
    projection.draft.originalBudgetCents
      ? formatCurrency(projection.draft.originalBudgetCents)
      : DEFAULT_BUDGET_TEXT
  );
  const [estimatedStartDate, setEstimatedStartDate] = useState(
    projection.draft.estimatedStartDate ?? DEFAULT_START_DATE
  );
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!selectedTemplateKey && defaultTemplate) {
      setSelectedTemplateKey(defaultTemplate.templateKey);
    }
  }, [defaultTemplate, selectedTemplateKey]);

  const budgetCents = parseCurrencyToCents(budgetText);
  const budgetIsValid = Number.isFinite(budgetCents) && budgetCents > 0;

  async function handleGenerate() {
    setError("");
    if (!selectedTemplateKey) {
      setError("Select a build type template.");
      return;
    }
    if (!budgetIsValid) {
      setError("Enter a positive total project budget.");
      return;
    }
    setIsGenerating(true);
    try {
      await generateMilestones({
        draftId: projection.draft._id,
        estimatedStartDate,
        originalBudgetCents: budgetCents,
        templateKey: selectedTemplateKey,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  const visibleTemplates = templates.slice(0, 4);
  const hiddenCount = templates.length - visibleTemplates.length;

  return (
    <ProposalBuilderShell
      action={
        <PrimaryButton
          disabled={isGenerating}
          id="template-generate-button"
          onClick={handleGenerate}
          testId="builder-generate-milestones"
        >
          {isGenerating ? (
            <Loader2
              size={14}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <ArrowRight size={14} />
          )}
          Generate milestone list
        </PrimaryButton>
      }
      eyebrow={`Draft ${projection.draft.proposalNumber}`}
      rightPanel={<CinematicRoadmap animated={false} milestones={[]} />}
      step="template"
      title="Select build type and total budget"
    >
      <div
        data-testid="builder-template-screen"
        style={{ display: "grid", gap: 20 }}
      >
        {/* Template cards */}
        <div>
          <span className="pb-label">Construction template</span>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {visibleTemplates.map((template) => (
              <button
                aria-pressed={selectedTemplateKey === template.templateKey}
                className={cx(
                  "pb-template-card",
                  selectedTemplateKey === template.templateKey && "selected"
                )}
                data-ixc-ref={
                  template.templateKey === "single_family_full_build"
                    ? "UI-BUILD-TYPE-TEMPLATE"
                    : undefined
                }
                data-testid={`builder-template-card-${template.templateKey}`}
                id={
                  template.templateKey === "single_family_full_build"
                    ? "template-single-family-full-build-card"
                    : undefined
                }
                key={template.templateKey}
                onClick={() => setSelectedTemplateKey(template.templateKey)}
                type="button"
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--pb-fg)",
                  }}
                >
                  {template.title}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--pb-fg-secondary)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {template.description}
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    marginTop: 12,
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--pb-accent)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--pb-accent)",
                  }}
                >
                  {template.summary}
                </div>
              </button>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p
              style={{
                fontSize: 12,
                color: "var(--pb-fg-tertiary)",
                marginTop: 8,
              }}
            >
              +{hiddenCount} more templates available
            </p>
          )}
        </div>

        {/* Budget + Date */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <div>
            <label className="pb-label" htmlFor="total-budget-input">
              Total project budget
            </label>
            <input
              aria-label="Total project budget"
              className="pb-input"
              data-ixc-ref="UI-TOTAL-BUDGET"
              data-testid="builder-total-budget"
              id="total-budget-input"
              onBlur={() => {
                const parsed = parseCurrencyToCents(budgetText);
                if (Number.isFinite(parsed) && parsed > 0) {
                  setBudgetText(formatCurrency(parsed));
                }
              }}
              onChange={(event) => setBudgetText(event.target.value)}
              value={budgetText}
            />
          </div>
          <div>
            <label className="pb-label" htmlFor="estimated-start-input">
              Estimated start
            </label>
            <input
              aria-label="Estimated start"
              className="pb-input"
              data-ixc-ref="UI-ESTIMATED-START"
              data-testid="builder-estimated-start"
              id="estimated-start-input"
              onChange={(event) => setEstimatedStartDate(event.target.value)}
              type="date"
              value={estimatedStartDate}
            />
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="pb-alert-error" data-testid="builder-template-error">
            {error}
          </div>
        ) : null}

        {/* Info */}
        <div className="pb-alert-warning">
          Preset percentages create the first pass from the original budget.
          Later milestone edits change the running proposal budget and display a
          diff instead of forcing reconciliation.
        </div>
      </div>
    </ProposalBuilderShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Milestone Editor Screen                                             */
/* ------------------------------------------------------------------ */

function MilestoneEditorScreen({
  projection,
}: {
  projection: BuilderProposalDraftProjection;
}) {
  const {
    addBankItem,
    createCustomMilestone,
    finalizeBoundary,
    toggleMilestone,
    updateCashAvailability,
    updateMilestone,
  } = useBuilderProposalDemo(projection.draft._id);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAnim, setIsGeneratingAnim] = useState(true);
  const readiness = projection.readiness;
  const firstBlockingMilestoneKey = projection.milestones.find(
    (milestone) =>
      milestone.included &&
      (milestone.budgetCents <= 0 || milestone.durationDays <= 0)
  )?.key;

  // Trigger cinematic animation on first mount with milestones
  useEffect(() => {
    const timer = setTimeout(() => setIsGeneratingAnim(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  async function updateBudget(
    milestone: BuilderProposalMilestone,
    value: string
  ) {
    const budgetCents = parseCurrencyToCents(value);
    if (!Number.isFinite(budgetCents)) {
      setActionError("Enter a valid milestone budget.");
      return;
    }
    setActionError("");
    await updateMilestone({ budgetCents, milestoneId: milestone._id });
  }

  async function adjustBudget(
    milestone: BuilderProposalMilestone,
    deltaCents: number
  ) {
    const budgetCents = Math.max(0, milestone.budgetCents + deltaCents);
    setActionError("");
    try {
      await updateMilestone({ budgetCents, milestoneId: milestone._id });
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Budget update failed."
      );
    }
  }

  async function updateDuration(
    milestone: BuilderProposalMilestone,
    value: string
  ) {
    const durationDays = Number(value);
    if (!Number.isFinite(durationDays)) {
      setActionError("Enter a valid milestone duration.");
      return;
    }
    setActionError("");
    await updateMilestone({
      durationDays,
      milestoneId: milestone._id,
    });
  }

  async function updateCash(value: string) {
    const borrowerCashAvailabilityCents = parseCurrencyToCents(value);
    if (!Number.isFinite(borrowerCashAvailabilityCents)) {
      setActionError("Enter valid borrower cash availability.");
      return;
    }
    setActionError("");
    await updateCashAvailability({
      borrowerCashAvailabilityCents,
      draftId: projection.draft._id,
    });
  }

  async function handleContinue() {
    setActionError("");
    if (!readiness.canFinalize) {
      setActionError(
        readiness.blockingIssues[0] ?? "Resolve blockers before continuing."
      );
      const firstBlocking = document.querySelector<HTMLElement>(
        '[data-builder-blocking="true"]'
      );
      firstBlocking?.focus();
      return;
    }
    setIsSaving(true);
    try {
      await finalizeBoundary({ draftId: projection.draft._id });
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Finalization failed."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ProposalBuilderShell
      action={
        <div className="pb-action-group">
          <SecondaryButton
            id="add-bank-item-button"
            onClick={() => void addBankItem({ draftId: projection.draft._id })}
            testId="builder-add-bank-item"
          >
            <Plus size={14} />
            Add from bank
          </SecondaryButton>
          <SecondaryButton
            id="add-custom-item-button"
            onClick={() =>
              void createCustomMilestone({ draftId: projection.draft._id })
            }
            testId="builder-add-custom-milestone"
          >
            <Plus size={14} />
            Create custom item
          </SecondaryButton>
        </div>
      }
      eyebrow={`${projection.draft.templateTitle ?? "Template"} / original budget ${formatCurrency(
        projection.draft.originalBudgetCents
      )}`}
      rightPanel={
        <CinematicRoadmap
          animated={isGeneratingAnim}
          milestones={projection.milestones}
        />
      }
      step="milestones"
      title="Curate milestone scope"
    >
      <div
        className="pb-milestone-editor-layout"
        data-testid="builder-milestone-editor"
      >
        {/* Milestone table */}
        <div className="pb-milestone-list pb-scroll">
          <div className="pb-milestone-table-inner">
            <div className="pb-milestone-header">
              <span>Use</span>
              <span>Day</span>
              <span>Milestone</span>
              <span>Budget</span>
              <span>Duration</span>
              <span>Preset</span>
            </div>

            <div className="pb-milestone-rows">
              {projection.milestones.map((milestone) => {
                const isBlocking = milestone.key === firstBlockingMilestoneKey;
                return (
                  <article
                    className={cx(
                      "pb-milestone-row",
                      isBlocking && "blocking",
                      !milestone.included && "excluded"
                    )}
                    data-ixc-ref={
                      milestone.key === "permits_mobilization"
                        ? "UI-MILESTONE-ROW"
                        : undefined
                    }
                    data-testid={`builder-milestone-row-${milestone.key}`}
                    id={
                      milestone.key === "permits_mobilization"
                        ? "milestone-sitework-row"
                        : undefined
                    }
                    key={milestone._id}
                  >
                    <button
                      aria-label={milestone.included ? "Included" : "Excluded"}
                      className={cx("pb-toggle", milestone.included && "on")}
                      data-testid={`builder-milestone-toggle-${milestone.key}`}
                      onClick={() =>
                        void toggleMilestone({
                          included: !milestone.included,
                          milestoneId: milestone._id,
                        })
                      }
                      type="button"
                    >
                      <span className="pb-toggle-thumb" />
                    </button>

                    <span
                      className="pb-day-badge"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid var(--pb-accent)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: milestone.included
                          ? "var(--pb-accent)"
                          : "var(--pb-fg-tertiary)",
                        background: milestone.included
                          ? "var(--pb-accent-subdued)"
                          : "transparent",
                      }}
                    >
                      {milestone.included ? `D${milestone.dayEnd}` : "Out"}
                    </span>

                    <div className="pb-milestone-name-cell">
                      <input
                        className="pb-input"
                        defaultValue={milestone.name}
                        key={`${milestone._id}:name:${milestone.name}`}
                        onBlur={(event) =>
                          void updateMilestone({
                            milestoneId: milestone._id,
                            name: event.target.value,
                          })
                        }
                        style={{
                          background: "transparent",
                          border: "1px solid transparent",
                          padding: "4px 8px",
                          fontWeight: 600,
                          minWidth: 0,
                        }}
                      />
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--pb-fg-tertiary)",
                          marginTop: 2,
                          paddingLeft: 8,
                        }}
                      >
                        {milestone.source} · {milestone.type}
                      </p>
                    </div>

                    <div className="pb-budget-stepper">
                      <button
                        aria-label={`Subtract $1,000 from ${milestone.name} budget`}
                        className="pb-budget-stepper-button"
                        data-testid={`builder-milestone-budget-decrement-${milestone.key}`}
                        disabled={milestone.budgetCents <= 0}
                        onClick={() => {
                          adjustBudget(milestone, -100_000);
                        }}
                        type="button"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        className="pb-input pb-budget-input"
                        data-builder-blocking={isBlocking || undefined}
                        data-testid={`builder-milestone-budget-${milestone.key}`}
                        defaultValue={formatCurrency(milestone.budgetCents)}
                        key={`${milestone._id}:budget:${milestone.budgetCents}`}
                        onBlur={(event) =>
                          void updateBudget(milestone, event.target.value)
                        }
                      />
                      <button
                        aria-label={`Add $1,000 to ${milestone.name} budget`}
                        className="pb-budget-stepper-button"
                        data-testid={`builder-milestone-budget-increment-${milestone.key}`}
                        onClick={() => {
                          adjustBudget(milestone, 100_000);
                        }}
                        type="button"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <input
                      className="pb-input"
                      data-builder-blocking={
                        isBlocking && milestone.durationDays <= 0
                          ? true
                          : undefined
                      }
                      data-testid={`builder-milestone-duration-${milestone.key}`}
                      defaultValue={String(milestone.durationDays)}
                      key={`${milestone._id}:duration:${milestone.durationDays}`}
                      onBlur={(event) =>
                        void updateDuration(milestone, event.target.value)
                      }
                      style={{ fontWeight: 600, fontSize: 13 }}
                      type="number"
                    />

                    <span
                      className="pb-preset-value"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--pb-fg-tertiary)",
                      }}
                    >
                      {milestone.percentageBps
                        ? `${(milestone.percentageBps / 100).toFixed(0)}%`
                        : "custom"}
                    </span>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="pb-readiness-panel">
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--pb-fg)",
            }}
          >
            Readiness
          </h2>

          <ReadinessLine
            label="Original budget"
            value={formatCurrency(readiness.originalBudgetCents)}
          />
          <ReadinessLine
            label="Current proposal budget"
            value={formatCurrency(readiness.currentBudgetCents)}
          />
          <ReadinessLine
            label="Running diff"
            value={`${formatSignedCurrency(readiness.budgetDiffCents)} from original`}
          />
          <ReadinessLine
            label="Included milestones"
            value={`${readiness.includedCount} / ${projection.milestones.length}`}
          />

          <div>
            <label className="pb-label" htmlFor="cash-availability-input">
              Max cash availability
            </label>
            <input
              aria-label="Max cash availability"
              className="pb-input"
              data-builder-blocking={
                readiness.blockingIssues.some((issue) =>
                  issue.includes("cash availability")
                ) || undefined
              }
              data-ixc-ref="UI-CASH-AVAILABILITY"
              data-testid="builder-cash-availability"
              defaultValue={
                projection.draft.borrowerCashAvailabilityCents
                  ? formatCurrency(
                      projection.draft.borrowerCashAvailabilityCents
                    )
                  : ""
              }
              id="cash-availability-input"
              key={`cash:${projection.draft.borrowerCashAvailabilityCents ?? "empty"}`}
              onBlur={(event) => void updateCash(event.target.value)}
              placeholder="$260,000"
            />
          </div>

          <div
            className={cx(
              "pb-peak-exposure",
              projection.draft.borrowerCashAvailabilityCents &&
                readiness.peakExposureCents >
                  projection.draft.borrowerCashAvailabilityCents
                ? "warning"
                : "clear"
            )}
            data-ixc-ref="UI-PEAK-EXPOSURE"
            data-testid="builder-peak-exposure"
            id="peak-exposure-indicator"
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--pb-fg-tertiary)",
              }}
            >
              Projected peak unreimbursed exposure
            </p>
            <strong
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 18,
                fontWeight: 700,
                color: "var(--pb-fg)",
              }}
            >
              {formatCurrency(readiness.peakExposureCents)}
              {projection.draft.borrowerCashAvailabilityCents &&
              readiness.peakExposureCents >
                projection.draft.borrowerCashAvailabilityCents
                ? ", warning"
                : ", clear"}
            </strong>
          </div>

          <div
            data-testid="builder-readiness-blockers"
            style={{ display: "grid", gap: 8 }}
          >
            {readiness.blockingIssues.length ? (
              readiness.blockingIssues.map((issue) => (
                <div className="pb-alert-error" key={issue}>
                  {issue}
                </div>
              ))
            ) : (
              <div className="pb-alert-success">
                <CheckCircle2
                  size={14}
                  style={{ display: "inline", marginRight: 6 }}
                />
                Completeness checks passed
              </div>
            )}
            {readiness.warningIssues.map((issue) => (
              <div className="pb-alert-warning" key={issue}>
                <AlertTriangle
                  size={14}
                  style={{ display: "inline", marginRight: 6 }}
                />
                {issue}
              </div>
            ))}
          </div>

          {actionError ? (
            <div className="pb-alert-error" data-testid="builder-action-error">
              {actionError}
            </div>
          ) : null}

          <SecondaryButton
            id="resolve-budget-button"
            testId="builder-review-blockers"
          >
            Review blockers
          </SecondaryButton>

          <PrimaryButton
            disabled={isSaving}
            id="continue-workspace-button"
            onClick={handleContinue}
            testId="builder-continue-workspace"
          >
            {isSaving ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : null}
            Continue to workspace
            <ArrowRight size={14} />
          </PrimaryButton>
        </aside>
      </div>
    </ProposalBuilderShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Boundary Screen                                                     */
/* ------------------------------------------------------------------ */

function BoundaryScreen({
  projection,
}: {
  projection: BuilderProposalDraftProjection;
}) {
  const payload = projection.boundary?.payload;
  const milestoneCount = payload?.milestoneSequence.length ?? 0;

  return (
    <ProposalBuilderShell
      action={
        <SecondaryButton
          className="disabled:opacity-70"
          disabled
          id="boundary-disabled-workspace-preview"
          testId="builder-boundary-preview-disabled"
        >
          Workspace preview disabled
        </SecondaryButton>
      }
      eyebrow={`${projection.draft.proposalNumber} / workspace_ready`}
      rightPanel={
        <CinematicRoadmap animated={false} milestones={projection.milestones} />
      }
      step="boundary"
      title="Build Workspace starts here"
    >
      <div
        data-testid="builder-boundary-screen"
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "1.1fr 0.9fr",
        }}
      >
        <div
          style={{
            background: "var(--pb-accent-subdued)",
            border: "1px solid var(--pb-accent)",
            borderRadius: 8,
            padding: 24,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--pb-accent-glow) 0%, transparent 70%)",
              opacity: 0.3,
            }}
          />
          <CheckCircle2
            size={28}
            style={{
              color: "var(--pb-accent)",
              position: "relative",
              zIndex: 1,
            }}
          />
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--pb-fg)",
              marginTop: 12,
              position: "relative",
              zIndex: 1,
            }}
          >
            Boundary snapshot saved
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--pb-fg-secondary)",
              marginTop: 8,
              maxWidth: 480,
              lineHeight: 1.5,
              position: "relative",
              zIndex: 1,
            }}
          >
            The proposal has a workspace-compatible payload, but this demo
            intentionally stops before opening or mutating the Build Workspace
            demo.
          </p>
          <div
            data-testid="builder-boundary-payload-summary"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 6,
              border: "1px solid var(--pb-border)",
              background: "var(--pb-sunken)",
              fontFamily: "monospace",
              fontSize: 11,
              color: "var(--pb-fg-secondary)",
              position: "relative",
              zIndex: 1,
            }}
          >
            demo_workspaceBoundaryPayload: buildSummary, budget,
            milestoneSequence, dependencies, planningAssumptions
          </div>
        </div>

        <div
          style={{
            background: "var(--pb-elevated)",
            border: "1px solid var(--pb-border)",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--pb-fg)",
            }}
          >
            Frozen payload
          </h2>
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <ReadinessLine label="Milestones" value={String(milestoneCount)} />
            <ReadinessLine
              label="Budget"
              value={formatCurrency(projection.readiness.currentBudgetCents)}
            />
            <ReadinessLine
              label="Borrower cash"
              value={formatCurrency(
                projection.draft.borrowerCashAvailabilityCents ?? 0
              )}
            />
            <ReadinessLine
              label="Peak exposure"
              value={formatCurrency(projection.readiness.peakExposureCents)}
            />
          </div>
          <pre
            style={{
              marginTop: 16,
              maxHeight: 320,
              overflow: "auto",
              borderRadius: 6,
              border: "1px solid var(--pb-border)",
              background: "var(--pb-sunken)",
              padding: 12,
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--pb-fg-tertiary)",
            }}
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      </div>
    </ProposalBuilderShell>
  );
}

import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
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

const DEFAULT_BUDGET_TEXT = "$1,850,000";
const DEFAULT_START_DATE = "2026-06-01";

function cx(...classes: Array<false | null | string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function DemoFrame({
  action,
  children,
  eyebrow,
  step,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  step: "dashboard" | "template" | "milestones" | "boundary";
  title: string;
}) {
  const navItems =
    step === "dashboard"
      ? ["Dashboard", "Proposals", "Builds", "Draws", "Evidence"]
      : ["1. Template and budget", "2. Milestone editor", "3. Workspace boundary"];
  return (
    <div className="dark min-h-screen bg-background p-3 text-foreground md:p-4">
      <div className="grid min-h-[calc(100vh-1.5rem)] grid-cols-1 gap-3 md:min-h-[calc(100vh-2rem)] md:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-card/90 p-4 text-sm text-muted-foreground shadow-2xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2 font-black text-primary uppercase tracking-[0.08em]">
            {step === "dashboard" ? <LayoutDashboard size={18} /> : <ClipboardList size={18} />}
            {step === "dashboard" ? "DrawFlow" : "New proposal"}
          </div>
          <nav className="grid gap-2" aria-label="Builder proposal demo steps">
            {navItems.map((item) => {
              const active =
                (step === "dashboard" && item === "Dashboard") ||
                (step === "template" && item.startsWith("1.")) ||
                (step === "milestones" && item.startsWith("2.")) ||
                (step === "boundary" && item.startsWith("3."));
              return (
                <span
                  className={cx(
                    "rounded-md px-3 py-2 font-semibold",
                    active
                      ? "bg-primary/10 text-foreground ring-1 ring-primary/35"
                      : "text-muted-foreground"
                  )}
                  key={item}
                >
                  {item}
                </span>
              );
            })}
          </nav>
          <div className="mt-6 rounded-lg border border-border bg-background/50 p-3 text-xs leading-5">
            <strong className="text-foreground">Reimbursement only</strong>
            <p className="mt-1">
              Interest starts after funds are released. Borrower cash availability is separate from lender policy.
            </p>
          </div>
        </aside>
        <main className="min-w-0">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/90 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-black tracking-normal md:text-4xl">
                {title}
              </h1>
            </div>
            {action}
          </header>
          <section className="min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-lg border border-border bg-[oklch(0.16_0.007_286)] p-4">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}

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
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-black text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-testid={testId}
      id={id}
      onClick={onClick}
      disabled={disabled}
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
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 font-black text-foreground transition hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-testid={testId}
      id={id}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/80 p-4">
      <strong className="text-2xl font-black">{value}</strong>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function BuilderDashboardRoute() {
  const navigate = useNavigate();
  const { dashboard, isLoading, resetDemo, startDraft } = useBuilderProposalDemo();
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
    <DemoFrame
      action={
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            disabled={isResetting}
            onClick={handleReset}
            testId="builder-dashboard-reset"
          >
            <RefreshCw size={16} />
            Reset demo
          </SecondaryButton>
          <PrimaryButton
            disabled={isStarting}
            id="dashboard-new-proposal-button"
            onClick={handleStart}
            testId="builder-dashboard-new-proposal"
          >
            <Plus size={17} />
            New proposal
          </PrimaryButton>
        </div>
      }
      eyebrow={`${dashboard?.orgKey ?? "org_fairlend_demo"} / Harbor & Pine Builders`}
      step="dashboard"
      title="Builder dashboard"
    >
      <div data-testid="builder-dashboard-shell" className="grid gap-4">
        {dashboard?.needsSeed ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100">
            Template seed is being prepared. Use reset if the demo does not populate.
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-border bg-card/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="text-primary" size={20} />
              <h2 className="text-xl font-black">Proposal pipeline</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-center gap-2">
              <WalletCards className="text-primary" size={20} />
              <h2 className="text-xl font-black">Start a reimbursable build</h2>
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Choose a build type, enter a budget, tune milestones, and set borrower cash availability before workspace setup.
            </p>
            <div className="mt-4 inline-flex rounded-full border border-primary/30 bg-background/40 px-3 py-1 text-xs font-black text-primary">
              Reimbursement only
            </div>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {(dashboard?.dashboard.workspaceCards ?? []).map((card) => (
            <article
              className="rounded-lg border border-border bg-card/80 p-4"
              data-testid={`builder-dashboard-card-${card.title
                .toLowerCase()
                .replaceAll(" ", "-")}`}
              key={card.title}
            >
              <h3 className="text-lg font-black">{card.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
              {card.href ? (
                <a
                  className="mt-3 inline-flex text-sm font-black text-primary"
                  href={card.href}
                >
                  Separate workspace demo
                </a>
              ) : null}
            </article>
          ))}
        </div>
        {dashboard?.drafts.length ? (
          <div className="rounded-lg border border-border bg-card/80 p-4">
            <h2 className="text-xl font-black">Recent builder proposal drafts</h2>
            <div className="mt-3 grid gap-2">
              {dashboard.drafts.slice(0, 5).map((draft) => (
                <div
                  className="grid gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm md:grid-cols-[120px_1fr_160px_160px]"
                  data-testid="builder-dashboard-draft-row"
                  key={draft._id}
                >
                  <strong>{draft.proposalNumber}</strong>
                  <span>{draft.templateTitle ?? "Template not selected"}</span>
                  <span>{formatCurrency(draft.currentBudgetCents)}</span>
                  <span className="font-black text-primary">{draft.status}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </DemoFrame>
  );
}

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
      <DemoFrame
        action={
          <PrimaryButton disabled={isStarting} onClick={handleCreateDraft}>
            <Plus size={16} />
            Create draft
          </PrimaryButton>
        }
        eyebrow="No active draft"
        step="template"
        title="Start a proposal draft"
      >
        <EmptyState
          body="The new proposal workflow needs a stable draft ID so edits can autosave and audit events can attach to the proposal."
          title="Create a draft before selecting a template"
        />
      </DemoFrame>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <DemoFrame
        eyebrow="Loading draft"
        step="template"
        title="New proposal"
      >
        <div className="grid gap-3" data-testid="builder-proposal-loading">
          <div className="h-20 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-64 animate-pulse rounded-lg bg-muted/25" />
        </div>
      </DemoFrame>
    );
  }

  if (!projection) {
    return (
      <DemoFrame
        action={
          <PrimaryButton disabled={isStarting} onClick={handleCreateDraft}>
            <Plus size={16} />
            New stable draft
          </PrimaryButton>
        }
        eyebrow="Draft not found"
        step="template"
        title="New proposal"
      >
        <EmptyState
          body="This draft ID is not available in the demo org. Start a fresh draft to continue the isolated flow."
          title="Builder proposal draft not found"
        />
      </DemoFrame>
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

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-xl rounded-lg border border-border bg-card/80 p-6 text-center">
        <Ban className="mx-auto text-muted-foreground" size={28} />
        <h2 className="mt-3 text-xl font-black">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

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

  return (
    <DemoFrame
      action={
        <PrimaryButton
          disabled={isGenerating}
          id="template-generate-button"
          onClick={handleGenerate}
          testId="builder-generate-milestones"
        >
          <ArrowRight size={16} />
          Generate milestone list
        </PrimaryButton>
      }
      eyebrow={`Draft ${projection.draft.proposalNumber}`}
      step="template"
      title="Select build type and total budget"
    >
      <div className="grid gap-4" data-testid="builder-template-screen">
        <div className="grid gap-3 lg:grid-cols-3">
          {templates.map((template) => (
            <button
              aria-pressed={selectedTemplateKey === template.templateKey}
              className={cx(
                "min-h-44 rounded-lg border bg-card/80 p-4 text-left transition hover:border-primary/70",
                selectedTemplateKey === template.templateKey
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border"
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
              <h2 className="text-lg font-black">{template.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
              <span className="mt-4 inline-flex rounded-full border border-border px-3 py-1 text-xs font-black text-primary">
                {template.summary}
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-2 rounded-lg border border-border bg-card/80 p-4">
            <span className="text-sm font-black text-muted-foreground">
              Total project budget
            </span>
            <input
              aria-label="Total project budget"
              className="min-h-11 rounded-lg border border-input bg-background px-3 font-black outline-none ring-primary/40 focus:ring-2"
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
          </label>
          <label className="grid gap-2 rounded-lg border border-border bg-card/80 p-4">
            <span className="text-sm font-black text-muted-foreground">
              Estimated start
            </span>
            <input
              aria-label="Estimated start"
              className="min-h-11 rounded-lg border border-input bg-background px-3 font-black outline-none ring-primary/40 focus:ring-2"
              data-ixc-ref="UI-ESTIMATED-START"
              data-testid="builder-estimated-start"
              id="estimated-start-input"
              onChange={(event) => setEstimatedStartDate(event.target.value)}
              type="date"
              value={estimatedStartDate}
            />
          </label>
        </div>
        {error ? (
          <div
            className="rounded-lg border border-destructive/45 bg-destructive/15 p-4 text-sm font-black text-destructive-foreground"
            data-testid="builder-template-error"
          >
            {error}
          </div>
        ) : null}
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          Preset percentages create the first pass from the original budget. Later milestone edits change the running proposal budget and display a diff instead of forcing reconciliation.
        </div>
      </div>
    </DemoFrame>
  );
}

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
  const readiness = projection.readiness;
  const firstBlockingMilestoneKey = projection.milestones.find(
    (milestone) =>
      milestone.included &&
      (milestone.budgetCents <= 0 || milestone.durationDays <= 0)
  )?.key;

  async function updateBudget(milestone: BuilderProposalMilestone, value: string) {
    const budgetCents = parseCurrencyToCents(value);
    if (!Number.isFinite(budgetCents)) {
      setActionError("Enter a valid milestone budget.");
      return;
    }
    setActionError("");
    await updateMilestone({ budgetCents, milestoneId: milestone._id });
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
      setActionError(readiness.blockingIssues[0] ?? "Resolve blockers before continuing.");
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
      setActionError(caught instanceof Error ? caught.message : "Finalization failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DemoFrame
      action={
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            id="add-bank-item-button"
            onClick={() => void addBankItem({ draftId: projection.draft._id })}
            testId="builder-add-bank-item"
          >
            <Plus size={16} />
            Add from bank
          </SecondaryButton>
          <SecondaryButton
            id="add-custom-item-button"
            onClick={() =>
              void createCustomMilestone({ draftId: projection.draft._id })
            }
            testId="builder-add-custom-milestone"
          >
            <Plus size={16} />
            Create custom item
          </SecondaryButton>
        </div>
      }
      eyebrow={`${projection.draft.templateTitle ?? "Template"} / original budget ${formatCurrency(
        projection.draft.originalBudgetCents
      )}`}
      step="milestones"
      title="Curate milestone scope"
    >
      <div
        className="grid min-h-[calc(100vh-10rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
        data-testid="builder-milestone-editor"
      >
        <div className="min-w-0 overflow-x-auto">
          <div className="grid min-w-[980px] gap-2">
            <div className="grid grid-cols-[62px_84px_minmax(220px,1.45fr)_150px_120px_90px] gap-2 px-2 text-xs font-black uppercase text-muted-foreground">
              <span>Use</span>
              <span>Day</span>
              <span>Milestone</span>
              <span>Budget</span>
              <span>Duration</span>
              <span>Preset</span>
            </div>
            {projection.milestones.map((milestone) => {
              const isBlocking = milestone.key === firstBlockingMilestoneKey;
              return (
                <article
                  className={cx(
                    "grid grid-cols-[62px_84px_minmax(220px,1.45fr)_150px_120px_90px] items-center gap-2 rounded-lg border bg-card/80 p-2",
                    milestone.included ? "border-border" : "border-border/70 opacity-55",
                    isBlocking && "border-destructive bg-destructive/10"
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
                    className={cx(
                      "h-8 w-12 rounded-full border transition",
                      milestone.included
                        ? "border-primary bg-primary"
                        : "border-border bg-muted"
                    )}
                    data-testid={`builder-milestone-toggle-${milestone.key}`}
                    onClick={() =>
                      void toggleMilestone({
                        included: !milestone.included,
                        milestoneId: milestone._id,
                      })
                    }
                    type="button"
                  >
                    <span
                      className={cx(
                        "block h-5 w-5 rounded-full bg-foreground transition",
                        milestone.included ? "ml-5" : "ml-1"
                      )}
                    />
                  </button>
                  <span className="rounded-full border border-primary/35 bg-background px-2 py-1 text-center text-xs font-black">
                    {milestone.included ? `D${milestone.dayEnd}` : "Out"}
                  </span>
                  <div>
                    <input
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 font-black outline-none ring-primary/40 focus:border-input focus:bg-background focus:ring-2"
                      defaultValue={milestone.name}
                      key={`${milestone._id}:name:${milestone.name}`}
                      onBlur={(event) =>
                        void updateMilestone({
                          milestoneId: milestone._id,
                          name: event.target.value,
                        })
                      }
                    />
                    <p className="px-2 text-xs text-muted-foreground">
                      {milestone.source} · {milestone.type}
                    </p>
                  </div>
                  <input
                    className="min-h-10 rounded-lg border border-input bg-background px-3 font-black outline-none ring-primary/40 focus:ring-2"
                    data-builder-blocking={isBlocking || undefined}
                    data-testid={`builder-milestone-budget-${milestone.key}`}
                    defaultValue={formatCurrency(milestone.budgetCents)}
                    key={`${milestone._id}:budget:${milestone.budgetCents}`}
                    onBlur={(event) => void updateBudget(milestone, event.target.value)}
                  />
                  <input
                    className="min-h-10 rounded-lg border border-input bg-background px-3 font-black outline-none ring-primary/40 focus:ring-2"
                    data-builder-blocking={
                      isBlocking && milestone.durationDays <= 0 ? true : undefined
                    }
                    data-testid={`builder-milestone-duration-${milestone.key}`}
                    defaultValue={String(milestone.durationDays)}
                    key={`${milestone._id}:duration:${milestone.durationDays}`}
                    onBlur={(event) =>
                      void updateDuration(milestone, event.target.value)
                    }
                    type="number"
                  />
                  <span className="text-sm font-black text-muted-foreground">
                    {milestone.percentageBps
                      ? `${(milestone.percentageBps / 100).toFixed(0)}%`
                      : "custom"}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
        <aside className="grid content-start gap-3 rounded-lg border border-border bg-card/85 p-4">
          <h2 className="text-xl font-black">Readiness</h2>
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
          <label className="grid gap-2">
            <span className="text-sm font-black text-muted-foreground">
              Max cash availability
            </span>
            <input
              aria-label="Max cash availability"
              className="min-h-11 rounded-lg border border-input bg-background px-3 font-black outline-none ring-primary/40 focus:ring-2"
              data-builder-blocking={
                readiness.blockingIssues.some((issue) =>
                  issue.includes("cash availability")
                ) || undefined
              }
              data-ixc-ref="UI-CASH-AVAILABILITY"
              data-testid="builder-cash-availability"
              defaultValue={
                projection.draft.borrowerCashAvailabilityCents
                  ? formatCurrency(projection.draft.borrowerCashAvailabilityCents)
                  : ""
              }
              id="cash-availability-input"
              key={`cash:${projection.draft.borrowerCashAvailabilityCents ?? "empty"}`}
              onBlur={(event) => void updateCash(event.target.value)}
              placeholder="$260,000"
            />
          </label>
          <div
            className={cx(
              "rounded-lg border p-3",
              projection.draft.borrowerCashAvailabilityCents &&
                readiness.peakExposureCents >
                  projection.draft.borrowerCashAvailabilityCents
                ? "border-amber-400/40 bg-amber-500/10"
                : "border-primary/35 bg-primary/10"
            )}
            data-ixc-ref="UI-PEAK-EXPOSURE"
            data-testid="builder-peak-exposure"
            id="peak-exposure-indicator"
          >
            <p className="text-xs font-black text-muted-foreground">
              Projected peak unreimbursed exposure
            </p>
            <strong className="mt-1 block text-lg">
              {formatCurrency(readiness.peakExposureCents)}
              {projection.draft.borrowerCashAvailabilityCents &&
              readiness.peakExposureCents >
                projection.draft.borrowerCashAvailabilityCents
                ? ", warning"
                : ", clear"}
            </strong>
          </div>
          <div
            className="grid gap-2 text-sm"
            data-testid="builder-readiness-blockers"
          >
            {readiness.blockingIssues.length ? (
              readiness.blockingIssues.map((issue) => (
                <div
                  className="rounded-lg border border-destructive/45 bg-destructive/15 p-3 font-black text-destructive-foreground"
                  key={issue}
                >
                  {issue}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-primary/35 bg-primary/10 p-3 font-black text-primary">
                <CheckCircle2 className="mr-2 inline" size={16} />
                Completeness checks passed
              </div>
            )}
            {readiness.warningIssues.map((issue) => (
              <div
                className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-amber-100"
                key={issue}
              >
                <AlertTriangle className="mr-2 inline" size={16} />
                {issue}
              </div>
            ))}
          </div>
          {actionError ? (
            <div
              className="rounded-lg border border-destructive/45 bg-destructive/15 p-3 text-sm font-black text-destructive-foreground"
              data-testid="builder-action-error"
            >
              {actionError}
            </div>
          ) : null}
          <SecondaryButton id="resolve-budget-button" testId="builder-review-blockers">
            Review blockers
          </SecondaryButton>
          <PrimaryButton
            disabled={isSaving}
            id="continue-workspace-button"
            onClick={handleContinue}
            testId="builder-continue-workspace"
          >
            Continue to workspace
            <ArrowRight size={16} />
          </PrimaryButton>
        </aside>
      </div>
    </DemoFrame>
  );
}

function ReadinessLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}

function BoundaryScreen({
  projection,
}: {
  projection: BuilderProposalDraftProjection;
}) {
  const payload = projection.boundary?.payload;
  const milestoneCount = payload?.milestoneSequence.length ?? 0;
  return (
    <DemoFrame
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
      step="boundary"
      title="Build Workspace starts here"
    >
      <div
        className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
        data-testid="builder-boundary-screen"
      >
        <div className="rounded-lg border border-primary/35 bg-primary/10 p-5">
          <CheckCircle2 className="text-primary" size={28} />
          <h2 className="mt-3 text-2xl font-black">Boundary snapshot saved</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The proposal has a workspace-compatible payload, but this demo intentionally stops before opening or mutating the Build Workspace demo.
          </p>
          <div
            className="mt-4 rounded-lg border border-border bg-background/50 p-3 font-mono text-xs"
            data-testid="builder-boundary-payload-summary"
          >
            demo_workspaceBoundaryPayload: buildSummary, budget, milestoneSequence,
            dependencies, planningAssumptions
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card/85 p-5">
          <h2 className="text-xl font-black">Frozen payload</h2>
          <div className="mt-4 grid gap-2 text-sm">
            <ReadinessLine
              label="Milestones"
              value={String(milestoneCount)}
            />
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
          <pre className="mt-4 max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      </div>
    </DemoFrame>
  );
}

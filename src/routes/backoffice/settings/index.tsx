import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Copy,
  Database,
  GitBranch,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  getVisualParitySettings,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { coerceSiteVisitGuidance } from "#/lib/site-visit-guidance.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../../convex/_generated/api";
import {
  TOTAL_BPS,
  createBlankScenario,
  duplicateScenario,
  formatBps,
  formatDay,
  getActiveScenario,
  includedDurationDays,
  includedPocTotalBps,
  normalizeTimelineSettingsProjection,
  parsePercentToBps,
  scenarioDrawTotalBps,
  TIMELINE_DEMO_SETTINGS_CONTRACT_REFS,
  milestoneEndDay,
  milestoneStartDay,
  type TimelineSettingsDrawDraft,
  type TimelineSettingsScenarioDraft,
  type TimelineSettingsTemplateDraft,
  validateScenarioDrafts,
  validateTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import {
  getCashflowCompoundExtent,
  TimelineCashflowCompoundChart,
  type TimelineCashflowCompoundDatum,
} from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import {
  TimelineMilestoneWorksheetTable,
  type TimelineMilestoneWorksheetRow,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";

export const Route = createFileRoute("/backoffice/settings/")({
  component: RouteComponent,
});

type ActiveTab = "template" | "scenarios";
type PendingConfirmation = "seed" | "save" | null;
const SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS = 1_000_000;
const SETTINGS_TAB_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
} as const;
const SETTINGS_TAB_REDUCED_TRANSITION = { duration: 0 } as const;
const SETTINGS_TAB_PANEL_VARIANTS = {
  enter: ({
    direction,
    reducedMotion,
  }: {
    direction: number;
    reducedMotion: boolean;
  }) => ({
    opacity: reducedMotion ? 1 : 0,
    scale: reducedMotion ? 1 : 0.992,
    x: reducedMotion ? 0 : direction * 18,
  }),
  exit: ({
    direction,
    reducedMotion,
  }: {
    direction: number;
    reducedMotion: boolean;
  }) => ({
    opacity: reducedMotion ? 1 : 0,
    scale: reducedMotion ? 1 : 0.996,
    x: reducedMotion ? 0 : direction * -12,
  }),
  show: {
    opacity: 1,
    scale: 1,
    x: 0,
  },
};

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const productionSettingsQuery = useQuery(
    api.production_proposals.getProductionProposalSettings,
    visualFixtureEnabled ? "skip" : { workosOrganizationId },
  );
  const productionSettings = visualFixtureEnabled
    ? getVisualParitySettings()
    : productionSettingsQuery;
  const seedProductionDefaultsToProd = useMutation(
    api.production_proposals.seedProductionDefaultsToProd,
  );
  const saveProductionTemplate = useMutation(
    api.production_proposals.saveProductionProposalTemplateConfiguration,
  );
  const deleteProductionScenario = useMutation(
    api.production_proposals.deleteProductionDrawScenario,
  );
  const resetProductionTemplate = useMutation(
    api.production_proposals.resetProductionTemplateToDefaults,
  );
  const resetProductionScenario = useMutation(
    api.production_proposals.resetProductionDrawScenarioToDefaults,
  );
  const settings = useQuery(api.demo_settings.getTimelineDemoSettings, {});
  const seedDefaults = useMutation(api.demo_settings.seedTimelineDemoDefaults);
  const saveTemplate = useMutation(
    api.demo_settings.saveTimelineTemplateConfiguration,
  );
  const deleteScenarioMutation = useMutation(
    api.demo_settings.deleteTimelineDrawScenario,
  );
  const resetTemplate = useMutation(
    api.demo_settings.resetTimelineTemplateToDefaults,
  );
  const resetScenario = useMutation(
    api.demo_settings.resetTimelineDrawScenarioToDefaults,
  );

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_32rem),var(--bg-base)] px-4 py-5 text-fg-primary sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1800px] gap-5">
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 w-fit">
              Backoffice / Settings
            </Badge>
            <h1 className="font-semibold text-3xl tracking-normal sm:text-4xl">
              Settings
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
              Production proposal-flow settings are tenant scoped and now use
              the same full timeline settings workspace as the demo reference.
            </p>
          </div>
        </header>

        <TimelineSettingsWorkspace
          labels={{
            emptyBody:
              "Seed tenant-scoped production defaults to create proposal templates, milestone worksheets, draw scenarios, and workflow rules.",
            emptyTitle: "Production defaults needed",
            eyebrow: "Production proposal settings",
            loadingText: "Loading production proposal settings...",
            sectionLabel: "Production",
            seedButtonLabel: "Seed defaults to prod",
            seedConfirmBody:
              "This upserts production proposal templates, milestone worksheets, draw scenario rows, and workflow rules for the current WorkOS organization.",
            seedConfirmTitle: "Seed production defaults?",
            title: "Settings workspace",
          }}
          onDeleteScenario={(template, scenario) =>
            deleteProductionScenario({
              scenarioKey: scenario.scenarioKey,
              templateKey: template.templateKey,
              workosOrganizationId,
            })
          }
          onResetScenario={(template, scenarioKey) =>
            resetProductionScenario({
              scenarioKey,
              templateKey: template.templateKey,
              workosOrganizationId,
            })
          }
          onResetTemplate={(template) =>
            resetProductionTemplate({
              templateKey: template.templateKey,
              workosOrganizationId,
            })
          }
          onSaveTemplate={(template) =>
            saveProductionTemplate({
              milestones: template.milestones,
              scenarios: template.scenarios,
              template: {
                description: template.description,
                isDefault: template.isDefault,
                summary: template.summary,
                templateKey: template.templateKey,
                title: template.title,
              },
              workosOrganizationId,
            })
          }
          onSeedDefaults={() =>
            seedProductionDefaultsToProd({ workosOrganizationId })
          }
          seedSuccessMessage={(result) =>
            `Seeded ${result.templates} production templates, ${result.milestones} milestones, and ${result.draws ?? 0} draw rows.`
          }
          settings={productionSettings}
        />

        <TimelineSettingsWorkspace
          labels={{
            emptyBody:
              "Seed deletes existing timeline demo templates, worksheet rows, scenarios, and draw rows before restoring the canonical defaults.",
            emptyTitle: "Configuration needed",
            eyebrow: "Timeline demo",
            loadingText: "Loading timeline demo settings...",
            sectionLabel: "Demos",
            seedButtonLabel: "Seed defaults",
            seedConfirmBody:
              "This deletes existing timeline demo templates, worksheet rows, scenarios, and draw rows before restoring the canonical defaults.",
            seedConfirmTitle: "Reset timeline demo defaults?",
            title: "Settings workspace",
          }}
          onDeleteScenario={(_template, scenario) =>
            deleteScenarioMutation({
              scenarioKey: scenario.scenarioKey,
              templateKey: _template.templateKey,
            })
          }
          onResetScenario={(template, scenarioKey) =>
            resetScenario({
              scenarioKey,
              templateKey: template.templateKey,
            })
          }
          onResetTemplate={(template) =>
            resetTemplate({ templateKey: template.templateKey })
          }
          onSaveTemplate={(template) =>
            saveTemplate({
              milestones: template.milestones,
              scenarios: template.scenarios,
              template: {
                description: template.description,
                isDefault: template.isDefault,
                summary: template.summary,
                templateKey: template.templateKey,
                title: template.title,
              },
            })
          }
          onSeedDefaults={() => seedDefaults({})}
          seedSuccessMessage={(result) =>
            `Seeded ${result.templates} templates, ${result.milestones} milestones, ${result.scenarios} scenarios.`
          }
          settings={settings}
          traceRefs={[
            TIMELINE_DEMO_SETTINGS_CONTRACT_REFS.worksheet,
            TIMELINE_DEMO_SETTINGS_CONTRACT_REFS.scenario,
          ]}
        />
      </div>
    </main>
  );
}

type TimelineSettingsWorkspaceLabels = {
  emptyBody: string;
  emptyTitle: string;
  eyebrow: string;
  loadingText: string;
  sectionLabel: string;
  seedButtonLabel: string;
  seedConfirmBody: string;
  seedConfirmTitle: string;
  title: string;
};

type TimelineSettingsMutationResult =
  | { settings?: unknown; [key: string]: unknown }
  | unknown;

export function TimelineSettingsWorkspace({
  labels,
  onDeleteScenario,
  onResetScenario,
  onResetTemplate,
  onSaveTemplate,
  onSeedDefaults,
  seedSuccessMessage,
  settings,
  traceRefs = [],
}: {
  labels: TimelineSettingsWorkspaceLabels;
  onDeleteScenario: (
    template: TimelineSettingsTemplateDraft,
    scenario: TimelineSettingsScenarioDraft,
  ) => Promise<TimelineSettingsMutationResult>;
  onResetScenario: (
    template: TimelineSettingsTemplateDraft,
    scenarioKey: string,
  ) => Promise<TimelineSettingsMutationResult>;
  onResetTemplate: (
    template: TimelineSettingsTemplateDraft,
  ) => Promise<TimelineSettingsMutationResult>;
  onSaveTemplate: (
    template: TimelineSettingsTemplateDraft,
  ) => Promise<TimelineSettingsMutationResult>;
  onSeedDefaults: () => Promise<TimelineSettingsMutationResult>;
  seedSuccessMessage?: (result: any) => string;
  settings: any;
  traceRefs?: readonly (readonly string[])[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const canonicalTemplates = useMemo(
    () => normalizeTimelineSettingsProjection(settings),
    [settings],
  );
  const [drafts, setDrafts] = useState<TimelineSettingsTemplateDraft[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [selectedScenarioKeyByTemplate, setSelectedScenarioKeyByTemplate] =
    useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("template");
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirtyTemplates, setDirtyTemplates] = useState<Record<string, boolean>>(
    {},
  );
  const [dirtyScenarios, setDirtyScenarios] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (canonicalTemplates.length === 0) {
      setDrafts([]);
      return;
    }
    setDrafts((current) =>
      current.length > 0 ? current : canonicalTemplates,
    );
    setSelectedTemplateKey((current) =>
      canonicalTemplates.some((template) => template.templateKey === current)
        ? current
        : canonicalTemplates[0]?.templateKey || "",
    );
    setSelectedScenarioKeyByTemplate((current) => {
      const next = { ...current };
      for (const template of canonicalTemplates) {
        next[template.templateKey] =
          next[template.templateKey] ||
          getActiveScenario(template)?.scenarioKey ||
          template.scenarios[0]?.scenarioKey ||
          "";
      }
      return next;
    });
  }, [canonicalTemplates]);

  const selectedTemplate =
    drafts.find((template) => template.templateKey === selectedTemplateKey) ??
    drafts[0] ??
    null;
  const selectedScenario = selectedTemplate
    ? (selectedTemplate.scenarios.find(
        (scenario) =>
          scenario.scenarioKey ===
          selectedScenarioKeyByTemplate[selectedTemplate.templateKey],
      ) ??
      selectedTemplate.scenarios[0] ??
      null)
    : null;
  const templateValidation = selectedTemplate
    ? validateTemplateDraft(selectedTemplate)
    : { errors: {}, ok: false, warnings: [] };
  const scenarioValidation = selectedTemplate
    ? validateScenarioDrafts(selectedTemplate.scenarios, selectedTemplate)
    : { errors: {}, ok: false, warnings: [] };
  const canSave = Boolean(
    selectedTemplate && templateValidation.ok && scenarioValidation.ok,
  );
  const tabMotionCustom = {
    direction: activeTab === "scenarios" ? 1 : -1,
    reducedMotion: Boolean(prefersReducedMotion),
  };
  const tabMotionTransition = prefersReducedMotion
    ? SETTINGS_TAB_REDUCED_TRANSITION
    : SETTINGS_TAB_TRANSITION;
  const requiresSeed =
    !settings ||
    canonicalTemplates.length === 0 ||
    (settings.completeness?.missingTemplateKeys?.length ?? 0) > 0;

  function setTemplatesFromResult(result: TimelineSettingsMutationResult) {
    const projection =
      result && typeof result === "object" && "settings" in result
        ? (result as { settings?: unknown }).settings
        : result;
    const nextTemplates = normalizeTimelineSettingsProjection(
      projection as any,
    );
    setDrafts(nextTemplates);
    setSelectedTemplateKey((current) =>
      nextTemplates.some((template) => template.templateKey === current)
        ? current
        : nextTemplates[0]?.templateKey || "",
    );
    setSelectedScenarioKeyByTemplate(
      Object.fromEntries(
        nextTemplates.map((template) => [
          template.templateKey,
          getActiveScenario(template)?.scenarioKey ||
            template.scenarios[0]?.scenarioKey ||
            "",
        ]),
      ),
    );
    setDirtyTemplates({});
    setDirtyScenarios({});
  }

  function updateSelectedTemplate(
    updater: (
      template: TimelineSettingsTemplateDraft,
    ) => TimelineSettingsTemplateDraft,
    dirtyKind: "scenario" | "template",
  ) {
    if (!selectedTemplate) {
      return;
    }
    setDrafts((current) =>
      current.map((template) =>
        template.templateKey === selectedTemplate.templateKey
          ? updater(template)
          : template,
      ),
    );
    if (dirtyKind === "template") {
      setDirtyTemplates((current) => ({
        ...current,
        [selectedTemplate.templateKey]: true,
      }));
    } else {
      setDirtyScenarios((current) => ({
        ...current,
        [selectedTemplate.templateKey]: true,
      }));
    }
  }

  async function handleSeedDefaults() {
    setSaving(true);
    setActionError("");
    try {
      const result = await onSeedDefaults();
      setTemplatesFromResult(result);
      toast.success(
        seedSuccessMessage?.(result) ??
          `Seeded ${canonicalTemplates.length} templates.`,
      );
      setPendingConfirmation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Seed failed.";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!selectedTemplate || !canSave) {
      setActionError(
        "Resolve worksheet and scenario validation before saving.",
      );
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const result = await onSaveTemplate(selectedTemplate);
      toast.success(`${selectedTemplate.title} saved.`);
      setTemplatesFromResult(result);
      setPendingConfirmation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteScenario(scenario: TimelineSettingsScenarioDraft) {
    if (!selectedTemplate) {
      return;
    }
    if (scenario.isActive) {
      setActionError("Active scenario cannot be deleted.");
      return;
    }
    const canonicalTemplate = canonicalTemplates.find(
      (template) => template.templateKey === selectedTemplate.templateKey,
    );
    const persisted = Boolean(
      canonicalTemplate?.scenarios.some(
        (row) => row.scenarioKey === scenario.scenarioKey,
      ),
    );
    if (persisted) {
      try {
        const result = await onDeleteScenario(selectedTemplate, scenario);
        setTemplatesFromResult(result);
        toast.success("Scenario deleted.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Delete failed.";
        setActionError(message);
        toast.error(message);
      }
      return;
    }
    updateSelectedTemplate(
      (template) => ({
        ...template,
        scenarios: template.scenarios.filter(
          (row) => row.scenarioKey !== scenario.scenarioKey,
        ),
      }),
      "scenario",
    );
  }

  async function handleResetTemplate() {
    if (!selectedTemplate) {
      return;
    }
    try {
      const result = await onResetTemplate(selectedTemplate);
      setTemplatesFromResult(result);
      toast.success(`${selectedTemplate.title} reset.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed.";
      setActionError(message);
      toast.error(message);
    }
  }

  async function handleResetScenario(scenarioKey: string) {
    if (!selectedTemplate) {
      return;
    }
    try {
      const result = await onResetScenario(selectedTemplate, scenarioKey);
      setTemplatesFromResult(result);
      toast.success("Scenario reset.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed.";
      setActionError(message);
      toast.error(message);
    }
  }

  return (
    <>
      <StatusStrip settings={settings} templates={drafts} />
      <section className="grid gap-3">
        <div
          aria-label="Settings sections"
          className="inline-flex w-fit rounded-lg bg-muted p-1"
          role="tablist"
        >
          <button
            aria-selected="true"
            className={tabClass(true)}
            role="tab"
            type="button"
          >
            {labels.sectionLabel}
            <Badge className="ml-2" variant="success">
              Active
            </Badge>
          </button>
        </div>
        <Frame className="min-w-0 overflow-hidden rounded-lg">
          <FramePanel className="overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b bg-muted/40 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                  {labels.eyebrow}
                </div>
                <h2 className="font-semibold text-xl tracking-normal">
                  {labels.title}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {traceRefs.map((ids) => (
                  <TraceBadge ids={ids} key={ids.join(":")} />
                ))}
                <Button
                  onClick={() => setPendingConfirmation("seed")}
                  size="sm"
                  variant={requiresSeed ? "default" : "outline"}
                >
                  <Database />
                  {labels.seedButtonLabel}
                </Button>
                <Button
                  disabled={!selectedTemplate}
                  onClick={() => setPendingConfirmation("save")}
                  size="sm"
                >
                  <Save />
                  Save template
                </Button>
              </div>
            </div>

            {settings === undefined ? (
              <div className="p-6 text-muted-foreground text-sm">
                {labels.loadingText}
              </div>
            ) : drafts.length === 0 ? (
              <EmptySeedState
                body={labels.emptyBody}
                onSeed={() => setPendingConfirmation("seed")}
                seedButtonLabel={labels.seedButtonLabel}
                title={labels.emptyTitle}
              />
            ) : (
              <motion.div
                className={cn(
                  "grid min-h-[760px] gap-0",
                  activeTab === "scenarios"
                    ? "lg:grid-cols-[150px_minmax(0,1fr)]"
                    : "lg:grid-cols-[300px_minmax(0,1fr)]",
                )}
                layout={!prefersReducedMotion}
                transition={tabMotionTransition}
              >
                <TemplateRail
                  activeTab={activeTab}
                  dirtyScenarios={dirtyScenarios}
                  dirtyTemplates={dirtyTemplates}
                  onSelect={(templateKey) => {
                    setSelectedTemplateKey(templateKey);
                    setActionError("");
                  }}
                  selectedTemplateKey={selectedTemplate?.templateKey ?? ""}
                  templates={drafts}
                  reducedMotion={Boolean(prefersReducedMotion)}
                />

                {selectedTemplate ? (
                  <div className="min-w-0">
                    <div className="sticky top-0 z-10 border-b bg-card/95 px-4 py-3 backdrop-blur">
                      <div className="inline-flex w-fit rounded-lg bg-muted p-1">
                        <button
                          className={tabClass(activeTab === "template")}
                          onClick={() => setActiveTab("template")}
                          type="button"
                        >
                          Template settings
                        </button>
                        <button
                          className={tabClass(activeTab === "scenarios")}
                          onClick={() => setActiveTab("scenarios")}
                          type="button"
                        >
                          Draw scenarios
                        </button>
                      </div>
                    </div>

                    {actionError ? (
                      <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive text-sm">
                        {actionError}
                      </div>
                    ) : null}

                    <AnimatePresence
                      custom={tabMotionCustom}
                      initial={false}
                      mode="wait"
                    >
                      {activeTab === "template" ? (
                        <motion.div
                          animate="show"
                          className="min-w-0 transform-gpu"
                          custom={tabMotionCustom}
                          exit="exit"
                          initial="enter"
                          key="template-settings"
                          transition={tabMotionTransition}
                          variants={SETTINGS_TAB_PANEL_VARIANTS}
                        >
                          <TemplateSettingsTab
                            onReset={() => void handleResetTemplate()}
                            onUpdate={(updater) =>
                              updateSelectedTemplate(updater, "template")
                            }
                            template={selectedTemplate}
                            validation={templateValidation}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          animate="show"
                          className="min-w-0 transform-gpu"
                          custom={tabMotionCustom}
                          exit="exit"
                          initial="enter"
                          key="draw-scenarios"
                          transition={tabMotionTransition}
                          variants={SETTINGS_TAB_PANEL_VARIANTS}
                        >
                          <ScenarioSettingsTab
                            onDelete={handleDeleteScenario}
                            onDuplicate={() => {
                              if (!selectedScenario) {
                                return;
                              }
                              const duplicated = duplicateScenario(
                                selectedScenario,
                                selectedTemplate.scenarios,
                              );
                              updateSelectedTemplate(
                                (template) => ({
                                  ...template,
                                  scenarios: [
                                    ...template.scenarios,
                                    duplicated,
                                  ],
                                }),
                                "scenario",
                              );
                              setSelectedScenarioKeyByTemplate((current) => ({
                                ...current,
                                [selectedTemplate.templateKey]:
                                  duplicated.scenarioKey,
                              }));
                            }}
                            onNew={() => {
                              const created = createBlankScenario(
                                selectedTemplate.scenarios,
                                selectedTemplate,
                              );
                              updateSelectedTemplate(
                                (template) => ({
                                  ...template,
                                  scenarios: [...template.scenarios, created],
                                }),
                                "scenario",
                              );
                              setSelectedScenarioKeyByTemplate((current) => ({
                                ...current,
                                [selectedTemplate.templateKey]:
                                  created.scenarioKey,
                              }));
                            }}
                            onReset={(scenarioKey) =>
                              void handleResetScenario(scenarioKey)
                            }
                            onSelectScenario={(scenarioKey) =>
                              setSelectedScenarioKeyByTemplate((current) => ({
                                ...current,
                                [selectedTemplate.templateKey]: scenarioKey,
                              }))
                            }
                            onSetActive={() => {
                              if (!selectedScenario) {
                                return;
                              }
                              updateSelectedTemplate(
                                (template) => ({
                                  ...template,
                                  scenarios: template.scenarios.map(
                                    (scenario) => ({
                                      ...scenario,
                                      isActive:
                                        scenario.scenarioKey ===
                                        selectedScenario.scenarioKey,
                                    }),
                                  ),
                                }),
                                "scenario",
                              );
                            }}
                            onUpdate={(updater) =>
                              updateSelectedTemplate(updater, "scenario")
                            }
                            selectedScenario={selectedScenario}
                            template={selectedTemplate}
                            validation={scenarioValidation}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : null}
              </motion.div>
            )}
          </FramePanel>
        </Frame>
      </section>
      <ConfirmationModal
        canSave={canSave}
        kind={pendingConfirmation}
        labels={labels}
        onClose={() => setPendingConfirmation(null)}
        onConfirm={
          pendingConfirmation === "seed"
            ? handleSeedDefaults
            : handleSaveTemplate
        }
        saving={saving}
        scenario={selectedScenario}
        scenarioValidation={scenarioValidation}
        template={selectedTemplate}
        templateValidation={templateValidation}
      />
    </>
  );
}

function StatusStrip({
  settings,
  templates,
}: {
  settings: any;
  templates: TimelineSettingsTemplateDraft[];
}) {
  const milestoneCount = templates.reduce(
    (total, template) => total + template.milestones.length,
    0,
  );
  const scenarioCount = templates.reduce(
    (total, template) => total + template.scenarios.length,
    0,
  );
  const readyCount =
    settings?.completeness?.readyTemplateCount ??
    templates.filter((template) => getActiveScenario(template)).length;
  return (
    <Card className="grid overflow-hidden rounded-lg sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Templates" value={`${templates.length || 0} loaded`} />
      <Metric label="Worksheets" value={`${milestoneCount} milestones`} />
      <Metric label="Scenarios" value={`${scenarioCount} configured`} />
      <Metric
        label="Active state"
        value={`${readyCount} of ${settings?.completeness?.requiredTemplateCount ?? 3} valid`}
      />
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-4 sm:border-r xl:border-b-0">
      <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function EmptySeedState({
  body,
  onSeed,
  seedButtonLabel,
  title,
}: {
  body: string;
  onSeed: () => void;
  seedButtonLabel: string;
  title: string;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center p-6">
      <FramePanel className="max-w-lg bg-muted/40 text-center">
        <Database className="mx-auto mb-3 size-8 text-primary" />
        <h3 className="font-semibold text-xl">{title}</h3>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {body}
        </p>
        <Button className="mt-4" onClick={onSeed}>
          {seedButtonLabel}
        </Button>
      </FramePanel>
    </div>
  );
}

function TemplateRail({
  activeTab,
  dirtyScenarios,
  dirtyTemplates,
  onSelect,
  reducedMotion,
  selectedTemplateKey,
  templates,
}: {
  activeTab: ActiveTab;
  dirtyScenarios: Record<string, boolean>;
  dirtyTemplates: Record<string, boolean>;
  onSelect: (templateKey: string) => void;
  reducedMotion: boolean;
  selectedTemplateKey: string;
  templates: TimelineSettingsTemplateDraft[];
}) {
  return (
    <motion.aside
      className="border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r"
      layout={!reducedMotion}
      transition={
        reducedMotion
          ? SETTINGS_TAB_REDUCED_TRANSITION
          : SETTINGS_TAB_TRANSITION
      }
    >
      <div className="grid gap-2">
        {templates.map((template) => {
          const totalPoc = includedPocTotalBps(template);
          const activeScenario = getActiveScenario(template);
          const dirty =
            dirtyTemplates[template.templateKey] ||
            dirtyScenarios[template.templateKey];
          return (
            <Card
              className={cn(
                "grid min-w-0 gap-1 overflow-hidden rounded-lg p-3 text-left text-sm transition hover:border-primary/50",
                selectedTemplateKey === template.templateKey &&
                  "border-primary/60 bg-primary/10",
                activeTab === "scenarios" && "p-2",
              )}
              key={template.templateKey}
              onClick={() => onSelect(template.templateKey)}
              render={<button type="button" />}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <strong className="min-w-0 truncate">
                  {template.title.replace("Single Family ", "")}
                </strong>
                {dirty ? (
                  <Badge className="shrink-0" variant="warning">
                    Unsaved
                  </Badge>
                ) : null}
              </div>
              <span className="min-w-0 truncate text-muted-foreground text-xs">
                {template.milestones.length} milestones, {formatBps(totalPoc)},{" "}
                {formatDay(includedDurationDays(template))}
              </span>
              {activeScenario ? (
                <Badge
                  variant="success"
                  className="max-w-full min-w-0 justify-start overflow-hidden whitespace-nowrap"
                >
                  <span className="min-w-0 truncate">
                    Active: {activeScenario.name}
                  </span>
                </Badge>
              ) : (
                <Badge
                  variant="warning"
                  className="max-w-full min-w-0 justify-start overflow-hidden whitespace-nowrap"
                >
                  <span className="min-w-0 truncate">
                    Missing active scenario
                  </span>
                </Badge>
              )}
            </Card>
          );
        })}
      </div>
    </motion.aside>
  );
}

function TemplateSettingsTab({
  onReset,
  onUpdate,
  template,
  validation,
}: {
  onReset: () => void;
  onUpdate: (
    updater: (
      template: TimelineSettingsTemplateDraft,
    ) => TimelineSettingsTemplateDraft,
  ) => void;
  template: TimelineSettingsTemplateDraft;
  validation: ReturnType<typeof validateTemplateDraft>;
}) {
  const rows = useMemo(() => templateToWorksheetRows(template), [template]);
  const validationError = validation.ok
    ? ""
    : Object.values(validation.errors)[0];
  const activeScenario = getActiveScenario(template);

  return (
    <TimelineMilestoneWorksheetTable
      error={validationError}
      footerExtra={
        <div className="timeline-blueprint-metric">
          <span>Active scenario</span>
          <strong>{activeScenario?.name ?? "Missing"}</strong>
        </div>
      }
      mode="settings"
      onReset={onReset}
      onRowsChange={(nextRows) =>
        onUpdate((current) => worksheetRowsToTemplate(current, nextRows))
      }
      rows={rows}
      templateTitle={template.title}
    />
  );
}

function templateToWorksheetRows(
  template: TimelineSettingsTemplateDraft,
): TimelineMilestoneWorksheetRow[] {
  return template.milestones
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey),
    )
    .map((milestone, index) => ({
      baseItemId: milestone.milestoneKey,
      budgetText: formatBps(milestone.percentageBps),
      dependencyKeys: milestone.dependencyKeys,
      durationDays: milestone.durationDays,
      durationText: String(milestone.durationDays),
      excluded: !milestone.included,
      icon: milestone.icon,
      key: milestone.milestoneKey,
      name: milestone.name,
      order: index,
      percentageBps: milestone.percentageBps,
      percentageText: formatBps(milestone.percentageBps),
      siteVisitGuidance: milestone.siteVisitGuidance,
      subMilestoneDetails: milestone.submilestones
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((submilestone) => ({
          budgetText: formatBps(submilestone.percentageBps),
          description: submilestone.description,
          durationText: String(submilestone.durationDays),
          id: submilestone.submilestoneKey,
          name: submilestone.name,
          percentageBps: submilestone.percentageBps,
          percentageText: formatBps(submilestone.percentageBps),
        })),
      subMilestones: milestone.submilestones
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((submilestone) => submilestone.name),
      type: milestone.type,
    }));
}

function worksheetRowsToTemplate(
  template: TimelineSettingsTemplateDraft,
  rows: TimelineMilestoneWorksheetRow[],
): TimelineSettingsTemplateDraft {
  return {
    ...template,
    milestones: rows.map((row, order) => ({
      dependencyKeys: row.dependencyKeys,
      durationDays: positiveInteger(row.durationText, row.durationDays),
      icon: row.icon,
      included: !row.excluded,
      milestoneKey: row.key,
      name: row.name,
      order,
      percentageBps: finiteBps(row.percentageBps),
      siteVisitGuidance: coerceSiteVisitGuidance(row.siteVisitGuidance),
      submilestones: row.subMilestoneDetails.map((submilestone, subOrder) => ({
        description: submilestone.description,
        durationDays: positiveInteger(submilestone.durationText, 1),
        name: submilestone.name,
        order: subOrder,
        percentageBps: finiteBps(
          submilestone.percentageBps ??
            parsePercentToBps(submilestone.percentageText ?? "0"),
        ),
        submilestoneKey: submilestone.id,
      })),
      type: row.type,
    })),
  };
}

function ScenarioSettingsTab({
  onDelete,
  onDuplicate,
  onNew,
  onReset,
  onSelectScenario,
  onSetActive,
  onUpdate,
  selectedScenario,
  template,
  validation,
}: {
  onDelete: (scenario: TimelineSettingsScenarioDraft) => void;
  onDuplicate: () => void;
  onNew: () => void;
  onReset: (scenarioKey: string) => void;
  onSelectScenario: (scenarioKey: string) => void;
  onSetActive: () => void;
  onUpdate: (
    updater: (
      template: TimelineSettingsTemplateDraft,
    ) => TimelineSettingsTemplateDraft,
  ) => void;
  selectedScenario: TimelineSettingsScenarioDraft | null;
  template: TimelineSettingsTemplateDraft;
  validation: ReturnType<typeof validateScenarioDrafts>;
}) {
  return (
    <div>
      <div
        className="grid gap-3 border-b bg-muted/30 p-4 xl:grid-cols-[260px_minmax(0,1fr)_auto] xl:items-center"
        data-testid="timeline-settings-scenario-header"
      >
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
            Scenario
          </span>
          <Select
            items={template.scenarios.map((scenario) => ({
              label: scenario.name,
              value: scenario.scenarioKey,
            }))}
            onValueChange={(value) => {
              if (typeof value === "string") {
                onSelectScenario(value);
              }
            }}
            value={selectedScenario?.scenarioKey ?? ""}
          >
            <SelectTrigger aria-label="Scenario" className="h-10 font-medium">
              <SelectValue placeholder="Select scenario" />
            </SelectTrigger>
            <SelectPopup>
              {template.scenarios.map((scenario) => (
                <SelectItem
                  key={scenario.scenarioKey}
                  value={scenario.scenarioKey}
                >
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-sm">
          <strong>{selectedScenario?.name ?? "No scenario selected"}</strong>
          <span>{selectedScenario?.draws.length ?? 0} draws</span>
          <span>
            {selectedScenario
              ? formatBps(scenarioDrawTotalBps(selectedScenario))
              : "0.00%"}
          </span>
          {selectedScenario?.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : null}
          {selectedScenario ? (
            <span>
              Day {selectedScenario.draws[0]?.timingDay ?? 0} through day{" "}
              {selectedScenario.draws.at(-1)?.timingDay ?? 0}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedScenario ? (
            <Button
              disabled={selectedScenario.isActive}
              onClick={onSetActive}
              size="sm"
              variant="outline"
            >
              <CheckCircle2 />
              Set active
            </Button>
          ) : null}
          <Button onClick={onNew} size="sm" variant="outline">
            <Plus />
            Create
          </Button>
          <Button
            disabled={!selectedScenario}
            onClick={onDuplicate}
            size="sm"
            variant="outline"
          >
            <Copy />
            Duplicate
          </Button>
          {selectedScenario ? (
            <Button
              onClick={() => onDelete(selectedScenario)}
              size="sm"
              variant="destructive"
            >
              <Trash2 />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {selectedScenario ? (
        <div className="grid gap-4 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              aria-label="Scenario name"
              onChange={(event) =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    name: event.target.value,
                  }),
                )
              }
              value={selectedScenario.name}
            />
            <Input
              aria-label="Scenario description"
              onChange={(event) =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    description: event.target.value,
                  }),
                )
              }
              value={selectedScenario.description}
            />
            <Button
              disabled={!selectedScenario.isDefault}
              onClick={() => onReset(selectedScenario.scenarioKey)}
              variant="outline"
            >
              Reset default
            </Button>
          </div>

          <SettingsCashflowPreview
            scenario={selectedScenario}
            template={template}
          />

          <FramePanel className="overflow-x-auto p-0">
            <Table className="min-w-[840px]">
              <TableHeader className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-[0.08em]">
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Timing day</TableHead>
                  <TableHead>Amount %</TableHead>
                  <TableHead>Review note</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedScenario.draws.map((draw) => (
                  <ScenarioDrawRow
                    draw={draw}
                    key={draw.drawKey}
                    onRemove={() =>
                      onUpdate((current) =>
                        updateScenario(current, selectedScenario.scenarioKey, {
                          draws: selectedScenario.draws.filter(
                            (row) => row.drawKey !== draw.drawKey,
                          ),
                        }),
                      )
                    }
                    onUpdateDraw={(nextDraw) =>
                      onUpdate((current) =>
                        updateScenario(current, selectedScenario.scenarioKey, {
                          draws: selectedScenario.draws.map((row) =>
                            row.drawKey === draw.drawKey ? nextDraw : row,
                          ),
                        }),
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </FramePanel>
          <FramePanel
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 p-3 text-sm",
              validation.ok ? "bg-success/10" : "bg-destructive/10",
            )}
          >
            <Button
              onClick={() =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    draws: [
                      ...selectedScenario.draws,
                      {
                        amountBps: 0,
                        drawKey: `draw-${selectedScenario.draws.length + 1}`,
                        label: `Draw ${String(selectedScenario.draws.length + 1).padStart(2, "0")}`,
                        order: selectedScenario.draws.length,
                        reviewNote: "",
                        timingDay:
                          (selectedScenario.draws.at(-1)?.timingDay ?? 0) + 14,
                      },
                    ],
                  }),
                )
              }
              variant="outline"
            >
              <Plus />
              Add draw
            </Button>
            <strong>
              Total draw percentage{" "}
              {formatBps(scenarioDrawTotalBps(selectedScenario))}
            </strong>
            {!validation.ok ? (
              <span className="text-destructive">
                {Object.values(validation.errors)[0]}
              </span>
            ) : null}
          </FramePanel>
        </div>
      ) : null}
    </div>
  );
}

function ScenarioDrawRow({
  draw,
  onRemove,
  onUpdateDraw,
}: {
  draw: TimelineSettingsDrawDraft;
  onRemove: () => void;
  onUpdateDraw: (draw: TimelineSettingsDrawDraft) => void;
}) {
  const [timingDayText, setTimingDayText] = useState(String(draw.timingDay));
  const [amountText, setAmountText] = useState(formatBps(draw.amountBps));
  const [editingTimingDay, setEditingTimingDay] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);

  useEffect(() => {
    if (!editingTimingDay) {
      setTimingDayText(String(draw.timingDay));
    }
  }, [draw.drawKey, draw.timingDay, editingTimingDay]);

  useEffect(() => {
    if (!editingAmount) {
      setAmountText(formatBps(draw.amountBps));
    }
  }, [draw.amountBps, draw.drawKey, editingAmount]);

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label={`${draw.label} label`}
          onChange={(event) =>
            onUpdateDraw({ ...draw, label: event.target.value })
          }
          value={draw.label}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${draw.label} timing day`}
          inputMode="numeric"
          onBlur={() => {
            setEditingTimingDay(false);
            setTimingDayText(String(draw.timingDay));
          }}
          onChange={(event) => {
            const nextValue = normalizeIntegerInput(event.target.value);
            setTimingDayText(nextValue);
            if (nextValue === "") {
              return;
            }
            onUpdateDraw({
              ...draw,
              timingDay: Number(nextValue),
            });
          }}
          onFocus={() => setEditingTimingDay(true)}
          pattern="[0-9]*"
          value={timingDayText}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${draw.label} amount`}
          inputMode="decimal"
          onBlur={() => {
            setEditingAmount(false);
            setAmountText(formatBps(draw.amountBps));
          }}
          onChange={(event) => {
            const nextValue = normalizePercentInput(event.target.value);
            setAmountText(nextValue);
            if (nextValue === "") {
              return;
            }
            const parsedBps = parsePercentToBps(nextValue);
            if (!Number.isFinite(parsedBps)) {
              return;
            }
            onUpdateDraw({
              ...draw,
              amountBps: parsedBps,
            });
          }}
          onFocus={() => setEditingAmount(true)}
          pattern="[0-9]*[.]?[0-9]*%?"
          value={amountText}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${draw.label} review note`}
          onChange={(event) =>
            onUpdateDraw({ ...draw, reviewNote: event.target.value })
          }
          value={draw.reviewNote}
        />
      </TableCell>
      <TableCell>{draw.order + 1}</TableCell>
      <TableCell>
        <Button onClick={onRemove} size="sm" variant="outline">
          Remove
        </Button>
      </TableCell>
    </TableRow>
  );
}

function normalizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePercentInput(value: string) {
  const withoutPercent = value.replaceAll("%", "");
  let normalized = "";
  let hasDecimal = false;

  for (const character of withoutPercent) {
    if (character >= "0" && character <= "9") {
      normalized += character;
      continue;
    }
    if (character === "." && !hasDecimal) {
      normalized += character;
      hasDecimal = true;
    }
  }

  if (normalized === ".") {
    return "0.";
  }

  return normalized;
}

function SettingsCashflowPreview({
  scenario,
  template,
}: {
  scenario: TimelineSettingsScenarioDraft;
  template: TimelineSettingsTemplateDraft;
}) {
  const startingCash = useMemo(
    () => getSettingsStartingCashDollars(template),
    [template],
  );
  const data = useMemo(
    () => buildSettingsCashflowChartData(template, scenario, startingCash),
    [scenario, startingCash, template],
  );
  const extent = getCashflowCompoundExtent(data);
  const maxDay = Math.max(30, ...data.map((row) => row.day));
  const ticks = buildCashflowTicks(maxDay);

  return (
    <FramePanel className="overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b bg-muted/40 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold">Cash on hand vs milestone cost</h3>
          <p className="text-muted-foreground text-sm">
            Benchmarked against a{" "}
            {formatCompactDollarLabel(SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS)}{" "}
            sample budget; starting cash covers the first milestone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            Sample budget:{" "}
            {formatCompactDollarLabel(SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS)}
          </Badge>
          <Badge variant="warning">
            Starting cash: {formatCompactDollarLabel(startingCash)}
          </Badge>
        </div>
      </div>
      <TimelineCashflowCompoundChart
        barSize={22}
        className="h-72 min-w-0"
        data={data}
        testId="timeline-settings-cashflow-compound-chart"
        xDomain={[0, maxDay]}
        xTicks={ticks}
        yAxisWidth={64}
        yDomain={[extent.min, extent.max]}
      />
    </FramePanel>
  );
}

function ConfirmationModal({
  canSave,
  kind,
  labels,
  onClose,
  onConfirm,
  saving,
  scenario,
  scenarioValidation,
  template,
  templateValidation,
}: {
  canSave: boolean;
  kind: PendingConfirmation;
  labels: TimelineSettingsWorkspaceLabels;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  scenario: TimelineSettingsScenarioDraft | null;
  scenarioValidation: ReturnType<typeof validateScenarioDrafts>;
  template: TimelineSettingsTemplateDraft | null;
  templateValidation: ReturnType<typeof validateTemplateDraft>;
}) {
  if (!kind) {
    return null;
  }
  const isSeed = kind === "seed";
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/60 p-6 pt-24 backdrop-blur-sm">
      <FramePanel className="mx-auto grid max-h-[calc(100vh-8rem)] w-full max-w-4xl gap-4 overflow-auto bg-popover p-6 text-popover-foreground shadow-2xl">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
            {isSeed ? "Confirm seed defaults" : "Confirm template save"}
          </div>
          <h2 className="mt-1 font-semibold text-2xl">
            {isSeed ? labels.seedConfirmTitle : `Save ${template?.title ?? "template"}?`}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {isSeed
              ? labels.seedConfirmBody
              : "This single save commits the canonical milestone template and all draw scenario changes attached to the selected template."}
          </p>
        </div>
        {!isSeed && template ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                Milestone template
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <MetricRow
                  label="Included"
                  value={`${template.milestones.filter((row) => row.included).length} milestones`}
                />
                <MetricRow
                  label="Total PoC"
                  value={formatBps(includedPocTotalBps(template))}
                />
                <MetricRow
                  label="Total duration"
                  value={formatDay(includedDurationDays(template))}
                />
                <MetricRow
                  label="Warnings"
                  value={templateValidation.warnings[0] ?? "None"}
                />
              </dl>
            </Card>
            <Card className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                Draw scenarios
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <MetricRow
                  label="Changed scenarios"
                  value={`${template.scenarios.length} attached to ${template.title}`}
                />
                <MetricRow
                  label="Active scenario"
                  value={getActiveScenario(template)?.name ?? "Missing"}
                />
                <MetricRow
                  label="Selected draw total"
                  value={
                    scenario
                      ? formatBps(scenarioDrawTotalBps(scenario))
                      : "0.00%"
                  }
                />
                <MetricRow
                  label="Preview cash"
                  value="$0 starting cash assumption"
                />
              </dl>
            </Card>
          </div>
        ) : null}
        {!isSeed && (!canSave || !scenarioValidation.ok) ? (
          <FramePanel className="border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            {Object.values(templateValidation.errors)[0] ??
              Object.values(scenarioValidation.errors)[0] ??
              "Resolve validation before saving."}
          </FramePanel>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={saving || (!isSeed && !canSave)}
            onClick={onConfirm}
          >
            {saving ? "Working..." : isSeed ? "Confirm seed" : "Confirm save"}
          </Button>
        </div>
      </FramePanel>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TraceBadge({ ids }: { ids: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-muted-foreground text-xs">
      <GitBranch className="size-3" />
      {ids.slice(0, 3).join(" / ")}
    </span>
  );
}

function tabClass(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 font-medium text-sm transition",
    active
      ? "bg-background text-foreground shadow-xs"
      : "text-muted-foreground",
  );
}

function updateScenario(
  template: TimelineSettingsTemplateDraft,
  scenarioKey: string,
  patch: Partial<TimelineSettingsScenarioDraft>,
): TimelineSettingsTemplateDraft {
  return {
    ...template,
    scenarios: template.scenarios.map((scenario) =>
      scenario.scenarioKey === scenarioKey
        ? { ...scenario, ...patch }
        : scenario,
    ),
  };
}

export function buildSettingsCashflowChartData(
  template: TimelineSettingsTemplateDraft,
  scenario: TimelineSettingsScenarioDraft | null,
  startingCash = getSettingsStartingCashDollars(template),
): TimelineCashflowCompoundDatum[] {
  let cashOnHand = startingCash;
  const projectBudgetDollars = SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS;
  const includedMilestones = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort((a, b) => a.order - b.order);
  const events = [
    ...includedMilestones.map((milestone, index) => {
      const startDay = milestoneStartDay(includedMilestones, index);
      const endDay = milestoneEndDay(includedMilestones, index);

      return {
        amount: Math.round(
          (projectBudgetDollars * milestone.percentageBps) / TOTAL_BPS,
        ),
        day: startDay,
        id: `milestone:${milestone.milestoneKey}`,
        milestoneEndDay: endDay,
        name: milestone.name,
        type: "milestone" as const,
      };
    }),
    ...(scenario?.draws ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((draw) => ({
        amount: Math.round((projectBudgetDollars * draw.amountBps) / TOTAL_BPS),
        day: draw.timingDay,
        id: `draw:${draw.drawKey}`,
        name: draw.label,
        type: "draw" as const,
      })),
  ].sort((a, b) => a.day - b.day || a.type.localeCompare(b.type));

  const data: TimelineCashflowCompoundDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: startingCash,
      day: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
    },
  ];

  for (const event of events) {
    cashOnHand += event.type === "draw" ? event.amount : -event.amount;
    data.push({
      budget: event.type === "milestone" ? event.amount : 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: event.day,
      event: event.type === "draw" ? "draw" : "milestone",
      id: event.id,
      milestoneEndDay:
        event.type === "milestone" ? event.milestoneEndDay : undefined,
      name: event.name,
    });
  }

  return data;
}

function getSettingsStartingCashDollars(
  template: TimelineSettingsTemplateDraft,
) {
  const firstMilestone = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort((a, b) => a.order - b.order)[0];

  return firstMilestone
    ? Math.round(
        (SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS *
          firstMilestone.percentageBps) /
          TOTAL_BPS,
      )
    : 0;
}

function formatCompactDollarLabel(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${Number.isInteger(absolute / 1_000_000) ? String(absolute / 1_000_000) : (absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${Math.round(absolute / 1_000)}K`;
  }

  return `${sign}$${Math.round(absolute)}`;
}

function buildCashflowTicks(maxDay: number) {
  const interval = maxDay > 180 ? 45 : maxDay > 90 ? 30 : 15;
  const ticks = [0];
  for (let day = interval; day < maxDay; day += interval) {
    ticks.push(day);
  }
  ticks.push(maxDay);
  return [...new Set(ticks.map((tick) => Math.round(tick)))];
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number(value.replace(/^T/i, ""));
  return Number.isFinite(parsed)
    ? Math.max(1, Math.round(parsed))
    : Math.max(1, Math.round(fallback));
}

function finiteBps(value: number) {
  return Number.isFinite(value) ? value : 0;
}

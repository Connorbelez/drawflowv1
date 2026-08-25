import { Database, Plus, Save } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  createBlankScenario,
  duplicateScenario,
  getActiveScenario,
  normalizeTimelineSettingsProjection,
  type TimelineSettingsScenarioDraft,
  type TimelineSettingsTemplateDraft,
  validateScenarioDrafts,
  validateTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import { cn } from "#/lib/utils.ts";

import {
  SETTINGS_TAB_PANEL_VARIANTS,
  SETTINGS_TAB_REDUCED_TRANSITION,
  SETTINGS_TAB_TRANSITION,
  type ActiveTab,
  type PendingConfirmation,
  type TimelineSettingsMutationResult,
  type TimelineSettingsWorkspaceLabels,
} from "./-settings-contracts.ts";
import { ConfirmationModal } from "./-settings-cashflow.tsx";
import { StatusStrip, tabClass, TraceBadge } from "./-settings-primitives.tsx";
import {
  EmptySeedState,
  TemplateRail,
  TemplateSettingsTab,
  createNewTemplateDraft,
  validateTemplateMetadata,
} from "./-settings-template.tsx";
import { ScenarioSettingsTab } from "./-settings-scenario.tsx";

export function TimelineSettingsWorkspace({
  labels,
  onCreateTemplate,
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
  onCreateTemplate?: (
    template: TimelineSettingsTemplateDraft
  ) => Promise<TimelineSettingsMutationResult>;
  onDeleteScenario: (
    template: TimelineSettingsTemplateDraft,
    scenario: TimelineSettingsScenarioDraft
  ) => Promise<TimelineSettingsMutationResult>;
  onResetScenario: (
    template: TimelineSettingsTemplateDraft,
    scenarioKey: string
  ) => Promise<TimelineSettingsMutationResult>;
  onResetTemplate: (
    template: TimelineSettingsTemplateDraft
  ) => Promise<TimelineSettingsMutationResult>;
  onSaveTemplate: (
    template: TimelineSettingsTemplateDraft
  ) => Promise<TimelineSettingsMutationResult>;
  onSeedDefaults: () => Promise<TimelineSettingsMutationResult>;
  seedSuccessMessage?: (result: any) => string;
  settings: any;
  traceRefs?: readonly (readonly string[])[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const canonicalTemplates = useMemo(
    () => normalizeTimelineSettingsProjection(settings),
    [settings]
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
    {}
  );
  const [dirtyScenarios, setDirtyScenarios] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    if (canonicalTemplates.length === 0) {
      setDrafts([]);
      return;
    }
    setDrafts((current) => (current.length > 0 ? current : canonicalTemplates));
    setSelectedTemplateKey((current) =>
      canonicalTemplates.some((template) => template.templateKey === current)
        ? current
        : canonicalTemplates[0]?.templateKey || ""
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
          selectedScenarioKeyByTemplate[selectedTemplate.templateKey]
      ) ??
      selectedTemplate.scenarios[0] ??
      null)
    : null;
  const selectedTemplatePersisted = Boolean(
    selectedTemplate &&
      canonicalTemplates.some(
        (template) => template.templateKey === selectedTemplate.templateKey
      )
  );
  const templateValidation = selectedTemplate
    ? validateTemplateDraft(selectedTemplate)
    : { errors: {}, ok: false, warnings: [] };
  const metadataValidation = selectedTemplate
    ? validateTemplateMetadata(selectedTemplate, drafts)
    : { errors: {}, ok: false };
  const scenarioValidation = selectedTemplate
    ? validateScenarioDrafts(selectedTemplate.scenarios, selectedTemplate)
    : { errors: {}, ok: false, warnings: [] };
  const canSave = Boolean(
    selectedTemplate &&
      metadataValidation.ok &&
      templateValidation.ok &&
      scenarioValidation.ok
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
      projection as any
    );
    setDrafts(nextTemplates);
    setSelectedTemplateKey((current) =>
      nextTemplates.some((template) => template.templateKey === current)
        ? current
        : nextTemplates[0]?.templateKey || ""
    );
    setSelectedScenarioKeyByTemplate(
      Object.fromEntries(
        nextTemplates.map((template) => [
          template.templateKey,
          getActiveScenario(template)?.scenarioKey ||
            template.scenarios[0]?.scenarioKey ||
            "",
        ])
      )
    );
    setDirtyTemplates({});
    setDirtyScenarios({});
  }

  function updateSelectedTemplate(
    updater: (
      template: TimelineSettingsTemplateDraft
    ) => TimelineSettingsTemplateDraft,
    dirtyKind: "scenario" | "template"
  ) {
    if (!selectedTemplate) {
      return;
    }
    const currentKey = selectedTemplate.templateKey;
    const nextTemplate = updater(selectedTemplate);
    setDrafts((current) =>
      current.map((template) =>
        template.templateKey === currentKey ? nextTemplate : template
      )
    );
    if (nextTemplate.templateKey !== currentKey) {
      setSelectedTemplateKey(nextTemplate.templateKey);
      setSelectedScenarioKeyByTemplate((current) => {
        const next = { ...current };
        next[nextTemplate.templateKey] =
          next[currentKey] ||
          getActiveScenario(nextTemplate)?.scenarioKey ||
          nextTemplate.scenarios[0]?.scenarioKey ||
          "";
        delete next[currentKey];
        return next;
      });
    }
    if (dirtyKind === "template") {
      setDirtyTemplates((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== currentKey)
        ),
        [nextTemplate.templateKey]: true,
      }));
    } else {
      setDirtyScenarios((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== currentKey)
        ),
        [nextTemplate.templateKey]: true,
      }));
    }
  }

  function handleCreateTemplateDraft() {
    const created = createNewTemplateDraft(drafts, selectedTemplate);
    setDrafts((current) => [...current, created]);
    setSelectedTemplateKey(created.templateKey);
    setSelectedScenarioKeyByTemplate((current) => ({
      ...current,
      [created.templateKey]:
        getActiveScenario(created)?.scenarioKey ||
        created.scenarios[0]?.scenarioKey ||
        "",
    }));
    setDirtyTemplates((current) => ({
      ...current,
      [created.templateKey]: true,
    }));
    setDirtyScenarios((current) => ({
      ...current,
      [created.templateKey]: true,
    }));
    setActiveTab("template");
    setActionError("");
  }

  async function handleSeedDefaults() {
    setSaving(true);
    setActionError("");
    try {
      const result = await onSeedDefaults();
      setTemplatesFromResult(result);
      toast.success(
        seedSuccessMessage?.(result) ??
          `Seeded ${canonicalTemplates.length} templates.`
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
    if (!(selectedTemplate && canSave)) {
      setActionError(
        "Resolve template, worksheet, and scenario validation before saving."
      );
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const persisted = canonicalTemplates.some(
        (template) => template.templateKey === selectedTemplate.templateKey
      );
      const result =
        !persisted && onCreateTemplate
          ? await onCreateTemplate(selectedTemplate)
          : await onSaveTemplate(selectedTemplate);
      toast.success(
        `${selectedTemplate.title} ${persisted || !onCreateTemplate ? "saved" : "created"}.`
      );
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
      (template) => template.templateKey === selectedTemplate.templateKey
    );
    const persisted = Boolean(
      canonicalTemplate?.scenarios.some(
        (row) => row.scenarioKey === scenario.scenarioKey
      )
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
          (row) => row.scenarioKey !== scenario.scenarioKey
        ),
      }),
      "scenario"
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
                {onCreateTemplate ? (
                  <Button
                    disabled={settings === undefined}
                    onClick={handleCreateTemplateDraft}
                    size="sm"
                    variant="outline"
                  >
                    <Plus />
                    New template
                  </Button>
                ) : null}
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
                  {selectedTemplate && !selectedTemplatePersisted
                    ? "Create template"
                    : "Save template"}
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
                    : "lg:grid-cols-[300px_minmax(0,1fr)]"
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
                  persistedTemplateKeys={canonicalTemplates.map(
                    (template) => template.templateKey
                  )}
                  reducedMotion={Boolean(prefersReducedMotion)}
                  selectedTemplateKey={selectedTemplate?.templateKey ?? ""}
                  templates={drafts}
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
                      <div className="border-destructive/20 border-b bg-destructive/10 px-4 py-3 text-destructive text-sm">
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
                            isNewTemplate={
                              !canonicalTemplates.some(
                                (template) =>
                                  template.templateKey ===
                                  selectedTemplate.templateKey
                              )
                            }
                            metadataValidation={metadataValidation}
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
                                selectedTemplate.scenarios
                              );
                              updateSelectedTemplate(
                                (template) => ({
                                  ...template,
                                  scenarios: [
                                    ...template.scenarios,
                                    duplicated,
                                  ],
                                }),
                                "scenario"
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
                                selectedTemplate
                              );
                              updateSelectedTemplate(
                                (template) => ({
                                  ...template,
                                  scenarios: [...template.scenarios, created],
                                }),
                                "scenario"
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
                                    })
                                  ),
                                }),
                                "scenario"
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
        isCreate={Boolean(selectedTemplate && !selectedTemplatePersisted)}
        kind={pendingConfirmation}
        labels={labels}
        metadataValidation={metadataValidation}
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

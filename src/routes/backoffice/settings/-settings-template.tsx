import { useMemo } from "react";

import { Database } from "lucide-react";
import { motion } from "motion/react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  type TimelineMilestoneWorksheetRow,
  TimelineMilestoneWorksheetTable,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import {
  formatBps,
  formatDay,
  getActiveScenario,
  includedDurationDays,
  includedPocTotalBps,
  parsePercentToBps,
  TOTAL_BPS,
  type TimelineSettingsTemplateDraft,
  validateTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import { coerceSiteVisitGuidance } from "#/lib/site-visit-guidance.ts";
import { cn } from "#/lib/utils.ts";

import {
  SETTINGS_TAB_REDUCED_TRANSITION,
  SETTINGS_TAB_TRANSITION,
  type ActiveTab,
} from "./-settings-contracts.ts";

export function validateTemplateMetadata(
  template: TimelineSettingsTemplateDraft,
  templates: TimelineSettingsTemplateDraft[]
) {
  const errors: Record<string, string> = {};
  const templateKey = template.templateKey.trim();
  if (!template.title.trim()) {
    errors.title = "Template title is required.";
  }
  if (!template.summary.trim()) {
    errors.summary = "Template summary is required.";
  }
  if (!templateKey) {
    errors.templateKey = "Template key is required.";
  } else if (templateKey !== slugTemplateKey(templateKey)) {
    errors.templateKey =
      "Template key must use lowercase letters, numbers, and hyphens.";
  } else if (
    templates.filter((row) => row.templateKey === template.templateKey).length >
    1
  ) {
    errors.templateKey = "Template key must be unique.";
  }
  return { errors, ok: Object.keys(errors).length === 0 };
}

export function createNewTemplateDraft(
  existing: TimelineSettingsTemplateDraft[],
  source: TimelineSettingsTemplateDraft | null
): TimelineSettingsTemplateDraft {
  const title = source ? `${source.title} Custom` : "New Production Template";
  const templateKey = uniqueTemplateKey(slugTemplateKey(title), existing);
  if (source) {
    return {
      ...source,
      description: `Custom template based on ${source.title}.`,
      isDefault: false,
      milestones: source.milestones.map((milestone) => ({
        ...milestone,
        dependencyKeys: [...milestone.dependencyKeys],
        siteVisitGuidance: { ...milestone.siteVisitGuidance },
        submilestones: milestone.submilestones.map((submilestone) => ({
          ...submilestone,
        })),
      })),
      scenarios: source.scenarios.map((scenario) => ({
        ...scenario,
        draws: scenario.draws.map((draw) => ({ ...draw })),
        isDefault: false,
      })),
      summary: `Custom template based on ${source.summary || source.title}.`,
      templateKey,
      title,
    };
  }

  return {
    description:
      "Custom production proposal template created from Backoffice Settings.",
    isDefault: false,
    milestones: [
      {
        dependencyKeys: [],
        durationDays: 10,
        icon: "foundation",
        included: true,
        milestoneKey: "foundation",
        name: "Foundation",
        order: 0,
        percentageBps: 5000,
        siteVisitGuidance: {
          cameraAngles:
            "<ul><li>Wide shot showing the full foundation work area.</li><li>Close-up of forms, pour, and waterproofing details.</li></ul>",
          whatToVerify:
            "<ul><li>Foundation scope is complete and consistent with the approved draw plan.</li></ul>",
        },
        submilestones: [
          {
            description: "Confirm foundation scope, evidence, and acceptance.",
            durationDays: 5,
            name: "Foundation completion",
            order: 0,
            percentageBps: 5000,
            submilestoneKey: "foundation-completion",
          },
        ],
        type: "foundation",
      },
      {
        dependencyKeys: ["foundation"],
        durationDays: 12,
        icon: "framing",
        included: true,
        milestoneKey: "framing",
        name: "Framing",
        order: 1,
        percentageBps: 5000,
        siteVisitGuidance: {
          cameraAngles:
            "<ul><li>Wide shot showing framing progress across the structure.</li><li>Close-up of primary load paths and connection details.</li></ul>",
          whatToVerify:
            "<ul><li>Framing scope is complete and ready for reimbursement review.</li></ul>",
        },
        submilestones: [
          {
            description: "Confirm framing scope, evidence, and acceptance.",
            durationDays: 6,
            name: "Framing completion",
            order: 0,
            percentageBps: 5000,
            submilestoneKey: "framing-completion",
          },
        ],
        type: "framing",
      },
    ],
    scenarios: [
      {
        description: "Default reimbursement timing for this custom template.",
        draws: [
          {
            amountBps: TOTAL_BPS,
            drawKey: "draw-01",
            label: "Draw 01",
            order: 0,
            reviewNote: "Foundation completion verified.",
            timingDay: 12,
          },
        ],
        isActive: true,
        isDefault: false,
        name: "Standard reimbursement",
        scenarioKey: "standard-reimbursement",
        sortOrder: 0,
      },
    ],
    summary: "Custom production template with editable milestones and draws.",
    templateKey,
    title,
  };
}

function uniqueTemplateKey(
  baseKey: string,
  existing: TimelineSettingsTemplateDraft[]
) {
  const existingKeys = new Set(
    existing.map((template) => template.templateKey)
  );
  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }
  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseKey}-${suffix}`;
}

export function slugTemplateKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}

export function EmptySeedState({
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
        <p className="mt-2 text-muted-foreground text-sm leading-6">{body}</p>
        <Button className="mt-4" onClick={onSeed}>
          {seedButtonLabel}
        </Button>
      </FramePanel>
    </div>
  );
}

export function TemplateRail({
  activeTab,
  dirtyScenarios,
  dirtyTemplates,
  onSelect,
  persistedTemplateKeys,
  reducedMotion,
  selectedTemplateKey,
  templates,
}: {
  activeTab: ActiveTab;
  dirtyScenarios: Record<string, boolean>;
  dirtyTemplates: Record<string, boolean>;
  onSelect: (templateKey: string) => void;
  persistedTemplateKeys: string[];
  reducedMotion: boolean;
  selectedTemplateKey: string;
  templates: TimelineSettingsTemplateDraft[];
}) {
  const persistedTemplateKeySet = new Set(persistedTemplateKeys);
  return (
    <motion.aside
      className="border-b bg-muted/20 p-3 lg:border-r lg:border-b-0"
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
          const persisted = persistedTemplateKeySet.has(template.templateKey);
          return (
            <Card
              className={cn(
                "grid min-w-0 gap-1 overflow-hidden rounded-lg p-3 text-left text-sm transition hover:border-primary/50",
                selectedTemplateKey === template.templateKey &&
                  "border-primary/60 bg-primary/10",
                activeTab === "scenarios" && "p-2"
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
                {persisted ? null : (
                  <Badge className="shrink-0" variant="outline">
                    Draft
                  </Badge>
                )}
              </div>
              <span className="min-w-0 truncate text-muted-foreground text-xs">
                {template.milestones.length} milestones, {formatBps(totalPoc)},{" "}
                {formatDay(includedDurationDays(template))}
              </span>
              {activeScenario ? (
                <Badge
                  className="min-w-0 max-w-full justify-start overflow-hidden whitespace-nowrap"
                  variant="success"
                >
                  <span className="min-w-0 truncate">
                    Active: {activeScenario.name}
                  </span>
                </Badge>
              ) : (
                <Badge
                  className="min-w-0 max-w-full justify-start overflow-hidden whitespace-nowrap"
                  variant="warning"
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

export function TemplateSettingsTab({
  isNewTemplate,
  metadataValidation,
  onReset,
  onUpdate,
  template,
  validation,
}: {
  isNewTemplate: boolean;
  metadataValidation: ReturnType<typeof validateTemplateMetadata>;
  onReset: () => void;
  onUpdate: (
    updater: (
      template: TimelineSettingsTemplateDraft
    ) => TimelineSettingsTemplateDraft
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
    <div className="grid gap-4 p-4">
      <TemplateIdentityPanel
        isNewTemplate={isNewTemplate}
        metadataValidation={metadataValidation}
        onUpdate={onUpdate}
        template={template}
      />
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
    </div>
  );
}

function TemplateIdentityPanel({
  isNewTemplate,
  metadataValidation,
  onUpdate,
  template,
}: {
  isNewTemplate: boolean;
  metadataValidation: ReturnType<typeof validateTemplateMetadata>;
  onUpdate: (
    updater: (
      template: TimelineSettingsTemplateDraft
    ) => TimelineSettingsTemplateDraft
  ) => void;
  template: TimelineSettingsTemplateDraft;
}) {
  return (
    <FramePanel className="grid gap-4 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
            Template identity
          </div>
          <h3 className="font-semibold text-lg">{template.title}</h3>
        </div>
        <Label className="min-h-8 rounded-lg border bg-background px-3 py-2 text-sm">
          <Switch
            aria-label="Default template"
            checked={template.isDefault}
            onCheckedChange={(checked) =>
              onUpdate((current) => ({ ...current, isDefault: checked }))
            }
          />
          Default
        </Label>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Title</span>
          <Input
            aria-invalid={metadataValidation.errors.title ? true : undefined}
            aria-label="Template title"
            onChange={(event) => {
              const title = event.target.value;
              onUpdate((current) => ({
                ...current,
                title,
                ...(isNewTemplate
                  ? { templateKey: slugTemplateKey(title) }
                  : {}),
              }));
            }}
            value={template.title}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Template key</span>
          <Input
            aria-invalid={
              metadataValidation.errors.templateKey ? true : undefined
            }
            aria-label="Template key"
            disabled={!isNewTemplate}
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                templateKey: slugTemplateKey(event.target.value),
              }))
            }
            value={template.templateKey}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Summary</span>
        <Input
          aria-invalid={metadataValidation.errors.summary ? true : undefined}
          aria-label="Template summary"
          onChange={(event) =>
            onUpdate((current) => ({
              ...current,
              summary: event.target.value,
            }))
          }
          value={template.summary}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Description</span>
        <Textarea
          aria-label="Template description"
          onChange={(event) =>
            onUpdate((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          value={template.description}
        />
      </label>
      {Object.values(metadataValidation.errors).length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {Object.values(metadataValidation.errors)[0]}
        </div>
      ) : null}
    </FramePanel>
  );
}

function templateToWorksheetRows(
  template: TimelineSettingsTemplateDraft
): TimelineMilestoneWorksheetRow[] {
  return template.milestones
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
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
          ...(submilestone.fieldGuidance === undefined
            ? {}
            : { fieldGuidance: submilestone.fieldGuidance }),
          id: submilestone.submilestoneKey,
          name: submilestone.name,
          percentageBps: submilestone.percentageBps,
          percentageText: formatBps(submilestone.percentageBps),
          ...(submilestone.scopeOfWorkTiptapJson === undefined
            ? {}
            : { scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson }),
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
  rows: TimelineMilestoneWorksheetRow[]
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
        ...(submilestone.fieldGuidance === undefined
          ? {}
          : { fieldGuidance: submilestone.fieldGuidance }),
        name: submilestone.name,
        order: subOrder,
        percentageBps: finiteBps(
          submilestone.percentageBps ??
            parsePercentToBps(submilestone.percentageText ?? "0")
        ),
        ...(submilestone.scopeOfWorkTiptapJson === undefined
          ? {}
          : { scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson }),
        submilestoneKey: submilestone.id,
      })),
      type: row.type,
    })),
  };
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

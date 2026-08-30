import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { PlugZap } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  getVisualParitySettings,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { TIMELINE_DEMO_SETTINGS_CONTRACT_REFS } from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import { api } from "../../../../convex/_generated/api";

import {
  buildSettingsCashflowChartData as buildSettingsCashflowChartDataImpl,
  buildSettingsScenarioScheduleRows as buildSettingsScenarioScheduleRowsImpl,
  buildSettingsScheduleReferenceLines as buildSettingsScheduleReferenceLinesImpl,
} from "./-settings-cashflow.tsx";
import { TimelineSettingsWorkspace as TimelineSettingsWorkspaceImpl } from "./-settings-workspace.tsx";

export const TimelineSettingsWorkspace = TimelineSettingsWorkspaceImpl;
export const buildSettingsCashflowChartData =
  buildSettingsCashflowChartDataImpl;
export const buildSettingsScenarioScheduleRows =
  buildSettingsScenarioScheduleRowsImpl;
export const buildSettingsScheduleReferenceLines =
  buildSettingsScheduleReferenceLinesImpl;

export const Route = createFileRoute("/backoffice/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const roleSlugs = [context.role, ...(context.roles ?? [])].filter(
    (role): role is string => typeof role === "string"
  );
  const canCreateProductionTemplate = roleSlugs.some((role) =>
    ["admin", "principle-broker", "principal-broker"].includes(
      role.trim().toLowerCase()
    )
  );
  const canManageIntegrations = roleSlugs.some(
    (role) => role.trim().toLowerCase() === "admin"
  );
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const productionSettingsQuery = useQuery(
    api.production_proposals.getProductionProposalSettings,
    visualFixtureEnabled ? "skip" : { workosOrganizationId }
  );
  const productionSettings = visualFixtureEnabled
    ? getVisualParitySettings()
    : productionSettingsQuery;
  const seedProductionDefaultsToProd = useMutation(
    api.production_proposals.seedProductionDefaultsToProd
  );
  const saveProductionTemplate = useMutation(
    api.production_proposals.saveProductionProposalTemplateConfiguration
  );
  const createProductionTemplate = useMutation(
    api.production_proposals.createProductionProposalTemplate
  );
  const deleteProductionScenario = useMutation(
    api.production_proposals.deleteProductionDrawScenario
  );
  const resetProductionTemplate = useMutation(
    api.production_proposals.resetProductionTemplateToDefaults
  );
  const resetProductionScenario = useMutation(
    api.production_proposals.resetProductionDrawScenarioToDefaults
  );
  const settings = useQuery(api.demo_settings.getTimelineDemoSettings, {});
  const seedDefaults = useMutation(api.demo_settings.seedTimelineDemoDefaults);
  const saveTemplate = useMutation(
    api.demo_settings.saveTimelineTemplateConfiguration
  );
  const deleteScenarioMutation = useMutation(
    api.demo_settings.deleteTimelineDrawScenario
  );
  const resetTemplate = useMutation(
    api.demo_settings.resetTimelineTemplateToDefaults
  );
  const resetScenario = useMutation(
    api.demo_settings.resetTimelineDrawScenarioToDefaults
  );

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_32rem),var(--bg-base)] px-4 py-5 text-fg-primary sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1800px] gap-5">
        <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <Badge className="mb-3 w-fit" variant="outline">
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
          {canManageIntegrations ? (
            <Button
              nativeButton={false}
              render={<Link preload="intent" to="/backoffice/integrations" />}
              variant="outline"
            >
              <PlugZap aria-hidden="true" /> Integration operations
            </Button>
          ) : null}
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
          onCreateTemplate={
            canCreateProductionTemplate
              ? (template) =>
                  createProductionTemplate({
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
              : undefined
          }
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
          onSeedDefaults={() => seedProductionDefaultsToProd({})}
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

import { Database } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { TimelineMilestoneWorksheetTable } from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import type { ProductionProposalSettings } from "./production-proposal-surface-contracts";
import {
  productionTemplateToWorksheetRows,
  SettingMetric,
} from "./production-proposal-surface-shared";

export function ProductionProposalSettingsSurface({
  onSeed,
  seedPending = false,
  settings,
}: {
  onSeed?: () => void;
  seedPending?: boolean;
  settings: ProductionProposalSettings | undefined;
}) {
  const template = settings?.templates[0];
  const workflowRule = settings?.workflowRules[0];
  const activeScenario = template?.scenarios.find(
    (scenario) => scenario.isDefault
  );
  const worksheetRows = useMemo(
    () => productionTemplateToWorksheetRows(template),
    [template]
  );
  const [productionRows, setProductionRows] = useState(worksheetRows);

  useEffect(() => {
    setProductionRows(worksheetRows);
  }, [worksheetRows]);

  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Badge variant="outline">Production proposal settings</Badge>
            <h2 className="mt-2 font-semibold text-xl tracking-tight">
              Proposal-flow foundation
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Tenant-scoped templates, milestone archetypes, draw scenarios, and
              workflow rules used by canonical proposal routes.
            </p>
          </div>
          {onSeed ? (
            <Button
              loading={seedPending}
              onClick={onSeed}
              size="sm"
              variant="outline"
            >
              <Database />
              Seed defaults to prod
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3">
          {settings === undefined ? (
            <p className="text-muted-foreground text-sm">
              Loading production proposal settings...
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              <SettingMetric
                label="Archetypes"
                value={String(settings.archetypes.length)}
              />
              <SettingMetric
                label="Template milestones"
                value={String(template?.milestones.length ?? 0)}
              />
              <SettingMetric
                label="Draw scenarios"
                value={String(template?.scenarios.length ?? 0)}
              />
              <SettingMetric
                label="Workflow states"
                value={String(workflowRule?.proposalStates.length ?? 0)}
              />
            </div>
          )}
          {settings?.provisioningRequired ? (
            <Alert variant="warning">
              <Database />
              <AlertTitle>Brokerage profile required</AlertTitle>
              <AlertDescription>
                This WorkOS organization is active, but it does not have an
                active brokerage profile yet. Seed the production foundation to
                create the tenant-scoped brokerage, templates, draw scenarios,
                and workflow rules.
              </AlertDescription>
              {onSeed ? (
                <AlertAction>
                  <Button onClick={onSeed} size="sm" variant="outline">
                    <Database />
                    Seed foundation
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}
          {workflowRule ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">
                Reimbursement only:{" "}
                {workflowRule.settings.reimbursementOnly ? "yes" : "no"}
              </Badge>
              <Badge variant="outline">
                Interest starts on {workflowRule.settings.interestStartsOn}
              </Badge>
              <Badge variant="outline">
                Permit required:{" "}
                {workflowRule.requirePermitForApproval ? "yes" : "no"}
              </Badge>
            </div>
          ) : null}
        </div>
        {template ? (
          <TimelineMilestoneWorksheetTable
            footerExtra={
              <div className="timeline-blueprint-metric">
                <span>Active scenario</span>
                <strong>{activeScenario?.name ?? "Missing"}</strong>
              </div>
            }
            mode="settings"
            onRowsChange={setProductionRows}
            rows={productionRows}
            showHeading
            templateTitle={template.title}
          />
        ) : null}
      </FramePanel>
    </Frame>
  );
}

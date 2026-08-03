"use client";

import { Check, Eye, HardHat, PackageCheck, ShieldCheck } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";
import {
  previousQuoteRoundStage,
  QuoteRoundComposerHeader,
  QuoteRoundStageNavigation,
} from "./QuoteRoundComposerChrome.tsx";
import { QuoteRoundStageContent } from "./QuoteRoundComposerStages.tsx";
import { useQuoteRoundComposerState } from "./QuoteRoundComposerState.ts";
import { QuoteRoundMaterialScopeEditor } from "./QuoteRoundMaterialScopeEditor.tsx";
import {
  QuoteRoundDisclosureProof,
  QuoteRoundDispatchStage,
  QuoteRoundPackageProofFrame,
  QuoteRoundRecipientExperience,
} from "./QuoteRoundPublisherRail.tsx";
import {
  QuoteRoundRecipientEditor,
  QuoteRoundResponseTemplateSelector,
} from "./QuoteRoundRecipientEditor.tsx";
import { parseQuoteRoundTiptapJson } from "./quote-round-tiptap.ts";

export type QuoteRoundCapability = "contractor" | "supplier";
export type QuoteRoundMode = "labour" | "materials" | "mixed";
export type QuoteRoundStep =
  | "scope"
  | "package"
  | "recipients"
  | "response"
  | "dispatch";

export interface QuoteRoundLabourSubmilestone {
  _id: string;
  budgetCents?: number;
  buildMilestoneId?: string;
  durationDays?: number;
  milestoneKey: string;
  milestoneName: string;
  name: string;
  order: number;
  scopeOfWorkTiptapJson: string;
  startDay?: number;
  submilestoneKey?: string;
}

export interface QuoteRoundMaterialCostItem {
  _id: string;
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  milestoneKey?: string;
  quantity: number;
  relevantSubmilestoneKeys?: string[];
  specificationTiptapJson?: string;
  title: string;
  unit?: string;
}

export interface QuoteRoundTemplateField {
  fieldKey: string;
  kind:
    | "attachment"
    | "choice"
    | "date"
    | "long_text"
    | "priced_line"
    | "short_text";
  label: string;
  required?: boolean;
  richTextDefaultHtml?: string;
  scope?: "labour" | "materials" | "whole_quote";
}

export interface QuoteRoundTemplateVersion {
  audience?: "contractor" | "either" | "supplier";
  description?: string;
  fields: QuoteRoundTemplateField[];
  name: string;
  templateId: string;
  version: number;
  versionId: string;
}

export interface QuoteRoundRecipientCandidate {
  capabilities: QuoteRoundCapability[];
  contractorProfileId: string;
  displayName: string;
  email?: string;
  provisioningState?: "claimed" | "provisional";
  recipientKey: string;
}

export interface QuoteRoundMaterialRow {
  assignedSubmilestoneIds: string[];
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  quantity?: number;
  rowKey: string;
  source: "ad_hoc" | "build_cost_item";
  sourceBuildCostItemId?: string;
  specificationTiptapJson?: string;
  title?: string;
  unit?: string;
}

export interface QuoteRoundRecipientSelection {
  contractorProfileId: string;
  recipientKey: string;
}

export interface QuoteRoundDraft {
  labourSubmilestoneIds: string[];
  materialRows: QuoteRoundMaterialRow[];
  recipients: QuoteRoundRecipientSelection[];
  responseDeadline?: string;
  revision: number;
  templateVersionId?: string;
  title: string;
}

export interface QuoteRoundDetail {
  draft?: QuoteRoundDraft | null;
  mode: QuoteRoundMode;
  packageRevision?: {
    number?: number;
    publishedAt?: number;
  } | null;
  quoteRoundId: string;
  state: "draft" | "open" | "closed" | "cancelled";
  title: string;
}

export interface QuoteRoundComposerData {
  build: {
    _id: string;
    buildName: string;
    location?: string;
    locationLatitude?: number;
    locationLongitude?: number;
    startDate?: string;
  };
  compatibleRecipients: QuoteRoundRecipientCandidate[];
  labourSubmilestones: QuoteRoundLabourSubmilestone[];
  materialCostItems: QuoteRoundMaterialCostItem[];
  permit?: {
    fileName?: string;
    mimeType?: string;
    version?: number;
  } | null;
  responseTemplates: QuoteRoundTemplateVersion[];
}

export interface QuoteRoundDraftInput {
  labourSubmilestoneIds: string[];
  materialRows: QuoteRoundMaterialRow[];
  recipients: QuoteRoundRecipientSelection[];
  responseDeadline?: string;
  templateVersionId?: string;
  title: string;
}

export interface QuoteRoundPublishReceipt {
  idempotentReplay?: boolean;
  invitationCount: number;
  invitationIds?: string[];
  packageRevisionId: string;
  packageRevisionNumber: number;
  quoteRoundId: string;
  responseDeadline: number;
  state: "open";
}

export interface QuoteRoundComposerActions {
  onCreateColdRecipient?: (input: {
    displayName?: string;
    email: string;
  }) => Promise<QuoteRoundRecipientCandidate>;
  onExit: () => void;
  onPublish: (input: {
    expectedRevision: number;
    idempotencyKey: string;
  }) => Promise<QuoteRoundPublishReceipt>;
  onRefresh?: () => void;
  onSave: (
    input: QuoteRoundDraftInput & { expectedRevision: number }
  ) => Promise<{ revision: number }>;
}

function formatCurrency(cents: number | undefined) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format((cents ?? 0) / 100);
}

function formatDayWindow(item: QuoteRoundLabourSubmilestone) {
  if (item.startDay === undefined) {
    return "Schedule pending";
  }
  const endDay = item.startDay + Math.max(0, (item.durationDays ?? 1) - 1);
  return `Construction days ${item.startDay}–${endDay}`;
}

function stageDescription(stage: QuoteRoundStep) {
  switch (stage) {
    case "scope":
      return "Lock the complete work package every compatible recipient will price.";
    case "package":
      return "Prove exactly what leaves DrawFlow before an invitation can open.";
    case "recipients":
      return "Assign existing, compatible contractor and supplier identities to this private Quote Round.";
    case "response":
      return "Pin a published response-template version and inspect the resulting response contract.";
    case "dispatch":
      return "Review access timing and publish one auditable package with active invitations.";
  }
}

function ScopeKindTab({
  active,
  count,
  disabled,
  kind,
  onSelect,
  selectedItems,
}: {
  active: boolean;
  count: number;
  disabled: boolean;
  kind: "labour" | "materials";
  onSelect: () => void;
  selectedItems: Array<{ id: string; meta: string; title: string }>;
}) {
  const label = kind === "labour" ? "Labour" : "Materials";
  const Icon = kind === "labour" ? HardHat : PackageCheck;

  return (
    <div className="relative min-w-0 flex-1">
      <Button
        aria-pressed={active}
        className="w-full min-w-0 justify-start pr-12"
        disabled={disabled}
        onClick={onSelect}
        variant={active ? "default" : "ghost"}
      >
        <Icon />
        <span className="truncate">{label}</span>
      </Button>
      <Tooltip>
        <TooltipTrigger
          aria-label={`${count} selected ${label.toLowerCase()} items`}
          render={
            <Button
              className="absolute top-1/2 right-1.5 size-7 -translate-y-1/2 p-0"
              size="sm"
              variant="ghost"
            />
          }
        >
          <Badge
            className="min-w-6 justify-center"
            variant={active ? "secondary" : "outline"}
          >
            {count}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 p-0" side="bottom">
          <div className="space-y-2 p-3" data-testid={`${kind}-scope-tooltip`}>
            <p className="font-semibold text-xs">
              Locked {label.toLowerCase()} selection
            </p>
            {selectedItems.length ? (
              <ul className="space-y-1.5">
                {selectedItems.map((item) => (
                  <li className="min-w-0" key={item.id}>
                    <p className="truncate font-medium text-xs">{item.title}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {item.meta}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                No items selected.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Hover or focus the count at any time to inspect this selection.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function LabourScopeSelector({
  items,
  selectedIds,
  onToggle,
}: {
  items: QuoteRoundLabourSubmilestone[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const milestones = useMemo(
    () =>
      [
        ...new Map(items.map((item) => [item.milestoneKey, item])).entries(),
      ].map(([milestoneKey, item]) => ({
        milestoneKey,
        milestoneName: item.milestoneName,
      })),
    [items]
  );

  return (
    <div className="space-y-5" data-testid="quote-labour-scope">
      {milestones.map((milestone) => {
        const milestoneItems = items.filter(
          (item) => item.milestoneKey === milestone.milestoneKey
        );
        return (
          <section className="space-y-2" key={milestone.milestoneKey}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">
                  {milestone.milestoneName}
                </h3>
                <p className="text-muted-foreground text-xs">
                  Individual sub-milestones remain individual pricing lines,
                  including non-contiguous work.
                </p>
              </div>
              <Badge variant="outline">
                {
                  milestoneItems.filter((item) =>
                    selectedIds.includes(item._id)
                  ).length
                }
                /{milestoneItems.length}
              </Badge>
            </div>
            <div className="grid gap-2">
              {milestoneItems.map((item) => {
                const selected = selectedIds.includes(item._id);
                return (
                  <Card key={item._id}>
                    <CardPanel className="flex items-start gap-3 p-2.5 sm:p-3">
                      <Button
                        aria-label={`${selected ? "Deselect" : "Select"} ${item.name}`}
                        aria-pressed={selected}
                        className="h-auto min-h-12 min-w-0 flex-1 justify-start whitespace-normal px-1.5 text-left hover:bg-transparent"
                        onClick={() => onToggle(item._id)}
                        variant="ghost"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-md border",
                            selected &&
                              "border-primary bg-primary text-primary-foreground"
                          )}
                        >
                          {selected ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-sm">
                            {item.name}
                          </span>
                          <span className="block text-muted-foreground text-xs">
                            {formatDayWindow(item)} ·{" "}
                            {formatCurrency(item.budgetCents)} budget context
                          </span>
                        </span>
                      </Button>
                      <Tooltip>
                        <TooltipTrigger
                          aria-label={`Inspect schedule and specification for ${item.name}`}
                          render={<Button size="icon-sm" variant="ghost" />}
                        >
                          <Eye />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-80 p-3" side="left">
                          <p className="font-semibold text-xs">{item.name}</p>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {formatDayWindow(item)}
                          </p>
                          {parseQuoteRoundTiptapJson(
                            item.scopeOfWorkTiptapJson
                          ) ? (
                            <FieldRichTextPreview
                              ariaLabel={`${item.name} scope specification`}
                              className="mt-2 max-h-40 overflow-auto"
                              value={
                                parseQuoteRoundTiptapJson(
                                  item.scopeOfWorkTiptapJson
                                ) ?? ""
                              }
                            />
                          ) : (
                            <p className="mt-2 text-muted-foreground text-xs">
                              No additional specification was supplied.
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </CardPanel>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function QuoteRoundComposer({
  actions,
  data,
  round,
}: {
  actions: QuoteRoundComposerActions;
  data: QuoteRoundComposerData;
  round: QuoteRoundDetail;
}) {
  const {
    continueStage,
    error,
    materialRows,
    mode,
    notice,
    pending,
    publish,
    published,
    recipients,
    responseDeadline,
    retry,
    revision,
    selectedLabour,
    selectedLabourIds,
    selectedResponseTemplate,
    setMaterialRows,
    setRecipients,
    setResponseDeadline,
    setStage,
    setTemplateVersionId,
    setTitle,
    stage,
    stageIndex,
    stale,
    templateVersionId,
    title,
    toggleLabour,
  } = useQuoteRoundComposerState({ actions, data, round });

  const stageBody: Record<QuoteRoundStep, ReactNode> = {
    dispatch: (
      <QuoteRoundDispatchStage
        data={data}
        deadline={responseDeadline}
        mode={mode}
        onDeadlineChange={setResponseDeadline}
        recipients={recipients}
        template={selectedResponseTemplate}
      />
    ),
    package: (
      <>
        <QuoteRoundDisclosureProof
          data={data}
          materialRows={materialRows}
          selectedLabour={selectedLabour}
        />
        <Alert variant="success">
          <ShieldCheck />
          <AlertTitle>Publisher rail is complete</AlertTitle>
          <AlertDescription>
            The private package proves the selected scope, recipient-visible
            location, schedule, and inherited specifications.
          </AlertDescription>
        </Alert>
      </>
    ),
    recipients: (
      <QuoteRoundRecipientEditor
        candidates={data.compatibleRecipients}
        mode={mode}
        onChange={setRecipients}
        onCreateColdRecipient={actions.onCreateColdRecipient}
        selections={recipients}
      />
    ),
    response: (
      <QuoteRoundResponseTemplateSelector
        labourCount={selectedLabourIds.length}
        materialCount={materialRows.length}
        mode={mode}
        onChange={setTemplateVersionId}
        templates={data.responseTemplates}
        templateVersionId={templateVersionId}
      />
    ),
    scope: (
      <div className="space-y-4">
        <label className="grid gap-1.5 text-sm" htmlFor="quote-round-title">
          <span className="font-medium">Quote Round title</span>
          <Input
            aria-label="Quote Round title"
            id="quote-round-title"
            inputClassName="min-h-11 sm:min-h-7.5"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Framing and envelope pricing"
            value={title}
          />
        </label>
        <TabbedScopeContent
          labourItems={data.labourSubmilestones}
          materialItems={data.materialCostItems}
          materialRows={materialRows}
          mode={mode}
          onMaterialRowsChange={setMaterialRows}
          onToggleLabour={toggleLabour}
          selectedLabourIds={selectedLabourIds}
        />
      </div>
    ),
  };

  return (
    <div
      className="min-h-screen bg-muted/25 pb-28"
      data-responsive-layout="scope-lock"
      data-testid="quote-round-composer"
    >
      <QuoteRoundComposerHeader
        buildName={data.build.buildName}
        mode={mode}
        onExit={actions.onExit}
        revision={revision}
        title={round.title}
      />
      <main className="mx-auto grid max-w-[1800px] gap-4 p-3 sm:p-5 xl:grid-cols-[200px_minmax(0,1fr)_360px] 2xl:grid-cols-[220px_200px_minmax(0,1fr)_360px]">
        <QuoteRoundPackageProofFrame
          labourCount={selectedLabourIds.length}
          materialCount={materialRows.length}
          recipientCount={recipients.length}
          template={selectedResponseTemplate}
        />
        <QuoteRoundStageNavigation
          onStageChange={setStage}
          stage={stage}
          stageIndex={stageIndex}
        />
        <QuoteRoundStageContent
          actions={actions}
          body={stageBody[stage]}
          error={error}
          notice={notice}
          onContinue={continueStage}
          onPrevious={() => setStage(previousQuoteRoundStage(stageIndex))}
          onRetry={retry}
          pending={pending}
          publish={publish}
          published={published}
          stage={stage}
          stageDescription={stageDescription(stage)}
          stageIndex={stageIndex}
          stale={stale}
        />
        <QuoteRoundRecipientExperience
          data={data}
          materialRows={materialRows}
          recipients={recipients}
          selectedLabour={selectedLabour}
        />
      </main>
    </div>
  );
}

function TabbedScopeContent({
  labourItems,
  materialItems,
  materialRows,
  mode,
  onMaterialRowsChange,
  onToggleLabour,
  selectedLabourIds,
}: {
  labourItems: QuoteRoundLabourSubmilestone[];
  materialItems: QuoteRoundMaterialCostItem[];
  materialRows: QuoteRoundMaterialRow[];
  mode: QuoteRoundMode;
  onMaterialRowsChange: (next: QuoteRoundMaterialRow[]) => void;
  onToggleLabour: (id: string) => void;
  selectedLabourIds: string[];
}) {
  const [kind, setKind] = useState<"labour" | "materials">(
    mode === "materials" ? "materials" : "labour"
  );
  const allowsLabour = mode !== "materials";
  const allowsMaterials = mode !== "labour";
  const selectedLabour = labourItems.filter((item) =>
    selectedLabourIds.includes(item._id)
  );
  const selectedMaterials = materialRows.map((row) => ({
    id: row.rowKey,
    meta: `${row.quantity ?? 1} ${row.unit ?? "package"} · ${row.assignedSubmilestoneIds.length} assigned`,
    title: row.title ?? "Untitled material",
  }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <ScopeKindTab
          active={kind === "labour"}
          count={selectedLabourIds.length}
          disabled={!allowsLabour}
          kind="labour"
          onSelect={() => setKind("labour")}
          selectedItems={selectedLabour.map((item) => ({
            id: item._id,
            meta: formatDayWindow(item),
            title: item.name,
          }))}
        />
        <ScopeKindTab
          active={kind === "materials"}
          count={materialRows.length}
          disabled={!allowsMaterials}
          kind="materials"
          onSelect={() => setKind("materials")}
          selectedItems={selectedMaterials}
        />
      </div>
      {kind === "labour" && allowsLabour ? (
        <LabourScopeSelector
          items={labourItems}
          onToggle={onToggleLabour}
          selectedIds={selectedLabourIds}
        />
      ) : (
        <QuoteRoundMaterialScopeEditor
          labourItems={labourItems}
          materialItems={materialItems}
          onRowsChange={onMaterialRowsChange}
          rows={materialRows}
        />
      )}
    </div>
  );
}

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  GripVertical,
  HardHat,
  History,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api } from "../../../convex/_generated/api";
import { cn } from "#/lib/utils.ts";

type FieldKind =
  | "priced_line"
  | "short_text"
  | "long_text"
  | "date"
  | "choice"
  | "attachment";
type FieldScope = "whole_quote" | "labour" | "materials";
type Audience = "contractor" | "supplier" | "either";
type Step = "identity" | "questions" | "anatomy" | "preview" | "publish";

export type QuoteTemplateField = {
  _id?: string;
  allowAlternates?: boolean;
  allowExclusions?: boolean;
  choiceOptions?: string[];
  fieldKey: string;
  isPermanent?: boolean;
  kind: FieldKind;
  label: string;
  order: number;
  renderer?: "input" | "tiptap";
  required: boolean;
  repeatable?: boolean;
  richTextDefaultHtml?: string;
  scope: FieldScope;
  supportsTax?: boolean;
  tax?: { label: string; rateBps: number };
  validation?: {
    allowedMimeTypes?: string[];
    maxFiles?: number;
    maxLength?: number;
    maxValueCents?: number;
    minFiles?: number;
    minLength?: number;
    minValueCents?: number;
    pattern?: string;
  };
};

type QuoteTemplateVersion = {
  _id: string;
  audience: Audience;
  createdAt: number;
  description?: string;
  fields?: QuoteTemplateField[];
  name: string;
  publishedAt?: number;
  releaseNote?: string;
  status: "draft" | "published";
  updatedAt: number;
  validationState: "invalid" | "valid";
  version: number;
};

type QuoteTemplate = {
  _id: string;
  audience: Audience;
  createdAt: number;
  createdByWorkosUserId: string;
  currentVersion: QuoteTemplateVersion | null;
  description?: string;
  name: string;
  selectedVersion: QuoteTemplateVersion | null;
  status: "active" | "archived";
  templateKey: string;
  updatedAt: number;
  versions?: Array<Omit<QuoteTemplateVersion, "fields">>;
};

type Registry = { templates: QuoteTemplate[] };

type PendingMutation = "create" | "save" | "publish" | "select" | null;

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "questions", label: "Questions" },
  { id: "anatomy", label: "Anatomy" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
];

const PERMANENT_KEYS = new Set([
  "labour_line_items",
  "materials_line_items",
  "additional_comments",
]);

const KIND_LABELS: Record<FieldKind, string> = {
  attachment: "Attachment",
  choice: "Choice",
  date: "Date",
  long_text: "Long text",
  priced_line: "Priced line",
  short_text: "Short text",
};

const defaultDraftFields: QuoteTemplateField[] = [
  {
    allowAlternates: true,
    allowExclusions: true,
    fieldKey: "labour_line_items",
    isPermanent: true,
    kind: "priced_line",
    label: "Labour",
    order: 0,
    repeatable: true,
    required: false,
    scope: "labour",
    supportsTax: true,
  },
  {
    allowAlternates: true,
    allowExclusions: true,
    fieldKey: "materials_line_items",
    isPermanent: true,
    kind: "priced_line",
    label: "Materials",
    order: 1,
    repeatable: true,
    required: false,
    scope: "materials",
    supportsTax: true,
  },
  {
    fieldKey: "additional_comments",
    isPermanent: true,
    kind: "long_text",
    label: "Additional comments",
    order: 2,
    renderer: "tiptap",
    required: false,
    richTextDefaultHtml:
      "<p>Explain assumptions, alternates, exclusions, and anything else we should understand.</p>",
    scope: "whole_quote",
  },
];

function normalizeOrder(fields: QuoteTemplateField[]) {
  return fields.map((field, order) => ({ ...field, order }));
}

function cloneFields(fields: QuoteTemplateField[] | undefined) {
  return normalizeOrder(
    (fields?.length ? fields : defaultDraftFields).map((field) => ({
      ...field,
      choiceOptions: field.choiceOptions ? [...field.choiceOptions] : undefined,
      validation: field.validation ? { ...field.validation } : undefined,
      tax: field.tax ? { ...field.tax } : undefined,
    }))
  );
}

function draftFieldInputs(fields: QuoteTemplateField[]) {
  return fields.map((field) => ({
    allowAlternates: field.allowAlternates,
    allowExclusions: field.allowExclusions,
    choiceOptions: field.choiceOptions,
    fieldKey: field.fieldKey,
    kind: field.kind,
    label: field.label,
    order: field.order,
    renderer: field.renderer,
    required: field.required,
    repeatable: field.repeatable,
    richTextDefaultHtml: field.richTextDefaultHtml,
    scope: field.scope,
    supportsTax: field.supportsTax,
    tax: field.tax,
    validation: field.validation,
  }));
}

function safeErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message.trim() : "";
  if (!raw) return fallback;
  if (raw === "save failed") return raw;
  const clean = raw.replace(/^ConvexError:\s*/i, "").split("\n", 1)[0]?.trim() ?? "";
  if (!clean || clean.length > 180 || /\b(stack|mutation|query|database|internal)\b/i.test(clean)) {
    return fallback;
  }
  return clean;
}

export function QuoteTemplateRegistry({
  workosOrganizationId,
}: {
  workosOrganizationId: string;
}) {
  const registryPage = usePaginatedQuery(
    api.quote_response_templates.listQuoteResponseTemplates,
    { workosOrganizationId },
    { initialNumItems: 50 }
  );
  const registry = registryPage.status === "LoadingFirstPage"
    ? undefined
    : ({ templates: registryPage.results } as Registry);
  const canLoadMore = registryPage.status === "CanLoadMore";
  const loadingMore = registryPage.status === "LoadingMore";
  const [mode, setMode] = useState<"registry" | "guided">("registry");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>();
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [draftTemplateId, setDraftTemplateId] = useState<string>();
  const [draftVersionId, setDraftVersionId] = useState<string>();
  const [step, setStep] = useState<Step>("identity");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAudience, setDraftAudience] = useState<Audience>("either");
  const [draftFields, setDraftFields] = useState<QuoteTemplateField[]>([]);
  const [releaseNote, setReleaseNote] = useState("");
  const [message, setMessage] = useState<string>();
  const [inspectedVersionId, setInspectedVersionId] = useState<string>();
  const [pendingMutation, setPendingMutation] = useState<PendingMutation>(null);

  const selectedTemplateSummary = registry?.templates.find(
    (template) => template._id === selectedTemplateId
  );
  const selectedTemplateDetailsQuery = useQuery(
    api.quote_response_templates.getQuoteResponseTemplate,
    selectedTemplateId
      ? {
          templateId: selectedTemplateId as never,
          workosOrganizationId,
        }
      : "skip"
  );
  const selectedTemplateDetails = selectedTemplateDetailsQuery as QuoteTemplate | null | undefined;
  const selectedTemplate = selectedTemplateDetails ?? selectedTemplateSummary;
  const selectedTemplateHydrated = selectedTemplateDetails !== undefined && selectedTemplateDetails !== null;
  const versionHistoryPage = usePaginatedQuery(
    api.quote_response_templates.listQuoteResponseTemplateVersions,
    selectedTemplateId
      ? {
          templateId: selectedTemplateId as never,
          workosOrganizationId,
        }
      : "skip",
    { initialNumItems: 50 }
  );
  const versionHistory = versionHistoryPage.status === "LoadingFirstPage"
    ? (selectedTemplate?.versions ?? [])
    : (versionHistoryPage.results as Array<Omit<QuoteTemplateVersion, "fields">>);
  const canLoadMoreVersions = versionHistoryPage.status === "CanLoadMore";
  const loadingMoreVersions = versionHistoryPage.status === "LoadingMore";
  const inspectedVersionQuery = useQuery(
    api.quote_response_templates.getQuoteResponseTemplateVersion,
    selectedTemplateId && inspectedVersionId
      ? {
          templateId: selectedTemplateId as never,
          versionId: inspectedVersionId as never,
          workosOrganizationId,
        }
      : "skip"
  );
  const inspectedVersion = inspectedVersionQuery as QuoteTemplateVersion | null | undefined;
  const isPending = pendingMutation !== null;
  const draftVersion = selectedTemplate?.currentVersion?.status === "draft"
    ? selectedTemplate.currentVersion
    : undefined;
  const effectiveDraftId = draftTemplateId ?? selectedTemplate?._id;
  const effectiveVersionId = draftVersionId ?? draftVersion?._id;

  const createDraft = useMutation(
    api.quote_response_templates.createQuoteResponseTemplateDraft
  );
  const saveDraft = useMutation(
    api.quote_response_templates.updateQuoteResponseTemplateDraft
  );
  const publishDraft = useMutation(
    api.quote_response_templates.publishQuoteResponseTemplate
  );
  const selectVersion = useMutation(
    api.quote_response_templates.selectQuoteResponseTemplateVersion
  );

  const openTemplate = (template: QuoteTemplate) => {
    setSelectedTemplateId(template._id);
    setInspectedVersionId(undefined);
    setMessage(undefined);
  };

  const beginNewTemplate = () => {
    setNewTemplateOpen(true);
    setSelectedTemplateId(undefined);
    setInspectedVersionId(undefined);
    setMessage(undefined);
  };

  const startGuided = (template: QuoteTemplate, version?: QuoteTemplateVersion) => {
    setSelectedTemplateId(template._id);
    setDraftTemplateId(template._id);
    setDraftVersionId(version?._id);
    setDraftName(version?.name ?? template.name);
    setDraftDescription(version?.description ?? template.description ?? "");
    setDraftAudience(version?.audience ?? template.audience);
    setDraftFields(cloneFields(version?.fields ?? template.currentVersion?.fields));
    setStep("identity");
    setMode("guided");
    setMessage(undefined);
  };

  const createTemplate = async () => {
    if (isPending) return;
    setPendingMutation("create");
    try {
      const created = await createDraft({
        audience: draftAudience,
        description: draftDescription,
        name: draftName,
        workosOrganizationId,
      });
      setSelectedTemplateId(String(created.templateId));
      setDraftTemplateId(String(created.templateId));
      setDraftVersionId(String(created.versionId));
      setDraftFields(cloneFields(defaultDraftFields));
      setNewTemplateOpen(false);
      setMode("guided");
      setStep("identity");
      setMessage("Draft created. Continue through the Guided Template Recipe.");
    } catch (error) {
      setMessage(safeErrorMessage(error, "Could not create draft."));
    } finally {
      setPendingMutation(null);
    }
  };

  const saveCurrentDraft = async (preservePublish = false): Promise<boolean> => {
    if (!preservePublish && (pendingMutation === "save" || isPending)) {
      return false;
    }
    if (!(effectiveDraftId && effectiveVersionId)) {
      setMessage("Choose a draft version before saving.");
      return false;
    }
    const publishing = preservePublish || pendingMutation === "publish";
    setPendingMutation("save");
    try {
      await saveDraft({
        audience: draftAudience,
        description: draftDescription,
        fields: draftFieldInputs(normalizeOrder(draftFields)),
        name: draftName,
        templateId: effectiveDraftId as never,
        versionId: effectiveVersionId as never,
        workosOrganizationId,
      });
      setDraftFields((fields) => normalizeOrder(fields));
      setMessage("Draft saved and validated.");
      return true;
    } catch (error) {
      setMessage(safeErrorMessage(error, "Could not save draft."));
      return false;
    } finally {
      setPendingMutation((current) => publishing ? "publish" : current === "save" ? null : current);
    }
  };

  const ensureNewVersionDraft = async () => {
    if (isPending) return;
    if (!selectedTemplate || !selectedTemplateHydrated) {
      setMessage("Loading the selected version details…");
      return;
    }
    setPendingMutation("create");
    try {
      const created = await createDraft({
        audience: selectedTemplate.currentVersion?.audience ?? selectedTemplate.audience,
        description: selectedTemplate.currentVersion?.description ?? selectedTemplate.description,
        name: selectedTemplate.currentVersion?.name ?? selectedTemplate.name,
        sourceTemplateId: selectedTemplate._id as never,
        workosOrganizationId,
      });
      setDraftTemplateId(String(created.templateId));
      setDraftVersionId(String(created.versionId));
      setDraftName(selectedTemplate.currentVersion?.name ?? selectedTemplate.name);
      setDraftDescription(selectedTemplate.currentVersion?.description ?? selectedTemplate.description ?? "");
      setDraftAudience(selectedTemplate.currentVersion?.audience ?? selectedTemplate.audience);
      setDraftFields(cloneFields(selectedTemplate.currentVersion?.fields));
      setMode("guided");
      setStep("identity");
      setMessage("A new immutable version draft is ready to edit.");
    } catch (error) {
      setMessage(safeErrorMessage(error, "Could not create version draft."));
    } finally {
      setPendingMutation(null);
    }
  };

  const publishCurrentDraft = async () => {
    if (isPending) return;
    if (!(effectiveDraftId && effectiveVersionId)) {
      return;
    }
    setPendingMutation("publish");
    try {
      const saved = await saveCurrentDraft(true);
      if (!saved) {
        return;
      }
      await publishDraft({
        releaseNote,
        templateId: effectiveDraftId as never,
        versionId: effectiveVersionId as never,
        workosOrganizationId,
      });
      setMode("registry");
      setMessage("Published. Existing Quote Rounds remain pinned to their version snapshot.");
    } catch (error) {
      setMessage(safeErrorMessage(error, "Could not publish version."));
    } finally {
      setPendingMutation(null);
    }
  };

  const selectPublishedVersion = async (versionId: string) => {
    if (isPending || !selectedTemplate) {
      return;
    }
    setPendingMutation("select");
    try {
      await selectVersion({
        templateId: selectedTemplate._id as never,
        versionId: versionId as never,
        workosOrganizationId,
      });
      setMessage("Selected version updated for new Quote Rounds.");
    } catch (error) {
      setMessage(safeErrorMessage(error, "Could not select version."));
    } finally {
      setPendingMutation(null);
    }
  };

  const inspectVersion = (versionId: string) => {
    setInspectedVersionId((current) => current === versionId ? undefined : versionId);
  };

  const registryContent = (
    <TemplateRegistryPanel
      message={message}
      newTemplateOpen={newTemplateOpen}
      onBeginNew={beginNewTemplate}
      onCancelNew={() => setNewTemplateOpen(false)}
      onCreate={createTemplate}
      onCreateNextVersion={ensureNewVersionDraft}
      onInspectVersion={inspectVersion}
      onLoadMore={() => registryPage.loadMore(50)}
      onLoadMoreVersions={() => versionHistoryPage.loadMore(50)}
      onOpenTemplate={openTemplate}
      onSelectVersion={selectPublishedVersion}
      onStartGuided={startGuided}
      registry={registry}
      selectedTemplate={selectedTemplate}
      selectedTemplateId={selectedTemplateId}
      selectedTemplateHydrated={selectedTemplateHydrated}
      versionHistory={versionHistory}
      canLoadMoreVersions={canLoadMoreVersions}
      loadingMoreVersions={loadingMoreVersions}
      inspectedVersion={inspectedVersion}
      inspectedVersionId={inspectedVersionId}
      isPending={isPending}
      canLoadMore={canLoadMore}
      loadingMore={loadingMore}
      setDraftAudience={setDraftAudience}
      setDraftDescription={setDraftDescription}
      setDraftName={setDraftName}
      draftAudience={draftAudience}
      draftDescription={draftDescription}
      draftName={draftName}
    />
  );

  if (mode === "guided") {
    return (
      <GuidedTemplateRecipe
        draftAudience={draftAudience}
        draftDescription={draftDescription}
        draftFields={draftFields}
        draftName={draftName}
        message={message}
        onBack={() => setMode("registry")}
        onPublish={publishCurrentDraft}
        onSave={saveCurrentDraft}
        releaseNote={releaseNote}
        selectedTemplate={selectedTemplate}
        isPending={isPending}
        setDraftAudience={setDraftAudience}
        setDraftDescription={setDraftDescription}
        setDraftFields={setDraftFields}
        setDraftName={setDraftName}
        setReleaseNote={setReleaseNote}
        step={step}
        setStep={setStep}
      />
    );
  }

  return registryContent;
}

function TemplateRegistryPanel({
  draftAudience,
  draftDescription,
  draftName,
  message,
  newTemplateOpen,
  onBeginNew,
  onCancelNew,
  onCreate,
  onCreateNextVersion,
  onInspectVersion,
  onLoadMore,
  onLoadMoreVersions,
  onOpenTemplate,
  onSelectVersion,
  onStartGuided,
  registry,
  selectedTemplate,
  selectedTemplateId,
  selectedTemplateHydrated,
  versionHistory,
  canLoadMoreVersions,
  loadingMoreVersions,
  inspectedVersion,
  inspectedVersionId,
  isPending,
  canLoadMore,
  loadingMore,
  setDraftAudience,
  setDraftDescription,
  setDraftName,
}: {
  draftAudience: Audience;
  draftDescription: string;
  draftName: string;
  message?: string;
  newTemplateOpen: boolean;
  onBeginNew: () => void;
  onCancelNew: () => void;
  onCreate: () => void;
  onCreateNextVersion: () => void;
  onInspectVersion: (versionId: string) => void;
  onLoadMore: () => void;
  onLoadMoreVersions: () => void;
  onOpenTemplate: (template: QuoteTemplate) => void;
  onSelectVersion: (versionId: string) => void;
  onStartGuided: (template: QuoteTemplate, version?: QuoteTemplateVersion) => void;
  registry?: Registry;
  selectedTemplate?: QuoteTemplate;
  selectedTemplateId?: string;
  selectedTemplateHydrated: boolean;
  versionHistory: Array<Omit<QuoteTemplateVersion, "fields">>;
  canLoadMoreVersions: boolean;
  loadingMoreVersions: boolean;
  inspectedVersion?: QuoteTemplateVersion | null;
  inspectedVersionId?: string;
  isPending: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  setDraftAudience: (value: Audience) => void;
  setDraftDescription: (value: string) => void;
  setDraftName: (value: string) => void;
}) {
  return (
    <main className="min-h-svh bg-muted/25 px-3 py-4 pb-24 sm:px-5 lg:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Frame>
          <FrameHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <FrameTitle>Quote response templates</FrameTitle>
                <FrameDescription>
                  Govern reusable response contracts and immutable versions.
                </FrameDescription>
              </div>
              <Button disabled={isPending} onClick={onBeginNew}>
                <Plus />
                New template
              </Button>
            </div>
          </FrameHeader>
          <FramePanel className="space-y-3 p-3 sm:p-4">
            {message ? (
              <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-info-foreground text-sm" role="status">
                {message}
              </div>
            ) : null}
            {newTemplateOpen ? (
              <Card className="border-primary/35 bg-primary/5">
                <CardHeader className="p-4 pb-2">
                  <CardTitle>New Guided Template Recipe</CardTitle>
                  <CardDescription>
                    Start a draft with the permanent Labour, Materials, and Additional Comments regions.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="grid gap-3 p-4 pt-0">
                  <label className="grid gap-1.5 text-sm" htmlFor="new-quote-template-name">
                    <span className="font-medium">Template name</span>
                    <Input id="new-quote-template-name" onChange={(event) => setDraftName(event.target.value)} value={draftName} />
                  </label>
                  <label className="grid gap-1.5 text-sm" htmlFor="new-quote-template-description">
                    <span className="font-medium">Internal description</span>
                    <Textarea id="new-quote-template-description" onChange={(event) => setDraftDescription(event.target.value)} value={draftDescription} />
                  </label>
                  <label className="grid gap-1.5 text-sm" htmlFor="new-quote-template-audience">
                    <span className="font-medium">Intended recipient</span>
                    <NativeSelect id="new-quote-template-audience" onChange={(event) => setDraftAudience(event.target.value as Audience)} value={draftAudience}>
                      <NativeSelectOption value="either">Contractor or supplier</NativeSelectOption>
                      <NativeSelectOption value="contractor">Contractor</NativeSelectOption>
                      <NativeSelectOption value="supplier">Supplier</NativeSelectOption>
                    </NativeSelect>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button onClick={onCancelNew} variant="ghost">Cancel</Button>
                    <Button disabled={!draftName.trim() || isPending} onClick={onCreate}><Plus />Create draft</Button>
                  </div>
                </CardPanel>
              </Card>
            ) : null}
            {registry === undefined ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Loading template registry…</div>
            ) : registry.templates.length === 0 ? (
              <Card><CardPanel className="p-5 text-center text-muted-foreground text-sm">No response templates yet. Create the first contract above.</CardPanel></Card>
            ) : (
              <div className="space-y-2">
                {registry.templates.map((template) => {
                  const current = template.currentVersion;
                  return (
                    <Card
                      className={cn("cursor-pointer text-left", selectedTemplateId === template._id && "border-primary/40 bg-primary/5")}
                      key={template._id}
                      onClick={() => onOpenTemplate(template)}
                      render={<button type="button" />}
                    >
                      <CardPanel className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-sm">{template.name}</span>
                          <span className="block truncate text-muted-foreground text-xs">{audienceLabel(template.audience)} · Labour + Materials</span>
                        </span>
                        <span className="flex items-center gap-2 sm:justify-end">
                          <Badge variant={current?.status === "published" ? "success" : "warning"}>{current?.status === "published" ? "Published" : "Draft"}</Badge>
                          <Badge variant="outline">v{current?.version ?? 1}</Badge>
                        </span>
                        <span className="text-muted-foreground text-xs">{current ? `${current.status === "published" ? "Published" : "Draft"} v${current.version}` : "No version"}</span>
                      </CardPanel>
                    </Card>
                  );
                })}
                {canLoadMore ? <Button className="w-full" disabled={loadingMore} onClick={onLoadMore} variant="outline">{loadingMore ? "Loading more…" : "Load more templates"}</Button> : null}
              </div>
            )}
          </FramePanel>
        </Frame>

        <Frame className="self-start lg:sticky lg:top-5">
          <FrameHeader>
            <FrameTitle>{selectedTemplate?.name ?? "Select a template"}</FrameTitle>
            <FrameDescription>
              {selectedTemplate ? `${statusLabel(selectedTemplate)} · ${audienceLabel(selectedTemplate.audience)}` : "Inspect current and historical versions."}
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-4 p-4">
            {selectedTemplate ? (
              <>
                <PermanentFormAnatomy compact />
                <TemplateContractRow label="Custom fields" value={selectedTemplateHydrated ? `${Math.max(0, (selectedTemplate.currentVersion?.fields?.length ?? 3) - 3)} configured` : "Loading details…"} />
                <TemplateContractRow label="Version history" value={selectedTemplateHydrated ? `${versionHistory.filter((version) => version.status === "published").length} published · ${versionHistory.filter((version) => version.status === "draft").length} draft` : "Loading details…"} />
                <div className="grid grid-cols-2 gap-2">
                  {selectedTemplate.currentVersion?.status === "draft" ? (
                    <Button className="col-span-2" disabled={isPending || !selectedTemplateHydrated} onClick={() => onStartGuided(selectedTemplate, selectedTemplate.currentVersion ?? undefined)} variant="outline"><Pencil />Edit draft</Button>
                  ) : (
                    <Button className="col-span-2" disabled={isPending || !selectedTemplateHydrated} onClick={onCreateNextVersion}><Copy />Create next version draft</Button>
                  )}
                </div>
                <div className="space-y-2 border-t pt-3">
                  <p className="font-semibold text-sm">Version history</p>
                  {versionHistory.map((version) => (
                    <div className="flex items-center gap-2" key={version._id}>
                      <span className="min-w-0 flex-1 text-xs">v{version.version} · {version.status}</span>
                      <Button disabled={isPending} onClick={() => onInspectVersion(version._id)} size="sm" variant={inspectedVersionId === version._id ? "secondary" : "ghost"}>{inspectedVersionId === version._id ? "Inspecting" : "Inspect"}</Button>
                      {version.status === "published" ? <Button disabled={isPending} onClick={() => onSelectVersion(version._id)} size="sm" variant={selectedTemplate.selectedVersion?._id === version._id ? "secondary" : "ghost"}>{selectedTemplate.selectedVersion?._id === version._id ? "Selected" : "Select"}</Button> : null}
                    </div>
                  ))}
                  {canLoadMoreVersions ? (
                    <Button
                      className="w-full"
                      disabled={loadingMoreVersions || isPending}
                      onClick={onLoadMoreVersions}
                      size="sm"
                      variant="outline"
                    >
                      {loadingMoreVersions ? "Loading more versions…" : "Load more versions"}
                    </Button>
                  ) : null}
                </div>
                {inspectedVersionId ? (
                  inspectedVersion ? <VersionInspectionPanel heading={`Inspecting v${inspectedVersion.version} · Read-only`} version={inspectedVersion} /> : <div className="border-t pt-3 text-muted-foreground text-sm">Loading historical version…</div>
                ) : selectedTemplate.selectedVersion && selectedTemplate.selectedVersion.fields ? (
                  <VersionInspectionPanel heading="Selected version inspection" version={selectedTemplate.selectedVersion} />
                ) : null}
              </>
            ) : (
              <div className="space-y-2 text-muted-foreground text-sm"><LockKeyhole className="size-5" /><p>Choose a registry row to inspect its permanent response regions, current selection, and immutable history.</p></div>
            )}
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

function VersionInspectionPanel({
  heading,
  version,
}: {
  heading: string;
  version: QuoteTemplateVersion;
}) {
  const fields = [...(version.fields ?? [])].sort((left, right) => left.order - right.order);
  return (
    <div className="space-y-2 border-t pt-3" aria-label={heading}>
      <div className="flex items-center gap-2"><History className="size-4" /><p className="font-semibold text-sm">{heading}</p></div>
      <p className="text-muted-foreground text-xs">{version.name} · {audienceLabel(version.audience)}{version.description ? ` · ${version.description}` : ""}</p>
      <div className="space-y-2" aria-label="Version field contract">
        {fields.map((field) => (
          <Card key={field.fieldKey}>
            <CardPanel className="space-y-2 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-semibold">{field.order + 1}. {field.label}</span>
                <Badge variant="outline">{KIND_LABELS[field.kind]}</Badge>
                <Badge variant={field.isPermanent ? "secondary" : "outline"}>{field.isPermanent ? "Permanent" : "Custom"}</Badge>
              </div>
              <dl className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                <div><dt className="inline font-medium">Scope: </dt><dd className="inline">{scopeLabel(field.scope)}</dd></div>
                <div><dt className="inline font-medium">Order: </dt><dd className="inline">{field.order}</dd></div>
                <div><dt className="inline font-medium">Required: </dt><dd className="inline">{field.required ? "Yes" : "No"}</dd></div>
                <div><dt className="inline font-medium">Renderer: </dt><dd className="inline">{field.renderer === "tiptap" ? "TipTap" : "Input"}</dd></div>
                <div><dt className="inline font-medium">Repeatable: </dt><dd className="inline">{field.repeatable ? "Yes" : "No"}</dd></div>
                <div><dt className="inline font-medium">Alternates: </dt><dd className="inline">{field.allowAlternates ? "Allowed" : "Not allowed"}</dd></div>
                <div><dt className="inline font-medium">Exclusions: </dt><dd className="inline">{field.allowExclusions ? "Allowed" : "Not allowed"}</dd></div>
                <div><dt className="inline font-medium">Tax: </dt><dd className="inline">{field.supportsTax ? `${field.tax?.label ?? "Enabled"}${field.tax ? ` (${field.tax.rateBps} bps)` : ""}` : "Not supported"}</dd></div>
              </dl>
              {field.choiceOptions?.length ? <div><span className="font-medium">Choices: {field.choiceOptions.join(" · ")}</span></div> : null}
              {field.validation ? <div><span className="font-medium">Validation: {formatFieldValidation(field.validation)}</span></div> : null}
              {field.renderer === "tiptap" && field.richTextDefaultHtml ? <div className="space-y-1"><span className="font-medium">TipTap default HTML</span><code className="block max-h-20 overflow-auto rounded bg-muted p-2 text-[11px]">{field.richTextDefaultHtml}</code></div> : null}
            </CardPanel>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatFieldValidation(validation: NonNullable<QuoteTemplateField["validation"]>) {
  return [
    validation.minLength === undefined ? null : `min length ${validation.minLength}`,
    validation.maxLength === undefined ? null : `max length ${validation.maxLength}`,
    validation.minFiles === undefined ? null : `min files ${validation.minFiles}`,
    validation.maxFiles === undefined ? null : `max files ${validation.maxFiles}`,
    validation.minValueCents === undefined ? null : `min value ${validation.minValueCents}¢`,
    validation.maxValueCents === undefined ? null : `max value ${validation.maxValueCents}¢`,
    validation.allowedMimeTypes?.length ? `MIME ${validation.allowedMimeTypes.join(", ")}` : null,
    validation.pattern ? `pattern ${validation.pattern}` : null,
  ].filter((item): item is string => item !== null).join(" · ");
}

function GuidedTemplateRecipe({
  draftAudience,
  draftDescription,
  draftFields,
  draftName,
  isPending,
  message,
  onBack,
  onPublish,
  onSave,
  releaseNote,
  selectedTemplate,
  setDraftAudience,
  setDraftDescription,
  setDraftFields,
  setDraftName,
  setReleaseNote,
  setStep,
  step,
}: {
  draftAudience: Audience;
  draftDescription: string;
  draftFields: QuoteTemplateField[];
  draftName: string;
  isPending: boolean;
  message?: string;
  onBack: () => void;
  onPublish: () => void;
  onSave: () => void;
  releaseNote: string;
  selectedTemplate?: QuoteTemplate;
  setDraftAudience: (value: Audience) => void;
  setDraftDescription: (value: string) => void;
  setDraftFields: (value: QuoteTemplateField[] | ((value: QuoteTemplateField[]) => QuoteTemplateField[])) => void;
  setDraftName: (value: string) => void;
  setReleaseNote: (value: string) => void;
  setStep: (value: Step) => void;
  step: Step;
}) {
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const permanentFields = draftFields.filter((field) => PERMANENT_KEYS.has(field.fieldKey));
  const customFields = draftFields.filter((field) => !PERMANENT_KEYS.has(field.fieldKey));
  const moveField = (fieldKey: string, direction: -1 | 1) => {
    setDraftFields((current) => {
      const index = current.findIndex((field) => field.fieldKey === fieldKey);
      const target = index + direction;
      if (
        index < 0 ||
        target < 0 ||
        target >= current.length ||
        PERMANENT_KEYS.has(current[index]?.fieldKey ?? "") ||
        PERMANENT_KEYS.has(current[target]?.fieldKey ?? "")
      ) {
        return current;
      }
      const next = [...current];
      const [field] = next.splice(index, 1);
      if (field) next.splice(target, 0, field);
      return normalizeOrder(next);
    });
  };
  const addField = () => {
    setDraftFields((current) => {
      const keys = new Set(current.map((field) => field.fieldKey));
      let nextNumber = current.filter((field) => !PERMANENT_KEYS.has(field.fieldKey)).length + 1;
      let fieldKey = `question_${nextNumber}`;
      while (keys.has(fieldKey)) {
        nextNumber += 1;
        fieldKey = `question_${nextNumber}`;
      }
      return normalizeOrder([
        ...current,
        {
          fieldKey,
          kind: "short_text",
          label: "New response question",
          order: current.length,
          required: false,
          scope: "whole_quote",
        },
      ]);
    });
  };
  const updateField = (fieldKey: string, update: Partial<QuoteTemplateField>) => {
    setDraftFields((current) => current.map((field) => field.fieldKey === fieldKey ? { ...field, ...update } : field));
  };
  const removeField = (fieldKey: string) => {
    if (PERMANENT_KEYS.has(fieldKey)) return;
    setDraftFields((current) => normalizeOrder(current.filter((field) => field.fieldKey !== fieldKey)));
  };

  return (
    <div className="min-h-svh bg-muted/25 pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/96 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Button aria-label="Back to template registry" onClick={onBack} size="icon" variant="ghost"><ArrowLeft /></Button>
          <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate font-semibold text-sm">Guided Template Recipe</p><Badge variant="info">Response templates</Badge></div><p className="truncate text-muted-foreground text-xs">{draftName || selectedTemplate?.name || "New response contract"} · Draft version</p></div>
          <Badge className="hidden sm:inline-flex" variant="outline"><LockKeyhole />Organization scoped</Badge>
          <Button disabled={isPending} onClick={onSave} variant="outline"><Save />Save draft</Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1480px] gap-4 p-3 sm:p-5 lg:grid-cols-[230px_minmax(0,1fr)_290px]">
        <Frame className="hidden self-start lg:flex">
          <FrameHeader><FrameTitle>Response contract</FrameTitle><FrameDescription>{draftName || "Untitled draft"}</FrameDescription></FrameHeader>
          <FramePanel className="space-y-1 p-2">{STEPS.map((item, index) => <Button className="w-full justify-start" key={item.id} onClick={() => setStep(item.id)} variant={step === item.id ? "secondary" : "ghost"}><span className={cn("grid size-6 place-items-center rounded-md text-xs", index < stepIndex ? "bg-success/12 text-success-foreground" : "bg-muted")}>{index < stepIndex ? <Check className="size-3.5" /> : index + 1}</span>{item.label}{step === item.id ? <ArrowRight className="ml-auto" /> : null}</Button>)}</FramePanel>
        </Frame>
        <div className="min-w-0 max-w-full overflow-hidden lg:hidden"><div className="flex gap-1 overflow-x-auto pb-1">{STEPS.map((item, index) => <Button className="min-w-fit" key={item.id} onClick={() => setStep(item.id)} size="sm" variant={step === item.id ? "default" : "outline"}>{index + 1}. {item.label}</Button>)}</div></div>
        <Frame>
          <FrameHeader className="gap-1"><div className="flex items-center justify-between gap-3"><FrameTitle>{STEPS[stepIndex]?.label}</FrameTitle><Badge variant="outline">Step {stepIndex + 1} of {STEPS.length}</Badge></div><FrameDescription>{stepDescription(step)}</FrameDescription></FrameHeader>
          <FramePanel className="space-y-4 p-4 sm:p-5">
            {message ? <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-info-foreground text-sm" role="status">{message}</div> : null}
            {step === "identity" ? <IdentityStep audience={draftAudience} description={draftDescription} name={draftName} setAudience={setDraftAudience} setDescription={setDraftDescription} setName={setDraftName} /> : null}
            {step === "questions" ? <QuestionsStep customFields={customFields} onAdd={addField} onMove={moveField} onRemove={removeField} onUpdate={updateField} permanentFields={permanentFields} /> : null}
            {step === "anatomy" ? <AnatomyStep fields={permanentFields} onUpdate={updateField} /> : null}
            {step === "preview" ? <PreviewStep customFields={customFields} fields={permanentFields} /> : null}
            {step === "publish" ? <PublishStep fields={draftFields} releaseNote={releaseNote} setReleaseNote={setReleaseNote} /> : null}
          </FramePanel>
          <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5"><Button disabled={stepIndex === 0 || isPending} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]?.id ?? "identity")} variant="outline"><ArrowLeft />Back</Button><Button disabled={isPending} onClick={() => step === "publish" ? onPublish() : setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]?.id ?? "publish")}>{step === "publish" ? "Publish immutable version" : "Continue"}{step === "publish" ? <ShieldCheck /> : <ArrowRight />}</Button></div>
        </Frame>
        <Frame className="hidden self-start lg:flex"><FrameHeader><FrameTitle>Template contract</FrameTitle><FrameDescription>Permanent response boundaries.</FrameDescription></FrameHeader><FramePanel className="space-y-3 p-3"><TemplateContractRow label="Permanent regions" value="Labour · Materials · Comments" /><TemplateContractRow label="Custom fields" value={`${customFields.length} configured`} /><TemplateContractRow label="Audience" value={audienceLabel(draftAudience)} /><TemplateContractRow label="Versioning" value="Published versions are immutable" /></FramePanel></Frame>
      </main>
    </div>
  );
}

function IdentityStep({ audience, description, name, setAudience, setDescription, setName }: { audience: Audience; description: string; name: string; setAudience: (value: Audience) => void; setDescription: (value: string) => void; setName: (value: string) => void }) {
  return <div className="space-y-4"><label className="grid gap-1.5 text-sm" htmlFor="quote-template-name"><span className="font-medium">Template name</span><Input id="quote-template-name" onChange={(event) => setName(event.target.value)} value={name} /></label><label className="grid gap-1.5 text-sm" htmlFor="quote-template-description"><span className="font-medium">Internal description</span><Textarea id="quote-template-description" onChange={(event) => setDescription(event.target.value)} value={description} /></label><label className="grid gap-1.5 text-sm" htmlFor="quote-template-audience"><span className="font-medium">Intended recipient</span><NativeSelect id="quote-template-audience" onChange={(event) => setAudience(event.target.value as Audience)} value={audience}><NativeSelectOption value="either">Contractor or supplier</NativeSelectOption><NativeSelectOption value="contractor">Contractor</NativeSelectOption><NativeSelectOption value="supplier">Supplier</NativeSelectOption></NativeSelect></label><Card className="border-info/30 bg-info/5"><CardPanel className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 size-4 text-info-foreground" /><div><p className="font-medium text-sm">Response contract only</p><p className="text-muted-foreground text-xs">Scope, recipients, deadlines, and magic-link expiry stay in the Quote Round composer.</p></div></CardPanel></Card></div>;
}

function QuestionsStep({ customFields, onAdd, onMove, onRemove, onUpdate, permanentFields }: { customFields: QuoteTemplateField[]; onAdd: () => void; onMove: (fieldKey: string, direction: -1 | 1) => void; onRemove: (fieldKey: string) => void; onUpdate: (fieldKey: string, update: Partial<QuoteTemplateField>) => void; permanentFields: QuoteTemplateField[] }) {
  return <div className="space-y-4"><PermanentFormAnatomy compact /><div className="flex items-center justify-between gap-2 pt-2"><div><p className="font-semibold text-sm">Additional questions</p><p className="text-muted-foreground text-xs">Ordered after the permanent line-item sections.</p></div><Badge variant="outline">{customFields.length} configured</Badge></div><div className="space-y-2">{customFields.map((field) => <EditableFieldCard field={field} key={field.fieldKey} onMove={onMove} onRemove={onRemove} onUpdate={onUpdate} />)}</div><Button onClick={onAdd} variant="outline"><Plus />Add response question</Button><p className="text-muted-foreground text-xs">Permanent regions: {permanentFields.map((field) => field.label).join(" · ")}. They remain included in every published version.</p></div>;
}

function EditableFieldCard({ field, onMove, onRemove, onUpdate }: { field: QuoteTemplateField; onMove: (fieldKey: string, direction: -1 | 1) => void; onRemove: (fieldKey: string) => void; onUpdate: (fieldKey: string, update: Partial<QuoteTemplateField>) => void }) {
  const validation = field.validation ?? {};
  const updateValidation = (update: NonNullable<QuoteTemplateField["validation"]>) =>
    onUpdate(field.fieldKey, { validation: { ...validation, ...update } });
  const updateKind = (kind: FieldKind) => onUpdate(field.fieldKey, {
    allowAlternates: kind === "priced_line" ? false : undefined,
    allowExclusions: kind === "priced_line" ? false : undefined,
    choiceOptions: kind === "choice" ? ["Included", "Excluded"] : undefined,
    kind,
    renderer: "input",
    repeatable: kind === "priced_line" ? false : undefined,
    richTextDefaultHtml: undefined,
    supportsTax: kind === "priced_line" ? false : undefined,
    tax: undefined,
    validation: undefined,
  });
  return (
    <Card>
      <CardPanel className="space-y-3 p-3">
        <div className="flex items-start gap-3">
          <GripVertical className="mt-1 size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <Input aria-label={`Label for ${field.fieldKey}`} onChange={(event) => onUpdate(field.fieldKey, { label: event.target.value })} value={field.label} />
            <p className="mt-1 text-muted-foreground text-xs">{KIND_LABELS[field.kind]} · {scopeLabel(field.scope)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button aria-label={`Move ${field.label} up`} onClick={() => onMove(field.fieldKey, -1)} size="icon" variant="ghost"><ChevronUp /></Button>
            <Button aria-label={`Move ${field.label} down`} onClick={() => onMove(field.fieldKey, 1)} size="icon" variant="ghost"><ChevronDown /></Button>
            <Button aria-label={`Remove ${field.label}`} onClick={() => onRemove(field.fieldKey)} size="icon" variant="ghost"><Trash2 /></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Type</span><NativeSelect onChange={(event) => updateKind(event.target.value as FieldKind)} value={field.kind}><NativeSelectOption value="priced_line">Priced line</NativeSelectOption><NativeSelectOption value="short_text">Short text</NativeSelectOption><NativeSelectOption value="long_text">Long text</NativeSelectOption><NativeSelectOption value="date">Date</NativeSelectOption><NativeSelectOption value="choice">Choice</NativeSelectOption><NativeSelectOption value="attachment">Attachment</NativeSelectOption></NativeSelect></label>
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Scope</span><NativeSelect onChange={(event) => onUpdate(field.fieldKey, { scope: event.target.value as FieldScope })} value={field.scope}><NativeSelectOption value="whole_quote">Whole quote</NativeSelectOption><NativeSelectOption value="labour">Labour</NativeSelectOption><NativeSelectOption value="materials">Materials</NativeSelectOption></NativeSelect></label>
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Requiredness</span><NativeSelect onChange={(event) => onUpdate(field.fieldKey, { required: event.target.value === "required" })} value={field.required ? "required" : "optional"}><NativeSelectOption value="required">Required</NativeSelectOption><NativeSelectOption value="optional">Optional</NativeSelectOption></NativeSelect></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {field.kind === "priced_line" ? <>
            <Button onClick={() => onUpdate(field.fieldKey, { repeatable: !field.repeatable })} size="sm" variant={field.repeatable ? "secondary" : "outline"}>{field.repeatable ? "Repeatable lines" : "Single line"}</Button>
            <Button onClick={() => onUpdate(field.fieldKey, { allowAlternates: !field.allowAlternates })} size="sm" variant={field.allowAlternates ? "secondary" : "outline"}>Alternates</Button>
            <Button onClick={() => onUpdate(field.fieldKey, { allowExclusions: !field.allowExclusions })} size="sm" variant={field.allowExclusions ? "secondary" : "outline"}>Exclusions</Button>
            <Button onClick={() => onUpdate(field.fieldKey, { supportsTax: !field.supportsTax, tax: !field.supportsTax ? { label: field.tax?.label ?? "GST", rateBps: field.tax?.rateBps ?? 500 } : undefined })} size="sm" variant={field.supportsTax ? "secondary" : "outline"}>Tax</Button>
          </> : null}
        </div>
        {field.kind === "choice" ? <Input aria-label={`Choice options for ${field.label}`} onChange={(event) => onUpdate(field.fieldKey, { choiceOptions: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} placeholder="Included, Excluded, Allowance" value={(field.choiceOptions ?? []).join(", ")} /> : null}
        {(field.kind === "short_text" || field.kind === "long_text") ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs"><span className="font-medium">Maximum length</span><Input aria-label={`Maximum length for ${field.label}`} inputMode="numeric" min={0} onChange={(event) => updateValidation({ maxLength: event.target.value ? Number(event.target.value) : undefined })} type="number" value={validation.maxLength ?? ""} /></label><label className="grid gap-1.5 text-xs"><span className="font-medium">Pattern (optional)</span><Input aria-label={`Validation pattern for ${field.label}`} onChange={(event) => updateValidation({ pattern: event.target.value || undefined })} placeholder="e.g. ^[A-Z]" value={validation.pattern ?? ""} /></label></div> : null}
        {field.kind === "attachment" ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs"><span className="font-medium">Maximum files</span><Input aria-label={`Maximum files for ${field.label}`} inputMode="numeric" min={0} onChange={(event) => updateValidation({ maxFiles: event.target.value ? Number(event.target.value) : undefined })} type="number" value={validation.maxFiles ?? ""} /></label><label className="grid gap-1.5 text-xs"><span className="font-medium">Allowed MIME types</span><Input aria-label={`Allowed MIME types for ${field.label}`} onChange={(event) => updateValidation({ allowedMimeTypes: event.target.value.split(",").map((mime) => mime.trim()).filter(Boolean) })} placeholder="application/pdf, image/jpeg" value={(validation.allowedMimeTypes ?? []).join(", ")} /></label></div> : null}
        {field.kind === "priced_line" && field.supportsTax ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs"><span className="font-medium">Tax label</span><Input aria-label={`Tax label for ${field.label}`} onChange={(event) => onUpdate(field.fieldKey, { tax: { label: event.target.value, rateBps: field.tax?.rateBps ?? 0 } })} value={field.tax?.label ?? "GST"} /></label><label className="grid gap-1.5 text-xs"><span className="font-medium">Tax rate (bps)</span><Input aria-label={`Tax rate for ${field.label}`} inputMode="numeric" min={0} max={10000} onChange={(event) => onUpdate(field.fieldKey, { tax: { label: field.tax?.label ?? "GST", rateBps: Number(event.target.value) || 0 } })} type="number" value={field.tax?.rateBps ?? 0} /></label></div> : null}
        {field.kind === "priced_line" ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs"><span className="font-medium">Minimum amount (cents)</span><Input aria-label={`Minimum amount for ${field.label}`} inputMode="numeric" min={0} onChange={(event) => updateValidation({ minValueCents: event.target.value ? Number(event.target.value) : undefined })} type="number" value={validation.minValueCents ?? ""} /></label><label className="grid gap-1.5 text-xs"><span className="font-medium">Maximum amount (cents)</span><Input aria-label={`Maximum amount for ${field.label}`} inputMode="numeric" min={0} onChange={(event) => updateValidation({ maxValueCents: event.target.value ? Number(event.target.value) : undefined })} type="number" value={validation.maxValueCents ?? ""} /></label></div> : null}
      </CardPanel>
    </Card>
  );
}

function AnatomyStep({ fields, onUpdate }: { fields: QuoteTemplateField[]; onUpdate: (fieldKey: string, update: Partial<QuoteTemplateField>) => void }) {
  const comments = fields.find((field) => field.fieldKey === "additional_comments");
  return <div className="space-y-4"><PermanentFormAnatomy /><Card><CardHeader className="p-4 pb-2"><CardTitle>Category labels</CardTitle><CardDescription>Canonical Labour and Materials semantics cannot be removed.</CardDescription></CardHeader><CardPanel className="grid gap-3 p-4 pt-0 sm:grid-cols-2">{fields.filter((field) => field.fieldKey !== "additional_comments").map((field) => <label className="grid gap-1.5 text-sm" htmlFor={`permanent-${field.fieldKey}`} key={field.fieldKey}><span className="font-medium">{field.fieldKey === "labour_line_items" ? "Labour label" : "Materials label"}</span><Input id={`permanent-${field.fieldKey}`} onChange={(event) => onUpdate(field.fieldKey, { label: event.target.value })} value={field.label} /></label>)}</CardPanel></Card><Card className="border-primary/25 bg-primary/5"><CardHeader className="p-4 pb-2"><div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><CardTitle>Additional comments</CardTitle><Badge className="ml-auto" variant="outline">Always included · TipTap</Badge></div></CardHeader><CardPanel className="p-4 pt-0"><FieldRichTextEditor ariaLabel="Template additional comments" editorMinHeightClass="[&_.ProseMirror]:min-h-24" onChange={(html) => onUpdate("additional_comments", { richTextDefaultHtml: html })} value={comments?.richTextDefaultHtml ?? "<p>Explain assumptions and exclusions.</p>"} /></CardPanel></Card></div>;
}

function PreviewStep({ customFields, fields }: { customFields: QuoteTemplateField[]; fields: QuoteTemplateField[] }) {
  const labour = fields.find((field) => field.fieldKey === "labour_line_items");
  const materials = fields.find((field) => field.fieldKey === "materials_line_items");
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-sm">Recipient mobile preview</p><p className="text-muted-foreground text-xs">One continuous form · no Labour/Materials tabs</p></div><Badge variant="success">Ready</Badge></div><QuoteCategoryPreview field={labour} icon={HardHat} label="Labour" /><QuoteCategoryPreview field={materials} icon={PackageCheck} label="Materials" /><div><p className="mb-2 font-semibold text-sm">Additional questions</p><div className="grid gap-3 sm:grid-cols-2">{customFields.map((field) => <RecipientPreviewField field={field} key={field.fieldKey} />)}</div></div><Card className="border-primary/25 bg-primary/5"><CardHeader className="p-4 pb-2"><div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><CardTitle>Additional comments</CardTitle><Badge className="ml-auto" variant="outline">Always included</Badge></div></CardHeader><CardPanel className="p-4 pt-0"><FieldRichTextPreview ariaLabel="Additional comments configured TipTap preview" value={fields.find((field) => field.fieldKey === "additional_comments")?.richTextDefaultHtml ?? "<p>Explain assumptions, alternates, exclusions, and anything else we should understand.</p>"} /></CardPanel></Card></div>;
}

function RecipientPreviewField({ field }: { field: QuoteTemplateField }) {
  const inputId = `preview-${field.fieldKey}`;
  const accessibleLabel = `${field.label}${field.required ? " (required)" : ""}`;
  const requiredBadge = field.required ? <Badge variant="secondary">Required</Badge> : null;
  const repeatableBadge = field.repeatable ? <Badge variant="outline">Repeatable</Badge> : null;
  const metadata = <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{field.label}</span>{requiredBadge}{repeatableBadge}</div>;
  const disclosureId = `${inputId}-contract`;
  const validation = field.validation;

  if (field.kind === "priced_line") {
    return <div className="space-y-1.5"><div className="flex flex-wrap items-center justify-between gap-2">{metadata}<Badge variant="outline">Priced line</Badge></div><div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><Input aria-label={`${accessibleLabel} line title`} id={inputId} placeholder="Line title" required={field.required} /><Input aria-describedby={disclosureId} aria-label={`${accessibleLabel} amount in cents`} inputMode="numeric" max={validation?.maxValueCents} min={validation?.minValueCents} placeholder="0" required={field.required} step={1} type="number" /></div><PreviewContractDisclosure field={field} id={disclosureId} /></div>;
  }
  if (field.kind === "long_text" && field.renderer === "tiptap") {
    return <div className="space-y-1.5">{metadata}<Badge variant="outline">TipTap rich text</Badge><FieldRichTextPreview ariaLabel={`${accessibleLabel} TipTap preview`} value={field.richTextDefaultHtml ?? "<p>Rich text response</p>"} />{validation ? <PreviewContractDisclosure field={field} id={disclosureId} /> : null}</div>;
  }
  if (field.kind === "long_text") {
    return <label className="grid gap-1.5 text-sm" htmlFor={inputId}>{metadata}<Textarea aria-describedby={validation ? disclosureId : undefined} aria-label={accessibleLabel} id={inputId} maxLength={validation?.maxLength} minLength={validation?.minLength} placeholder="Long text response" required={field.required} />{validation ? <PreviewContractDisclosure field={field} id={disclosureId} /> : null}</label>;
  }
  if (field.kind === "date") {
    return <label className="grid gap-1.5 text-sm" htmlFor={inputId}>{metadata}<Input aria-label={accessibleLabel} id={inputId} type="date" required={field.required} /></label>;
  }
  if (field.kind === "choice") {
    return <label className="grid gap-1.5 text-sm" htmlFor={inputId}>{metadata}<NativeSelect aria-label={accessibleLabel} id={inputId} required={field.required}><NativeSelectOption value="">Choose an option</NativeSelectOption>{(field.choiceOptions ?? []).map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect></label>;
  }
  if (field.kind === "attachment") {
    const maxFiles = field.validation?.maxFiles;
    return <label className="grid gap-1.5 text-sm" htmlFor={inputId}>{metadata}<Input accept={field.validation?.allowedMimeTypes?.join(",")} aria-describedby={validation ? disclosureId : undefined} aria-label={accessibleLabel} id={inputId} multiple={maxFiles === undefined || maxFiles > 1} required={field.required} type="file" />{validation ? <PreviewContractDisclosure field={field} id={disclosureId} /> : null}</label>;
  }
  return <label className="grid gap-1.5 text-sm" htmlFor={inputId}>{metadata}<Input aria-describedby={validation ? disclosureId : undefined} aria-label={accessibleLabel} id={inputId} maxLength={validation?.maxLength} minLength={validation?.minLength} pattern={validation?.pattern} placeholder="Short text response" required={field.required} /></label>;
}

function PreviewContractDisclosure({ field, id }: { field: QuoteTemplateField; id: string }) {
  const details: string[] = [];
  if (field.kind === "priced_line") {
    details.push(formatPreviewAmountBounds(field.validation));
    details.push(field.supportsTax ? `Tax: ${field.tax?.label ?? "enabled"}${field.tax ? ` (${field.tax.rateBps} bps)` : ""}` : "Tax: not supported");
    details.push(field.allowAlternates ? "Alternates: allowed" : "Alternates: not allowed");
    details.push(field.allowExclusions ? "Exclusions: allowed" : "Exclusions: not allowed");
  } else if (field.kind === "attachment") {
    if (field.validation?.minFiles !== undefined || field.validation?.maxFiles !== undefined) {
      details.push(`File count: ${formatFileCountBounds(field.validation)}`);
    }
    if (field.validation?.allowedMimeTypes?.length) {
      details.push(`MIME: ${field.validation.allowedMimeTypes.join(", ")}`);
    }
  } else if (field.validation) {
    const validation = formatFieldValidation(field.validation);
    if (validation) details.push(`Text constraints: ${validation}`);
  }
  if (!details.length) return null;
  return <p className="text-muted-foreground text-[11px]" id={id}>Quote contract: {details.join(" · ")}</p>;
}

function formatPreviewAmountBounds(validation: QuoteTemplateField["validation"]) {
  const min = validation?.minValueCents;
  const max = validation?.maxValueCents;
  if (min !== undefined && max !== undefined) return `Amount bounds: ${min}–${max}¢`;
  if (min !== undefined) return `Amount bounds: ${min}¢ minimum`;
  if (max !== undefined) return `Amount bounds: ${max}¢ maximum`;
  return "Amount bounds: unrestricted";
}

function formatFileCountBounds(validation: NonNullable<QuoteTemplateField["validation"]>) {
  const min = validation.minFiles;
  const max = validation.maxFiles;
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `${min} minimum`;
  if (max !== undefined) return `${max} maximum`;
  return "unrestricted";
}

function PublishStep({ fields, releaseNote, setReleaseNote }: { fields: QuoteTemplateField[]; releaseNote: string; setReleaseNote: (value: string) => void }) {
  const customCount = fields.filter((field) => !PERMANENT_KEYS.has(field.fieldKey)).length;
  return <div className="space-y-3"><Card className="border-success/30 bg-success/5"><CardPanel className="flex items-start gap-3 p-4"><CheckCircle2 className="mt-0.5 size-5 text-success-foreground" /><div><p className="font-semibold text-sm">Ready for immutable publication</p><p className="text-muted-foreground text-xs">Labour, Materials, repeatable title + amount rows, and Additional Comments remain permanently included.</p></div></CardPanel></Card><TemplateContractRow label="Additional questions" value={`${customCount} configured · ${fields.filter((field) => field.required).length} required`} /><TemplateContractRow label="Version impact" value="Existing Quote Rounds remain pinned to their dispatched snapshot" /><label className="grid gap-1.5 text-sm" htmlFor="quote-template-release-note"><span className="font-medium">Release note</span><Input id="quote-template-release-note" onChange={(event) => setReleaseNote(event.target.value)} placeholder="What changed in this version?" value={releaseNote} /></label></div>;
}

function PermanentFormAnatomy({ compact = false }: { compact?: boolean }) {
  const regions = [{ description: "Repeatable title + amount lines", icon: HardHat, label: "Labour" }, { description: "Repeatable title + amount lines", icon: PackageCheck, label: "Materials" }, { description: "TipTap rich-text response", icon: FileText, label: "Additional comments" }];
  return <div className={cn("grid gap-2", !compact && "sm:grid-cols-3")}>{regions.map(({ description, icon: Icon, label }) => <Card className="border-primary/25 bg-primary/5" key={label}><CardPanel className="flex items-center gap-3 p-3"><span className="grid size-9 place-items-center rounded-lg bg-background text-primary"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block font-medium text-sm">{label}</span><span className="block text-muted-foreground text-xs">{description}</span></span><Badge variant="outline">Always</Badge></CardPanel></Card>)}</div>;
}

function QuoteCategoryPreview({ field, icon: Icon, label }: { field?: QuoteTemplateField; icon: typeof HardHat; label: string }) {
  const inputId = `preview-${label.toLowerCase()}-line`;
  const disclosureId = `${inputId}-contract`;
  return <Card><CardHeader className="p-4 pb-2"><div className="flex items-center gap-2"><Icon className="size-4" /><CardTitle>{field?.label || label}</CardTitle><Badge className="ml-auto" variant="outline">Always included</Badge></div></CardHeader><CardPanel className="space-y-2 p-4 pt-0"><div className="grid grid-cols-[1fr_7rem] gap-2"><Input aria-label={`${label} line title`} id={inputId} placeholder={`${label} line title`} required={field?.required} /><Input aria-describedby={disclosureId} aria-label={`${label} amount in cents`} inputMode="numeric" max={field?.validation?.maxValueCents} min={field?.validation?.minValueCents} placeholder="0" required={field?.required} step={1} type="number" /></div><PreviewContractDisclosure field={field ?? { fieldKey: `${label.toLowerCase()}_line_items`, kind: "priced_line", label, order: 0, required: false, scope: label.toLowerCase() === "labour" ? "labour" : "materials" }} id={disclosureId} /><Button size="sm" variant="outline"><Plus />New {label.toLowerCase()} line</Button></CardPanel></Card>;
}

function TemplateContractRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-foreground" /><div className="min-w-0"><p className="text-muted-foreground text-xs">{label}</p><p className="font-medium text-sm">{value}</p></div></div>;
}

function audienceLabel(audience: Audience) {
  return audience === "either" ? "Contractor + supplier" : audience === "contractor" ? "Contractor" : "Supplier";
}

function statusLabel(template: QuoteTemplate) {
  const current = template.currentVersion;
  return current?.status === "published" ? `Published v${current.version}` : "Draft in progress";
}

function scopeLabel(scope: FieldScope) {
  return scope === "whole_quote" ? "Whole quote" : scope[0]?.toUpperCase() + scope.slice(1);
}

function stepDescription(step: Step) {
  switch (step) {
    case "identity": return "Name this reusable response contract and define who it serves.";
    case "questions": return "Add only the answers needed to compare quotes correctly.";
    case "anatomy": return "Confirm the permanent form regions and category language.";
    case "preview": return "Review the exact continuous form a recipient will complete.";
    case "publish": return "Publish an immutable version without changing active rounds.";
  }
}

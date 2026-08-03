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
import { useMutation, useQuery } from "convex/react";

import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
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
  createdAt: number;
  fields: QuoteTemplateField[];
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
  versions: Array<Omit<QuoteTemplateVersion, "fields">>;
};

type Registry = { templates: QuoteTemplate[] };

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

export function QuoteTemplateRegistry({
  workosOrganizationId,
}: {
  workosOrganizationId: string;
}) {
  const registryQuery = useQuery(
    api.quote_response_templates.listQuoteResponseTemplates,
    { workosOrganizationId }
  );
  const registry = registryQuery as Registry | undefined;
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

  const selectedTemplate = registry?.templates.find(
    (template) => template._id === selectedTemplateId
  );
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
    setMessage(undefined);
  };

  const beginNewTemplate = () => {
    setNewTemplateOpen(true);
    setSelectedTemplateId(undefined);
    setMessage(undefined);
  };

  const startGuided = (template: QuoteTemplate, version?: QuoteTemplateVersion) => {
    setSelectedTemplateId(template._id);
    setDraftTemplateId(template._id);
    setDraftVersionId(version?._id);
    setDraftName(template.name);
    setDraftDescription(template.description ?? "");
    setDraftAudience(template.audience);
    setDraftFields(cloneFields(version?.fields ?? template.currentVersion?.fields));
    setStep("identity");
    setMode("guided");
    setMessage(undefined);
  };

  const createTemplate = async () => {
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
      setMessage(error instanceof Error ? error.message : "Could not create draft.");
    }
  };

  const saveCurrentDraft = async (): Promise<boolean> => {
    if (!(effectiveDraftId && effectiveVersionId)) {
      setMessage("Choose a draft version before saving.");
      return false;
    }
    try {
      await saveDraft({
        audience: draftAudience,
        description: draftDescription,
        fields: normalizeOrder(draftFields),
        name: draftName,
        templateId: effectiveDraftId as never,
        versionId: effectiveVersionId as never,
        workosOrganizationId,
      });
      setDraftFields((fields) => normalizeOrder(fields));
      setMessage("Draft saved and validated.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save draft.");
      return false;
    }
  };

  const ensureNewVersionDraft = async () => {
    if (!selectedTemplate) {
      return;
    }
    try {
      const created = await createDraft({
        audience: selectedTemplate.audience,
        description: selectedTemplate.description,
        name: selectedTemplate.name,
        sourceTemplateId: selectedTemplate._id as never,
        workosOrganizationId,
      });
      setDraftTemplateId(String(created.templateId));
      setDraftVersionId(String(created.versionId));
      setDraftName(selectedTemplate.name);
      setDraftDescription(selectedTemplate.description ?? "");
      setDraftAudience(selectedTemplate.audience);
      setDraftFields(cloneFields(selectedTemplate.currentVersion?.fields));
      setMode("guided");
      setStep("identity");
      setMessage("A new immutable version draft is ready to edit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create version draft.");
    }
  };

  const publishCurrentDraft = async () => {
    if (!(effectiveDraftId && effectiveVersionId)) {
      return;
    }
    try {
      const saved = await saveCurrentDraft();
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
      setMessage(error instanceof Error ? error.message : "Could not publish version.");
    }
  };

  const selectPublishedVersion = async (versionId: string) => {
    if (!selectedTemplate) {
      return;
    }
    try {
      await selectVersion({
        templateId: selectedTemplate._id as never,
        versionId: versionId as never,
        workosOrganizationId,
      });
      setMessage("Selected version updated for new Quote Rounds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not select version.");
    }
  };

  const registryContent = (
    <TemplateRegistryPanel
      message={message}
      newTemplateOpen={newTemplateOpen}
      onBeginNew={beginNewTemplate}
      onCancelNew={() => setNewTemplateOpen(false)}
      onCreate={createTemplate}
      onCreateNextVersion={ensureNewVersionDraft}
      onOpenTemplate={openTemplate}
      onSelectVersion={selectPublishedVersion}
      onStartGuided={startGuided}
      registry={registry}
      selectedTemplate={selectedTemplate}
      selectedTemplateId={selectedTemplateId}
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
  onOpenTemplate,
  onSelectVersion,
  onStartGuided,
  registry,
  selectedTemplate,
  selectedTemplateId,
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
  onOpenTemplate: (template: QuoteTemplate) => void;
  onSelectVersion: (versionId: string) => void;
  onStartGuided: (template: QuoteTemplate, version?: QuoteTemplateVersion) => void;
  registry?: Registry;
  selectedTemplate?: QuoteTemplate;
  selectedTemplateId?: string;
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
              <Button onClick={onBeginNew}>
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
                    <Button disabled={!draftName.trim()} onClick={onCreate}><Plus />Create draft</Button>
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
                        <span className="text-muted-foreground text-xs">{template.versions.filter((version) => version.status === "published").length} published</span>
                      </CardPanel>
                    </Card>
                  );
                })}
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
                <TemplateContractRow label="Custom fields" value={`${Math.max(0, (selectedTemplate.currentVersion?.fields.length ?? 3) - 3)} configured`} />
                <TemplateContractRow label="Version history" value={`${selectedTemplate.versions.filter((version) => version.status === "published").length} published · ${selectedTemplate.versions.filter((version) => version.status === "draft").length} draft`} />
                <div className="grid grid-cols-2 gap-2">
                  {selectedTemplate.currentVersion?.status === "draft" ? (
                    <Button className="col-span-2" onClick={() => onStartGuided(selectedTemplate, selectedTemplate.currentVersion ?? undefined)} variant="outline"><Pencil />Edit draft</Button>
                  ) : (
                    <Button className="col-span-2" onClick={onCreateNextVersion}><Copy />Create next version draft</Button>
                  )}
                </div>
                <div className="space-y-2 border-t pt-3">
                  <p className="font-semibold text-sm">Version history</p>
                  {selectedTemplate.versions.map((version) => (
                    <div className="flex items-center gap-2" key={version._id}>
                      <span className="min-w-0 flex-1 text-xs">v{version.version} · {version.status}</span>
                      {version.status === "published" ? <Button onClick={() => onSelectVersion(version._id)} size="sm" variant={selectedTemplate.selectedVersion?._id === version._id ? "secondary" : "ghost"}>{selectedTemplate.selectedVersion?._id === version._id ? "Selected" : "Select"}</Button> : null}
                    </div>
                  ))}
                </div>
                {selectedTemplate.selectedVersion ? (
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center gap-2"><History className="size-4" /><p className="font-semibold text-sm">Selected version inspection</p></div>
                    {selectedTemplate.selectedVersion.fields.filter((field) => !PERMANENT_KEYS.has(field.fieldKey)).map((field) => <div className="flex items-center gap-2 text-xs" key={field.fieldKey}><span className="min-w-0 flex-1 truncate">{field.label}</span><Badge variant="outline">{KIND_LABELS[field.kind]}</Badge>{field.required ? <Badge variant="secondary">Required</Badge> : null}</div>)}
                  </div>
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

function GuidedTemplateRecipe({
  draftAudience,
  draftDescription,
  draftFields,
  draftName,
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
          <Button onClick={onSave} variant="outline"><Save />Save draft</Button>
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
          <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5"><Button disabled={stepIndex === 0} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]?.id ?? "identity")} variant="outline"><ArrowLeft />Back</Button><Button onClick={() => step === "publish" ? onPublish() : setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]?.id ?? "publish")}>{step === "publish" ? "Publish immutable version" : "Continue"}{step === "publish" ? <ShieldCheck /> : <ArrowRight />}</Button></div>
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
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Type</span><NativeSelect onChange={(event) => onUpdate(field.fieldKey, { kind: event.target.value as FieldKind, choiceOptions: event.target.value === "choice" ? ["Included", "Excluded"] : undefined })} value={field.kind}><NativeSelectOption value="priced_line">Priced line</NativeSelectOption><NativeSelectOption value="short_text">Short text</NativeSelectOption><NativeSelectOption value="long_text">Long text</NativeSelectOption><NativeSelectOption value="date">Date</NativeSelectOption><NativeSelectOption value="choice">Choice</NativeSelectOption><NativeSelectOption value="attachment">Attachment</NativeSelectOption></NativeSelect></label>
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Scope</span><NativeSelect onChange={(event) => onUpdate(field.fieldKey, { scope: event.target.value as FieldScope })} value={field.scope}><NativeSelectOption value="whole_quote">Whole quote</NativeSelectOption><NativeSelectOption value="labour">Labour</NativeSelectOption><NativeSelectOption value="materials">Materials</NativeSelectOption></NativeSelect></label>
          <label className="grid gap-1.5 text-xs"><span className="font-medium">Requiredness</span><NativeSelect onChange={(event) => onUpdate(field.fieldKey, { required: event.target.value === "required" })} value={field.required ? "required" : "optional"}><NativeSelectOption value="required">Required</NativeSelectOption><NativeSelectOption value="optional">Optional</NativeSelectOption></NativeSelect></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {field.kind === "priced_line" ? <Button onClick={() => onUpdate(field.fieldKey, { repeatable: !field.repeatable })} size="sm" variant={field.repeatable ? "secondary" : "outline"}>{field.repeatable ? "Repeatable lines" : "Single line"}</Button> : null}
          <Button onClick={() => onUpdate(field.fieldKey, { allowAlternates: !field.allowAlternates })} size="sm" variant={field.allowAlternates ? "secondary" : "outline"}>Alternates</Button>
          <Button onClick={() => onUpdate(field.fieldKey, { allowExclusions: !field.allowExclusions })} size="sm" variant={field.allowExclusions ? "secondary" : "outline"}>Exclusions</Button>
          {field.kind === "priced_line" ? <Button onClick={() => onUpdate(field.fieldKey, { supportsTax: !field.supportsTax, tax: !field.supportsTax ? { label: field.tax?.label ?? "GST", rateBps: field.tax?.rateBps ?? 500 } : undefined })} size="sm" variant={field.supportsTax ? "secondary" : "outline"}>Tax</Button> : null}
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
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-sm">Recipient mobile preview</p><p className="text-muted-foreground text-xs">One continuous form · no Labour/Materials tabs</p></div><Badge variant="success">Ready</Badge></div><QuoteCategoryPreview icon={HardHat} items={fields.find((field) => field.fieldKey === "labour_line_items")?.label ?? "Labour"} label="Labour" /><QuoteCategoryPreview icon={PackageCheck} items={fields.find((field) => field.fieldKey === "materials_line_items")?.label ?? "Materials"} label="Materials" /><div><p className="mb-2 font-semibold text-sm">Additional questions</p><div className="grid gap-2 sm:grid-cols-2">{customFields.map((field) => <label className="grid gap-1.5 text-sm" htmlFor={`preview-${field.fieldKey}`} key={field.fieldKey}><span className="font-medium">{field.label}</span><Input id={`preview-${field.fieldKey}`} placeholder={KIND_LABELS[field.kind]} /></label>)}</div></div><Card className="border-primary/25 bg-primary/5"><CardHeader className="p-4 pb-2"><div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><CardTitle>Additional comments</CardTitle><Badge className="ml-auto" variant="outline">Always included</Badge></div></CardHeader><CardPanel className="p-4 pt-0"><div className="min-h-20 rounded-lg border bg-background p-3 text-muted-foreground text-sm">Explain assumptions, alternates, exclusions, and anything else we should understand.</div></CardPanel></Card></div>;
}

function PublishStep({ fields, releaseNote, setReleaseNote }: { fields: QuoteTemplateField[]; releaseNote: string; setReleaseNote: (value: string) => void }) {
  const customCount = fields.filter((field) => !PERMANENT_KEYS.has(field.fieldKey)).length;
  return <div className="space-y-3"><Card className="border-success/30 bg-success/5"><CardPanel className="flex items-start gap-3 p-4"><CheckCircle2 className="mt-0.5 size-5 text-success-foreground" /><div><p className="font-semibold text-sm">Ready for immutable publication</p><p className="text-muted-foreground text-xs">Labour, Materials, repeatable title + amount rows, and Additional Comments remain permanently included.</p></div></CardPanel></Card><TemplateContractRow label="Additional questions" value={`${customCount} configured · ${fields.filter((field) => field.required).length} required`} /><TemplateContractRow label="Version impact" value="Existing Quote Rounds remain pinned to their dispatched snapshot" /><label className="grid gap-1.5 text-sm" htmlFor="quote-template-release-note"><span className="font-medium">Release note</span><Input id="quote-template-release-note" onChange={(event) => setReleaseNote(event.target.value)} placeholder="What changed in this version?" value={releaseNote} /></label></div>;
}

function PermanentFormAnatomy({ compact = false }: { compact?: boolean }) {
  const regions = [{ description: "Repeatable title + amount lines", icon: HardHat, label: "Labour" }, { description: "Repeatable title + amount lines", icon: PackageCheck, label: "Materials" }, { description: "TipTap rich-text response", icon: FileText, label: "Additional comments" }];
  return <div className={cn("grid gap-2", !compact && "sm:grid-cols-3")}>{regions.map(({ description, icon: Icon, label }) => <Card className="border-primary/25 bg-primary/5" key={label}><CardPanel className="flex items-center gap-3 p-3"><span className="grid size-9 place-items-center rounded-lg bg-background text-primary"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block font-medium text-sm">{label}</span><span className="block text-muted-foreground text-xs">{description}</span></span><Badge variant="outline">Always</Badge></CardPanel></Card>)}</div>;
}

function QuoteCategoryPreview({ icon: Icon, items, label }: { icon: typeof HardHat; items: string; label: string }) {
  return <Card><CardHeader className="p-4 pb-2"><div className="flex items-center gap-2"><Icon className="size-4" /><CardTitle>{items || label}</CardTitle><Badge className="ml-auto" variant="outline">Always included</Badge></div></CardHeader><CardPanel className="space-y-2 p-4 pt-0"><div className="grid grid-cols-[1fr_7rem] gap-2"><Input placeholder={`${label} line title`} /><Input placeholder="$0.00" /></div><Button size="sm" variant="outline"><Plus />New {label.toLowerCase()} line</Button></CardPanel></Card>;
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

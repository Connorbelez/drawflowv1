"use client";

// THROWAWAY PROTOTYPE — three Quote Response Template configuration directions
// hosted by the existing Builder Build route. All state is local.

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  GripVertical,
  HardHat,
  History,
  Library,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

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
import type { ProductionBuildDetail } from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { cn } from "#/lib/utils.ts";

export type QuoteTemplatePrototypeVariant =
  | "quote-template-guided"
  | "quote-template-registry"
  | "quote-template-canvas";

interface TemplateQuestion {
  id: string;
  label: string;
  meta: string;
  required: boolean;
}

const TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  {
    id: "availability",
    label: "Earliest available start",
    meta: "Date · Whole quote",
    required: true,
  },
  {
    id: "crew",
    label: "Estimated crew size",
    meta: "Number · Labour",
    required: false,
  },
  {
    id: "lead-time",
    label: "Material lead time",
    meta: "Short text · Materials",
    required: true,
  },
  {
    id: "warranty",
    label: "Warranty included?",
    meta: "Yes / No · Whole quote",
    required: true,
  },
];

const TEMPLATE_VARIANT_LABELS: Record<QuoteTemplatePrototypeVariant, string> = {
  "quote-template-canvas": "Response Contract Canvas",
  "quote-template-guided": "Guided Template Recipe",
  "quote-template-registry": "Template Registry",
};

export function QuoteTemplateConfigurationPrototype({
  detail,
  onBackToComposer,
  variant,
}: {
  detail: ProductionBuildDetail;
  onBackToComposer: () => void;
  variant: QuoteTemplatePrototypeVariant;
}) {
  return (
    <div className="min-h-screen bg-muted/25 pb-24">
      <TemplateHeader
        detail={detail}
        onBackToComposer={onBackToComposer}
        title={TEMPLATE_VARIANT_LABELS[variant]}
      />
      {variant === "quote-template-guided" ? <GuidedTemplateRecipe /> : null}
      {variant === "quote-template-registry" ? <TemplateRegistry /> : null}
      {variant === "quote-template-canvas" ? <ResponseContractCanvas /> : null}
    </div>
  );
}

function TemplateHeader({
  detail,
  onBackToComposer,
  title,
}: {
  detail: ProductionBuildDetail;
  onBackToComposer: () => void;
  title: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/96 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <Button
          aria-label="Back to Scope Lock"
          onClick={onBackToComposer}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-sm">{title}</p>
            <Badge variant="info">Response templates</Badge>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {detail.build.buildName} · Organization template workspace
          </p>
        </div>
        <Badge className="hidden sm:inline-flex" variant="outline">
          <LockKeyhole />
          Local prototype
        </Badge>
        <Button onClick={onBackToComposer} variant="outline">
          Back to quote
        </Button>
      </div>
    </header>
  );
}

const GUIDED_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "questions", label: "Questions" },
  { id: "anatomy", label: "Anatomy" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
] as const;

type GuidedStep = (typeof GUIDED_STEPS)[number]["id"];

function GuidedTemplateRecipe() {
  const [step, setStep] = useState<GuidedStep>("questions");
  const [questions, setQuestions] =
    useState<TemplateQuestion[]>(TEMPLATE_QUESTIONS);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const stepIndex = GUIDED_STEPS.findIndex((item) => item.id === step);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: `question-${questions.length + 1}`,
        label: "Insurance certificate",
        meta: "File upload · Whole quote",
        required: true,
      },
    ]);
    setShowNewQuestion(false);
  };

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 p-3 sm:p-5 lg:grid-cols-[230px_minmax(0,1fr)_290px]">
      <Frame className="hidden self-start lg:flex">
        <FrameHeader>
          <FrameTitle>Standard trade quote</FrameTitle>
          <FrameDescription>Draft version 4 · Autosaved</FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-1 p-2">
          {GUIDED_STEPS.map((item, index) => (
            <Button
              className="w-full justify-start"
              key={item.id}
              onClick={() => setStep(item.id)}
              variant={step === item.id ? "secondary" : "ghost"}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-md text-xs",
                  index < stepIndex
                    ? "bg-success/12 text-success-foreground"
                    : "bg-muted"
                )}
              >
                {index < stepIndex ? <Check className="size-3.5" /> : index + 1}
              </span>
              {item.label}
              {step === item.id ? <ChevronRight className="ml-auto" /> : null}
            </Button>
          ))}
        </FramePanel>
      </Frame>

      <div className="min-w-0 max-w-full overflow-hidden lg:hidden">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {GUIDED_STEPS.map((item, index) => (
            <Button
              className="min-w-fit"
              key={item.id}
              onClick={() => setStep(item.id)}
              size="sm"
              variant={step === item.id ? "default" : "outline"}
            >
              {index + 1}. {item.label}
            </Button>
          ))}
        </div>
      </div>

      <Frame>
        <FrameHeader className="gap-1">
          <div className="flex items-center justify-between gap-3">
            <FrameTitle>
              {GUIDED_STEPS.find((item) => item.id === step)?.label}
            </FrameTitle>
            <Badge variant="outline">Step {stepIndex + 1} of 5</Badge>
          </div>
          <FrameDescription>
            {step === "identity" &&
              "Name this reusable response contract and define who it serves."}
            {step === "questions" &&
              "Add only the answers needed to compare quotes correctly."}
            {step === "anatomy" &&
              "Confirm the permanent form regions and category language."}
            {step === "preview" &&
              "Review the exact continuous form a recipient will complete."}
            {step === "publish" &&
              "Publish an immutable version without changing active rounds."}
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-4 sm:p-5">
          {step === "identity" ? <TemplateIdentity /> : null}
          {step === "questions" ? (
            <QuestionRecipe
              addQuestion={addQuestion}
              questions={questions}
              setQuestions={setQuestions}
              setShowNewQuestion={setShowNewQuestion}
              showNewQuestion={showNewQuestion}
            />
          ) : null}
          {step === "anatomy" ? <TemplateAnatomy /> : null}
          {step === "preview" ? <ContinuousQuoteFormPreview /> : null}
          {step === "publish" ? (
            <PublishTemplateSummary questions={questions} />
          ) : null}
        </FramePanel>
        <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5">
          <Button
            disabled={stepIndex === 0}
            onClick={() =>
              setStep(
                GUIDED_STEPS[Math.max(0, stepIndex - 1)]?.id ?? "identity"
              )
            }
            variant="outline"
          >
            <ArrowLeft />
            Back
          </Button>
          <Button
            onClick={() =>
              setStep(
                GUIDED_STEPS[Math.min(GUIDED_STEPS.length - 1, stepIndex + 1)]
                  ?.id ?? "publish"
              )
            }
          >
            {step === "publish" ? "Publish version 4" : "Continue"}
            {step === "publish" ? <ShieldCheck /> : <ArrowRight />}
          </Button>
        </div>
      </Frame>

      <Frame className="hidden self-start lg:flex">
        <FrameHeader>
          <FrameTitle>Template contract</FrameTitle>
          <FrameDescription>What this template may control.</FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-3 p-3">
          <TemplateContractRow
            label="Permanent regions"
            value="Labour · Materials · 2 escape hatches"
          />
          <TemplateContractRow
            label="Custom questions"
            value={`${questions.length} configured`}
          />
          <TemplateContractRow
            label="Published"
            value="Version 3 · 12 rounds"
          />
          <TemplateContractRow label="Timing" value="Configured at dispatch" />
        </FramePanel>
      </Frame>
    </main>
  );
}

function TemplateIdentity() {
  return (
    <div className="space-y-4">
      <label className="grid gap-1.5 text-sm" htmlFor="template-name">
        <span className="font-medium">Template name</span>
        <Input defaultValue="Standard trade quote" id="template-name" />
      </label>
      <label className="grid gap-1.5 text-sm" htmlFor="template-description">
        <span className="font-medium">Internal description</span>
        <Input
          defaultValue="Default mixed labour and materials response form"
          id="template-description"
        />
      </label>
      <div>
        <p className="font-medium text-sm">Intended recipient</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {["Contractor", "Supplier", "Either"].map((label) => (
            <Button
              key={label}
              variant={label === "Either" ? "default" : "outline"}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <Card className="border-info/30 bg-info/5">
        <CardPanel className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-4 text-info-foreground" />
          <div>
            <p className="font-medium text-sm">Response contract only</p>
            <p className="text-muted-foreground text-xs">
              Scope, recipients, deadlines, and magic-link expiry stay in the
              Quote Round composer.
            </p>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}

function QuestionRecipe({
  addQuestion,
  questions,
  setQuestions,
  setShowNewQuestion,
  showNewQuestion,
}: {
  addQuestion: () => void;
  questions: TemplateQuestion[];
  setQuestions: (questions: TemplateQuestion[]) => void;
  setShowNewQuestion: (show: boolean) => void;
  showNewQuestion: boolean;
}) {
  return (
    <div className="space-y-3">
      <PermanentFormAnatomy compact />
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <p className="font-semibold text-sm">Additional questions</p>
          <p className="text-muted-foreground text-xs">
            Ordered after the permanent line-item sections.
          </p>
        </div>
        <Badge variant="outline">{questions.length} configured</Badge>
      </div>
      <div className="space-y-2">
        {questions.map((question, index) => (
          <Card key={question.id}>
            <CardPanel className="flex items-center gap-3 p-3">
              <GripVertical className="size-4 text-muted-foreground" />
              <span className="grid size-7 place-items-center rounded-md bg-muted font-semibold text-xs">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">
                  {question.label}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {question.meta} ·{" "}
                  {question.required ? "Required" : "Optional"}
                </span>
              </span>
              <Button
                aria-label={`Toggle required for ${question.label}`}
                onClick={() =>
                  setQuestions(
                    questions.map((item) =>
                      item.id === question.id
                        ? { ...item, required: !item.required }
                        : item
                    )
                  )
                }
                size="sm"
                variant={question.required ? "secondary" : "ghost"}
              >
                {question.required ? "Required" : "Optional"}
              </Button>
            </CardPanel>
          </Card>
        ))}
      </div>
      {showNewQuestion ? (
        <Card className="border-primary/35">
          <CardHeader className="p-4 pb-2">
            <CardTitle>New response question</CardTitle>
            <CardDescription>
              This field is added to the reusable template draft.
            </CardDescription>
          </CardHeader>
          <CardPanel className="grid gap-3 p-4 pt-0">
            <Input defaultValue="Insurance certificate" />
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary">File upload</Button>
              <Button variant="outline">Whole quote</Button>
              <Button variant="outline">Required</Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowNewQuestion(false)} variant="ghost">
                Cancel
              </Button>
              <Button onClick={addQuestion}>
                <Plus />
                Add question
              </Button>
            </div>
          </CardPanel>
        </Card>
      ) : (
        <Button onClick={() => setShowNewQuestion(true)} variant="outline">
          <Plus />
          Add response question
        </Button>
      )}
    </div>
  );
}

function TemplateAnatomy() {
  return (
    <div className="space-y-4">
      <PermanentFormAnatomy />
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle>Category labels</CardTitle>
          <CardDescription>
            Canonical Labour and Materials semantics cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm" htmlFor="labour-label">
            <span className="font-medium">Labour label</span>
            <Input defaultValue="Labour" id="labour-label" />
          </label>
          <label className="grid gap-1.5 text-sm" htmlFor="materials-label">
            <span className="font-medium">Materials label</span>
            <Input defaultValue="Materials" id="materials-label" />
          </label>
        </CardPanel>
      </Card>
    </div>
  );
}

function PermanentFormAnatomy({ compact = false }: { compact?: boolean }) {
  const regions = [
    {
      description: "Repeatable title + amount lines",
      icon: HardHat,
      label: "Labour",
    },
    {
      description: "Repeatable title + amount lines",
      icon: PackageCheck,
      label: "Materials",
    },
    {
      description: "TipTap rich-text response",
      icon: FileText,
      label: "Additional comments",
    },
  ];

  return (
    <div className={cn("grid gap-2", !compact && "sm:grid-cols-3")}>
      {regions.map(({ description, icon: Icon, label }) => (
        <Card className="border-primary/25 bg-primary/5" key={label}>
          <CardPanel className="flex items-center gap-3 p-3">
            <span className="grid size-9 place-items-center rounded-lg bg-background text-primary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-sm">{label}</span>
              <span className="block text-muted-foreground text-xs">
                {description}
              </span>
            </span>
            <Badge variant="outline">Always</Badge>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ContinuousQuoteFormPreview() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">Recipient mobile preview</p>
          <p className="text-muted-foreground text-xs">
            One continuous form · no Labour/Materials tabs
          </p>
        </div>
        <Badge variant="success">Ready</Badge>
      </div>
      <QuoteCategoryPreview
        icon={HardHat}
        items={["Framing crew", "Roof truss installation"]}
        label="Labour"
      />
      <QuoteCategoryPreview
        icon={PackageCheck}
        items={["Fasteners and blocking", "Roof truss package"]}
        label="Materials"
      />
      <div>
        <p className="mb-2 font-semibold text-sm">Additional questions</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATE_QUESTIONS.map((question) => (
            <label
              className="grid gap-1.5 text-sm"
              htmlFor={`preview-${question.id}`}
              key={question.id}
            >
              <span className="font-medium">{question.label}</span>
              <Input
                id={`preview-${question.id}`}
                placeholder={question.meta.split(" · ")[0]}
              />
            </label>
          ))}
        </div>
      </div>
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <CardTitle>Additional comments</CardTitle>
            <Badge className="ml-auto" variant="outline">
              Always included
            </Badge>
          </div>
        </CardHeader>
        <CardPanel className="p-4 pt-0">
          <div className="min-h-20 rounded-lg border bg-background p-3 text-muted-foreground text-sm">
            Describe assumptions, exclusions, and anything else we should
            understand.
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}

function QuoteCategoryPreview({
  icon: Icon,
  items,
  label,
}: {
  icon: typeof HardHat;
  items: string[];
  label: string;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4" />
          <CardTitle>{label}</CardTitle>
          <Badge className="ml-auto" variant="outline">
            Always included
          </Badge>
        </div>
      </CardHeader>
      <CardPanel className="space-y-2 p-4 pt-0">
        {items.map((item) => (
          <div className="grid grid-cols-[1fr_7rem] gap-2" key={item}>
            <Input defaultValue={item} />
            <Input placeholder="$0.00" />
          </div>
        ))}
        <Button size="sm" variant="outline">
          <Plus />
          New {label.toLowerCase()} line
        </Button>
      </CardPanel>
    </Card>
  );
}

function PublishTemplateSummary({
  questions,
}: {
  questions: TemplateQuestion[];
}) {
  return (
    <div className="space-y-3">
      <Card className="border-success/30 bg-success/5">
        <CardPanel className="flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 size-5 text-success-foreground" />
          <div>
            <p className="font-semibold text-sm">Version 4 is ready</p>
            <p className="text-muted-foreground text-xs">
              Labour, Materials, repeatable title + amount rows, and Additional
              Comments remain permanently included.
            </p>
          </div>
        </CardPanel>
      </Card>
      <TemplateContractRow
        label="Additional questions"
        value={`${questions.length} configured · ${questions.filter((item) => item.required).length} required`}
      />
      <TemplateContractRow
        label="Change from version 3"
        value="1 new file upload · 1 label revised"
      />
      <TemplateContractRow
        label="Existing Quote Rounds"
        value="Remain pinned to their dispatched snapshot"
      />
      <label className="grid gap-1.5 text-sm" htmlFor="release-note">
        <span className="font-medium">Release note</span>
        <Input
          defaultValue="Add insurance certificate request"
          id="release-note"
        />
      </label>
    </div>
  );
}

function TemplateContractRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-foreground" />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

const REGISTRY_TEMPLATES = [
  {
    audience: "Contractor + supplier",
    name: "Standard trade quote",
    status: "Published",
    usage: "12 rounds",
    version: "v3",
  },
  {
    audience: "Contractor",
    name: "Mechanical rough-in",
    status: "Draft",
    usage: "4 rounds",
    version: "v2 draft",
  },
  {
    audience: "Supplier",
    name: "Material supply package",
    status: "Published",
    usage: "9 rounds",
    version: "v5",
  },
];

function TemplateRegistry() {
  const [selected, setSelected] = useState(REGISTRY_TEMPLATES[0]?.name ?? "");

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Frame>
        <FrameHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <FrameTitle>Quote response templates</FrameTitle>
              <FrameDescription>
                Govern reusable response contracts and immutable versions.
              </FrameDescription>
            </div>
            <Button>
              <Plus />
              New template
            </Button>
          </div>
        </FrameHeader>
        <FramePanel className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              aria-label="Search templates"
              placeholder="Search templates"
            />
            <Button variant="outline">All audiences</Button>
            <Button variant="outline">Published + drafts</Button>
          </div>
          <div className="space-y-2">
            {REGISTRY_TEMPLATES.map((template) => (
              <Card
                className={cn(
                  "cursor-pointer text-left",
                  selected === template.name && "border-primary/40 bg-primary/5"
                )}
                key={template.name}
                onClick={() => setSelected(template.name)}
                render={<button type="button" />}
              >
                <CardPanel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <span>
                    <span className="block font-semibold text-sm">
                      {template.name}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {template.audience} · Labour + Materials
                    </span>
                  </span>
                  <span className="flex items-center gap-2 sm:justify-end">
                    <Badge
                      variant={
                        template.status === "Published" ? "success" : "warning"
                      }
                    >
                      {template.status}
                    </Badge>
                    <Badge variant="outline">{template.version}</Badge>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {template.usage}
                  </span>
                </CardPanel>
              </Card>
            ))}
          </div>
        </FramePanel>
      </Frame>
      <Frame className="self-start">
        <FrameHeader>
          <FrameTitle>{selected}</FrameTitle>
          <FrameDescription>
            Published v3 · Recommended for mixed scope
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-4 p-4">
          <PermanentFormAnatomy compact />
          <TemplateContractRow
            label="Applicability"
            value="Contractors, suppliers · all residential trades"
          />
          <TemplateContractRow
            label="Custom questions"
            value="4 configured · stable answer keys"
          />
          <TemplateContractRow
            label="Version history"
            value="3 published · 1 draft"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline">
              <History />
              History
            </Button>
            <Button>
              <Pencil />
              Edit draft
            </Button>
          </div>
          <Button className="w-full" variant="secondary">
            <Copy />
            Duplicate template
          </Button>
        </FramePanel>
      </Frame>
    </main>
  );
}

function ResponseContractCanvas() {
  const [selectedField, setSelectedField] = useState("availability");
  const [comments, setComments] = useState(
    "<p>Explain assumptions, exclusions, and anything else we should understand.</p>"
  );

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Frame>
        <FrameHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <FrameTitle>Standard trade quote</FrameTitle>
              <FrameDescription>
                Direct response-contract canvas · Autosaved
              </FrameDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Library />
                Use another
              </Button>
              <Button>
                <Save />
                Save as template
              </Button>
            </div>
          </div>
        </FrameHeader>
        <FramePanel className="space-y-4 p-4 sm:p-5">
          <Card className="border-info/25 bg-info/5">
            <CardPanel className="p-4">
              <p className="font-semibold text-sm">
                Bundled scope · 2 sub-milestones
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Framing and roof structure · Labour and Materials remain
                continuously visible.
              </p>
            </CardPanel>
          </Card>
          <QuoteCategoryPreview
            icon={HardHat}
            items={["Framing crew", "Roof truss installation"]}
            label="Labour"
          />
          <QuoteCategoryPreview
            icon={PackageCheck}
            items={["Fasteners and blocking", "Roof truss package"]}
            label="Materials"
          />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold text-sm">Custom response fields</p>
              <Button size="sm" variant="outline">
                <Plus />
                Add field
              </Button>
            </div>
            <div className="space-y-2">
              {TEMPLATE_QUESTIONS.map((question) => (
                <Card
                  className={cn(
                    "cursor-pointer text-left",
                    selectedField === question.id &&
                      "border-primary/40 bg-primary/5"
                  )}
                  key={question.id}
                  onClick={() => setSelectedField(question.id)}
                  render={<button type="button" />}
                >
                  <CardPanel className="flex items-center gap-3 p-3">
                    <GripVertical className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">
                        {question.label}
                      </span>
                      <span className="block text-muted-foreground text-xs">
                        {question.meta}
                      </span>
                    </span>
                    <Badge
                      variant={question.required ? "secondary" : "outline"}
                    >
                      {question.required ? "Required" : "Optional"}
                    </Badge>
                  </CardPanel>
                </Card>
              ))}
            </div>
          </div>
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <CardTitle>Additional comments</CardTitle>
                <Badge className="ml-auto" variant="outline">
                  Always included
                </Badge>
              </div>
            </CardHeader>
            <CardPanel className="p-4 pt-0">
              <FieldRichTextEditor
                ariaLabel="Template additional comments"
                editorMinHeightClass="[&_.ProseMirror]:min-h-24"
                onChange={setComments}
                value={comments}
              />
            </CardPanel>
          </Card>
        </FramePanel>
      </Frame>

      <Frame className="self-start xl:sticky xl:top-20">
        <FrameHeader>
          <FrameTitle>Field rules</FrameTitle>
          <FrameDescription>
            Inspect the selected field without leaving the canvas.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-4 p-4">
          <label className="grid gap-1.5 text-sm" htmlFor="canvas-field-label">
            <span className="font-medium">Label</span>
            <Input
              defaultValue={
                TEMPLATE_QUESTIONS.find((item) => item.id === selectedField)
                  ?.label
              }
              id="canvas-field-label"
              key={selectedField}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary">Required</Button>
            <Button variant="outline">Whole quote</Button>
          </div>
          <Card>
            <CardPanel className="p-3">
              <div className="flex items-center gap-2">
                <Settings2 className="size-4 text-muted-foreground" />
                <p className="font-medium text-sm">Shown because</p>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                This field applies to every mixed-scope Quote Round using
                Standard trade quote.
              </p>
            </CardPanel>
          </Card>
          <TemplateContractRow
            label="Stable answer key"
            value={`standard.${selectedField}`}
          />
          <TemplateContractRow
            label="Version impact"
            value="Copy-only change · non-breaking"
          />
        </FramePanel>
      </Frame>
    </main>
  );
}

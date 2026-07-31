"use client";

// PROTOTYPE ONLY — three External Quote Response directions on the canonical
// /quote/$quoteInvitationToken route, switchable via ?variant=.

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  CloudOff,
  FileCheck2,
  FileText,
  HardHat,
  Layers3,
  MapPin,
  PackageCheck,
  Paperclip,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { InteractiveSiteMap } from "#/components/maps/interactive-site-map.tsx";
import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

export const EXTERNAL_QUOTE_VARIANTS = [
  { key: "scope-passport", name: "Scope Passport" },
  { key: "scope-folio", name: "Scope Folio" },
  { key: "field-ledger", name: "Field Ledger" },
] as const;

export type ExternalQuotePrototypeVariant =
  (typeof EXTERNAL_QUOTE_VARIANTS)[number]["key"];

export const EXTERNAL_QUOTE_SCENARIOS = [
  ["first-visit", "First visit"],
  ["returning-draft", "Returning autosaved draft"],
  ["offline-recovery", "Offline recovery"],
  ["package-revision", "Package revision"],
  ["validation", "Validation blockers"],
  ["submitted", "Submitted confirmation"],
  ["expired", "Expired link"],
  ["revoked", "Revoked / invalid link"],
  ["loading-error", "Loading error"],
] as const;

export type ExternalQuotePrototypeScenario =
  (typeof EXTERNAL_QUOTE_SCENARIOS)[number][0];

export function isExternalQuotePrototypeVariant(
  value: unknown
): value is ExternalQuotePrototypeVariant {
  return EXTERNAL_QUOTE_VARIANTS.some((variant) => variant.key === value);
}

export function isExternalQuotePrototypeScenario(
  value: unknown
): value is ExternalQuotePrototypeScenario {
  return EXTERNAL_QUOTE_SCENARIOS.some(([scenario]) => scenario === value);
}

interface QuoteLine {
  amount: string;
  context: string;
  id: string;
  kind: "labour" | "material";
  meta: string;
  submilestone: string;
  title: string;
}

const BASE_LINES: QuoteLine[] = [
  {
    amount: "8500",
    context:
      "<h3>Site establishment</h3><p>Provide all labour required to establish, maintain, and demobilize the site.</p><ul><li>Install and maintain <strong>temporary fencing</strong> and controlled access.</li><li>Provide the site washroom for the full work period.</li><li>Complete final cleanup and demobilization.</li></ul><p><em>Coordinate access with the homeowner at least 48 hours before arrival.</em></p>",
    id: "labour-mobilization",
    kind: "labour",
    meta: "Aug 24–28 · 2 attachments",
    submilestone: "Site setup & mobilization",
    title: "Mobilization labour",
  },
  {
    amount: "28600",
    context:
      '<h3>Foundation walls</h3><p>Form, reinforce, and place footings and foundation walls in accordance with <strong>Structural Specification S3.2</strong>.</p><ol><li>Confirm layout and bearing elevations before forming.</li><li>Install reinforcing steel and sleeves before the pre-pour review.</li><li>Place, finish, and cure concrete to the specified requirements.</li></ol><p>See <a href="https://example.com/specifications/s3-2" target="_blank" rel="noopener noreferrer">S3.2 foundation specification</a> for the published package reference.</p>',
    id: "labour-foundation",
    kind: "labour",
    meta: "Sep 2–18 · Structural spec S3.2",
    submilestone: "Foundation walls",
    title: "Foundation crew",
  },
  {
    amount: "42750",
    context:
      "<h3>Structural framing</h3><p>Frame the floor assemblies, exterior walls, and roof structure shown on the issued-for-construction drawings.</p><ul><li>Include all required blocking, backing, and temporary bracing.</li><li>Coordinate rough openings with the window and mechanical schedules.</li><li>Protect completed assemblies from weather exposure.</li></ul><blockquote>Do not conceal engineered connections before the framing review is complete.</blockquote>",
    id: "labour-framing",
    kind: "labour",
    meta: "Sep 21–Oct 16 · 4 plan sheets",
    submilestone: "Structural framing",
    title: "Framing labour",
  },
  {
    amount: "6800",
    context:
      "<h3>Trade coordination</h3><p>Coordinate mechanical, electrical, and plumbing openings before close-in.</p><ul><li>Review <strong>coordination note CN-08</strong>.</li><li>Resolve conflicts before cutting or drilling structural members.</li><li>Record approved field changes in the package comments.</li></ul>",
    id: "labour-roughin",
    kind: "labour",
    meta: "Oct 19–23 · Coordination note CN-08",
    submilestone: "Rough-in coordination",
    title: "Trade coordination",
  },
  {
    amount: "14320",
    context:
      "<h3>Ready-mix supply</h3><p>Supply approximately <strong>42 m³ of 32 MPa concrete</strong> for the footings and foundation walls.</p><ul><li>Include pump allowance.</li><li>Include winter additive as a separately identified contingency.</li><li>Sequence deliveries between September 4 and 11.</li></ul>",
    id: "material-concrete",
    kind: "material",
    meta: "42 m³ · Delivery Sep 4–11",
    submilestone: "Footings + foundation walls",
    title: "Ready-mix concrete",
  },
  {
    amount: "19840",
    context:
      "<h3>Framing material package</h3><p>Supply the SPF framing package and engineered floor system described in <strong>takeoff revision 6</strong>.</p><ul><li>Bundle and label material by floor.</li><li>Include hangers, rim board, and specified blocking.</li><li>Protect all engineered components for site storage.</li></ul><p><em>Target delivery: September 18.</em></p>",
    id: "material-lumber",
    kind: "material",
    meta: "1 package · Delivery Sep 18",
    submilestone: "Floor + wall framing",
    title: "Lumber package",
  },
  {
    amount: "11860",
    context:
      "<h3>Engineered wood members</h3><p>Supply seven LVL beams and PSL columns in accordance with <strong>structural addendum A-04</strong>.</p><ul><li>Confirm final dimensions against the issued shop drawings.</li><li>Clearly mark member locations before delivery.</li><li>Include manufacturer handling and storage requirements.</li></ul>",
    id: "material-engineered",
    kind: "material",
    meta: "7 members · Delivery Sep 21",
    submilestone: "Structural framing",
    title: "Engineered wood",
  },
];

interface QuoteModel {
  additionalAmount: string;
  additionalTitle: string;
  comments: string;
  earliestStart: string;
  files: File[];
  lines: QuoteLine[];
  notes: string;
  setAdditionalAmount: (value: string) => void;
  setAdditionalTitle: (value: string) => void;
  setComments: (value: string) => void;
  setEarliestStart: (value: string) => void;
  setFiles: (files: File[]) => void;
  setLineAmount: (id: string, value: string) => void;
  setNotes: (value: string) => void;
  total: number;
}

export function ExternalQuoteResponsePrototype({
  onScenarioChange,
  onVariantChange,
  scenario,
  variant,
}: {
  onScenarioChange: (scenario: ExternalQuotePrototypeScenario) => void;
  onVariantChange: (variant: ExternalQuotePrototypeVariant) => void;
  scenario: ExternalQuotePrototypeScenario;
  variant: ExternalQuotePrototypeVariant;
}) {
  const [lines, setLines] = useState(() =>
    BASE_LINES.map((line) => ({
      ...line,
      amount: scenario === "first-visit" ? "" : line.amount,
    }))
  );
  const [earliestStart, setEarliestStart] = useState(
    scenario === "first-visit" ? "" : "2026-08-24"
  );
  const [notes, setNotes] = useState(
    scenario === "first-visit"
      ? ""
      : "Pricing assumes clear access from Locke Street and one mobilization."
  );
  const [additionalTitle, setAdditionalTitle] = useState("Crane allowance");
  const [additionalAmount, setAdditionalAmount] = useState("2400");
  const [comments, setComments] = useState(
    "<p>Includes supervision, cleanup, and coordination with the site superintendent.</p>"
  );
  const [files, setFiles] = useState<File[]>([]);

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => sum + parseMoney(line.amount), 0) +
      parseMoney(additionalAmount),
    [additionalAmount, lines]
  );
  const model: QuoteModel = {
    additionalAmount,
    additionalTitle,
    comments,
    earliestStart,
    files,
    lines,
    notes,
    setAdditionalAmount,
    setAdditionalTitle,
    setComments,
    setEarliestStart,
    setFiles,
    setLineAmount: (id, value) =>
      setLines((current) =>
        current.map((line) =>
          line.id === id ? { ...line, amount: value } : line
        )
      ),
    setNotes,
    total,
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <PrototypeLabBar
        onScenarioChange={onScenarioChange}
        scenario={scenario}
        variant={variant}
      />
      {scenario === "expired" ||
      scenario === "revoked" ||
      scenario === "loading-error" ? (
        <UnavailableSurface scenario={scenario} />
      ) : scenario === "submitted" ? (
        <SubmittedSurface model={model} />
      ) : (
        <>
          {variant === "scope-passport" ? (
            <ScopePassport model={model} scenario={scenario} />
          ) : null}
          {variant === "scope-folio" ? (
            <ScopeFolio model={model} scenario={scenario} />
          ) : null}
          {variant === "field-ledger" ? (
            <FieldLedger model={model} scenario={scenario} />
          ) : null}
        </>
      )}
      <PrototypeVariantSwitcher
        current={variant}
        onChange={(next) =>
          onVariantChange(next as ExternalQuotePrototypeVariant)
        }
        variants={EXTERNAL_QUOTE_VARIANTS}
      />
    </div>
  );
}

function PrototypeLabBar({
  onScenarioChange,
  scenario,
  variant,
}: {
  onScenarioChange: (scenario: ExternalQuotePrototypeScenario) => void;
  scenario: ExternalQuotePrototypeScenario;
  variant: ExternalQuotePrototypeVariant;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[96rem] items-center gap-3 px-3 sm:px-5">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <HardHat className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">
            Private quote invitation
          </p>
          <p className="truncate text-muted-foreground text-xs">
            Hamilton Infill Build · Package R4
          </p>
        </div>
        <Badge className="hidden sm:inline-flex" variant="outline">
          {EXTERNAL_QUOTE_VARIANTS.find((item) => item.key === variant)?.name}
        </Badge>
        <NativeSelect
          aria-label="Prototype scenario"
          className="w-[9.5rem] sm:w-[13rem]"
          onChange={(event) =>
            onScenarioChange(
              event.target.value as ExternalQuotePrototypeScenario
            )
          }
          value={scenario}
        >
          {EXTERNAL_QUOTE_SCENARIOS.map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </header>
  );
}

function ScenarioNotice({
  scenario,
}: {
  scenario: ExternalQuotePrototypeScenario;
}) {
  if (scenario === "returning-draft") {
    return (
      <Card className="flex-row items-start gap-3 border-info/30 bg-info/5 p-4">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-info-foreground" />
        <div>
          <p className="font-medium text-sm">Draft restored</p>
          <p className="text-muted-foreground text-xs">
            Last saved to DrawFlow yesterday at 4:12 PM · 7 pricing lines
            complete
          </p>
        </div>
      </Card>
    );
  }
  if (scenario === "offline-recovery") {
    return (
      <Card className="flex-row items-start gap-3 border-warning/40 bg-warning/8 p-4">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Saved on this device</p>
          <p className="text-muted-foreground text-xs">
            Offline · 3 changes and 1 file will sync when connection returns.
          </p>
        </div>
        <Button size="sm" variant="outline">
          Retry
        </Button>
      </Card>
    );
  }
  if (scenario === "package-revision") {
    return (
      <Card className="gap-3 border-warning/40 bg-warning/8 p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Package updated to Revision 4</p>
            <p className="text-muted-foreground text-xs">
              Two framing specifications and the delivery window changed. Review
              the affected lines before continuing.
            </p>
          </div>
          <Badge variant="warning">Acknowledgement required</Badge>
        </div>
        <div className="flex flex-wrap gap-2 pl-7">
          <Button size="sm" variant="outline">
            View 3 changes
          </Button>
          <Button size="sm">I am quoting Revision 4</Button>
        </div>
      </Card>
    );
  }
  if (scenario === "validation") {
    return (
      <Card className="flex-row items-start gap-3 border-destructive/30 bg-destructive/5 p-4">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-sm">3 items need attention</p>
          <p className="text-muted-foreground text-xs">
            Earliest start date, engineered wood amount, and required insurance
            file.
          </p>
        </div>
      </Card>
    );
  }
  return null;
}

function ScopePassport({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const [step, setStep] = useState(0);
  const [packageOpen, setPackageOpen] = useState(false);
  const steps = ["Package", "Questions", "Pricing", "Review"];
  return (
    <>
      <main className="mx-auto grid max-w-[92rem] gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
        <aside className="hidden lg:block">
          <Frame className="sticky top-20">
            <FrameHeader>
              <FrameTitle>Quote progress</FrameTitle>
              <FrameDescription>One complete package</FrameDescription>
            </FrameHeader>
            <FramePanel className="grid gap-1 p-2">
              {steps.map((label, index) => (
                <Button
                  className="justify-start"
                  key={label}
                  onClick={() => setStep(index)}
                  variant={index === step ? "secondary" : "ghost"}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-xs",
                      index < step ? "bg-success text-white" : "bg-muted"
                    )}
                  >
                    {index < step ? <Check className="size-3" /> : index + 1}
                  </span>
                  {label}
                </Button>
              ))}
            </FramePanel>
          </Frame>
        </aside>

        <div className="min-w-0 space-y-4">
          <PackageSeal
            model={model}
            onOpenPackage={() => setPackageOpen(true)}
            scenario={scenario}
          />
          <ScenarioNotice scenario={scenario} />
          <div className="flex items-center gap-2 overflow-x-auto lg:hidden">
            {steps.map((label, index) => (
              <Button
                key={label}
                onClick={() => setStep(index)}
                size="sm"
                variant={index === step ? "default" : "outline"}
              >
                {index + 1}. {label}
              </Button>
            ))}
          </div>
          <Frame>
            <FrameHeader className="flex-row items-start justify-between gap-3">
              <div>
                <FrameTitle>{steps[step]}</FrameTitle>
                <FrameDescription>
                  Step {step + 1} of {steps.length}
                </FrameDescription>
              </div>
              <Badge variant="outline">Autosaved</Badge>
            </FrameHeader>
            <FramePanel className="p-4 sm:p-6">
              {step === 0 ? (
                <PackageEssentials onOpenPackage={() => setPackageOpen(true)} />
              ) : null}
              {step === 1 ? (
                <Questions model={model} scenario={scenario} />
              ) : null}
              {step === 2 ? (
                <PricingForm model={model} scenario={scenario} />
              ) : null}
              {step === 3 ? (
                <ReviewQuote model={model} scenario={scenario} />
              ) : null}
            </FramePanel>
            <FrameFooter className="flex items-center justify-between gap-3">
              <Button
                disabled={step === 0}
                onClick={() => setStep(Math.max(0, step - 1))}
                variant="outline"
              >
                <ArrowLeft /> Back
              </Button>
              <div className="text-right lg:hidden">
                <p className="text-muted-foreground text-xs">Quote total</p>
                <p className="font-semibold tabular-nums">
                  {money(model.total)}
                </p>
              </div>
              <Button
                onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              >
                {step === steps.length - 1 ? "Submit quote" : "Continue"}
                <ArrowRight />
              </Button>
            </FrameFooter>
          </Frame>
        </div>

        <aside className="hidden lg:block">
          <QuoteLedger className="sticky top-20" model={model} />
        </aside>
      </main>
      <PackageSheet onOpenChange={setPackageOpen} open={packageOpen} />
    </>
  );
}

function ScopeFolio({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const chapters = [
    "Cover",
    "Permit & site",
    "Timeline",
    "Scope",
    "Specifications",
    "Attachments",
    "Questions",
  ];
  const [chapter, setChapter] = useState("Scope");
  const [quoteBookOpen, setQuoteBookOpen] = useState(false);
  return (
    <>
      <main className="mx-auto max-w-[96rem] px-3 py-4 sm:px-5">
        <FolioMasthead model={model} scenario={scenario} />
        <div className="mt-4">
          <ScenarioNotice scenario={scenario} />
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto xl:hidden">
          {chapters.map((item) => (
            <Button
              key={item}
              onClick={() => setChapter(item)}
              size="sm"
              variant={chapter === item ? "default" : "outline"}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
          <aside className="hidden xl:block">
            <Frame className="sticky top-20">
              <FrameHeader>
                <FrameTitle>Package R4</FrameTitle>
                <FrameDescription>Published Jul 31, 2026</FrameDescription>
              </FrameHeader>
              <FramePanel className="grid gap-1 p-2">
                {chapters.map((item, index) => (
                  <Button
                    className="justify-between"
                    key={item}
                    onClick={() => setChapter(item)}
                    variant={chapter === item ? "secondary" : "ghost"}
                  >
                    <span>{item}</span>
                    {index > 0 && index < 6 ? (
                      <Badge variant={index < 4 ? "success" : "outline"}>
                        {index < 4 ? "Read" : "2"}
                      </Badge>
                    ) : null}
                  </Button>
                ))}
              </FramePanel>
            </Frame>
          </aside>

          <Frame>
            <FrameHeader>
              <FrameTitle>{chapter}</FrameTitle>
              <FrameDescription>
                Immutable package chapter · Pricing remains linked to its
                source.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="p-4 sm:p-6">
              <FolioChapter
                chapter={chapter}
                model={model}
                scenario={scenario}
              />
            </FramePanel>
          </Frame>

          <aside className="hidden xl:block">
            <QuoteBook model={model} />
          </aside>
        </div>
      </main>
      <Button
        className="fixed right-4 bottom-20 z-30 rounded-full shadow-xl xl:hidden"
        onClick={() => setQuoteBookOpen(true)}
        size="lg"
      >
        <ReceiptText /> Quote book · {money(model.total)}
      </Button>
      <Sheet onOpenChange={setQuoteBookOpen} open={quoteBookOpen}>
        <SheetPopup className="sm:max-w-xl" side="right" variant="inset">
          <SheetHeader>
            <SheetTitle>Quote book</SheetTitle>
            <SheetDescription>7 required lines · one response</SheetDescription>
          </SheetHeader>
          <SheetPanel className="grid gap-5">
            <PricingForm model={model} scenario={scenario} />
          </SheetPanel>
          <SheetFooter>
            <Button className="w-full sm:w-auto">
              Review quote · {money(model.total)}
            </Button>
          </SheetFooter>
        </SheetPopup>
      </Sheet>
    </>
  );
}

function FieldLedger({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const anchors = [
    "summary",
    "labour",
    "materials",
    "questions",
    "files",
    "review",
  ];
  return (
    <main className="mx-auto max-w-[88rem] px-3 py-4 sm:px-5 sm:py-6">
      <LedgerHeader model={model} scenario={scenario} />
      <nav
        aria-label="Quote sections"
        className="sticky top-14 z-30 -mx-3 mt-4 flex gap-1 overflow-x-auto border-y bg-background px-3 py-2 sm:-mx-5 sm:px-5"
      >
        {anchors.map((anchor) => (
          <Button
            className="shrink-0"
            key={anchor}
            onClick={() => scrollToLedgerSection(anchor)}
            size="sm"
            variant="ghost"
          >
            {titleCase(anchor)}
            {scenario === "validation" &&
            (anchor === "materials" || anchor === "questions") ? (
              <Badge variant="error">1</Badge>
            ) : null}
          </Button>
        ))}
      </nav>

      <div className="mt-6 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Frame className="min-w-0 rounded-lg p-1">
          <FramePanel className="overflow-hidden rounded-md p-0">
            <InlineScenarioNotice scenario={scenario} />
            <LedgerSection
              description="Exact package and response status"
              id="summary"
              title="Quote summary"
            >
              <LedgerPackageSummary />
            </LedgerSection>
            <LedgerSection
              description="Price each required work line"
              id="labour"
              title="Labour"
            >
              <LedgerPricingRows
                kind="labour"
                model={model}
                scenario={scenario}
              />
            </LedgerSection>
            <LedgerSection
              description="Price each requested material line"
              id="materials"
              title="Materials"
            >
              <LedgerPricingRows
                kind="material"
                model={model}
                scenario={scenario}
              />
            </LedgerSection>
            <LedgerSection
              description="Configured response requirements"
              id="questions"
              title="Questions"
            >
              <LedgerQuestions model={model} scenario={scenario} />
            </LedgerSection>
            <LedgerSection
              description="Additional pricing, comments, and supporting files"
              id="files"
              title="Files & notes"
            >
              <LedgerFilesAndNotes model={model} />
            </LedgerSection>
            <LedgerSection
              description="Confirm the exact response before submission"
              id="review"
              title="Review"
            >
              <LedgerReview model={model} scenario={scenario} />
            </LedgerSection>
          </FramePanel>
        </Frame>

        <LedgerPackageRail model={model} scenario={scenario} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-3 py-2 sm:px-5">
        <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Cloud
              className={cn(
                "hidden size-4 sm:block",
                scenario === "offline-recovery"
                  ? "text-warning"
                  : "text-success"
              )}
            />
            <div>
              <p className="truncate text-muted-foreground text-xs">
                {scenario === "offline-recovery"
                  ? "Saved on device · 3 changes waiting"
                  : "Saved to DrawFlow · 10:42 AM"}
              </p>
              <p className="font-semibold tabular-nums">{money(model.total)}</p>
            </div>
          </div>
          <Button onClick={() => scrollToLedgerSection("review")}>
            Review quote <ArrowRight />
          </Button>
        </div>
      </div>
    </main>
  );
}

function PackageSeal({
  model,
  onOpenPackage,
  scenario,
}: {
  model: QuoteModel;
  onOpenPackage: () => void;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <Frame className="sticky top-16 z-20">
      <FramePanel className="flex items-center gap-3 p-3 sm:p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-sm">
              Hamilton Infill · Package R4
            </p>
            <Badge variant="info">Labour + Materials</Badge>
          </div>
          <p className="mt-1 truncate text-muted-foreground text-xs">
            Due Aug 18, 5:00 PM ·{" "}
            {scenario === "offline-recovery"
              ? "Saved on device"
              : "Saved to DrawFlow"}
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-muted-foreground text-xs">Current total</p>
          <p className="font-semibold tabular-nums">{money(model.total)}</p>
        </div>
        <Button onClick={onOpenPackage} size="sm" variant="outline">
          <BookOpenText />{" "}
          <span className="hidden sm:inline">View package</span>
        </Button>
      </FramePanel>
    </Frame>
  );
}

function FolioMasthead({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Private invitation</Badge>
            <Badge variant="outline">Combined package</Badge>
            <Badge variant="success">Package R4</Badge>
          </div>
          <h1 className="mt-3 font-semibold text-xl">Hamilton Infill Build</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Prepared for Alex Morgan · Northline Framing & Supply
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Fact label="Deadline" value="Aug 18 · 5:00 PM" />
          <Fact label="Quote book" value={money(model.total)} />
          <Fact label="Package" value="7 pricing lines" />
          <Fact
            label="Save state"
            value={scenario === "offline-recovery" ? "On device" : "Synced"}
          />
        </div>
      </FramePanel>
    </Frame>
  );
}

function LedgerHeader({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <header className="grid gap-5 border-b pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>Private quote invitation</span>
          <span aria-hidden="true">/</span>
          <span>Package Revision 4</span>
          <span aria-hidden="true">/</span>
          <span>Labour + Materials</span>
        </div>
        <h1 className="mt-3 text-balance font-semibold text-2xl tracking-[-0.02em]">
          Hamilton Infill Build quote
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground text-sm">
          Prepared for Alex Morgan at Northline Framing & Supply
        </p>
        <p className="mt-1 text-pretty text-sm">
          28 Locke Street South, Hamilton · Due Aug 18 at 5:00 PM
        </p>
      </div>
      <div className="flex items-end justify-between gap-8 border-t pt-4 md:border-t-0 md:pt-0">
        <div>
          <p className="text-muted-foreground text-xs">Current total</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {money(model.total)}
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1 text-xs">
          <Cloud
            className={cn(
              "size-4",
              scenario === "offline-recovery" ? "text-warning" : "text-success"
            )}
          />
          <span>
            {scenario === "offline-recovery"
              ? "Saved on device"
              : "Saved to DrawFlow"}
          </span>
        </div>
      </div>
    </header>
  );
}

function PackageEssentials({
  compact = false,
  onOpenPackage,
}: {
  compact?: boolean;
  onOpenPackage?: () => void;
}) {
  const items = [
    { icon: FileCheck2, label: "Permit", value: "HM-2026-0441 · Issued" },
    { icon: MapPin, label: "Site", value: "28 Locke Street South" },
    { icon: CalendarDays, label: "Work window", value: "Aug 24–Oct 23" },
    { icon: Layers3, label: "Scope", value: "4 labour · 3 materials" },
    {
      icon: Paperclip,
      label: "Package files",
      value: "12 attachments · 6 specs",
    },
    {
      icon: ShieldCheck,
      label: "Immutable proof",
      value: "Package Revision 4",
    },
  ];
  return (
    <div className="space-y-5">
      {compact ? null : (
        <div>
          <Badge variant="success">Exact package</Badge>
          <h2 className="mt-3 font-semibold text-xl">
            Review what you are pricing
          </h2>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            This permit, site, schedule, scope, and response form were frozen
            together. Your quote will reference Package Revision 4.
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(({ icon: Icon, label, value }) => (
          <Card className="flex-row items-center gap-3 p-3" key={label}>
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-muted-foreground text-xs">{value}</p>
            </div>
          </Card>
        ))}
      </div>
      {onOpenPackage ? (
        <Button onClick={onOpenPackage} variant="outline">
          <BookOpenText /> Open full package
        </Button>
      ) : null}
    </div>
  );
}

function Questions({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <div className="grid gap-4">
      <FieldBlock
        description="Required · Date"
        label="Earliest mobilization date"
        required={scenario === "validation" && !model.earliestStart}
      >
        <Input
          aria-invalid={scenario === "validation" && !model.earliestStart}
          nativeInput
          onChange={(event) => model.setEarliestStart(event.target.value)}
          type="date"
          value={model.earliestStart}
        />
      </FieldBlock>
      <FieldBlock
        description="Required · Short answer"
        label="Workmanship warranty"
      >
        <Input defaultValue="2 years from substantial completion" nativeInput />
      </FieldBlock>
      <FieldBlock
        description="Required before submission · File"
        label="Insurance certificate"
      >
        <Card className="flex-row items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4" />
            <div>
              <p className="font-medium text-sm">northline-coi-2026.pdf</p>
              <p className="text-muted-foreground text-xs">
                {scenario === "validation"
                  ? "Needs replacement"
                  : "Durably uploaded · 1.8 MB"}
              </p>
            </div>
          </div>
          <Badge variant={scenario === "validation" ? "error" : "success"}>
            {scenario === "validation" ? "Expired" : "Ready"}
          </Badge>
        </Card>
      </FieldBlock>
      <FieldBlock description="Optional · Long answer" label="Exclusions">
        <Textarea
          onChange={(event) => model.setNotes(event.target.value)}
          value={model.notes}
        />
      </FieldBlock>
    </div>
  );
}

function FieldBlock({
  children,
  description,
  label,
  required = false,
}: {
  children: React.ReactNode;
  description: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-medium text-sm">{label}</p>
        <span
          className={cn(
            "text-xs",
            required ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {description}
        </span>
      </div>
      {children}
    </div>
  );
}

function PricingForm({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <div className="space-y-6">
      <PricingLines kind="labour" model={model} scenario={scenario} />
      <Separator />
      <PricingLines kind="material" model={model} scenario={scenario} />
      <Separator />
      <EscapeHatches model={model} />
    </div>
  );
}

function PricingLines({
  kind,
  model,
  scenario,
}: {
  kind: "labour" | "material";
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const lines = model.lines.filter((line) => line.kind === kind);
  const subtotal = lines.reduce(
    (sum, line) => sum + parseMoney(line.amount),
    0
  );
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <Badge variant={kind === "labour" ? "info" : "warning"}>
            {kind === "labour" ? "Labour" : "Materials"}
          </Badge>
          <h3 className="mt-2 font-semibold">
            {kind === "labour" ? "Work pricing" : "Material pricing"}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Subtotal</p>
          <p className="font-semibold tabular-nums">{money(subtotal)}</p>
        </div>
      </div>
      <div className="grid gap-2">
        {lines.map((line) => {
          const invalid =
            scenario === "validation" && line.id === "material-engineered";
          return (
            <Card
              className={cn("p-3", invalid && "border-destructive/50")}
              key={line.id}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{line.title}</p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {line.submilestone} · {line.meta}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-primary text-xs">
                      View scope and files
                    </summary>
                    <ScopeOfWorkPreview className="mt-2 text-xs" line={line} />
                  </details>
                </div>
                <div>
                  <label
                    className="mb-1 block text-muted-foreground text-xs"
                    htmlFor={line.id}
                  >
                    Amount
                  </label>
                  <Input
                    aria-invalid={invalid}
                    id={line.id}
                    inputMode="decimal"
                    nativeInput
                    onChange={(event) =>
                      model.setLineAmount(line.id, event.target.value)
                    }
                    placeholder="$0.00"
                    value={invalid ? "" : line.amount}
                  />
                  {invalid ? (
                    <p className="mt-1 text-destructive text-xs">
                      Amount required
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function EscapeHatches({ model }: { model: QuoteModel }) {
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Additional line items</p>
            <p className="text-muted-foreground text-xs">
              Add title-and-amount rows without changing requested scope.
            </p>
          </div>
          <Badge variant="outline">Always available</Badge>
        </div>
        <Card className="grid gap-2 p-3 sm:grid-cols-[1fr_9rem_auto]">
          <Input
            aria-label="Additional line item title"
            nativeInput
            onChange={(event) => model.setAdditionalTitle(event.target.value)}
            placeholder="Line-item title"
            value={model.additionalTitle}
          />
          <Input
            aria-label="Additional line item amount"
            inputMode="decimal"
            nativeInput
            onChange={(event) => model.setAdditionalAmount(event.target.value)}
            placeholder="$0.00"
            value={model.additionalAmount}
          />
          <Button
            aria-label="Add another line item"
            size="icon"
            variant="outline"
          >
            <Plus />
          </Button>
        </Card>
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Additional comments</p>
            <p className="text-muted-foreground text-xs">
              Assumptions, exclusions, and anything else we should understand.
            </p>
          </div>
          <Badge variant="outline">Always available</Badge>
        </div>
        <FieldRichTextEditor
          ariaLabel="Additional quote comments"
          editorMinHeightClass="[&_.ProseMirror]:min-h-28"
          onChange={model.setComments}
          placeholder="Add comments…"
          value={model.comments}
        />
      </section>
      <section>
        <div className="mb-2">
          <p className="font-medium text-sm">Response attachments</p>
          <p className="text-muted-foreground text-xs">
            Supporting files remain private to this response.
          </p>
        </div>
        <FileUploader
          files={model.files}
          onFilesChange={model.setFiles}
          showUploadButton={false}
          title="Attach supporting files"
        />
      </section>
    </div>
  );
}

function ReviewQuote({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const labour = model.lines
    .filter((line) => line.kind === "labour")
    .reduce((sum, line) => sum + parseMoney(line.amount), 0);
  const materials = model.lines
    .filter((line) => line.kind === "material")
    .reduce((sum, line) => sum + parseMoney(line.amount), 0);
  return (
    <div className="space-y-5">
      <div>
        <Badge variant={scenario === "validation" ? "error" : "success"}>
          {scenario === "validation" ? "3 blockers" : "Ready to submit"}
        </Badge>
        <h2 className="mt-3 font-semibold text-xl">Review your quote</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Submission creates an immutable response for Package Revision 4.
        </p>
      </div>
      <Frame>
        <FramePanel className="grid gap-3 p-4 sm:grid-cols-2">
          <Fact label="Labour" value={money(labour)} />
          <Fact label="Materials" value={money(materials)} />
          <Fact
            label="Additional items"
            value={money(parseMoney(model.additionalAmount))}
          />
          <Fact label="Canonical total" value={money(model.total)} />
        </FramePanel>
      </Frame>
      {scenario === "validation" ? (
        <Card className="gap-2 border-destructive/30 bg-destructive/5 p-4">
          <p className="font-medium text-sm">Resolve before submission</p>
          <a className="text-destructive text-sm underline" href="#questions">
            Add earliest start date
          </a>
          <a className="text-destructive text-sm underline" href="#materials">
            Price engineered wood
          </a>
          <a className="text-destructive text-sm underline" href="#questions">
            Replace expired insurance file
          </a>
        </Card>
      ) : null}
      <Card className="flex-row items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-5 text-success" />
        <div>
          <p className="font-medium text-sm">One package, one response</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Your Labour and Materials pricing will submit together. DrawFlow
            recomputes the total on the server.
          </p>
        </div>
      </Card>
      <Button className="w-full" disabled={scenario === "validation"} size="lg">
        <PackageCheck /> Submit quote for Package R4
      </Button>
    </div>
  );
}

function QuoteLedger({
  className,
  model,
}: {
  className?: string;
  model: QuoteModel;
}) {
  const completed = model.lines.filter(
    (line) => parseMoney(line.amount) > 0
  ).length;
  return (
    <Frame className={className}>
      <FrameHeader>
        <FrameTitle>Live quote ledger</FrameTitle>
        <FrameDescription>{completed} of 7 pricing lines</FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-3 p-4">
        <Fact
          label="Labour"
          value={money(
            model.lines
              .filter((line) => line.kind === "labour")
              .reduce((sum, line) => sum + parseMoney(line.amount), 0)
          )}
        />
        <Fact
          label="Materials"
          value={money(
            model.lines
              .filter((line) => line.kind === "material")
              .reduce((sum, line) => sum + parseMoney(line.amount), 0)
          )}
        />
        <Fact
          label="Additional"
          value={money(parseMoney(model.additionalAmount))}
        />
        <Separator />
        <Fact label="Quote total" value={money(model.total)} />
        <div className="flex items-center gap-2 rounded-lg bg-success/8 p-2 text-success-foreground text-xs">
          <Save className="size-3.5" /> Saved to DrawFlow
        </div>
      </FramePanel>
    </Frame>
  );
}

function QuoteBook({ model }: { model: QuoteModel }) {
  return (
    <Frame className="sticky top-20">
      <FrameHeader>
        <FrameTitle>Quote book</FrameTitle>
        <FrameDescription>
          Pricing synchronized to package context
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="success">7 of 7 priced</Badge>
          <span className="font-semibold tabular-nums">
            {money(model.total)}
          </span>
        </div>
        <Card className="gap-2 p-3">
          <p className="font-medium text-sm">Selected scope</p>
          <p className="text-muted-foreground text-xs">
            Structural framing · Sep 21–Oct 16
          </p>
          <p className="text-sm">
            Frame floors, walls, roof, blocking and engineered members.
          </p>
          <Input
            aria-label="Selected scope amount"
            defaultValue="42,750"
            nativeInput
          />
        </Card>
        <Button className="w-full" variant="outline">
          Open full quote book
        </Button>
        <Button className="w-full">Review quote</Button>
      </FramePanel>
    </Frame>
  );
}

function FolioChapter({
  chapter,
  model,
  scenario,
}: {
  chapter: string;
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  if (chapter === "Cover") {
    return <PackageEssentials />;
  }
  if (chapter === "Permit & site") {
    return (
      <div className="space-y-4">
        <div>
          <Badge variant="success">Permit issued</Badge>
          <h2 className="mt-3 font-semibold text-xl">Permit HM-2026-0441</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Two-storey detached dwelling with secondary suite · Issued Jul 14,
            2026.
          </p>
        </div>
        <InteractiveSiteMap
          address="28 Locke Street South, Hamilton, ON"
          latitude={43.2524}
          longitude={-79.8876}
        />
      </div>
    );
  }
  if (chapter === "Timeline") {
    return <TimelineChapter />;
  }
  if (chapter === "Specifications") {
    return <SpecificationChapter />;
  }
  if (chapter === "Attachments") {
    return <AttachmentChapter />;
  }
  if (chapter === "Questions") {
    return <Questions model={model} scenario={scenario} />;
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl">
          Milestone 2 · Foundation and framing
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Every pricing annotation stays attached to its inherited planning
          context.
        </p>
      </div>
      {model.lines.map((line) => (
        <Card className="p-4" key={line.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge variant={line.kind === "labour" ? "info" : "warning"}>
                {line.kind}
              </Badge>
              <h3 className="mt-2 font-medium">{line.title}</h3>
              <p className="mt-1 text-muted-foreground text-xs">
                {line.submilestone} · {line.meta}
              </p>
              <ScopeOfWorkPreview className="mt-3" line={line} />
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">2 specifications</Badge>
                <Badge variant="outline">1 attachment</Badge>
              </div>
            </div>
            <div className="w-32 shrink-0">
              <label
                className="mb-1 block text-muted-foreground text-xs"
                htmlFor={`folio-${line.id}`}
              >
                Price this item
              </label>
              <Input
                id={`folio-${line.id}`}
                inputMode="decimal"
                nativeInput
                onChange={(event) =>
                  model.setLineAmount(line.id, event.target.value)
                }
                value={line.amount}
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TimelineChapter() {
  const events = [
    ["Aug 18", "Quote deadline", "Responses close at 5:00 PM"],
    ["Aug 24", "Site mobilization", "Site setup and access handoff"],
    ["Sep 2", "Foundation start", "Footings and foundation walls"],
    ["Sep 21", "Framing start", "Floor, wall and roof framing"],
    ["Oct 23", "Package completion", "Rough-in coordination complete"],
  ];
  return (
    <div className="space-y-3">
      {events.map(([date, title, detail], index) => (
        <div className="grid grid-cols-[5rem_1.25rem_1fr] gap-3" key={title}>
          <p className="pt-0.5 font-medium text-sm">{date}</p>
          <div className="flex flex-col items-center">
            <span className="mt-1 size-2.5 rounded-full bg-primary" />
            {index < events.length - 1 ? (
              <span className="h-full w-px bg-border" />
            ) : null}
          </div>
          <div className="pb-5">
            <p className="font-medium text-sm">{title}</p>
            <p className="text-muted-foreground text-xs">{detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SpecificationChapter() {
  return (
    <div className="grid gap-3">
      {[
        ["S3.2", "Foundation reinforcement", "12 pages · Structural"],
        ["A-04", "Engineered beam addendum", "4 pages · Structural"],
        ["CN-08", "Rough-in coordination", "2 pages · Coordination"],
      ].map(([code, title, meta]) => (
        <Card className="flex-row items-center gap-3 p-4" key={code}>
          <div className="grid size-10 place-items-center rounded-lg bg-muted font-semibold text-xs">
            {code}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{title}</p>
            <p className="text-muted-foreground text-xs">{meta}</p>
          </div>
          <Button size="sm" variant="outline">
            Preview
          </Button>
        </Card>
      ))}
    </div>
  );
}

function AttachmentChapter() {
  return (
    <div className="grid gap-3">
      {[
        ["Issued permit.pdf", "Permit · 6.4 MB"],
        ["Structural package R6.pdf", "Plans · 18.2 MB"],
        ["Framing takeoff.xlsx", "Takeoff · 840 KB"],
      ].map(([name, meta]) => (
        <Card className="flex-row items-center gap-3 p-4" key={name}>
          <FileText className="size-5" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{name}</p>
            <p className="text-muted-foreground text-xs">{meta}</p>
          </div>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </Card>
      ))}
    </div>
  );
}

function LedgerSection({
  children,
  description,
  id,
  title,
}: {
  children: React.ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section
      className="scroll-mt-32 border-muted border-b-4 last:border-b-0"
      id={id}
    >
      <header className="border-border border-y bg-muted/35 px-4 py-5 sm:px-6 md:grid md:grid-cols-[11rem_1fr] md:items-end md:gap-5">
        <h2 className="font-semibold text-xl tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 max-w-[65ch] font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] md:mt-0 md:pb-0.5">
          {description}
        </p>
      </header>
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function InlineScenarioNotice({
  scenario,
}: {
  scenario: ExternalQuotePrototypeScenario;
}) {
  if (scenario === "first-visit") {
    return null;
  }

  const content =
    scenario === "offline-recovery"
      ? {
          detail: "3 changes and 1 file will sync when connection returns.",
          icon: CloudOff,
          title: "Saved on this device",
          tone: "warning",
        }
      : scenario === "package-revision"
        ? {
            detail:
              "Two framing specifications and the delivery window changed.",
            icon: TriangleAlert,
            title: "Package Revision 4 needs acknowledgement",
            tone: "warning",
          }
        : scenario === "validation"
          ? {
              detail:
                "Earliest start, engineered wood, and insurance need attention.",
              icon: CircleAlert,
              title: "3 submission blockers",
              tone: "error",
            }
          : {
              detail:
                "Last synced yesterday at 4:12 PM · 7 pricing lines complete.",
              icon: RefreshCw,
              title: "Draft restored",
              tone: "info",
            };
  const Icon = content.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b px-4 py-3 text-sm sm:px-6",
        content.tone === "warning" && "bg-warning/8",
        content.tone === "error" && "bg-destructive/5",
        content.tone === "info" && "bg-info/5"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          content.tone === "warning" && "text-warning",
          content.tone === "error" && "text-destructive",
          content.tone === "info" && "text-info-foreground"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{content.title}</p>
        <p className="mt-0.5 text-muted-foreground text-xs">{content.detail}</p>
      </div>
      {scenario === "package-revision" ? (
        <Button size="sm" variant="outline">
          Review changes
        </Button>
      ) : null}
    </div>
  );
}

function LedgerPackageSummary() {
  const facts = [
    ["Permit", "HM-2026-0441 · Issued"],
    ["Work window", "Aug 24–Oct 23"],
    ["Pricing scope", "4 labour · 3 materials"],
    ["Package files", "6 specs · 12 attachments"],
  ];

  return (
    <div>
      <dl className="grid border-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
        {facts.map(([label, value]) => (
          <div className="py-3 sm:px-4 sm:first:pl-0" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-medium text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="group border-b">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium text-sm">
          Permit, map, timeline, specifications, and attachments
          <ChevronRight className="size-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <div className="grid gap-5 pb-6 lg:grid-cols-2">
          <InteractiveSiteMap
            address="28 Locke Street South, Hamilton, ON"
            latitude={43.2524}
            longitude={-79.8876}
          />
          <div className="space-y-4">
            <PackageFacts />
            <div className="border-t pt-4">
              <p className="font-medium text-sm">Relevant dates</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Mobilization Aug 24 · Foundation Sep 2 · Framing Sep 21
              </p>
            </div>
            <div className="border-t pt-4">
              <p className="font-medium text-sm">Latest package change</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Structural addendum A-04 and delivery window updated in Revision
                4.
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function LedgerPricingRows({
  kind,
  model,
  scenario,
}: {
  kind: "labour" | "material";
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const lines = model.lines.filter((line) => line.kind === kind);
  const subtotal = lines.reduce(
    (sum, line) => sum + parseMoney(line.amount),
    0
  );

  return (
    <div className="border-y">
      <div className="hidden grid-cols-[minmax(0,1fr)_11rem_9rem] gap-4 border-b bg-muted/36 px-3 py-2 text-muted-foreground text-xs sm:grid">
        <span>Required line</span>
        <span>Related scope</span>
        <span className="text-right">Amount</span>
      </div>
      {lines.map((line, lineIndex) => {
        const invalid =
          scenario === "validation" && line.id === "material-engineered";
        return (
          <div
            className="grid gap-4 border-border border-b-2 px-0 py-0 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_11rem_9rem] sm:gap-4 sm:px-3 sm:py-4"
            key={line.id}
          >
            <div className="min-w-0">
              <div className="-mx-0 flex min-h-12 items-center gap-3 border-border border-b bg-muted/30 px-3 py-2.5 sm:min-h-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
                <span className="font-semibold text-primary text-xs tabular-nums">
                  {String(lineIndex + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold text-[0.95rem] leading-tight">
                  {line.title}
                </span>
                <span className="border-border border-l pl-3 text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em]">
                  {line.id.split("-").at(-1)?.toUpperCase()}
                </span>
              </div>
              <details className="group px-3 py-2 sm:px-0 sm:py-0">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-muted-foreground text-xs hover:text-foreground">
                  <span>View scope, specifications, and files</span>
                  <ChevronRight className="size-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
                </summary>
                <div className="mt-1 border-primary/50 border-l-2 pl-3">
                  <ScopeOfWorkPreview
                    className="max-w-[65ch] py-2 text-xs"
                    line={line}
                  />
                </div>
              </details>
            </div>
            <div className="px-3 text-xs sm:px-0 sm:pt-0.5">
              <p className="mb-1 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em] sm:sr-only">
                Assigned scope
              </p>
              <p className="font-medium">{line.submilestone}</p>
              <p className="mt-1 text-muted-foreground">{line.meta}</p>
            </div>
            <div className="px-3 pb-4 sm:px-0 sm:pb-0">
              <label
                className="mb-1.5 block font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em] sm:sr-only"
                htmlFor={`ledger-${line.id}`}
              >
                Quoted amount
                <span className="sr-only"> for {line.title}</span>
              </label>
              <Input
                aria-invalid={invalid}
                className="tabular-nums sm:text-right"
                id={`ledger-${line.id}`}
                inputMode="decimal"
                nativeInput
                onChange={(event) =>
                  model.setLineAmount(line.id, event.target.value)
                }
                placeholder="$0.00"
                value={invalid ? "" : line.amount}
              />
              {invalid ? (
                <p className="mt-1 text-destructive text-xs">Required</p>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-3 text-sm">
        <span className="text-muted-foreground">
          {kind === "labour" ? "Labour subtotal" : "Materials subtotal"}
        </span>
        <span className="font-semibold tabular-nums">{money(subtotal)}</span>
      </div>
    </div>
  );
}

function LedgerQuestions({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const startInvalid = scenario === "validation" && !model.earliestStart;
  return (
    <div className="border-y">
      <div className="grid gap-3 border-b py-4 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div>
          <label className="font-medium text-sm" htmlFor="ledger-start-date">
            Earliest mobilization
          </label>
          <p className="mt-1 text-muted-foreground text-xs">Required · Date</p>
        </div>
        <Input
          aria-invalid={startInvalid}
          id="ledger-start-date"
          nativeInput
          onChange={(event) => model.setEarliestStart(event.target.value)}
          type="date"
          value={model.earliestStart}
        />
      </div>
      <div className="grid gap-3 border-b py-4 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div>
          <label className="font-medium text-sm" htmlFor="ledger-warranty">
            Workmanship warranty
          </label>
          <p className="mt-1 text-muted-foreground text-xs">
            Required · Short answer
          </p>
        </div>
        <Input
          defaultValue="2 years from substantial completion"
          id="ledger-warranty"
          nativeInput
        />
      </div>
      <div className="grid gap-3 border-b py-4 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div>
          <p className="font-medium text-sm">Insurance certificate</p>
          <p className="mt-1 text-muted-foreground text-xs">Required · File</p>
        </div>
        <div className="flex items-center gap-3">
          <FileText className="size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">northline-coi-2026.pdf</p>
            <p className="text-muted-foreground text-xs">
              {scenario === "validation"
                ? "Expired · replacement required"
                : "Durably uploaded · 1.8 MB"}
            </p>
          </div>
          <Badge variant={scenario === "validation" ? "error" : "success"}>
            {scenario === "validation" ? "Replace" : "Ready"}
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 py-4 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div>
          <label className="font-medium text-sm" htmlFor="ledger-exclusions">
            Exclusions
          </label>
          <p className="mt-1 text-muted-foreground text-xs">Optional</p>
        </div>
        <Textarea
          id="ledger-exclusions"
          onChange={(event) => model.setNotes(event.target.value)}
          value={model.notes}
        />
      </div>
    </div>
  );
}

function LedgerFilesAndNotes({ model }: { model: QuoteModel }) {
  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Additional line items</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Recipient-added pricing does not change the requested package.
            </p>
          </div>
          <Button size="sm" variant="ghost">
            <Plus /> Add row
          </Button>
        </div>
        <div className="mt-3 grid gap-2 border-y py-3 sm:grid-cols-[1fr_10rem]">
          <Input
            aria-label="Additional line item title"
            nativeInput
            onChange={(event) => model.setAdditionalTitle(event.target.value)}
            placeholder="Line-item title"
            value={model.additionalTitle}
          />
          <Input
            aria-label="Additional line item amount"
            className="tabular-nums sm:text-right"
            inputMode="decimal"
            nativeInput
            onChange={(event) => model.setAdditionalAmount(event.target.value)}
            placeholder="$0.00"
            value={model.additionalAmount}
          />
        </div>
      </div>

      <div>
        <div className="mb-3">
          <p className="font-medium text-sm">Additional comments</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Assumptions, exclusions, and anything else the sender should
            understand.
          </p>
        </div>
        <FieldRichTextEditor
          ariaLabel="Additional quote comments"
          editorMinHeightClass="[&_.ProseMirror]:min-h-28"
          onChange={model.setComments}
          placeholder="Add comments…"
          value={model.comments}
        />
      </div>

      <div>
        <div className="mb-3">
          <p className="font-medium text-sm">Response attachments</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Supporting files remain private to this response.
          </p>
        </div>
        <FileUploader
          files={model.files}
          onFilesChange={model.setFiles}
          showUploadButton={false}
          title="Attach supporting files"
        />
      </div>
    </div>
  );
}

function LedgerReview({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  const labour = model.lines
    .filter((line) => line.kind === "labour")
    .reduce((sum, line) => sum + parseMoney(line.amount), 0);
  const materials = model.lines
    .filter((line) => line.kind === "material")
    .reduce((sum, line) => sum + parseMoney(line.amount), 0);

  return (
    <div>
      <dl className="border-y">
        {[
          ["Labour", money(labour)],
          ["Materials", money(materials)],
          ["Additional items", money(parseMoney(model.additionalAmount))],
        ].map(([label, value]) => (
          <div
            className="flex items-center justify-between border-b py-3 text-sm last:border-b-0"
            key={label}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex items-end justify-between border-t py-4">
          <dt>
            <p className="font-medium">Canonical quote total</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Server-recomputed on submission
            </p>
          </dt>
          <dd className="font-semibold text-xl tabular-nums">
            {money(model.total)}
          </dd>
        </div>
      </dl>

      {scenario === "validation" ? (
        <div className="mt-5 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium">Resolve 3 blockers before submission</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Earliest start date, engineered wood amount, and insurance
            certificate.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <p className="font-medium">Ready to submit</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Labour and Materials submit together against Package Revision 4.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button disabled={scenario === "validation"} size="lg">
          <PackageCheck /> Submit quote for Package R4
        </Button>
      </div>
    </div>
  );
}

function LedgerPackageRail({
  model,
  scenario,
}: {
  model: QuoteModel;
  scenario: ExternalQuotePrototypeScenario;
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-32 divide-y border-y">
        <section className="py-4">
          <p className="font-semibold text-sm">Package reference</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Package R4 · Published Jul 31, 2026
          </p>
        </section>
        <section className="py-4">
          <p className="font-medium text-sm">28 Locke Street South</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Hamilton, Ontario · Permit HM-2026-0441
          </p>
          <Button className="mt-3" size="sm" variant="outline">
            <MapPin /> Open map
          </Button>
        </section>
        <section className="py-4">
          <p className="text-muted-foreground text-xs">Current focus</p>
          <p className="mt-1 font-medium text-sm">Structural framing</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Sep 21–Oct 16 · 4 plan sheets
          </p>
          <p className="mt-3 text-sm">
            LVL beams, PSL columns, wall framing, and coordination openings.
          </p>
        </section>
        <section className="py-4">
          <p className="font-medium text-sm">Package files</p>
          <ul className="mt-3 space-y-2 text-xs">
            <li className="flex items-center justify-between gap-2">
              <span>Structural package R6</span>
              <span className="text-muted-foreground">18.2 MB</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Framing takeoff</span>
              <span className="text-muted-foreground">840 KB</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Engineered addendum A-04</span>
              <span className="text-muted-foreground">4.1 MB</span>
            </li>
          </ul>
        </section>
        <section className="py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Quote total</span>
            <span className="font-semibold tabular-nums">
              {money(model.total)}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            {scenario === "offline-recovery"
              ? "3 changes waiting on this device"
              : "All changes saved to DrawFlow"}
          </p>
        </section>
      </div>
    </aside>
  );
}

function PackageSheet({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup className="sm:max-w-2xl" side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>Package Revision 4</SheetTitle>
          <SheetDescription>
            Exact recipient-visible permit, site, schedule, scope,
            specifications, and files.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="grid gap-6">
          <InteractiveSiteMap
            address="28 Locke Street South, Hamilton, ON"
            latitude={43.2524}
            longitude={-79.8876}
          />
          <PackageFacts />
          <TimelineChapter />
          <SpecificationChapter />
          <AttachmentChapter />
        </SheetPanel>
        <SheetFooter>
          <Button
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Done reviewing package
          </Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function PackageFacts() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Fact label="Permit" value="HM-2026-0441" />
      <Fact label="Package" value="Revision 4" />
      <Fact label="Scope" value="4 labour · 3 materials" />
      <Fact label="Deadline" value="Aug 18 · 5:00 PM" />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function SubmittedSurface({ model }: { model: QuoteModel }) {
  return (
    <main className="mx-auto max-w-2xl px-3 py-12 sm:px-5">
      <Frame>
        <FramePanel className="p-6 text-center sm:p-10">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success-foreground">
            <CheckCircle2 className="size-7" />
          </div>
          <Badge className="mt-5" variant="success">
            Submission confirmed
          </Badge>
          <h1 className="mt-3 font-semibold text-2xl">
            Your quote was received
          </h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
            Northline Build Co. received Submission Revision 2 for Package
            Revision 4.
          </p>
          <Frame className="mt-6 text-left">
            <FramePanel className="grid gap-4 p-4 sm:grid-cols-2">
              <Fact label="Submitted total" value={money(model.total)} />
              <Fact label="Server receipt" value="Jul 31, 2026 · 10:48 AM" />
              <Fact label="Submission" value="QR-HAM-0042 · Revision 2" />
              <Fact label="Recipient" value="Alex Morgan" />
            </FramePanel>
          </Frame>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline">Download receipt</Button>
            <Button>Revise quote</Button>
          </div>
        </FramePanel>
      </Frame>
      <Card className="mt-4 gap-3 p-4">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-medium text-sm">Want easier access next time?</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Optionally claim your contractor profile with WorkOS. Your
              submitted quote is already complete and does not depend on an
              account.
            </p>
          </div>
        </div>
        <Button className="self-start" size="sm" variant="outline">
          Create optional account
        </Button>
      </Card>
    </main>
  );
}

function UnavailableSurface({
  scenario,
}: {
  scenario: "expired" | "revoked" | "loading-error";
}) {
  const expired = scenario === "expired";
  const loading = scenario === "loading-error";
  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-xl place-items-center px-3 py-12 sm:px-5">
      <Frame className="w-full">
        <FramePanel className="p-6 text-center sm:p-10">
          <div
            className={cn(
              "mx-auto grid size-14 place-items-center rounded-full",
              loading
                ? "bg-warning/10 text-warning"
                : "bg-muted text-muted-foreground"
            )}
          >
            {loading ? (
              <CloudOff className="size-7" />
            ) : expired ? (
              <CalendarDays className="size-7" />
            ) : (
              <XCircle className="size-7" />
            )}
          </div>
          <Badge className="mt-5" variant={loading ? "warning" : "outline"}>
            {loading
              ? "Connection problem"
              : expired
                ? "Link expired"
                : "Invitation unavailable"}
          </Badge>
          <h1 className="mt-3 font-semibold text-2xl">
            {loading
              ? "We could not load this invitation"
              : expired
                ? "This access window has ended"
                : "This invitation is unavailable"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {loading
              ? "No project content was loaded. Check your connection and try again."
              : expired
                ? "This private link expired after the response deadline. Northline Build Co. can approve fresh access without changing the quote history."
                : "Use the most recent link supplied by the sender or contact Northline Build Co. No project details are available from this link."}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline">Contact Northline Build Co.</Button>
            {loading ? (
              <Button>
                <RefreshCw /> Try again
              </Button>
            ) : expired ? (
              <Button>Request fresh access</Button>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ScopeOfWorkPreview({
  className,
  line,
}: {
  className?: string;
  line: QuoteLine;
}) {
  return (
    <FieldRichTextPreview
      ariaLabel={`Scope of work for ${line.title}`}
      className={cn(
        "rounded-none border-0 bg-transparent text-foreground",
        "[&_.ProseMirror]:space-y-2 [&_.ProseMirror]:p-0",
        "[&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-sm",
        "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-2",
        "[&_.ProseMirror_blockquote]:text-muted-foreground",
        className
      )}
      imageMaxHeightClass="[&_.ProseMirror_img]:max-h-64"
      value={line.context}
    />
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function titleCase(value: string) {
  return value.replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function scrollToLedgerSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  window.history.replaceState(null, "", `#${id}`);
}

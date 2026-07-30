"use client";

// THROWAWAY PROTOTYPE — three Quote Round Composer directions, switchable with
// ?variant=quote-scope-lock|quote-packet-studio|quote-control-ledger on the
// existing Builder Build route. All state is local and every send is simulated.

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  GripVertical,
  HardHat,
  Layers3,
  LockKeyhole,
  type LucideIcon,
  Mail,
  MapPin,
  Monitor,
  PackageCheck,
  PanelRight,
  Plus,
  ReceiptText,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";

import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardFooter,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import type { ProductionBuildDetail } from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import {
  QuoteTemplateConfigurationPrototype,
  type QuoteTemplatePrototypeVariant,
} from "#/features/quote-solicitation/QuoteTemplateConfiguration.prototype.tsx";
import { cn } from "#/lib/utils.ts";

export type QuoteComposerPrototypeVariant =
  | "quote-scope-lock"
  | "quote-packet-studio"
  | "quote-control-ledger"
  | QuoteTemplatePrototypeVariant;

const QUOTE_COMPOSER_VARIANTS: {
  label: string;
  value: QuoteComposerPrototypeVariant;
}[] = [
  { label: "Scope Lock", value: "quote-scope-lock" },
  { label: "Packet Studio", value: "quote-packet-studio" },
  { label: "Procurement Control Ledger", value: "quote-control-ledger" },
];

const QUOTE_TEMPLATE_VARIANTS: {
  label: string;
  value: QuoteComposerPrototypeVariant;
}[] = [
  { label: "Guided Template Recipe", value: "quote-template-guided" },
  { label: "Template Registry", value: "quote-template-registry" },
  { label: "Response Contract Canvas", value: "quote-template-canvas" },
];

function isQuoteTemplatePrototypeVariant(
  value: QuoteComposerPrototypeVariant
): value is QuoteTemplatePrototypeVariant {
  return value.startsWith("quote-template-");
}

export function isQuoteComposerPrototypeVariant(
  value: unknown
): value is QuoteComposerPrototypeVariant {
  return [...QUOTE_COMPOSER_VARIANTS, ...QUOTE_TEMPLATE_VARIANTS].some(
    (variant) => variant.value === value
  );
}

type QuoteKind = "labour" | "material";
interface ScopeItem {
  id: string;
  meta: string;
  milestone: string;
  relatedSubmilestones?: string[];
  title: string;
  warning?: string;
}

interface QuoteMaterialLine {
  id: string;
  quantity: string;
  submilestoneIds: string[];
  title: string;
  unit: string;
}

interface Recipient {
  email: string;
  id: string;
  name: string;
  state: "existing" | "new";
  warning?: string;
}

const INITIAL_RECIPIENTS: Recipient[] = [
  {
    email: "estimating@ironwoodframing.ca",
    id: "ironwood",
    name: "Ironwood Framing",
    state: "existing",
  },
  {
    email: "quotes@northstarbuilds.ca",
    id: "northstar",
    name: "Northstar Builds",
    state: "existing",
    warning: "Trade coverage is unconfirmed for roof trusses",
  },
  {
    email: "mike@harbourcarpentry.ca",
    id: "harbour",
    name: "mike@harbourcarpentry.ca",
    state: "new",
  },
];

const CUSTOM_FIELDS = [
  {
    id: "availability",
    label: "Earliest mobilization date",
    meta: "Date · Required",
  },
  {
    id: "warranty",
    label: "Workmanship warranty",
    meta: "Short text · Required",
  },
  {
    id: "insurance",
    label: "Insurance certificate",
    meta: "File upload · Required",
  },
  {
    id: "exclusions",
    label: "Exclusions",
    meta: "Rich text · Optional",
  },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function buildScopeItems(
  detail: ProductionBuildDetail,
  kind: QuoteKind
): ScopeItem[] {
  if (kind === "material") {
    const materials = detail.costItems ?? [];
    return materials.map((item, index) => ({
      id: item.itemKey ?? String(item._id),
      meta: `${item.quantity ?? 1} package · ${formatCurrency(item.totalCents ?? item.costCents ?? 0)} · Delivery window required`,
      milestone: item.milestoneKey ?? `Material group ${index + 1}`,
      title: item.title,
      ...(index === 1
        ? { warning: "Confirm unit and requested delivery window" }
        : {}),
    }));
  }

  return detail.submilestones.slice(3, 11).map((item, index) => ({
    id: item.key,
    meta:
      index < 3
        ? "May 12–May 29 · Carpentry"
        : index < 6
          ? "Jun 02–Jun 18 · Mechanical"
          : "Jun 23–Jul 08 · Envelope",
    milestone:
      detail.milestones.find((milestone) => milestone.key === item.milestoneKey)
        ?.name ?? item.milestoneKey,
    title: item.name,
    ...(index === 2
      ? { warning: "Schedule is non-contiguous with the current bundle" }
      : {}),
  }));
}

function buildCustomMaterialScopeItems(
  detail: ProductionBuildDetail,
  materials: QuoteMaterialLine[]
): ScopeItem[] {
  return materials.map((material) => {
    const relatedSubmilestones = material.submilestoneIds.map(
      (submilestoneId) =>
        detail.submilestones.find((item) => item.key === submilestoneId)
          ?.name ?? submilestoneId
    );

    return {
      id: material.id,
      meta: `${material.quantity} ${material.unit} · ${relatedSubmilestones.length} sub-milestone${relatedSubmilestones.length === 1 ? "" : "s"}`,
      milestone: "Added for this Quote Round",
      relatedSubmilestones,
      title: material.title,
    };
  });
}

export function QuoteRoundComposerPrototype({
  detail,
  onExit,
  onVariantChange,
  variant,
}: {
  detail: ProductionBuildDetail;
  onExit: () => void;
  onVariantChange: (variant: QuoteComposerPrototypeVariant) => void;
  variant: QuoteComposerPrototypeVariant;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {variant === "quote-scope-lock" ? (
        <ScopeLockVariant
          detail={detail}
          key={variant}
          onConfigureTemplates={() => onVariantChange("quote-template-guided")}
          onExit={onExit}
        />
      ) : null}
      {variant === "quote-packet-studio" ? (
        <PacketStudioVariant detail={detail} key={variant} onExit={onExit} />
      ) : null}
      {variant === "quote-control-ledger" ? (
        <ControlLedgerVariant detail={detail} key={variant} onExit={onExit} />
      ) : null}
      {isQuoteTemplatePrototypeVariant(variant) ? (
        <QuoteTemplateConfigurationPrototype
          detail={detail}
          key={variant}
          onBackToComposer={() => onVariantChange("quote-scope-lock")}
          variant={variant}
        />
      ) : null}
      <PrototypeSwitcher
        current={variant}
        onChange={onVariantChange}
        onExit={onExit}
        variants={
          isQuoteTemplatePrototypeVariant(variant)
            ? QUOTE_TEMPLATE_VARIANTS
            : QUOTE_COMPOSER_VARIANTS
        }
      />
    </div>
  );
}

function ComposerHeader({
  detail,
  kind,
  onExit,
  title,
}: {
  detail: ProductionBuildDetail;
  kind: QuoteKind | "mixed";
  onExit: () => void;
  title: string;
}) {
  const kindLabel =
    kind === "mixed"
      ? "Labour + Materials"
      : kind === "labour"
        ? "Labour"
        : "Materials";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/96 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <Button
          aria-label="Return to build"
          onClick={onExit}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-sm">{title}</p>
            <Badge
              variant={
                kind === "mixed"
                  ? "secondary"
                  : kind === "labour"
                    ? "info"
                    : "warning"
              }
            >
              {kindLabel}
            </Badge>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {detail.build.buildName} · Active Build · Roadmap baseline v14
          </p>
        </div>
        <Badge className="hidden sm:inline-flex" variant="outline">
          <LockKeyhole />
          Local prototype
        </Badge>
        <Button
          className="hidden sm:inline-flex"
          onClick={onExit}
          variant="outline"
        >
          Exit
        </Button>
      </div>
    </header>
  );
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: QuoteKind;
  onChange: (value: QuoteKind) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {(["labour", "material"] as const).map((value) => (
        <Button
          className="w-full"
          key={value}
          onClick={() => onChange(value)}
          variant={kind === value ? "default" : "ghost"}
        >
          {value === "labour" ? <HardHat /> : <PackageCheck />}
          {value === "labour" ? "Labour" : "Materials"}
        </Button>
      ))}
    </div>
  );
}

function CombinedPackageTape({
  labourCount,
  materialCount,
  recipients,
}: {
  labourCount: number;
  materialCount: number;
  recipients: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y bg-muted/35 px-4 py-2 text-xs">
      <span className="font-semibold uppercase tracking-wide">
        Mixed scope package
      </span>
      <span className="inline-flex items-center gap-1">
        <HardHat className="size-3.5" />
        {labourCount} labour
      </span>
      <span className="inline-flex items-center gap-1">
        <PackageCheck className="size-3.5" />
        {materialCount} materials
      </span>
      <span>{labourCount + materialCount} pricing lines</span>
      <span>{recipients} private invitations</span>
      <span className="ml-auto inline-flex items-center gap-1 text-success-foreground">
        <ShieldCheck className="size-3.5" />
        One identical package
      </span>
    </div>
  );
}

function ScopeSelector({
  detail,
  kind,
  selected,
  setSelected,
}: {
  detail: ProductionBuildDetail;
  kind: QuoteKind;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const items = buildScopeItems(detail, kind);
  const milestones = [...new Set(items.map((item) => item.milestone))];

  const toggle = (id: string) => {
    setSelected(
      selected.includes(id)
        ? selected.filter((candidate) => candidate !== id)
        : [...selected, id]
    );
  };

  return (
    <div className="space-y-4">
      {milestones.map((milestone) => (
        <section className="space-y-2" key={milestone}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm">{milestone}</p>
            <span className="text-muted-foreground text-xs">
              {items.filter((item) => item.milestone === milestone).length}{" "}
              available
            </span>
          </div>
          <div className="grid gap-2">
            {items
              .filter((item) => item.milestone === milestone)
              .map((item) => {
                const active = selected.includes(item.id);
                return (
                  <Card
                    aria-pressed={active}
                    className={cn(
                      "cursor-pointer text-left transition-colors",
                      active && "border-primary/50 bg-primary/5"
                    )}
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    render={<button type="button" />}
                  >
                    <CardPanel className="flex items-start gap-3 p-3 sm:p-4">
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                          active &&
                            "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-sm">
                          {item.title}
                        </span>
                        <span className="block text-muted-foreground text-xs">
                          {item.meta}
                        </span>
                        {item.warning ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-warning-foreground text-xs">
                            <AlertTriangle className="size-3.5" />
                            {item.warning}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </CardPanel>
                  </Card>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MaterialScopeEditor({
  detail,
  material,
  onCancel,
  onSave,
}: {
  detail: ProductionBuildDetail;
  material?: QuoteMaterialLine;
  onCancel: () => void;
  onSave: (material: QuoteMaterialLine) => void;
}) {
  const [title, setTitle] = useState(material?.title ?? "");
  const [quantity, setQuantity] = useState(material?.quantity ?? "1");
  const [unit, setUnit] = useState(material?.unit ?? "package");
  const [submilestoneIds, setSubmilestoneIds] = useState(
    material?.submilestoneIds ?? []
  );
  const milestoneGroups = detail.milestones
    .map((milestone) => ({
      milestone,
      submilestones: detail.submilestones.filter(
        (submilestone) => submilestone.milestoneKey === milestone.key
      ),
    }))
    .filter((group) => group.submilestones.length > 0);
  const canSave = title.trim().length > 0 && submilestoneIds.length > 0;

  const toggleSubmilestone = (submilestoneId: string) => {
    setSubmilestoneIds((current) =>
      current.includes(submilestoneId)
        ? current.filter((candidate) => candidate !== submilestoneId)
        : [...current, submilestoneId]
    );
  };

  return (
    <Frame data-testid="quote-material-editor">
      <FrameHeader className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <FrameTitle>
            {material ? "Edit material scope" : "Add a material to quote"}
          </FrameTitle>
          <Button
            aria-label="Close material editor"
            className="size-8 p-0"
            onClick={onCancel}
            size="sm"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <FrameDescription>
          Name the material, then assign every sub-milestone that may consume or
          depend on it.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-5 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_140px]">
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-title"
          >
            <span className="font-medium">Material title</span>
            <Input
              aria-label="Material title"
              id="quote-material-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. 5/8 in fire-rated drywall"
              value={title}
            />
          </label>
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-quantity"
          >
            <span className="font-medium">Quantity</span>
            <Input
              aria-label="Material quantity"
              id="quote-material-quantity"
              min="0"
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              value={quantity}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Unit</span>
            <select
              aria-label="Material unit"
              className="min-h-9 rounded-lg border bg-background px-3 text-sm"
              onChange={(event) => setUnit(event.target.value)}
              value={unit}
            >
              <option value="package">Package</option>
              <option value="each">Each</option>
              <option value="sheet">Sheet</option>
              <option value="linear ft">Linear ft</option>
              <option value="sq ft">Sq ft</option>
              <option value="allowance">Allowance</option>
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">Relevant sub-milestones</p>
              <p className="text-muted-foreground text-xs">
                Select one or more. The supplier will see this context with the
                material line.
              </p>
            </div>
            <Badge variant={submilestoneIds.length > 0 ? "success" : "outline"}>
              {submilestoneIds.length} selected
            </Badge>
          </div>

          <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border bg-muted/20 p-3">
            {milestoneGroups.map(({ milestone, submilestones }) => (
              <section className="space-y-2" key={milestone.key}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-xs">{milestone.name}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {
                      submilestones.filter((submilestone) =>
                        submilestoneIds.includes(submilestone.key)
                      ).length
                    }
                    /{submilestones.length}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {submilestones.map((submilestone) => {
                    const active = submilestoneIds.includes(submilestone.key);
                    return (
                      <Card
                        aria-pressed={active}
                        className={cn(
                          "cursor-pointer text-left transition-colors",
                          active && "border-primary/50 bg-primary/5"
                        )}
                        key={submilestone.key}
                        onClick={() => toggleSubmilestone(submilestone.key)}
                        render={<button type="button" />}
                      >
                        <CardPanel className="flex items-start gap-2.5 p-3">
                          <span
                            className={cn(
                              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                              active &&
                                "border-primary bg-primary text-primary-foreground"
                            )}
                          >
                            {active ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium text-xs">
                              {submilestone.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {milestone.name}
                            </span>
                          </span>
                        </CardPanel>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Saved materials are selected into this Quote Round automatically.
          </p>
          <div className="flex gap-2">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!canSave}
              onClick={() =>
                onSave({
                  id: material?.id ?? "",
                  quantity: quantity.trim() || "1",
                  submilestoneIds,
                  title: title.trim(),
                  unit,
                })
              }
            >
              <Check className="size-4" />
              {material ? "Save changes" : "Add to quote"}
            </Button>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function CustomMaterialScopeList({
  detail,
  materials,
  onEdit,
  selected,
  setSelected,
}: {
  detail: ProductionBuildDetail;
  materials: QuoteMaterialLine[];
  onEdit: (material: QuoteMaterialLine) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  if (materials.length === 0) {
    return null;
  }

  const toggle = (id: string) => {
    setSelected(
      selected.includes(id)
        ? selected.filter((candidate) => candidate !== id)
        : [...selected, id]
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">Added for this Quote Round</p>
          <p className="text-muted-foreground text-xs">
            Materials created here remain local to this draft package.
          </p>
        </div>
        <Badge variant="warning">{materials.length} added</Badge>
      </div>
      <div className="grid gap-2">
        {materials.map((material) => {
          const active = selected.includes(material.id);
          const relatedSubmilestones = material.submilestoneIds.map(
            (submilestoneId) =>
              detail.submilestones.find(
                (submilestone) => submilestone.key === submilestoneId
              )?.name ?? submilestoneId
          );

          return (
            <Card key={material.id}>
              <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
                <Button
                  aria-label={`${active ? "Remove" : "Add"} ${material.title} ${active ? "from" : "to"} this Quote Round`}
                  aria-pressed={active}
                  className="size-8 shrink-0 p-0"
                  onClick={() => toggle(material.id)}
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  {active ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{material.title}</p>
                    <Badge variant="outline">
                      {material.quantity} {material.unit}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {relatedSubmilestones.map((submilestone) => (
                      <Badge key={submilestone} variant="secondary">
                        {submilestone}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => onEdit(material)}
                  size="sm"
                  variant="outline"
                >
                  <Settings2 className="size-4" />
                  Edit assignments
                </Button>
              </CardPanel>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SelectedScopeTooltip({
  additionalItems = [],
  detail,
  kind,
  selected,
}: {
  additionalItems?: ScopeItem[];
  detail: ProductionBuildDetail;
  kind: QuoteKind;
  selected: string[];
}) {
  const items = [...buildScopeItems(detail, kind), ...additionalItems].filter(
    (item) => selected.includes(item.id)
  );
  const label = kind === "labour" ? "Labour" : "Materials";

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-2">
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <div>
          <p className="font-semibold text-sm">{label} scope</p>
          <p className="text-muted-foreground text-xs">
            {items.length} selected for this Quote Round
          </p>
        </div>
        <Badge variant={kind === "labour" ? "info" : "warning"}>
          {items.length}
        </Badge>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <div className="rounded-lg border bg-background p-2" key={item.id}>
            <p className="font-medium text-xs">{item.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {item.milestone}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {item.meta}
            </p>
            {item.relatedSubmilestones?.length ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {item.relatedSubmilestones.join(" · ")}
              </p>
            ) : null}
          </div>
        ))}
        {items.length === 0 ? (
          <p className="py-2 text-center text-muted-foreground text-xs">
            No {label.toLowerCase()} items selected.
          </p>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Hover or focus either tab at any time to inspect its locked selection.
      </p>
    </div>
  );
}

function ScopeKindTab({
  active,
  additionalItems = [],
  detail,
  kind,
  onSelect,
  selected,
}: {
  active: boolean;
  additionalItems?: ScopeItem[];
  detail: ProductionBuildDetail;
  kind: QuoteKind;
  onSelect: () => void;
  selected: string[];
}) {
  const label = kind === "labour" ? "Labour" : "Materials";
  const Icon = kind === "labour" ? HardHat : PackageCheck;

  return (
    <div className="relative min-w-0 flex-1">
      <Button
        aria-pressed={active}
        className="w-full min-w-0 justify-start pr-12"
        onClick={onSelect}
        variant={active ? "default" : "ghost"}
      >
        <Icon />
        <span className="truncate">{label}</span>
      </Button>
      <Tooltip>
        <TooltipTrigger
          aria-label={`${selected.length} selected ${label.toLowerCase()} items`}
          render={
            <Button
              className="absolute top-1/2 right-1.5 size-7 -translate-y-1/2 p-0"
              size="sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <Badge
            className="min-w-6 justify-center"
            variant={active ? "secondary" : "outline"}
          >
            {selected.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="p-0" side="bottom">
          <SelectedScopeTooltip
            additionalItems={additionalItems}
            detail={detail}
            kind={kind}
            selected={selected}
          />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function TabbedScopeSelector({
  customMaterials,
  detail,
  selectedLabour,
  selectedMaterials,
  setCustomMaterials,
  setSelectedLabour,
  setSelectedMaterials,
}: {
  customMaterials: QuoteMaterialLine[];
  detail: ProductionBuildDetail;
  selectedLabour: string[];
  selectedMaterials: string[];
  setCustomMaterials: Dispatch<SetStateAction<QuoteMaterialLine[]>>;
  setSelectedLabour: (ids: string[]) => void;
  setSelectedMaterials: (ids: string[]) => void;
}) {
  const [activeKind, setActiveKind] = useState<QuoteKind>("labour");
  const [editingMaterial, setEditingMaterial] = useState<
    QuoteMaterialLine | "new" | null
  >(null);
  const customMaterialItems = buildCustomMaterialScopeItems(
    detail,
    customMaterials
  );

  const saveMaterial = (material: QuoteMaterialLine) => {
    let materialId = material.id;
    if (materialId) {
      setCustomMaterials((current) =>
        current.map((candidate) =>
          candidate.id === materialId ? material : candidate
        )
      );
    } else {
      materialId = `quote-material-${customMaterials.length + 1}`;
      setCustomMaterials((current) => [
        ...current,
        { ...material, id: materialId },
      ]);
    }

    setSelectedMaterials(
      selectedMaterials.includes(materialId)
        ? selectedMaterials
        : [...selectedMaterials, materialId]
    );
    setEditingMaterial(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <ScopeKindTab
          active={activeKind === "labour"}
          detail={detail}
          kind="labour"
          onSelect={() => setActiveKind("labour")}
          selected={selectedLabour}
        />
        <ScopeKindTab
          active={activeKind === "material"}
          additionalItems={customMaterialItems}
          detail={detail}
          kind="material"
          onSelect={() => setActiveKind("material")}
          selected={selectedMaterials}
        />
      </div>

      <div className="flex flex-wrap items-start gap-3 border-b pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              activeKind === "labour"
                ? "bg-info/10 text-info-foreground"
                : "bg-warning/10 text-warning-foreground"
            )}
          >
            {activeKind === "labour" ? (
              <HardHat className="size-5" />
            ) : (
              <PackageCheck className="size-5" />
            )}
          </span>
          <div>
            <p className="font-semibold">
              {activeKind === "labour" ? "Labour" : "Materials"} scope
            </p>
            <p className="text-muted-foreground text-xs">
              {activeKind === "labour"
                ? "Select every sub-milestone whose work the recipient must price."
                : "Select planned materials or add a new line and assign its relevant sub-milestones."}
            </p>
          </div>
        </div>
        {activeKind === "material" ? (
          <Button onClick={() => setEditingMaterial("new")} size="sm">
            <Plus className="size-4" />
            Add material
          </Button>
        ) : null}
      </div>

      {activeKind === "material" && editingMaterial ? (
        <MaterialScopeEditor
          detail={detail}
          key={editingMaterial === "new" ? "new" : editingMaterial.id}
          material={editingMaterial === "new" ? undefined : editingMaterial}
          onCancel={() => setEditingMaterial(null)}
          onSave={saveMaterial}
        />
      ) : null}

      {activeKind === "labour" ? (
        <ScopeSelector
          detail={detail}
          kind="labour"
          selected={selectedLabour}
          setSelected={setSelectedLabour}
        />
      ) : (
        <div className="space-y-6">
          <CustomMaterialScopeList
            detail={detail}
            materials={customMaterials}
            onEdit={setEditingMaterial}
            selected={selectedMaterials}
            setSelected={setSelectedMaterials}
          />
          <section className="space-y-2">
            <div>
              <p className="font-semibold text-sm">Planned build materials</p>
              <p className="text-muted-foreground text-xs">
                Existing material lines inherited from planning.
              </p>
            </div>
            <ScopeSelector
              detail={detail}
              kind="material"
              selected={selectedMaterials}
              setSelected={setSelectedMaterials}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function DisclosureProof({ compact = false }: { compact?: boolean }) {
  const rows = [
    ["Building permit", "Permit 24-1183 · 18 pages", FileCheck2],
    ["Exact site location", "18 Willow Avenue, Hamilton, ON", MapPin],
    ["Timeline and dates", "4 scope windows · baseline v14", CalendarDays],
    [
      "Planning specifications",
      "12 details inherited from selected scope",
      Layers3,
    ],
    ["Attachments", "7 recipient-shareable · 2 private excluded", FileText],
  ] satisfies [string, string, LucideIcon][];

  return (
    <div className="space-y-2">
      {rows.map(([label, meta, Icon]) => (
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-background",
            compact ? "p-2.5" : "p-3.5"
          )}
          key={label}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{label}</p>
            <p className="truncate text-muted-foreground text-xs">{meta}</p>
          </div>
          <CheckCircle2 className="size-4 shrink-0 text-success-foreground" />
        </div>
      ))}
      <div className="relative h-32 overflow-hidden rounded-xl border bg-[length:32px_32px] bg-[linear-gradient(135deg,var(--muted)_25%,transparent_25%),linear-gradient(225deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(315deg,var(--muted)_25%,var(--background)_25%)] bg-[position:8px_0,8px_0,0_0,0_0]">
        <div className="absolute inset-0 bg-background/35" />
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <MapPin className="size-4" />
          </span>
          <span className="mt-1 rounded-md bg-background px-2 py-1 font-medium text-[10px] shadow">
            18 Willow Ave
          </span>
        </div>
      </div>
    </div>
  );
}

function RecipientEditor({
  recipients,
  setRecipients,
}: {
  recipients: Recipient[];
  setRecipients: (value: Recipient[]) => void;
}) {
  const [email, setEmail] = useState("");

  const add = () => {
    const normalized = email.trim().toLowerCase();
    if (
      !(
        normalized.includes("@") &&
        !recipients.some((item) => item.email === normalized)
      )
    ) {
      return;
    }
    setRecipients([
      ...recipients,
      {
        email: normalized,
        id: `recipient-${recipients.length + 1}`,
        name: normalized,
        state: "new",
      },
    ]);
    setEmail("");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          aria-label="Contractor email"
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="contractor@company.ca"
          value={email}
        />
        <Button onClick={add}>
          <Plus />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Any valid email is eligible. New contacts receive a provisional profile
        without WorkOS.
      </p>
      <div className="space-y-2">
        {recipients.map((recipient) => (
          <Card key={recipient.id}>
            <CardPanel className="flex items-start gap-3 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-semibold text-xs">
                {recipient.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-sm">
                    {recipient.name}
                  </p>
                  <Badge
                    variant={recipient.state === "new" ? "info" : "outline"}
                  >
                    {recipient.state === "new" ? "New contact" : "Existing"}
                  </Badge>
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {recipient.email}
                </p>
                {recipient.warning ? (
                  <p className="mt-1 flex items-center gap-1 text-warning-foreground text-xs">
                    <AlertTriangle className="size-3.5" />
                    {recipient.warning}
                  </p>
                ) : null}
              </div>
              <Button
                aria-label={`Remove ${recipient.email}`}
                onClick={() =>
                  setRecipients(
                    recipients.filter((item) => item.id !== recipient.id)
                  )
                }
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            </CardPanel>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResponseBuilder({
  comments,
  labourCount,
  materialCount,
  onConfigureTemplates,
  setComments,
}: {
  comments: string;
  labourCount?: number;
  materialCount?: number;
  onConfigureTemplates?: () => void;
  setComments: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm">Standard trade quote</p>
            <Badge variant="outline">Published v3</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {labourCount ?? 4} labour · {materialCount ?? 0} materials · 4
            custom questions · 2 permanent regions
          </p>
        </div>
        <Button onClick={onConfigureTemplates} size="sm" variant="outline">
          {onConfigureTemplates ? <Settings2 /> : <Sparkles />}
          {onConfigureTemplates ? "Configure templates" : "Apply template"}
        </Button>
      </div>
      {onConfigureTemplates ? (
        <Card className="border-info/30 bg-info/5">
          <CardPanel className="flex items-start gap-3 p-3">
            <ShieldCheck className="mt-0.5 size-4 text-info-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">Pinned response snapshot</p>
              <p className="text-muted-foreground text-xs">
                Dispatch will preserve this resolved template even if a newer
                version is published later.
              </p>
            </div>
            <Button onClick={onConfigureTemplates} size="sm" variant="ghost">
              Change
            </Button>
          </CardPanel>
        </Card>
      ) : null}
      <div className="space-y-2">
        {CUSTOM_FIELDS.map((field, index) => (
          <Card key={field.id}>
            <CardPanel className="flex items-center gap-3 p-3">
              <GripVertical className="size-4 text-muted-foreground" />
              <span className="grid size-7 place-items-center rounded-md bg-muted font-semibold text-xs">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">{field.label}</span>
                <span className="block text-muted-foreground text-xs">
                  {field.meta}
                </span>
              </span>
              <Button
                aria-label={`Configure ${field.label}`}
                size="icon-sm"
                variant="ghost"
              >
                <Settings2 />
              </Button>
            </CardPanel>
          </Card>
        ))}
      </div>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-primary" />
            <CardTitle className="text-sm">Additional line items</CardTitle>
            <Badge className="ml-auto" variant="outline">
              Permanent
            </Badge>
          </div>
          <CardDescription>Repeatable title + amount rows</CardDescription>
        </CardHeader>
        <CardPanel className="grid grid-cols-[1fr_8rem] gap-2 p-4 pt-0">
          <Input
            aria-label="Example line title"
            placeholder="Line-item title"
          />
          <Input aria-label="Example line amount" placeholder="$0.00" />
        </CardPanel>
      </Card>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-primary" />
            <CardTitle className="text-sm">Additional comments</CardTitle>
            <Badge className="ml-auto" variant="outline">
              Permanent
            </Badge>
          </div>
          <CardDescription>TipTap rich-text escape hatch</CardDescription>
        </CardHeader>
        <CardPanel className="p-4 pt-0">
          <FieldRichTextEditor
            ariaLabel="Additional comments"
            editorMinHeightClass="[&_.ProseMirror]:min-h-24"
            onChange={setComments}
            placeholder="Anything else the contractor should explain..."
            value={comments}
          />
        </CardPanel>
      </Card>
      <Button variant="outline">
        <Plus />
        Add custom field
      </Button>
    </div>
  );
}

function TimingEditor() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm" htmlFor="quote-response-deadline">
        <span className="font-medium">Response deadline</span>
        <Input
          defaultValue="2026-08-18T17:00"
          id="quote-response-deadline"
          type="datetime-local"
        />
        <span className="text-muted-foreground text-xs">
          Editable until this time
        </span>
      </label>
      <label className="grid gap-1.5 text-sm" htmlFor="quote-access-expiry">
        <span className="font-medium">Magic-link expiry</span>
        <Input
          defaultValue="2026-08-25T17:00"
          id="quote-access-expiry"
          type="datetime-local"
        />
        <span className="text-muted-foreground text-xs">
          Seven read-only days after deadline
        </span>
      </label>
      <div className="sm:col-span-2">
        <div className="flex items-center text-[11px]">
          <span className="h-2 flex-[3] rounded-l-full bg-primary" />
          <span className="h-2 flex-1 rounded-r-full bg-warning" />
        </div>
        <div className="mt-1 flex justify-between text-muted-foreground text-xs">
          <span>Send · editable</span>
          <span>Deadline · read-only</span>
          <span>Expiry</span>
        </div>
      </div>
    </div>
  );
}

function RecipientPreview({
  detail,
  kind,
  recipient,
  selectedCount,
}: {
  detail: ProductionBuildDetail;
  kind: QuoteKind;
  recipient: Recipient;
  selectedCount: number;
}) {
  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="border-b bg-neutral-950 p-4 text-white">
        <p className="text-[10px] text-white/55 uppercase tracking-[0.18em]">
          Private quote invitation
        </p>
        <h3 className="mt-1 font-semibold text-lg">{detail.build.buildName}</h3>
        <p className="text-white/65 text-xs">Prepared for {recipient.name}</p>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">
            {kind === "labour" ? "Labour" : "Materials"}
          </Badge>
          <Badge variant="outline">{selectedCount} pricing lines</Badge>
          <Badge variant="outline">Due Aug 18</Badge>
        </div>
        <div>
          <p className="font-semibold text-sm">Site and schedule</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-muted-foreground text-xs">Exact location</p>
              <p className="mt-1 font-medium text-sm">18 Willow Avenue</p>
              <p className="text-muted-foreground text-xs">Hamilton, Ontario</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-muted-foreground text-xs">Relevant dates</p>
              <p className="mt-1 font-medium text-sm">May 12–July 08</p>
              <p className="text-muted-foreground text-xs">
                Roadmap baseline v14
              </p>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Scope to price</p>
            <span className="text-muted-foreground text-xs">
              {selectedCount} required
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {["Wall framing", "Roof trusses", "Structural sheathing"].map(
              (label, index) => (
                <div
                  className="flex items-center gap-2 rounded-lg border p-2.5 text-sm"
                  key={label}
                >
                  <span className="grid size-6 place-items-center rounded-md bg-muted text-xs">
                    {index + 1}
                  </span>
                  <span className="flex-1">{label}</span>
                  <span className="text-muted-foreground">$0.00</span>
                </div>
              )
            )}
          </div>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <p className="font-medium text-sm">
              Complete permit and planning package
            </p>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Permit 24-1183 · 12 specifications · 7 shareable attachments · map
          </p>
        </div>
        <Button className="w-full">Start line-by-line quote</Button>
      </div>
    </div>
  );
}

function MixedRecipientPreview({
  detail,
  labourItems,
  materialItems,
  recipient,
}: {
  detail: ProductionBuildDetail;
  labourItems: ScopeItem[];
  materialItems: ScopeItem[];
  recipient: Recipient;
}) {
  const groups = [
    { icon: HardHat, items: labourItems, label: "Labour" },
    { icon: PackageCheck, items: materialItems, label: "Materials" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-neutral-950 p-4 text-white">
        <p className="text-[10px] text-white/55 uppercase tracking-[0.18em]">
          Private quote invitation
        </p>
        <h3 className="mt-1 font-semibold text-base">
          {detail.build.buildName}
        </h3>
        <p className="truncate text-white/65 text-xs">
          Prepared for {recipient.name}
        </p>
      </div>
      <CardPanel className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{labourItems.length} labour</Badge>
          <Badge variant="warning">{materialItems.length} materials</Badge>
          <Badge variant="outline">Due Aug 18</Badge>
        </div>

        <div>
          <p className="font-semibold text-sm">Site and schedule</p>
          <div className="mt-2 grid gap-2">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-muted-foreground text-xs">Exact location</p>
              <p className="mt-1 font-medium text-sm">18 Willow Avenue</p>
              <p className="text-muted-foreground text-xs">
                Hamilton, Ontario · May 12–July 08
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Scope to price</p>
            <span className="text-muted-foreground text-xs">
              {labourItems.length + materialItems.length} required
            </span>
          </div>
          {groups.map(({ icon: Icon, items, label }) => (
            <div className="space-y-1.5" key={label}>
              <div className="flex items-center gap-2">
                <Icon className="size-3.5 text-muted-foreground" />
                <p className="font-medium text-xs">{label}</p>
                <Badge className="ml-auto" variant="outline">
                  {items.length}
                </Badge>
              </div>
              {items.slice(0, 3).map((item) => (
                <div
                  className="flex items-start gap-2 rounded-lg border p-2.5 text-xs"
                  key={item.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.title}</span>
                    {item.relatedSubmilestones?.length ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        For {item.relatedSubmilestones.join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">$0.00</span>
                </div>
              ))}
              {items.length > 3 ? (
                <p className="pl-1 text-[10px] text-muted-foreground">
                  + {items.length - 3} more selected
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <p className="font-medium text-sm">Complete planning package</p>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Permit · timeline · specifications · 7 attachments · exact map
          </p>
        </div>
        <Button className="w-full">Preview line-by-line quote</Button>
      </CardPanel>
    </Card>
  );
}

function ScopeLockRecipientExperience({
  customMaterials,
  detail,
  recipients,
  selectedLabour,
  selectedMaterials,
}: {
  customMaterials: QuoteMaterialLine[];
  detail: ProductionBuildDetail;
  recipients: Recipient[];
  selectedLabour: string[];
  selectedMaterials: string[];
}) {
  const [previewRecipient, setPreviewRecipient] = useState(
    INITIAL_RECIPIENTS[0]?.id ?? ""
  );
  const recipient =
    recipients.find((item) => item.id === previewRecipient) ??
    recipients[0] ??
    INITIAL_RECIPIENTS[0];
  const labourItems = buildScopeItems(detail, "labour").filter((item) =>
    selectedLabour.includes(item.id)
  );
  const materialItems = [
    ...buildCustomMaterialScopeItems(detail, customMaterials),
    ...buildScopeItems(detail, "material"),
  ].filter((item) => selectedMaterials.includes(item.id));

  if (!recipient) {
    return null;
  }

  return (
    <Frame
      className="self-start xl:sticky xl:top-[7.7rem]"
      data-testid="quote-recipient-experience"
    >
      <FrameHeader className="gap-2">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <FrameTitle>Recipient experience</FrameTitle>
        </div>
        <FrameDescription>
          Live preview of the identical private package.
        </FrameDescription>
        <select
          aria-label="Preview recipient"
          className="min-h-9 w-full rounded-lg border bg-background px-2 text-xs"
          onChange={(event) => setPreviewRecipient(event.target.value)}
          value={recipient.id}
        >
          {recipients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </FrameHeader>
      <FramePanel className="max-h-[calc(100vh-13rem)] overflow-y-auto bg-muted/40 p-3">
        <MixedRecipientPreview
          detail={detail}
          labourItems={labourItems}
          materialItems={materialItems}
          recipient={recipient}
        />
      </FramePanel>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
        <Badge variant="success">Identical package</Badge>
        <span className="text-muted-foreground">
          Only the private envelope changes.
        </span>
      </div>
    </Frame>
  );
}

const SCOPE_LOCK_STAGES = [
  { icon: Layers3, id: "scope", label: "Scope" },
  { icon: FileCheck2, id: "package", label: "Package" },
  { icon: Users, id: "recipients", label: "Recipients" },
  { icon: ReceiptText, id: "response", label: "Response" },
  { icon: Send, id: "dispatch", label: "Dispatch" },
] as const;

type ScopeLockStage = (typeof SCOPE_LOCK_STAGES)[number]["id"];

function PackageProofFrame({
  labourCount,
  materialCount,
  recipientCount,
}: {
  labourCount: number;
  materialCount: number;
  recipientCount: number;
}) {
  return (
    <Frame
      className="hidden self-start 2xl:flex"
      data-testid="quote-package-proof"
    >
      <FrameHeader>
        <FrameTitle>Package proof</FrameTitle>
        <FrameDescription>Read-only publication state.</FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-3 p-3">
        <ProofMetric
          icon={Layers3}
          label="Scope"
          value={`${labourCount} labour · ${materialCount} materials`}
        />
        <ProofMetric icon={FileCheck2} label="Disclosures" value="Complete" />
        <ProofMetric
          icon={Users}
          label="Recipients"
          value={`${recipientCount} private`}
        />
        <ProofMetric
          icon={ReceiptText}
          label="Response"
          value="Template v3 · 4 custom + 2 fixed"
        />
        <ProofMetric icon={Clock3} label="Access" value="Expires Aug 25" />
      </FramePanel>
    </Frame>
  );
}

function ScopeLockVariant({
  detail,
  onConfigureTemplates,
  onExit,
}: {
  detail: ProductionBuildDetail;
  onConfigureTemplates: () => void;
  onExit: () => void;
}) {
  const [stage, setStage] = useState<ScopeLockStage>("scope");
  const initialLabourIds = useMemo(
    () =>
      buildScopeItems(detail, "labour")
        .slice(0, 4)
        .map((item) => item.id),
    [detail]
  );
  const initialMaterialIds = useMemo(
    () =>
      buildScopeItems(detail, "material")
        .slice(0, 3)
        .map((item) => item.id),
    [detail]
  );
  const [selectedLabour, setSelectedLabour] = useState(initialLabourIds);
  const [selectedMaterials, setSelectedMaterials] =
    useState(initialMaterialIds);
  const [customMaterials, setCustomMaterials] = useState<QuoteMaterialLine[]>(
    []
  );
  const [recipients, setRecipients] = useState(INITIAL_RECIPIENTS);
  const [comments, setComments] = useState(
    "<p>Describe assumptions, exclusions, and anything else we should understand.</p>"
  );
  const [simulated, setSimulated] = useState(false);
  const stageIndex = SCOPE_LOCK_STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="min-h-screen bg-muted/25 pb-28">
      <ComposerHeader
        detail={detail}
        kind="mixed"
        onExit={onExit}
        title="New Quote Round"
      />
      <CombinedPackageTape
        labourCount={selectedLabour.length}
        materialCount={selectedMaterials.length}
        recipients={recipients.length}
      />
      <main className="mx-auto grid max-w-[1800px] gap-4 p-3 sm:p-5 xl:grid-cols-[200px_minmax(0,1fr)_360px] 2xl:grid-cols-[220px_200px_minmax(0,1fr)_360px]">
        <PackageProofFrame
          labourCount={selectedLabour.length}
          materialCount={selectedMaterials.length}
          recipientCount={recipients.length}
        />

        <Frame className="hidden self-start xl:flex">
          <FrameHeader>
            <FrameTitle>Publish package</FrameTitle>
            <FrameDescription>
              One controlled decision at a time.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-1 p-2">
            {SCOPE_LOCK_STAGES.map((item, index) => {
              const Icon = item.icon;
              const active = item.id === stage;
              return (
                <Button
                  className="w-full justify-start"
                  key={item.id}
                  onClick={() => setStage(item.id)}
                  variant={active ? "secondary" : "ghost"}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-md text-xs",
                      index < stageIndex
                        ? "bg-success/12 text-success-foreground"
                        : "bg-muted"
                    )}
                  >
                    {index < stageIndex ? (
                      <Check className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <Icon />
                  {item.label}
                  {active ? <ChevronRight className="ml-auto" /> : null}
                </Button>
              );
            })}
          </FramePanel>
        </Frame>

        <div className="min-w-0 max-w-full overflow-hidden xl:hidden">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {SCOPE_LOCK_STAGES.map((item, index) => (
              <Button
                className="min-w-fit"
                key={item.id}
                onClick={() => setStage(item.id)}
                size="sm"
                variant={item.id === stage ? "default" : "outline"}
              >
                {index + 1}. {item.label}
              </Button>
            ))}
          </div>
        </div>

        <Frame>
          <FrameHeader className="gap-1">
            <div className="flex items-center justify-between gap-3">
              <FrameTitle className="text-base">
                {SCOPE_LOCK_STAGES.find((item) => item.id === stage)?.label}
              </FrameTitle>
              <Badge variant="outline">Step {stageIndex + 1} of 5</Badge>
            </div>
            <FrameDescription>
              {stage === "scope" &&
                "Lock the complete work package every recipient will price."}
              {stage === "package" && "Prove exactly what leaves DrawFlow."}
              {stage === "recipients" &&
                "Choose private recipients; cold emails are welcome."}
              {stage === "response" &&
                "Start from a strong template, then customize only what matters."}
              {stage === "dispatch" &&
                "Review timing and every private invitation before publishing."}
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-4 sm:p-5">
            {stage === "scope" ? (
              <TabbedScopeSelector
                customMaterials={customMaterials}
                detail={detail}
                selectedLabour={selectedLabour}
                selectedMaterials={selectedMaterials}
                setCustomMaterials={setCustomMaterials}
                setSelectedLabour={setSelectedLabour}
                setSelectedMaterials={setSelectedMaterials}
              />
            ) : null}
            {stage === "package" ? (
              <div className="space-y-4">
                <DisclosureProof />
                <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/5 p-3">
                  <ShieldCheck className="mt-0.5 size-4 text-info-foreground" />
                  <div>
                    <p className="font-medium text-sm">
                      Exact address disclosure confirmed
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Every recipient receives the full permit, map, dates,
                      specifications, and shareable planning attachments.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            {stage === "recipients" ? (
              <RecipientEditor
                recipients={recipients}
                setRecipients={setRecipients}
              />
            ) : null}
            {stage === "response" ? (
              <ResponseBuilder
                comments={comments}
                labourCount={selectedLabour.length}
                materialCount={selectedMaterials.length}
                onConfigureTemplates={onConfigureTemplates}
                setComments={setComments}
              />
            ) : null}
            {stage === "dispatch" ? (
              <div className="space-y-5">
                <TimingEditor />
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-sm">Invitation review</p>
                    <Badge variant="success">{recipients.length} ready</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {recipients.map((recipient) => (
                      <Card key={recipient.id}>
                        <CardPanel className="flex items-center gap-3 p-3">
                          <Mail className="size-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-sm">
                              {recipient.name}
                            </span>
                            <span className="block truncate text-muted-foreground text-xs">
                              Private invitation · package v1
                            </span>
                          </span>
                          <Eye className="size-4 text-muted-foreground" />
                        </CardPanel>
                      </Card>
                    ))}
                  </div>
                </div>
                {simulated ? (
                  <SimulationReceipt count={recipients.length} />
                ) : null}
              </div>
            ) : null}
          </FramePanel>
          <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5">
            <Button
              disabled={stageIndex === 0}
              onClick={() =>
                setStage(
                  SCOPE_LOCK_STAGES[Math.max(0, stageIndex - 1)]?.id ?? "scope"
                )
              }
              variant="outline"
            >
              <ArrowLeft />
              Back
            </Button>
            {stage === "dispatch" ? (
              <Button onClick={() => setSimulated(true)}>
                <Send />
                Simulate send
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setStage(
                    SCOPE_LOCK_STAGES[
                      Math.min(SCOPE_LOCK_STAGES.length - 1, stageIndex + 1)
                    ]?.id ?? "dispatch"
                  )
                }
              >
                Continue
                <ArrowRight />
              </Button>
            )}
          </div>
        </Frame>

        <ScopeLockRecipientExperience
          customMaterials={customMaterials}
          detail={detail}
          recipients={recipients}
          selectedLabour={selectedLabour}
          selectedMaterials={selectedMaterials}
        />
      </main>
    </div>
  );
}

function ProofMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate font-medium text-sm">{value}</p>
      </div>
      <CheckCircle2 className="size-4 text-success-foreground" />
    </div>
  );
}

type StudioArea = "scope" | "recipients" | "form" | "delivery";

const STUDIO_AREAS: { icon: LucideIcon; id: StudioArea; label: string }[] = [
  { icon: Layers3, id: "scope", label: "Scope" },
  { icon: Users, id: "recipients", label: "Recipients" },
  { icon: ReceiptText, id: "form", label: "Form" },
  { icon: Clock3, id: "delivery", label: "Delivery" },
];

function PacketStudioVariant({
  detail,
  onExit,
}: {
  detail: ProductionBuildDetail;
  onExit: () => void;
}) {
  const [kind, setKind] = useState<QuoteKind>("labour");
  const [activeArea, setActiveArea] = useState<StudioArea>("scope");
  const [selected, setSelected] = useState(
    buildScopeItems(detail, "labour")
      .slice(0, 4)
      .map((item) => item.id)
  );
  const [recipients, setRecipients] = useState(INITIAL_RECIPIENTS);
  const [previewRecipient, setPreviewRecipient] = useState(
    INITIAL_RECIPIENTS[0]?.id ?? ""
  );
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">(
    "mobile"
  );
  const [comments, setComments] = useState(
    "<p>Include all assumptions and exclusions.</p>"
  );
  const [simulated, setSimulated] = useState(false);

  const changeKind = (value: QuoteKind) => {
    setKind(value);
    setSelected(
      buildScopeItems(detail, value)
        .slice(0, 3)
        .map((item) => item.id)
    );
  };
  const recipient =
    recipients.find((item) => item.id === previewRecipient) ??
    recipients[0] ??
    INITIAL_RECIPIENTS[0];

  return (
    <div className="min-h-screen bg-muted/25 pb-24">
      <ComposerHeader
        detail={detail}
        kind={kind}
        onExit={onExit}
        title="Quote Packet Studio"
      />
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b bg-background/96 px-3 py-2 backdrop-blur sm:px-5">
        <Badge variant="success">
          <ShieldCheck />
          Package synced
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground">
          PACKAGE · 9B7E-14A2
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          0 blockers · 2 warnings
        </span>
        <Button onClick={() => setSimulated(true)} size="sm">
          <Send />
          Simulate send
        </Button>
      </div>
      <main className="mx-auto grid max-w-[1600px] gap-3 p-3 lg:grid-cols-[minmax(430px,0.8fr)_minmax(480px,1.2fr)]">
        <Frame className="min-h-[calc(100vh-9rem)]">
          <div className="flex gap-1 overflow-x-auto border-b px-2 py-2">
            {STUDIO_AREAS.map((area) => {
              const Icon = area.icon;
              return (
                <Button
                  key={area.id}
                  onClick={() => setActiveArea(area.id)}
                  size="sm"
                  variant={activeArea === area.id ? "secondary" : "ghost"}
                >
                  <Icon />
                  {area.label}
                  {area.id === "scope" ? (
                    <Badge variant="outline">{selected.length}</Badge>
                  ) : null}
                  {area.id === "recipients" ? (
                    <Badge variant="outline">{recipients.length}</Badge>
                  ) : null}
                </Button>
              );
            })}
          </div>
          <FramePanel className="flex-1 p-4">
            {activeArea === "scope" ? (
              <div className="space-y-4">
                <KindToggle kind={kind} onChange={changeKind} />
                <ScopeSelector
                  detail={detail}
                  kind={kind}
                  selected={selected}
                  setSelected={setSelected}
                />
              </div>
            ) : null}
            {activeArea === "recipients" ? (
              <RecipientEditor
                recipients={recipients}
                setRecipients={setRecipients}
              />
            ) : null}
            {activeArea === "form" ? (
              <ResponseBuilder comments={comments} setComments={setComments} />
            ) : null}
            {activeArea === "delivery" ? <TimingEditor /> : null}
          </FramePanel>
        </Frame>

        <Frame className="self-start lg:sticky lg:top-[7.7rem]">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <PanelRight className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Recipient experience</span>
            <select
              aria-label="Preview recipient"
              className="min-h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs"
              onChange={(event) => setPreviewRecipient(event.target.value)}
              value={recipient?.id}
            >
              {recipients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border p-0.5">
              <Button
                aria-label="Mobile preview"
                onClick={() => setPreviewMode("mobile")}
                size="icon-xs"
                variant={previewMode === "mobile" ? "secondary" : "ghost"}
              >
                <Smartphone />
              </Button>
              <Button
                aria-label="Desktop preview"
                onClick={() => setPreviewMode("desktop")}
                size="icon-xs"
                variant={previewMode === "desktop" ? "secondary" : "ghost"}
              >
                <Monitor />
              </Button>
            </div>
          </div>
          <FramePanel className="overflow-auto bg-muted/40 p-3 sm:p-5">
            <div
              className={cn(
                "mx-auto transition-[max-width]",
                previewMode === "mobile" ? "max-w-[390px]" : "max-w-3xl"
              )}
            >
              {recipient ? (
                <RecipientPreview
                  detail={detail}
                  kind={kind}
                  recipient={recipient}
                  selectedCount={selected.length}
                />
              ) : null}
            </div>
          </FramePanel>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <Badge variant="success">Identical package</Badge>
            <span className="text-muted-foreground">
              Only the private envelope changes between recipients.
            </span>
          </div>
        </Frame>
      </main>
      {simulated ? (
        <div className="fixed right-3 bottom-20 z-40 w-[min(24rem,calc(100vw-1.5rem))]">
          <SimulationReceipt
            count={recipients.length}
            onDismiss={() => setSimulated(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

type LedgerSection =
  | "scope"
  | "disclosures"
  | "recipients"
  | "response"
  | "timing"
  | "previews"
  | "release";

const LEDGER_ROWS: {
  id: LedgerSection;
  label: string;
  meta: string;
  status: "ready" | "warning";
  icon: LucideIcon;
}[] = [
  {
    icon: Layers3,
    id: "scope",
    label: "Scope package",
    meta: "4 lines · 2 Milestones · 1 schedule warning",
    status: "warning",
  },
  {
    icon: FileCheck2,
    id: "disclosures",
    label: "Planning disclosures",
    meta: "Permit, map, dates, 12 details, 7 attachments",
    status: "ready",
  },
  {
    icon: Users,
    id: "recipients",
    label: "Recipient coverage",
    meta: "3 recipients · 1 provisional · complete package",
    status: "warning",
  },
  {
    icon: ReceiptText,
    id: "response",
    label: "Response structure",
    meta: "4 pricing lines · 4 custom · 2 permanent",
    status: "ready",
  },
  {
    icon: Clock3,
    id: "timing",
    label: "Deadline and access",
    meta: "Due Aug 18 · read-only until Aug 25",
    status: "ready",
  },
  {
    icon: Eye,
    id: "previews",
    label: "Recipient previews",
    meta: "3 private invitations · package fingerprint matches",
    status: "ready",
  },
  {
    icon: ClipboardCheck,
    id: "release",
    label: "Release readiness",
    meta: "0 blockers · 2 acknowledged warnings",
    status: "ready",
  },
];

function ControlLedgerRow({
  comments,
  detail,
  expanded,
  kind,
  onPreview,
  onToggle,
  recipients,
  row,
  selected,
  setComments,
  setRecipients,
  setSelected,
}: {
  comments: string;
  detail: ProductionBuildDetail;
  expanded: boolean;
  kind: QuoteKind;
  onPreview: () => void;
  onToggle: () => void;
  recipients: Recipient[];
  row: (typeof LEDGER_ROWS)[number];
  selected: string[];
  setComments: Dispatch<SetStateAction<string>>;
  setRecipients: Dispatch<SetStateAction<Recipient[]>>;
  setSelected: Dispatch<SetStateAction<string[]>>;
}) {
  const Icon = row.icon;

  return (
    <Card className={cn(expanded && "border-primary/35")}>
      <Card
        aria-expanded={expanded}
        className="cursor-pointer rounded-b-none border-0 shadow-none before:hidden"
        onClick={onToggle}
        render={<button type="button" />}
      >
        <CardPanel className="flex items-center gap-3 p-3 sm:p-4">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              row.status === "ready"
                ? "bg-success/10 text-success-foreground"
                : "bg-warning/10 text-warning-foreground"
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-semibold text-sm">{row.label}</span>
            <span className="block truncate text-muted-foreground text-xs">
              {row.meta}
            </span>
          </span>
          <Badge variant={row.status === "ready" ? "success" : "warning"}>
            {row.status === "ready" ? "Ready" : "Warning"}
          </Badge>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </CardPanel>
      </Card>
      {expanded ? (
        <CardPanel className="border-t bg-muted/25 p-3 sm:p-5">
          {row.id === "scope" ? (
            <ScopeSelector
              detail={detail}
              kind={kind}
              selected={selected}
              setSelected={setSelected}
            />
          ) : null}
          {row.id === "disclosures" ? <DisclosureProof /> : null}
          {row.id === "recipients" ? (
            <RecipientEditor
              recipients={recipients}
              setRecipients={setRecipients}
            />
          ) : null}
          {row.id === "response" ? (
            <ResponseBuilder comments={comments} setComments={setComments} />
          ) : null}
          {row.id === "timing" ? <TimingEditor /> : null}
          {row.id === "previews" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {recipients.map((recipient) => (
                <Card
                  className="cursor-pointer"
                  key={recipient.id}
                  onClick={onPreview}
                  render={<button type="button" />}
                >
                  <CardPanel className="p-3 text-left">
                    <p className="truncate font-medium text-sm">
                      {recipient.name}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      Private · package 9B7E-14A2
                    </p>
                    <Badge className="mt-2" variant="success">
                      Previewed
                    </Badge>
                  </CardPanel>
                </Card>
              ))}
            </div>
          ) : null}
          {row.id === "release" ? (
            <ReleaseManifest
              kind={kind}
              recipients={recipients.length}
              scope={selected.length}
            />
          ) : null}
        </CardPanel>
      ) : null}
    </Card>
  );
}

function ControlLedgerVariant({
  detail,
  onExit,
}: {
  detail: ProductionBuildDetail;
  onExit: () => void;
}) {
  const [kind, setKind] = useState<QuoteKind>("labour");
  const [open, setOpen] = useState<LedgerSection | null>("scope");
  const [selected, setSelected] = useState(
    buildScopeItems(detail, "labour")
      .slice(0, 4)
      .map((item) => item.id)
  );
  const [recipients, setRecipients] = useState(INITIAL_RECIPIENTS);
  const [comments, setComments] = useState(
    "<p>Explain anything not captured above.</p>"
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const changeKind = (value: QuoteKind) => {
    setKind(value);
    setSelected(
      buildScopeItems(detail, value)
        .slice(0, 3)
        .map((item) => item.id)
    );
  };

  return (
    <div className="min-h-screen bg-muted/25 pb-28">
      <ComposerHeader
        detail={detail}
        kind={kind}
        onExit={onExit}
        title="Procurement Control Ledger"
      />
      <div className="sticky top-16 z-20 border-b bg-background/96 px-3 py-2 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto">
          <CommandMetric label="Scope" value={`${selected.length} lines`} />
          <CommandMetric
            label="Recipients"
            value={`${recipients.length} · 1 new`}
          />
          <CommandMetric label="Form" value="10 configured" />
          <CommandMetric label="Timing" value="Aug 18 → Aug 25" />
          <Badge className="ml-auto" variant="warning">
            2 warnings
          </Badge>
          <Button onClick={() => setOpen("scope")} size="sm" variant="outline">
            Resolve next
          </Button>
        </div>
      </div>
      <main className="mx-auto max-w-6xl p-3 sm:p-5">
        <Frame>
          <FrameHeader className="gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <FrameTitle className="text-base">Release readiness</FrameTitle>
                <FrameDescription>
                  Clear the procurement package for private publication in any
                  order.
                </FrameDescription>
              </div>
              <KindToggle kind={kind} onChange={changeKind} />
            </div>
          </FrameHeader>
          <FramePanel className="space-y-2 p-2 sm:p-3">
            {LEDGER_ROWS.map((row) => (
              <ControlLedgerRow
                comments={comments}
                detail={detail}
                expanded={open === row.id}
                key={row.id}
                kind={kind}
                onPreview={() => setPreviewOpen(true)}
                onToggle={() => setOpen(open === row.id ? null : row.id)}
                recipients={recipients}
                row={row}
                selected={selected}
                setComments={setComments}
                setRecipients={setRecipients}
                setSelected={setSelected}
              />
            ))}
          </FramePanel>
        </Frame>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/96 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <Button onClick={() => setPreviewOpen(true)} variant="outline">
            <Eye />
            Inspect package
          </Button>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-medium text-xs">Ready with 2 warnings</p>
            <p className="hidden text-[10px] text-muted-foreground sm:block">
              All atomic scope and disclosure gates pass
            </p>
          </div>
          <Button onClick={() => setSimulated(true)}>
            <Send />
            Simulate send to {recipients.length}
          </Button>
        </div>
      </div>
      {previewOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-3 backdrop-blur sm:p-6">
          <div className="mx-auto mb-3 flex max-w-xl items-center justify-between">
            <div>
              <p className="font-semibold text-sm">
                Private invitation preview
              </p>
              <p className="text-muted-foreground text-xs">Ironwood Framing</p>
            </div>
            <Button
              aria-label="Close preview"
              onClick={() => setPreviewOpen(false)}
              size="icon"
            >
              <X />
            </Button>
          </div>
          <RecipientPreview
            detail={detail}
            kind={kind}
            recipient={recipients[0] ?? INITIAL_RECIPIENTS[0]}
            selectedCount={selected.length}
          />
        </div>
      ) : null}
      {simulated ? (
        <div className="fixed right-3 bottom-20 z-40 w-[min(24rem,calc(100vw-1.5rem))]">
          <SimulationReceipt
            count={recipients.length}
            onDismiss={() => setSimulated(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function CommandMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-fit rounded-lg border bg-background px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="font-semibold text-xs">{value}</p>
    </div>
  );
}

function ReleaseManifest({
  kind,
  recipients,
  scope,
}: {
  kind: QuoteKind;
  recipients: number;
  scope: number;
}) {
  const items = [
    ["Package", `${kind === "labour" ? "Labour" : "Material"} · baseline v14`],
    ["Atomic scope", `${scope} required pricing lines`],
    ["Disclosures", "Permit, address, map, dates, specifications, attachments"],
    ["Recipients", `${recipients} private invitations · 1 provisional profile`],
    ["Response", "4 custom fields · title/amount lines · TipTap comments"],
    ["Access", "Due Aug 18 · read-only until Aug 25"],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="rounded-xl border bg-background p-3" key={label}>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="mt-1 font-medium text-sm">{value}</p>
        </div>
      ))}
      <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 p-3 sm:col-span-2">
        <AlertTriangle className="mt-0.5 size-4 text-warning-foreground" />
        <div>
          <p className="font-medium text-sm">2 warnings acknowledged</p>
          <p className="text-muted-foreground text-xs">
            One schedule gap and one unconfirmed trade capability. Neither
            changes the atomic package.
          </p>
        </div>
      </div>
    </div>
  );
}

function SimulationReceipt({
  count,
  onDismiss,
}: {
  count: number;
  onDismiss?: () => void;
}) {
  return (
    <Card className="border-success/35 bg-background shadow-xl">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-success/10 text-success-foreground">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Simulation complete</CardTitle>
            <CardDescription>
              No data, profile, invitation, or email was created.
            </CardDescription>
          </div>
          {onDismiss ? (
            <Button
              aria-label="Dismiss simulation"
              onClick={onDismiss}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardPanel className="space-y-2 p-4 pt-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Quote Package Revision</span>
          <span className="font-medium">v1 · 9B7E-14A2</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Private invitations</span>
          <span className="font-medium">{count}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Response deadline</span>
          <span className="font-medium">Aug 18, 5:00 PM</span>
        </div>
      </CardPanel>
      <CardFooter className="p-4 pt-2">
        <Badge variant="success">
          <ShieldCheck />
          Prototype only
        </Badge>
      </CardFooter>
    </Card>
  );
}

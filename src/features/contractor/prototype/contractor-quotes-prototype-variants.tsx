import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  FileText,
  Layers3,
  MapPin,
  PackageOpen,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  BuildGroup,
  ContractorQuotesPrototypeMode,
  PanelState,
  QuoteRequest,
  QuoteRow,
} from "./contractor-quotes-prototype-types.ts";
import {
  actionLabel,
  StatusBadge,
} from "./contractor-quotes-prototype-status.tsx";
import type { ContractorQuotesPrototypeVariant } from "./ContractorQuotesWorkspacePrototype.tsx";

export { BuildScopeLedger, ScopeMatrix } from "./contractor-quotes-prototype-scope.tsx";
export {
  actionLabel,
  StatusBadge,
  statusLabel,
} from "./contractor-quotes-prototype-status.tsx";

const variantMeta: Record<
  ContractorQuotesPrototypeVariant,
  { label: string; description: string }
> = {
  A: {
    label: "Split Workbench",
    description: "Hierarchy and selected quote context in one desktop surface.",
  },
  B: {
    label: "Build Ledger",
    description: "Build → request → Sub-milestone as the visual system.",
  },
  C: {
    label: "Opportunity Queue",
    description: "The next useful quote action leads the page.",
  },
  D: {
    label: "Deadline Board",
    description: "Time windows turn response work into a daily dispatch.",
  },
  E: {
    label: "Package Dossier",
    description: "One build package, one selected Sub-milestone, one handoff.",
  },
  F: {
    label: "Scope Matrix",
    description: "Labour and materials stay visible as separate response lanes.",
  },
  J: {
    label: "Build Scope Ledger",
    description:
      "Build context, quote basis, and the next action share one expanded row.",
  },
};

export function PackageDossier({
  builds,
  mode,
  onOpenPanel,
  onSelect,
  selectedBuild,
  selectedQuote,
  selectedRequest,
}: {
  builds: BuildGroup[];
  mode: ContractorQuotesPrototypeMode;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedBuild?: BuildGroup;
  selectedQuote?: QuoteRow;
  selectedRequest?: QuoteRequest;
}) {
  const build = selectedBuild ?? builds[0];
  const rows = build?.quoteRequests.flatMap((request) => request.rows) ?? [];
  const request =
    selectedRequest ??
    build?.quoteRequests.find((candidate) =>
      candidate.rows.some((row) => row.id === selectedQuote?.id)
    ) ??
    build?.quoteRequests[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
      <Frame className="h-fit xl:sticky xl:top-6">
        <FramePanel className="p-0">
          <FrameHeader>
            <FrameTitle>Build package</FrameTitle>
            <FrameDescription>
              Read the issued context once, then choose the exact scope.
            </FrameDescription>
          </FrameHeader>
          {build ? (
            <>
              <div className="border-y bg-muted/35 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-lg tracking-[-0.02em]">
                      {build.name}
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs leading-relaxed">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {build.address} · {build.city}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-background px-3 py-2">
                    <p className="text-muted-foreground">Permit</p>
                    <p className="mt-0.5 font-medium">{build.permit ?? "Issued package"}</p>
                  </div>
                  <div className="rounded-lg bg-background px-3 py-2">
                    <p className="text-muted-foreground">Scopes in package</p>
                    <p className="mt-0.5 font-medium">{rows.length} Sub-milestones</p>
                  </div>
                </div>
              </div>
              <div className="px-3 py-3">
                <p className="px-2 pb-2 font-semibold text-xs uppercase tracking-[0.12em]">
                  {request?.title ?? "Quote request"}
                </p>
                <div className="space-y-1">
                  {rows.map((quote) => (
                    <button
                      aria-current={quote.id === selectedQuote?.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        quote.id === selectedQuote?.id && "bg-primary/8"
                      )}
                      key={quote.id}
                      onClick={() => onSelect(quote)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full text-xs",
                          quote.id === selectedQuote?.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <FileText className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-sm">
                          {quote.name}
                        </span>
                        <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                          {quote.deadlineLabel}
                        </span>
                      </span>
                      <StatusBadge status={quote.status} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-5 text-muted-foreground text-sm">No package selected.</div>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-0">
          {selectedQuote ? (
            <>
              <FrameHeader className="flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <FrameTitle>{selectedQuote.name}</FrameTitle>
                  <FrameDescription>
                    {selectedRequest?.title ?? "Quote request"} · {selectedQuote.deadline}
                  </FrameDescription>
                </div>
                <StatusBadge status={selectedQuote.status} />
              </FrameHeader>
              <div className="border-y bg-muted/35 px-5 py-5 sm:px-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-semibold text-3xl tracking-[-0.04em]">
                      {selectedQuote.amount ?? "Quote in progress"}
                    </p>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {mode === "public"
                        ? "Your response will be private to the publisher."
                        : "Your current response for this exact scope."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <CalendarDays className="size-4 text-primary" />
                    {selectedQuote.status === "offer"
                      ? `Offer expires ${selectedQuote.offerExpires ?? "Aug 18, 2026"}`
                      : `Response due ${selectedQuote.deadline}`}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
                <Card className="p-4">
                  <p className="font-semibold text-sm">Scope</p>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    {selectedQuote.scopePreview}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="font-semibold text-sm">Materials</p>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    {selectedQuote.materialsPreview}
                  </p>
                </Card>
              </div>
              {selectedQuote.status === "stale" ? (
                <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm sm:mx-7">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium">Plan changed after submission</p>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                      {selectedQuote.staleReason}. The quote remains visible while you compare the historical plan.
                    </p>
                    <Button
                      className="mt-3"
                      onClick={() => onOpenPanel("snapshot", selectedQuote)}
                      size="xs"
                      variant="outline"
                    >
                      View plan snapshot
                    </Button>
                  </div>
                </div>
              ) : null}
              <FrameFooter className="flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                  <Layers3 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    {mode === "public"
                      ? "Shared package context only. Your draft and response stay private."
                      : "The canonical response surface remains QuoteFieldLedger."}
                  </span>
                </div>
                <Button
                  onClick={() =>
                    onOpenPanel(
                      selectedQuote.status === "offer" ? "offer" : "workspace",
                      selectedQuote
                    )
                  }
                >
                  {selectedQuote.status === "offer"
                    ? "Review work offer"
                    : mode === "public"
                      ? "Start private quote"
                      : actionLabel(selectedQuote.status)}
                  <ArrowUpRight />
                </Button>
              </FrameFooter>
            </>
          ) : (
            <div className="grid min-h-[460px] place-items-center p-7 text-center">
              <div>
                <PackageOpen className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-3 font-medium text-sm">Choose a Sub-milestone</p>
                <p className="mt-1 text-muted-foreground text-xs">The package dossier will open here.</p>
              </div>
            </div>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}

export function PrototypePanel({
  build,
  onClose,
  panel,
  quote,
  request,
}: {
  build?: BuildGroup;
  onClose: () => void;
  panel: NonNullable<PanelState>;
  quote?: QuoteRow;
  request?: QuoteRequest;
}) {
  if (!quote) {
    return null;
  }
  const isSnapshot = panel.kind === "snapshot";
  const isOffer = panel.kind === "offer";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/18 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <button aria-label="Close prototype panel" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div aria-label={isSnapshot ? "Plan snapshot" : isOffer ? "Work offer" : "Quote workspace"} className="relative z-10 max-h-[min(760px,calc(100svh-2rem))] w-full max-w-3xl overflow-auto rounded-t-3xl border bg-background shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/82 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="font-semibold text-sm">{isSnapshot ? "Submission-time plan snapshot" : isOffer ? "Quote Work Offer" : "QuoteFieldLedger handoff"}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">{quote.name} · {build?.name}</p>
          </div>
          <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="ghost"><X /></Button>
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          {isSnapshot ? <SnapshotContent quote={quote} /> : null}
          {isOffer ? <OfferContent onClose={onClose} quote={quote} /> : null}
          {!isSnapshot && !isOffer ? <WorkspaceContent build={build} quote={quote} request={request} /> : null}
        </div>
      </div>
    </div>
  );
}

function SnapshotContent({ quote }: { quote: QuoteRow }) {
  return (
    <>
      <div className="rounded-2xl border border-warning/30 bg-warning/8 p-4">
        <div className="flex gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Stale does not mean unusable</p>
            <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
              The Sub-milestone changed after this quote was submitted. Compare the states, then decide whether the quote still applies. Budget and roadmap state are not changed here.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlanColumn label="When quote was submitted" tone="muted" values={[`${quote.name} scope`, "Start Aug 24, 2026", "Duration 7 days", "Opening plan A4.01", `Quoted ${quote.amount ?? "amount pending"}`]} />
        <PlanColumn label="Current Sub-milestone plan" tone="primary" values={["Windows & doors scope", "Start Aug 26, 2026", "Duration 8 days", "Opening plan A4.02"]} />
      </div>
      <Button className="w-full sm:w-auto" variant="outline">Open full plan context <ArrowUpRight /></Button>
    </>
  );
}

function OfferContent({ onClose, quote }: { onClose: () => void; quote: QuoteRow }) {
  return (
    <>
      <div>
        <p className="font-semibold text-2xl tracking-[-0.03em]">Your work offer</p>
        <p className="mt-1 text-muted-foreground text-sm">The publishing team accepted this quote for the exact Sub-milestone scope.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoStat icon={<Wrench />} label="Scope" value="HVAC equipment" />
        <InfoStat icon={<CalendarDays />} label="Offer expires" value={quote.offerExpires ?? "Aug 18, 2026"} />
        <InfoStat icon={<CircleCheck />} label="Quoted amount" value={quote.amount ?? "$24,900"} />
      </div>
      <div className="rounded-2xl bg-muted/55 p-4 text-sm leading-relaxed">
        Accepting this offer activates your assignment for this exact Sub-milestone. You can still review the assignment acknowledgement and request clarification afterward.
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} variant="outline">Keep reviewing</Button>
        <Button onClick={onClose}>Accept work offer <Check /></Button>
      </div>
    </>
  );
}

function WorkspaceContent({
  build,
  quote,
  request,
}: {
  build?: BuildGroup;
  quote: QuoteRow;
  request?: QuoteRequest;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-2xl tracking-[-0.03em]">QuoteFieldLedger handoff</p>
          <p className="mt-1 text-muted-foreground text-sm">The response workspace remains one canonical surface.</p>
        </div>
        <Badge variant="info"><FileText /> Prototype route</Badge>
      </div>
      <div className="rounded-2xl border bg-muted/35 p-4">
        <p className="font-medium text-sm">{quote.name}</p>
        <p className="mt-1 text-muted-foreground text-xs">{build?.name} · {build?.address}</p>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="font-medium text-xs uppercase tracking-[0.12em]">Labour</p><p className="mt-1 text-muted-foreground text-sm">Enter or review line-item labour amounts.</p></div>
          <div><p className="font-medium text-xs uppercase tracking-[0.12em]">Materials</p><p className="mt-1 text-muted-foreground text-sm">Enter or review material lines and delivery context.</p></div>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-medium text-sm">Open the real response surface</p><p className="mt-1 text-muted-foreground text-xs">{request?.title} · deadline {quote.deadline}</p></div>
        <Button>Open Field Ledger <ArrowUpRight /></Button>
      </div>
    </>
  );
}

function PlanColumn({ label, tone, values }: { label: string; tone: "muted" | "primary"; values: string[] }) {
  return (
    <div className={cn("rounded-2xl border p-4", tone === "primary" ? "border-primary/25 bg-primary/5" : "bg-muted/45")}>
      <p className="font-medium text-xs uppercase tracking-[0.12em]">{label}</p>
      <ul className="mt-3 space-y-2 text-muted-foreground text-sm">
        {values.map((value) => <li className="flex gap-2" key={value}><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone === "primary" ? "bg-primary" : "bg-muted-foreground/50")} />{value}</li>)}
      </ul>
    </div>
  );
}

export function RailItem({ active, icon, label, tone, value }: { active?: boolean; icon: ReactNode; label: string; tone?: "warning"; value: string }) {
  return (
    <button className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted", active && "bg-primary/8 font-medium text-primary")} type="button">
      <span className={cn("text-muted-foreground", tone === "warning" && "text-warning")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">{value}</span>
    </button>
  );
}

export function InfoStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/45 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-[0.08em]">{icon}<span className="truncate">{label}</span></div>
      <p className="mt-1 truncate font-medium text-sm">{value}</p>
    </div>
  );
}

export function MetricCard({ icon, label, tone, value }: { icon: ReactNode; label: string; tone?: "warning"; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><span className={cn("text-primary", tone === "warning" && "text-warning")}>{icon}</span>{label}</div>
      <p className="mt-3 font-semibold text-2xl tracking-[-0.03em]">{value}</p>
    </Card>
  );
}

export function PulseItem({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className={cn("size-2 rounded-full", color)} /><span className="flex-1 text-muted-foreground text-sm">{label}</span><span className="font-semibold text-sm">{value}</span></div>;
}

export function PrototypeSwitcher({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: ContractorQuotesPrototypeVariant) => void;
  variant: ContractorQuotesPrototypeVariant;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const variants: ContractorQuotesPrototypeVariant[] = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "J",
      ];
      const currentIndex = variants.indexOf(variant);
      const nextIndex = event.key === "ArrowRight"
        ? (currentIndex + 1) % variants.length
        : (currentIndex - 1 + variants.length) % variants.length;
      onVariantChange(variants[nextIndex]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onVariantChange, variant]);

  if (import.meta.env.PROD) {
    return null;
  }

  const variants: ContractorQuotesPrototypeVariant[] = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "J",
  ];
  const currentIndex = variants.indexOf(variant);
  const move = (direction: -1 | 1) => {
    onVariantChange(variants[(currentIndex + direction + variants.length) % variants.length]);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" data-prototype-only="true">
      <div className="flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <button aria-label="Previous prototype variant" className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background" onClick={() => move(-1)} type="button"><ArrowLeft className="size-4" /></button>
        <div className="min-w-[170px] px-3 text-center">
          <p className="font-semibold text-xs">{variant} — {variantMeta[variant].label}</p>
          <p className="hidden text-background/65 text-xs sm:block">{variantMeta[variant].description}</p>
        </div>
        <button aria-label="Next prototype variant" className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background" onClick={() => move(1)} type="button"><ArrowRight className="size-4" /></button>
      </div>
    </div>
  );
}

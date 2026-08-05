import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileCheck2,
  Layers3,
  LockKeyhole,
  ReceiptText,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import type { QuoteRoundMode, QuoteRoundStep } from "./QuoteRoundComposer.tsx";

const STAGES: Array<{
  icon: typeof Layers3;
  id: QuoteRoundStep;
  label: string;
}> = [
  { icon: Layers3, id: "scope", label: "Scope" },
  { icon: FileCheck2, id: "package", label: "Package" },
  { icon: Users, id: "recipients", label: "Recipients" },
  { icon: ReceiptText, id: "response", label: "Response" },
  { icon: Send, id: "dispatch", label: "Dispatch" },
];

function quoteRoundModeMeta(mode: QuoteRoundMode) {
  switch (mode) {
    case "labour":
      return { label: "Labour", variant: "info" as const };
    case "materials":
      return { label: "Materials", variant: "warning" as const };
    case "mixed":
      return { label: "Labour + Materials", variant: "secondary" as const };
  }
}

export function previousQuoteRoundStage(stageIndex: number): QuoteRoundStep {
  return STAGES[Math.max(0, stageIndex - 1)]?.id ?? "scope";
}

export function quoteRoundStageLabel(stageIndex: number) {
  return STAGES[stageIndex]?.label ?? "Scope";
}

export function QuoteRoundComposerHeader({
  buildName,
  mode,
  onExit,
  revision,
  title,
}: {
  buildName: string;
  mode: QuoteRoundMode;
  onExit: () => void;
  revision: number;
  title: string;
}) {
  const modeMeta = quoteRoundModeMeta(mode);
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/96 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1800px] items-center gap-3 px-3 sm:px-5">
          <Button
            aria-label="Return to Build Quotes"
            onClick={onExit}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-semibold text-sm">
                {title || "New Quote Round"}
              </p>
              <Badge variant={modeMeta.variant}>{modeMeta.label}</Badge>
            </div>
            <p className="truncate text-muted-foreground text-xs">
              {buildName} · Active Build · draft revision {revision}
            </p>
          </div>
          <Badge className="hidden sm:inline-flex" variant="outline">
            <LockKeyhole />
            Draft
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
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/35 px-4 py-2 text-xs"
        data-testid="quote-package-tape"
      >
        <span className="font-semibold uppercase tracking-wide">
          {modeMeta.label} scope package
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-success-foreground">
          <ShieldCheck className="size-3.5" />
          Auditable draft
        </span>
      </div>
    </>
  );
}

export function QuoteRoundStageNavigation({
  onStageChange,
  stage,
  stageIndex,
}: {
  onStageChange: (stage: QuoteRoundStep) => void;
  stage: QuoteRoundStep;
  stageIndex: number;
}) {
  return (
    <>
      <Frame className="hidden self-start xl:flex">
        <FrameHeader>
          <FrameTitle>Publish package</FrameTitle>
          <FrameDescription>
            One controlled decision at a time.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-1 p-2">
          {STAGES.map((item, index) => {
            const Icon = item.icon;
            const active = item.id === stage;
            return (
              <Button
                aria-current={active ? "step" : undefined}
                className="w-full justify-start"
                key={item.id}
                onClick={() => onStageChange(item.id)}
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
      <nav
        aria-label="Quote Round steps"
        className="min-w-0 max-w-full overflow-hidden xl:hidden"
        data-testid="quote-mobile-steps"
      >
        <div className="flex gap-1 overflow-x-auto pb-1">
          {STAGES.map((item, index) => (
            <Button
              aria-current={item.id === stage ? "step" : undefined}
              className="min-w-fit"
              key={item.id}
              onClick={() => onStageChange(item.id)}
              size="sm"
              variant={item.id === stage ? "default" : "outline"}
            >
              {index + 1}. {item.label}
            </Button>
          ))}
        </div>
      </nav>
    </>
  );
}

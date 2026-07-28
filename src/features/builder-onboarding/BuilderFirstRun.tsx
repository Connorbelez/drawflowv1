import { useMutation } from "convex/react";
import {
  ArrowRight,
  Check,
  FileText,
  Map as MapIcon,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";

import { api } from "../../../convex/_generated/api";

interface BuilderFirstRunProps {
  builderName: string;
  onStart: () => void;
  workosOrganizationId: string;
}

const CHECKLIST: {
  body: string;
  icon: React.ReactNode;
  key: string;
  title: string;
}[] = [
  {
    body: "Your account is provisioned and your workspace is live.",
    icon: <Check className="size-4" />,
    key: "account",
    title: "Account ready",
  },
  {
    body: "Tell us the build: location, permits, budget, and milestones.",
    icon: <FileText className="size-4" />,
    key: "details",
    title: "Add your build details",
  },
  {
    body: "We model Cheapest Feasible, Fastest, and Capital-Constrained draw plans.",
    icon: <RouteIcon className="size-4" />,
    key: "plans",
    title: "See your draw plans",
  },
];

export function BuilderFirstRun({
  builderName,
  onStart,
  workosOrganizationId,
}: BuilderFirstRunProps): React.ReactElement {
  const dismiss = useMutation(
    api.production_proposals.dismissBuilderOnboarding
  );
  const [dismissing, setDismissing] = useState(false);

  async function handleSkip(): Promise<void> {
    setDismissing(true);
    try {
      await dismiss({ workosOrganizationId });
    } finally {
      // Reveal the dashboard regardless; the dismissal is best-effort persistent.
      onStart();
    }
  }

  return (
    <main className="grid min-h-[calc(100svh-1rem)] place-items-center bg-[radial-gradient(circle_at_85%_-10%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_36rem),var(--bg-base)] px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <Frame>
          <FramePanel className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/16 px-2.5 py-1 font-medium text-[color:var(--primary-foreground)] text-xs">
                <Sparkles className="size-3.5" />
                Welcome to DrawFlow
              </span>
              <FrameTitle className="text-pretty text-2xl leading-tight sm:text-3xl">
                Plan your first draw, {builderName}
              </FrameTitle>
              <FrameDescription className="max-w-[58ch] text-base">
                DrawFlow turns your construction roadmap into reimbursement draw
                plans you can finance against. Add one build and you&rsquo;ll
                see exactly when each draw becomes available, and what it costs.
              </FrameDescription>
            </div>

            <ol className="flex flex-col gap-2.5">
              {CHECKLIST.map((item, index) => {
                const isActive = index === 1;
                const isDone = index === 0;
                return (
                  <li
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/[0.06]"
                        : "border-border bg-muted/40"
                    )}
                    key={item.key}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border",
                        isDone &&
                          "border-success/40 bg-success/16 text-success-foreground",
                        isActive &&
                          "border-primary bg-primary text-[color:var(--primary-foreground)]",
                        !(isDone || isActive) &&
                          "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {item.icon}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {item.title}
                        </span>
                        {isDone ? (
                          <span className="text-success-foreground text-xs">
                            Done
                          </span>
                        ) : null}
                        {isActive ? (
                          <span className="text-[color:var(--primary-foreground)] text-xs">
                            Next
                          </span>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground text-sm leading-snug">
                        {item.body}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                disabled={dismissing}
                onClick={() => void handleSkip()}
                variant="ghost"
              >
                I&rsquo;ll explore on my own
              </Button>
              <Button onClick={onStart} size="lg">
                <MapIcon />
                Start my first build
                <ArrowRight />
              </Button>
            </div>
          </FramePanel>
        </Frame>

        <p className="px-1 text-center text-muted-foreground text-xs">
          Reimbursement-based draws. You complete work, upload evidence, and
          DrawFlow tracks when each draw is ready to release.
        </p>
      </div>
    </main>
  );
}

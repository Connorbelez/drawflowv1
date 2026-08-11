"use client";

import { Camera, CheckCircle2, ClipboardCheck, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "#/components/ui/item.tsx";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from "#/components/ui/progress.tsx";
import { Spinner } from "#/components/ui/spinner.tsx";
import {
  hasMeaningfulTipTapContent,
  normalizeGuidance,
  type SubmilestoneFieldGuidance,
  SubmilestoneFieldGuidanceEditor,
} from "#/features/submilestone-guidance/SubmilestoneFieldGuidanceEditor.tsx";

export interface SiteVisitGuidance {
  cameraAngles: string;
  whatToVerify: string;
}

export interface SiteVisitScopeItem {
  _id?: string;
  fieldGuidance?: Partial<SubmilestoneFieldGuidance> | null;
  key: string;
  name: string;
  proposalSubmilestoneId?: string;
}

export interface SiteVisitSubmilestoneGuidanceSection {
  buildSubmilestoneId: string;
  cameraAnglesTiptapJson: string;
  proposalSubmilestoneId: string;
  whatToVerifyTiptapJson: string;
}

export interface SiteVisitGuidanceGenerationInput {
  build: {
    location?: string;
    name: string;
  };
  currentGuidance: SiteVisitGuidance;
  milestone: SiteVisitScopeItem;
  submilestones: SiteVisitScopeItem[];
}

export interface SiteVisitGuidanceGenerationResult extends SiteVisitGuidance {
  source?: "fallback" | "openai" | "openrouter";
}

export interface SiteVisitOrderConfirmation {
  milestoneKey: string;
  note?: string;
  requestedDay?: number;
  requestedTime?: string;
  siteVisitGuidance: SiteVisitGuidance;
  submilestoneGuidanceSections: SiteVisitSubmilestoneGuidanceSection[];
  submilestoneKeys: string[];
}

export interface SiteVisitOrderRequest {
  milestoneKey: string;
  note?: string;
  requestedDay?: number;
  requestedTime?: string;
}

type GuidanceGenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | {
      source?: SiteVisitGuidanceGenerationResult["source"];
      status: "generated";
    }
  | { status: "error" };

export function SiteVisitOrderDialog({
  build,
  milestone,
  onConfirm,
  onGenerate,
  onOpenChange,
  open,
  request,
  submilestones,
}: {
  build: SiteVisitGuidanceGenerationInput["build"];
  milestone:
    | (SiteVisitScopeItem & {
        siteVisitGuidance?: SiteVisitGuidance;
      })
    | null;
  onConfirm: (input: SiteVisitOrderConfirmation) => Promise<unknown> | unknown;
  onGenerate?: (
    input: SiteVisitGuidanceGenerationInput
  ) => Promise<SiteVisitGuidanceGenerationResult>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  request: SiteVisitOrderRequest | null;
  submilestones: SiteVisitScopeItem[];
}) {
  const [guidance, setGuidance] = useState<SiteVisitGuidance>(() =>
    initialGuidance(milestone)
  );
  const [submilestoneGuidance, setSubmilestoneGuidance] = useState<
    Record<string, SubmilestoneFieldGuidance>
  >(() => initialSubmilestoneGuidance(submilestones));
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "generate" | null
  >(null);
  const [generationState, setGenerationState] =
    useState<GuidanceGenerationState>({ status: "idle" });
  const [error, setError] = useState("");

  // The parent rebuilds submilestone arrays on every detail projection render.
  // Reset only when the dialog opens or its selected milestone changes so
  // local edits survive unrelated parent updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional local draft boundary.
  useEffect(() => {
    if (!open) {
      return;
    }
    setGuidance(initialGuidance(milestone));
    setSubmilestoneGuidance(initialSubmilestoneGuidance(submilestones));
    setPendingAction(null);
    setGenerationState({ status: "idle" });
    setError("");
  }, [milestone, open]);

  const generate = async () => {
    if (!(milestone && onGenerate) || pendingAction) {
      return;
    }
    setPendingAction("generate");
    setGenerationState({ status: "generating" });
    setError("");
    try {
      const generated = await onGenerate({
        build,
        currentGuidance: guidance,
        milestone: { key: milestone.key, name: milestone.name },
        submilestones: submilestones.map(({ key, name }) => ({ key, name })),
      });
      setGuidance({
        cameraAngles: generated.cameraAngles,
        whatToVerify: generated.whatToVerify,
      });
      setGenerationState({
        source: generated.source,
        status: "generated",
      });
    } catch (cause) {
      setGenerationState({ status: "error" });
      setError(
        cause instanceof Error
          ? cause.message
          : "DrawFlow AI could not draft the field guidance."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const hasGenerated = generationState.status === "generated";
  const submilestoneGuidanceComplete = submilestones.every((item) =>
    guidanceIsComplete(submilestoneGuidance[itemIdentity(item)])
  );

  const confirm = async () => {
    if (
      !(milestone && request) ||
      pendingAction ||
      !submilestoneGuidanceComplete
    ) {
      return;
    }
    setPendingAction("confirm");
    setError("");
    try {
      await onConfirm({
        milestoneKey: milestone.key,
        ...(request.note ? { note: request.note } : {}),
        ...(request.requestedDay === undefined
          ? {}
          : { requestedDay: request.requestedDay }),
        ...(request.requestedTime
          ? { requestedTime: request.requestedTime }
          : {}),
        siteVisitGuidance: guidance,
        submilestoneGuidanceSections: submilestones.map((item) => {
          const buildSubmilestoneId = item._id;
          const proposalSubmilestoneId = item.proposalSubmilestoneId;
          if (!(buildSubmilestoneId && proposalSubmilestoneId)) {
            throw new Error(
              `Canonical Sub-milestone identity is unavailable for ${item.name}. Refresh and try again.`
            );
          }
          const pair = submilestoneGuidance[itemIdentity(item)];
          return {
            buildSubmilestoneId,
            cameraAnglesTiptapJson: pair?.cameraAnglesTiptapJson ?? "",
            proposalSubmilestoneId,
            whatToVerifyTiptapJson: pair?.whatToVerifyTiptapJson ?? "",
          };
        }),
        submilestoneKeys: submilestones.map((item) => item.key),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to order the site visit."
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="max-h-[calc(100svh-2rem)] max-w-4xl overflow-hidden">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pe-8">
            <div className="min-w-0">
              <DialogTitle>Configure site visit</DialogTitle>
              <DialogDescription className="mt-1">
                Confirm the inspection scope and field instructions before the
                visit link is created.
              </DialogDescription>
            </div>
            <Badge variant="warning">Not ordered yet</Badge>
          </div>
        </DialogHeader>
        <DialogPanel className="grid gap-5">
          <section
            aria-labelledby="site-visit-scope-title"
            className="border-y py-4"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" className="size-4" />
              <h3 className="font-semibold text-sm" id="site-visit-scope-title">
                Inspection scope
              </h3>
            </div>
            <p className="mt-2 font-semibold text-base">{milestone?.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {submilestones.map((item) => (
                <Badge key={item.key} variant="outline">
                  {item.name}
                </Badge>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="site-visit-submilestone-guidance-title"
            className="grid gap-4"
          >
            <div>
              <h3
                className="font-semibold text-sm"
                id="site-visit-submilestone-guidance-title"
              >
                Sub-milestone Field Guidance
              </h3>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Review the canonical verification checklist and recommended
                camera angles for each selected Sub-milestone. Both sections are
                required before this visit can be ordered.
              </p>
            </div>
            {submilestones.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Sub-milestones are selected. Visit-wide guidance below is
                optional.
              </p>
            ) : (
              submilestones.map((item) => {
                const identity = itemIdentity(item);
                return (
                  <div
                    className="grid gap-2 border-t pt-4"
                    data-testid={`site-visit-submilestone-guidance-row-${identity}`}
                    key={identity}
                  >
                    <h4 className="font-semibold text-sm">{item.name}</h4>
                    <SubmilestoneFieldGuidanceEditor
                      canEdit
                      disabled={pendingAction !== null}
                      guidance={submilestoneGuidance[identity]}
                      id={identity}
                      onDraftChange={(next) =>
                        setSubmilestoneGuidance((current) => ({
                          ...current,
                          [identity]: next,
                        }))
                      }
                      readOnly={false}
                      sectionTestId={`site-visit-submilestone-field-guidance-${identity}`}
                      subMilestoneName={item.name}
                      testIdPrefix="site-visit-submilestone"
                    />
                  </div>
                );
              })
            )}
          </section>

          <section
            aria-labelledby="site-visit-wide-guidance-title"
            className="grid gap-4 border-t pt-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  className="font-semibold text-sm"
                  id="site-visit-wide-guidance-title"
                >
                  Visit-wide guidance (optional)
                </h3>
                <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                  These extra instructions apply to the whole visit and are
                  separate from each Sub-milestone&apos;s canonical guidance.
                </p>
              </div>
              <Button
                disabled={!onGenerate || pendingAction !== null}
                loading={pendingAction === "generate"}
                onClick={generate}
                type="button"
                variant="outline"
              >
                <Sparkles aria-hidden="true" />
                {hasGenerated
                  ? "Rewrite with DrawFlow AI"
                  : "Write with DrawFlow AI"}
              </Button>
            </div>

            <GuidanceGenerationStatus
              generationState={generationState}
              milestoneName={milestone?.name}
              submilestoneCount={submilestones.length}
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="grid min-w-0 gap-2 text-sm">
                <span className="font-semibold">What to verify</span>
                <FieldRichTextEditor
                  ariaLabel="Visit-wide what to verify"
                  editable={pendingAction === null}
                  editorMinHeightClass="[&_.ProseMirror]:min-h-44"
                  onChange={(whatToVerify) =>
                    setGuidance((current) => ({ ...current, whatToVerify }))
                  }
                  placeholder="Add optional visit-wide verification context…"
                  value={guidance.whatToVerify}
                />
              </div>
              <div className="grid min-w-0 gap-2 text-sm">
                <span className="font-semibold">Required photo angles</span>
                <FieldRichTextEditor
                  ariaLabel="Visit-wide required photo angles"
                  editable={pendingAction === null}
                  editorMinHeightClass="[&_.ProseMirror]:min-h-44"
                  onChange={(cameraAngles) =>
                    setGuidance((current) => ({ ...current, cameraAngles }))
                  }
                  placeholder="Add optional visit-wide photo context…"
                  value={guidance.cameraAngles}
                />
              </div>
            </div>
          </section>

          {error ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-destructive text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button
            disabled={pendingAction !== null}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={pendingAction !== null || !submilestoneGuidanceComplete}
            loading={pendingAction === "confirm"}
            onClick={confirm}
            type="button"
          >
            <Camera aria-hidden="true" />
            Confirm and order site visit
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function GuidanceGenerationStatus({
  generationState,
  milestoneName,
  submilestoneCount,
}: {
  generationState: GuidanceGenerationState;
  milestoneName?: string;
  submilestoneCount: number;
}) {
  const isGenerating = generationState.status === "generating";
  const hasGenerated = generationState.status === "generated";
  const status = generationStatusCopy(
    generationState,
    milestoneName,
    submilestoneCount
  );
  const progressValue = isGenerating ? null : hasGenerated ? 100 : 0;
  const activeClassName = isGenerating
    ? "border-primary/20 bg-primary/5"
    : undefined;

  return (
    <div
      aria-busy={isGenerating}
      aria-live="polite"
      className="grid gap-3"
      data-testid="site-visit-ai-generation-status"
    >
      <Progress value={progressValue}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ProgressLabel className="flex items-center gap-2">
            <GenerationStateIcon generationState={generationState} />
            {status.title}
          </ProgressLabel>
          <Badge variant={status.badgeVariant}>{status.badge}</Badge>
        </div>
        <p className="text-muted-foreground text-xs">{status.description}</p>
        <ProgressTrack>
          <ProgressIndicator
            className={
              isGenerating
                ? "h-full w-2/5 animate-pulse motion-reduce:animate-none"
                : "h-full"
            }
          />
        </ProgressTrack>
      </Progress>

      <ItemGroup
        aria-label="AI generation targets"
        className="grid gap-2 sm:grid-cols-2"
      >
        <Item className={activeClassName} size="sm" variant="muted">
          <ItemMedia
            aria-hidden="true"
            className="size-8 rounded-md border bg-background"
            variant="icon"
          >
            <GenerationTargetIcon
              fallback={<ClipboardCheck />}
              generationState={generationState}
            />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Verification checklist</ItemTitle>
            <ItemDescription>
              What to verify for {milestoneName ?? "this milestone"}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item className={activeClassName} size="sm" variant="muted">
          <ItemMedia
            aria-hidden="true"
            className="size-8 rounded-md border bg-background"
            variant="icon"
          >
            <GenerationTargetIcon
              fallback={<Camera />}
              generationState={generationState}
            />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Required photo angles</ItemTitle>
            <ItemDescription>
              Wide, detail, and context coverage for the selected scope
            </ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}

function GenerationStateIcon({
  generationState,
}: {
  generationState: GuidanceGenerationState;
}) {
  if (generationState.status === "generating") {
    return (
      <Spinner className="size-4 text-primary motion-reduce:animate-none" />
    );
  }
  if (generationState.status === "generated") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className="size-4 text-success-foreground"
      />
    );
  }
  return <Sparkles aria-hidden="true" className="size-4" />;
}

function GenerationTargetIcon({
  fallback,
  generationState,
}: {
  fallback: ReactNode;
  generationState: GuidanceGenerationState;
}) {
  if (generationState.status === "generating") {
    return <Spinner className="text-primary motion-reduce:animate-none" />;
  }
  if (generationState.status === "generated") {
    return <CheckCircle2 className="text-success-foreground" />;
  }
  return fallback;
}

function generationStatusCopy(
  generationState: GuidanceGenerationState,
  milestoneName: string | undefined,
  submilestoneCount: number
) {
  const scope = `${milestoneName ?? "the milestone"} and ${formatScopeCount(
    submilestoneCount
  )}`;
  switch (generationState.status) {
    case "generating":
      return {
        badge: "Generating",
        badgeVariant: "info" as const,
        description: `Using ${scope} to draft both editable guidance sections.`,
        title: "Drafting field guidance",
      };
    case "generated":
      if (generationState.source === "fallback") {
        return {
          badge: "Field rules used",
          badgeVariant: "warning" as const,
          description:
            "The model provider was unavailable, so DrawFlow completed both sections with deterministic field rules. Review and edit before ordering.",
          title: "DrawFlow guidance ready",
        };
      }
      return {
        badge: "Draft ready",
        badgeVariant: "success" as const,
        description:
          "DrawFlow AI completed both sections. Review and edit the draft before ordering the site visit.",
        title: "AI draft ready",
      };
    case "error":
      return {
        badge: "Retry needed",
        badgeVariant: "error" as const,
        description:
          "No guidance was replaced. Review the error below and retry generation.",
        title: "Generation did not finish",
      };
    default:
      return {
        badge: "Ready to draft",
        badgeVariant: "outline" as const,
        description: `DrawFlow will use ${scope} to write both editable guidance sections.`,
        title: "AI generation targets",
      };
  }
}

function initialGuidance(
  milestone:
    | (SiteVisitScopeItem & {
        siteVisitGuidance?: SiteVisitGuidance;
      })
    | null
): SiteVisitGuidance {
  if (milestone?.siteVisitGuidance) {
    return milestone.siteVisitGuidance;
  }
  const name = milestone?.name ?? "Milestone";
  return {
    cameraAngles:
      "<ul><li>Wide shot of the requested scope.</li><li>Close-up of work quality and visible completion details.</li><li>Context photo tying the milestone to the build site.</li></ul>",
    whatToVerify: `<ul><li>${name} work appears complete enough for reimbursement review.</li><li>Evidence location and site context are visible.</li><li>Any exceptions or incomplete work are noted in the report.</li></ul>`,
  };
}

function initialSubmilestoneGuidance(
  submilestones: SiteVisitScopeItem[]
): Record<string, SubmilestoneFieldGuidance> {
  return Object.fromEntries(
    submilestones.map((item) => [
      itemIdentity(item),
      normalizeGuidance(item.fieldGuidance),
    ])
  );
}

function itemIdentity(item: SiteVisitScopeItem) {
  return item._id ?? item.key;
}

function guidanceIsComplete(guidance: SubmilestoneFieldGuidance | undefined) {
  return Boolean(
    guidance &&
      hasMeaningfulTipTapContent(guidance.cameraAnglesTiptapJson) &&
      hasMeaningfulTipTapContent(guidance.whatToVerifyTiptapJson)
  );
}

function formatScopeCount(submilestoneCount: number) {
  if (submilestoneCount === 0) {
    return "the milestone-wide scope";
  }
  return `${submilestoneCount} selected submilestone${
    submilestoneCount === 1 ? "" : "s"
  }`;
}

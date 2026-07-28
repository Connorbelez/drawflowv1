"use client";

import { Camera, ClipboardCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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

export interface SiteVisitGuidance {
  cameraAngles: string;
  whatToVerify: string;
}

export interface SiteVisitScopeItem {
  key: string;
  name: string;
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
  submilestoneKeys: string[];
}

export interface SiteVisitOrderRequest {
  milestoneKey: string;
  note?: string;
  requestedDay?: number;
  requestedTime?: string;
}

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
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "generate" | null
  >(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setGuidance(initialGuidance(milestone));
    setPendingAction(null);
    setError("");
  }, [milestone, open]);

  const generate = async () => {
    if (!(milestone && onGenerate) || pendingAction) {
      return;
    }
    setPendingAction("generate");
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "DrawFlow AI could not draft the field guidance."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const confirm = async () => {
    if (
      !(milestone && request) ||
      pendingAction ||
      !guidanceIsComplete(guidance)
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

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Field guidance</h3>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                These instructions appear in the field visit exactly as written.
              </p>
            </div>
            <Button
              disabled={!onGenerate || pendingAction !== null}
              loading={pendingAction === "generate"}
              onClick={() => void generate()}
              type="button"
              variant="outline"
            >
              <Sparkles aria-hidden="true" />
              Write with DrawFlow AI
            </Button>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm">
              <span className="font-semibold">What to verify</span>
              <FieldRichTextEditor
                ariaLabel="What to verify"
                editorMinHeightClass="[&_.ProseMirror]:min-h-44"
                onChange={(whatToVerify) =>
                  setGuidance((current) => ({ ...current, whatToVerify }))
                }
                placeholder="Add a concise verification checklist…"
                value={guidance.whatToVerify}
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm">
              <span className="font-semibold">Required photo angles</span>
              <FieldRichTextEditor
                ariaLabel="Required photo angles"
                editorMinHeightClass="[&_.ProseMirror]:min-h-44"
                onChange={(cameraAngles) =>
                  setGuidance((current) => ({ ...current, cameraAngles }))
                }
                placeholder="List the required wide, detail, and context views…"
                value={guidance.cameraAngles}
              />
            </label>
          </div>

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
            disabled={pendingAction !== null || !guidanceIsComplete(guidance)}
            loading={pendingAction === "confirm"}
            onClick={() => void confirm()}
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

function guidanceIsComplete(guidance: SiteVisitGuidance) {
  return Boolean(guidance.cameraAngles.trim() && guidance.whatToVerify.trim());
}

"use client";

import type { JSONContent } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

export interface SubmilestoneFieldGuidance {
  cameraAnglesTiptapJson: string;
  whatToVerifyTiptapJson: string;
}

export interface SubmilestoneFieldGuidanceEditorProps {
  /** Backoffice authoring capability. Route and role checks stay in the controller. */
  canEdit?: boolean;
  className?: string;
  /** The last saved canonical pair. Missing fields are treated as empty. */
  guidance?: Partial<SubmilestoneFieldGuidance> | null;
  /** The stable Build/Proposal Sub-milestone identity used for dirty state. */
  id: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSave?: (guidance: SubmilestoneFieldGuidance) => Promise<void> | void;
  readOnly?: boolean;
  rowName?: string;
  sectionTestId?: string;
  subMilestoneName: string;
  testIdPrefix?: string;
}

const EMPTY_GUIDANCE: SubmilestoneFieldGuidance = {
  cameraAnglesTiptapJson: "",
  whatToVerifyTiptapJson: "",
};

function normalizeGuidance(
  guidance?: Partial<SubmilestoneFieldGuidance> | null
): SubmilestoneFieldGuidance {
  return {
    cameraAnglesTiptapJson: guidance?.cameraAnglesTiptapJson ?? "",
    whatToVerifyTiptapJson: guidance?.whatToVerifyTiptapJson ?? "",
  };
}

function guidanceEqual(
  left: SubmilestoneFieldGuidance,
  right: SubmilestoneFieldGuidance
) {
  return (
    left.whatToVerifyTiptapJson === right.whatToVerifyTiptapJson &&
    left.cameraAnglesTiptapJson === right.cameraAnglesTiptapJson
  );
}

function parseEditorValue(value: string): string | JSONContent {
  if (!value.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(value) as JSONContent;
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    // Legacy worksheet values may be HTML. TipTap accepts that representation.
  }
  return value;
}

function stringifyDocument(document: JSONContent) {
  return JSON.stringify(document);
}

/**
 * Shared two-section Field Guidance state machine.
 *
 * Both editors update one local draft and one Save action persists the pair.
 * Controllers decide whether the viewer may edit; this component never
 * infers roles from the current identity.
 */
export function SubmilestoneFieldGuidanceEditor({
  canEdit = false,
  className,
  guidance,
  id,
  onDirtyChange,
  onSave,
  readOnly = false,
  rowName,
  sectionTestId,
  subMilestoneName,
  testIdPrefix = "submilestone-field-guidance",
}: SubmilestoneFieldGuidanceEditorProps) {
  const initialCameraAngles = guidance?.cameraAnglesTiptapJson ?? "";
  const initialWhatToVerify = guidance?.whatToVerifyTiptapJson ?? "";
  const initialGuidance = useMemo(
    () =>
      normalizeGuidance({
        cameraAnglesTiptapJson: initialCameraAngles,
        whatToVerifyTiptapJson: initialWhatToVerify,
      }),
    [initialCameraAngles, initialWhatToVerify]
  );
  const [guidanceDraft, setGuidanceDraft] = useState(initialGuidance);
  const [savedGuidance, setSavedGuidance] = useState(initialGuidance);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const guidanceIdentityRef = useRef(id);
  const guidanceCanonicalRef = useRef(initialGuidance);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const editable = Boolean(canEdit && !readOnly && onSave);
  const dirty = editable && !guidanceEqual(guidanceDraft, savedGuidance);

  useEffect(() => {
    if (guidanceIdentityRef.current !== id) {
      guidanceIdentityRef.current = id;
      guidanceCanonicalRef.current = initialGuidance;
      setGuidanceDraft(initialGuidance);
      setSavedGuidance(initialGuidance);
      setSaveError(null);
      return;
    }
    if (
      !(
        dirty ||
        saving ||
        guidanceEqual(guidanceCanonicalRef.current, initialGuidance)
      )
    ) {
      guidanceCanonicalRef.current = initialGuidance;
      setGuidanceDraft(initialGuidance);
      setSavedGuidance(initialGuidance);
      setSaveError(null);
    }
  }, [dirty, id, initialGuidance, saving]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  // The identity is a dirty-state namespace. Re-run this effect when the
  // namespace changes so a removed editor cannot leave its key set forever.
  // biome-ignore lint/correctness/useExhaustiveDependencies: id is an intentional dirty namespace boundary.
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChangeRef.current?.(false);
  }, [dirty, id, onDirtyChange]);

  const saveGuidance = async () => {
    if (!(dirty && onSave) || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(guidanceDraft);
      setSavedGuidance(guidanceDraft);
      guidanceCanonicalRef.current = guidanceDraft;
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Field Guidance save failed."
      );
    } finally {
      setSaving(false);
    }
  };

  const editorValue = (value: string) => parseEditorValue(value);
  const sectionLabel = `${subMilestoneName} field guidance`;

  return (
    <section
      aria-label={sectionLabel}
      className={cn("timeline-blueprint-field-guidance", className)}
      data-testid={sectionTestId ?? `${testIdPrefix}-${id}`}
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Field Guidance
          </Badge>
          <strong>{subMilestoneName}</strong>
          {rowName ? <p>{rowName}</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span>Field Guidance</span>
        {editable ? (
          <Button
            data-testid={`${testIdPrefix}-field-guidance-save-${id}`}
            disabled={!dirty || saving}
            loading={saving}
            onClick={saveGuidance}
            size="sm"
            type="button"
          >
            Save field guidance
          </Button>
        ) : null}
      </div>

      {editable ? (
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>What to verify</span>
          <FieldRichTextEditor
            ariaLabel={`${subMilestoneName} what to verify`}
            editable={!saving}
            editorMinHeightClass="[&_.ProseMirror]:min-h-44"
            // FieldRichTextEditor emits HTML and the canonical JSON document
            // together.  Guidance persists the exact TipTap JSON bytes, so
            // only onDocumentChange may update the local draft.
            onChange={() => undefined}
            onDocumentChange={(document) =>
              setGuidanceDraft((current) => ({
                ...current,
                whatToVerifyTiptapJson: stringifyDocument(document),
              }))
            }
            placeholder="Add a concise verification checklist…"
            testId={`${testIdPrefix}-guidance-description-${id}`}
            value={editorValue(guidanceDraft.whatToVerifyTiptapJson)}
          />
        </div>
      ) : (
        <GuidancePreview
          ariaLabel={`${subMilestoneName} what to verify`}
          label="What to verify"
          testId={`${testIdPrefix}-guidance-description-${id}`}
          value={guidanceDraft.whatToVerifyTiptapJson}
        />
      )}

      {editable ? (
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>Recommended camera angles</span>
          <FieldRichTextEditor
            ariaLabel={`${subMilestoneName} recommended camera angles`}
            editable={!saving}
            editorMinHeightClass="[&_.ProseMirror]:min-h-44"
            onChange={() => undefined}
            onDocumentChange={(document) =>
              setGuidanceDraft((current) => ({
                ...current,
                cameraAnglesTiptapJson: stringifyDocument(document),
              }))
            }
            placeholder="Describe recommended photo angles and framing…"
            testId={`${testIdPrefix}-guidance-camera-${id}`}
            value={editorValue(guidanceDraft.cameraAnglesTiptapJson)}
          />
        </div>
      ) : (
        <GuidancePreview
          ariaLabel={`${subMilestoneName} recommended camera angles`}
          label="Recommended camera angles"
          testId={`${testIdPrefix}-guidance-camera-${id}`}
          value={guidanceDraft.cameraAnglesTiptapJson}
        />
      )}

      {saveError ? (
        <p className="text-destructive text-xs" role="alert">
          {saveError}
        </p>
      ) : null}
    </section>
  );
}

function GuidancePreview({
  ariaLabel,
  label,
  testId,
  value,
}: {
  ariaLabel: string;
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
      <span>{label}</span>
      {value.trim() ? (
        <FieldRichTextPreview
          ariaLabel={ariaLabel}
          className="min-h-20"
          value={parseEditorValue(value)}
        />
      ) : (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${testId}-empty`}
        >
          No {label.toLowerCase()} recorded.
        </p>
      )}
    </div>
  );
}

export { EMPTY_GUIDANCE, guidanceEqual, normalizeGuidance };

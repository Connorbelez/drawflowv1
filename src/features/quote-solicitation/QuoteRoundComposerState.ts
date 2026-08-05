"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  QuoteRoundComposerActions,
  QuoteRoundComposerData,
  QuoteRoundDetail,
  QuoteRoundDraft,
  QuoteRoundMaterialRow,
  QuoteRoundMode,
  QuoteRoundPublishReceipt,
  QuoteRoundRecipientCandidate,
  QuoteRoundRecipientSelection,
  QuoteRoundStep,
  QuoteRoundTemplateVersion,
} from "./QuoteRoundComposer.tsx";

export const QUOTE_ROUND_STAGE_IDS: QuoteRoundStep[] = [
  "scope",
  "package",
  "recipients",
  "response",
  "dispatch",
];

const DATE_TIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const STALE_ERROR_PATTERN = /revision|stale|conflict|changed by another/i;
const CONVEX_ERROR_PREFIX_PATTERN = /^ConvexError:\s*/i;

function formatDateTimeLocal(value: string | undefined) {
  if (!value) {
    return "";
  }
  if (DATE_TIME_LOCAL_PATTERN.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function isStaleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return STALE_ERROR_PATTERN.test(message);
}

function safeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || message.length > 220) {
    return fallback;
  }
  return (
    message.replace(CONVEX_ERROR_PREFIX_PATTERN, "").split("\n", 1)[0] ??
    fallback
  );
}

function newPublishIdempotencyKey(quoteRoundId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  return `quote-round:${quoteRoundId}:publish:${suffix}`;
}

function draftFromRound(round: QuoteRoundDetail): QuoteRoundDraft {
  return (
    round.draft ?? {
      labourSubmilestoneIds: [],
      materialRows: [],
      recipients: [],
      revision: 0,
      title: round.title,
    }
  );
}

function selectedTemplate(
  templates: QuoteRoundTemplateVersion[],
  templateVersionId: string | undefined
) {
  return templates.find((template) => template.versionId === templateVersionId);
}

function requiredCapabilitiesForMode(mode: QuoteRoundMode) {
  return mode === "mixed"
    ? (["contractor", "supplier"] as const)
    : ([mode === "labour" ? "contractor" : "supplier"] as const);
}

function candidateSupportsMode(
  candidate: QuoteRoundRecipientCandidate | undefined,
  mode: QuoteRoundMode
) {
  return Boolean(
    candidate &&
      requiredCapabilitiesForMode(mode).every((capability) =>
        candidate.capabilities.includes(capability)
      )
  );
}

function templateSupportsMode(
  template: QuoteRoundTemplateVersion | undefined,
  mode: QuoteRoundMode
) {
  return Boolean(
    template &&
      (template.audience === "either" ||
        (mode === "labour" && template.audience === "contractor") ||
        (mode === "materials" && template.audience === "supplier"))
  );
}

function scopeValidationError(input: {
  materialCount: number;
  mode: QuoteRoundMode;
  selectedLabourCount: number;
}) {
  if (input.mode === "labour") {
    return input.selectedLabourCount
      ? input.materialCount
        ? "Labour Quote Rounds cannot include material pricing lines."
        : undefined
      : "Select at least one labour sub-milestone.";
  }
  if (input.mode === "materials") {
    return input.materialCount
      ? input.selectedLabourCount
        ? "Material Quote Rounds cannot include labour sub-milestones."
        : undefined
      : "Select at least one material pricing line.";
  }
  return input.selectedLabourCount && input.materialCount
    ? undefined
    : "Combined Quote Rounds require at least one labour sub-milestone and one material pricing line.";
}

function stageValidation(input: {
  candidates: QuoteRoundRecipientCandidate[];
  materialRows: QuoteRoundMaterialRow[];
  mode: QuoteRoundMode;
  recipients: QuoteRoundRecipientSelection[];
  selectedLabourIds: string[];
  templates: QuoteRoundTemplateVersion[];
  templateVersionId?: string;
}) {
  const errors: Partial<Record<QuoteRoundStep, string>> = {};
  const scopeError = scopeValidationError({
    materialCount: input.materialRows.length,
    mode: input.mode,
    selectedLabourCount: input.selectedLabourIds.length,
  });
  if (scopeError) {
    errors.scope = scopeError;
  }
  if (input.recipients.length === 0) {
    errors.recipients =
      "Select at least one compatible recipient before publishing.";
  } else if (
    input.recipients.some(
      (selection) =>
        !candidateSupportsMode(
          input.candidates.find(
            (candidate) => candidate.recipientKey === selection.recipientKey
          ),
          input.mode
        )
    )
  ) {
    errors.recipients =
      "Every selected profile must carry the capability required by this Quote Round mode.";
  }
  const template = selectedTemplate(input.templates, input.templateVersionId);
  if (!templateSupportsMode(template, input.mode)) {
    errors.response = template
      ? "Select a published response-template version compatible with this Quote Round mode."
      : "Select a published response-template version.";
  }
  return errors;
}

export function useQuoteRoundComposerState({
  actions,
  data,
  round,
}: {
  actions: QuoteRoundComposerActions;
  data: QuoteRoundComposerData;
  round: QuoteRoundDetail;
}) {
  const initial = draftFromRound(round);
  const [stage, setStage] = useState<QuoteRoundStep>("scope");
  const [revision, setRevision] = useState(initial.revision);
  const [title, setTitle] = useState(initial.title);
  const [selectedLabourIds, setSelectedLabourIds] = useState(
    initial.labourSubmilestoneIds
  );
  const [materialRows, setMaterialRows] = useState(initial.materialRows);
  const [recipients, setRecipients] = useState(initial.recipients);
  const [templateVersionId, setTemplateVersionId] = useState(
    initial.templateVersionId
  );
  const [responseDeadline, setResponseDeadline] = useState(
    formatDateTimeLocal(initial.responseDeadline)
  );
  const [pending, setPending] = useState<"publish" | "save" | null>(null);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [published, setPublished] = useState<QuoteRoundPublishReceipt>();
  const idempotencyKeyRef = useRef(
    newPublishIdempotencyKey(round.quoteRoundId)
  );
  const remoteIdentity = `${round.quoteRoundId}:${initial.revision}`;
  const lastRemoteIdentity = useRef(remoteIdentity);

  useEffect(() => {
    if (lastRemoteIdentity.current === remoteIdentity) {
      return;
    }
    lastRemoteIdentity.current = remoteIdentity;
    const next = draftFromRound(round);
    setRevision(next.revision);
    setTitle(next.title);
    setSelectedLabourIds(next.labourSubmilestoneIds);
    setMaterialRows(next.materialRows);
    setRecipients(next.recipients);
    setTemplateVersionId(next.templateVersionId);
    setResponseDeadline(formatDateTimeLocal(next.responseDeadline));
    setStale(false);
    setNotice("Draft refreshed from the authoritative Quote Round.");
  }, [remoteIdentity, round]);

  const selectedLabour = useMemo(
    () =>
      data.labourSubmilestones.filter((item) =>
        selectedLabourIds.includes(item._id)
      ),
    [data.labourSubmilestones, selectedLabourIds]
  );
  const mode = round.mode;
  const selectedResponseTemplate = selectedTemplate(
    data.responseTemplates,
    templateVersionId
  );
  const validation = stageValidation({
    candidates: data.compatibleRecipients,
    materialRows,
    mode,
    recipients,
    selectedLabourIds,
    templates: data.responseTemplates,
    templateVersionId,
  });
  const stageIndex = QUOTE_ROUND_STAGE_IDS.indexOf(stage);

  const save = async () => {
    setPending("save");
    setError(undefined);
    try {
      const result = await actions.onSave({
        expectedRevision: revision,
        labourSubmilestoneIds: selectedLabourIds,
        materialRows,
        recipients,
        responseDeadline: responseDeadline || undefined,
        templateVersionId,
        title: title.trim() || "Untitled Quote Round",
      });
      setRevision(result.revision);
      setNotice("Draft saved.");
      setStale(false);
      return result.revision;
    } catch (saveError) {
      setStale(isStaleError(saveError));
      setError(
        safeErrorMessage(
          saveError,
          "We could not save this Quote Round. Retry after checking your connection."
        )
      );
      return;
    } finally {
      setPending(null);
    }
  };

  const continueStage = async () => {
    const stageError = validation[stage];
    if (stageError) {
      setError(stageError);
      return;
    }
    const savedRevision = await save();
    if (savedRevision === undefined) {
      return;
    }
    const next = QUOTE_ROUND_STAGE_IDS[stageIndex + 1];
    if (next) {
      setStage(next);
    }
  };

  const publish = async () => {
    const firstInvalid = QUOTE_ROUND_STAGE_IDS.find((step) => validation[step]);
    if (firstInvalid) {
      setError(validation[firstInvalid]);
      setStage(firstInvalid);
      return;
    }
    if (!responseDeadline) {
      setError("Set a response deadline before publishing.");
      return;
    }
    const savedRevision = await save();
    if (savedRevision === undefined) {
      return;
    }
    setPending("publish");
    setError(undefined);
    try {
      const receipt = await actions.onPublish({
        expectedRevision: savedRevision,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setPublished(receipt);
      setNotice(
        receipt.idempotentReplay
          ? "Publication confirmed from the original request."
          : "Quote Round published with active invitations."
      );
      setStale(false);
    } catch (publishError) {
      setStale(isStaleError(publishError));
      setError(
        safeErrorMessage(
          publishError,
          "We could not publish this Quote Round. Retry safely with the same operation."
        )
      );
    } finally {
      setPending(null);
    }
  };

  const retry = async () => {
    if (stage === "dispatch") {
      await publish();
      return;
    }
    await save();
  };

  const toggleLabour = (id: string) =>
    setSelectedLabourIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id]
    );

  return {
    continueStage,
    error,
    materialRows,
    mode,
    notice,
    pending,
    publish,
    published,
    recipients,
    responseDeadline,
    retry,
    revision,
    selectedLabour,
    selectedLabourIds,
    selectedResponseTemplate,
    setMaterialRows,
    setRecipients,
    setResponseDeadline,
    setStage,
    setTemplateVersionId,
    setTitle,
    stage,
    stageIndex,
    stale,
    templateVersionId,
    title,
    toggleLabour,
  };
}

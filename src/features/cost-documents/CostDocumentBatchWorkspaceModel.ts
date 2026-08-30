import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CostDocumentDraftAccessPerson,
  CostDocumentDraftCollaborator,
} from "./CostDocumentDraftCollaboration.tsx";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";
import { formatCad, parseCadCents } from "./SingleCostDocumentCapture.tsx";

export const MAX_COST_DOCUMENT_PAGES = 50;
export const MAX_COST_DOCUMENT_ALLOCATIONS = 100;
export const MAX_COST_DOCUMENT_FINANCIAL_COMPONENTS = 20;
export const DRAFT_AUTOSAVE_DELAY_MS = 450;
export const ISO_DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const STEPS = [
  { id: "capture_confirm", label: "Capture & confirm" },
  { id: "balance_allocate", label: "Balance & allocate" },
  { id: "share", label: "Share" },
  { id: "freeze", label: "Freeze" },
] as const;

export type DraftStep = (typeof STEPS)[number]["id"];
export type CostDocumentKind = "invoice" | "receipt";
export type CostDocumentCategory = "labour" | "materials";
export type FinancialComponentKind = "subtotal" | "tax" | "fee" | "discount";

export interface BatchDraft {
  _id: Id<"costDocumentDrafts">;
  activeStep: DraftStep;
  allocations: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    order: number;
    submilestoneKey: string;
    submilestoneName: string;
  }>;
  batchId?: Id<"costDocumentBatches">;
  capabilities?: CostDocumentDraftCapabilities;
  category: CostDocumentCategory;
  collaboration?: CostDocumentDraftCollaborationProjection;
  collaborators?: Array<{
    grantedAt?: number;
    workosUserId: string;
  }>;
  completedAt?: number;
  creator?: { workosUserId: string };
  currency: "CAD";
  description?: string;
  documentDate?: string;
  financialComponents: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
    order: number;
  }>;
  grossTotalCents?: number;
  kind: CostDocumentKind;
  lifecycle: "draft" | "complete" | "submitted";
  order?: number;
  pages: Array<{
    assetId: Id<"buildCollaborationAssets">;
    contentHashSha256?: string;
    fileName?: string;
    mimeType?: string;
    order: number;
    priorAssetId?: Id<"buildCollaborationAssets">;
    replacedAt?: number;
  }>;
  revision?: number;
  self?: { workosUserId: string };
  submittedCostDocumentId?: Id<"costDocuments">;
  title?: string;
  vendorName?: string;
  vendorProfileId?: Id<"contractorProfiles">;
  workingStateJson?: string;
}

export interface CostDocumentDraftCapabilities {
  canDiscardBatch: boolean;
  canEditDraft: boolean;
  canManageDraftCollaboration: boolean;
  canManageSourcePages: boolean;
  canReadDraft: boolean;
  canSubmitBatch: boolean;
}

export interface CostDocumentDraftCollaborationProjection {
  currentCollaborators: Array<{
    grantedAt: number;
    workosUserId: string;
  }>;
  eligibleCollaborators: Array<{
    displayName: string;
    role: string;
    workosUserId: string;
  }>;
}

export interface ExactDraftProjection
  extends Omit<BatchDraft, "batchId" | "order"> {
  capabilities: CostDocumentDraftCapabilities;
  creator: { workosUserId: string };
  revision: number;
  self: { workosUserId: string };
}

export interface BatchProjection {
  _id: Id<"costDocumentBatches">;
  drafts: BatchDraft[];
  idempotencyKey?: string;
  revision: number;
  state: "active" | "submitted" | "abandoned";
  submittedAt?: number;
  supportingContextDisclosure: string;
}

export interface AllocationEditorRow {
  amount: string;
  buildSubmilestoneId: string;
  id: string;
}

export interface FinancialComponentEditorRow {
  amount: string;
  id: string;
  kind: FinancialComponentKind;
  label: string;
}

export interface DraftEditor {
  allocations: AllocationEditorRow[];
  description: string;
  documentDate: string;
  draftId: string;
  financialComponents: FinancialComponentEditorRow[];
  grossTotal: string;
  pageAssetIds: string[];
  title: string;
  vendorName: string;
  vendorProfileId?: string;
}

export interface DraftWorkingState {
  allocations: AllocationEditorRow[];
  financialComponents: FinancialComponentEditorRow[];
  grossTotal: string;
  version: 1;
}

export type DraftAutosaveStatus = "error" | "pending" | "saved" | "saving";

export interface DraftAutosaveState {
  inFlight?: Promise<unknown>;
  requestedVersion: number;
  savedVersion: number;
  timer?: ReturnType<typeof setTimeout>;
}

export interface DraftAutosavePayload {
  allocations?: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
  description: string;
  documentDate?: string;
  draftId: Id<"costDocumentDrafts">;
  financialComponents?: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
  grossTotalCents?: number;
  title: string;
  vendorName: string;
  vendorProfileId: Id<"contractorProfiles"> | null;
  workingStateJson: string;
}

export interface CostDocumentDraftSaveInput {
  allocations?: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
  category?: CostDocumentCategory;
  description?: string;
  documentDate?: string;
  draftId: Id<"costDocumentDrafts">;
  financialComponents?: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
  grossTotalCents?: number;
  kind?: CostDocumentKind;
  pageAssetIds?: Id<"buildCollaborationAssets">[];
  title?: string;
  vendorName?: string;
  vendorProfileId?: Id<"contractorProfiles"> | null;
  workingStateJson?: string;
}

export function draftCollaborationView(draft: BatchDraft): {
  collaborators: CostDocumentDraftCollaborator[];
  creator: CostDocumentDraftAccessPerson;
  eligibleCollaborators: CostDocumentDraftAccessPerson[];
} {
  const eligible = draft.collaboration?.eligibleCollaborators ?? [];
  const peopleById = new Map(
    eligible.map((person) => [person.workosUserId, person])
  );
  const creatorWorkosUserId = draft.creator?.workosUserId ?? "draft-creator";
  const creatorRecord = peopleById.get(creatorWorkosUserId);
  const creator: CostDocumentDraftAccessPerson = {
    displayName:
      creatorRecord?.displayName ??
      (draft.self?.workosUserId === creatorWorkosUserId
        ? "You"
        : "Draft creator"),
    roleLabel: roleLabel(creatorRecord?.role ?? "creator"),
    workosUserId: creatorWorkosUserId,
  };
  const currentCollaborators =
    draft.collaboration?.currentCollaborators ?? draft.collaborators ?? [];
  const currentIds = new Set(
    currentCollaborators.map((person) => person.workosUserId)
  );
  const collaborators = currentCollaborators.map((collaborator) => {
    const person = peopleById.get(collaborator.workosUserId);
    return {
      displayName: person?.displayName ?? collaborator.workosUserId,
      grantedAt: collaborator.grantedAt,
      roleLabel: roleLabel(person?.role ?? "Builder participant"),
      workosUserId: collaborator.workosUserId,
    };
  });
  const eligibleCollaborators = eligible
    .filter(
      (person) =>
        person.workosUserId !== creatorWorkosUserId &&
        !currentIds.has(person.workosUserId)
    )
    .map((person) => ({
      displayName: person.displayName,
      roleLabel: roleLabel(person.role),
      workosUserId: person.workosUserId,
    }));
  return { collaborators, creator, eligibleCollaborators };
}

export function roleLabel(role: string) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function autosavePayload(editor: DraftEditor): DraftAutosavePayload {
  const payload: DraftAutosavePayload = {
    description: editor.description,
    draftId: editor.draftId as Id<"costDocumentDrafts">,
    title: editor.title,
    vendorProfileId: editor.vendorProfileId
      ? (editor.vendorProfileId as Id<"contractorProfiles">)
      : null,
    vendorName: editor.vendorName,
    workingStateJson: serializeDraftWorkingState(editor),
  };
  const documentDate = editor.documentDate.trim();
  if (!documentDate || ISO_DATE_INPUT_PATTERN.test(documentDate)) {
    payload.documentDate = documentDate;
  }
  const grossTotal = editor.grossTotal.trim();
  if (grossTotal) {
    const parsedGrossTotal = tryParseCadCents(grossTotal);
    if (parsedGrossTotal !== null) {
      payload.grossTotalCents = parsedGrossTotal;
    }
  } else {
    payload.grossTotalCents = 0;
  }
  const allocations = autosaveAllocations(editor.allocations);
  if (allocations !== undefined) {
    payload.allocations = allocations;
  }
  const financialComponents = autosaveFinancialComponents(
    editor.financialComponents
  );
  if (financialComponents !== undefined) {
    payload.financialComponents = financialComponents;
  }
  return payload;
}

export function autosaveAllocations(rows: AllocationEditorRow[]) {
  if (
    rows.every((row) => !(row.amount.trim() || row.buildSubmilestoneId.trim()))
  ) {
    return [];
  }
  const allocations = rows.map((row) => {
    const amountCents = tryParseCadCents(row.amount);
    if (!row.buildSubmilestoneId || amountCents === null) {
      return null;
    }
    return {
      amountCents,
      buildSubmilestoneId: row.buildSubmilestoneId as Id<"buildSubmilestones">,
    };
  });
  if (allocations.some((allocation) => allocation === null)) {
    return;
  }
  return allocations as Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
}

export function autosaveFinancialComponents(
  rows: FinancialComponentEditorRow[]
) {
  if (rows.length === 0) {
    return [];
  }
  const components = rows.map((row) => {
    const amountCents = tryParseCadCents(row.amount);
    if (amountCents === null) {
      return null;
    }
    return {
      amountCents,
      kind: row.kind,
      label: row.label.trim() || undefined,
    };
  });
  if (
    components.some((component) => component === null) ||
    components.filter((component) => component?.kind === "subtotal").length !==
      1
  ) {
    return;
  }
  return components as Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
}

export function editorOverrideForAutosave(
  editor: DraftEditor,
  draft: BatchDraft | undefined,
  submilestones: CostDocumentSubmilestoneOption[]
): Partial<BatchDraft> {
  const payload = autosavePayload(editor);
  const override: Partial<BatchDraft> = {
    description: editor.description.trim() || undefined,
    documentDate: editor.documentDate.trim() || undefined,
    title: editor.title.trim() || undefined,
    vendorProfileId: editor.vendorProfileId
      ? (editor.vendorProfileId as Id<"contractorProfiles">)
      : undefined,
    vendorName: editor.vendorName.trim() || undefined,
  };
  if (payload.grossTotalCents !== undefined) {
    override.grossTotalCents = payload.grossTotalCents;
  }
  if (payload.allocations !== undefined) {
    override.allocations = payload.allocations.map((allocation, index) => {
      const existing = draft?.allocations.find(
        (item) => item.buildSubmilestoneId === allocation.buildSubmilestoneId
      );
      const label = submilestones.find(
        (submilestone) =>
          String(submilestone.id) === String(allocation.buildSubmilestoneId)
      )?.label;
      return {
        amountCents: allocation.amountCents,
        buildSubmilestoneId: allocation.buildSubmilestoneId,
        order: index + 1,
        submilestoneKey: existing?.submilestoneKey ?? label ?? "Sub-milestone",
        submilestoneName:
          existing?.submilestoneName ?? label ?? "Sub-milestone",
      };
    });
  }
  if (payload.financialComponents !== undefined) {
    override.financialComponents = payload.financialComponents.map(
      (component, index) => ({ ...component, order: index + 1 })
    );
  }
  return override;
}

export function draftToEditor(draft: BatchDraft): DraftEditor {
  const canonicalEditor: DraftEditor = {
    allocations:
      draft.allocations.length > 0
        ? draft.allocations.map((allocation, index) => ({
            amount: centsToInput(allocation.amountCents),
            buildSubmilestoneId: String(allocation.buildSubmilestoneId),
            id: `${draft._id}-allocation-${allocation.order || index + 1}`,
          }))
        : [
            {
              amount: "",
              buildSubmilestoneId: "",
              id: `${draft._id}-allocation-1`,
            },
          ],
    description: draft.description ?? "",
    documentDate: draft.documentDate ?? "",
    draftId: String(draft._id),
    financialComponents: draft.financialComponents.map((component, index) => ({
      amount: centsToInput(component.amountCents),
      id: `${draft._id}-financial-component-${component.order || index + 1}`,
      kind: component.kind,
      label: component.label ?? "",
    })),
    grossTotal:
      draft.grossTotalCents && draft.grossTotalCents > 0
        ? centsToInput(draft.grossTotalCents)
        : "",
    pageAssetIds: draft.pages.map((page) => String(page.assetId)),
    title: draft.title ?? "",
    vendorProfileId: draft.vendorProfileId
      ? String(draft.vendorProfileId)
      : undefined,
    vendorName: draft.vendorName ?? "",
  };
  return restoreDraftWorkingState(canonicalEditor, draft.workingStateJson);
}

export function serializeDraftWorkingState(editor: DraftEditor) {
  const workingState: DraftWorkingState = {
    allocations: editor.allocations.map((allocation) => ({ ...allocation })),
    financialComponents: editor.financialComponents.map((component) => ({
      ...component,
    })),
    grossTotal: editor.grossTotal,
    version: 1,
  };
  return JSON.stringify(workingState);
}

export function restoreDraftWorkingState(
  editor: DraftEditor,
  workingStateJson: string | undefined
) {
  const workingState = parseDraftWorkingState(workingStateJson);
  if (!workingState) {
    return editor;
  }
  return {
    ...editor,
    allocations: workingState.allocations,
    financialComponents: workingState.financialComponents,
    grossTotal: workingState.grossTotal,
  };
}

export function parseDraftWorkingState(
  workingStateJson: string | undefined
): DraftWorkingState | undefined {
  if (!workingStateJson) {
    return;
  }
  try {
    const parsed = JSON.parse(workingStateJson) as unknown;
    if (!isDraftWorkingState(parsed)) {
      return;
    }
    return parsed;
  } catch {
    return;
  }
}

export function isDraftWorkingState(
  value: unknown
): value is DraftWorkingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    state.version === 1 &&
    typeof state.grossTotal === "string" &&
    Array.isArray(state.allocations) &&
    state.allocations.length <= MAX_COST_DOCUMENT_ALLOCATIONS &&
    state.allocations.every(isAllocationEditorRow) &&
    Array.isArray(state.financialComponents) &&
    state.financialComponents.length <=
      MAX_COST_DOCUMENT_FINANCIAL_COMPONENTS &&
    state.financialComponents.every(isFinancialComponentEditorRow)
  );
}

export function isAllocationEditorRow(
  value: unknown
): value is AllocationEditorRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.amount === "string" &&
    typeof row.buildSubmilestoneId === "string"
  );
}

export function isFinancialComponentEditorRow(
  value: unknown
): value is FinancialComponentEditorRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.amount === "string" &&
    typeof row.label === "string" &&
    (row.kind === "subtotal" ||
      row.kind === "tax" ||
      row.kind === "fee" ||
      row.kind === "discount")
  );
}

export function requiredCaptureFacts(editor: DraftEditor) {
  const title = editor.title.trim();
  const vendorName = editor.vendorName.trim();
  const documentDate = editor.documentDate.trim();
  if (!title) {
    throw new Error("Title is required before continuing.");
  }
  if (!(vendorName && editor.vendorProfileId)) {
    throw new Error(
      "Select a linked organization vendor, supplier, or contractor before continuing."
    );
  }
  if (!documentDate) {
    throw new Error("Document date is required before continuing.");
  }
  return {
    description: editor.description.trim() || undefined,
    documentDate,
    title,
    vendorProfileId: editor.vendorProfileId as Id<"contractorProfiles">,
    vendorName,
  };
}

export function exactBalanceFromEditor(editor: DraftEditor) {
  const grossTotalCents = parseNamedCadCents(
    editor.grossTotal,
    "Gross Document Total"
  );
  const allocations = editor.allocations.map((allocation, index) => {
    if (!allocation.buildSubmilestoneId) {
      throw new Error(
        `Choose a Sub-milestone for Cost Allocation ${index + 1}.`
      );
    }
    return {
      amountCents: parseNamedCadCents(
        allocation.amount,
        `Cost Allocation ${index + 1} amount`
      ),
      buildSubmilestoneId:
        allocation.buildSubmilestoneId as Id<"buildSubmilestones">,
    };
  });
  if (
    new Set(allocations.map((allocation) => allocation.buildSubmilestoneId))
      .size !== allocations.length
  ) {
    throw new Error(
      "Each Cost Allocation must target a different Sub-milestone."
    );
  }
  const allocatedCents = sumCents(
    allocations.map((allocation) => allocation.amountCents)
  );
  if (allocatedCents !== grossTotalCents) {
    throw new Error(
      "Cost Allocations must equal the Gross Document Total exactly."
    );
  }
  const financialComponents = editor.financialComponents.map(
    (component, index) => ({
      amountCents: parseNamedCadCents(
        component.amount,
        `Financial component ${index + 1} amount`
      ),
      kind: component.kind,
      label: component.label.trim() || undefined,
    })
  );
  if (financialComponents.length > 0) {
    const subtotalCount = financialComponents.filter(
      (component) => component.kind === "subtotal"
    ).length;
    if (subtotalCount !== 1) {
      throw new Error(
        "Financial reconciliation requires exactly one subtotal."
      );
    }
    const componentsTotal = financialComponents.reduce(
      (total, component) =>
        component.kind === "discount"
          ? total - component.amountCents
          : total + component.amountCents,
      0
    );
    if (componentsTotal !== grossTotalCents) {
      throw new Error(
        "Financial components must reconcile to the Gross Document Total exactly."
      );
    }
  }
  return { allocations, financialComponents, grossTotalCents };
}

export function financialInputValue(
  editor: DraftEditor,
  kind: "subtotal" | "tax"
) {
  const component = editor.financialComponents.find(
    (candidate) => candidate.kind === kind
  );
  if (component) {
    return component.amount;
  }
  return kind === "subtotal" && editor.financialComponents.length === 0
    ? editor.grossTotal
    : "";
}

export function financialInputPatch(
  editor: DraftEditor,
  kind: "subtotal" | "tax",
  value: string
): Pick<DraftEditor, "financialComponents" | "grossTotal"> {
  const subtotal =
    kind === "subtotal" ? value : financialInputValue(editor, "subtotal");
  const tax = kind === "tax" ? value : financialInputValue(editor, "tax");
  const financialComponents: FinancialComponentEditorRow[] = [];
  if (subtotal.trim()) {
    financialComponents.push({
      amount: subtotal,
      id: `${editor.draftId}-financial-subtotal`,
      kind: "subtotal",
      label: "",
    });
  }
  if (tax.trim()) {
    financialComponents.push({
      amount: tax,
      id: `${editor.draftId}-financial-tax`,
      kind: "tax",
      label: "",
    });
  }
  const subtotalCents = tryParseCadCents(subtotal);
  const taxCents = tax.trim() ? tryParseCadCents(tax) : 0;
  return {
    financialComponents,
    grossTotal:
      subtotalCents === null || taxCents === null
        ? ""
        : centsToInput(subtotalCents + taxCents),
  };
}

export function balancePreview(editor: DraftEditor) {
  const grossTotalCents = tryParseCadCents(editor.grossTotal);
  const allocatedCents = sumCents(
    editor.allocations.map(
      (allocation) => tryParseCadCents(allocation.amount) ?? 0
    )
  );
  const remainingCents =
    grossTotalCents === null ? 0 : grossTotalCents - allocatedCents;
  return {
    allocatedCents,
    grossLabel:
      grossTotalCents === null
        ? "Subtotal required"
        : formatCad(grossTotalCents),
    remainingLabel:
      grossTotalCents === null
        ? "Subtotal required"
        : `${formatCad(remainingCents)} remaining`,
  };
}

export function stepIndex(step: DraftStep) {
  return STEPS.findIndex((item) => item.id === step);
}

export function stepLabel(step: DraftStep) {
  return STEPS.find((item) => item.id === step)?.label ?? "Capture & confirm";
}

export function guidedStepDescription(step: DraftStep) {
  switch (step) {
    case "capture_confirm":
      return "Add every page, then confirm the required facts for this invoice or receipt.";
    case "balance_allocate":
      return "Reconcile the gross total and assign that exact amount across relevant Sub-milestones.";
    case "share":
      return "Keep the Draft private or invite eligible Builder-side collaborators.";
    case "freeze":
      return "Review the immutable publication manifest before submission.";
  }
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export function tryParseCadCents(value: string) {
  if (!value.trim()) {
    return null;
  }
  try {
    return parseCadCents(value);
  } catch {
    return null;
  }
}

export function parseNamedCadCents(value: string, label: string) {
  try {
    return parseCadCents(value);
  } catch {
    throw new Error(`${label} must be a positive CAD amount.`);
  }
}

export function safeFormatCad(value: string) {
  const cents = tryParseCadCents(value);
  return cents === null ? "Gross total required" : formatCad(cents);
}

export function autosaveStatusLabel(status: DraftAutosaveStatus | undefined) {
  switch (status) {
    case "pending":
      return "Changes queued for secure draft save.";
    case "saving":
      return "Saving draft changes…";
    case "saved":
      return "Draft changes saved.";
    case "error":
      return "Draft changes need a retry before you leave this document.";
    default:
      return "Draft changes save automatically while you work.";
  }
}

export function assertDraftPageUploadFits(draft: BatchDraft, files: File[]) {
  if (files.length === 0) {
    throw new Error("Choose at least one Invoice or Receipt page.");
  }
  if (files.length > MAX_COST_DOCUMENT_PAGES) {
    throw new Error(
      `A Cost Document supports at most ${MAX_COST_DOCUMENT_PAGES} pages.`
    );
  }
  if (draft.pages.length + files.length > MAX_COST_DOCUMENT_PAGES) {
    const availablePages = MAX_COST_DOCUMENT_PAGES - draft.pages.length;
    throw new Error(
      `This Cost Document already has ${draft.pages.length} saved page${draft.pages.length === 1 ? "" : "s"}. Add no more than ${availablePages} page${availablePages === 1 ? "" : "s"}.`
    );
  }
}

export function sumCents(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error("Cost Allocation total exceeds safe integer cents.");
  }
  return total;
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function makeIdempotencyKey(prefix: string) {
  const identifier =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}:${identifier}`;
}

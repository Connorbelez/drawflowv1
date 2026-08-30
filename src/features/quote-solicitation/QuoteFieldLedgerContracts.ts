import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";

import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { parseQuoteRoundTiptapJson } from "./quote-round-tiptap.ts";

export type DraftReadResult = FunctionReturnType<
  typeof api.quote_response_drafts.getQuoteInvitationResponseDraft
>;
export type ReadableDraftResult = Extract<
  DraftReadResult,
  { status: "available" | "read_only" }
>;
export type QuoteAccess = ReadableDraftResult["access"];
export type QuoteDraft = ReadableDraftResult["draft"];
export type LifecycleReadResult = FunctionReturnType<
  typeof api.quote_response_submissions.getQuoteInvitationResponseLifecycle
>;
export type CopiedValuesConfirmationResult = FunctionReturnType<
  typeof api.quote_response_drafts.confirmCopiedQuoteInvitationResponseDraftValues
>;
export type ReadableLifecycleResult = LifecycleReadResult & {
  status: "available" | "read_only" | "acknowledgement_required";
};
export type ResponseLedgerSource =
  | QuoteDraft
  | ReadableLifecycleResult["currentSubmission"];
export type DraftLineSource =
  | "package_labour"
  | "package_material"
  | "template_priced"
  | "expanded_scope";
export type DraftScope = "labour" | "materials" | "whole_quote";

export interface DraftLinePatch {
  lineKey: string;
  quotedAmountCents?: number | null;
  scope: DraftScope;
  source: DraftLineSource;
  sourcePackageRevisionLabourLineId?: Id<"quotePackageRevisionLabourLines">;
  sourcePackageRevisionMaterialLineId?: Id<"quotePackageRevisionMaterialLines">;
  sourcePackageRevisionResponseFieldId?: Id<"quotePackageRevisionResponseFields">;
  title?: string;
}

export interface DraftAnswerPatch {
  sourcePackageRevisionResponseFieldId: Id<"quotePackageRevisionResponseFields">;
  value: string | null;
}

export interface DraftPatch {
  answerPatches?: DraftAnswerPatch[];
  commentsHtml?: string | null;
  linePatches?: DraftLinePatch[];
  removeExpandedLineKeys?: string[];
}

export interface PricingDisplayLine {
  context?: string;
  detail?: NonNullable<ReturnType<typeof parseQuoteRoundTiptapJson>> | string;
  line: DraftLinePatch;
  meta: string;
}

export interface LocalLedgerState {
  amounts: Record<string, number | undefined>;
  answers: Record<string, string | undefined>;
  commentsHtml: string;
  expandedLines: DraftLinePatch[];
  version: number;
}

export interface DraftConflict {
  draft: QuoteDraft;
}

export interface StagedAttachment {
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
  storageId: Id<"_storage">;
}

export const AUTOSAVE_DELAY_MS = 550;
export const MAX_TIMEOUT_MS = 2_147_483_647;
export const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;

export interface QuoteFieldLedgerProps {
  access: QuoteAccess;
  accountClaimActions?: ReactNode;
  hasAuthenticatedUser: boolean;
  onReopenInvitation?: () => void;
  sessionToken?: string;
}

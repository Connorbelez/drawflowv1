"use client";

import {
  CalendarClock,
  CloudOff,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { QuoteFieldLedgerProps } from "./QuoteFieldLedgerContracts";
import {
  CopiedValuesConfirmationPanel,
  LedgerMasthead,
  LedgerNotice,
  LedgerSection,
  LedgerSectionNav,
  PackageSummary,
  PricingBand,
  ResponseFields,
  RevisionAcknowledgementPanel,
} from "./QuoteFieldLedgerPresentation";
import {
  ExpandedScopeEditor,
  LedgerPersistentReview,
  LedgerRail,
  LedgerRecoverySurface,
  ResponseAttachments,
  ReviewBand,
} from "./QuoteFieldLedgerResponseParts";
import { useQuoteFieldLedgerRuntime } from "./QuoteFieldLedgerRuntime";
import {
  formatDateTime,
  packagePricingLines,
  runFlush,
  sumDraftLines,
  sumPricingLines,
} from "./QuoteFieldLedgerUtils";

export type { QuoteFieldLedgerProps } from "./QuoteFieldLedgerContracts";

/**
 * The recipient-facing Field Ledger is one continuous response surface. Its
 * local state is deliberately optimistic, while the server remains the sole
 * authority for invitation scope, response deadlines, and draft versions.
 */
export function QuoteFieldLedger({
  accountClaimActions,
  access: initialAccess,
  hasAuthenticatedUser,
  onReopenInvitation,
  sessionToken,
}: QuoteFieldLedgerProps) {
  const {
    access,
    acknowledgeRevision,
    acknowledgementPending,
    addExpandedScope,
    attachmentError,
    confirmCopiedResponseValues,
    copiedValuesConfirmationRequired,
    copiedValuesPending,
    controlsLocked,
    conflict,
    expandedAmount,
    expandedScope,
    expandedTitle,
    flush,
    ledger,
    lifecycle,
    lifecycleMessage,
    lifecyclePending,
    loadSavedVersion,
    readOnly,
    revisionAcknowledgementRequired,
    removeExpandedScope,
    responseLedgerSource,
    retryConflict,
    serverSuperseded,
    serverUnavailable,
    setExpandedAmount,
    setExpandedScope,
    setExpandedTitle,
    setWithdrawalExplanation,
    startResponseRevision,
    submitCurrentDraft,
    syncError,
    syncMessage,
    uploadAttachment,
    uploading,
    updateAmount,
    updateAnswer,
    updateComments,
    withdrawCurrentResponse,
    withdrawalExplanation,
  } = useQuoteFieldLedgerRuntime({
    hasAuthenticatedUser,
    initialAccess,
    sessionToken,
  });
  const revisionAcknowledgement =
    lifecycle?.result.revisionAcknowledgement ?? null;

  if (serverSuperseded) {
    return (
      <LedgerRecoverySurface
        kind="superseded"
        onReopenInvitation={onReopenInvitation}
      />
    );
  }
  if (serverUnavailable) {
    return (
      <LedgerRecoverySurface
        kind="unavailable"
        onReopenInvitation={onReopenInvitation}
      />
    );
  }

  const labourLines = packagePricingLines(access, "labour", ledger);
  const materialLines = packagePricingLines(access, "materials", ledger);
  const labourSubtotal = sumPricingLines(labourLines, ledger.amounts);
  const materialSubtotal = sumPricingLines(materialLines, ledger.amounts);
  const expandedSubtotal = sumDraftLines(ledger.expandedLines, ledger.amounts);
  const total = labourSubtotal + materialSubtotal + expandedSubtotal;

  return (
    <main className="min-h-svh bg-bg-base pb-24">
      <div className="mx-auto max-w-[88rem] px-3 py-4 sm:px-5 sm:py-6">
        <LedgerMasthead
          access={access}
          readOnly={readOnly}
          syncMessage={syncMessage}
          total={total}
        />
        <LedgerSectionNav />
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <Frame className="min-w-0">
            <FramePanel className="overflow-hidden p-0">
              {revisionAcknowledgementRequired && revisionAcknowledgement ? (
                <RevisionAcknowledgementPanel
                  acknowledgement={revisionAcknowledgement}
                  onAcknowledge={acknowledgeRevision}
                  pending={acknowledgementPending}
                />
              ) : null}
              {copiedValuesConfirmationRequired ? (
                <CopiedValuesConfirmationPanel
                  onConfirm={confirmCopiedResponseValues}
                  pending={copiedValuesPending}
                  readOnly={readOnly}
                />
              ) : null}
              {readOnly ? (
                <LedgerNotice
                  icon={<CalendarClock />}
                  title="Response window closed"
                  variant="warning"
                >
                  This Field Ledger is preserved for review, but no changes or
                  files can be saved after{" "}
                  {formatDateTime(access.package.responseDeadline)}.
                </LedgerNotice>
              ) : null}
              {syncError ? (
                <LedgerNotice
                  icon={<CloudOff />}
                  title="Saved on this device"
                  variant="warning"
                >
                  {syncError} Your visible input has not been discarded.
                  <div className="mt-2">
                    <Button
                      onClick={() => runFlush(flush)}
                      size="sm"
                      variant="outline"
                    >
                      <RefreshCw /> Retry save
                    </Button>
                  </div>
                </LedgerNotice>
              ) : null}
              {conflict ? (
                <LedgerNotice
                  icon={<TriangleAlert />}
                  title="A newer Field Ledger version exists"
                  variant="warning"
                >
                  Your local input is still visible. Reapply it against version{" "}
                  {conflict.draft?.version ?? 0} after reviewing the saved
                  state.
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={retryConflict} size="sm">
                      Keep my local changes
                    </Button>
                    <Button
                      onClick={loadSavedVersion}
                      size="sm"
                      variant="outline"
                    >
                      Load saved version
                    </Button>
                  </div>
                </LedgerNotice>
              ) : null}
              <LedgerSection
                description="The issued site, permit, dates, and requested scope are frozen together."
                id="summary"
                title="Quote summary"
              >
                <PackageSummary
                  access={access}
                  accountClaimActions={accountClaimActions}
                />
              </LedgerSection>
              <LedgerSection
                description="Price the requested work scope separately from materials."
                id="labour"
                title="Labour"
              >
                <PricingBand
                  lines={labourLines}
                  onAmountChange={updateAmount}
                  readOnly={controlsLocked}
                  scope="labour"
                  subtotal={labourSubtotal}
                  values={ledger.amounts}
                />
              </LedgerSection>
              <LedgerSection
                description="Price requested supplies, delivery, and material-specific scope."
                id="materials"
                title="Materials"
              >
                <PricingBand
                  lines={materialLines}
                  onAmountChange={updateAmount}
                  readOnly={controlsLocked}
                  scope="materials"
                  subtotal={materialSubtotal}
                  values={ledger.amounts}
                />
              </LedgerSection>
              <LedgerSection
                description="Answer the response fields the issuing team included with this revision."
                id="questions"
                title="Questions"
              >
                <ResponseFields
                  access={access}
                  answers={ledger.answers}
                  onAnswerChange={updateAnswer}
                  onFileChange={uploadAttachment}
                  readOnly={controlsLocked}
                  uploading={uploading}
                />
              </LedgerSection>
              <LedgerSection
                description="Keep scope additions separate from the issued rows, and attach supporting files privately."
                id="files"
                title="Files & notes"
              >
                <div className="grid gap-6">
                  <ExpandedScopeEditor
                    amount={expandedAmount}
                    lines={ledger.expandedLines}
                    onAdd={addExpandedScope}
                    onAmountChange={setExpandedAmount}
                    onRemove={removeExpandedScope}
                    onScopeChange={setExpandedScope}
                    onTitleChange={setExpandedTitle}
                    readOnly={controlsLocked}
                    scope={expandedScope}
                    title={expandedTitle}
                    values={ledger.amounts}
                  />
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">
                          Additional comments
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Assumptions, exclusions, and clarifications stay
                          private to this response draft.
                        </p>
                      </div>
                      <Badge variant="outline">Private draft</Badge>
                    </div>
                    {controlsLocked ? (
                      ledger.commentsHtml ? (
                        <FieldRichTextPreview
                          ariaLabel="Additional quote comments"
                          value={ledger.commentsHtml}
                        />
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          No additional comments were saved.
                        </p>
                      )
                    ) : (
                      <FieldRichTextEditor
                        ariaLabel="Additional quote comments"
                        editorMinHeightClass="[&_.ProseMirror]:min-h-28"
                        onChange={updateComments}
                        placeholder="Add comments, exclusions, or assumptions…"
                        value={ledger.commentsHtml}
                      />
                    )}
                  </div>
                  <ResponseAttachments
                    attachmentError={attachmentError}
                    attachments={responseLedgerSource?.attachments ?? []}
                    onFileChange={uploadAttachment}
                    readOnly={controlsLocked}
                    uploading={uploading}
                  />
                </div>
              </LedgerSection>
              <LedgerSection
                description="Review the separate subtotals before immutable submission becomes available."
                id="review"
                title="Review"
              >
                <ReviewBand
                  expandedSubtotal={expandedSubtotal}
                  labourSubtotal={labourSubtotal}
                  lifecycle={lifecycle?.result ?? null}
                  lifecycleMessage={lifecycleMessage}
                  lifecyclePending={lifecyclePending}
                  materialSubtotal={materialSubtotal}
                  onStartRevision={startResponseRevision}
                  onSubmit={submitCurrentDraft}
                  onWithdraw={withdrawCurrentResponse}
                  onWithdrawalExplanationChange={setWithdrawalExplanation}
                  readOnly={readOnly}
                  submissionBlocked={copiedValuesConfirmationRequired}
                  total={total}
                  withdrawalExplanation={withdrawalExplanation}
                />
              </LedgerSection>
            </FramePanel>
          </Frame>
          <LedgerRail access={access} readOnly={readOnly} total={total} />
        </div>
      </div>
      <LedgerPersistentReview
        readOnly={readOnly}
        syncMessage={syncMessage}
        total={total}
      />
    </main>
  );
}

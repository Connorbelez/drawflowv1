import { MoveRight, Plus, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { tiptapJsonEqual } from "#/components/rich-text/tiptap-json.ts";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  dateFromProposalDayOffset,
  dayOffsetFromProposalDate,
  inclusiveEndDateFromProposalSchedule,
  proposalDurationDaysFromInclusiveDates,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import { ProposalSubmilestoneScopeController } from "../submilestone-scope/ProposalSubmilestoneScopeController.tsx";
import type { ScopeRevisionSurfaceRoute } from "../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx";
import {
  BlueprintInput,
  parseTiptapEditorValue,
  stringifyTiptapDocument,
} from "./TimelineMilestoneWorksheetColumns.tsx";
import {
  DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
  DURATION_PREFIX_REGEX,
  NON_DIGIT_REGEX,
  formatBps,
  formatInclusiveEndTOffset,
  formatTOffset,
  normalizeCurrencyText,
  normalizeDurationText,
  normalizePercentText,
  parsePercentToBps,
  parseTOffsetDay,
  parseDurationDays,
  sanitizeSubMilestoneName,
  subMilestoneDateRangeLabel,
  subMilestoneStartDay,
  subMilestoneTOffsetRangeLabel,
  type MilestoneMoveTarget,
  type SubMilestoneBankItem,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineScheduleDisplayMode,
  type WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import { SubMilestoneBankPicker } from "./TimelineMilestoneWorksheetGuidance.tsx";

export function SubMilestoneEditor({
  activeSubMilestoneId,
  mode,
  moveTargetRows,
  onCommitField,
  onActiveSubMilestoneChange,
  onAddSubMilestone,
  onMoveSubMilestone,
  onRemoveSubMilestone,
  onSubMilestoneEditorDirtyChange,
  onUpdateSubMilestone,
  proposalSubmittedAt,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  scopeRoute,
  scopeWorkosOrganizationId,
  scopeEditorResetVersion = 0,
  viewerCapacity,
}: {
  activeSubMilestoneId?: string;
  mode: WorksheetMode;
  moveTargetRows: MilestoneMoveTarget[];
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onMoveSubMilestone: (subMilestoneId: string, targetRowKey: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onSubMilestoneEditorDirtyChange: (
    rowKey: string,
    subMilestoneId: string,
    group: "fieldGuidance" | "scope",
    dirty: boolean
  ) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  onCommitField: () => void;
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  scopeEditorResetVersion?: number;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const subMilestones = row.subMilestoneDetails;
  const activeSubMilestone =
    subMilestones.find((detail) => detail.id === activeSubMilestoneId) ??
    subMilestones[0];
  const activeSubMilestoneIdForEditor = activeSubMilestone?.id ?? "";
  const valueLabel = mode === "settings" ? "PoC" : "Budget";
  const showDateSchedule =
    scheduleDisplayMode === "dates" && Boolean(proposedStartDate);
  const moveTargets = moveTargetRows.filter(
    (targetRow) => targetRow.key !== row.key
  );
  const reportScopeDirty = useCallback(
    (dirty: boolean) =>
      onSubMilestoneEditorDirtyChange(
        row.key,
        activeSubMilestoneIdForEditor,
        "scope",
        dirty
      ),
    [
      activeSubMilestoneIdForEditor,
      onSubMilestoneEditorDirtyChange,
      row.key,
    ]
  );

  return (
    <div className="timeline-submilestone-editor">
      <section
        aria-label={`${row.name} sub-milestones`}
        className="timeline-submilestone-list-pane"
      >
        <div className="timeline-submilestone-editor-heading">
          <div>
            <Badge className="timeline-blueprint-mini-badge" variant="outline">
              {subMilestones.length} sub-milestones
            </Badge>
            <p>{row.name}</p>
          </div>
          <SubMilestoneBankPicker
            existingNames={subMilestones.map((subMilestone) =>
              sanitizeSubMilestoneName(subMilestone.name)
            )}
            onAdd={onAddSubMilestone}
            rowKey={row.key}
          />
        </div>
        <div className="timeline-submilestone-card-list">
          {subMilestones.map((subMilestone) => {
            const selected = subMilestone.id === activeSubMilestone?.id;
            return (
              <ContextMenu key={subMilestone.id}>
                <ContextMenuTrigger
                  render={
                    <article
                      className="timeline-submilestone-card"
                      data-selected={selected ? "true" : undefined}
                      data-testid={`timeline-setup-submilestone-card-${subMilestone.id}`}
                    />
                  }
                >
                  <button
                    aria-pressed={selected}
                    className="timeline-submilestone-card-main"
                    onClick={() => onActiveSubMilestoneChange(subMilestone.id)}
                    type="button"
                  >
                    <span className="timeline-submilestone-card-title">
                      <strong>
                        {sanitizeSubMilestoneName(subMilestone.name)}
                      </strong>
                      <small>{subMilestone.description}</small>
                    </span>
                    <span className="timeline-submilestone-card-metrics">
                      <span>
                        <small>{valueLabel}</small>
                        <strong>
                          {mode === "settings"
                            ? (subMilestone.percentageText ??
                              formatBps(subMilestone.percentageBps ?? 0))
                            : subMilestone.budgetText}
                        </strong>
                      </span>
                      <span>
                        <small>
                          {showDateSchedule ? "Dates" : "T offsets"}
                        </small>
                        <strong>
                          {showDateSchedule && proposedStartDate
                            ? subMilestoneDateRangeLabel(
                                row,
                                subMilestone,
                                proposedStartDate
                              )
                            : subMilestoneTOffsetRangeLabel(row, subMilestone)}
                        </strong>
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={`Remove ${sanitizeSubMilestoneName(subMilestone.name)}`}
                    className="timeline-submilestone-remove"
                    data-testid={`timeline-setup-submilestone-remove-${subMilestone.id}`}
                    onClick={() => onRemoveSubMilestone(subMilestone.id)}
                    title={
                      subMilestones.length <= 1
                        ? "Removing the final Sub-milestone also removes this Milestone from the proposal plan."
                        : undefined
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-64">
                  <ContextMenuGroup>
                    <ContextMenuLabel className="truncate">
                      Move sub-milestone
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    {moveTargets.length > 0 ? (
                      moveTargets.map((targetRow) => (
                        <ContextMenuItem
                          key={targetRow.key}
                          onClick={(event) => {
                            event.preventDefault();
                            onMoveSubMilestone(subMilestone.id, targetRow.key);
                          }}
                        >
                          <MoveRight aria-hidden="true" />
                          <span className="truncate">
                            Move to {targetRow.name}
                          </span>
                        </ContextMenuItem>
                      ))
                    ) : (
                      <ContextMenuItem disabled>
                        No other milestones
                      </ContextMenuItem>
                    )}
                  </ContextMenuGroup>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Selected sub-milestone details"
        className="timeline-submilestone-detail-pane"
      >
        <SubMilestoneDetailEditor
          activeSubMilestone={activeSubMilestone}
          key={`scope-${activeSubMilestoneIdForEditor}-${scopeEditorResetVersion}`}
          mode={mode}
          onAddSubMilestone={onAddSubMilestone}
          onCommitField={onCommitField}
          onDirtyChange={reportScopeDirty}
          onRemoveSubMilestone={onRemoveSubMilestone}
          onUpdateSubMilestone={onUpdateSubMilestone}
          proposalSubmittedAt={proposalSubmittedAt}
          proposedStartDate={proposedStartDate}
          row={row}
          scheduleDisplayMode={scheduleDisplayMode}
          scopeRoute={scopeRoute}
          scopeWorkosOrganizationId={scopeWorkosOrganizationId}
          viewerCapacity={viewerCapacity}
        />
      </section>
    </div>
  );
}

export function SubMilestoneDetailEditor({
  activeSubMilestone,
  mode,
  onAddSubMilestone,
  onCommitField,
  onDirtyChange,
  onRemoveSubMilestone,
  onUpdateSubMilestone,
  proposalSubmittedAt,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  scopeRoute,
  scopeWorkosOrganizationId,
  viewerCapacity,
}: {
  activeSubMilestone?: TimelineMilestoneWorksheetSubMilestone;
  mode: WorksheetMode;
  onAddSubMilestone?: (item?: SubMilestoneBankItem) => void;
  onCommitField: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const valueLabel = mode === "settings" ? "PoC" : "Budget";
  const initialScopeValue = activeSubMilestone?.scopeOfWorkTiptapJson ?? "";
  const [scopeDraft, setScopeDraft] = useState(initialScopeValue);
  const [savedScopeDraft, setSavedScopeDraft] = useState(initialScopeValue);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeSaveError, setScopeSaveError] = useState<string | null>(null);
  const scopeCanonicalValueRef = useRef(initialScopeValue);
  const scopeDirty = !tiptapJsonEqual(scopeDraft, savedScopeDraft);
  const valueFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-value-label-${activeSubMilestone.id}`
    : undefined;
  const durationFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-duration-label-${activeSubMilestone.id}`
    : undefined;
  const showDateSchedule =
    scheduleDisplayMode === "dates" && Boolean(proposedStartDate);

  useEffect(() => {
    if (
      !(scopeDirty || scopeSaving) &&
      scopeCanonicalValueRef.current !== initialScopeValue
    ) {
      scopeCanonicalValueRef.current = initialScopeValue;
      setScopeDraft(initialScopeValue);
      setSavedScopeDraft(initialScopeValue);
      setScopeSaveError(null);
    }
  }, [initialScopeValue, scopeDirty, scopeSaving]);

  useEffect(() => {
    const reportDirty = onDirtyChange;
    reportDirty(scopeDirty);
    return () => {
      // Capture the callback from this render so unmounting the editor clears
      // the key that this editor actually reported.
      reportDirty(false);
    };
  }, [onDirtyChange, scopeDirty]);

  const saveScope = async () => {
    if (!(activeSubMilestone && scopeDirty) || scopeSaving) {
      return;
    }
    setScopeSaving(true);
    setScopeSaveError(null);
    try {
      await onUpdateSubMilestone(
        activeSubMilestone.id,
        { scopeOfWorkTiptapJson: scopeDraft },
        {
          commit: true,
          save: {
            group: "scope",
            rowKey: row.key,
            subMilestoneId: activeSubMilestone.id,
          },
        }
      );
      setSavedScopeDraft(scopeDraft);
    } catch (caught) {
      setScopeSaveError(
        caught instanceof Error ? caught.message : "Scope save failed."
      );
    } finally {
      setScopeSaving(false);
    }
  };

  if (!activeSubMilestone) {
    return (
      <div className="timeline-submilestone-empty">
        <strong>No sub-milestones</strong>
        {onAddSubMilestone ? (
          <button
            onClick={() =>
              onAddSubMilestone({
                category: "Custom",
                description: "Custom scope checkpoint",
                durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                name: "New sub-milestone",
              })
            }
            type="button"
          >
            <Plus aria-hidden="true" />
            Add sub-milestone
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="timeline-submilestone-detail-body"
      key={activeSubMilestone.id}
    >
      <div className="timeline-submilestone-detail-header">
        <span>Selected sub-milestone</span>
        <strong>{sanitizeSubMilestoneName(activeSubMilestone.name)}</strong>
      </div>
      <label className="timeline-submilestone-detail-field is-wide">
        <span>Name</span>
        <input
          aria-label="Sub-milestone name"
          data-testid={`timeline-setup-submilestone-name-${activeSubMilestone.id}`}
          onBlur={onCommitField}
          onChange={(event) =>
            onUpdateSubMilestone(
              activeSubMilestone.id,
              {
                name: event.currentTarget.value,
              },
              { commit: false }
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitField();
              event.currentTarget.blur();
            }
          }}
          value={activeSubMilestone.name}
        />
      </label>
      {mode === "setup" && scopeRoute && proposalSubmittedAt !== undefined ? (
        <ProposalSubmilestoneScopeController
          onDirtyChange={onDirtyChange}
          proposalSubmilestoneId={activeSubMilestone.proposalSubmilestoneId}
          scopeRoute={scopeRoute}
          viewerCapacity={viewerCapacity}
          workosOrganizationId={scopeWorkosOrganizationId}
        />
      ) : (
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <div className="flex items-center justify-between gap-2">
            <span>Scope</span>
            <Button
              data-testid={`timeline-setup-submilestone-scope-save-${activeSubMilestone.id}`}
              disabled={!scopeDirty || scopeSaving}
              onClick={saveScope}
              size="sm"
              type="button"
            >
              {scopeSaving ? "Saving…" : "Save scope"}
            </Button>
          </div>
          <FieldRichTextEditor
            ariaLabel={`${sanitizeSubMilestoneName(activeSubMilestone.name)} scope`}
            editable={!scopeSaving}
            editorMinHeightClass="[&_.ProseMirror]:min-h-44"
            onChange={(html) => setScopeDraft(html)}
            onDocumentChange={(document) =>
              setScopeDraft(stringifyTiptapDocument(document))
            }
            placeholder="Describe the contractual work scope…"
            testId={`timeline-setup-submilestone-description-${activeSubMilestone.id}`}
            value={parseTiptapEditorValue(scopeDraft)}
          />
          {scopeSaveError ? (
            <p className="text-destructive text-xs" role="alert">
              {scopeSaveError}
            </p>
          ) : null}
        </div>
      )}
      <div className="timeline-submilestone-detail-grid">
        <div className="timeline-submilestone-detail-field">
          <span id={valueFieldLabelId}>{valueLabel}</span>
          <BlueprintInput
            align="right"
            className="timeline-submilestone-detail-input"
            label={`Sub-milestone ${valueLabel.toLowerCase()}`}
            labelledBy={valueFieldLabelId}
            onBlur={() =>
              onUpdateSubMilestone(
                activeSubMilestone.id,
                mode === "settings"
                  ? {
                      percentageBps: parsePercentToBps(
                        activeSubMilestone.percentageText ?? ""
                      ),
                      percentageText: normalizePercentText(
                        activeSubMilestone.percentageText ?? ""
                      ),
                    }
                  : {
                      budgetText: normalizeCurrencyText(
                        activeSubMilestone.budgetText
                      ),
                    },
                { commit: true }
              )
            }
            onChange={(value) =>
              onUpdateSubMilestone(
                activeSubMilestone.id,
                mode === "settings"
                  ? {
                      percentageBps: parsePercentToBps(value),
                      percentageText: value,
                    }
                  : { budgetText: value },
                { commit: false }
              )
            }
            onCommit={onCommitField}
            testId={`timeline-setup-submilestone-budget-${activeSubMilestone.id}`}
            value={
              mode === "settings"
                ? (activeSubMilestone.percentageText ??
                  formatBps(activeSubMilestone.percentageBps ?? 0))
                : activeSubMilestone.budgetText
            }
          />
        </div>
        {showDateSchedule && proposedStartDate ? (
          <>
            <div className="timeline-submilestone-detail-field">
              <span>Start</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone start date"
                onBlur={onCommitField}
                onChange={(startDate) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      startDay: dayOffsetFromProposalDate(
                        proposedStartDate,
                        startDate
                      ),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-start-date-${activeSubMilestone.id}`}
                type="date"
                value={dateFromProposalDayOffset(
                  proposedStartDate,
                  subMilestoneStartDay(row, activeSubMilestone)
                )}
              />
            </div>
            <div className="timeline-submilestone-detail-field">
              <span>End</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone end date"
                onBlur={onCommitField}
                onChange={(endDate) => {
                  const startDate = dateFromProposalDayOffset(
                    proposedStartDate,
                    subMilestoneStartDay(row, activeSubMilestone)
                  );
                  const durationDays = proposalDurationDaysFromInclusiveDates(
                    startDate,
                    endDate
                  );
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: String(durationDays),
                    },
                    { commit: false }
                  );
                }}
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-end-date-${activeSubMilestone.id}`}
                type="date"
                value={inclusiveEndDateFromProposalSchedule(
                  proposedStartDate,
                  subMilestoneStartDay(row, activeSubMilestone),
                  parseDurationDays(activeSubMilestone.durationText)
                )}
              />
            </div>
          </>
        ) : (
          <>
            <div className="timeline-submilestone-detail-field">
              <span>Start</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone T offset start"
                onBlur={onCommitField}
                onChange={(startText) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      startDay: parseTOffsetDay(startText),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-start-offset-${activeSubMilestone.id}`}
                value={formatTOffset(
                  subMilestoneStartDay(row, activeSubMilestone)
                )}
              />
            </div>
            <div className="timeline-submilestone-detail-field">
              <span id={durationFieldLabelId}>Duration</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone duration"
                labelledBy={durationFieldLabelId}
                onBlur={() =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: normalizeDurationText(
                        activeSubMilestone.durationText
                      ),
                    },
                    { commit: true }
                  )
                }
                onChange={(durationText) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: durationText
                        .replace(DURATION_PREFIX_REGEX, "")
                        .replace(NON_DIGIT_REGEX, ""),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-duration-${activeSubMilestone.id}`}
                value={`T${activeSubMilestone.durationText}`}
              />
            </div>
            <div className="timeline-submilestone-detail-field">
              <span>End</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone T offset end"
                onBlur={() => undefined}
                onChange={() => undefined}
                readOnly
                testId={`timeline-setup-submilestone-end-offset-${activeSubMilestone.id}`}
                value={formatInclusiveEndTOffset(
                  subMilestoneStartDay(row, activeSubMilestone),
                  parseDurationDays(activeSubMilestone.durationText)
                )}
              />
            </div>
          </>
        )}
      </div>
      <button
        aria-label={`Remove ${sanitizeSubMilestoneName(activeSubMilestone.name)}`}
        className="timeline-submilestone-detail-remove"
        data-testid={`timeline-setup-submilestone-detail-remove-${activeSubMilestone.id}`}
        onClick={() => onRemoveSubMilestone(activeSubMilestone.id)}
        title={
          row.subMilestoneDetails.length <= 1
            ? "Removing the final Sub-milestone also removes this Milestone from the proposal plan."
            : undefined
        }
        type="button"
      >
        <Trash2 aria-hidden="true" />
        Remove sub-milestone
      </button>
    </div>
  );
}

import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { firstPermitDocument } from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";
import {
  PacketMilestoneEditorOverlay,
  PacketSubmilestoneOverlay,
} from "./production-proposal-packet-editors.tsx";
import {
  PacketBuildDetailsSummary,
  PacketClosingFinancialsSummary,
  PacketPermitUploadPanel,
  PacketProposedStartDateControl,
} from "./production-proposal-packet-support.tsx";
import { PacketMilestoneTable } from "./production-proposal-packet-milestone-table.tsx";
import { isValidIsoDateOnly } from "./proposalScheduleDates.ts";
import {
  isValidProposalStartDate,
  normalizePacketMilestoneFormDraft,
  packetMilestoneFormDraftFromGroup,
  proposalPacketMilestoneGroups,
  uniquePacketKey,
} from "./production-proposal-packet-utils.tsx";
import type {
  PacketMilestoneCreatePayload,
  PacketMilestoneFormDraft,
  PacketMilestoneGroup,
  PacketMilestonePatch,
  PacketSubmilestoneFormDraft,
  PacketSubmilestoneOverlayDraft,
  PacketSubmilestonePatch,
  ProductionProposalDetail,
} from "./production-proposal-surface-contracts";
import {
  calculateProposalApprovedAmountCents,
  calculateProposalTotalDrawAmountCents,
  DetailGrid,
  digitDraftValue,
  dollarsInputToOptionalCents,
  formatCents,
  formatInterestAnnualBps,
  parseInteger,
  parseRequiredInteger,
  productionProposalActionErrorMessage,
  Section,
  statusLabel,
} from "./production-proposal-surface-shared";

export function ProposalPacketSnapshot({
  detail,
  mergedWithReview = false,
  onCreateMilestone,
  onUpdateMilestone,
  onUpdatePermitDocument,
  onUpdateProposedStartDate,
}: {
  detail: ProductionProposalDetail;
  mergedWithReview?: boolean;
  onCreateMilestone?: (
    milestone: PacketMilestoneCreatePayload
  ) => Promise<unknown> | unknown;
  onUpdateMilestone?: (
    milestoneKey: string,
    patch: PacketMilestonePatch
  ) => Promise<unknown> | unknown;
  onUpdatePermitDocument?: (file: File) => Promise<unknown> | unknown;
  onUpdateProposedStartDate?: (
    proposedStartDate: string
  ) => Promise<unknown> | unknown;
}) {
  const proposal = detail.proposal;
  const [dateDisplayMode, setDateDisplayMode] = useState<"relative" | "real">(
    "relative"
  );
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState(
    proposal.proposedStartDate ?? ""
  );
  const [startDatePending, setStartDatePending] = useState(false);
  const [editingMilestoneKey, setEditingMilestoneKey] = useState<string | null>(
    null
  );
  const [pendingMilestoneKey, setPendingMilestoneKey] = useState<string | null>(
    null
  );
  const [milestoneDraft, setMilestoneDraft] =
    useState<PacketMilestoneFormDraft | null>(null);
  const [submilestoneOverlayDraft, setSubmilestoneOverlayDraft] =
    useState<PacketSubmilestoneOverlayDraft | null>(null);
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);
  const canUploadPermit =
    Boolean(onUpdatePermitDocument) && proposal.status !== "closed";
  const draws = detail.draws ?? detail.plannedDraws ?? [];
  const approvedAmountCents = calculateProposalApprovedAmountCents(
    proposal,
    draws
  );
  const totalDrawAmountCents = calculateProposalTotalDrawAmountCents(draws);
  const borrowerCoPayCents =
    proposal.borrowerCoPayCents ??
    Math.max(0, proposal.totalBudgetCents - approvedAmountCents);
  const closingGapCents = Math.max(
    0,
    proposal.totalBudgetCents - approvedAmountCents - borrowerCoPayCents
  );
  const closingState = detail.activeBuild?.startDate
    ? `Closed, starts ${detail.activeBuild.startDate}`
    : proposal.status === "approved"
      ? "Approved, closing pending"
      : "Pre-closing review";
  const satelliteUrl = createGoogleSatelliteMapUrl({
    address: proposal.location,
    markerLabel: "B",
    zoom: 18,
  });
  const milestoneGroups = proposalPacketMilestoneGroups(detail);
  const existingMilestoneKeys = new Set(
    milestoneGroups.map((group) => group.milestone.key)
  );
  const projectDurationDays =
    (detail.milestones ?? []).length > 0
      ? Math.max(
          ...(detail.milestones ?? []).map((milestone) => milestone.dayEnd)
        )
      : 0;
  const canEditMilestones = Boolean(onUpdateMilestone);
  const canCreateMilestones = Boolean(onCreateMilestone);
  const canManageMilestones = canEditMilestones || canCreateMilestones;
  const canEditProposedStartDate = Boolean(onUpdateProposedStartDate);
  const proposedStartDate = proposal.proposedStartDate ?? "";
  const canShowRealDates = isValidProposalStartDate(proposedStartDate);

  useEffect(() => {
    setStartDateDraft(proposal.proposedStartDate ?? "");
    if (!proposal.proposedStartDate) {
      setDateDisplayMode("relative");
    }
  }, [proposal.proposedStartDate]);

  function beginMilestoneEdit(group: PacketMilestoneGroup) {
    setEditingMilestoneKey(group.milestone.key);
    setMilestoneDraft(packetMilestoneFormDraftFromGroup(group));
  }

  function beginMilestoneCreate() {
    setEditingMilestoneKey(null);
    const nextOrder =
      milestoneGroups.reduce(
        (maxOrder, group) => Math.max(maxOrder, group.milestone.order),
        0
      ) + 1;
    const nextStartDay =
      milestoneGroups.length > 0
        ? Math.max(...milestoneGroups.map((group) => group.milestone.dayEnd))
        : 0;
    setMilestoneDraft({
      budgetDollars: "",
      dayEnd: String(nextStartDay + 7),
      dayStart: String(nextStartDay),
      milestoneKey: `milestone-${nextOrder}`,
      mode: "create",
      name: "",
      order: nextOrder,
      submilestones: [],
    });
  }

  function updateMilestoneDraft(patch: Partial<PacketMilestoneFormDraft>) {
    setMilestoneDraft((current) => (current ? { ...current, ...patch } : null));
  }

  function updateSubmilestoneDraft(
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) =>
              submilestone.key === key
                ? { ...submilestone, ...patch }
                : submilestone
            ),
          }
        : null
    );
  }

  function updateSubmilestoneStartDayDraft(key: string, value: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) => {
              if (submilestone.key !== key) {
                return submilestone;
              }
              return {
                ...submilestone,
                startDay: digitDraftValue(value),
              };
            }),
          }
        : null
    );
  }

  function updateSubmilestoneEndDayDraft(key: string, value: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) => {
              if (submilestone.key !== key) {
                return submilestone;
              }
              return {
                ...submilestone,
                dayEnd: digitDraftValue(value),
              };
            }),
          }
        : null
    );
  }

  /**
   * Commits a window-only edit (start day + duration) for an individual
   * submilestone by rebuilding the full PacketMilestonePatch from the current
   * group. Mirrors the exclusive-end semantics of the packet table
   * (dayEnd = startDay + durationDays) and reuses ScheduleWindowPicker so the
   * existing-proposal packet surface matches the worksheet-table interaction.
   */
  async function commitSubmilestoneWindow(
    group: PacketMilestoneGroup,
    window: ScheduleWindowValue,
    submilestoneKey: string
  ) {
    if (!onUpdateMilestone) {
      return;
    }
    const nextStartDay = Math.round(window.startDay);
    const nextDurationDays = Math.max(1, Math.round(window.durationDays));
    const milestone = group.milestone;

    const submilestonePatches: PacketSubmilestonePatch[] =
      group.submilestones.map((submilestone, index) => {
        const currentStartDay =
          submilestone.startDay ??
          milestone.dayStart + group.fallbackStartOffsets[index];
        const currentDurationDays =
          submilestone.durationDays ?? group.fallbackDurations[index] ?? 1;
        const budgetCents =
          submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
        if (submilestone.key !== submilestoneKey) {
          return {
            budgetCents,
            durationDays: currentDurationDays,
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order ?? index + 1,
            startDay: currentStartDay,
          };
        }
        return {
          budgetCents,
          durationDays: nextDurationDays,
          key: submilestone.key,
          name: submilestone.name,
          order: submilestone.order ?? index + 1,
          startDay: nextStartDay,
        };
      });

    // The milestone window is always recomputed from the (now-updated)
    // submilestone windows. dayEnd uses exclusive-end semantics to match the
    // packet labels and the save path's validation.
    const windows = submilestonePatches.map((submilestone) => ({
      dayEnd: (submilestone.startDay ?? 0) + (submilestone.durationDays ?? 1),
      dayStart: submilestone.startDay ?? 0,
    }));
    const dayStart = Math.min(...windows.map((w) => w.dayStart));
    const dayEnd = Math.max(...windows.map((w) => w.dayEnd));

    const patch: PacketMilestonePatch = {
      budgetCents: milestone.budgetCents,
      dayEnd,
      dayStart,
      durationDays: Math.max(1, dayEnd - dayStart),
      name: milestone.name,
      submilestones: submilestonePatches,
    };

    setPendingMilestoneKey(milestone.key);
    try {
      await onUpdateMilestone(milestone.key, patch);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  function updateSubmilestoneOverlayStartDay(value: string) {
    setSubmilestoneOverlayDraft((current) => {
      if (!current) {
        return null;
      }
      return {
        ...current,
        startDay: digitDraftValue(value),
      };
    });
  }

  function updateSubmilestoneOverlayEndDay(value: string) {
    setSubmilestoneOverlayDraft((current) =>
      current
        ? {
            ...current,
            dayEnd: digitDraftValue(value),
          }
        : null
    );
  }

  function removeSubmilestoneDraft(key: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones
              .filter((submilestone) => submilestone.key !== key)
              .map((submilestone, index) => ({
                ...submilestone,
                order: index + 1,
              })),
          }
        : null
    );
  }

  function openAddSubmilestone(group: PacketMilestoneGroup) {
    const activeDraft =
      milestoneDraft?.mode === "edit" &&
      milestoneDraft.milestoneKey === group.milestone.key
        ? milestoneDraft
        : packetMilestoneFormDraftFromGroup(group);
    if (!activeDraft) {
      return;
    }
    setSubmilestoneOverlayDraft({
      budgetDollars: "",
      dayEnd: String(parseInteger(activeDraft.dayStart) + 1),
      milestoneKey: group.milestone.key,
      name: "",
      order: activeDraft.submilestones.length + 1,
      startDay: activeDraft.dayStart,
    });
  }

  function openAddSubmilestoneForDraft() {
    if (!milestoneDraft) {
      return;
    }
    setSubmilestoneOverlayDraft({
      budgetDollars: "",
      dayEnd: String(parseInteger(milestoneDraft.dayStart) + 1),
      milestoneKey: milestoneDraft.milestoneKey,
      name: "",
      order: milestoneDraft.submilestones.length + 1,
      startDay: milestoneDraft.dayStart,
    });
  }

  async function saveSubmilestoneOverlayDraft() {
    if (!submilestoneOverlayDraft) {
      return;
    }
    const name = submilestoneOverlayDraft.name.trim();
    if (!name) {
      toast.error("Submilestone name is required.");
      return;
    }
    const startDay = parseRequiredInteger(submilestoneOverlayDraft.startDay);
    const dayEnd = parseRequiredInteger(submilestoneOverlayDraft.dayEnd);
    if (startDay === null || startDay < 0) {
      toast.error("Submilestone start day is invalid.");
      return;
    }
    if (dayEnd === null || dayEnd <= startDay) {
      toast.error("Submilestone end day is invalid.");
      return;
    }
    const budgetCents = dollarsInputToOptionalCents(
      submilestoneOverlayDraft.budgetDollars
    );
    if (budgetCents !== undefined && budgetCents < 0) {
      toast.error("Submilestone budget is invalid.");
      return;
    }
    const creatingMilestone =
      milestoneDraft?.mode === "create" &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
        ? milestoneDraft
        : null;
    const targetGroup = milestoneGroups.find(
      (group) => group.milestone.key === submilestoneOverlayDraft.milestoneKey
    );
    let targetDraft = creatingMilestone;
    if (
      !targetDraft &&
      milestoneDraft?.mode === "edit" &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
    ) {
      targetDraft = milestoneDraft;
    }
    if (!targetDraft && targetGroup) {
      targetDraft = packetMilestoneFormDraftFromGroup(targetGroup);
    }
    if (!targetDraft) {
      toast.error("Milestone was not found.");
      return;
    }
    const existingKeys = new Set(
      targetDraft.submilestones.map((submilestone) => submilestone.key)
    );
    const key = uniquePacketKey(name, "submilestone", existingKeys);
    const nextSubmilestones = [
      ...targetDraft.submilestones,
      {
        budgetDollars: submilestoneOverlayDraft.budgetDollars,
        dayEnd: String(dayEnd),
        key,
        name,
        order: targetDraft.submilestones.length + 1,
        startDay: String(startDay),
      },
    ];
    if (
      milestoneDraft &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
    ) {
      updateMilestoneDraft({
        submilestones: nextSubmilestones,
      });
      setSubmilestoneOverlayDraft(null);
      return;
    }
    if (!onUpdateMilestone) {
      return;
    }
    const nextDraft = {
      ...targetDraft,
      submilestones: [...nextSubmilestones],
    };
    const normalized = normalizePacketMilestoneFormDraft(nextDraft);
    if (!normalized) {
      return;
    }
    setPendingMilestoneKey(targetDraft.milestoneKey);
    try {
      await onUpdateMilestone(targetDraft.milestoneKey, normalized);
      setSubmilestoneOverlayDraft(null);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  async function saveMilestoneDraft() {
    if (!milestoneDraft) {
      return;
    }
    const normalized = normalizePacketMilestoneFormDraft(milestoneDraft);
    if (!normalized) {
      return;
    }
    if (milestoneDraft.mode === "edit" && !onUpdateMilestone) {
      return;
    }
    if (milestoneDraft.mode === "create" && !onCreateMilestone) {
      return;
    }
    const pendingKey = milestoneDraft.milestoneKey;
    setPendingMilestoneKey(pendingKey);
    try {
      if (milestoneDraft.mode === "edit") {
        await onUpdateMilestone?.(milestoneDraft.milestoneKey, normalized);
      } else {
        const milestoneKey = uniquePacketKey(
          normalized.name,
          milestoneDraft.milestoneKey,
          existingMilestoneKeys
        );
        await onCreateMilestone?.({
          ...normalized,
          dependencyKeys: [],
          drawAvailabilityCents: normalized.budgetCents,
          evidenceState: "Draft package",
          milestoneKey,
          order: milestoneDraft.order,
          policyState: "Draft policy review",
          x: normalized.dayStart,
        });
      }
      setMilestoneDraft(null);
      setEditingMilestoneKey(null);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  async function saveProposedStartDate() {
    if (!onUpdateProposedStartDate) {
      return;
    }
    if (!isValidIsoDateOnly(startDateDraft)) {
      toast.error("Enter a valid proposed start date.");
      return;
    }
    setStartDatePending(true);
    try {
      await onUpdateProposedStartDate(startDateDraft);
      setDateDisplayMode("real");
      setEditingStartDate(false);
      toast.success("Proposed start date updated.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setStartDatePending(false);
    }
  }

  async function uploadPermitDocument(files: File[]) {
    const file = files[0];
    if (!(file && onUpdatePermitDocument)) {
      return;
    }
    try {
      await onUpdatePermitDocument(file);
      toast.success("Permit uploaded.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
      throw error;
    }
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="grid gap-4">
        <Section title="Build, site, and loan summary">
          <div className="grid gap-4 2xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
            <div className="overflow-hidden rounded-lg border bg-muted">
              {satelliteUrl ? (
                <img
                  alt={`${proposal.buildName} satellite view`}
                  className="aspect-[16/9] w-full object-cover"
                  height={360}
                  src={satelliteUrl}
                  width={640}
                />
              ) : (
                <div className="grid aspect-[16/9] place-items-center p-4 text-center text-muted-foreground text-sm">
                  Satellite image unavailable. Add VITE_GOOGLE_MAPS_API_KEY to
                  render the site view.
                </div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailGrid
                rows={[
                  ...(mergedWithReview
                    ? []
                    : ([
                        ["Build", proposal.buildName],
                        ["Location", proposal.location],
                        ["Status", statusLabel(proposal.status)],
                      ] as [string, ReactNode][])),
                  [
                    "Proposed start date",
                    <PacketProposedStartDateControl
                      canEdit={canEditProposedStartDate}
                      draft={startDateDraft}
                      editing={editingStartDate}
                      onCancel={() => {
                        setStartDateDraft(proposal.proposedStartDate ?? "");
                        setEditingStartDate(false);
                      }}
                      onDraftChange={setStartDateDraft}
                      onEdit={() => setEditingStartDate(true)}
                      onSave={() => void saveProposedStartDate()}
                      pending={startDatePending}
                      value={proposal.proposedStartDate}
                    />,
                  ],
                  ["Planned duration", `${projectDurationDays} days`],
                  ...(mergedWithReview
                    ? ([
                        [
                          "Submilestones",
                          String(detail.submilestones?.length ?? 0),
                        ],
                      ] as [string, ReactNode][])
                    : []),
                ]}
              />
              <DetailGrid
                rows={[
                  ...(mergedWithReview
                    ? []
                    : ([
                        ["Loan principal", formatCents(approvedAmountCents)],
                        [
                          "Interest rate",
                          formatInterestAnnualBps(
                            detail.loanFacility?.interestAnnualBps ??
                              proposal.interestAnnualBps ??
                              925
                          ),
                        ],
                      ] as [string, ReactNode][])),
                  ["Interest trigger", "Funds released"],
                  ["Reimbursement model", "Work complete before release"],
                ]}
              />
            </div>
          </div>
        </Section>
        <PacketMilestoneTable
          beginMilestoneCreate={beginMilestoneCreate}
          beginMilestoneEdit={beginMilestoneEdit}
          canCreateMilestones={canCreateMilestones}
          canEditMilestones={canEditMilestones}
          canManageMilestones={canManageMilestones}
          canShowRealDates={canShowRealDates}
          commitSubmilestoneWindow={commitSubmilestoneWindow}
          dateDisplayMode={dateDisplayMode}
          editingMilestoneKey={editingMilestoneKey}
          milestoneDraft={milestoneDraft}
          milestoneGroups={milestoneGroups}
          openAddSubmilestone={openAddSubmilestone}
          pendingMilestoneKey={pendingMilestoneKey}
          proposedStartDate={proposedStartDate}
          removeSubmilestoneDraft={removeSubmilestoneDraft}
          saveMilestoneDraft={saveMilestoneDraft}
          setDateDisplayMode={setDateDisplayMode}
          setEditingMilestoneKey={setEditingMilestoneKey}
          setMilestoneDraft={setMilestoneDraft}
          updateMilestoneDraft={updateMilestoneDraft}
          updateSubmilestoneDraft={updateSubmilestoneDraft}
          updateSubmilestoneEndDayDraft={updateSubmilestoneEndDayDraft}
          updateSubmilestoneStartDayDraft={updateSubmilestoneStartDayDraft}
        />
        <Section title="Draw schedule snapshot">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Draw</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draws.map((draw) => (
                <TableRow key={draw.drawKey}>
                  <TableCell>{draw.label}</TableCell>
                  <TableCell>Day {draw.timingDay}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(draw.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
      <PacketMilestoneEditorOverlay
        draft={milestoneDraft?.mode === "create" ? milestoneDraft : null}
        onAddSubmilestone={openAddSubmilestoneForDraft}
        onClose={() => setMilestoneDraft(null)}
        onDraftChange={updateMilestoneDraft}
        onRemoveSubmilestone={removeSubmilestoneDraft}
        onSave={() => void saveMilestoneDraft()}
        onSubmilestoneChange={updateSubmilestoneDraft}
        pending={Boolean(pendingMilestoneKey)}
      />
      <PacketSubmilestoneOverlay
        draft={submilestoneOverlayDraft}
        onClose={() => setSubmilestoneOverlayDraft(null)}
        onDraftChange={(patch) =>
          setSubmilestoneOverlayDraft((current) =>
            current ? { ...current, ...patch } : null
          )
        }
        onEndDayChange={updateSubmilestoneOverlayEndDay}
        onSave={saveSubmilestoneOverlayDraft}
        onStartDayChange={updateSubmilestoneOverlayStartDay}
      />

      <div className="grid gap-4">
        <Section title="Closing financials">
          <PacketClosingFinancialsSummary
            approvedAmountCents={approvedAmountCents}
            borrowerCoPayCents={borrowerCoPayCents}
            borrowerStartingCashCents={proposal.borrowerStartingCashCents}
            closingGapCents={closingGapCents}
            closingState={closingState}
            lenderDrawPolicyLimitCents={proposal.lenderDrawPolicyLimitCents}
            mergedWithReview={mergedWithReview}
            scheduledReimbursementsCents={totalDrawAmountCents}
            totalBudgetCents={proposal.totalBudgetCents}
          />
        </Section>

        {mergedWithReview ? null : (
          <>
            <Section title="Build details">
              <PacketBuildDetailsSummary
                drawCount={draws.length}
                milestoneCount={detail.milestones?.length ?? 0}
                permitFileName={permit?.fileName}
                permitWaiverReason={detail.permitWaiver?.reason}
                projectDurationDays={projectDurationDays}
                submilestoneCount={detail.submilestones?.length ?? 0}
              />
            </Section>

            <Section title="Documents">
              <PacketPermitUploadPanel
                canUpload={canUploadPermit}
                onUpload={uploadPermitDocument}
                permit={permit}
                permitViewerDocument={permitViewerDocument}
                permitWaiverReason={detail.permitWaiver?.reason}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import type { ScheduleWindowValue } from "#/features/timeline-workspace/-ScheduleWindowPicker.tsx";
import {
  PacketComputedMilestoneValue,
  PacketDateDisplayToggle,
} from "./production-proposal-packet-support.tsx";
import {
  PacketSubmilestoneWindowCell,
  formatPacketWindow,
  packetMilestoneDraftPreview,
  packetSubmilestoneTableRows,
} from "./production-proposal-packet-utils.tsx";
import type {
  PacketMilestoneFormDraft,
  PacketMilestoneGroup,
} from "./production-proposal-surface-contracts";
import { Section, digitDraftValue, formatCents } from "./production-proposal-surface-shared";

export interface PacketMilestoneTableProps {
  beginMilestoneCreate: () => void;
  beginMilestoneEdit: (group: PacketMilestoneGroup) => void;
  canCreateMilestones: boolean;
  canEditMilestones: boolean;
  canManageMilestones: boolean;
  canShowRealDates: boolean;
  commitSubmilestoneWindow: (
    group: PacketMilestoneGroup,
    window: ScheduleWindowValue,
    submilestoneKey: string
  ) => Promise<unknown> | unknown;
  dateDisplayMode: "relative" | "real";
  editingMilestoneKey: string | null;
  milestoneDraft: PacketMilestoneFormDraft | null;
  milestoneGroups: PacketMilestoneGroup[];
  pendingMilestoneKey: string | null;
  proposedStartDate: string;
  removeSubmilestoneDraft: (key: string) => void;
  saveMilestoneDraft: () => Promise<unknown> | unknown;
  setDateDisplayMode: (mode: "relative" | "real") => void;
  setEditingMilestoneKey: (value: string | null) => void;
  setMilestoneDraft: (value: PacketMilestoneFormDraft | null) => void;
  updateMilestoneDraft: (patch: Partial<PacketMilestoneFormDraft>) => void;
  updateSubmilestoneDraft: (
    key: string,
    patch: Partial<PacketMilestoneFormDraft["submilestones"][number]>
  ) => void;
  updateSubmilestoneEndDayDraft: (key: string, value: string) => void;
  updateSubmilestoneStartDayDraft: (key: string, value: string) => void;
  openAddSubmilestone: (group: PacketMilestoneGroup) => void;
}

export function PacketMilestoneTable({
  beginMilestoneCreate,
  beginMilestoneEdit,
  canCreateMilestones,
  canEditMilestones,
  canManageMilestones,
  canShowRealDates,
  commitSubmilestoneWindow,
  dateDisplayMode,
  editingMilestoneKey,
  milestoneDraft,
  milestoneGroups,
  pendingMilestoneKey,
  proposedStartDate,
  removeSubmilestoneDraft,
  saveMilestoneDraft,
  setDateDisplayMode,
  setEditingMilestoneKey,
  setMilestoneDraft,
  updateMilestoneDraft,
  updateSubmilestoneDraft,
  updateSubmilestoneEndDayDraft,
  updateSubmilestoneStartDayDraft,
  openAddSubmilestone,
}: PacketMilestoneTableProps) {
  return (
    <Section
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canShowRealDates ? (
            <PacketDateDisplayToggle
              mode={dateDisplayMode}
              onModeChange={setDateDisplayMode}
            />
          ) : null}
          {canCreateMilestones ? (
            <Button onClick={beginMilestoneCreate} size="sm">
              <Plus aria-hidden />
              Add milestone
            </Button>
          ) : null}
        </div>
      }
      title="Milestone and submilestone worksheet"
    >
      <Table className="table-fixed">
        <colgroup>
          <col className={canManageMilestones ? "w-[54%]" : "w-[58%]"} />
          <col className={canManageMilestones ? "w-[24%]" : "w-[26%]"} />
          <col className={canManageMilestones ? "w-[14%]" : "w-[16%]"} />
          {canManageMilestones ? <col className="w-[8%]" /> : null}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>Window</TableHead>
            <TableHead className="text-right">Budget</TableHead>
            {canManageMilestones ? (
              <TableHead className="w-24 text-right">Edit</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestoneGroups.map((group) => {
            const pending = pendingMilestoneKey === group.milestone.key;
            const editing =
              editingMilestoneKey === group.milestone.key &&
              milestoneDraft?.mode === "edit"
                ? milestoneDraft
                : null;
            return (
              <Fragment key={group.milestone.key}>
                <TableRow className="h-16">
                  <TableCell className="font-medium">
                    {editing ? (
                      <Input
                        aria-label={`${group.milestone.name} scope`}
                        className="h-8 w-full"
                        onChange={(event) =>
                          updateMilestoneDraft({
                            name: event.currentTarget.value,
                          })
                        }
                        value={editing.name}
                      />
                    ) : (
                      <>
                        {group.milestone.name}
                        <div className="mt-1 text-muted-foreground text-xs">
                          {group.submilestones.length} submilestones
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {editing ? (
                      editing.submilestones.length > 0 ? (
                        <PacketComputedMilestoneValue
                          label="Calculated from submilestones"
                          value={formatPacketWindow({
                            dateDisplayMode,
                            dayEnd: packetMilestoneDraftPreview(editing).dayEnd,
                            dayStart:
                              packetMilestoneDraftPreview(editing).dayStart,
                            proposedStartDate,
                          })}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Input
                            aria-label={`${group.milestone.name} start day`}
                            className="h-8 w-20"
                            inputMode="numeric"
                            onChange={(event) =>
                              updateMilestoneDraft({
                                dayStart: digitDraftValue(
                                  event.currentTarget.value
                                ),
                              })
                            }
                            value={editing.dayStart}
                          />
                          <span className="text-muted-foreground text-xs">
                            to
                          </span>
                          <Input
                            aria-label={`${group.milestone.name} end day`}
                            className="h-8 w-20"
                            inputMode="numeric"
                            onChange={(event) =>
                              updateMilestoneDraft({
                                dayEnd: digitDraftValue(
                                  event.currentTarget.value
                                ),
                              })
                            }
                            value={editing.dayEnd}
                          />
                        </div>
                      )
                    ) : (
                      <>
                        {formatPacketWindow({
                          dateDisplayMode,
                          dayEnd: group.milestone.dayEnd,
                          dayStart: group.milestone.dayStart,
                          proposedStartDate,
                        })}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {editing ? (
                      editing.submilestones.length > 0 ? (
                        <PacketComputedMilestoneValue
                          align="right"
                          label="Calculated from submilestones"
                          value={formatCents(
                            packetMilestoneDraftPreview(editing).budgetCents
                          )}
                        />
                      ) : (
                        <Input
                          aria-label={`${group.milestone.name} budget`}
                          className="ml-auto h-8 w-32 text-right"
                          inputMode="decimal"
                          onChange={(event) =>
                            updateMilestoneDraft({
                              budgetDollars: event.currentTarget.value,
                            })
                          }
                          value={editing.budgetDollars}
                        />
                      )
                    ) : (
                      formatCents(group.milestone.budgetCents)
                    )}
                  </TableCell>
                  {canManageMilestones ? (
                    <TableCell className="text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            aria-label={`Add submilestone to ${group.milestone.name}`}
                            disabled={pending}
                            onClick={() => openAddSubmilestone(group)}
                            size="icon-xs"
                            title="Add submilestone"
                            variant="ghost"
                          >
                            <Plus aria-hidden />
                          </Button>
                          <Button
                            aria-label={`Save ${group.milestone.name} packet row`}
                            loading={pending}
                            onClick={() => void saveMilestoneDraft()}
                            size="icon-xs"
                            title="Save row"
                          >
                            <Check aria-hidden />
                          </Button>
                          <Button
                            aria-label={`Cancel ${group.milestone.name} packet row edit`}
                            disabled={pending}
                            onClick={() => {
                              setEditingMilestoneKey(null);
                              setMilestoneDraft(null);
                            }}
                            size="icon-xs"
                            title="Cancel edit"
                            variant="ghost"
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {canEditMilestones ? (
                            <Button
                              aria-label={`Add submilestone to ${group.milestone.name}`}
                              loading={pending}
                              onClick={() => openAddSubmilestone(group)}
                              size="icon-xs"
                              title="Add submilestone"
                              variant="ghost"
                            >
                              <Plus aria-hidden />
                            </Button>
                          ) : null}
                          {canEditMilestones ? (
                            <Button
                              aria-label={`Edit ${group.milestone.name} packet row`}
                              loading={pending}
                              onClick={() => beginMilestoneEdit(group)}
                              size="icon-xs"
                              title="Edit row"
                              variant="ghost"
                            >
                              <Pencil aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
                {packetSubmilestoneTableRows(group, editing).map(
                  (submilestone, index) => {
                    const { budgetCents, durationDays, startDay } =
                      submilestone;
                    return (
                      <TableRow
                        className="h-14 bg-muted/30"
                        key={`${group.milestone.key}-${submilestone.key}`}
                      >
                        <TableCell className="pl-8">
                          {editing ? (
                            <Input
                              aria-label={`${group.milestone.name} submilestone ${index + 1} name`}
                              className="h-8"
                              onChange={(event) =>
                                updateSubmilestoneDraft(submilestone.key, {
                                  name: event.currentTarget.value,
                                })
                              }
                              value={submilestone.name}
                            />
                          ) : (
                            <span className="font-medium">
                              {submilestone.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                aria-label={`${group.milestone.name} submilestone ${index + 1} start day`}
                                className="h-8 w-20"
                                inputMode="numeric"
                                onChange={(event) =>
                                  updateSubmilestoneStartDayDraft(
                                    submilestone.key,
                                    event.currentTarget.value
                                  )
                                }
                                value={submilestone.startDayDraft}
                              />
                              <span className="text-muted-foreground text-xs">
                                to
                              </span>
                              <Input
                                aria-label={`${group.milestone.name} submilestone ${index + 1} end day`}
                                className="h-8 w-20"
                                inputMode="numeric"
                                onChange={(event) =>
                                  updateSubmilestoneEndDayDraft(
                                    submilestone.key,
                                    event.currentTarget.value
                                  )
                                }
                                value={submilestone.dayEndDraft}
                              />
                            </div>
                          ) : canEditMilestones && canShowRealDates ? (
                            <PacketSubmilestoneWindowCell
                              dateDisplayMode={dateDisplayMode}
                              durationDays={durationDays}
                              onCommit={(window) =>
                                void commitSubmilestoneWindow(
                                  group,
                                  window,
                                  submilestone.key
                                )
                              }
                              pending={
                                pendingMilestoneKey === group.milestone.key
                              }
                              proposedStartDate={proposedStartDate}
                              startDay={startDay}
                              submilestoneName={submilestone.name}
                              testId={`packet-submilestone-window-${group.milestone.key}-${submilestone.key}`}
                            />
                          ) : (
                            <>
                              {formatPacketWindow({
                                dateDisplayMode,
                                dayEnd: startDay + durationDays,
                                dayStart: startDay,
                                proposedStartDate,
                              })}
                              <span className="ml-2 text-muted-foreground text-xs">
                                {durationDays}d
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editing ? (
                            <Input
                              aria-label={`${group.milestone.name} submilestone ${index + 1} budget`}
                              className="ml-auto h-8 w-28 text-right"
                              inputMode="decimal"
                              onChange={(event) =>
                                updateSubmilestoneDraft(submilestone.key, {
                                  budgetDollars: event.currentTarget.value,
                                })
                              }
                              value={submilestone.budgetDollars}
                            />
                          ) : (
                            formatCents(budgetCents)
                          )}
                        </TableCell>
                        {canManageMilestones ? (
                          <TableCell className="text-right">
                            {editing ? (
                              <Button
                                aria-label={`Remove ${submilestone.name || `submilestone ${index + 1}`}`}
                                onClick={() =>
                                  removeSubmilestoneDraft(submilestone.key)
                                }
                                size="icon-xs"
                                title="Remove submilestone"
                                variant="ghost"
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  }
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}

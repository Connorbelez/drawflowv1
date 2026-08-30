import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { formatCurrency } from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  type ContractorDrawerAvailableContractor,
  ContractorQuickAddDrawer,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  parseOptionalCurrencyCents,
  parseOptionalHours,
  sanitizeSubMilestoneName,
  subMilestoneNameById,
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetContractorOption,
  type TimelineMilestoneWorksheetRow,
  type WorksheetContractorActions,
} from "./TimelineMilestoneWorksheetContracts.tsx";

export function ContractorAssignmentEditor({
  contractorActions,
  contractorOptions,
  onAddAssignment,
  onRemoveAssignment,
  row,
  scopeName,
  scopeSubMilestoneId,
}: {
  contractorActions?: WorksheetContractorActions;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  onAddAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  row: TimelineMilestoneWorksheetRow;
  scopeName?: string;
  scopeSubMilestoneId?: string;
}) {
  const [contractorName, setContractorName] = useState("");
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [estimatedCostText, setEstimatedCostText] = useState("");
  const [estimatedHoursText, setEstimatedHoursText] = useState("");
  const [role, setRole] = useState("");
  const [subMilestoneIds, setSubMilestoneIds] = useState<string[]>(
    scopeSubMilestoneId ? [scopeSubMilestoneId] : []
  );
  const assignments = (row.contractorAssignments ?? []).filter((assignment) =>
    scopeSubMilestoneId
      ? assignment.subMilestoneIds.includes(scopeSubMilestoneId)
      : true
  );
  const normalizedContractorQuery = contractorName.trim().toLowerCase();
  const visibleContractorOptions = useMemo(
    () => filterContractorOptions(contractorOptions, normalizedContractorQuery),
    [contractorOptions, normalizedContractorQuery]
  );
  const selectedContractor = selectedContractorId
    ? contractorOptions.find(
        (option) => option.contractorId === selectedContractorId
      )
    : contractorOptions.find(
        (option) =>
          option.name.trim().toLowerCase() ===
          contractorName.trim().toLowerCase()
      );
  const assignmentContractor =
    selectedContractor ??
    (selectedContractorId
      ? { contractorId: selectedContractorId, name: contractorName }
      : undefined);
  const hasContractorOptions = contractorOptions.length > 0;
  const canCreateContractor = Boolean(contractorActions?.onCreate);
  const drawerAvailableContractors =
    contractorActions?.availableContractors ?? [];

  useEffect(() => {
    if (scopeSubMilestoneId) {
      setSubMilestoneIds([scopeSubMilestoneId]);
    }
  }, [scopeSubMilestoneId]);

  useEffect(() => {
    if (!selectedContractorId) {
      return;
    }
    const refreshedContractor = contractorOptions.find(
      (option) => option.contractorId === selectedContractorId
    );
    if (refreshedContractor) {
      setContractorName(refreshedContractor.name);
    }
  }, [contractorOptions, selectedContractorId]);

  const toggleSubMilestone = (subMilestoneId: string, checked: boolean) => {
    if (scopeSubMilestoneId) {
      return;
    }
    setSubMilestoneIds((current) =>
      checked
        ? [...new Set([...current, subMilestoneId])]
        : current.filter((id) => id !== subMilestoneId)
    );
  };

  const addAssignment = () => {
    const draft = buildContractorAssignmentDraft({
      contractorName,
      estimatedCostText,
      estimatedHoursText,
      role,
      scopeSubMilestoneId,
      selectedContractor: assignmentContractor,
      subMilestoneIds,
    });
    if (!draft) {
      return;
    }
    onAddAssignment(draft);
    setContractorName("");
    setSelectedContractorId("");
    setEstimatedCostText("");
    setEstimatedHoursText("");
    setRole("");
    setSubMilestoneIds(scopeSubMilestoneId ? [scopeSubMilestoneId] : []);
    setContractorPickerOpen(false);
  };

  const selectContractorOption = (
    option: TimelineMilestoneWorksheetContractorOption
  ) => {
    setContractorName(option.name);
    setSelectedContractorId(option.contractorId);
    if (!role.trim()) {
      setRole(option.trades?.[0]?.trim() ?? "Contractor");
    }
    setContractorPickerOpen(false);
  };

  const selectCreatedOrAttachedContractor = (input: {
    contractorId?: string;
    name: string;
    role?: string;
    trades?: string[];
  }) => {
    setContractorName(input.name);
    setSelectedContractorId(input.contractorId ?? "");
    setRole(
      input.role?.trim() ||
        input.trades?.[0]?.trim() ||
        role.trim() ||
        "Contractor"
    );
    setContractorPickerOpen(false);
    if (input.contractorId) {
      // Prefer the canonical roster option once the planning query refreshes.
      const matchingOption = contractorOptions.find(
        (option) => option.contractorId === input.contractorId
      );
      if (matchingOption) {
        setContractorName(matchingOption.name);
      }
    }
  };

  return (
    <section
      aria-label={`${scopeName ?? row.name} contractor assignments`}
      className="timeline-blueprint-planning-pane timeline-blueprint-planning-pane-contractors"
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Contractors
          </Badge>
          <strong>
            {scopeName
              ? `${scopeName} crew planning`
              : "Milestone crew planning"}
          </strong>
          <p>
            {canCreateContractor
              ? "Assign an existing contractor, create a new one, or type a guest contractor name."
              : "Assign an existing contractor or type a guest contractor name."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canCreateContractor ? (
            <Button
              data-testid={`timeline-setup-create-contractor-${row.key}`}
              onClick={() => setCreateDrawerOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" />
              Create new contractor
            </Button>
          ) : null}
          <span className="timeline-blueprint-planning-count">
            {assignments.length} assignment
            {assignments.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Contractor</span>
            <div className="timeline-contractor-autocomplete">
              <Autocomplete
                autoHighlight="always"
                filter={null}
                items={visibleContractorOptions}
                itemToStringValue={(
                  option: TimelineMilestoneWorksheetContractorOption
                ) => option.name}
                keepHighlight
                modal={false}
                onOpenChange={(nextOpen) =>
                  setContractorPickerOpen(nextOpen && hasContractorOptions)
                }
                onValueChange={(nextQuery) => {
                  setContractorName(nextQuery);
                  setSelectedContractorId(
                    contractorOptions.find(
                      (option) =>
                        option.name.trim().toLowerCase() ===
                        nextQuery.trim().toLowerCase()
                    )?.contractorId ?? ""
                  );
                  setContractorPickerOpen(
                    hasContractorOptions && Boolean(nextQuery.trim())
                  );
                }}
                open={contractorPickerOpen && hasContractorOptions}
                openOnInputClick
                value={contractorName}
              >
                <AutocompleteInput
                  aria-label="Contractor"
                  className="timeline-blueprint-input timeline-contractor-autocomplete-input"
                  data-testid={`timeline-setup-contractor-name-${row.key}`}
                  onClick={() => setContractorPickerOpen(hasContractorOptions)}
                  onFocus={() => setContractorPickerOpen(hasContractorOptions)}
                  placeholder="Company or crew name"
                  showClear={Boolean(contractorName.trim())}
                  showTrigger={hasContractorOptions}
                  size="sm"
                />
                <AutocompletePopup className="timeline-contractor-autocomplete-popup">
                  <AutocompleteEmpty className="timeline-contractor-autocomplete-empty">
                    <span>No contractors match this search.</span>
                    {canCreateContractor ? (
                      <button
                        className="timeline-blueprint-planning-action mt-2"
                        onClick={() => {
                          setContractorPickerOpen(false);
                          setCreateDrawerOpen(true);
                        }}
                        type="button"
                      >
                        <Plus aria-hidden="true" />
                        Create new contractor
                      </button>
                    ) : null}
                  </AutocompleteEmpty>
                  <AutocompleteList className="timeline-contractor-autocomplete-list">
                    {(option: TimelineMilestoneWorksheetContractorOption) => (
                      <ContractorOptionItem
                        key={option.contractorId}
                        onSelect={selectContractorOption}
                        option={option}
                      />
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </Autocomplete>
            </div>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Role / trade</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-role-${row.key}`}
              onChange={(event) => setRole(event.currentTarget.value)}
              placeholder={selectedContractor?.trades?.[0] ?? "Contractor"}
              value={role}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Estimated cost</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-cost-${row.key}`}
              inputMode="decimal"
              onChange={(event) =>
                setEstimatedCostText(event.currentTarget.value)
              }
              placeholder="$0"
              value={estimatedCostText}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Estimated hours</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-hours-${row.key}`}
              inputMode="decimal"
              onChange={(event) =>
                setEstimatedHoursText(event.currentTarget.value)
              }
              placeholder="0"
              value={estimatedHoursText}
            />
          </label>
        </div>
        <ContractorScopeSelector
          onToggle={toggleSubMilestone}
          row={row}
          scopeName={scopeName}
          scopeSubMilestoneId={scopeSubMilestoneId}
          subMilestoneIds={subMilestoneIds}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="timeline-blueprint-planning-action"
            data-testid={`timeline-setup-add-contractor-${row.key}`}
            disabled={!contractorName.trim()}
            onClick={addAssignment}
            type="button"
          >
            <Plus aria-hidden="true" />
            Add contractor
          </button>
        </div>
      </div>

      <ContractorAssignmentList
        assignments={assignments}
        onRemoveAssignment={onRemoveAssignment}
        row={row}
      />

      {contractorActions ? (
        <ContractorCreateDrawer
          contractorActions={contractorActions}
          contractorName={contractorName}
          createDrawerOpen={createDrawerOpen}
          drawerAvailableContractors={drawerAvailableContractors}
          onOpenChange={setCreateDrawerOpen}
          onSelectCreatedOrAttached={selectCreatedOrAttachedContractor}
          role={role}
        />
      ) : null}
    </section>
  );
}

type ContractorCreateDrawerActions = NonNullable<WorksheetContractorActions>;

export function ContractorCreateDrawer({
  contractorActions,
  contractorName,
  createDrawerOpen,
  drawerAvailableContractors,
  onOpenChange,
  onSelectCreatedOrAttached,
  role,
}: {
  contractorActions: ContractorCreateDrawerActions;
  contractorName: string;
  createDrawerOpen: boolean;
  drawerAvailableContractors: ContractorDrawerAvailableContractor[];
  onOpenChange: (open: boolean) => void;
  onSelectCreatedOrAttached: (input: {
    contractorId?: string;
    name: string;
    role?: string;
    trades?: string[];
  }) => void;
  role: string;
}) {
  const makeAttachHandler =
    (action: (input: { contractorId: string; role: string }) => unknown) =>
    async ({
      contractorId,
      role: attachRole,
    }: {
      contractorId: string;
      role: string;
    }) => {
      await action({ contractorId, role: attachRole });
      const existing = drawerAvailableContractors.find(
        (contractor) => contractor._id === contractorId
      );
      onSelectCreatedOrAttached({
        contractorId,
        name: existing?.name ?? contractorName,
        role: attachRole,
        trades: existing?.trades,
      });
    };
  const handleAttachAndInvite = contractorActions.onAttachAndInviteExisting
    ? makeAttachHandler(contractorActions.onAttachAndInviteExisting)
    : undefined;
  const handleAttach = contractorActions.onAttachExisting
    ? makeAttachHandler(contractorActions.onAttachExisting)
    : undefined;
  return (
    <ContractorQuickAddDrawer
      availableContractors={drawerAvailableContractors}
      createLabel="Create and add"
      description="Create a contractor profile for this proposal, then finish the milestone assignment below."
      initialDraft={
        contractorName.trim()
          ? {
              name: contractorName.trim(),
              trades: role.trim() ? [role.trim()] : [],
            }
          : undefined
      }
      onAttachAndInviteExisting={handleAttachAndInvite}
      onAttachExisting={handleAttach}
      onCreate={async ({ contractor, role: createRole }) => {
        const result = await contractorActions.onCreate({
          contractor,
          role: createRole,
        });
        const contractorId =
          typeof result === "string"
            ? result
            : result && typeof result === "object"
              ? "contractorId" in result &&
                (typeof result.contractorId === "string" ||
                  result.contractorId === undefined)
                ? result.contractorId
                : undefined
              : undefined;
        onSelectCreatedOrAttached({
          contractorId,
          name: contractor.name,
          role: createRole,
          trades: contractor.trades,
        });
        if (typeof result === "string" || result === undefined) {
          return result;
        }
        return typeof result === "object" &&
          result !== null &&
          "contractorId" in result &&
          (typeof result.contractorId === "string" ||
            result.contractorId === undefined)
          ? { contractorId: result.contractorId }
          : undefined;
      }}
      onInviteCreatedContractor={
        contractorActions.onInviteCreatedContractor
          ? async (contractorId) => {
              await contractorActions.onInviteCreatedContractor?.(contractorId);
            }
          : undefined
      }
      onOpenChange={onOpenChange}
      open={createDrawerOpen}
      requireRole
      title="Add contractor to proposal"
    />
  );
}

export function buildContractorAssignmentDraft({
  contractorName,
  estimatedCostText,
  estimatedHoursText,
  role,
  scopeSubMilestoneId,
  selectedContractor,
  subMilestoneIds,
}: {
  contractorName: string;
  estimatedCostText: string;
  estimatedHoursText: string;
  role: string;
  scopeSubMilestoneId?: string;
  selectedContractor?: TimelineMilestoneWorksheetContractorOption;
  subMilestoneIds: string[];
}): Omit<TimelineMilestoneWorksheetContractorAssignment, "id"> | null {
  const normalizedName = contractorName.trim();
  if (!normalizedName) {
    return null;
  }
  return {
    contractorId: selectedContractor?.contractorId,
    contractorName: selectedContractor?.name ?? normalizedName,
    estimatedCostCents: parseOptionalCurrencyCents(estimatedCostText),
    estimatedHours: parseOptionalHours(estimatedHoursText),
    role:
      role.trim() || selectedContractor?.trades?.[0]?.trim() || "Contractor",
    subMilestoneIds: scopeSubMilestoneId
      ? [scopeSubMilestoneId]
      : subMilestoneIds,
  };
}

export function filterContractorOptions(
  contractorOptions: TimelineMilestoneWorksheetContractorOption[],
  normalizedQuery: string
) {
  if (!normalizedQuery) {
    return contractorOptions;
  }
  return contractorOptions.filter((option) =>
    [option.name, option.city ?? "", ...(option.trades ?? [])].some((value) =>
      value.trim().toLowerCase().includes(normalizedQuery)
    )
  );
}

export function ContractorOptionItem({
  onSelect,
  option,
}: {
  onSelect: (option: TimelineMilestoneWorksheetContractorOption) => void;
  option: TimelineMilestoneWorksheetContractorOption;
}) {
  return (
    <AutocompleteItem
      className="timeline-contractor-autocomplete-item"
      onClick={() => onSelect(option)}
      value={option}
    >
      <span>
        <strong>{option.name}</strong>
        <small>
          {option.trades?.length ? option.trades.join(", ") : "Contractor"}
          {option.city ? ` / ${option.city}` : ""}
        </small>
      </span>
      <em>{option.trades?.[0] ?? "Crew"}</em>
    </AutocompleteItem>
  );
}

export function ContractorScopeSelector({
  onToggle,
  row,
  scopeName,
  scopeSubMilestoneId,
  subMilestoneIds,
}: {
  onToggle: (subMilestoneId: string, checked: boolean) => void;
  row: TimelineMilestoneWorksheetRow;
  scopeName?: string;
  scopeSubMilestoneId?: string;
  subMilestoneIds: string[];
}) {
  if (scopeSubMilestoneId) {
    return (
      <div className="grid gap-2">
        <p className="font-medium text-sm">Sub-milestone scope</p>
        <div className="flex flex-wrap gap-2">
          <span className="timeline-blueprint-planning-scope-chip is-locked">
            {scopeName ?? subMilestoneNameById(row, scopeSubMilestoneId)}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="font-medium text-sm">Sub-milestone scope</p>
      <div className="flex flex-wrap gap-2">
        {row.subMilestoneDetails.length > 0 ? (
          row.subMilestoneDetails.map((subMilestone) => {
            const checked = subMilestoneIds.includes(subMilestone.id);
            return (
              <label
                className="timeline-blueprint-planning-scope-chip"
                key={subMilestone.id}
              >
                <input
                  checked={checked}
                  onChange={(event) =>
                    onToggle(subMilestone.id, event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>{sanitizeSubMilestoneName(subMilestone.name)}</span>
              </label>
            );
          })
        ) : (
          <p className="text-muted-foreground text-sm">
            No sub-milestones are defined for this milestone.
          </p>
        )}
      </div>
    </div>
  );
}

export function ContractorAssignmentList({
  assignments,
  onRemoveAssignment,
  row,
}: {
  assignments: TimelineMilestoneWorksheetContractorAssignment[];
  onRemoveAssignment: (assignmentId: string) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  return (
    <div className="grid gap-2">
      {assignments.length > 0 ? (
        assignments.map((assignment) => (
          <article
            className="timeline-blueprint-planning-card"
            data-testid={`timeline-setup-contractor-assignment-${assignment.id}`}
            key={assignment.id}
          >
            <div className="timeline-blueprint-planning-card-header">
              <div>
                <strong>{assignment.contractorName}</strong>
                <small>{assignment.role}</small>
              </div>
              <button
                aria-label={`Remove ${assignment.contractorName}`}
                className="timeline-submilestone-remove"
                onClick={() => onRemoveAssignment(assignment.id)}
                type="button"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            <div className="timeline-blueprint-planning-card-meta">
              <span>
                {assignment.subMilestoneIds.length > 0
                  ? assignment.subMilestoneIds
                      .map((id) => subMilestoneNameById(row, id))
                      .join(", ")
                  : "Milestone-level"}
              </span>
              {assignment.estimatedCostCents ? (
                <span>{formatCurrency(assignment.estimatedCostCents)}</span>
              ) : null}
              {assignment.estimatedHours ? (
                <span>
                  {assignment.estimatedHours} hr
                  {assignment.estimatedHours === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </article>
        ))
      ) : (
        <p className="timeline-blueprint-planning-empty">
          No contractors assigned yet.
        </p>
      )}
    </div>
  );
}

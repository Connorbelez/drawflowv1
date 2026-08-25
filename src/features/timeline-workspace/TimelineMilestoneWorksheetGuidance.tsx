import { Plus, GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import {
  coerceSiteVisitGuidance,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import { SortableItemHandle } from "#/components/reui/sortable.tsx";
import {
  DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
  DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
  SUB_MILESTONE_BANK,
  defaultGuidanceForRow,
  hasAvailableSubMilestoneBankMatches,
  makeUniqueSubMilestoneName,
  matchesSubMilestoneBankQuery,
  sanitizeSubMilestoneName,
  slugifySubMilestone,
  type SubMilestoneBankItem,
  type TimelineMilestoneWorksheetRow,
} from "./TimelineMilestoneWorksheetContracts.tsx";

export function FieldGuidanceEditor({
  onUpdate,
  row,
}: {
  onUpdate: (guidance: SiteVisitGuidanceHtml) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  const guidance = coerceSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultGuidanceForRow(row)
  );
  return (
    <section
      aria-label={`${row.name} field guidance`}
      className="timeline-blueprint-field-guidance"
      data-testid={`timeline-settings-field-guidance-${row.key}`}
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Field Guidance
          </Badge>
          <strong>Site visitor checklist</strong>
          <p>Configure what the lender team should verify on site.</p>
        </div>
      </div>
      <div className="timeline-blueprint-field-guidance-grid">
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>What to verify</span>
          <FieldRichTextEditor
            ariaLabel={`${row.name} what to verify`}
            editorMinHeightClass="[&_.ProseMirror]:min-h-[4.5rem]"
            imageMaxHeightClass="[&_.ProseMirror_img]:max-h-40"
            onChange={(whatToVerify) =>
              onUpdate({
                ...guidance,
                whatToVerify,
              })
            }
            placeholder="Verification checklist, notes, and reference photos..."
            testId={`timeline-settings-guidance-verify-${row.key}`}
            value={guidance.whatToVerify}
          />
        </div>
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>Required photo angles</span>
          <FieldRichTextEditor
            ariaLabel={`${row.name} required photo angles`}
            editorMinHeightClass="[&_.ProseMirror]:min-h-[4.5rem]"
            imageMaxHeightClass="[&_.ProseMirror_img]:max-h-40"
            onChange={(cameraAngles) =>
              onUpdate({
                ...guidance,
                cameraAngles,
              })
            }
            placeholder="Required angles, framing notes, and example photos..."
            testId={`timeline-settings-guidance-camera-${row.key}`}
            value={guidance.cameraAngles}
          />
        </div>
      </div>
    </section>
  );
}

export function SubMilestoneBankPicker({
  existingNames,
  onAdd,
  rowKey,
}: {
  existingNames: string[];
  onAdd: (item: SubMilestoneBankItem) => void;
  rowKey: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const existingNameSet = useMemo(
    () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
    [existingNames]
  );
  const filteredItems = useMemo(
    () =>
      SUB_MILESTONE_BANK.filter(
        (item) =>
          !existingNameSet.has(item.name.toLowerCase()) &&
          matchesSubMilestoneBankQuery(item, query)
      ),
    [existingNameSet, query]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, SubMilestoneBankItem[]>();
    for (const item of filteredItems) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return [...groups.entries()];
  }, [filteredItems]);
  const customName = sanitizeSubMilestoneName(query);
  const normalizedCustomName = customName.toLowerCase();
  const canCreate =
    query.trim().length > 1 &&
    !existingNameSet.has(normalizedCustomName) &&
    !SUB_MILESTONE_BANK.some(
      (item) => item.name.toLowerCase() === normalizedCustomName
    );
  const addItem = (item: SubMilestoneBankItem) => {
    onAdd(item);
    setQuery("");
    setOpen(false);
  };
  const addCustomSubMilestone = () => {
    addItem({
      budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      category: "Custom",
      description: "Custom scope checkpoint",
      durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      name: canCreate
        ? customName
        : makeUniqueSubMilestoneName("New sub-milestone", existingNameSet),
    });
  };

  return (
    <div className="timeline-submilestone-bank">
      <Autocomplete
        autoHighlight="always"
        keepHighlight
        modal={false}
        onOpenChange={(nextOpen) =>
          setOpen(nextOpen && filteredItems.length > 0)
        }
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          setOpen(
            hasAvailableSubMilestoneBankMatches(existingNameSet, nextQuery)
          );
        }}
        open={open}
        openOnInputClick
        value={query}
      >
        <div className="timeline-submilestone-bank-controls">
          <AutocompleteInput
            aria-label="Add sub-milestone from bank"
            className="timeline-submilestone-bank-input"
            data-testid={`timeline-setup-submilestone-bank-input-${rowKey}`}
            onFocus={() => setOpen(filteredItems.length > 0)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                addCustomSubMilestone();
              }
            }}
            placeholder="Add from sub-milestone bank..."
            showClear
            showTrigger
            size="sm"
          />
          <Button
            aria-label={
              canCreate
                ? `Add custom sub-milestone ${customName}`
                : "Add custom sub-milestone"
            }
            className="timeline-submilestone-bank-custom-button"
            data-testid={`timeline-setup-submilestone-bank-custom-${rowKey}`}
            onClick={addCustomSubMilestone}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add custom
          </Button>
        </div>
        <AutocompletePopup className="timeline-submilestone-bank-popup">
          <AutocompleteList className="timeline-submilestone-bank-list">
            {groupedItems.map(([category, items]) => (
              <AutocompleteGroup key={category}>
                <AutocompleteGroupLabel className="timeline-submilestone-bank-label">
                  {category}
                </AutocompleteGroupLabel>
                {items.map((item) => (
                  <button
                    className="timeline-submilestone-bank-item"
                    data-testid={`timeline-setup-submilestone-bank-item-${slugifySubMilestone(item.name)}`}
                    key={item.name}
                    onClick={() => addItem(item)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <em>T{item.durationText}</em>
                  </button>
                ))}
              </AutocompleteGroup>
            ))}
            {canCreate ? (
              <button
                className="timeline-submilestone-bank-item is-create"
                data-testid={`timeline-setup-submilestone-bank-create-${rowKey}`}
                onClick={() =>
                  addItem({
                    budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
                    category: "Custom",
                    description: "Custom scope checkpoint",
                    durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                    name: customName,
                  })
                }
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span>
                  <strong>Create "{customName}"</strong>
                  <small>Add a custom reimbursement checkpoint</small>
                </span>
                <Plus aria-hidden="true" />
              </button>
            ) : null}
            {filteredItems.length === 0 && !canCreate ? (
              <div className="timeline-submilestone-bank-empty">
                No available bank item matches this search.
              </div>
            ) : null}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  );
}

export function DragHandle({
  id,
  name,
  onMove,
}: {
  id: string;
  name: string;
  onMove: (direction: "down" | "up") => void;
}) {
  return (
    <SortableItemHandle
      aria-label={`Drag ${name}`}
      className="timeline-blueprint-drag-handle"
      data-testid={`timeline-setup-row-drag-${id}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove("up");
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove("down");
        }
      }}
      render={<button type="button" />}
    >
      <GripVertical aria-hidden="true" />
    </SortableItemHandle>
  );
}

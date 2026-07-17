"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardHeader, CardPanel, CardTitle } from "#/components/ui/card.tsx";

export type AssistantSelectionOption = {
  buildId?: string;
  id: string;
  kind: "activeBuild" | "proposal";
  label: string;
  proposalId?: string;
  status?: string;
  subtitle?: string;
};

export function AssistantAutocompleteSelection({
  disabled,
  emptyText = "No matching options.",
  loading,
  onSelect,
  options,
  placeholder = "Search builds and proposals...",
  title,
}: {
  disabled?: boolean;
  emptyText?: string;
  loading?: boolean;
  onSelect: (option: AssistantSelectionOption) => void;
  options: AssistantSelectionOption[];
  placeholder?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(
    () => filterAssistantSelectionOptions(options, query),
    [options, query]
  );

  const selectOption = (option: AssistantSelectionOption) => {
    setQuery(formatAssistantSelectionOption(option));
    setOpen(false);
    onSelect(option);
  };

  return (
    <Card data-testid="assistant-autocomplete-selection">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-3 p-4 pt-0">
        <Autocomplete
          autoHighlight="always"
          filter={null}
          items={filteredOptions}
          itemToStringValue={formatAssistantSelectionOption}
          keepHighlight
          modal={false}
          onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
          onValueChange={(nextQuery) => {
            setQuery(nextQuery);
            setOpen(!disabled);
          }}
          open={open && !disabled}
          openOnInputClick
          value={query}
        >
          <AutocompleteInput
            aria-label={title}
            disabled={disabled}
            placeholder={loading ? "Loading eligible targets..." : placeholder}
            showClear
            showTrigger
            startAddon={<Search aria-hidden="true" />}
          />
          <AutocompletePopup>
            <AutocompleteEmpty>
              {loading ? "Loading eligible targets..." : emptyText}
            </AutocompleteEmpty>
            <AutocompleteList>
              {(option: AssistantSelectionOption) => (
                <AutocompleteItem
                  className="grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2"
                  key={option.id}
                  onClick={() => selectOption(option)}
                  value={option}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {option.label}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {option.subtitle ?? "DrawFlow target"}
                    </span>
                  </span>
                  <span className="flex max-w-32 flex-col items-end gap-1">
                    <Badge className="max-w-full truncate" variant="outline">
                      {option.kind === "activeBuild" ? "Live build" : "Proposal"}
                    </Badge>
                    {option.status ? (
                      <span className="max-w-full truncate text-[0.6875rem] text-muted-foreground">
                        {option.status}
                      </span>
                    ) : null}
                  </span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        </Autocomplete>
      </CardPanel>
    </Card>
  );
}

export function filterAssistantSelectionOptions(
  options: AssistantSelectionOption[],
  query: string
) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) {
    return options;
  }
  return options.filter((option) => {
    const haystack = [
      option.label,
      option.subtitle,
      option.status,
      option.kind,
      option.proposalId,
      option.buildId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function formatAssistantSelectionOption(option: AssistantSelectionOption) {
  return option.subtitle ? `${option.label} ${option.subtitle}` : option.label;
}

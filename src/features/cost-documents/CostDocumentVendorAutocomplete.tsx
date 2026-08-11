"use client";

import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { cn } from "#/lib/utils.ts";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CostDocumentActorCapacity } from "./CostDocumentRoadmapReconciliation.tsx";

export type CostDocumentVendorPartyType = "contractor" | "supplier" | "vendor";

export interface CostDocumentVendorOption {
  city?: string;
  email?: string;
  name: string;
  partyType: CostDocumentVendorPartyType;
  profileId: Id<"contractorProfiles">;
}

export interface CostDocumentVendorValue {
  displayName: string;
  profileId?: Id<"contractorProfiles">;
}

const COST_DOCUMENT_VENDOR_QUERY_TERMS = /\s+/;

export function CostDocumentVendorAutocomplete({
  actorCapacity,
  buildId,
  className,
  disabled,
  legacyVendorName,
  onValueChange,
  organizationId,
  value,
}: {
  actorCapacity?: CostDocumentActorCapacity;
  buildId: Id<"activeBuilds">;
  className?: string;
  disabled?: boolean;
  legacyVendorName?: string;
  onValueChange: (value: CostDocumentVendorValue) => void;
  organizationId: string;
  value?: Id<"contractorProfiles">;
}) {
  const [query, setQuery] = useState(legacyVendorName ?? "");
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const highlightedOptionRef = useRef<CostDocumentVendorOption | undefined>(
    undefined
  );
  const debouncedQuery = useDebouncedValue(query, 200);
  const options = useQueryOptions({
    actorCapacity,
    buildId,
    organizationId,
    search: debouncedQuery,
  });
  const selectedOption = options.find((option) => option.profileId === value);
  const selectedLabel = selectedOption?.name ?? legacyVendorName?.trim() ?? "";
  const filteredOptions = useMemo(
    () => filterCostDocumentVendorOptions(options, query).slice(0, 12),
    [options, query]
  );

  useEffect(() => {
    if (value && selectedOption) {
      setQuery(selectedOption.name);
    }
  }, [selectedOption, value]);

  const selectOption = (option: CostDocumentVendorOption) => {
    highlightedOptionRef.current = option;
    setQuery(option.name);
    setOpen(false);
    onValueChange({ displayName: option.name, profileId: option.profileId });
  };

  const handleQueryChange = (nextQuery: string, reason: string) => {
    setQuery(nextQuery);
    setOpen(!disabled);
    const highlightedOption =
      reason === "item-press" ? highlightedOptionRef.current : undefined;
    const exactOption = options.find(
      (option) =>
        option.name.toLocaleLowerCase("en-CA") ===
        nextQuery.trim().toLocaleLowerCase("en-CA")
    );
    const selectedQueryOption = highlightedOption ?? exactOption;
    if (selectedQueryOption) {
      onValueChange({
        displayName: selectedQueryOption.name,
        profileId: selectedQueryOption.profileId,
      });
      return;
    }
    if (!value) {
      onValueChange({ displayName: nextQuery });
      return;
    }
    if (nextQuery !== selectedLabel) {
      onValueChange({ displayName: nextQuery });
    }
  };

  return (
    <Field className={cn("w-full gap-1.5", className)}>
      <FieldLabel
        className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
        htmlFor={inputId}
      >
        Vendor
      </FieldLabel>
      <Autocomplete
        autoHighlight="always"
        filter={null}
        items={filteredOptions}
        itemToStringValue={(option) =>
          typeof option === "string" ? option : option.name
        }
        keepHighlight
        modal={false}
        onItemHighlighted={(option: CostDocumentVendorOption | undefined) => {
          if (option) {
            highlightedOptionRef.current = option;
          }
        }}
        onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
        onValueChange={(nextQuery, eventDetails) =>
          handleQueryChange(nextQuery, eventDetails.reason)
        }
        open={open && !disabled}
        openOnInputClick
        value={query}
      >
        <AutocompleteInput
          aria-label="Vendor"
          disabled={disabled}
          id={inputId}
          placeholder="Search organization vendors..."
          showClear
          startAddon={<Search aria-hidden="true" />}
        />
        <AutocompletePopup>
          <AutocompleteEmpty>
            {options.length === 0
              ? "No active organization vendors are available."
              : "No organization vendors match this search."}
          </AutocompleteEmpty>
          <AutocompleteList>
            {(option: CostDocumentVendorOption) => (
              <AutocompleteItem
                className="grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2"
                key={option.profileId}
                onClick={() => selectOption(option)}
                value={option}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {[option.email, option.city].filter(Boolean).join(" · ") ||
                      "Organization profile"}
                  </span>
                </span>
                <Badge className="capitalize" variant="outline">
                  {option.partyType}
                </Badge>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
      <FieldDescription>
        Select an organization-scoped vendor, supplier, or contractor. The
        linked identity is retained with the Cost Document.
      </FieldDescription>
      {legacyVendorName && !value ? (
        <p className="text-warning-foreground text-xs">
          Unresolved legacy vendor text: {legacyVendorName}. Select a linked
          party to resolve it.
        </p>
      ) : null}
    </Field>
  );
}

function useQueryOptions({
  actorCapacity,
  buildId,
  organizationId,
  search,
}: {
  actorCapacity?: CostDocumentActorCapacity;
  buildId: Id<"activeBuilds">;
  organizationId: string;
  search: string;
}) {
  const result = useQuery(api.cost_documents.listCostDocumentVendorOptions, {
    ...(actorCapacity ? { actorCapacity } : {}),
    buildId,
    organizationId,
    search: search.trim() || undefined,
  });
  return (Array.isArray(result) ? result : []) as CostDocumentVendorOption[];
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function filterCostDocumentVendorOptions(
  options: CostDocumentVendorOption[],
  query: string
) {
  const terms = query
    .trim()
    .toLocaleLowerCase("en-CA")
    .split(COST_DOCUMENT_VENDOR_QUERY_TERMS)
    .filter(Boolean);
  if (terms.length === 0) {
    return options;
  }
  return options.filter((option) => {
    const haystack = [option.name, option.email, option.city, option.partyType]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-CA");
    return terms.every((term) => haystack.includes(term));
  });
}

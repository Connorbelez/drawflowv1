"use client";

import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
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
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
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
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createPartyType, setCreatePartyType] =
    useState<CostDocumentVendorPartyType>("vendor");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createCity, setCreateCity] = useState("");
  const [createError, setCreateError] = useState<string>();
  const [duplicateOptions, setDuplicateOptions] = useState<
    CostDocumentVendorOption[]
  >([]);
  const [creating, setCreating] = useState(false);
  const inputId = useId();
  const highlightedOptionRef = useRef<CostDocumentVendorOption | undefined>(
    undefined
  );
  const createVendorProfile = useMutation(
    api.cost_documents.createCostDocumentVendorProfile
  );
  const createAccess = useQuery(
    api.cost_documents.getCostDocumentVendorCreateAccess,
    {
      ...(actorCapacity ? { actorCapacity } : {}),
      buildId,
      organizationId,
    }
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
    setCreateFormOpen(false);
    setDuplicateOptions([]);
    setCreateError(undefined);
    onValueChange({ displayName: option.name, profileId: option.profileId });
  };

  const canCreateParty = createAccess?.canCreate === true;

  const openCreateForm = () => {
    setCreateFormOpen(true);
    setCreateName(query.trim());
    setCreateEmail("");
    setCreatePhone("");
    setCreateCity("");
    setCreateError(undefined);
    setDuplicateOptions([]);
  };

  const closeCreateForm = () => {
    setCreateFormOpen(false);
    setCreateEmail("");
    setCreatePhone("");
    setCreateCity("");
    setCreateError(undefined);
    setDuplicateOptions([]);
  };

  const handleCreate = async (allowDuplicate = false) => {
    const normalizedName = createName.trim();
    if (!normalizedName) {
      setCreateError("Party name is required.");
      return;
    }
    if (!createVendorProfile) {
      setCreateError("Party creation is unavailable. Try again.");
      return;
    }
    setCreating(true);
    setCreateError(undefined);
    try {
      const result = await createVendorProfile({
        ...(actorCapacity ? { actorCapacity } : {}),
        allowDuplicate,
        buildId,
        city: createCity.trim() || undefined,
        email: createEmail.trim() || undefined,
        name: normalizedName,
        organizationId,
        partyType: createPartyType,
        phone: createPhone.trim() || undefined,
      });
      if (!result?.created && result?.duplicateOptions?.length) {
        setDuplicateOptions(result.duplicateOptions);
        return;
      }
      if (!result?.option) {
        throw new Error("The new Cost Document party could not be selected.");
      }
      selectOption(result.option);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "The new Cost Document party could not be created."
      );
    } finally {
      setCreating(false);
    }
  };

  const startCreate = (allowDuplicate = false) => {
    handleCreate(allowDuplicate).catch(() => undefined);
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
          placeholder="Search vendors, suppliers, and contractors..."
          showClear
          startAddon={<Search aria-hidden="true" />}
        />
        <AutocompletePopup>
          <AutocompleteEmpty>
            {options.length === 0
              ? "No active organization parties are available."
              : "No organization parties match this search."}
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
      {canCreateParty && !disabled ? (
        <Button
          className="self-start"
          onClick={openCreateForm}
          size="sm"
          variant="outline"
        >
          Add a vendor, supplier, or contractor
        </Button>
      ) : createAccess?.canCreate === false ? (
        <p className="text-muted-foreground text-xs">
          Your current role cannot create a new organization party from Cost
          Document capture.
        </p>
      ) : null}
      {createFormOpen && canCreateParty ? (
        <Frame className="mt-1">
          <FramePanel className="grid gap-3 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-sm">New organization party</p>
                <p className="text-muted-foreground text-xs">
                  Create it here and it will be linked to this Cost Document.
                </p>
              </div>
              <Button onClick={closeCreateForm} size="sm" variant="ghost">
                Cancel
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${inputId}-party-type`}>
                  Party type
                </FieldLabel>
                <select
                  className="min-h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  id={`${inputId}-party-type`}
                  onChange={(event) =>
                    setCreatePartyType(
                      event.target.value as CostDocumentVendorPartyType
                    )
                  }
                  value={createPartyType}
                >
                  <option value="vendor">Vendor</option>
                  <option value="supplier">Supplier</option>
                  <option value="contractor">Contractor</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${inputId}-party-name`}>
                  Party name
                </FieldLabel>
                <Input
                  autoComplete="organization"
                  id={`${inputId}-party-name`}
                  onChange={(event) => {
                    setCreateName(event.currentTarget.value);
                    setDuplicateOptions([]);
                  }}
                  value={createName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${inputId}-party-email`}>
                  Email
                </FieldLabel>
                <Input
                  autoComplete="email"
                  id={`${inputId}-party-email`}
                  onChange={(event) =>
                    setCreateEmail(event.currentTarget.value)
                  }
                  type="email"
                  value={createEmail}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${inputId}-party-phone`}>
                  Phone
                </FieldLabel>
                <Input
                  autoComplete="tel"
                  id={`${inputId}-party-phone`}
                  onChange={(event) =>
                    setCreatePhone(event.currentTarget.value)
                  }
                  value={createPhone}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${inputId}-party-city`}>City</FieldLabel>
                <Input
                  autoComplete="address-level2"
                  id={`${inputId}-party-city`}
                  onChange={(event) => setCreateCity(event.currentTarget.value)}
                  value={createCity}
                />
              </Field>
            </div>
            {duplicateOptions.length > 0 ? (
              <Alert variant="warning">
                <AlertTitle>Possible existing party</AlertTitle>
                <AlertDescription>
                  We found a similar organization party. Select it to keep the
                  existing Cost Document history together.
                  <div className="grid gap-2">
                    {duplicateOptions.map((option) => (
                      <Button
                        className="justify-start"
                        key={option.profileId}
                        onClick={() => selectOption(option)}
                        size="sm"
                        variant="outline"
                      >
                        Use {option.name}
                      </Button>
                    ))}
                    <Button
                      className="justify-start"
                      disabled={creating}
                      onClick={() => startCreate(true)}
                      size="sm"
                      variant="ghost"
                    >
                      Create a separate party anyway
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            {createError ? (
              <Alert variant="error">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={closeCreateForm} variant="ghost">
                Cancel
              </Button>
              <Button
                disabled={!createName.trim()}
                loading={creating}
                onClick={() => startCreate()}
              >
                Create party
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}
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

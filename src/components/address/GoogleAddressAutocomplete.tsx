"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import {
  fetchGoogleAddressPlaceDetails,
  fetchGoogleAddressSuggestions,
  type GoogleAddressPlaceDetails,
  type GoogleAddressSuggestion,
  isGoogleMapsConfigured,
} from "#/lib/google-maps.ts";
import { cn } from "#/lib/utils.ts";

interface GoogleAddressAutocompleteProps {
  className?: string;
  disabled?: boolean;
  id?: string;
  inputClassName?: string;
  inputRender?: React.ReactElement;
  label?: React.ReactNode;
  labelClassName?: string;
  name?: string;
  onChange: (value: string, meta?: { source: "selection" | "typing" }) => void;
  onPlaceSelect?: (
    suggestion: GoogleAddressSuggestion,
    details: GoogleAddressPlaceDetails | null
  ) => void;
  onResolvingChange?: (resolving: boolean) => void;
  placeholder?: string;
  showSearchIcon?: boolean;
  size?: "sm" | "default" | "lg" | number;
  testId?: string;
  value: string;
}

export function GoogleAddressAutocomplete({
  className,
  disabled = false,
  id,
  inputClassName,
  inputRender,
  label,
  labelClassName,
  name,
  onChange,
  onPlaceSelect,
  onResolvingChange,
  placeholder = "Search project address",
  showSearchIcon = true,
  size,
  testId,
  value,
}: GoogleAddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GoogleAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const pendingSelectionDescriptionRef = useRef<string | null>(null);
  const selectedQueryRef = useRef<string | null>(null);
  const configured = useMemo(() => isGoogleMapsConfigured(), []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (selectedQueryRef.current?.trim() === trimmed) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    if (!configured || disabled || trimmed.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      fetchGoogleAddressSuggestions(trimmed)
        .then((nextSuggestions) => {
          if (cancelled) {
            return;
          }
          setSuggestions(nextSuggestions);
          setFailed(false);
          setOpen(nextSuggestions.length > 0);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setSuggestions([]);
          setFailed(true);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [configured, disabled, query]);

  function handleValueChange(nextValue: string) {
    const source =
      pendingSelectionDescriptionRef.current === nextValue
        ? "selection"
        : "typing";
    if (source === "typing") {
      pendingSelectionDescriptionRef.current = null;
      selectedQueryRef.current = null;
      setDetailsFailed(false);
    }
    setQuery(nextValue);
    onChange(nextValue, { source });
    if (!disabled) {
      setOpen(nextValue.trim().length >= 3 && suggestions.length > 0);
    }
  }

  async function selectSuggestion(suggestion: GoogleAddressSuggestion) {
    pendingSelectionDescriptionRef.current = suggestion.description;
    selectedQueryRef.current = suggestion.description;
    setQuery(suggestion.description);
    onChange(suggestion.description, { source: "selection" });
    setSuggestions([]);
    setOpen(false);
    if (!onPlaceSelect) {
      return;
    }

    setDetailsFailed(false);
    setDetailsLoading(true);
    onResolvingChange?.(true);
    try {
      const details = await fetchGoogleAddressPlaceDetails(suggestion);
      selectedQueryRef.current =
        details?.formattedAddress ?? suggestion.description;
      setSuggestions([]);
      setOpen(false);
      onPlaceSelect(suggestion, details);
    } catch {
      setDetailsFailed(true);
      selectedQueryRef.current = suggestion.description;
      setSuggestions([]);
      setOpen(false);
      onPlaceSelect(suggestion, null);
    } finally {
      setDetailsLoading(false);
      onResolvingChange?.(false);
      pendingSelectionDescriptionRef.current = null;
    }
  }

  const fallbackText = configured
    ? failed
      ? "Address autocomplete is unavailable."
      : query.trim().length >= 3 && !loading
        ? "No matching addresses."
        : "Keep typing to search addresses."
    : "Google Maps API key is not configured.";

  return (
    <div className={cn("grid gap-2", className)}>
      {label ? (
        <label className={labelClassName} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <Autocomplete
        autoHighlight="always"
        filter={null}
        items={suggestions}
        itemToStringValue={(item: GoogleAddressSuggestion) => item.description}
        keepHighlight
        modal={false}
        onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
        onValueChange={handleValueChange}
        open={open && !disabled}
        openOnInputClick
        value={query}
      >
        <AutocompleteInput
          aria-label={typeof label === "string" ? label : "Project address"}
          className={inputClassName}
          data-testid={testId}
          disabled={disabled}
          id={id}
          name={name}
          onFocus={() => setOpen(suggestions.length > 0 && !disabled)}
          placeholder={placeholder}
          render={inputRender}
          showClear
          showTrigger={!inputRender}
          size={size}
          startAddon={
            showSearchIcon && !inputRender ? <Search aria-hidden /> : undefined
          }
        />
        <AutocompletePopup>
          <AutocompleteEmpty>{fallbackText}</AutocompleteEmpty>
          <AutocompleteList>
            {(suggestion: GoogleAddressSuggestion) => (
              <AutocompleteItem
                className="grid min-h-12 grid-cols-[1rem_minmax(0,1fr)] items-center gap-3 px-2.5 py-2"
                key={suggestion.placeId}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void selectSuggestion(suggestion);
                }}
                value={suggestion}
              >
                <MapPin aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {suggestion.mainText}
                  </span>
                  {suggestion.secondaryText ? (
                    <span className="block truncate text-muted-foreground text-xs">
                      {suggestion.secondaryText}
                    </span>
                  ) : null}
                </span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
      {loading ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <Loader2 aria-hidden className="size-3 animate-spin" />
          Searching addresses
        </span>
      ) : null}
      {detailsLoading ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <Loader2 aria-hidden className="size-3 animate-spin" />
          Resolving coordinates
        </span>
      ) : null}
      {detailsFailed ? (
        <span className="text-muted-foreground text-xs">
          Coordinate lookup failed. The address text was kept.
        </span>
      ) : null}
    </div>
  );
}

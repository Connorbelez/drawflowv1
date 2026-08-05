"use client";

import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "#/components/ui/combobox.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import type {
  QuoteRoundMode,
  QuoteRoundRecipientCandidate,
  QuoteRoundRecipientSelection,
  QuoteRoundTemplateVersion,
} from "./QuoteRoundComposer.tsx";

const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;

function candidateCapabilities(candidate: QuoteRoundRecipientCandidate) {
  return candidate.capabilities;
}

function requiredCapabilitiesForMode(mode: QuoteRoundMode) {
  return mode === "mixed"
    ? (["contractor", "supplier"] as const)
    : ([mode === "labour" ? "contractor" : "supplier"] as const);
}

function candidateSupportsMode(
  candidate: QuoteRoundRecipientCandidate,
  mode: QuoteRoundMode
) {
  return requiredCapabilitiesForMode(mode).every((capability) =>
    candidate.capabilities.includes(capability)
  );
}

function templateSupportsMode(
  template: QuoteRoundTemplateVersion,
  mode: QuoteRoundMode
) {
  return (
    template.audience === "either" ||
    (mode === "labour" && template.audience === "contractor") ||
    (mode === "materials" && template.audience === "supplier")
  );
}

export function QuoteRoundRecipientEditor({
  candidates,
  mode,
  onChange,
  onCreateColdRecipient,
  selections,
}: {
  candidates: QuoteRoundRecipientCandidate[];
  mode: QuoteRoundMode;
  onChange: (next: QuoteRoundRecipientSelection[]) => void;
  onCreateColdRecipient?: (input: {
    displayName?: string;
    email: string;
  }) => Promise<QuoteRoundRecipientCandidate>;
  selections: QuoteRoundRecipientSelection[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coldRecipientEmail, setColdRecipientEmail] = useState("");
  const [coldRecipientName, setColdRecipientName] = useState("");
  const [coldRecipientError, setColdRecipientError] = useState<string>();
  const [creatingColdRecipient, setCreatingColdRecipient] = useState(false);
  const selectedKeys = new Set(
    selections.map((selection) => selection.recipientKey)
  );
  const available = candidates.filter(
    (candidate) => !selectedKeys.has(candidate.recipientKey)
  );
  const filtered = available.filter((candidate) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [candidate.displayName, candidate.email]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(needle));
  });
  const add = (candidate: QuoteRoundRecipientCandidate) => {
    if (!candidateSupportsMode(candidate, mode)) {
      return;
    }
    onChange([
      ...selections,
      {
        contractorProfileId: candidate.contractorProfileId,
        recipientKey: candidate.recipientKey,
      },
    ]);
    setOpen(false);
    setQuery("");
  };
  const createColdRecipient = async () => {
    if (!onCreateColdRecipient || creatingColdRecipient) {
      return;
    }
    const email = coldRecipientEmail.trim();
    if (!email) {
      setColdRecipientError("Enter the recipient email address first.");
      return;
    }
    setCreatingColdRecipient(true);
    setColdRecipientError(undefined);
    try {
      const candidate = await onCreateColdRecipient({
        displayName: coldRecipientName.trim() || undefined,
        email,
      });
      if (!candidateSupportsMode(candidate, mode)) {
        throw new Error(
          "The recipient profile does not satisfy this Quote Round capability."
        );
      }
      onChange([
        ...selections,
        {
          contractorProfileId: candidate.contractorProfileId,
          recipientKey: candidate.recipientKey,
        },
      ]);
      setColdRecipientEmail("");
      setColdRecipientName("");
    } catch (error) {
      setColdRecipientError(
        error instanceof Error
          ? error.message.replace(CONVEX_ERROR_PREFIX, "")
          : "We could not add this private recipient."
      );
    } finally {
      setCreatingColdRecipient(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="quote-recipient-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Private recipient identities</p>
          <p className="text-muted-foreground text-xs">
            These existing brokerage identities become active Quote Round
            invitations only when this draft is published.
          </p>
        </div>
        <Badge variant={selections.length ? "success" : "outline"}>
          {selections.length} selected
        </Badge>
      </div>
      <Alert variant="info">
        <ShieldCheck />
        <AlertTitle>Capability-compatible profile IDs</AlertTitle>
        <AlertDescription>
          Every selected existing profile must carry{" "}
          {requiredCapabilitiesForMode(mode).join(" + ")} capability. DrawFlow
          persists profile IDs, then rechecks that admission at publication.
        </AlertDescription>
      </Alert>
      <Combobox<QuoteRoundRecipientCandidate>
        autoHighlight
        filter={null}
        inputValue={query}
        isItemEqualToValue={(left, right) =>
          left.recipientKey === right.recipientKey
        }
        items={filtered}
        itemToStringLabel={(candidate) => candidate.displayName}
        itemToStringValue={(candidate) => candidate.recipientKey}
        modal={false}
        onInputValueChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onOpenChange={setOpen}
        onValueChange={(candidate) => {
          if (candidate) {
            add(candidate);
          }
        }}
        open={open}
        openOnInputClick
        value={null}
      >
        <ComboboxInput
          aria-label="Add an existing quote recipient"
          onFocus={() => setOpen(true)}
          placeholder="Search contractor or supplier identities..."
          showClear
        />
        <ComboboxPopup>
          <ComboboxEmpty>
            No compatible existing identities match this search.
          </ComboboxEmpty>
          <ComboboxList>
            {(candidate: QuoteRoundRecipientCandidate) => {
              const capabilities = candidateCapabilities(candidate);
              const suitable = candidateSupportsMode(candidate, mode);
              return (
                <ComboboxItem
                  disabled={!suitable}
                  key={candidate.recipientKey}
                  value={candidate}
                >
                  <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {candidate.displayName}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {candidate.email ?? "Brokerage identity"}
                      </span>
                    </span>
                    <Badge variant="outline">
                      {capabilities.join(" + ") || "Unavailable"}
                    </Badge>
                  </span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      {onCreateColdRecipient ? (
        <Frame>
          <FrameHeader>
            <FrameTitle className="text-sm">Invite a new email</FrameTitle>
            <FrameDescription>
              DrawFlow creates the minimum brokerage-scoped provisional
              Contractor or Supplier identity for this private invitation. No
              WorkOS account, partner enrollment, or Build assignment is
              required.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm" htmlFor="quote-cold-name">
                <span className="font-medium">Contact or company name</span>
                <Input
                  aria-label="New quote recipient name"
                  id="quote-cold-name"
                  onChange={(event) => setColdRecipientName(event.target.value)}
                  placeholder="Optional"
                  value={coldRecipientName}
                />
              </label>
              <label
                className="grid gap-1.5 text-sm"
                htmlFor="quote-cold-email"
              >
                <span className="font-medium">Recipient email</span>
                <Input
                  aria-label="New quote recipient email"
                  id="quote-cold-email"
                  inputMode="email"
                  onChange={(event) =>
                    setColdRecipientEmail(event.target.value)
                  }
                  placeholder="pricing@example.com"
                  type="email"
                  value={coldRecipientEmail}
                />
              </label>
            </div>
            {coldRecipientError ? (
              <Alert variant="error">
                <AlertTitle>Recipient could not be added</AlertTitle>
                <AlertDescription>{coldRecipientError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end">
              <Button
                loading={creatingColdRecipient}
                onClick={createColdRecipient}
                type="button"
                variant="outline"
              >
                Add private recipient
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}
      <div className="space-y-2">
        {selections.map((selection) => {
          const candidate = candidates.find(
            (item) => item.recipientKey === selection.recipientKey
          );
          const capabilities = candidate
            ? candidateCapabilities(candidate)
            : [];
          return (
            <Card key={selection.recipientKey}>
              <CardPanel className="flex items-start gap-3 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-semibold text-xs">
                  {(candidate?.displayName ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-sm">
                      {candidate?.displayName ?? "Unavailable identity"}
                    </p>
                    <Badge variant="outline">
                      {candidate?.provisioningState === "provisional"
                        ? "Provisional identity"
                        : "Existing identity"}
                    </Badge>
                  </div>
                  <p className="truncate text-muted-foreground text-xs">
                    {candidate?.email ?? selection.contractorProfileId}
                  </p>
                </div>
                <Badge variant="outline">
                  {capabilities.join(" + ") || "Unavailable"}
                </Badge>
                <Button
                  aria-label={`Remove ${candidate?.displayName ?? selection.recipientKey}`}
                  onClick={() =>
                    onChange(
                      selections.filter(
                        (current) =>
                          current.recipientKey !== selection.recipientKey
                      )
                    )
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <X />
                </Button>
              </CardPanel>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function QuoteRoundResponseTemplateSelector({
  labourCount,
  materialCount,
  mode,
  onChange,
  templates,
  templateVersionId,
}: {
  labourCount: number;
  materialCount: number;
  mode: QuoteRoundMode;
  onChange: (versionId: string) => void;
  templates: QuoteRoundTemplateVersion[];
  templateVersionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = templates.find(
    (template) => template.versionId === templateVersionId
  );
  const filtered = templates.filter((template) => {
    const needle = query.trim().toLowerCase();
    return (
      templateSupportsMode(template, mode) &&
      (!needle ||
        `${template.name} v${template.version}`.toLowerCase().includes(needle))
    );
  });

  return (
    <div className="space-y-4" data-testid="quote-response-template">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Response contract</p>
          <p className="text-muted-foreground text-xs">
            Select an immutable published version. Existing Quote Rounds remain
            pinned to their dispatch snapshot.
          </p>
        </div>
        <Badge variant={selected ? "success" : "outline"}>
          {selected ? `Published v${selected.version}` : "Required"}
        </Badge>
      </div>
      <Combobox<QuoteRoundTemplateVersion>
        autoHighlight
        filter={null}
        inputValue={query}
        isItemEqualToValue={(left, right) => left.versionId === right.versionId}
        items={filtered}
        itemToStringLabel={(template) =>
          `${template.name} · v${template.version}`
        }
        itemToStringValue={(template) => template.versionId}
        modal={false}
        onInputValueChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onOpenChange={setOpen}
        onValueChange={(template) => {
          if (template) {
            onChange(template.versionId);
            setQuery(`${template.name} · v${template.version}`);
            setOpen(false);
          }
        }}
        open={open}
        openOnInputClick
        value={selected ?? null}
      >
        <ComboboxInput
          aria-label="Published response template version"
          onFocus={() => setOpen(true)}
          placeholder="Choose a published template version..."
          showClear
        />
        <ComboboxPopup>
          <ComboboxEmpty>No published templates are available.</ComboboxEmpty>
          <ComboboxList>
            {(template: QuoteRoundTemplateVersion) => (
              <ComboboxItem key={template.versionId} value={template}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {template.name} · v{template.version}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {template.fields.length} fields ·{" "}
                    {template.audience ?? "either"} audience
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      {selected ? (
        <Frame>
          <FrameHeader className="gap-1">
            <FrameTitle>
              {selected.name} · Published v{selected.version}
            </FrameTitle>
            <FrameDescription>
              {labourCount} labour · {materialCount} materials ·{" "}
              {selected.fields.filter((field) => field.required).length}{" "}
              required response fields
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-2 p-3">
            {selected.fields.map((field) => (
              <Card key={field.fieldKey}>
                <CardPanel className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{field.label}</p>
                    <Badge variant="outline">
                      {field.scope?.replace("_", " ") ?? "whole quote"}
                    </Badge>
                    {field.required ? (
                      <Badge variant="warning">Required</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {field.kind.replace("_", " ")}
                  </p>
                  {field.richTextDefaultHtml ? (
                    <FieldRichTextPreview
                      ariaLabel={`${field.label} published preview`}
                      value={field.richTextDefaultHtml}
                    />
                  ) : null}
                </CardPanel>
              </Card>
            ))}
            {selected.description ? (
              <p className="text-muted-foreground text-xs">
                {selected.description}
              </p>
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}
    </div>
  );
}

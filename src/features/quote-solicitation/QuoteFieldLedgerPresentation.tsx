import {
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DraftLinePatch,
  PricingDisplayLine,
  QuoteAccess,
  ReadableLifecycleResult,
} from "./QuoteFieldLedgerContracts";
import {
  formatChangedFieldKey,
  formatDate,
  formatDateTime,
  money,
} from "./QuoteFieldLedgerUtils";

export function LedgerMasthead({
  access,
  readOnly,
  syncMessage,
  total,
}: {
  access: QuoteAccess;
  readOnly: boolean;
  syncMessage: string;
  total: number;
}) {
  return (
    <header className="grid gap-5 border-b pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>Private quote invitation</span>
          <span aria-hidden="true">/</span>
          <span>Package revision {access.package.revision}</span>
          <span aria-hidden="true">/</span>
          <span>Field Ledger</span>
        </div>
        <h1 className="mt-3 text-balance font-semibold text-2xl tracking-[-0.02em]">
          {access.recipientName} quote
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-muted-foreground text-sm">
          Issued by {access.issuerName} for {access.package.siteAddress}.
        </p>
        <p className="mt-1 text-sm">
          Due {formatDateTime(access.package.responseDeadline)}
        </p>
      </div>
      <div className="flex items-end justify-between gap-8 border-t pt-4 md:border-t-0 md:pt-0">
        <div>
          <p className="text-muted-foreground text-xs">Current quote total</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {money(total)}
          </p>
        </div>
        <div className="max-w-40 text-right text-xs">
          <p className={cn(readOnly ? "text-warning" : "text-success")}>
            {syncMessage}
          </p>
        </div>
      </div>
    </header>
  );
}

export function LedgerSectionNav() {
  const sections = [
    "summary",
    "labour",
    "materials",
    "questions",
    "files",
    "review",
  ];
  return (
    <nav
      aria-label="Field Ledger sections"
      className="sticky top-0 z-30 -mx-3 mt-4 flex gap-1 overflow-x-auto border-y bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5"
    >
      {sections.map((section) => (
        <Button
          className="shrink-0 capitalize"
          key={section}
          onClick={() =>
            document
              .getElementById(section)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          size="sm"
          variant="ghost"
        >
          {section === "files" ? "Files & notes" : section}
        </Button>
      ))}
    </nav>
  );
}

export function LedgerSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section
      className="scroll-mt-24 border-muted border-b-4 last:border-b-0"
      id={id}
    >
      <header className="border-b bg-muted/18 px-4 py-4 sm:px-6">
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </header>
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </section>
  );
}

export function LedgerNotice({
  children,
  icon,
  title,
  variant,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
  variant: "warning" | "error";
}) {
  return (
    <div className="p-4 sm:p-5">
      <Alert variant={variant}>
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    </div>
  );
}

export function RevisionAcknowledgementPanel({
  acknowledgement,
  onAcknowledge,
  pending,
}: {
  acknowledgement: ReadableLifecycleResult["revisionAcknowledgement"];
  onAcknowledge: () => Promise<void>;
  pending: boolean;
}) {
  return (
    <div className="border-b p-4 sm:p-5">
      <Frame>
        <FramePanel className="p-4">
          <Alert variant="info">
            <ShieldCheck />
            <AlertTitle>Review the updated quote package</AlertTitle>
            <AlertDescription>
              This Quote Round was reopened with a new package revision. Review
              every changed field before editing or submitting your response.
              <ul
                aria-label="Changed package fields"
                className="mt-3 list-disc space-y-1 pl-5"
              >
                {acknowledgement.changedFieldKeys.map((fieldKey) => (
                  <li key={fieldKey}>{formatChangedFieldKey(fieldKey)}</li>
                ))}
              </ul>
              <Button
                className="mt-4"
                disabled={pending}
                onClick={onAcknowledge}
                size="sm"
              >
                {pending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                {pending ? "Acknowledging…" : "Acknowledge package revision"}
              </Button>
            </AlertDescription>
          </Alert>
        </FramePanel>
      </Frame>
    </div>
  );
}

export function CopiedValuesConfirmationPanel({
  onConfirm,
  pending,
  readOnly,
}: {
  onConfirm: () => Promise<void>;
  pending: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="border-b p-4 sm:p-5">
      <Frame>
        <FramePanel className="p-4">
          <Alert variant="info">
            <ShieldCheck />
            <AlertTitle>Confirm copied response values</AlertTitle>
            <AlertDescription>
              Amounts or answers from your prior response were copied into this
              package revision. Review them against the current issued Scope,
              then confirm they still apply before submitting.
              <Button
                className="mt-4"
                disabled={pending || readOnly}
                onClick={onConfirm}
                size="sm"
              >
                {pending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                {pending ? "Confirming…" : "Confirm copied answers"}
              </Button>
            </AlertDescription>
          </Alert>
        </FramePanel>
      </Frame>
    </div>
  );
}

export function PackageSummary({
  access,
  accountClaimActions,
}: {
  access: QuoteAccess;
  accountClaimActions?: ReactNode;
}) {
  const permit = access.package.attachments.find(
    (attachment) => attachment.kind === "permit"
  );
  return (
    <div className="grid gap-5">
      <div className="grid divide-y border-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <PackageFact
          label="Permit"
          value={permit?.fileName ?? "Included in package"}
        />
        <PackageFact label="Site" value={access.package.siteAddress} />
        <PackageFact
          label="Timeline starts"
          value={formatDate(access.package.timelineStartDate)}
        />
        <PackageFact
          label="Response deadline"
          value={formatDateTime(access.package.responseDeadline)}
        />
      </div>
      <details className="group border-b pb-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium text-sm">
          Permit, map, timeline, specifications, attachments, and disclosures
          <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <MapPinned className="mt-0.5 size-4 text-primary" />
              <div className="min-w-0">
                <p className="font-medium text-sm">Site and map</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {access.package.siteAddress}
                </p>
                <Button
                  className="mt-3"
                  render={
                    <a
                      href={access.package.siteMapUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="sr-only">Open issued map</span>
                    </a>
                  }
                  size="sm"
                  variant="outline"
                >
                  Open issued map <ExternalLink />
                </Button>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Timeline</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Current day {access.package.timelineCurrentDay ?? "not published"}{" "}
              · planned range {access.package.timelineRangeMin ?? "—"}–
              {access.package.timelineRangeMax ?? "—"}
            </p>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Package attachments</p>
            <ul className="mt-3 grid gap-2 text-xs">
              {access.package.attachments.map((attachment) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={attachment.sourceAttachmentId}
                >
                  <span className="min-w-0 truncate">
                    {attachment.fileName}
                  </span>
                  <Badge variant="outline">{attachment.kind}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Private-response disclosure</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Other recipient responses, internal pricing, and peer information
              are not shown here. DrawFlow does not recommend or calculate your
              price.
            </p>
          </Card>
        </div>
      </details>
      {accountClaimActions ? (
        <Frame>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-sm">Optional account claim</p>
              <p className="mt-1 max-w-2xl text-muted-foreground text-xs">
                Claiming adds authenticated access only to this recipient
                profile’s Quote Invitations. It does not enroll you as a partner
                or change this response.
              </p>
            </div>
            {accountClaimActions}
          </FramePanel>
        </Frame>
      ) : null}
    </div>
  );
}

export function PackageFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <dl className="min-w-0 px-0 py-3 first:pt-0 last:pb-0 sm:px-4 sm:last:pr-0 sm:last:pb-3 sm:first:pt-3 sm:first:pl-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 truncate font-medium text-sm">{value}</dd>
    </dl>
  );
}

export function PricingBand({
  lines,
  onAmountChange,
  readOnly,
  scope,
  subtotal,
  values,
}: {
  lines: PricingDisplayLine[];
  onAmountChange: (line: DraftLinePatch, value: string) => void;
  readOnly: boolean;
  scope: "labour" | "materials";
  subtotal: number;
  values: Record<string, number | undefined>;
}) {
  const scopeLabel = scope === "labour" ? "Labour" : "Materials";
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Badge variant={scope === "labour" ? "info" : "warning"}>
            {scopeLabel}
          </Badge>
          <p className="mt-2 font-medium text-sm">
            {scope === "labour" ? "Work pricing" : "Material pricing"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Subtotal</p>
          <p className="font-semibold tabular-nums">{money(subtotal)}</p>
        </div>
      </div>
      <Frame data-testid={`pricing-band-${scope}`}>
        <FramePanel className="overflow-hidden p-0">
          <div className="hidden grid-cols-[2.2rem_minmax(0,1fr)_minmax(10rem,.9fr)_9rem] gap-3 bg-muted/45 px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] sm:grid">
            <span>#</span>
            <span>Requested line</span>
            <span>Assigned scope</span>
            <span className="text-right">Quoted amount</span>
          </div>
          {lines.length ? (
            lines.map((line, index) => (
              <PricingRow
                amount={values[line.line.lineKey]}
                index={index + 1}
                key={line.line.lineKey}
                line={line}
                onAmountChange={onAmountChange}
                readOnly={readOnly}
              />
            ))
          ) : (
            <p className="p-4 text-muted-foreground text-sm">
              No {scopeLabel.toLowerCase()} pricing rows were issued.
            </p>
          )}
          <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-3 text-sm">
            <span className="text-muted-foreground">{scopeLabel} subtotal</span>
            <span className="font-semibold tabular-nums">
              {money(subtotal)}
            </span>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

export function PricingRow({
  amount,
  index,
  line,
  onAmountChange,
  readOnly,
}: {
  amount: number | undefined;
  index: number;
  line: PricingDisplayLine;
  onAmountChange: (line: DraftLinePatch, value: string) => void;
  readOnly: boolean;
}) {
  const { context, detail, line: patch, meta } = line;
  return (
    <Card className="rounded-none border-0 border-b shadow-none before:hidden">
      <CardPanel className="grid gap-3 p-3 sm:grid-cols-[2.2rem_minmax(0,1fr)_minmax(10rem,.9fr)_9rem] sm:items-start">
        <span className="font-semibold text-muted-foreground text-sm tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{patch.title}</p>
          {meta ? (
            <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
          ) : null}
          {context ? (
            <p className="mt-1 text-muted-foreground text-xs">{context}</p>
          ) : null}
          {detail ? (
            <details className="group mt-2">
              <summary className="cursor-pointer text-primary text-xs">
                View issued scope and specifications
              </summary>
              <FieldRichTextPreview
                ariaLabel={`Issued scope for ${patch.title}`}
                className="mt-2"
                value={detail}
              />
            </details>
          ) : null}
        </div>
        <div>
          <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] sm:sr-only">
            Assigned scope
          </p>
          <p className="font-medium text-sm">
            {patch.source === "expanded_scope"
              ? "Expanded scope"
              : patch.scope === "labour"
                ? "Issued labour scope"
                : patch.scope === "materials"
                  ? "Issued material scope"
                  : "Whole quote"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {patch.source === "template_priced"
              ? "Configured response pricing field"
              : "Frozen package revision"}
          </p>
        </div>
        <div>
          <label
            className="mb-1 block font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]"
            htmlFor={`quote-${patch.lineKey}`}
          >
            Quoted amount
            <span className="sr-only"> for {patch.title}</span>
          </label>
          <Input
            aria-label={`Quoted amount for ${patch.title}`}
            disabled={readOnly}
            id={`quote-${patch.lineKey}`}
            inputMode="decimal"
            min="0"
            nativeInput
            onBlur={(event) => onAmountChange(patch, event.currentTarget.value)}
            onChange={(event) =>
              onAmountChange(patch, event.currentTarget.value)
            }
            placeholder="$0.00"
            step="0.01"
            type="number"
            value={amount === undefined ? "" : (amount / 100).toFixed(2)}
          />
        </div>
      </CardPanel>
    </Card>
  );
}

export function ResponseFields({
  access,
  answers,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
}: {
  access: QuoteAccess;
  answers: Record<string, string | undefined>;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
}) {
  const fields = access.package.responseFields.filter(
    (field) => field.kind !== "priced_line"
  );
  if (!fields.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No additional response fields were issued.
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      {fields.map((field) => (
        <ResponseFieldControl
          field={field}
          key={field.sourceFieldId}
          onAnswerChange={onAnswerChange}
          onFileChange={onFileChange}
          readOnly={readOnly}
          uploading={uploading}
          value={answers[field.sourceFieldId] ?? ""}
        />
      ))}
    </div>
  );
}

type ResponseField = QuoteAccess["package"]["responseFields"][number];

export function ResponseFieldControl({
  field,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
  value,
}: {
  field: ResponseField;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
  value: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <label
            className="font-medium text-sm"
            htmlFor={`field-${field.sourceFieldId}`}
          >
            {field.label}
          </label>
          <p className="mt-1 text-muted-foreground text-xs">
            {field.required ? "Required before submission" : "Optional"} ·{" "}
            {field.scope.replace("_", " ")}
          </p>
        </div>
        <Badge variant={field.required ? "success" : "outline"}>
          {field.required ? "Required" : "Optional"}
        </Badge>
      </div>
      {field.richTextDefaultHtml ? (
        <FieldRichTextPreview
          ariaLabel={`${field.label} instructions`}
          className="mb-3"
          value={field.richTextDefaultHtml}
        />
      ) : null}
      <ResponseFieldInput
        field={field}
        onAnswerChange={onAnswerChange}
        onFileChange={onFileChange}
        readOnly={readOnly}
        uploading={uploading}
        value={value}
      />
    </div>
  );
}

export function ResponseFieldInput({
  field,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
  value,
}: {
  field: ResponseField;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
  value: string;
}): ReactNode {
  if (field.kind === "attachment") {
    return (
      <Input
        accept="*/*"
        aria-label={`Attach file for ${field.label}`}
        disabled={readOnly || uploading}
        id={`field-${field.sourceFieldId}`}
        nativeInput
        onChange={(event) => onFileChange(event, field.sourceFieldId)}
        type="file"
      />
    );
  }
  if (field.renderer === "tiptap") {
    return readOnly ? (
      value ? (
        <FieldRichTextPreview
          ariaLabel={`${field.label} response`}
          value={value}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No response was saved.</p>
      )
    ) : (
      <FieldRichTextEditor
        ariaLabel={field.label}
        id={`field-${field.sourceFieldId}`}
        onChange={(next) => onAnswerChange(field.sourceFieldId, next)}
        placeholder={`Respond to ${field.label}`}
        value={value}
      />
    );
  }
  if (field.kind === "long_text") {
    return (
      <Textarea
        disabled={readOnly}
        id={`field-${field.sourceFieldId}`}
        onBlur={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        onChange={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        placeholder={`Respond to ${field.label}`}
        value={value}
      />
    );
  }
  if (field.kind === "choice") {
    return (
      <NativeSelect
        aria-label={field.label}
        disabled={readOnly}
        onChange={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        value={value}
      >
        <NativeSelectOption value="">Select an option</NativeSelectOption>
        {(field.choiceOptions ?? []).map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  }
  return (
    <Input
      disabled={readOnly}
      id={`field-${field.sourceFieldId}`}
      nativeInput
      onBlur={(event) =>
        onAnswerChange(field.sourceFieldId, event.currentTarget.value)
      }
      onChange={(event) =>
        onAnswerChange(field.sourceFieldId, event.currentTarget.value)
      }
      type={field.kind === "date" ? "date" : "text"}
      value={value}
    />
  );
}

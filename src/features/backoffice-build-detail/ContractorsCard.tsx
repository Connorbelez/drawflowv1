"use client";

import { useMutation } from "convex/react";
import { useMemo, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { cn } from "#/lib/utils.ts";
import { initialsFor } from "./format";

type AttachedContractor = {
  _id: string;
  name: string;
  role: string;
  city?: string;
  email?: string;
  hourlyRateCents?: number;
  trades?: string[];
};

type AvailableContractor = {
  _id: Id<"demo_contractors"> | string;
  name: string;
  city: string;
  trades?: string[];
  skills?: string[];
};

type ContractorInput = {
  name: string;
  kind: "company" | "individual";
  hourlyRateCents: number;
  city: string;
  trades: string[];
  skills: string[];
  phone?: string;
  email?: string;
};

interface ContractorActions {
  onAttachExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreateAndAttach?: (input: {
    contractor: ContractorInput;
    role: string;
  }) => Promise<void> | void;
  sourceLabel?: string;
}

const CONTRACTOR_KINDS: Array<{
  value: "company" | "individual";
  label: string;
}> = [
  { value: "company", label: "Company" },
  { value: "individual", label: "Individual" },
];

interface ContractorsCardProps {
  buildId: Id<"demo_builds"> | string;
  contractors: AttachedContractor[];
  availableContractors: AvailableContractor[];
  actions?: ContractorActions;
}

export function ContractorsCard({
  actions,
  buildId,
  contractors,
  availableContractors,
}: ContractorsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <article
      className="rounded-xl border border-border bg-card p-4"
      data-testid="build-detail-contractors"
      id="contractors"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          Contractors{" "}
          <span className="text-[11px] text-muted-foreground">
            {actions?.sourceLabel ?? "demo_contractors"}
          </span>
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {contractors.length} attached
          </span>
          <button
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="contractors-open-add"
            onClick={() => setDialogOpen(true)}
            type="button"
          >
            Add contractor
          </button>
        </div>
      </header>

      {contractors.length === 0 ? (
        <p className="text-muted-foreground text-xs">No contractors yet.</p>
      ) : (
        <ul className="space-y-2">
          {contractors.map((c) => (
            <li
              className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-2"
              data-testid={`build-detail-contractor-${c._id}`}
              key={c._id}
            >
              <span className="grid size-8 place-items-center rounded-full bg-primary/30 text-xs font-semibold">
                {initialsFor(c.name)}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">
                  {c.name}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {c.role}
                  </span>
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {c.trades?.join(", ")} · {c.city} · $
                  {((c.hourlyRateCents ?? 0) / 100).toFixed(0)}/hr
                  {c.email ? ` · ${c.email}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogPopup className="max-w-xl">
          <ContractorAddDialogContent
            actions={actions}
            availableContractors={availableContractors}
            buildId={buildId}
            onDone={() => setDialogOpen(false)}
          />
        </DialogPopup>
      </Dialog>
    </article>
  );
}

interface ContractorAddDialogContentProps {
  actions?: ContractorActions;
  availableContractors: AvailableContractor[];
  buildId: Id<"demo_builds"> | string;
  onDone: () => void;
}

function ContractorAddDialogContent({
  actions,
  availableContractors,
  buildId,
  onDone,
}: ContractorAddDialogContentProps) {
  const [mode, setMode] = useState<"new" | "existing">(
    availableContractors.length > 0 ? "existing" : "new",
  );

  return (
    <>
      <DialogHeader className="border-b border-border p-4">
        <DialogTitle>Add contractor</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {mode === "new"
            ? "Create a new contractor record and attach it to this build."
            : "Attach an existing contractor to this build."}
        </DialogDescription>
        <div
          className="mt-3 inline-flex rounded-md border border-border bg-background p-0.5 text-xs"
          data-testid="contractors-mode-tabs"
          role="tablist"
        >
          {(["new", "existing"] as const).map((value) => (
            <button
              aria-selected={mode === value}
              className={cn(
                "rounded-sm px-3 py-1 font-medium transition-colors",
                mode === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`contractors-mode-${value}`}
              key={value}
              onClick={() => setMode(value)}
              role="tab"
              type="button"
            >
              {value === "new" ? "New contractor" : "Existing"}
            </button>
          ))}
        </div>
      </DialogHeader>
      {mode === "new" ? (
        <NewContractorForm
          actions={actions}
          buildId={buildId}
          onDone={onDone}
        />
      ) : (
        <ExistingContractorForm
          actions={actions}
          availableContractors={availableContractors}
          buildId={buildId}
          onDone={onDone}
        />
      )}
    </>
  );
}

interface NewContractorFormState {
  name: string;
  kind: "company" | "individual";
  hourlyRateDollars: string;
  city: string;
  trades: string;
  skills: string;
  phone: string;
  email: string;
  role: string;
}

const EMPTY_NEW: NewContractorFormState = {
  name: "",
  kind: "company",
  hourlyRateDollars: "",
  city: "",
  trades: "",
  skills: "",
  phone: "",
  email: "",
  role: "",
};

function NewContractorForm({
  actions,
  buildId,
  onDone,
}: {
  actions?: ContractorActions;
  buildId: Id<"demo_builds"> | string;
  onDone: () => void;
}) {
  const create = useMutation(
    api.demo_drawflow_backoffice.demo_createAndAttachContractor,
  );
  const [form, setForm] = useState<NewContractorFormState>(EMPTY_NEW);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof NewContractorFormState>(
    key: K,
    value: NewContractorFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const hourlyRateCents = useMemo(() => {
    const parsed = Number.parseFloat(form.hourlyRateDollars);
    if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
    return Math.round(parsed * 100);
  }, [form.hourlyRateDollars]);

  const canSubmit =
    !pending &&
    form.name.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.role.trim().length > 0 &&
    form.trades.trim().length > 0 &&
    Number.isFinite(hourlyRateCents);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      const contractor = {
        name: form.name.trim(),
        kind: form.kind,
        hourlyRateCents,
        city: form.city.trim(),
        trades: splitChips(form.trades),
        skills: splitChips(form.skills),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      };
      if (actions?.onCreateAndAttach) {
        await actions.onCreateAndAttach({
          contractor,
          role: form.role.trim(),
        });
      } else {
        await create({
          buildId: buildId as Id<"demo_builds">,
          role: form.role.trim(),
          contractor,
        });
      }
      setForm(EMPTY_NEW);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 p-4"
      data-testid="contractors-new-form"
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-2 gap-3">
        <LabelledInput
          autoFocus
          label="Name"
          onChange={(v) => set("name", v)}
          placeholder="Northpeak Concrete"
          required
          testid="contractors-new-name"
          value={form.name}
        />
        <LabelledField label="Kind">
          <div className="inline-flex w-full rounded-md border border-border bg-background p-0.5 text-xs">
            {CONTRACTOR_KINDS.map((opt) => (
              <button
                aria-pressed={form.kind === opt.value}
                className={cn(
                  "flex-1 rounded-sm px-2 py-1 font-medium transition-colors",
                  form.kind === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`contractors-new-kind-${opt.value}`}
                key={opt.value}
                onClick={() => set("kind", opt.value)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </LabelledField>
        <LabelledInput
          label="City"
          onChange={(v) => set("city", v)}
          placeholder="Boulder, CO"
          required
          testid="contractors-new-city"
          value={form.city}
        />
        <LabelledInput
          inputMode="decimal"
          label="Hourly rate (USD)"
          onChange={(v) => set("hourlyRateDollars", v)}
          placeholder="85.00"
          required
          step="0.01"
          testid="contractors-new-rate"
          type="number"
          value={form.hourlyRateDollars}
        />
        <LabelledInput
          hint="Comma-separated (e.g. concrete, foundation)"
          label="Trades"
          onChange={(v) => set("trades", v)}
          placeholder="concrete, foundation"
          required
          testid="contractors-new-trades"
          value={form.trades}
        />
        <LabelledInput
          hint="Comma-separated (optional)"
          label="Skills"
          onChange={(v) => set("skills", v)}
          placeholder="forms, rebar, slab"
          testid="contractors-new-skills"
          value={form.skills}
        />
        <LabelledInput
          label="Phone"
          onChange={(v) => set("phone", v)}
          placeholder="303-555-0118"
          testid="contractors-new-phone"
          type="tel"
          value={form.phone}
        />
        <LabelledInput
          label="Email"
          onChange={(v) => set("email", v)}
          placeholder="ops@northpeak.example"
          testid="contractors-new-email"
          type="email"
          value={form.email}
        />
        <LabelledInput
          className="col-span-2"
          hint="Their role on this specific build (e.g. Foundation lead)"
          label="Role on this build"
          onChange={(v) => set("role", v)}
          placeholder="Foundation lead"
          required
          testid="contractors-new-role"
          value={form.role}
        />
      </div>
      {error ? (
        <p
          className="text-[11px] text-destructive"
          data-testid="contractors-new-error"
        >
          {error}
        </p>
      ) : null}
      <DialogFooter className="-mx-4 -mb-4 mt-2 border-t border-border bg-muted/30 px-4 py-3">
        <DialogClose
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
          render={<button type="button" />}
        >
          Cancel
        </DialogClose>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="contractors-new-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {pending ? "Creating…" : "Create & attach"}
        </button>
      </DialogFooter>
    </form>
  );
}

function ExistingContractorForm({
  actions,
  availableContractors,
  buildId,
  onDone,
}: {
  actions?: ContractorActions;
  availableContractors: AvailableContractor[];
  buildId: Id<"demo_builds"> | string;
  onDone: () => void;
}) {
  const attach = useMutation(
    api.demo_drawflow_backoffice.demo_attachContractorToBuild,
  );
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableContractors.slice(0, 8);
    return availableContractors
      .filter((c) => {
        const haystack = [
          c.name,
          c.city,
          ...(c.trades ?? []),
          ...(c.skills ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [query, availableContractors]);

  const selected = useMemo(
    () => availableContractors.find((c) => c._id === selectedId) ?? null,
    [availableContractors, selectedId],
  );

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !role.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      if (actions?.onAttachExisting) {
        await actions.onAttachExisting({
          contractorId: String(selected._id),
          role: role.trim(),
        });
      } else {
        await attach({
          buildId: buildId as Id<"demo_builds">,
          contractorId: selected._id as Id<"demo_contractors">,
          role: role.trim(),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const canSubmit = selected !== null && role.trim().length > 0 && !pending;

  return (
    <form
      className="flex flex-col gap-3 p-4"
      data-testid="contractors-existing-form"
      onSubmit={onSubmit}
    >
      {availableContractors.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          No unattached contractors available for this scenario. Use the
          “New&nbsp;contractor” tab to create one.
        </p>
      ) : (
        <>
          <LabelledField label="Contractor">
            <input
              aria-label="Search contractors"
              autoFocus
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              data-testid="contractors-existing-search"
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
                if (!role.trim()) setRole("");
              }}
              placeholder="Search by name, trade, city…"
              type="text"
              value={query}
            />
            <ul
              className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-1"
              data-testid="contractors-existing-suggestions"
            >
              {matches.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  No matches.
                </li>
              ) : (
                matches.map((c) => {
                  const isSelected = c._id === selectedId;
                  return (
                    <li key={c._id}>
                      <button
                        aria-pressed={isSelected}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                          isSelected
                            ? "bg-primary/15 ring-1 ring-primary"
                            : "hover:bg-accent",
                        )}
                        data-testid={`contractors-existing-suggestion-${c._id}`}
                        onClick={() => {
                          setSelectedId(c._id);
                          setQuery(c.name);
                          if (!role.trim() && c.trades?.length) {
                            setRole(c.trades[0]);
                          }
                        }}
                        type="button"
                      >
                        <span className="grid size-6 place-items-center rounded-full bg-primary/30 text-[10px] font-semibold">
                          {initialsFor(c.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {c.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {c.trades?.join(", ")} · {c.city}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </LabelledField>
          <LabelledInput
            label="Role on this build"
            onChange={setRole}
            placeholder="Foundation lead"
            required
            testid="contractors-existing-role"
            value={role}
          />
        </>
      )}
      {error ? (
        <p
          className="text-[11px] text-destructive"
          data-testid="contractors-existing-error"
        >
          {error}
        </p>
      ) : null}
      <DialogFooter className="-mx-4 -mb-4 mt-2 border-t border-border bg-muted/30 px-4 py-3">
        <DialogClose
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
          render={<button type="button" />}
        >
          Cancel
        </DialogClose>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="contractors-existing-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {pending ? "Attaching…" : "Attach"}
        </button>
      </DialogFooter>
    </form>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function splitChips(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function LabelledField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs", className)}>
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function LabelledInput({
  autoFocus,
  className,
  hint,
  inputMode,
  label,
  onChange,
  placeholder,
  required,
  step,
  testid,
  type,
  value,
}: {
  autoFocus?: boolean;
  className?: string;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  step?: string;
  testid?: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}) {
  return (
    <LabelledField className={className} label={label}>
      <input
        autoFocus={autoFocus}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        data-testid={testid}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type ?? "text"}
        value={value}
      />
      {hint ? (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </LabelledField>
  );
}

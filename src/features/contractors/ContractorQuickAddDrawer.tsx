"use client";

import { Building2, Link2, Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

export type ContractorProfileDraft = {
  availabilityWindows: Array<{
    dayOfWeek: number;
    endMinute: number;
    startMinute: number;
    timezone: string;
  }>;
  capabilities: Array<{
    capabilityKey: string;
    label: string;
    milestoneArchetypeKey?: string;
    trade?: string;
  }>;
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit: "hour" | "day" | "fixed";
  email?: string;
  equipment: Array<{
    equipmentKey: string;
    name: string;
    quantity: number;
  }>;
  kind: "company" | "individual";
  name: string;
  phone?: string;
  trades: string[];
};

export type ContractorAssignmentCostDraft = {
  actualCostCents?: number;
  actualHours?: number;
  agreedRateCents?: number;
  agreedRateUnit?: "hour" | "day" | "fixed";
  costNotes?: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
};

export type ContractorDrawerAvailableContractor = {
  _id: string;
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "hour" | "day" | "fixed";
  name: string;
  trades?: string[];
};

type ContractorQuickAddDrawerProps = {
  availableContractors?: ContractorDrawerAvailableContractor[];
  createLabel?: string;
  description?: string;
  onAttachExisting?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreate: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    role?: string;
  }) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requireRole?: boolean;
  showAssignmentCost?: boolean;
  title?: string;
};

type ContractorQuickAddForm = {
  actualCost: string;
  actualHours: string;
  availabilityDay: string;
  availabilityEnd: string;
  availabilityStart: string;
  assignmentRate: string;
  assignmentRateUnit: "hour" | "day" | "fixed";
  capabilities: string;
  city: string;
  costNotes: string;
  email: string;
  estimatedCost: string;
  estimatedHours: string;
  equipment: string;
  kind: "company" | "individual";
  name: string;
  payRate: string;
  payRateUnit: "hour" | "day" | "fixed";
  phone: string;
  role: string;
  timezone: string;
  trades: string;
};

const EMPTY_FORM: ContractorQuickAddForm = {
  actualCost: "",
  actualHours: "",
  availabilityDay: "1",
  availabilityEnd: "16:00",
  availabilityStart: "07:00",
  assignmentRate: "",
  assignmentRateUnit: "hour" as const,
  capabilities: "",
  city: "",
  costNotes: "",
  email: "",
  estimatedCost: "",
  estimatedHours: "",
  equipment: "",
  kind: "company" as const,
  name: "",
  payRate: "",
  payRateUnit: "hour" as const,
  phone: "",
  role: "",
  timezone: "America/Toronto",
  trades: "",
};

export function ContractorQuickAddDrawer({
  availableContractors = [],
  createLabel = "Create contractor",
  description = "Create the profile once, then attach it to builds and milestone work as needed.",
  onAttachExisting,
  onCreate,
  onOpenChange,
  open,
  requireRole = false,
  showAssignmentCost = false,
  title = "Add contractor",
}: ContractorQuickAddDrawerProps) {
  const [mode, setMode] = useState<"new" | "existing">(
    onAttachExisting && availableContractors.length > 0 ? "existing" : "new",
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const updateForm = <K extends keyof ContractorQuickAddForm>(
    key: K,
    value: ContractorQuickAddForm[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableContractors
      .filter((contractor) =>
        q
          ? [
              contractor.name,
              contractor.city,
              ...(contractor.trades ?? []),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q)
          : true,
      )
      .slice(0, 8);
  }, [availableContractors, query]);

  const roleReady = !requireRole || form.role.trim().length > 0;
  const hourlyRateCents = parseMoneyCents(form.payRate);
  const canCreate =
    form.name.trim().length > 0 &&
    form.trades.trim().length > 0 &&
    roleReady &&
    !pending;
  const canAttach =
    Boolean(onAttachExisting) &&
    selectedExistingId.length > 0 &&
    roleReady &&
    !pending;

  const reset = () => {
    setForm(EMPTY_FORM);
    setSelectedExistingId("");
    setQuery("");
    setError("");
    setMode(onAttachExisting && availableContractors.length > 0 ? "existing" : "new");
  };

  const submitNew = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    setPending(true);
    setError("");
    try {
      const trades = splitList(form.trades);
      const contractor: ContractorProfileDraft = {
        availabilityWindows: [
          {
            dayOfWeek: Number(form.availabilityDay),
            endMinute: timeToMinute(form.availabilityEnd),
            startMinute: timeToMinute(form.availabilityStart),
            timezone: form.timezone.trim() || "America/Toronto",
          },
        ],
        capabilities: splitList(form.capabilities).map((label) => ({
          capabilityKey: slugify(label),
          label,
          trade: trades[0],
        })),
        city: optional(form.city),
        defaultPayRateCents: hourlyRateCents,
        defaultPayRateUnit: form.payRateUnit,
        email: optional(form.email),
        equipment: splitList(form.equipment).map((name) => ({
          equipmentKey: slugify(name),
          name,
          quantity: 1,
        })),
        kind: form.kind,
        name: form.name.trim(),
        phone: optional(form.phone),
        trades,
      };
      await onCreate({
        assignmentCost: showAssignmentCost
          ? assignmentCostFromForm(form, hourlyRateCents)
          : undefined,
        contractor,
        role: optional(form.role),
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const submitExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAttach || !onAttachExisting) return;
    setPending(true);
    setError("");
    try {
      await onAttachExisting({
        assignmentCost: showAssignmentCost ? assignmentCostFromForm(form) : undefined,
        contractorId: selectedExistingId,
        role: form.role.trim(),
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="right">
      <DrawerPopup showCloseButton>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <p className="max-w-prose text-muted-foreground text-sm">
            {description}
          </p>
          {onAttachExisting ? (
            <div className="mt-2 inline-flex w-fit rounded-lg border bg-muted/40 p-1">
              <ModeButton active={mode === "existing"} onClick={() => setMode("existing")}>
                <Link2 className="size-3.5" />
                Existing
              </ModeButton>
              <ModeButton active={mode === "new"} onClick={() => setMode("new")}>
                <Plus className="size-3.5" />
                New
              </ModeButton>
            </div>
          ) : null}
        </DrawerHeader>

        <DrawerPanel className="grid gap-4">
          {mode === "existing" && onAttachExisting ? (
            <form className="grid gap-4" id="contractor-existing-form" onSubmit={submitExisting}>
              <Field label="Find contractor">
                <span className="relative block">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    nativeInput
                    onChange={(event) => {
                      setQuery(event.currentTarget.value);
                      setSelectedExistingId("");
                    }}
                    placeholder="Search name, trade, or city"
                    value={query}
                  />
                </span>
              </Field>
              <div className="grid gap-2">
                {matches.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                    No matching contractor profiles in this brokerage.
                  </p>
                ) : (
                  matches.map((contractor) => (
                    <button
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                        selectedExistingId === contractor._id
                          ? "border-primary bg-primary/10"
                          : "bg-card hover:bg-accent",
                      )}
                      key={contractor._id}
                      onClick={() => {
                        setSelectedExistingId(contractor._id);
                        if (!form.role.trim() && contractor.trades?.[0]) {
                          setForm((prev) => ({
                            ...prev,
                            role: titleCase(contractor.trades?.[0] ?? ""),
                          }));
                        }
                        if (contractor.defaultPayRateCents) {
                          setForm((prev) => ({
                            ...prev,
                            assignmentRate: centsToMoney(
                              contractor.defaultPayRateCents,
                            ),
                            assignmentRateUnit:
                              contractor.defaultPayRateUnit ?? "hour",
                          }));
                        }
                      }}
                      type="button"
                    >
                      <AvatarIcon label={contractor.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {contractor.name}
                        </span>
                        <span className="block truncate text-muted-foreground text-xs">
                          {(contractor.trades ?? []).join(", ") || "No trades"}{" "}
                          {contractor.city ? `· ${contractor.city}` : ""}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {requireRole ? (
                <Field label="Role on this build">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("role", event.currentTarget.value)
                    }
                    placeholder="Foundation lead"
                    value={form.role}
                  />
                </Field>
              ) : null}
              {showAssignmentCost ? (
                <AssignmentCostFields form={form} setForm={setForm} />
              ) : null}
            </form>
          ) : (
            <form className="grid gap-4" id="contractor-new-form" onSubmit={submitNew}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    autoFocus
                    nativeInput
                    onChange={(event) =>
                      updateForm("name", event.currentTarget.value)
                    }
                    placeholder="Northstar Masonry"
                    value={form.name}
                  />
                </Field>
                <Field label="Kind">
                  <NativeSelect
                    className="w-full"
                    onChange={(event) =>
                      updateForm(
                        "kind",
                        event.currentTarget.value as "company" | "individual",
                      )
                    }
                    value={form.kind}
                  >
                    <NativeSelectOption value="company">Company</NativeSelectOption>
                    <NativeSelectOption value="individual">
                      Individual
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="City">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("city", event.currentTarget.value)
                    }
                    placeholder="Toronto, ON"
                    value={form.city}
                  />
                </Field>
                <Field label="Pay rate">
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                    <Input
                      inputMode="decimal"
                      nativeInput
                      onChange={(event) =>
                        updateForm("payRate", event.currentTarget.value)
                      }
                      placeholder="85.00"
                      type="number"
                      value={form.payRate}
                    />
                    <NativeSelect
                      className="w-full"
                      onChange={(event) =>
                        updateForm(
                          "payRateUnit",
                          event.currentTarget.value as
                            | "hour"
                            | "day"
                            | "fixed",
                        )
                      }
                      value={form.payRateUnit}
                    >
                      <NativeSelectOption value="hour">Hour</NativeSelectOption>
                      <NativeSelectOption value="day">Day</NativeSelectOption>
                      <NativeSelectOption value="fixed">Fixed</NativeSelectOption>
                    </NativeSelect>
                  </div>
                </Field>
              </div>

              <Field label="Trades">
                <Input
                  nativeInput
                  onChange={(event) =>
                    updateForm("trades", event.currentTarget.value)
                  }
                  placeholder="masonry, brick, envelope"
                  value={form.trades}
                />
              </Field>
              <Field label="Capabilities">
                <Textarea
                  className="min-h-20"
                  onChange={(event) =>
                    updateForm("capabilities", event.currentTarget.value)
                  }
                  placeholder="Brick siding, CMU walls, veneer repair"
                  value={form.capabilities}
                />
              </Field>
              <Field label="Equipment">
                <Input
                  nativeInput
                  onChange={(event) =>
                    updateForm("equipment", event.currentTarget.value)
                  }
                  placeholder="telehandler, mixer, scaffold"
                  value={form.equipment}
                />
              </Field>

              <div className="grid gap-3 rounded-lg border bg-muted/24 p-3 sm:grid-cols-[7rem_1fr_1fr]">
                <Field label="Day">
                  <NativeSelect
                    className="w-full"
                    onChange={(event) =>
                      updateForm("availabilityDay", event.currentTarget.value)
                    }
                    value={form.availabilityDay}
                  >
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day, index) => (
                        <NativeSelectOption key={day} value={String(index)}>
                          {day}
                        </NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
                </Field>
                <Field label="Start">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("availabilityStart", event.currentTarget.value)
                    }
                    type="time"
                    value={form.availabilityStart}
                  />
                </Field>
                <Field label="End">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("availabilityEnd", event.currentTarget.value)
                    }
                    type="time"
                    value={form.availabilityEnd}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("email", event.currentTarget.value)
                    }
                    placeholder="ops@example.com"
                    type="email"
                    value={form.email}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("phone", event.currentTarget.value)
                    }
                    placeholder="416-555-0101"
                    type="tel"
                    value={form.phone}
                  />
                </Field>
              </div>

              {requireRole ? (
                <Field label="Role on this build">
                  <Input
                    nativeInput
                    onChange={(event) =>
                      updateForm("role", event.currentTarget.value)
                    }
                    placeholder="Foundation lead"
                    value={form.role}
                  />
                </Field>
              ) : null}
              {showAssignmentCost ? (
                <AssignmentCostFields form={form} setForm={setForm} />
              ) : null}
            </form>
          )}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Schedule, rate, capabilities, equipment
            </Badge>
            <Badge variant="secondary">Brokerage scoped</Badge>
          </div>
        </DrawerPanel>

        <DrawerFooter>
          <DrawerClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DrawerClose>
          <Button
            disabled={mode === "existing" ? !canAttach : !canCreate}
            form={mode === "existing" ? "contractor-existing-form" : "contractor-new-form"}
            type="submit"
          >
            {mode === "existing" ? <Link2 /> : <Plus />}
            {pending
              ? "Saving..."
              : mode === "existing"
                ? "Attach contractor"
                : createLabel}
          </Button>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}

function AssignmentCostFields({
  form,
  setForm,
}: {
  form: ContractorQuickAddForm;
  setForm: React.Dispatch<React.SetStateAction<ContractorQuickAddForm>>;
}) {
  const updateForm = <K extends keyof ContractorQuickAddForm>(
    key: K,
    value: ContractorQuickAddForm[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <section className="grid gap-3 border-t pt-3">
      <div>
        <p className="font-medium text-muted-foreground text-xs uppercase">
          Cost tracking
        </p>
        <p className="text-muted-foreground text-xs">
          Captured on the milestone assignment for performance and cost history.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agreed rate">
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
            <Input
              inputMode="decimal"
              nativeInput
              onChange={(event) =>
                updateForm("assignmentRate", event.currentTarget.value)
              }
              placeholder="90.00"
              type="number"
              value={form.assignmentRate}
            />
            <NativeSelect
              className="w-full"
              onChange={(event) =>
                updateForm(
                  "assignmentRateUnit",
                  event.currentTarget.value as
                    | "hour"
                    | "day"
                    | "fixed",
                )
              }
              value={form.assignmentRateUnit}
            >
              <NativeSelectOption value="hour">Hour</NativeSelectOption>
              <NativeSelectOption value="day">Day</NativeSelectOption>
              <NativeSelectOption value="fixed">Fixed</NativeSelectOption>
            </NativeSelect>
          </div>
        </Field>
        <Field label="Estimated hours">
          <Input
            inputMode="decimal"
            nativeInput
            onChange={(event) =>
              updateForm("estimatedHours", event.currentTarget.value)
            }
            placeholder="48"
            type="number"
            value={form.estimatedHours}
          />
        </Field>
        <Field label="Estimated cost">
          <Input
            inputMode="decimal"
            nativeInput
            onChange={(event) =>
              updateForm("estimatedCost", event.currentTarget.value)
            }
            placeholder="4320.00"
            type="number"
            value={form.estimatedCost}
          />
        </Field>
        <Field label="Actual hours">
          <Input
            inputMode="decimal"
            nativeInput
            onChange={(event) =>
              updateForm("actualHours", event.currentTarget.value)
            }
            placeholder="46.5"
            type="number"
            value={form.actualHours}
          />
        </Field>
        <Field label="Actual cost">
          <Input
            inputMode="decimal"
            nativeInput
            onChange={(event) =>
              updateForm("actualCost", event.currentTarget.value)
            }
            placeholder="4185.00"
            type="number"
            value={form.actualCost}
          />
        </Field>
      </div>
      <Field label="Cost note">
        <Textarea
          className="min-h-16"
          onChange={(event) =>
            updateForm("costNotes", event.currentTarget.value)
          }
          placeholder="Crew finished early; no lift rental needed."
          value={form.costNotes}
        />
      </Field>
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground text-xs uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
        active ? "bg-background shadow-xs/5" : "text-muted-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function AvatarIcon({ label }: { label: string }) {
  const Icon = label.toLowerCase().includes("llc") ? Building2 : UserRound;
  return (
    <span className="grid size-9 place-items-center rounded-lg bg-primary/20 text-primary">
      <Icon className="size-4" />
    </span>
  );
}

function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "capability"
  );
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseMoneyCents(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function parseHours(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100) / 100;
}

function centsToMoney(value: number) {
  return (value / 100).toFixed(2);
}

function assignmentCostFromForm(
  form: ContractorQuickAddForm,
  fallbackRateCents?: number,
): ContractorAssignmentCostDraft {
  return {
    actualCostCents: parseMoneyCents(form.actualCost),
    actualHours: parseHours(form.actualHours),
    agreedRateCents:
      parseMoneyCents(form.assignmentRate) ?? fallbackRateCents,
    agreedRateUnit: form.assignmentRateUnit,
    costNotes: optional(form.costNotes),
    estimatedCostCents: parseMoneyCents(form.estimatedCost),
    estimatedHours: parseHours(form.estimatedHours),
  };
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(24 * 60, hour * 60 + minute));
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

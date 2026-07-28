"use client";

import {
  Building2,
  CheckCircle2,
  Link2,
  MailPlus,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
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
  email?: string;
  name: string;
  onboardingStatus?: "profile_only" | "invited" | "account_linked";
  trades?: string[];
};

type ContractorQuickAddDrawerProps = {
  availableContractors?: ContractorDrawerAvailableContractor[];
  createLabel?: string;
  description?: string;
  initialDraft?: Partial<ContractorProfileDraft>;
  inviteAfterCreateDescription?: string;
  inviteAfterCreateLabel?: string;
  onAttachExisting?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreate: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    role?: string;
  }) => ContractorCreateResult | Promise<ContractorCreateResult>;
  onInviteCreatedContractor?: (contractorId: string) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requireRole?: boolean;
  showAssignmentCost?: boolean;
  title?: string;
};

type ContractorCreateResult =
  | string
  | void
  | {
      contractorId?: string;
    };

type ContractorQuickAddForm = {
  actualCost: string;
  actualHours: string;
  availabilityWindows: ContractorProfileDraft["availabilityWindows"];
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
  trades: string;
};

const EMPTY_FORM: ContractorQuickAddForm = {
  actualCost: "",
  actualHours: "",
  availabilityWindows: [],
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
  trades: "",
};

export function ContractorQuickAddDrawer({
  availableContractors = [],
  createLabel = "Create contractor",
  description = "Create the profile once, then attach it to builds and milestone work as needed.",
  initialDraft,
  inviteAfterCreateDescription = "Send a WorkOS invitation immediately after the profile is created.",
  inviteAfterCreateLabel = "Invite contractor to the platform",
  onAttachExisting,
  onCreate,
  onInviteCreatedContractor,
  onOpenChange,
  open,
  requireRole = false,
  showAssignmentCost = false,
  title = "Add contractor",
}: ContractorQuickAddDrawerProps) {
  const [mode, setMode] = useState<"new" | "existing">(
    onAttachExisting && availableContractors.length > 0 ? "existing" : "new"
  );
  const [form, setForm] = useState(() => formFromInitialDraft(initialDraft));
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [inviteAfterCreate, setInviteAfterCreate] = useState(false);
  const updateForm = <K extends keyof ContractorQuickAddForm>(
    key: K,
    value: ContractorQuickAddForm[K]
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
          ? [contractor.name, contractor.city, ...(contractor.trades ?? [])]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q)
          : true
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
    setForm(formFromInitialDraft(initialDraft));
    setSelectedExistingId("");
    setQuery("");
    setError("");
    setInviteAfterCreate(false);
    setMode(
      onAttachExisting && availableContractors.length > 0 ? "existing" : "new"
    );
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(formFromInitialDraft(initialDraft));
    setMode(
      onAttachExisting && availableContractors.length > 0 ? "existing" : "new"
    );
    setInviteAfterCreate(false);
  }, [availableContractors.length, initialDraft, onAttachExisting, open]);

  useEffect(() => {
    if (!form.email.trim()) {
      setInviteAfterCreate(false);
    }
  }, [form.email]);

  const submitNew = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const trades = splitList(form.trades);
      const contractor: ContractorProfileDraft = {
        availabilityWindows: form.availabilityWindows,
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
      const createResult = await onCreate({
        assignmentCost: showAssignmentCost
          ? assignmentCostFromForm(form, hourlyRateCents)
          : undefined,
        contractor,
        role: optional(form.role),
      });
      if (inviteAfterCreate && onInviteCreatedContractor) {
        const contractorId = contractorIdFromCreateResult(createResult);
        if (!contractorId) {
          throw new Error(
            "Contractor was created, but the invite could not be sent because the new profile id was not returned."
          );
        }
        await onInviteCreatedContractor(contractorId);
      }
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
    if (!(canAttach && onAttachExisting)) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await onAttachExisting({
        assignmentCost: showAssignmentCost
          ? assignmentCostFromForm(form)
          : undefined,
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

  const submitExistingWithInvite = async (
    contractor: ContractorDrawerAvailableContractor
  ) => {
    if (!(onAttachExisting && onInviteCreatedContractor)) {
      return;
    }
    const role =
      form.role.trim() ||
      titleCase(contractor.trades?.[0] ?? "") ||
      "Contractor";
    if (!role.trim()) {
      return;
    }
    setSelectedExistingId(contractor._id);
    setPending(true);
    setError("");
    try {
      await onAttachExisting({
        assignmentCost: showAssignmentCost
          ? assignmentCostFromForm({ ...form, role })
          : undefined,
        contractorId: contractor._id,
        role,
      });
      await onInviteCreatedContractor(contractor._id);
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
              <ModeButton
                active={mode === "existing"}
                onClick={() => setMode("existing")}
              >
                <Link2 className="size-3.5" />
                Existing
              </ModeButton>
              <ModeButton
                active={mode === "new"}
                onClick={() => setMode("new")}
              >
                <Plus className="size-3.5" />
                New
              </ModeButton>
            </div>
          ) : null}
        </DrawerHeader>

        <DrawerPanel className="grid gap-4">
          {mode === "existing" && onAttachExisting ? (
            <form
              className="grid gap-4"
              id="contractor-existing-form"
              onSubmit={submitExisting}
            >
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
                  matches.map((contractor) => {
                    const selected = selectedExistingId === contractor._id;
                    const invitation = contractorInvitationView(contractor);
                    const canAttachAndInvite =
                      selected &&
                      Boolean(onInviteCreatedContractor) &&
                      invitation.kind === "not_invited" &&
                      Boolean(onAttachExisting) &&
                      roleReady &&
                      !pending;
                    return (
                      <div
                        className={cn(
                          "rounded-lg border bg-card transition-colors",
                          selected
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent"
                        )}
                        key={contractor._id}
                      >
                        <button
                          className="flex w-full min-w-0 items-center gap-3 p-3 text-left text-sm"
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
                                  contractor.defaultPayRateCents
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
                              {(contractor.trades ?? []).join(", ") ||
                                "No trades"}{" "}
                              {contractor.city ? `· ${contractor.city}` : ""}
                            </span>
                          </span>
                          <ContractorInviteStateBadge invitation={invitation} />
                        </button>
                        {selected && invitation.kind !== "joined" ? (
                          <div className="grid gap-2 border-t px-3 py-2">
                            <p className="text-muted-foreground text-xs">
                              {invitation.description}
                            </p>
                            {invitation.kind === "not_invited" ? (
                              <Button
                                aria-label={`Invite ${contractor.name}`}
                                className="w-full justify-center"
                                disabled={!canAttachAndInvite}
                                onClick={() =>
                                  void submitExistingWithInvite(contractor)
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <MailPlus />
                                {pending ? "Sending..." : "Invite"}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
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
            <form
              className="grid gap-4"
              id="contractor-new-form"
              onSubmit={submitNew}
            >
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
                        event.currentTarget.value as "company" | "individual"
                      )
                    }
                    value={form.kind}
                  >
                    <NativeSelectOption value="company">
                      Company
                    </NativeSelectOption>
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
                          event.currentTarget.value as "hour" | "day" | "fixed"
                        )
                      }
                      value={form.payRateUnit}
                    >
                      <NativeSelectOption value="hour">Hour</NativeSelectOption>
                      <NativeSelectOption value="day">Day</NativeSelectOption>
                      <NativeSelectOption value="fixed">
                        Fixed
                      </NativeSelectOption>
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
              {onInviteCreatedContractor ? (
                <label
                  className={cn(
                    "flex gap-3 rounded-lg border bg-background/70 p-3 text-sm",
                    form.email.trim()
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-70"
                  )}
                >
                  <Checkbox
                    checked={inviteAfterCreate}
                    disabled={!form.email.trim() || pending}
                    onCheckedChange={(checked) =>
                      setInviteAfterCreate(checked === true)
                    }
                  />
                  <span className="grid gap-1">
                    <span className="font-medium">
                      {inviteAfterCreateLabel}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {form.email.trim()
                        ? inviteAfterCreateDescription
                        : "Add an email address to send a platform invite."}
                    </span>
                  </span>
                </label>
              ) : null}
            </form>
          )}

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Rate, capabilities, equipment</Badge>
            <Badge variant="secondary">Brokerage scoped</Badge>
          </div>
        </DrawerPanel>

        <DrawerFooter>
          <DrawerClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DrawerClose>
          <Button
            disabled={mode === "existing" ? !canAttach : !canCreate}
            form={
              mode === "existing"
                ? "contractor-existing-form"
                : "contractor-new-form"
            }
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

type ContractorInvitationView =
  | {
      description: string;
      kind: "not_invited";
      label: string;
    }
  | {
      description: string;
      kind: "invited";
      label: string;
    }
  | {
      description: string;
      kind: "joined";
      label: string;
    }
  | {
      description: string;
      kind: "no_email";
      label: string;
    };

function contractorInvitationView(
  contractor: ContractorDrawerAvailableContractor
): ContractorInvitationView {
  if (contractor.onboardingStatus === "account_linked") {
    return {
      description: "This contractor has already joined the platform.",
      kind: "joined",
      label: "Joined",
    };
  }
  if (contractor.onboardingStatus === "invited") {
    return {
      description: "This contractor already has an active platform invite.",
      kind: "invited",
      label: "Invited",
    };
  }
  if (!contractor.email?.trim()) {
    return {
      description: "Add an email to the contractor profile before inviting.",
      kind: "no_email",
      label: "No email",
    };
  }
  return {
    description: "Attach this contractor to the proposal and send their platform invite.",
    kind: "not_invited",
    label: "Not invited",
  };
}

function ContractorInviteStateBadge({
  invitation,
}: {
  invitation: ContractorInvitationView;
}) {
  if (invitation.kind === "joined") {
    return (
      <Badge className="shrink-0 gap-1" variant="secondary">
        <CheckCircle2 className="size-3" />
        {invitation.label}
      </Badge>
    );
  }
  return (
    <Badge
      className="shrink-0"
      variant={invitation.kind === "not_invited" ? "outline" : "secondary"}
    >
      {invitation.label}
    </Badge>
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
    value: ContractorQuickAddForm[K]
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
                  event.currentTarget.value as "hour" | "day" | "fixed"
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
        active ? "bg-background shadow-xs/5" : "text-muted-foreground"
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
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return Math.round(parsed * 100);
}

function parseHours(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return Math.round(parsed * 100) / 100;
}

function centsToMoney(value: number) {
  return (value / 100).toFixed(2);
}

function assignmentCostFromForm(
  form: ContractorQuickAddForm,
  fallbackRateCents?: number
): ContractorAssignmentCostDraft {
  return {
    actualCostCents: parseMoneyCents(form.actualCost),
    actualHours: parseHours(form.actualHours),
    agreedRateCents: parseMoneyCents(form.assignmentRate) ?? fallbackRateCents,
    agreedRateUnit: form.assignmentRateUnit,
    costNotes: optional(form.costNotes),
    estimatedCostCents: parseMoneyCents(form.estimatedCost),
    estimatedHours: parseHours(form.estimatedHours),
  };
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contractorIdFromCreateResult(
  result: ContractorCreateResult
): string | null {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result.contractorId === "string") {
    return result.contractorId;
  }
  return null;
}

function formFromInitialDraft(
  draft?: Partial<ContractorProfileDraft>
): ContractorQuickAddForm {
  if (!draft) {
    return { ...EMPTY_FORM };
  }
  return {
    ...EMPTY_FORM,
    availabilityWindows: draft.availabilityWindows ?? [],
    capabilities: (draft.capabilities ?? [])
      .map((capability) => capability.label)
      .join(", "),
    city: draft.city ?? "",
    email: draft.email ?? "",
    equipment: (draft.equipment ?? [])
      .map((equipment) => equipment.name)
      .join(", "),
    kind: draft.kind ?? "company",
    name: draft.name ?? "",
    payRate:
      draft.defaultPayRateCents === undefined
        ? ""
        : centsToMoney(draft.defaultPayRateCents),
    payRateUnit: draft.defaultPayRateUnit ?? "hour",
    phone: draft.phone ?? "",
    trades: (draft.trades ?? []).join(", "),
  };
}

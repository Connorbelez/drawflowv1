import { UserPlus } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";

import type {
  AssignmentForm,
  ContractorPlanningMilestone,
  MilestoneAssignment,
  ProposalContractor,
} from "./ContractorPlanningPanel.tsx";

export function RemoveAssignmentDialog({
  assignment,
  error,
  onOpenChange,
  onReasonChange,
  pending,
  reason,
  submitRemoval,
}: {
  assignment: MilestoneAssignment | null;
  error: string;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  pending: boolean;
  reason: string;
  submitRemoval: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={assignment !== null}>
      <DialogPopup className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove crew assignment?</DialogTitle>
          <DialogDescription>
            {assignment
              ? `${assignment.contractorName} will lose the ${assignment.milestoneName} scope. The decision remains in audit history and the contractor receives a notice.`
              : "Remove this crew assignment."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="space-y-4"
            id="remove-contractor-assignment-form"
            onSubmit={submitRemoval}
          >
            <Field>
              <FieldLabel htmlFor="remove-contractor-assignment-reason">
                Removal reason
              </FieldLabel>
              <Input
                aria-invalid={Boolean(error)}
                id="remove-contractor-assignment-reason"
                nativeInput
                onChange={(event) =>
                  onReasonChange((event.target as HTMLInputElement).value)
                }
                placeholder="Explain why this assignment is being removed"
                value={reason}
              />
            </Field>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Keep assignment
          </DialogClose>
          <Button
            disabled={!reason.trim()}
            form="remove-contractor-assignment-form"
            loading={pending}
            type="submit"
            variant="destructive"
          >
            Remove assignment
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function AssignmentDialog({
  activeMilestone,
  canAssign,
  contractor,
  error,
  form,
  milestones,
  onOpenChange,
  open,
  pending,
  setForm,
  submitAssignment,
}: {
  activeMilestone?: ContractorPlanningMilestone;
  canAssign: boolean;
  contractor?: ProposalContractor;
  error: string;
  form: AssignmentForm;
  milestones: ContractorPlanningMilestone[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  setForm: Dispatch<SetStateAction<AssignmentForm>>;
  submitAssignment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const milestone = milestones.find(
    (row) => row.milestoneKey === form.milestoneKey
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup
        className="w-full sm:max-w-4xl"
        data-testid="assign-contractor-dialog"
      >
        <DialogHeader>
          <DialogTitle>Assign contractor to milestone</DialogTitle>
          <DialogDescription>
            {contractor?.name ?? "Contractor"} on{" "}
            {milestone?.name ?? "milestone"}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="min-h-[20rem]">
          <form
            className="grid gap-6 sm:grid-cols-2"
            id="assign-contractor-form"
            onSubmit={submitAssignment}
          >
            <Field>
              <FieldLabel htmlFor="assign-contractor-role">Role</FieldLabel>
              <Input
                id="assign-contractor-role"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    role: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="Masonry lead"
                value={form.role}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-submilestone">
                Submilestone
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="assign-contractor-submilestone"
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    submilestoneKey: event.currentTarget.value,
                  }));
                }}
                value={form.submilestoneKey}
              >
                <NativeSelectOption value="">
                  Milestone level
                </NativeSelectOption>
                {(activeMilestone?.submilestoneSnapshot ?? []).map(
                  (submilestone) => (
                    <NativeSelectOption
                      key={submilestone.key}
                      value={submilestone.key}
                    >
                      {submilestone.name}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-hours">
                Estimated hours
              </FieldLabel>
              <Input
                id="assign-contractor-hours"
                inputMode="decimal"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    estimatedHours: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="48"
                type="number"
                value={form.estimatedHours}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-cost">
                Estimated cost
              </FieldLabel>
              <Input
                id="assign-contractor-cost"
                inputMode="decimal"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    estimatedCost: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="4320.00"
                type="number"
                value={form.estimatedCost}
              />
            </Field>
            {error ? (
              <p
                className="text-destructive text-sm md:col-span-2"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!canAssign}
            form="assign-contractor-form"
            loading={pending}
            type="submit"
          >
            <UserPlus />
            Confirm assignment
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

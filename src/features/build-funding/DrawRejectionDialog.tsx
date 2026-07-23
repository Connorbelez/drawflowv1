import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});

export function DrawRejectionDialog({
  amountCents,
  buildLabel,
  disabled,
  loading,
  onReject,
  requestKey,
  requestLabel,
  triggerTestId,
}: {
  amountCents: number;
  buildLabel: string;
  disabled: boolean;
  loading: boolean;
  onReject: (reason: string) => Promise<boolean>;
  requestKey: string;
  requestLabel: string;
  triggerTestId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const normalizedReason = reason.trim();

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setReason("");
        }
      }}
      open={open}
    >
      <AlertDialogTrigger
        disabled={disabled}
        render={
          <Button
            className="text-destructive-text"
            data-testid={triggerTestId}
            size="sm"
            variant="outline"
          />
        }
      >
        Reject
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Reject {requestLabel} for {buildLabel}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The {CAD_FORMATTER.format(amountCents / 100)} request will return to
            the borrower with your reason. This does not discard its evidence or
            audit history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`reject-draw-reason-${requestKey}`}>
            Reason for rejection
          </FieldLabel>
          <Textarea
            aria-invalid={reason.length > 0 && !normalizedReason}
            id={`reject-draw-reason-${requestKey}`}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain what must be corrected before resubmission."
            value={reason}
          />
          <FieldDescription>
            Required. The borrower and operations team will see this reason.
          </FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <Button
            disabled={!normalizedReason}
            loading={loading}
            onClick={async () => {
              if (await onReject(normalizedReason)) {
                setOpen(false);
                setReason("");
              }
            }}
            variant="destructive"
          >
            Confirm rejection
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

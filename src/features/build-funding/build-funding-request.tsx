"use client";

import { Check, CircleDollarSign, Mail, Phone, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DrawRequestReceipt } from "./build-funding-contracts.ts";
import {
  centsToInput,
  createOperationId,
  drawRequestErrorMessage,
  formatCad,
  formatDateTime,
  parseCadToCents,
} from "./build-funding-contracts.ts";

export function DrawRequestComposer({
  availableCents,
  disabled,
  drawKey,
  onRequestDraw,
}: {
  availableCents: number;
  disabled: boolean;
  drawKey: string;
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"amount" | "review" | "receipt">("amount");
  const [amount, setAmount] = useState(centsToInput(availableCents));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<DrawRequestReceipt | null>(null);
  const operationId = useRef(createOperationId());
  const amountCents = parseCadToCents(amount);
  const valid = amountCents > 0 && amountCents <= availableCents;

  const reset = () => {
    setAmount(centsToInput(availableCents));
    setNote("");
    setError("");
    setReceipt(null);
    setStep("amount");
    operationId.current = createOperationId();
  };
  const submit = async () => {
    if (!(onRequestDraw && valid) || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await onRequestDraw({
        amountCents,
        clientOperationId: operationId.current,
        drawKey,
        note: note.trim() || undefined,
      });
      setReceipt(result);
      setStep("receipt");
    } catch (cause) {
      setError(drawRequestErrorMessage(cause, "submit"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger
        disabled={disabled || availableCents <= 0}
        render={<Button className="mt-3 w-full" size="lg" />}
      >
        <CircleDollarSign /> Request a draw
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "receipt" ? "Draw request submitted" : "Request a draw"}
          </DialogTitle>
          <DialogDescription>
            {step === "amount"
              ? `Choose any amount up to ${formatCad(availableCents)}.`
              : step === "review"
                ? "Review the amount before it is sent to Fairlend."
                : "Your available balance has been updated."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {step === "amount" ? (
            <div className="grid gap-4">
              <Field invalid={amount.length > 0 && !valid}>
                <FieldLabel>Amount (CAD)</FieldLabel>
                <Input
                  aria-label="Draw request amount in Canadian dollars"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  value={amount}
                />
                <FieldDescription>
                  Available now: {formatCad(availableCents)}
                </FieldDescription>
                <FieldError>
                  Enter an amount between $0.01 and {formatCad(availableCents)}.
                </FieldError>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => setAmount(centsToInput(availableCents))}
                  size="sm"
                  variant="outline"
                >
                  Request all
                </Button>
                <Button
                  className="min-h-11"
                  onClick={() =>
                    setAmount(centsToInput(Math.floor(availableCents / 2)))
                  }
                  size="sm"
                  variant="outline"
                >
                  Request half
                </Button>
              </div>
              <Field>
                <FieldLabel>Note (optional)</FieldLabel>
                <Textarea
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What work or cost is this request for?"
                  value={note}
                />
              </Field>
            </div>
          ) : null}
          {step === "review" ? (
            <div className="border-y py-5">
              <p className="text-muted-foreground text-xs">Amount requested</p>
              <p className="mt-1 font-heading font-semibold text-3xl tabular-nums">
                {formatCad(amountCents)}
              </p>
              <p className="mt-4 text-muted-foreground text-xs">
                Available after submission
              </p>
              <p className="mt-1 font-medium text-sm tabular-nums">
                {formatCad(availableCents - amountCents)}
              </p>
              {note ? <p className="mt-4 text-sm">{note}</p> : null}
            </div>
          ) : null}
          {step === "receipt" && receipt ? (
            <div aria-live="polite" className="border-y py-5" role="status">
              <div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success-foreground">
                <Check className="size-5" />
              </div>
              <p className="mt-4 font-medium">{receipt.displayId}</p>
              <p className="mt-1 font-heading font-semibold text-3xl tabular-nums">
                {formatCad(receipt.amountCents)}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                Submitted {formatDateTime(receipt.requestedAt)}. Fairlend will
                review this request.
              </p>
              <p className="mt-3 font-medium text-xs">
                Work order {receipt.workOrderKey}
              </p>
              <ul className="mt-1 grid gap-1 text-muted-foreground text-xs">
                {receipt.sourceAllocations.map((allocation) => (
                  <li
                    aria-label={`${allocation.milestoneName}, Draw Group ${allocation.drawGroupKey}, ${formatCad(allocation.amountCents)}`}
                    className="flex items-start justify-between gap-3"
                    key={`${allocation.drawGroupKey}:${allocation.milestoneKey}`}
                  >
                    <span>
                      {allocation.milestoneName} · Draw Group{" "}
                      {allocation.drawGroupKey}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCad(allocation.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p
              className="mt-3 text-destructive-foreground text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          {step === "amount" ? (
            <>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button disabled={!valid} onClick={() => setStep("review")}>
                Review request
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <Button onClick={() => setStep("amount")} variant="outline">
                Back
              </Button>
              <Button loading={pending} onClick={submit}>
                Submit request
              </Button>
            </>
          ) : null}
          {step === "receipt" ? (
            <DialogClose render={<Button />}>Done</DialogClose>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactAdminDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Mail /> Contact admin
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact Fairlend</DialogTitle>
          <DialogDescription>
            Ask for an update on a submitted draw request.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <Button
            render={
              <a
                aria-label="Email Fairlend about a draw request"
                href="mailto:elie@fairlend.ca?subject=Draw%20request%20update"
              >
                <Mail /> elie@fairlend.ca
              </a>
            }
            variant="outline"
          />
          <Button
            render={
              <a
                aria-label="Call Fairlend about a draw request"
                href="tel:+16478317605"
              >
                <Phone /> 647-831-7605
              </a>
            }
            variant="outline"
          />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawRequestDialog({
  onWithdraw,
}: {
  onWithdraw: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError("");
        }
      }}
      open={open}
    >
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        <RotateCcw /> Withdraw
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw this draw request?</AlertDialogTitle>
          <AlertDialogDescription>
            The reserved amount returns to Available now. You can submit a new
            request later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-6 text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Keep request
          </AlertDialogClose>
          <Button
            loading={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await onWithdraw();
                setOpen(false);
                toast.success(
                  "Draw request withdrawn. The amount is available again."
                );
              } catch (cause) {
                setError(drawRequestErrorMessage(cause, "withdraw"));
              } finally {
                setPending(false);
              }
            }}
            variant="destructive"
          >
            Withdraw request
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

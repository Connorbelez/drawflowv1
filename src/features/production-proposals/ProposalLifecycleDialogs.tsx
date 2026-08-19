import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export interface ClosingConfirmationInput {
  buildStartDate: string;
  ianaTimezone: string;
  interestAnnualBps: number;
  principalCents: number;
  reason: string;
}

interface ProposalLifecycleDialogSummary {
  buildName: string;
  interestAnnualBps?: number;
  principalCents?: number;
}

export function ProposalClosingDialog({
  error,
  onConfirm,
  onOpenChange,
  open,
  pending,
  proposal,
}: {
  error?: string;
  onConfirm: (input: ClosingConfirmationInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  proposal: ProposalLifecycleDialogSummary | null;
}) {
  const [buildStartDate, setBuildStartDate] = useState("");
  const [ianaTimezone, setIanaTimezone] = useState("");
  const [interestAnnualPercent, setInterestAnnualPercent] = useState("");
  const [principalDollars, setPrincipalDollars] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setBuildStartDate("");
      setIanaTimezone("");
      setInterestAnnualPercent(
        proposal?.interestAnnualBps === undefined
          ? ""
          : String(proposal.interestAnnualBps / 100)
      );
      setPrincipalDollars(
        proposal?.principalCents === undefined
          ? ""
          : String(proposal.principalCents / 100)
      );
      setReason("");
    }
  }, [open, proposal?.interestAnnualBps, proposal?.principalCents]);

  const canSubmit =
    buildStartDate.trim().length > 0 &&
    ianaTimezone.trim().length > 0 &&
    interestAnnualPercent.trim().length > 0 &&
    Number.isFinite(Number(interestAnnualPercent)) &&
    Number(interestAnnualPercent) >= 0 &&
    principalDollars.trim().length > 0 &&
    Number.isFinite(Number(principalDollars)) &&
    Number(principalDollars) >= 0 &&
    reason.trim().length > 0 &&
    !pending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              onConfirm({
                buildStartDate: buildStartDate.trim(),
                ianaTimezone: ianaTimezone.trim(),
                interestAnnualBps: Math.round(
                  Number(interestAnnualPercent) * 100
                ),
                principalCents: Math.round(Number(principalDollars) * 100),
                reason: reason.trim(),
              });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-balance">
              Record loan closing
            </DialogTitle>
            <DialogDescription className="text-pretty">
              Record the offline closing terms. Build activation remains a
              separate action.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-4">
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {proposal?.buildName ?? "Approved proposal"}
                </p>
                <p className="text-muted-foreground">
                  {proposal?.principalCents === undefined
                    ? "Principal not yet entered"
                    : `Principal: ${formatCurrency(proposal.principalCents)}`}
                  {" · "}Interest starts on funds released
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className="grid gap-2 text-sm"
                  htmlFor="closing-principal"
                >
                  <span className="font-medium">Loan principal (USD)</span>
                  <Input
                    id="closing-principal"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      setPrincipalDollars(event.target.value)
                    }
                    required
                    step="0.01"
                    type="number"
                    value={principalDollars}
                  />
                </label>
                <label
                  className="grid gap-2 text-sm"
                  htmlFor="closing-interest-rate"
                >
                  <span className="font-medium">Annual interest rate (%)</span>
                  <Input
                    id="closing-interest-rate"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      setInterestAnnualPercent(event.target.value)
                    }
                    required
                    step="0.01"
                    type="number"
                    value={interestAnnualPercent}
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm" htmlFor="build-start-date">
                <span className="font-medium">Build start date</span>
                <Input
                  id="build-start-date"
                  onChange={(event) => setBuildStartDate(event.target.value)}
                  required
                  type="date"
                  value={buildStartDate}
                />
              </label>
              <label className="grid gap-2 text-sm" htmlFor="closing-timezone">
                <span className="font-medium">Build timezone (IANA)</span>
                <Input
                  id="closing-timezone"
                  onChange={(event) => setIanaTimezone(event.target.value)}
                  required
                  value={ianaTimezone}
                />
              </label>
              <label className="grid gap-2 text-sm" htmlFor="closing-reason">
                <span className="font-medium">Audit reason</span>
                <Textarea
                  id="closing-reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Confirm the offline loan closing and any closing notes."
                  required
                  value={reason}
                />
              </label>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? <Loader2 className="animate-spin" /> : null}
              Confirm closing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProposalActivationDialog({
  buildName,
  error,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  buildName: string;
  error?: string;
  onConfirm: (reason: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const canSubmit = reason.trim().length > 0 && !pending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              onConfirm(reason.trim());
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-balance">Activate Build</DialogTitle>
            <DialogDescription className="text-pretty">
              Create the live Build for {buildName}. This copies the closed
              proposal plan into the execution workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm" htmlFor="activation-reason">
                <span className="font-medium">Audit reason</span>
                <Textarea
                  id="activation-reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why the closed proposal is ready for live execution."
                  required
                  value={reason}
                />
              </label>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? <Loader2 className="animate-spin" /> : null}
              Activate Build
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

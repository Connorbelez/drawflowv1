import { UserRoundCog } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export interface BrokerAssignmentOption {
  email?: string | null;
  isPrincipal: boolean;
  name?: string | null;
  workosUserId: string;
}

export interface BrokerAssignmentBrokerage {
  brokerageId: string;
  brokerageName: string;
  brokers: BrokerAssignmentOption[];
}

export interface BrokerAssignmentTarget {
  _id: string;
  brokerAssignment?: {
    assignedBrokerWorkosUserId?: string;
    broker?: { email?: string | null; name?: string | null } | null;
  } | null;
  brokerage?: { _id?: string } | null;
  displayName: string;
}

export interface BrokerAssignmentInput {
  assignedBrokerWorkosUserId: string;
  builderProfileIds: string[];
  reason: string;
}

export function BrokerAssignmentDialog({
  brokerages,
  brokerOptionsPending,
  description,
  onAssign,
  onAssigned,
  onOpenChange,
  open,
  reasonHelpText,
  reasonPlaceholder,
  targetLabel = "Builder",
  targets,
}: {
  brokerages: BrokerAssignmentBrokerage[];
  brokerOptionsPending: boolean;
  description?: string;
  onAssign: (input: BrokerAssignmentInput) => Promise<unknown> | unknown;
  onAssigned: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reasonHelpText?: string;
  reasonPlaceholder?: string;
  targetLabel?: string;
  targets: BrokerAssignmentTarget[];
}): ReactElement {
  const [selectedBrokerWorkosUserId, setSelectedBrokerWorkosUserId] =
    useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brokerageIds = [
    ...new Set(targets.map((target) => target.brokerage?._id).filter(Boolean)),
  ];
  const brokerage =
    brokerageIds.length === 1
      ? brokerages.find((option) => option.brokerageId === brokerageIds[0])
      : undefined;
  const mixedBrokerages = targets.length > 0 && brokerageIds.length !== 1;
  const brokers = brokerage?.brokers ?? [];
  const brokerIds = brokers.map((broker) => broker.workosUserId);
  const selectedBroker = brokers.find(
    (broker) => broker.workosUserId === selectedBrokerWorkosUserId
  );
  const trimmedReason = reason.trim();

  useEffect(() => {
    if (!open) {
      return;
    }
    const currentBrokerIds = [
      ...new Set(
        targets
          .map(
            (target) =>
              target.brokerAssignment?.assignedBrokerWorkosUserId ?? null
          )
          .filter((value): value is string => Boolean(value))
      ),
    ];
    setSelectedBrokerWorkosUserId(
      currentBrokerIds.length === 1 ? currentBrokerIds[0] : ""
    );
    setReason("");
    setError(null);
  }, [open, targets]);

  const title =
    targets.length === 1
      ? `Assign broker to ${targets[0]?.displayName ?? targetLabel}`
      : `Assign broker to ${targets.length} ${targetLabel}s`;
  const invalid =
    mixedBrokerages ||
    !brokerage ||
    !selectedBroker ||
    trimmedReason.length < 10 ||
    saving;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              "Choose an eligible broker and record why this assignment is being made. Existing active assignments are transferred, not deleted."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="max-h-40 divide-y overflow-y-auto border-y">
            {targets.slice(0, 6).map((target) => (
              <div
                className="flex items-center justify-between gap-4 py-2 text-sm"
                key={target._id}
              >
                <span className="truncate font-medium">
                  {target.displayName}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {target.brokerAssignment?.broker?.name ??
                    target.brokerAssignment?.broker?.email ??
                    "Unassigned"}
                </span>
              </div>
            ))}
            {targets.length > 6 ? (
              <p className="py-2 text-muted-foreground text-xs">
                {targets.length - 6} more selected
              </p>
            ) : null}
          </div>

          {mixedBrokerages ? (
            <p className="text-destructive text-sm" role="alert">
              Batch assignment requires {targetLabel}s from one brokerage.
              Refine the selection and try again.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Brokerage: {brokerage?.brokerageName ?? "Unavailable"}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="builder-broker-assignment">Broker</Label>
            <Select
              disabled={mixedBrokerages || brokerOptionsPending || !brokerage}
              items={brokerIds}
              onValueChange={(value) =>
                setSelectedBrokerWorkosUserId(value ?? "")
              }
              value={selectedBrokerWorkosUserId}
            >
              <SelectTrigger id="builder-broker-assignment">
                <SelectValue>
                  {(value) =>
                    brokers.find((broker) => broker.workosUserId === value)
                      ?.name ??
                    brokers.find((broker) => broker.workosUserId === value)
                      ?.email ??
                    (brokerOptionsPending
                      ? "Loading brokers..."
                      : "Select broker")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {brokers.map((broker) => (
                  <SelectItem
                    key={broker.workosUserId}
                    onClick={() =>
                      setSelectedBrokerWorkosUserId(broker.workosUserId)
                    }
                    value={broker.workosUserId}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {broker.name ?? broker.email ?? broker.workosUserId}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {broker.email ?? broker.workosUserId}
                        {broker.isPrincipal ? " · Principal broker" : ""}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!brokerOptionsPending && brokerage && brokers.length === 0 ? (
              <p className="text-destructive text-xs" role="alert">
                No active eligible brokers are available for this brokerage.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="builder-broker-reason">Audit reason</Label>
            <Textarea
              id="builder-broker-reason"
              minLength={10}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                reasonPlaceholder ??
                `Explain why this broker should own these ${targetLabel} relationships.`
              }
              rows={3}
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              {reasonHelpText ??
                `Required. This reason is written to every affected ${targetLabel}'s audit history.`}
            </p>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose
            disabled={saving}
            render={
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            }
          />
          <Button
            disabled={invalid}
            onClick={async () => {
              if (!selectedBroker) {
                return;
              }
              setSaving(true);
              setError(null);
              try {
                await onAssign({
                  assignedBrokerWorkosUserId: selectedBroker.workosUserId,
                  builderProfileIds: targets.map((target) => target._id),
                  reason: trimmedReason,
                });
                onAssigned();
              } catch (assignmentError) {
                setError(
                  assignmentError instanceof Error
                    ? assignmentError.message
                    : "Broker assignment failed. Try again."
                );
              } finally {
                setSaving(false);
              }
            }}
            type="button"
          >
            <UserRoundCog />
            {saving
              ? "Assigning..."
              : `Assign ${targets.length === 1 ? targetLabel : `${targets.length} ${targetLabel}s`}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

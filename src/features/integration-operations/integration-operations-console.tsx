"use client";

import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const integrationApi = api.production_proposals;

type EndpointStatus = "active" | "disabled" | "draft" | "revoked";
type DeliveryStatus = "delivered" | "failed" | "pending" | "retry_pending";

interface IntegrationEndpoint {
  _id: Id<"integrationEndpoints">;
  activatedAt?: number;
  createdAt: number;
  disabledAt?: number;
  endpointUrl: string;
  eventTypes: string[];
  name: string;
  payloadVersion: string;
  revokedAt?: number;
  secretFingerprint: string;
  secretVersion: number;
  status: EndpointStatus;
  updatedAt: number;
  validatedAt?: number;
}

interface IntegrationAttempt {
  _id: Id<"integrationDeliveryAttempts">;
  attemptedAt: number;
  attemptNumber: number;
  completedAt?: number;
  deliveryId: string;
  endpointId: Id<"integrationEndpoints">;
  endpointName: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  nextRetryAt?: number;
  payloadVersion: string;
  responseCode?: number;
  retryOfAttemptId?: Id<"integrationDeliveryAttempts">;
  safeError?: string;
  status: DeliveryStatus;
  updatedAt: number;
}

interface IntegrationOperationsProjection {
  attempts: IntegrationAttempt[];
  endpoints: IntegrationEndpoint[];
}

type PendingAction =
  | `activate:${string}`
  | `create`
  | `disable:${string}`
  | `retry:${string}`
  | `revoke:${string}`
  | `rotate:${string}`
  | `validate:${string}`
  | null;

export function IntegrationOperationsConsole({
  workosOrganizationId,
}: {
  workosOrganizationId: string;
}) {
  const operations = useQuery(integrationApi.getIntegrationOperations, {
    workosOrganizationId,
  }) as IntegrationOperationsProjection | undefined;
  const createEndpoint = useMutation(integrationApi.createIntegrationEndpoint);
  useMutation(integrationApi.updateIntegrationEndpointConfiguration);
  const validateEndpoint = useMutation(
    integrationApi.validateIntegrationEndpoint
  );
  const activateEndpoint = useMutation(
    integrationApi.activateIntegrationEndpoint
  );
  const disableEndpoint = useMutation(
    integrationApi.disableIntegrationEndpoint
  );
  const rotateSecret = useMutation(
    integrationApi.rotateIntegrationEndpointSecret
  );
  const revokeEndpoint = useMutation(integrationApi.revokeIntegrationEndpoint);
  const retryAttempt = useMutation(
    integrationApi.retryIntegrationDeliveryAttempt
  );

  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [eventSubscriptions, setEventSubscriptions] = useState("");
  const [payloadVersion, setPayloadVersion] = useState("2026-07-01");
  const [configurationReason, setConfigurationReason] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const parsedEventTypes = useMemo(
    () =>
      [
        ...new Set(eventSubscriptions.split(",").map((value) => value.trim())),
      ].filter(Boolean),
    [eventSubscriptions]
  );
  const canCreate =
    name.trim().length > 0 &&
    endpointUrl.trim().length > 0 &&
    parsedEventTypes.length > 0 &&
    payloadVersion.trim().length > 0 &&
    configurationReason.trim().length >= 8;

  async function runAction(
    action: Exclude<PendingAction, null>,
    operation: () => Promise<unknown>,
    successMessage: string
  ) {
    setPendingAction(action);
    setLiveMessage("");
    try {
      await operation();
      setLiveMessage(successMessage);
      toast.success(successMessage);
    } catch {
      const message =
        "The integration action could not be completed. Review the endpoint state and try again.";
      setLiveMessage(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCreate() {
    if (!canCreate) {
      return;
    }
    setPendingAction("create");
    setLiveMessage("");
    try {
      const result = (await createEndpoint({
        endpointUrl: endpointUrl.trim(),
        eventTypes: parsedEventTypes,
        name: name.trim(),
        payloadVersion: payloadVersion.trim(),
        reason: configurationReason.trim(),
        workosOrganizationId,
      })) as { signingSecret: string };
      setOneTimeSecret(result.signingSecret);
      setName("");
      setEndpointUrl("");
      setEventSubscriptions("");
      setConfigurationReason("");
      setLiveMessage(
        "Endpoint created. Copy the signing secret now; it is shown once."
      );
    } catch {
      setLiveMessage(
        "The endpoint could not be created. Check the HTTPS URL and required fields."
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function copySecret() {
    if (!oneTimeSecret) {
      return;
    }
    await navigator.clipboard?.writeText(oneTimeSecret);
    setLiveMessage(
      "Signing secret copied. Store it in your approved secret manager."
    );
  }

  const endpoints = operations?.endpoints ?? [];
  const attempts = operations?.attempts ?? [];

  return (
    <section
      aria-labelledby="integration-operations-title"
      className="grid gap-5"
    >
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="mb-3 w-fit" variant="outline">
            Technical administration
          </Badge>
          <h1
            className="font-semibold text-3xl tracking-normal sm:text-4xl"
            id="integration-operations-title"
          >
            Integration operations
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
            Configure tenant webhooks, rotate signing credentials, and recover
            failed deliveries without changing the original domain transaction.
          </p>
        </div>
        <Badge className="w-fit" variant="secondary">
          <ShieldCheck aria-hidden="true" className="size-3.5" /> Admin only
        </Badge>
      </header>

      <p aria-live="polite" className="sr-only" role="status">
        {liveMessage}
      </p>

      {oneTimeSecret ? (
        <div
          className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/8 p-4"
          role="status"
        >
          <div className="flex items-start gap-3">
            <KeyRound
              aria-hidden="true"
              className="mt-0.5 size-5 text-amber-700 dark:text-amber-300"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Signing secret — shown once</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Copy this value into your approved secret manager. DrawFlow will
                not display it again.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-background px-3 py-2 text-sm">
              {oneTimeSecret}
            </code>
            <Button onClick={copySecret} type="button" variant="outline">
              <Copy aria-hidden="true" /> Copy secret
            </Button>
            <Button
              onClick={() => setOneTimeSecret(null)}
              type="button"
              variant="ghost"
            >
              I stored it
            </Button>
          </div>
        </div>
      ) : null}

      <Frame>
        <FramePanel className="grid gap-5 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold text-lg">Create endpoint</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              New endpoints remain in draft until an admin validates and
              activates them.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field id="integration-endpoint-name" label="Endpoint name">
              <Input
                id="integration-endpoint-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Accounting webhook"
                value={name}
              />
            </Field>
            <Field id="integration-endpoint-url" label="Endpoint URL">
              <Input
                id="integration-endpoint-url"
                inputMode="url"
                onChange={(event) => setEndpointUrl(event.target.value)}
                placeholder="https://hooks.example.com/drawflow"
                value={endpointUrl}
              />
            </Field>
            <Field
              id="integration-event-subscriptions"
              label="Event subscriptions"
            >
              <Input
                aria-describedby="integration-events-help"
                id="integration-event-subscriptions"
                onChange={(event) => setEventSubscriptions(event.target.value)}
                placeholder="draw.released, milestone.approved"
                value={eventSubscriptions}
              />
              <p
                className="text-muted-foreground text-xs"
                id="integration-events-help"
              >
                Enter comma-separated event names.
              </p>
            </Field>
            <Field id="integration-payload-version" label="Payload version">
              <Input
                id="integration-payload-version"
                onChange={(event) => setPayloadVersion(event.target.value)}
                value={payloadVersion}
              />
            </Field>
            <div className="lg:col-span-2">
              <Field
                id="integration-configuration-reason"
                label="Configuration reason"
              >
                <Textarea
                  id="integration-configuration-reason"
                  onChange={(event) =>
                    setConfigurationReason(event.target.value)
                  }
                  placeholder="Why is this endpoint being created?"
                  value={configurationReason}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!canCreate || pendingAction !== null}
              onClick={handleCreate}
            >
              {pendingAction === "create" ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <PlugZap aria-hidden="true" />
              )}
              Create endpoint
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold text-xl">Endpoints</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Validation, activation, rotation, disablement, and revocation are
            audited with the supplied reason.
          </p>
        </div>
        {operations === undefined ? (
          <LoadingState label="Loading integration endpoints" />
        ) : endpoints.length === 0 ? (
          <EmptyState
            body="Create the first tenant endpoint to begin delivery validation."
            title="No endpoints configured"
          />
        ) : (
          <div className="grid gap-3">
            {endpoints.map(
              // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Lifecycle controls intentionally render from explicit endpoint state.
              (endpoint) => {
                const reason = reasons[endpoint._id] ?? "";
                const canAct =
                  reason.trim().length >= 8 && pendingAction === null;
                return (
                  <Frame key={endpoint._id}>
                    <FramePanel className="grid gap-4 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base">
                              {endpoint.name}
                            </h3>
                            <StatusBadge status={endpoint.status} />
                            {endpoint.validatedAt ? (
                              <Badge variant="outline">
                                <CheckCircle2
                                  aria-hidden="true"
                                  className="size-3"
                                />{" "}
                                Validated
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <CircleAlert
                                  aria-hidden="true"
                                  className="size-3"
                                />{" "}
                                Validation required
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 break-all font-mono text-muted-foreground text-xs">
                            {endpoint.endpointUrl}
                          </p>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm lg:text-right">
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Payload
                            </dt>
                            <dd>{endpoint.payloadVersion}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Signing key
                            </dt>
                            <dd>
                              v{endpoint.secretVersion}{" "}
                              {endpoint.secretFingerprint}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {endpoint.eventTypes.map((eventType) => (
                          <Badge key={eventType} variant="secondary">
                            {eventType}
                          </Badge>
                        ))}
                      </div>
                      {endpoint.status === "revoked" ? null : (
                        <div className="grid gap-3 border-t pt-4">
                          <Field
                            id={`integration-reason-${endpoint._id}`}
                            label={`Reason for ${endpoint.name}`}
                          >
                            <Input
                              id={`integration-reason-${endpoint._id}`}
                              onChange={(event) =>
                                setReasons((current) => ({
                                  ...current,
                                  [endpoint._id]: event.target.value,
                                }))
                              }
                              placeholder="Required for audited changes"
                              value={reason}
                            />
                          </Field>
                          <div className="flex flex-wrap gap-2">
                            {endpoint.validatedAt ? null : (
                              <ActionButton
                                disabled={!canAct}
                                icon={<ShieldCheck aria-hidden="true" />}
                                label={`Validate ${endpoint.name}`}
                                onClick={() =>
                                  runAction(
                                    `validate:${endpoint._id}`,
                                    () =>
                                      validateEndpoint({
                                        endpointId: endpoint._id,
                                        reason: reason.trim(),
                                        workosOrganizationId,
                                      }),
                                    `${endpoint.name} validated.`
                                  )
                                }
                              />
                            )}
                            {(endpoint.status === "draft" ||
                              endpoint.status === "disabled") &&
                            endpoint.validatedAt ? (
                              <ActionButton
                                disabled={!canAct}
                                icon={<PlugZap aria-hidden="true" />}
                                label={`Activate ${endpoint.name}`}
                                onClick={() =>
                                  runAction(
                                    `activate:${endpoint._id}`,
                                    () =>
                                      activateEndpoint({
                                        endpointId: endpoint._id,
                                        reason: reason.trim(),
                                        workosOrganizationId,
                                      }),
                                    `${endpoint.name} activated.`
                                  )
                                }
                              />
                            ) : null}
                            {endpoint.status === "active" ? (
                              <ActionButton
                                disabled={!canAct}
                                icon={<Unplug aria-hidden="true" />}
                                label={`Disable ${endpoint.name}`}
                                onClick={() =>
                                  runAction(
                                    `disable:${endpoint._id}`,
                                    () =>
                                      disableEndpoint({
                                        endpointId: endpoint._id,
                                        reason: reason.trim(),
                                        workosOrganizationId,
                                      }),
                                    `${endpoint.name} disabled.`
                                  )
                                }
                              />
                            ) : null}
                            <ActionButton
                              disabled={!canAct}
                              icon={<RefreshCw aria-hidden="true" />}
                              label={`Rotate ${endpoint.name} secret`}
                              onClick={async () => {
                                setPendingAction(`rotate:${endpoint._id}`);
                                setLiveMessage("");
                                try {
                                  const result = (await rotateSecret({
                                    endpointId: endpoint._id,
                                    reason: reason.trim(),
                                    workosOrganizationId,
                                  })) as { signingSecret: string };
                                  setOneTimeSecret(result.signingSecret);
                                  setLiveMessage(
                                    `${endpoint.name} signing secret rotated and shown once.`
                                  );
                                } catch {
                                  setLiveMessage(
                                    "The signing secret could not be rotated. Review the endpoint state and try again."
                                  );
                                } finally {
                                  setPendingAction(null);
                                }
                              }}
                              variant="outline"
                            />
                            <ActionButton
                              disabled={!canAct}
                              icon={<Unplug aria-hidden="true" />}
                              label={`Revoke ${endpoint.name}`}
                              onClick={() =>
                                runAction(
                                  `revoke:${endpoint._id}`,
                                  () =>
                                    revokeEndpoint({
                                      endpointId: endpoint._id,
                                      reason: reason.trim(),
                                      workosOrganizationId,
                                    }),
                                  `${endpoint.name} revoked.`
                                )
                              }
                              variant="destructive"
                            />
                          </div>
                        </div>
                      )}
                    </FramePanel>
                  </Frame>
                );
              }
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold text-xl">Delivery attempts</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Attempt history is immutable. Retrying creates a new delivery record
            linked to the failed attempt.
          </p>
        </div>
        {operations === undefined ? (
          <LoadingState label="Loading delivery attempts" />
        ) : attempts.length === 0 ? (
          <EmptyState
            body="Delivery history will appear after an active endpoint receives an event."
            title="No delivery attempts"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event / delivery</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Recovery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => {
                  const reason = reasons[attempt.endpointId] ?? "";
                  const canRetry =
                    attempt.status === "failed" &&
                    reason.trim().length >= 8 &&
                    pendingAction === null;
                  return (
                    <TableRow key={attempt._id}>
                      <TableCell>
                        <DeliveryStatusBadge status={attempt.status} />
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1 text-xs">
                          <span className="font-medium text-sm">
                            {attempt.eventType}
                          </span>
                          <span className="font-mono">{attempt.eventId}</span>
                          <span className="font-mono text-muted-foreground">
                            {attempt.deliveryId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1">
                          <span className="font-medium">
                            {attempt.endpointName}
                          </span>
                          <span className="max-w-56 truncate text-muted-foreground text-xs">
                            {attempt.endpointUrl}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Payload {attempt.payloadVersion}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1 text-sm">
                          <span>#{attempt.attemptNumber}</span>
                          <time
                            dateTime={new Date(
                              attempt.attemptedAt
                            ).toISOString()}
                          >
                            {formatDateTime(attempt.attemptedAt)}
                          </time>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid max-w-72 gap-1 text-sm">
                          {attempt.responseCode ? (
                            <span>HTTP {attempt.responseCode}</span>
                          ) : null}
                          {attempt.safeError ? (
                            <span className="text-muted-foreground">
                              {attempt.safeError}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {attempt.status === "failed" ? (
                          <Button
                            aria-label={`Retry delivery ${attempt.deliveryId}`}
                            disabled={!canRetry}
                            onClick={() =>
                              runAction(
                                `retry:${attempt._id}`,
                                () =>
                                  retryAttempt({
                                    attemptId: attempt._id,
                                    reason: reason.trim(),
                                    workosOrganizationId,
                                  }),
                                `${attempt.deliveryId} retry scheduled.`
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            <RotateCcw aria-hidden="true" /> Retry
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            No action
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
  variant = "default",
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "default" | "destructive" | "outline";
}) {
  return (
    <Button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant={variant}
    >
      {icon}
      {label.split(" ")[0]}
    </Button>
  );
}

function StatusBadge({ status }: { status: EndpointStatus }) {
  return (
    <Badge
      className={cn(
        status === "active" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
      variant={status === "revoked" ? "destructive" : "outline"}
    >
      {status}
    </Badge>
  );
}

function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge
      className={cn(
        status === "delivered" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "retry_pending" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      )}
      variant={status === "failed" ? "destructive" : "outline"}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center gap-2 rounded-lg border text-muted-foreground text-sm">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {label}
    </div>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-lg border border-dashed p-6 text-center">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">{body}</p>
      </div>
    </div>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

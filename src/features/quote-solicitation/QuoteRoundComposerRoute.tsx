"use client";

import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeft,
  FilePlus2,
  Layers3,
  PackageCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import {
  QuoteRoundComposer,
  type QuoteRoundComposerData,
  type QuoteRoundDetail,
  type QuoteRoundDraftInput,
  type QuoteRoundMode,
} from "./QuoteRoundComposer.tsx";

type QuoteRoundComposerProjection = NonNullable<
  FunctionReturnType<typeof api.quote_rounds.getQuoteRoundComposer>
>;
type QuoteRoundComposerRecipient =
  QuoteRoundComposerProjection["eligibleRecipients"][number];
type QuoteRoundProjection = FunctionReturnType<
  typeof api.quote_rounds.getQuoteRound
>;

function asDateTimeValue(value: number | undefined) {
  return value === undefined ? undefined : new Date(value).toISOString();
}

/**
 * The composer deliberately has a smaller display model than its Convex
 * projection, but this is a typed, one-way normalization of the generated
 * query result. No untyped transport boundary is retained here.
 */
export function normalizeQuoteRoundComposerData(
  source: QuoteRoundComposerProjection
): QuoteRoundComposerData {
  return {
    build: {
      _id: source.build._id,
      buildName: source.build.buildName,
      location: source.build.location,
      locationLatitude: source.build.locationLatitude,
      locationLongitude: source.build.locationLongitude,
      startDate: source.build.startDate,
    },
    compatibleRecipients: source.eligibleRecipients.map((candidate) => ({
      capabilities: candidate.quoteRecipientCapabilities,
      contractorProfileId: candidate._id,
      displayName: candidate.name,
      email: candidate.email,
      provisioningState: candidate.quoteRecipientProvisioningState,
      recipientKey: candidate._id,
    })),
    labourSubmilestones: source.labourSubmilestones.map((item) => ({
      _id: item._id,
      budgetCents: item.budgetCents,
      buildMilestoneId: item.buildMilestoneId,
      durationDays: item.durationDays,
      milestoneKey: item.milestoneKey,
      milestoneName: item.milestoneName,
      name: item.name,
      order: item.order,
      scopeOfWorkTiptapJson: item.scopeOfWorkTiptapJson,
      startDay: item.startDay,
      submilestoneKey: item.submilestoneKey,
    })),
    materialCostItems: source.materialCostItems.map((item) => ({
      _id: item._id,
      deliveryEndDay: item.deliveryEndDay,
      deliveryInstructions: item.deliveryInstructions,
      deliveryLocation: item.deliveryLocation,
      deliveryStartDay: item.deliveryStartDay,
      description: item.description,
      milestoneKey: item.milestoneKey,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      specificationTiptapJson: item.specificationTiptapJson,
      title: item.title,
      unit: item.unit,
    })),
    permit: source.permit
      ? {
          fileName: source.permit.fileName,
          mimeType: source.permit.mimeType,
          version: source.permit.version,
        }
      : null,
    responseTemplates: source.responseTemplates.map((template) => ({
      audience: template.audience,
      description: template.description,
      fields: template.fields.map((field) => ({
        fieldKey: field.fieldKey,
        kind: field.kind,
        label: field.label,
        required: field.required,
        richTextDefaultHtml: field.richTextDefaultHtml,
        scope: field.scope,
      })),
      name: template.name,
      templateId: template.templateId,
      version: template.version,
      versionId: template._id,
    })),
  };
}

export function normalizeQuoteRoundDetail(
  source: QuoteRoundProjection
): QuoteRoundDetail | undefined {
  if (!source) {
    return;
  }
  return {
    draft: source.draft
      ? {
          labourSubmilestoneIds: source.draft.labourSubmilestoneIds,
          materialRows: source.draft.materialRows.map((row) => ({
            assignedSubmilestoneIds: row.assignedSubmilestoneIds,
            deliveryEndDay: row.deliveryEndDay,
            deliveryInstructions: row.deliveryInstructions,
            deliveryLocation: row.deliveryLocation,
            deliveryStartDay: row.deliveryStartDay,
            description: row.description,
            quantity: row.quantity,
            rowKey: row.rowKey,
            source: row.source,
            sourceBuildCostItemId: row.sourceBuildCostItemId,
            specificationTiptapJson: row.specificationTiptapJson,
            title: row.title,
            unit: row.unit,
          })),
          recipients: source.draft.recipientProfileIds.map(
            (contractorProfileId) => ({
              contractorProfileId,
              recipientKey: contractorProfileId,
            })
          ),
          responseDeadline: asDateTimeValue(source.draft.responseDeadline),
          revision: source.revision,
          templateVersionId: source.draft.templateVersionId,
          title: source.title,
        }
      : null,
    mode:
      source.mode === "material"
        ? "materials"
        : source.mode === "combined"
          ? "mixed"
          : "labour",
    packageRevision: source.packageRevision
      ? { number: source.packageRevision.revision }
      : null,
    quoteRoundId: source._id,
    state: source.state,
    title: source.title,
  };
}

function backendMode(
  mode: QuoteRoundMode
): FunctionArgs<typeof api.quote_rounds.createQuoteRoundDraft>["mode"] {
  if (mode === "labour") {
    return "labour";
  }
  return mode === "materials" ? "material" : "combined";
}

function requireKnownGeneratedId<IdType extends string>(
  candidates: Iterable<IdType>,
  value: string,
  label: string
) {
  for (const candidate of candidates) {
    if (candidate === value) {
      return candidate;
    }
  }
  throw new Error(`${label} is unavailable for this Quote Round.`);
}

export function toUpdateQuoteRoundDraftArgs(input: {
  draft: QuoteRoundDraftInput & { expectedRevision: number };
  organizationId: string;
  quoteRoundId: NonNullable<QuoteRoundProjection>["_id"];
  source: QuoteRoundComposerProjection;
}): FunctionArgs<typeof api.quote_rounds.updateQuoteRoundDraft> {
  const materialRows: NonNullable<
    FunctionArgs<typeof api.quote_rounds.updateQuoteRoundDraft>["materialRows"]
  > = input.draft.materialRows.map((row) => {
    const assignmentIds = row.assignedSubmilestoneIds.map((id) =>
      requireKnownGeneratedId(
        input.source.labourSubmilestones.map((item) => item._id),
        id,
        "Material assignment"
      )
    );
    if (row.source === "build_cost_item") {
      if (!row.sourceBuildCostItemId) {
        throw new Error(
          "A Build Cost Item row cannot be saved without its canonical source ID."
        );
      }
      return {
        assignedSubmilestoneIds: assignmentIds,
        rowKey: row.rowKey,
        source: "build_cost_item",
        sourceBuildCostItemId: requireKnownGeneratedId(
          input.source.materialCostItems.map((item) => item._id),
          row.sourceBuildCostItemId,
          "Build Cost Item source"
        ),
      };
    }
    return {
      assignedSubmilestoneIds: assignmentIds,
      deliveryEndDay: row.deliveryEndDay,
      deliveryInstructions: row.deliveryInstructions,
      deliveryLocation: row.deliveryLocation,
      deliveryStartDay: row.deliveryStartDay,
      description: row.description,
      quantity: row.quantity,
      rowKey: row.rowKey,
      source: "ad_hoc",
      specificationTiptapJson: row.specificationTiptapJson,
      title: row.title,
      unit: row.unit,
    };
  });
  return {
    buildId: input.source.build._id,
    expectedRevision: input.draft.expectedRevision,
    labourSubmilestoneIds: input.draft.labourSubmilestoneIds.map((id) =>
      requireKnownGeneratedId(
        input.source.labourSubmilestones.map((item) => item._id),
        id,
        "Labour Sub-milestone"
      )
    ),
    materialRows,
    quoteRoundId: input.quoteRoundId,
    recipientProfileIds: input.draft.recipients.map((recipient) =>
      requireKnownGeneratedId(
        input.source.eligibleRecipients.map((candidate) => candidate._id),
        recipient.contractorProfileId,
        "Quote recipient"
      )
    ),
    responseDeadline: input.draft.responseDeadline
      ? new Date(input.draft.responseDeadline).getTime()
      : null,
    templateVersionId: input.draft.templateVersionId
      ? requireKnownGeneratedId(
          input.source.responseTemplates.map((template) => template._id),
          input.draft.templateVersionId,
          "Quote Response Template"
        )
      : null,
    title: input.draft.title,
    workosOrganizationId: input.organizationId,
  };
}

function modeTitle(mode: QuoteRoundMode) {
  return mode === "labour"
    ? "New Labour Quote Round"
    : mode === "materials"
      ? "New Material Quote Round"
      : "New Combined Quote Round";
}

function QuoteRoundStart({
  creating,
  onCreate,
  onExit,
}: {
  creating: boolean;
  onCreate: (mode: QuoteRoundMode) => void;
  onExit: () => void;
}) {
  const choices: Array<{
    description: string;
    icon: typeof Layers3;
    mode: QuoteRoundMode;
    title: string;
  }> = [
    {
      description:
        "Price individual construction sub-milestones with contractor-capable recipients.",
      icon: Layers3,
      mode: "labour",
      title: "Labour Quote Round",
    },
    {
      description:
        "Price material lines and their assigned delivery context with supplier-capable recipients.",
      icon: PackageCheck,
      mode: "materials",
      title: "Material Quote Round",
    },
    {
      description:
        "Publish one controlled package containing labour and material pricing lines.",
      icon: FilePlus2,
      mode: "mixed",
      title: "Combined Quote Round",
    },
  ];
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <Button onClick={onExit} variant="ghost">
          <ArrowLeft />
          Build Quotes
        </Button>
        <Frame>
          <FrameHeader>
            <FrameTitle>Start a Quote Round</FrameTitle>
            <FrameDescription>
              Choose the package mode first. It fixes the capability admission
              contract before this auditable draft is created.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="grid gap-3 p-3 md:grid-cols-3">
            {choices.map((choice) => {
              const Icon = choice.icon;
              return (
                <Card
                  key={choice.mode}
                  render={
                    <button
                      aria-label={`Create ${choice.title}`}
                      className="min-h-44 text-left"
                      disabled={creating}
                      onClick={() => onCreate(choice.mode)}
                      type="button"
                    />
                  }
                >
                  <CardHeader className="p-4">
                    <span className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="text-base">{choice.title}</CardTitle>
                    <CardDescription>{choice.description}</CardDescription>
                  </CardHeader>
                  <CardPanel className="mt-auto p-4 pt-0">
                    <Badge variant="outline">5-step publisher flow</Badge>
                  </CardPanel>
                </Card>
              );
            })}
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

function QuoteRoundRouteState({
  kind,
  onExit,
  onRetry,
}: {
  kind: "loading" | "missing";
  onExit: () => void;
  onRetry: () => void;
}) {
  if (kind === "loading") {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <Frame>
          <FramePanel className="p-4 text-sm">
            Loading Quote Round composer…
          </FramePanel>
        </Frame>
      </main>
    );
  }
  return (
    <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>Quote Round unavailable</FrameTitle>
          <FrameDescription>
            The draft may not exist, or you no longer have admission to this
            Build.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap gap-2 p-4">
          <Button onClick={onRetry}>
            <AlertTriangle />
            Retry
          </Button>
          <Button onClick={onExit} variant="outline">
            Build Quotes
          </Button>
        </FramePanel>
      </Frame>
    </main>
  );
}

interface QuoteRoundComposerRouteProps {
  buildId: string;
  organizationId?: string;
  roundId?: string;
  routeBase: "/builder" | "/builder-staff";
}

export function normalizeQuoteRoundOrganizationId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * A retry remounts the query boundary so a failed or stale Convex
 * subscription receives a fresh server result instead of merely repainting the
 * prior result.
 */
export function QuoteRoundComposerRoute(props: QuoteRoundComposerRouteProps) {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  return (
    <QuoteRoundComposerRouteQuery
      {...props}
      key={refreshGeneration}
      onRefresh={() => setRefreshGeneration((value) => value + 1)}
    />
  );
}

function QuoteRoundComposerRouteQuery({
  buildId,
  organizationId,
  onRefresh,
  routeBase,
  roundId,
}: QuoteRoundComposerRouteProps & { onRefresh: () => void }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [provisionedRecipients, setProvisionedRecipients] = useState<
    QuoteRoundComposerRecipient[]
  >([]);
  const normalizedOrganizationId =
    normalizeQuoteRoundOrganizationId(organizationId);
  const composerQuery = useQuery(
    api.quote_rounds.getQuoteRoundComposer,
    normalizedOrganizationId
      ? {
          buildId,
          workosOrganizationId: normalizedOrganizationId,
        }
      : "skip"
  );
  const rawRoundQuery = useQuery(
    api.quote_rounds.getQuoteRound,
    normalizedOrganizationId && roundId
      ? {
          buildId,
          quoteRoundId: roundId,
          workosOrganizationId: normalizedOrganizationId,
        }
      : "skip"
  );
  const createDraft = useMutation(api.quote_rounds.createQuoteRoundDraft);
  const ensureQuoteRoundRecipient = useMutation(
    api.quote_invitation_access.ensureQuoteRoundRecipient
  );
  const updateDraft = useMutation(api.quote_rounds.updateQuoteRoundDraft);
  const publishDraft = useMutation(api.quote_rounds.publishQuoteRoundDraft);
  const composerSource = useMemo(() => {
    if (!composerQuery) {
      return;
    }
    const recipientById = new Map<string, QuoteRoundComposerRecipient>(
      composerQuery.eligibleRecipients.map((recipient) => [
        String(recipient._id),
        recipient,
      ])
    );
    for (const recipient of provisionedRecipients) {
      recipientById.set(String(recipient._id), recipient);
    }
    return {
      ...composerQuery,
      eligibleRecipients: [...recipientById.values()],
    };
  }, [composerQuery, provisionedRecipients]);
  const data = useMemo(
    () =>
      composerSource
        ? normalizeQuoteRoundComposerData(composerSource)
        : undefined,
    [composerSource]
  );
  const round = useMemo(
    () =>
      rawRoundQuery === undefined
        ? undefined
        : normalizeQuoteRoundDetail(rawRoundQuery),
    [rawRoundQuery]
  );
  const exit = () => {
    if (routeBase === "/builder") {
      return navigate({
        params: { buildId },
        search: { tab: "quotes" },
        to: "/builder/builds/$buildId",
      });
    }
    return navigate({
      params: { buildId },
      search: { tab: "quotes" },
      to: "/builder-staff/builds/$buildId",
    });
  };

  const create = async (mode: QuoteRoundMode) => {
    setCreating(true);
    setCreateError(undefined);
    try {
      if (!(composerQuery && normalizedOrganizationId)) {
        throw new Error("Quote Round composer is unavailable.");
      }
      const createInput: FunctionArgs<
        typeof api.quote_rounds.createQuoteRoundDraft
      > = {
        buildId: composerQuery.build._id,
        mode: backendMode(mode),
        title: modeTitle(mode),
        workosOrganizationId: normalizedOrganizationId,
      };
      const result = await createDraft(createInput);
      if (routeBase === "/builder") {
        navigate({
          params: { buildId },
          replace: true,
          search: { roundId: String(result.quoteRoundId) },
          to: "/builder/builds/$buildId/quotes/new",
        });
      } else {
        navigate({
          params: { buildId },
          replace: true,
          search: { roundId: String(result.quoteRoundId) },
          to: "/builder-staff/builds/$buildId/quotes/new",
        });
      }
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "We could not create this Quote Round draft."
      );
    } finally {
      setCreating(false);
    }
  };

  const createColdRecipient = async (input: {
    displayName?: string;
    email: string;
  }) => {
    if (!(composerQuery && rawRoundQuery && normalizedOrganizationId)) {
      throw new Error("Quote Round recipient provisioning is unavailable.");
    }
    const result = await ensureQuoteRoundRecipient({
      buildId: composerQuery.build._id,
      displayName: input.displayName,
      email: input.email,
      quoteRoundId: rawRoundQuery._id,
      workosOrganizationId: normalizedOrganizationId,
    });
    const recipient: QuoteRoundComposerRecipient = {
      _id: result.profileId,
      email: result.email,
      name: result.name,
      quoteRecipientCapabilities: result.capabilities,
      quoteRecipientProvisioningState: result.provisioningState,
    };
    setProvisionedRecipients((current) => [
      ...current.filter((item) => item._id !== recipient._id),
      recipient,
    ]);
    return {
      capabilities: result.capabilities,
      contractorProfileId: String(result.profileId),
      displayName: result.name,
      email: result.email,
      provisioningState: result.provisioningState,
      recipientKey: String(result.profileId),
    };
  };

  if (!normalizedOrganizationId) {
    return (
      <QuoteRoundRouteState kind="missing" onExit={exit} onRetry={onRefresh} />
    );
  }
  if (composerQuery === undefined) {
    return (
      <QuoteRoundRouteState kind="loading" onExit={exit} onRetry={onRefresh} />
    );
  }
  if (!(composerQuery && data)) {
    return (
      <QuoteRoundRouteState kind="missing" onExit={exit} onRetry={onRefresh} />
    );
  }
  if (!roundId) {
    return (
      <>
        {createError ? (
          <div className="mx-auto max-w-4xl px-3 pt-3">
            <Alert variant="error">
              <AlertTriangle />
              <AlertTitle>Could not create a Quote Round</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <QuoteRoundStart creating={creating} onCreate={create} onExit={exit} />
      </>
    );
  }
  if (rawRoundQuery === undefined) {
    return (
      <QuoteRoundRouteState kind="loading" onExit={exit} onRetry={onRefresh} />
    );
  }
  if (!(rawRoundQuery && round)) {
    return (
      <QuoteRoundRouteState kind="missing" onExit={exit} onRetry={onRefresh} />
    );
  }
  if (round.state !== "draft") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-5">
        <div className="mx-auto max-w-3xl">
          <Frame>
            <FrameHeader>
              <FrameTitle>{round.title}</FrameTitle>
              <FrameDescription>
                This Quote Round is {round.state}; its package revision is
                immutable.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="space-y-3 p-4">
              <Badge variant="success">{round.state}</Badge>
              <p className="text-muted-foreground text-sm">
                {round.packageRevision
                  ? `Package revision ${round.packageRevision.number ?? 1} is preserved with its active invitation snapshot.`
                  : "This Quote Round has no editable draft."}
              </p>
              <Button onClick={exit}>
                <ArrowLeft />
                Build Quotes
              </Button>
            </FramePanel>
          </Frame>
        </div>
      </main>
    );
  }
  return (
    <QuoteRoundComposer
      actions={{
        onCreateColdRecipient: createColdRecipient,
        onExit: exit,
        onPublish: ({ expectedRevision, idempotencyKey }) => {
          const publishInput: FunctionArgs<
            typeof api.quote_rounds.publishQuoteRoundDraft
          > = {
            buildId: composerQuery.build._id,
            expectedRevision,
            idempotencyKey,
            quoteRoundId: rawRoundQuery._id,
            workosOrganizationId: normalizedOrganizationId,
          };
          return publishDraft(publishInput);
        },
        onRefresh,
        onSave: (
          draftInput: QuoteRoundDraftInput & {
            expectedRevision: number;
          }
        ) =>
          updateDraft(
            toUpdateQuoteRoundDraftArgs({
              draft: draftInput,
              organizationId: normalizedOrganizationId,
              quoteRoundId: rawRoundQuery._id,
              source: composerSource ?? composerQuery,
            })
          ),
      }}
      data={data}
      round={round}
    />
  );
}

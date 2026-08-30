"use client";

import { useMutation, useQuery } from "convex/react";
import { RefreshCw, XCircle } from "lucide-react";
import type { ErrorInfo, ReactNode } from "react";
import { Component, useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  QuoteRoundListProjection,
  QuoteRoundRegisterRow,
  QuoteRoundsQueryProps,
  QuoteRoundsRegisterContext,
  QuoteRoundsSurfaceProps,
} from "./QuoteRoundsSurfaceContracts.ts";
import { QuoteRoundsRegister } from "./QuoteRoundsSurfaceRegister.tsx";

export type {
  QuoteRoundListProjection,
  QuoteRoundRegisterMode,
  QuoteRoundRegisterRow,
  QuoteRoundRegisterSort,
  QuoteRoundsSurfaceProps,
} from "./QuoteRoundsSurfaceContracts.ts";

export function QuoteRoundsSurface(props: QuoteRoundsSurfaceProps) {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [cachedSnapshot, setCachedSnapshot] = useState<{
    identity: string;
    value: QuoteRoundListProjection;
  }>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const deleteDraft = useMutation(api.quote_rounds.deleteQuoteRoundDraft);
  const cacheIdentity = `${props.organizationId}\u0000${props.buildId}`;
  const cachedList =
    cachedSnapshot?.identity === cacheIdentity
      ? cachedSnapshot.value
      : undefined;
  const onData = useCallback(
    (value: QuoteRoundListProjection) => {
      setCachedSnapshot({ identity: cacheIdentity, value });
    },
    [cacheIdentity]
  );
  const onRetry = () => setRefreshGeneration((value) => value + 1);
  const onDeleteDraft = async (row: QuoteRoundRegisterRow) => {
    setDeleteError(undefined);
    setDeletingId(row._id);
    try {
      await deleteDraft({
        buildId: props.buildId as Id<"activeBuilds">,
        expectedRevision: row.revision,
        quoteRoundId: row._id,
        workosOrganizationId: props.organizationId,
      });
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "The draft Quote Request could not be deleted."
      );
      throw cause;
    } finally {
      setDeletingId(undefined);
    }
  };
  const registerContext = {
    ...props,
    deleteError,
    deletingId,
    onDeleteDraft,
    onDeleteErrorReset: () => setDeleteError(undefined),
  };

  return (
    <QuoteRoundsErrorBoundary
      cachedList={cachedList}
      key={`${cacheIdentity}:${refreshGeneration}`}
      onRetry={onRetry}
      registerContext={registerContext}
    >
      <QuoteRoundsQuery
        {...registerContext}
        cachedList={cachedList}
        onData={onData}
        onRetry={onRetry}
      />
    </QuoteRoundsErrorBoundary>
  );
}

function QuoteRoundsQuery({
  buildId,
  cachedList,
  deleteError,
  deletingId,
  onCreate,
  onData,
  onDeleteDraft,
  onDeleteErrorReset,
  onOpen,
  onRetry,
  organizationId,
  readOnly = false,
  readOnlyLabel = "Read-only",
}: QuoteRoundsQueryProps) {
  const quoteRoundList = useQuery(api.quote_rounds.listQuoteRounds, {
    buildId: buildId as Id<"activeBuilds">,
    workosOrganizationId: organizationId,
  });

  useEffect(() => {
    if (quoteRoundList) {
      onData(quoteRoundList);
    }
  }, [onData, quoteRoundList]);

  if (quoteRoundList === undefined && !cachedList) {
    return <QuoteRoundsLoading onRetry={onRetry} />;
  }

  return (
    <QuoteRoundsRegister
      buildId={buildId}
      cached={quoteRoundList === undefined}
      deleteError={deleteError}
      deletingId={deletingId}
      list={quoteRoundList ?? cachedList ?? { rounds: [] }}
      onCreate={onCreate}
      onDeleteDraft={onDeleteDraft}
      onDeleteErrorReset={onDeleteErrorReset}
      onOpen={onOpen}
      onRetry={onRetry}
      organizationId={organizationId}
      readOnly={readOnly}
      readOnlyLabel={readOnlyLabel}
    />
  );
}

interface QuoteRoundsErrorBoundaryProps {
  cachedList?: QuoteRoundListProjection;
  children: ReactNode;
  onRetry: () => void;
  registerContext: QuoteRoundsRegisterContext;
}

class QuoteRoundsErrorBoundary extends Component<
  QuoteRoundsErrorBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The surrounding Build workspace remains usable. The retry action below
    // remounts the Convex subscription without mutating Quote Round state.
  }

  render() {
    if (this.state.error) {
      if (this.props.cachedList) {
        return (
          <QuoteRoundsRegister
            cached
            hardError
            list={this.props.cachedList}
            onRetry={this.props.onRetry}
            {...this.props.registerContext}
          />
        );
      }
      return <QuoteRoundsErrorState onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}

function QuoteRoundsLoading({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame data-testid="quote-rounds-loading">
      <FramePanel className="animate-pulse space-y-3 p-5">
        <div className="h-5 w-48 rounded bg-muted" />
        <div className="h-3 w-80 max-w-full rounded bg-muted/70" />
        <div className="h-12 rounded bg-muted/60" />
        <div className="h-12 rounded bg-muted/60" />
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Loading quote register…</span>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw /> Refresh
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function QuoteRoundsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame data-testid="quote-rounds-error">
      <FramePanel className="grid min-h-64 place-items-center p-6 text-center">
        <div>
          <XCircle className="mx-auto size-7 text-destructive" />
          <h2 className="mt-3 font-semibold">Quote register unavailable</h2>
          <p className="mt-1 max-w-md text-muted-foreground text-sm">
            The Build remains available, but its Quote Round register could not
            be loaded.
          </p>
          <Button className="mt-4" onClick={onRetry} variant="outline">
            <RefreshCw /> Retry
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

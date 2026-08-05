import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Send,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import type {
  QuoteRoundComposerActions,
  QuoteRoundPublishReceipt,
  QuoteRoundStep,
} from "./QuoteRoundComposer.tsx";
import { quoteRoundStageLabel } from "./QuoteRoundComposerChrome.tsx";

function QuoteRoundStageError({
  actions,
  error,
  onRetry,
  stale,
}: {
  actions: QuoteRoundComposerActions;
  error?: string;
  onRetry: () => Promise<void>;
  stale: boolean;
}) {
  if (!error) {
    return null;
  }
  return (
    <Alert variant={stale ? "warning" : "error"}>
      <AlertTriangle />
      <AlertTitle>
        {stale ? "This draft changed elsewhere" : "Quote Round needs attention"}
      </AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <AlertAction>
        {stale && actions.onRefresh ? (
          <Button onClick={actions.onRefresh} size="sm" variant="outline">
            <RefreshCw />
            Refresh draft
          </Button>
        ) : null}
        <Button onClick={onRetry} size="sm" variant="outline">
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function QuoteRoundStageContent({
  actions,
  body,
  error,
  notice,
  onContinue,
  onPrevious,
  onRetry,
  pending,
  publish,
  published,
  stage,
  stageDescription,
  stageIndex,
  stale,
}: {
  actions: QuoteRoundComposerActions;
  body: ReactNode;
  error?: string;
  notice?: string;
  onContinue: () => Promise<void>;
  onPrevious: () => void;
  onRetry: () => Promise<void>;
  pending: "publish" | "save" | null;
  publish: () => Promise<void>;
  published?: QuoteRoundPublishReceipt;
  stage: QuoteRoundStep;
  stageDescription: string;
  stageIndex: number;
  stale: boolean;
}) {
  const isDispatch = stage === "dispatch";
  return (
    <Frame>
      <FrameHeader className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <FrameTitle className="text-base">
            {quoteRoundStageLabel(stageIndex)}
          </FrameTitle>
          <Badge variant="outline">Step {stageIndex + 1} of 5</Badge>
        </div>
        <FrameDescription>{stageDescription}</FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-4 p-4 sm:p-5">
        {notice ? (
          <p aria-live="polite" className="text-success-foreground text-xs">
            {notice}
          </p>
        ) : null}
        <QuoteRoundStageError
          actions={actions}
          error={error}
          onRetry={onRetry}
          stale={stale}
        />
        {body}
        {published ? (
          <Alert data-testid="quote-publish-receipt" variant="success">
            <CheckCircle2 />
            <AlertTitle>Quote Round open</AlertTitle>
            <AlertDescription>
              Package revision {published.packageRevisionNumber} opened with{" "}
              {published.invitationCount} active invitation
              {published.invitationCount === 1 ? "" : "s"}.
            </AlertDescription>
          </Alert>
        ) : null}
      </FramePanel>
      <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5">
        <Button
          disabled={stageIndex === 0 || pending !== null}
          onClick={onPrevious}
          variant="outline"
        >
          <ArrowLeft />
          Back
        </Button>
        {isDispatch ? (
          <Button
            disabled={Boolean(published)}
            loading={pending === "publish" || pending === "save"}
            onClick={publish}
          >
            <Send />
            {published ? "Published" : "Publish Quote Round"}
          </Button>
        ) : (
          <Button loading={pending === "save"} onClick={onContinue}>
            Continue
            <ArrowRight />
          </Button>
        )}
      </div>
    </Frame>
  );
}

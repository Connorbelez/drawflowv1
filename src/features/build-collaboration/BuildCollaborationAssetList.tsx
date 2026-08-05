"use client";

import { Paperclip, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useBuildCollaborationReadMutation } from "./BuildCollaborationMutationGate.tsx";

export interface BuildCollaborationAssetSummary {
  assetId: Id<"buildCollaborationAssets">;
  contentHashSha256?: string;
  fileName: string;
  mimeType: string;
  scanMessage?: string;
  scanState?: "pending" | "clean" | "rejected" | "error";
  sizeBytes: number;
  state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
  version: number;
}

export function BuildCollaborationAssetList({
  assets = [],
  buildId,
  focusedAssetId,
  onRemove,
  onReplace,
  organizationId,
}: {
  assets?: BuildCollaborationAssetSummary[];
  buildId: Id<"activeBuilds">;
  focusedAssetId?: Id<"buildCollaborationAssets">;
  onRemove?: (asset: BuildCollaborationAssetSummary) => Promise<void>;
  onReplace?: (
    asset: BuildCollaborationAssetSummary,
    file: File
  ) => Promise<void>;
  organizationId: string;
}) {
  const authorizeDownload = useBuildCollaborationReadMutation(
    api.build_collaboration_assets.authorizeBuildCollaborationAssetDownload
  );
  if (assets.length === 0) {
    return null;
  }
  const open = async (asset: BuildCollaborationAssetSummary) => {
    try {
      const url = await authorizeDownload({
        assetId: asset.assetId,
        buildId,
        organizationId,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "This attachment is no longer available."
      );
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {assets.map((asset) => (
        <AssetCard
          asset={asset}
          focused={asset.assetId === focusedAssetId}
          key={asset.assetId}
          onOpen={open}
          onRemove={onRemove}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}

function AssetCard({
  asset,
  focused,
  onOpen,
  onRemove,
  onReplace,
}: {
  asset: BuildCollaborationAssetSummary;
  focused: boolean;
  onOpen: (asset: BuildCollaborationAssetSummary) => Promise<void>;
  onRemove?: (asset: BuildCollaborationAssetSummary) => Promise<void>;
  onReplace?: (
    asset: BuildCollaborationAssetSummary,
    file: File
  ) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [removing, setRemoving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  useEffect(() => {
    if (focused) {
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [focused]);
  const replace = async (file?: File) => {
    if (!(file && onReplace)) {
      return;
    }
    setReplacing(true);
    try {
      await onReplace(asset, file);
    } finally {
      setReplacing(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };
  const remove = async () => {
    if (!onRemove) {
      return;
    }
    setRemoving(true);
    try {
      await onRemove(asset);
    } finally {
      setRemoving(false);
    }
  };
  return (
    <Card
      className={focused ? "ring-2 ring-primary/50" : undefined}
      data-focused={focused || undefined}
      data-testid={`collaboration-asset-${asset.assetId}`}
      ref={cardRef}
      tabIndex={focused ? -1 : undefined}
    >
      <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Paperclip
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-primary"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{asset.fileName}</p>
            <p className="text-muted-foreground text-xs">
              {asset.mimeType} · {formatBytes(asset.sizeBytes)} · v
              {asset.version}
            </p>
            {asset.scanState ? (
              <p className="text-muted-foreground text-xs">
                Scan: {asset.scanState}
                {asset.contentHashSha256
                  ? ` · SHA-256 ${shortHash(asset.contentHashSha256)}`
                  : ""}
                {asset.scanMessage ? ` · ${asset.scanMessage}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {onReplace && asset.state === "available" ? (
            <>
              <input
                aria-label={`Choose a replacement for ${asset.fileName}`}
                className="sr-only"
                onChange={(event) => replace(event.target.files?.[0])}
                ref={inputRef}
                type="file"
              />
              <Button
                disabled={replacing}
                onClick={() => inputRef.current?.click()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                {replacing ? "Replacing…" : "Replace"}
              </Button>
            </>
          ) : null}
          {onRemove ? (
            <Button
              aria-label={`Remove ${asset.fileName}`}
              disabled={removing}
              onClick={remove}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          {asset.scanState === "clean" &&
          (asset.state === "available" || asset.state === "superseded") ? (
            <Button
              onClick={() => onOpen(asset)}
              size="sm"
              type="button"
              variant="outline"
            >
              Open
            </Button>
          ) : null}
        </div>
      </CardPanel>
    </Card>
  );
}

function shortHash(hash: string) {
  return hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash;
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

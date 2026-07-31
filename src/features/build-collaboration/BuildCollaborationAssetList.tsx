"use client";

import { useMutation } from "convex/react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface BuildCollaborationAssetSummary {
  assetId: Id<"buildCollaborationAssets">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
  version: number;
}

export function BuildCollaborationAssetList({
  assets = [],
  buildId,
  organizationId,
}: {
  assets?: BuildCollaborationAssetSummary[];
  buildId: Id<"activeBuilds">;
  organizationId: string;
}) {
  const authorizeDownload = useMutation(
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
        <Card key={asset.assetId}>
          <CardPanel className="flex items-center gap-3 p-3">
            <Paperclip aria-hidden="true" className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{asset.fileName}</p>
              <p className="text-muted-foreground text-xs">
                {asset.mimeType} · {formatBytes(asset.sizeBytes)} · v
                {asset.version}
              </p>
            </div>
            <Button
              onClick={() => open(asset)}
              size="sm"
              type="button"
              variant="outline"
            >
              Open
            </Button>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
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

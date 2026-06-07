"use client";

import { Download, ExternalLink, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "#/components/ui/drawer.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";

export interface BuildPermitViewerDocument {
  file?: File;
  fileName?: string;
  mimeType?: string;
  objectUrl?: string;
  storageId?: string;
  storageUrl?: string | null;
  url?: string | null;
}

export function firstPermitDocument<
  T extends {
    documentType?: string;
    file?: File;
    fileName?: string;
    kind?: string;
    mimeType?: string;
    name?: string;
    objectUrl?: string;
    storageId?: string;
    storageUrl?: string | null;
    url?: string | null;
  },
>(documents: T[] | null | undefined): BuildPermitViewerDocument | null {
  const permit = documents?.find(
    (document) =>
      document.documentType === "permit" ||
      document.kind === "permit" ||
      document.file?.type === "application/pdf"
  );

  if (!permit) {
    return null;
  }

  return {
    file: permit.file,
    fileName: permit.fileName ?? permit.name ?? permit.file?.name,
    mimeType: permit.mimeType ?? permit.file?.type,
    objectUrl: permit.objectUrl,
    storageId: permit.storageId,
    storageUrl: permit.storageUrl,
    url: permit.url,
  };
}

export function BuildPermitViewerDrawer({
  className,
  permit,
  size = "sm",
  triggerLabel = "View permit",
  triggerTestId = "build-permit-viewer-trigger",
}: {
  className?: string;
  permit: BuildPermitViewerDocument | null | undefined;
  size?: "default" | "sm" | "xs";
  triggerLabel?: string;
  triggerTestId?: string;
}) {
  const [generatedObjectUrl, setGeneratedObjectUrl] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!permit?.file || permit.objectUrl || permit.storageUrl || permit.url) {
      setGeneratedObjectUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(permit.file);
    setGeneratedObjectUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [permit?.file, permit?.objectUrl, permit?.storageUrl, permit?.url]);

  const sourceUrl =
    permit?.storageUrl ??
    permit?.url ??
    permit?.objectUrl ??
    generatedObjectUrl;
  const fileName = permit?.fileName ?? permit?.file?.name ?? "Build permit.pdf";
  const mimeType = permit?.mimeType ?? permit?.file?.type ?? "application/pdf";
  const isPdf = mimeType === "application/pdf" || fileName.endsWith(".pdf");
  const viewerUrl = useMemo(() => {
    if (!sourceUrl) {
      return "";
    }
    return isPdf ? `${sourceUrl}#toolbar=1&navpanes=1&scrollbar=1` : sourceUrl;
  }, [isPdf, sourceUrl]);

  if (!permit) {
    return null;
  }

  if (!sourceUrl) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className={cn("inline-flex", className)}>
              <Button disabled size={size} variant="outline">
                <FileText />
                {triggerLabel}
              </Button>
            </span>
          }
        />
        <TooltipContent>Permit stored, URL unavailable.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Drawer
      defaultSnapPoint={1}
      position="bottom"
      snapPoints={[0.72, 1]}
      snapToSequentialPoints
    >
      <DrawerTrigger
        className={className}
        data-testid={triggerTestId}
        render={<Button size={size} variant="outline" />}
      >
        <FileText />
        {triggerLabel}
      </DrawerTrigger>
      <DrawerPopup
        className="h-[min(96dvh,940px)] sm:h-[min(92dvh,940px)]"
        showBar
        showCloseButton
        variant="straight"
      >
        <DrawerHeader className="gap-3 border-border border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Build permit</Badge>
                <Badge variant={isPdf ? "success" : "warning"}>
                  {isPdf ? "PDF" : mimeType}
                </Badge>
              </div>
              <DrawerTitle className="truncate text-base sm:text-xl">
                {fileName}
              </DrawerTitle>
              <DrawerDescription>
                Review the uploaded permit package without leaving this
                workspace.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>
        <DrawerPanel
          className="flex min-h-0 flex-1 flex-col p-0"
          scrollable={false}
        >
          <iframe
            className="min-h-[68dvh] flex-1 border-0 bg-muted"
            data-testid="build-permit-pdf-frame"
            src={viewerUrl}
            title={`PDF viewer for ${fileName}`}
          />
        </DrawerPanel>
        <DrawerFooter className="gap-2 px-4 py-3 sm:px-6">
          <Button
            render={
              <a download={fileName} href={sourceUrl}>
                <Download />
                Download
              </a>
            }
            size="sm"
            variant="outline"
          />
          <Button
            render={
              <a href={sourceUrl} rel="noreferrer" target="_blank">
                <ExternalLink />
                Open in new tab
              </a>
            }
            size="sm"
          />
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}

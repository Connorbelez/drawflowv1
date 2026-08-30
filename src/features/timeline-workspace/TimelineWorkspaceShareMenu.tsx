import {
  Check,
  Copy,
  ExternalLink,
  LinkIcon,
  Loader2,
  Mail,
  QrCode,
  Share2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";

export interface ShareTimelineMenuProps {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}
export function ShareTimelineMenu({
  copied,
  error,
  loading,
  onCopy,
  onCreate,
  onOpenChange,
  open,
  shareUrl,
}: {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}) {
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent("Elm Street build draw roadmap");
  const xHref = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
    : undefined;
  const mailHref = shareUrl
    ? `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
        `Review this DrawFlow roadmap snapshot: ${shareUrl}`
      )}`
    : undefined;

  const handleNativeShare = async () => {
    if (!(canNativeShare && shareUrl)) {
      return;
    }

    await navigator.share({
      title: "Elm Street build draw roadmap",
      url: shareUrl,
    });
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            data-testid="timeline-share-button"
            loading={loading}
            onClick={onCreate}
            size="sm"
            variant="default"
          />
        }
      >
        <Share2 />
        Share
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100vh-1rem)] w-[380px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain"
        data-testid="timeline-share-menu"
        sideOffset={10}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="grid size-28 shrink-0 place-items-center rounded-lg border border-border bg-white p-2 shadow-xs sm:size-36">
            {shareUrl ? (
              <QRCodeSVG
                aria-label="Timeline share QR code"
                data-testid="timeline-share-qr"
                level="M"
                size={96}
                value={shareUrl}
              />
            ) : (
              <QrCode className="size-12 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-100">
              <LinkIcon className="size-3.5" />
              Snapshot link
            </div>
            <h2 className="mt-3 font-semibold text-lg leading-tight">
              Share this roadmap setup
            </h2>
            <p className="mt-1 hidden text-muted-foreground text-sm sm:block">
              Generates an editable fork with the same milestones, draws, range,
              selection, and display controls.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="timeline-share-link">Share URL</Label>
          <Input
            data-testid="timeline-share-url"
            id="timeline-share-link"
            readOnly
            value={shareUrl}
          />
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            disabled={!shareUrl}
            onClick={onCopy}
            size="sm"
            variant="outline"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            disabled={!(shareUrl && canNativeShare)}
            onClick={handleNativeShare}
            size="sm"
            variant="outline"
          >
            <Share2 />
            Native share
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a
                data-testid="timeline-share-x"
                href={xHref}
                rel="noreferrer"
                target="_blank"
              >
                Share on X
              </a>
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink />X
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a data-testid="timeline-share-email" href={mailHref ?? "#"}>
                Share by email
              </a>
            }
            size="sm"
            variant="outline"
          >
            <Mail />
            Email
          </Button>
        </div>

        <p
          className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid="timeline-share-disclaimer"
        >
          live collaboration session under construction
        </p>
        {loading && (
          <div className="mt-3 inline-flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Saving snapshot
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

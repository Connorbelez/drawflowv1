"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  createGoogleMapsEmbedUrl,
  createGoogleMapsOpenUrl,
} from "#/lib/google-maps.ts";
import { cn } from "#/lib/utils.ts";

export function InteractiveSiteMap({
  address,
  className,
  latitude,
  longitude,
}: {
  address: string;
  className?: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const usableAddress =
    address.trim() && address !== "Site address unavailable"
      ? address
      : undefined;
  const target = { address: usableAddress, latitude, longitude };
  const embedUrl = createGoogleMapsEmbedUrl(target);
  const openUrl = createGoogleMapsOpenUrl(target);

  if (!(embedUrl && openUrl)) {
    return (
      <Card className={cn("grid min-h-48 place-items-center p-5", className)}>
        <div className="max-w-xs text-center">
          <MapPin className="mx-auto size-7 text-warning" />
          <p className="mt-3 font-medium">Site map unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            This Build does not have a usable address or site coordinates.
            Continue the visit and record the location attempt for lender
            review.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <Card className="relative isolate overflow-hidden rounded-xl bg-muted">
        <iframe
          allowFullScreen
          className="h-56 w-full touch-auto border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={embedUrl}
          title={`Interactive map for ${address}`}
        />
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md border bg-background/92 px-2 py-1 font-medium text-foreground text-xs shadow-sm backdrop-blur">
          <MapPin className="size-3.5 text-primary" />
          Build site
        </div>
      </Card>
      <Button
        className="min-h-11 sm:min-h-9"
        render={
          <a href={openUrl} rel="noreferrer" target="_blank">
            <ExternalLink />
            Open in Maps
          </a>
        }
        variant="outline"
      />
    </div>
  );
}

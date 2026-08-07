import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";

export function BuildIdentityCell({
  buildName,
  href,
  imageUrl,
  latitude,
  location,
  longitude,
  metadata,
}: {
  buildName: string;
  href?: string;
  imageUrl?: string | null;
  latitude?: number;
  location?: string;
  longitude?: number;
  metadata?: ReactNode;
}) {
  const satelliteUrl = createGoogleSatelliteMapUrl({
    address: location,
    latitude,
    longitude,
    size: "160x120",
    zoom: 18,
  });
  const previewUrl = satelliteUrl ?? imageUrl ?? undefined;
  const title = href ? (
    <Link
      className="font-medium text-sm hover:text-primary"
      onClick={(event) => event.stopPropagation()}
      preload="intent"
      to={href}
      viewTransition
    >
      {buildName}
    </Link>
  ) : (
    <span className="font-medium text-sm">{buildName}</span>
  );

  return (
    <div className="flex min-w-52 items-center gap-2.5">
      <div className="relative grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        <span className="absolute inset-0 grid place-items-center">
          <Building2 className="size-4 text-muted-foreground" />
        </span>
        {previewUrl ? (
          <img
            alt={`${buildName} site preview`}
            className="relative size-full object-cover"
            decoding="async"
            height={44}
            loading="lazy"
            src={previewUrl}
            width={56}
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5">
        {title}
        {metadata ? <div className="min-w-0">{metadata}</div> : null}
      </div>
    </div>
  );
}

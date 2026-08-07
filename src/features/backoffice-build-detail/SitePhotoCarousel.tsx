"use client";

import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useState } from "react";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";
import { formatDate } from "./format";

const MAX_DISPLAY_SITE_PHOTOS = 24;

interface SitePhoto {
  caption: string;
  takenAt: string;
  url: string;
}

interface SitePhotoCarouselProps {
  buildName?: string;
  photos: SitePhoto[];
  siteAddress?: string;
  siteLatitude?: number | null;
  siteLongitude?: number | null;
}

type DisplaySitePhoto = SitePhoto & {
  satelliteUrl: string | null;
};

function buildSatellitePhotos({
  buildName,
  photos,
  siteAddress,
  siteLatitude,
  siteLongitude,
}: SitePhotoCarouselProps): DisplaySitePhoto[] {
  const address = siteAddress?.trim();
  const sourcePhotos =
    photos.length > 0
      ? photos
      : address
        ? [
            {
              caption: buildName
                ? `${buildName} satellite overview`
                : "Satellite overview",
              takenAt: "",
              url: `google-static:${address}`,
            },
          ]
        : [];

  return sourcePhotos.slice(0, MAX_DISPLAY_SITE_PHOTOS).map((photo, index) => ({
    ...photo,
    satelliteUrl: address
      ? createGoogleSatelliteMapUrl({
          address,
          latitude: siteLatitude,
          longitude: siteLongitude,
          markerLabel: String(index + 1),
          zoom: index === 0 ? 18 : 19,
        })
      : null,
  }));
}

export function SitePhotoCarousel({
  buildName,
  photos,
  siteAddress,
  siteLatitude,
  siteLongitude,
}: SitePhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const displayPhotos = buildSatellitePhotos({
    buildName,
    photos,
    siteAddress,
    siteLatitude,
    siteLongitude,
  });
  if (displayPhotos.length === 0) {
    return null;
  }
  const safeIndex = Math.min(activeIndex, displayPhotos.length - 1);
  const active = displayPhotos[safeIndex];
  return (
    <article
      className="flex h-full min-h-[18rem] min-w-0 flex-col gap-2"
      data-testid="build-detail-site-photos"
    >
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <h3 className="min-w-0 font-semibold text-sm">
          <span className="text-muted-foreground">Site photos · </span>
          {active.caption}
        </h3>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {safeIndex + 1}/{displayPhotos.length} · {formatDate(active.takenAt)}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        {active.satelliteUrl ? (
          <img
            alt={`${active.caption} satellite view`}
            className="h-full min-h-[200px] w-full rounded-lg border border-border object-cover sm:min-h-[220px]"
            decoding="async"
            height={360}
            src={active.satelliteUrl}
            width={640}
          />
        ) : (
          <div className="grid h-full min-h-[200px] place-items-center rounded-lg border border-border bg-muted text-center text-muted-foreground sm:min-h-[220px]">
            <div className="p-4">
              <MapPin
                aria-hidden
                className="mx-auto mb-2 size-7 text-primary"
              />
              <p className="font-medium text-sm">Satellite image unavailable</p>
              <p className="mt-1 text-xs">
                Missing site address or Google Maps API key.
              </p>
            </div>
          </div>
        )}
        {displayPhotos.length > 1 ? (
          <>
            <button
              aria-label="Previous photo"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full border border-border bg-background/70 p-1 text-foreground backdrop-blur transition hover:bg-background"
              data-testid="site-photos-prev"
              onClick={() =>
                setActiveIndex(
                  (safeIndex - 1 + displayPhotos.length) % displayPhotos.length
                )
              }
              type="button"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              aria-label="Next photo"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full border border-border bg-background/70 p-1 text-foreground backdrop-blur transition hover:bg-background"
              data-testid="site-photos-next"
              onClick={() =>
                setActiveIndex((safeIndex + 1) % displayPhotos.length)
              }
              type="button"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <ul
        aria-label="Site photo thumbnails"
        className="flex gap-1.5 overflow-x-auto"
        data-testid="site-photos-thumbs"
      >
        {displayPhotos.map((photo, idx) => {
          const isActive = idx === safeIndex;
          return (
            <li className="shrink-0" key={photo.url}>
              <button
                aria-current={isActive ? "true" : undefined}
                aria-label={`Show ${photo.caption}`}
                className={
                  isActive
                    ? "block h-12 w-20 overflow-hidden rounded-md border-2 border-primary outline-none"
                    : "block h-12 w-20 overflow-hidden rounded-md border border-border opacity-60 outline-none transition hover:opacity-100"
                }
                data-active={isActive}
                data-testid={`site-photos-thumb-${idx}`}
                onClick={() => setActiveIndex(idx)}
                title={photo.caption}
                type="button"
              >
                {photo.satelliteUrl ? (
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    decoding="async"
                    height={96}
                    loading="lazy"
                    src={photo.satelliteUrl}
                    width={160}
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
                    <MapPin aria-hidden className="size-4" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

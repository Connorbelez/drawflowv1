"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatDate } from "./format";

interface SitePhoto {
  url: string;
  caption: string;
  takenAt: string;
}

interface SitePhotoCarouselProps {
  photos: SitePhoto[];
}

// Pseudo-image renderer that derives a deterministic "photo" gradient from the
// mock URL so we can preview the carousel without persisting real imagery.
// REQ-06 only permits mock_satelliteImageUrl + mock_sitePhotos to carry the
// mock_ prefix; this component is the sole consumer of mock_sitePhotos.
function paintFromUrl(url: string): {
  background: string;
  hotspot: { top: string; left: string };
} {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return {
    background: `linear-gradient(135deg, oklch(0.35 0.04 ${h1}) 0%, oklch(0.55 0.06 ${h2}) 100%)`,
    hotspot: {
      top: `${30 + (Math.abs(hash >> 4) % 30)}%`,
      left: `${30 + (Math.abs(hash >> 8) % 30)}%`,
    },
  };
}

export function SitePhotoCarousel({ photos }: SitePhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  if (photos.length === 0) {
    return null;
  }
  const safeIndex = Math.min(activeIndex, photos.length - 1);
  const active = photos[safeIndex];
  const paint = paintFromUrl(active.url);
  return (
    <article
      className="flex h-full min-h-[18rem] flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="build-detail-site-photos"
    >
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <h3 className="min-w-0 font-semibold text-sm">
          <span className="text-muted-foreground">Site photos · </span>
          {active.caption}
        </h3>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {safeIndex + 1}/{photos.length} · {formatDate(active.takenAt)}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          aria-label={active.caption}
          className="relative h-full min-h-[200px] w-full overflow-hidden rounded-lg border border-border sm:min-h-[220px]"
          role="img"
          style={{ background: paint.background }}
        >
          <span
            aria-hidden="true"
            className="absolute"
            style={{
              top: paint.hotspot.top,
              left: paint.hotspot.left,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "var(--color-primary, oklch(0.768 0.233 130.85))",
              boxShadow:
                "0 0 0 6px color-mix(in oklch, var(--color-primary) 30%, transparent)",
            }}
          />
        </div>
        {photos.length > 1 ? (
          <>
            <button
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/70 p-1 text-foreground backdrop-blur transition hover:bg-background"
              data-testid="site-photos-prev"
              onClick={() =>
                setActiveIndex(
                  (safeIndex - 1 + photos.length) % photos.length,
                )
              }
              type="button"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/70 p-1 text-foreground backdrop-blur transition hover:bg-background"
              data-testid="site-photos-next"
              onClick={() => setActiveIndex((safeIndex + 1) % photos.length)}
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
        {photos.map((photo, idx) => {
          const isActive = idx === safeIndex;
          const thumbPaint = paintFromUrl(photo.url);
          return (
            <li key={photo.url} className="shrink-0">
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
                style={{ background: thumbPaint.background }}
                type="button"
                title={photo.caption}
              />
            </li>
          );
        })}
      </ul>
    </article>
  );
}

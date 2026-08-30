"use client";
import {
  MapPin,
} from "lucide-react";
import type * as React from "react";
import {
  lazy,
  useEffect,
  useMemo,
  useState,
} from "react";

import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
} from "./production-build-detail-contracts.ts";

export function BuildNonFinancialDetailsSheet({
  detail,
  onOpenChange,
  onSubmit,
  open,
}: {
  detail: ProductionBuildDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: NonNullable<
    ProductionBuildDetailActions["updateNonFinancialDetails"]
  >;
  open: boolean;
}) {
  const [buildName, setBuildName] = useState(detail.build.buildName);
  const [location, setLocation] = useState(detail.build.location);
  const [locationLatitude, setLocationLatitude] = useState<number | null>(
    detail.build.locationLatitude ?? null
  );
  const [locationLongitude, setLocationLongitude] = useState<number | null>(
    detail.build.locationLongitude ?? null
  );
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(
    detail.build.locationPlaceId ?? null
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(detail.build.startDate);
  const [ianaTimezone, setIanaTimezone] = useState(detail.build.timezone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationResolutionError, setLocationResolutionError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setBuildName(detail.build.buildName);
    setLocation(detail.build.location);
    setLocationLatitude(detail.build.locationLatitude ?? null);
    setLocationLongitude(detail.build.locationLongitude ?? null);
    setLocationPlaceId(detail.build.locationPlaceId ?? null);
    setReason("");
    setSaving(false);
    setStartDate(detail.build.startDate);
    setIanaTimezone(detail.build.timezone ?? "");
    setError(null);
    setLocationResolving(false);
    setLocationResolutionError(null);
  }, [detail, open]);

  const satelliteMapUrl = useMemo(
    () =>
      createGoogleSatelliteMapUrl({
        address: location,
        latitude: locationLatitude,
        longitude: locationLongitude,
        markerLabel: "B",
        size: "640x360",
        zoom: 19,
      }),
    [location, locationLatitude, locationLongitude]
  );

  const canSave =
    buildName.trim().length > 0 &&
    location.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim()) &&
    reason.trim().length > 0 &&
    !locationResolving &&
    !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      setError("Title, address, project start, and audit reason are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        buildName: buildName.trim(),
        ...(ianaTimezone.trim() ? { ianaTimezone: ianaTimezone.trim() } : {}),
        location: location.trim(),
        locationLatitude,
        locationLongitude,
        locationPlaceId,
        reason: reason.trim(),
        startDate: startDate.trim(),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save build details."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>Edit build details</SheetTitle>
          <SheetDescription>
            Update non-financial build identity and location metadata.
          </SheetDescription>
        </SheetHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <SheetPanel className="flex flex-col gap-5">
            <Field name="buildName">
              <FieldLabel>Build title</FieldLabel>
              <Input
                data-testid="build-details-title-input"
                onChange={(event) => setBuildName(event.currentTarget.value)}
                value={buildName}
              />
            </Field>
            <Field name="location">
              <FieldLabel>Address</FieldLabel>
              <GoogleAddressAutocomplete
                onChange={(nextLocation, meta) => {
                  setLocation(nextLocation);
                  if (meta?.source !== "selection") {
                    setLocationLatitude(null);
                    setLocationLongitude(null);
                    setLocationPlaceId(null);
                    setLocationResolutionError(null);
                  }
                }}
                onPlaceSelect={(_suggestion, details) => {
                  if (!details) {
                    setLocationResolutionError(
                      "Google did not return coordinates for that address."
                    );
                    return;
                  }
                  setLocation(details.formattedAddress);
                  setLocationLatitude(details.latitude);
                  setLocationLongitude(details.longitude);
                  setLocationPlaceId(details.placeId);
                  setLocationResolutionError(null);
                }}
                onResolvingChange={setLocationResolving}
                placeholder="Search build address"
                testId="build-details-address-input"
                value={location}
              />
              <FieldDescription>
                Selecting a Google result resolves the stored coordinates.
              </FieldDescription>
              {locationResolutionError ? (
                <p className="text-destructive-foreground text-xs">
                  {locationResolutionError}
                </p>
              ) : null}
            </Field>
            <Field name="startDate">
              <FieldLabel>Project start</FieldLabel>
              <Input
                data-testid="build-details-start-date-input"
                onChange={(event) => setStartDate(event.currentTarget.value)}
                type="date"
                value={startDate}
              />
            </Field>
            <Field name="ianaTimezone">
              <FieldLabel htmlFor="build-details-timezone-input">
                Build timezone (IANA)
              </FieldLabel>
              <Input
                data-testid="build-details-timezone-input"
                id="build-details-timezone-input"
                onChange={(event) => setIanaTimezone(event.currentTarget.value)}
                placeholder="America/Toronto"
                value={ianaTimezone}
              />
              <FieldDescription>
                Leave blank to preserve a legacy Build with unknown timezone;
                enter an explicit IANA timezone to repair it.
              </FieldDescription>
            </Field>
            <Frame>
              <FramePanel className="p-4">
                <h3 className="mb-3 font-semibold text-sm">
                  Location metadata
                </h3>
                <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
                  <Label>Latitude</Label>
                  <dd className="min-w-0 break-words tabular-nums">
                    {formatCoordinate(locationLatitude)}
                  </dd>
                  <Label>Longitude</Label>
                  <dd className="min-w-0 break-words tabular-nums">
                    {formatCoordinate(locationLongitude)}
                  </dd>
                  <Label>Place ID</Label>
                  <dd className="min-w-0 break-words text-muted-foreground text-xs">
                    {locationPlaceId ?? "Not resolved"}
                  </dd>
                </dl>
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel className="p-4">
                <h3 className="mb-3 font-semibold text-sm">
                  Satellite preview
                </h3>
                {satelliteMapUrl ? (
                  <img
                    alt="Selected build location satellite map"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                    data-testid="build-details-satellite-map"
                    height={360}
                    src={satelliteMapUrl}
                    width={640}
                  />
                ) : (
                  <div className="grid aspect-video w-full place-items-center rounded-lg border border-border bg-muted text-center text-muted-foreground">
                    <div className="p-4">
                      <MapPin
                        aria-hidden="true"
                        className="mx-auto mb-2 size-6 text-primary"
                      />
                      <p className="font-medium text-sm">
                        Satellite map unavailable
                      </p>
                      <p className="mt-1 text-xs">
                        Select a Google address or configure Maps.
                      </p>
                    </div>
                  </div>
                )}
              </FramePanel>
            </Frame>
            <Field name="reason">
              <FieldLabel>Audit reason</FieldLabel>
              <Textarea
                data-testid="build-details-reason-input"
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Why are these build details changing?"
                value={reason}
              />
            </Field>
            {error ? (
              <p className="text-destructive-foreground text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </SheetPanel>
          <SheetFooter>
            <SheetClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </SheetClose>
            <Button
              data-testid="build-details-save"
              disabled={!canSave}
              loading={saving}
              type="submit"
            >
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}

export function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(6) : "Not resolved";
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <dt className="pt-1 text-muted-foreground text-xs uppercase sm:pt-0">
      {children}
    </dt>
  );
}

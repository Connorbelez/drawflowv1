import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export const Route = createFileRoute("/contractor/profile")({
  staticData: {
    breadcrumb: { label: "Profile", to: "/contractor/profile" },
  },
  component: ContractorProfile,
});

/**
 * Contractor profile (PRD §8.8). Operational fields are directly editable;
 * identity-sensitive changes route to review (PRD §8.8 reviewable boundaries).
 * Rates are optional — missing means unknown, not zero (PRD §3.20).
 */
function ContractorProfile() {
  const data = useQuery(api.contractorWorkspace.getContractorProfile, {});
  const update = useMutation(
    api.contractorWorkspace.updateContractorOperationalProfile
  );
  const [saving, setSaving] = useState(false);
  const [trades, setTrades] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [servicePostalPrefixes, setServicePostalPrefixes] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [equipment, setEquipment] = useState("");
  const [availabilityWindows, setAvailabilityWindows] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");

  useEffect(() => {
    if (data === undefined) {
      return;
    }
    setTrades(data.operational.trades.join(", "));
    setWebsite(data.operational.website ?? "");
    setDescription(data.operational.description ?? "");
    setPhone(data.operational.phone ?? "");
    setServiceCity(data.operational.serviceArea.primaryCity ?? "");
    setServiceRadius(
      data.operational.serviceArea.radiusKm != null
        ? String(data.operational.serviceArea.radiusKm)
        : ""
    );
    setServicePostalPrefixes(
      data.operational.serviceArea.postalPrefixes.join(", ")
    );
    setServiceNotes(data.operational.serviceArea.notes ?? "");
    setCapabilities(formatCapabilities(data.operational.capabilities));
    setEquipment(formatEquipment(data.operational.equipment));
    setAvailabilityWindows(
      formatAvailabilityWindows(data.operational.availabilityWindows)
    );
    setComplianceNotes(data.operational.complianceNotes ?? "");
  }, [data]);

  const onSave = async () => {
    setSaving(true);
    try {
      await update({
        trades: trades
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        capabilities: parseCapabilities(capabilities),
        equipment: parseEquipment(equipment),
        availabilityWindows: parseAvailabilityWindows(availabilityWindows),
        website: website || undefined,
        description: description || undefined,
        phone: phone || undefined,
        serviceAreaPrimaryCity: serviceCity || undefined,
        serviceAreaRadiusKm: serviceRadius ? Number(serviceRadius) : undefined,
        serviceAreaPostalPrefixes: servicePostalPrefixes
          .split(",")
          .map((prefix) => prefix.trim().toUpperCase())
          .filter(Boolean),
        serviceAreaNotes: serviceNotes || undefined,
        complianceNotes: complianceNotes || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header>
          <h1 className="font-semibold text-2xl">Profile</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            Operational details builders and FairLend use to plan and assign work.
            Identity-sensitive changes (legal name, email, compliance docs) are
            routed for backoffice review.
          </p>
        </header>

        {data === undefined ? (
          <p className="text-muted-foreground text-sm">Loading profile…</p>
        ) : (
          <Frame>
            <FramePanel className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${data.readiness.completenessPercent}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {data.readiness.completenessPercent}%
                </span>
              </div>

              <Field label="Trades" value={trades} onChange={setTrades} placeholder="masonry, brick, flashing" />
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="416-555-0100" />
              <Field label="Website" value={website} onChange={setWebsite} placeholder="https://example.com" />
              <Field
                label="Description"
                value={description}
                onChange={setDescription}
                textarea
                placeholder="Brief summary of your work"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Service area city"
                  value={serviceCity}
                  onChange={setServiceCity}
                  placeholder="Toronto"
                />
                <Field
                  label="Service radius (km)"
                  value={serviceRadius}
                  onChange={setServiceRadius}
                  placeholder="50"
                />
              </div>
              <Field
                label="Postal prefixes"
                value={servicePostalPrefixes}
                onChange={setServicePostalPrefixes}
                placeholder="M4, M5, L4"
              />
              <Field
                label="Service area notes"
                value={serviceNotes}
                onChange={setServiceNotes}
                textarea
                placeholder="Coverage limits, travel windows, preferred regions"
              />
              <Field
                label="Capabilities"
                value={capabilities}
                onChange={setCapabilities}
                textarea
                placeholder="masonry | Masonry repair | masonry | Brick, block, flashing"
              />
              <Field
                label="Equipment"
                value={equipment}
                onChange={setEquipment}
                textarea
                placeholder="scaffold | Scaffold system | 1 | Crew-owned"
              />
              <Field
                label="Availability"
                value={availabilityWindows}
                onChange={setAvailabilityWindows}
                textarea
                placeholder="1 | 08:00 | 16:00 | America/Toronto"
              />
              <Field
                label="Compliance notes"
                value={complianceNotes}
                onChange={setComplianceNotes}
                textarea
                placeholder="WSIB status, license #, insurance"
              />

              <div className="flex justify-end">
                <Button onClick={onSave} disabled={saving} type="button">
                  {saving ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </FramePanel>
          </Frame>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </span>
      {textarea ? (
        <Textarea
          placeholder={placeholder}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function formatCapabilities(
  rows: Array<{
    capabilityKey: string;
    label: string;
    trade?: string | null;
    notes?: string | null;
  }>
): string {
  return rows
    .map((row) =>
      [row.capabilityKey, row.label, row.trade ?? "", row.notes ?? ""].join(" | ")
    )
    .join("\n");
}

function parseCapabilities(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, label, trade, notes] = line.split("|").map((part) => part.trim());
      return {
        capabilityKey: key || slugify(label),
        label: label || key,
        trade: trade || undefined,
        notes: notes || undefined,
      };
    })
    .filter((row) => row.capabilityKey && row.label);
}

function formatEquipment(
  rows: Array<{
    equipmentKey: string;
    name: string;
    quantity: number;
    notes?: string | null;
  }>
): string {
  return rows
    .map((row) =>
      [row.equipmentKey, row.name, String(row.quantity), row.notes ?? ""].join(
        " | "
      )
    )
    .join("\n");
}

function parseEquipment(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, name, quantity, notes] = line.split("|").map((part) => part.trim());
      return {
        equipmentKey: key || slugify(name),
        name: name || key,
        quantity: Math.max(0, Number(quantity) || 1),
        notes: notes || undefined,
      };
    })
    .filter((row) => row.equipmentKey && row.name);
}

function formatAvailabilityWindows(
  rows: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    timezone: string;
  }>
): string {
  return rows
    .map((row) =>
      [
        String(row.dayOfWeek),
        minutesToClock(row.startMinute),
        minutesToClock(row.endMinute),
        row.timezone,
      ].join(" | ")
    )
    .join("\n");
}

function parseAvailabilityWindows(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day, start, end, timezone] = line.split("|").map((part) => part.trim());
      return {
        dayOfWeek: clampNumber(Number(day), 0, 6),
        startMinute: clockToMinutes(start),
        endMinute: clockToMinutes(end),
        timezone: timezone || "America/Toronto",
      };
    })
    .filter((row) => row.endMinute > row.startMinute);
}

function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return clampNumber((hours || 0) * 60 + (minutes || 0), 0, 24 * 60);
}

function minutesToClock(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

import { createHash } from "node:crypto";

export const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
export const SAFE_SHELL_ARGUMENT_PATTERN = /^[A-Za-z0-9_./:=-]+$/;
export const AUTOMATED_GATE_TIMEOUT_MS = 20 * 60 * 1000;
export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringArray(value: unknown) {
  return Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string")
    ? value
    : undefined;
}

export function validDevicePixelRatio(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 4
    ? value
    : undefined;
}

export function isUniformViewportRaster(
  dimensions: { height: number; width: number },
  targetViewport: { height: number; width: number }
) {
  const widthScale = dimensions.width / targetViewport.width;
  const heightScale = dimensions.height / targetViewport.height;
  return (
    widthScale >= 0.5 &&
    widthScale <= 4 &&
    heightScale >= 0.5 &&
    heightScale <= 4 &&
    Math.abs(widthScale - heightScale) <= 0.002
  );
}

export function isPng(value: Buffer) {
  return (
    value.length >= 45 &&
    value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    value.readUInt32BE(8) === 13 &&
    value.subarray(12, 16).toString("ascii") === "IHDR" &&
    value.readUInt32BE(16) > 0 &&
    value.readUInt32BE(20) > 0 &&
    value.readUInt32BE(value.length - 12) === 0 &&
    value.subarray(value.length - 8, value.length - 4).toString("ascii") ===
      "IEND"
  );
}

export function pngDimensions(value: Buffer) {
  return { height: value.readUInt32BE(20), width: value.readUInt32BE(16) };
}

export function isValidHttpOrigin(value: string) {
  if (value.includes("<") || value.includes(">")) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

export function isValidIsoDate(value: string) {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

export function serializeCommand(argv: string[]) {
  return argv
    .map((argument) =>
      SAFE_SHELL_ARGUMENT_PATTERN.test(argument)
        ? argument
        : `'${argument.replaceAll("'", `'\\''`)}'`
    )
    .join(" ");
}

export function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

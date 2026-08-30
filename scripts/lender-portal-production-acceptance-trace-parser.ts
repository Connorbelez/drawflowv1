// biome-ignore-all lint/suspicious/noBitwiseOperators: ZIP CRC validation requires bitwise arithmetic.
import { unzipSync } from "fflate";
import { z } from "zod";

import {
  LEADING_DOT_PATTERN,
  LINE_SPLIT_PATTERN,
  sha40Schema,
} from "./lender-portal-production-acceptance-contract";
import { assertUnique, fail } from "./lender-portal-production-acceptance-io";
import { browserTraceManifestSchema } from "./lender-portal-production-acceptance-release-bundle";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";
export interface BrowserObservation {
  githubAttestationBundleSha256: string;
  githubAttestationBundleUri: string;
  manifestSha256: string;
  manifestUri: string;
  mappingId: string;
}

export interface OperationalEvidenceUniqueness {
  authSessionDigests: Set<string>;
  correlationIds: Set<string>;
  deliveryIds: Set<string>;
  eventIds: Set<string>;
  manifestUris: Set<string>;
  messageIds: Set<string>;
  providerRequestIds: Set<string>;
  receiptUris: Set<string>;
  runIds: Set<string>;
  sessionIds: Set<string>;
  traceDigests: Set<string>;
  traceUris: Set<string>;
}

let crc32Table: Uint32Array | undefined;

export function crc32(contents: Uint8Array) {
  crc32Table ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xed_b8_83_20 : 0);
    }
    return value >>> 0;
  });
  let value = 0xff_ff_ff_ff;
  for (const byte of contents) {
    const tableValue = crc32Table[(value ^ byte) & 0xff];
    if (tableValue === undefined) {
      fail("Authenticated browser trace CRC table lookup failed");
    }
    value = (value >>> 8) ^ tableValue;
  }
  return (value ^ 0xff_ff_ff_ff) >>> 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ZIP validation must keep central-directory, local-record, CRC, and encryption checks fail closed.
export function parsePlaywrightTraceArchive(archive: Buffer) {
  let decompressed: Record<string, Uint8Array>;
  try {
    decompressed = unzipSync(archive);
  } catch {
    fail(
      "Authenticated browser trace is not a valid decompressible ZIP archive"
    );
  }
  const eocdOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0 || eocdOffset + 22 > archive.byteLength) {
    fail("Authenticated browser trace ZIP end record is missing");
  }
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const directoryDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const directorySize = archive.readUInt32LE(eocdOffset + 12);
  const directoryOffset = archive.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0 ||
    directoryOffset + directorySize !== eocdOffset
  ) {
    fail("Authenticated browser trace ZIP directory offsets are invalid");
  }
  const entryNames: string[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > eocdOffset ||
      archive.readUInt32LE(offset) !== 0x02_01_4b_50
    ) {
      fail("Authenticated browser trace ZIP central directory is malformed");
    }
    const flags = archive.readUInt16LE(offset + 8);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (
      flags & 1 ||
      nameEnd + extraLength + commentLength > eocdOffset ||
      localOffset + 30 > directoryOffset ||
      archive.readUInt32LE(localOffset) !== 0x04_03_4b_50
    ) {
      fail("Authenticated browser trace ZIP entry is malformed or encrypted");
    }
    const name = archive.subarray(nameStart, nameEnd).toString("utf8");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const compressedStart = localNameEnd + localExtraLength;
    if (
      localNameEnd > directoryOffset ||
      archive.subarray(localNameStart, localNameEnd).toString("utf8") !==
        name ||
      compressedStart + compressedSize > directoryOffset
    ) {
      fail(
        "Authenticated browser trace ZIP local record does not match its directory"
      );
    }
    const contents = decompressed[name];
    if (
      !contents ||
      contents.byteLength !== uncompressedSize ||
      crc32(contents) !== expectedCrc
    ) {
      fail(
        "Authenticated browser trace ZIP CRC or decompression result is invalid"
      );
    }
    entryNames.push(name);
    offset = nameEnd + extraLength + commentLength;
  }
  if (offset !== eocdOffset) {
    fail("Authenticated browser trace ZIP directory length is inconsistent");
  }
  assertUnique(entryNames, "Authenticated browser trace ZIP entries");
  if (!(decompressed["trace.trace"] && decompressed["trace.network"])) {
    fail("Authenticated browser trace lacks Playwright trace structure");
  }
  return {
    network: Buffer.from(decompressed["trace.network"]),
    trace: Buffer.from(decompressed["trace.trace"]),
  };
}

export const traceAcceptanceMarkerSchema = z
  .object({
    actor: browserTraceManifestSchema.shape.actor,
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    mappingId: z.string().min(1),
    observedResult: z.string().min(8),
    releaseId: z.string().uuid(),
    route: z.string().startsWith("/"),
    runId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-playwright-trace-marker/v1"),
    sessionId: z.string().uuid(),
    sourceTreeSha: sha40Schema,
  })
  .strict();

export function parseTraceJsonLines(contents: Buffer, label: string) {
  return contents
    .toString("utf8")
    .split(LINE_SPLIT_PATTERN)
    .filter(Boolean)
    .map((line) => {
      try {
        return z.record(z.string(), z.unknown()).parse(JSON.parse(line));
      } catch {
        return fail(
          `Authenticated Playwright ${label} contains a malformed event`
        );
      }
    });
}

export function uniqueTraceEventIndex(
  events: Record<string, unknown>[],
  predicate: (event: Record<string, unknown>) => boolean,
  label: string
) {
  const indices = events
    .map((event, index) => (predicate(event) ? index : -1))
    .filter((index) => index >= 0);
  if (indices.length !== 1) {
    fail(`Authenticated Playwright trace requires one ${label} event`);
  }
  return indices[0] as number;
}

export const playwrightStorageStateSchema = z
  .object({
    cookies: z.array(
      z
        .object({
          domain: z.string().min(1),
          expires: z.number(),
          httpOnly: z.literal(true),
          name: z.string().min(1),
          path: z.literal("/"),
          secure: z.literal(true),
          value: z.string().min(32),
        })
        .passthrough()
    ),
    origins: z.array(z.unknown()),
  })
  .passthrough();

export interface AuthenticatedTraceSession {
  cookieName: string;
  cookieValue: string;
  sessionDigest: string;
}

export function cookieDomainIncludesHost(cookieDomain: string, host: string) {
  const normalizedDomain = cookieDomain
    .toLowerCase()
    .replace(LEADING_DOT_PATTERN, "");
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === normalizedDomain &&
    normalizedDomain ===
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.authKit.sessionCookieDomain
  );
}

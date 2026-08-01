const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_OCTET = /^\d{1,3}$/;
const IPV6_HEXTET = /^[0-9a-f]{1,4}$/;

const BLOCKED_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const BLOCKED_IPV6_CIDRS = [
  ["::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const;

export function assertPublicWebhookIpAddress(address: string) {
  if (!isPublicWebhookIpAddress(address)) {
    throw new Error("Webhook destination resolved to a non-public IP address.");
  }
}

export function isPublicWebhookIpAddress(address: string) {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== null) {
    return !BLOCKED_IPV4_CIDRS.some(([network, prefixLength]) =>
      isInCidr(ipv4, parseIpv4(network) ?? 0n, prefixLength, IPV4_BITS)
    );
  }
  const ipv6 = parseIpv6(address);
  if (ipv6 === null) {
    return false;
  }
  const mappedPrefix = parseIpv6("::ffff:0:0") ?? 0n;
  if (isInCidr(ipv6, mappedPrefix, 96, IPV6_BITS)) {
    return isPublicWebhookIpAddress(ipv4FromBigInt(ipv6 % 2n ** 32n));
  }
  return !BLOCKED_IPV6_CIDRS.some(([network, prefixLength]) =>
    isInCidr(ipv6, parseIpv6(network) ?? 0n, prefixLength, IPV6_BITS)
  );
}

function parseIpv4(address: string) {
  const octets = address.split(".");
  if (octets.length !== 4) {
    return null;
  }
  let value = 0n;
  for (const octetText of octets) {
    if (!IPV4_OCTET.test(octetText)) {
      return null;
    }
    const octet = Number(octetText);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = value * 256n + BigInt(octet);
  }
  return value;
}

function parseIpv6(address: string) {
  let normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) {
    normalized = normalized.slice(0, zoneIndex);
  }
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const embedded = parseIpv4(normalized.slice(lastColon + 1));
    if (embedded === null) {
      return null;
    }
    normalized = `${normalized.slice(0, lastColon)}:${Number(
      embedded / 65_536n
    ).toString(16)}:${Number(embedded % 65_536n).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    missing < 0 ||
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }
  const hextets = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (hextets.length !== 8) {
    return null;
  }
  let value = 0n;
  for (const hextetText of hextets) {
    if (!IPV6_HEXTET.test(hextetText)) {
      return null;
    }
    value = value * 65_536n + BigInt(`0x${hextetText}`);
  }
  return value;
}

function ipv4FromBigInt(value: bigint) {
  return [16_777_216n, 65_536n, 256n, 1n]
    .map((divisor) => Number((value / divisor) % 256n))
    .join(".");
}

function isInCidr(
  value: bigint,
  network: bigint,
  prefixLength: number,
  totalBits: number
) {
  const divisor = 2n ** BigInt(totalBits - prefixLength);
  return value / divisor === network / divisor;
}

const TOKEN_BYTE_LENGTH = 32;

function toBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    if (index + 1 < bytes.length) {
      output += alphabet[(chunk >> 6) & 63];
    }
    if (index + 2 < bytes.length) {
      output += alphabet[chunk & 63];
    }
  }
  return output;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateSiteVisitToken() {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSiteVisitToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export function validateIncludedSiteVisitMilestones({
  includedMilestoneKeys,
  milestoneOrder,
  selectedMilestoneKey,
}: {
  includedMilestoneKeys: string[];
  milestoneOrder: string[];
  selectedMilestoneKey: string;
}) {
  const selectedIndex = milestoneOrder.indexOf(selectedMilestoneKey);
  if (selectedIndex === -1) {
    throw new Error("Selected milestone not found");
  }

  const uniqueKeys = [...new Set(includedMilestoneKeys)];
  if (!uniqueKeys.includes(selectedMilestoneKey)) {
    throw new Error("Selected milestone must be included");
  }

  for (const key of uniqueKeys) {
    const index = milestoneOrder.indexOf(key);
    if (index === -1) {
      throw new Error(`Included milestone not found: ${key}`);
    }
    if (index > selectedIndex) {
      throw new Error(
        "Site visit can only include current and previous milestones"
      );
    }
  }

  return uniqueKeys.sort(
    (left, right) => milestoneOrder.indexOf(left) - milestoneOrder.indexOf(right)
  );
}

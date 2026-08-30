export type AssistantContextPack = Record<string, unknown>;

export function normalizePlannerRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function parsePlannerJson(content: string) {
  try {
    return normalizePlannerRecord(JSON.parse(content));
  } catch {
    return { text: content };
  }
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysSinceIsoDate(value: string) {
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return 0;
  }
  return Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000))
  );
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

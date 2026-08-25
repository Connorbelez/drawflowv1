export function formatOverdueDays(overdueDays: number) {
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

export function formatPlanDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

export function humanizeStatus(value: string) {
  const words = value.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

export function formatCents(value: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

export function errorMessageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete this milestone action.";
}

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function dateFromProposalDayOffset(
  proposedStartDate: string,
  dayOffset: number,
) {
  return isoDateFromUtcMs(
    utcMsFromIsoDate(proposedStartDate) + Math.round(dayOffset) * DAY_MS,
  );
}

export function dayOffsetFromProposalDate(
  proposedStartDate: string,
  scheduleDate: string,
) {
  return Math.round(
    (utcMsFromIsoDate(scheduleDate) - utcMsFromIsoDate(proposedStartDate)) /
      DAY_MS,
  );
}

export function inclusiveEndDateFromProposalSchedule(
  proposedStartDate: string,
  dayStart: number,
  durationDays: number,
) {
  return dateFromProposalDayOffset(
    proposedStartDate,
    Math.round(dayStart) + Math.max(1, Math.round(durationDays)) - 1,
  );
}

export function proposalDurationDaysFromInclusiveDates(
  startDate: string,
  inclusiveEndDate: string,
) {
  return Math.max(
    1,
    Math.round((utcMsFromIsoDate(inclusiveEndDate) - utcMsFromIsoDate(startDate)) / DAY_MS) +
      1,
  );
}

export function isoDateFromLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function localDateFromIsoDate(date: string) {
  const { day, month, year } = parseIsoDate(date);
  return new Date(year, month - 1, day);
}

export function todayIsoDate() {
  return isoDateFromLocalDate(new Date());
}

export function isValidIsoDateOnly(date: string) {
  try {
    parseIsoDate(date);
    return true;
  } catch {
    return false;
  }
}

function utcMsFromIsoDate(date: string) {
  const { day, month, year } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day);
}

function isoDateFromUtcMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseIsoDate(date: string) {
  const match = DATE_ONLY_REGEX.exec(date.trim());
  if (!match) {
    throw new Error("Expected a YYYY-MM-DD date.");
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Expected a valid YYYY-MM-DD date.");
  }
  return { day, month, year };
}

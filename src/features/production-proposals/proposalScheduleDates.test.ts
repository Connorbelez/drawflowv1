import { describe, expect, test } from "vitest";

import {
  dateFromProposalDayOffset,
  dayOffsetFromProposalDate,
  inclusiveEndDateFromProposalSchedule,
  proposalDurationDaysFromInclusiveDates,
} from "./proposalScheduleDates";

describe("proposal schedule date conversion", () => {
  test("maps inclusive user-facing dates to stored proposal offsets and duration", () => {
    expect(dayOffsetFromProposalDate("2026-06-01", "2026-06-01")).toBe(0);
    expect(dayOffsetFromProposalDate("2026-06-01", "2026-06-30")).toBe(29);
    expect(
      proposalDurationDaysFromInclusiveDates("2026-06-01", "2026-06-30"),
    ).toBe(30);
  });

  test("maps stored exclusive end offsets back to inclusive user-facing end dates", () => {
    expect(dateFromProposalDayOffset("2026-06-01", 0)).toBe("2026-06-01");
    expect(inclusiveEndDateFromProposalSchedule("2026-06-01", 0, 30)).toBe(
      "2026-06-30",
    );
  });

  test("supports backdated proposal anchors", () => {
    expect(dateFromProposalDayOffset("2025-04-15", 16)).toBe("2025-05-01");
    expect(dayOffsetFromProposalDate("2025-04-15", "2025-04-10")).toBe(-5);
  });
});

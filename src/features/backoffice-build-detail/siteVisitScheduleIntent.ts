export interface SiteVisitScheduleIntent {
  milestoneKey: string;
  note?: string;
  requestedDay: number;
  requestedTime?: string;
  siteVisitGuidance?: unknown;
  submilestoneGuidanceSections?: unknown;
  submilestoneKeys?: string[];
}

export class SiteVisitScheduleIntentRegistry {
  private readonly keys = new Map<string, string>();

  constructor(
    private readonly createKey: () => string = () => crypto.randomUUID()
  ) {}

  confirm(input: SiteVisitScheduleIntent) {
    this.keys.delete(siteVisitScheduleIntentFingerprint(input));
  }

  keyFor(input: SiteVisitScheduleIntent) {
    const fingerprint = siteVisitScheduleIntentFingerprint(input);
    const existing = this.keys.get(fingerprint);
    if (existing) {
      return existing;
    }
    const created = this.createKey();
    this.keys.set(fingerprint, created);
    return created;
  }
}

export function siteVisitScheduleIntentFingerprint(
  input: SiteVisitScheduleIntent
) {
  return JSON.stringify({
    milestoneKey: input.milestoneKey,
    note: input.note ?? null,
    requestedDay: input.requestedDay,
    requestedTime: input.requestedTime ?? null,
    siteVisitGuidance: input.siteVisitGuidance ?? null,
    submilestoneGuidanceSections: input.submilestoneGuidanceSections ?? null,
    submilestoneKeys: [...(input.submilestoneKeys ?? [])].sort(),
  });
}

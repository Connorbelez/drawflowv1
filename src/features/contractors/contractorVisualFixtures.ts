import {
  VISUAL_PARITY_ORGANIZATION_ID,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";

export { isProductionVisualParityFixtureEnabled };

const brokerage = {
  _id: "brokerage_visual_parity",
  name: "FairLend Capital",
  organizationId: VISUAL_PARITY_ORGANIZATION_ID,
};

const contractors = [
  {
    _id: "contractor_visual_masonry",
    accountWorkosUserId: "user_contract_masonry",
    availabilityWindows: [
      {
        dayOfWeek: 1,
        endMinute: 960,
        startMinute: 420,
        timezone: "America/Toronto",
      },
    ],
    capabilities: [
      {
        capabilityKey: "brick-siding",
        label: "Brick siding",
        trade: "masonry",
      },
      {
        capabilityKey: "veneer-repair",
        label: "Veneer repair",
        trade: "masonry",
      },
    ],
    city: "Toronto, ON",
    defaultPayRateCents: 8500,
    defaultPayRateUnit: "hour",
    email: "ops@northstarmasonry.example",
    equipment: [
      { equipmentKey: "mixer", name: "Mortar mixer", quantity: 1 },
      { equipmentKey: "scaffold", name: "Scaffold", quantity: 2 },
    ],
    kind: "company",
    name: "Northstar Masonry",
    onboardingStatus: "account_linked",
    phone: "416-555-0144",
    status: "active",
    trades: ["masonry", "brick", "envelope"],
  },
  {
    _id: "contractor_visual_framing",
    availabilityWindows: [
      {
        dayOfWeek: 2,
        endMinute: 930,
        startMinute: 390,
        timezone: "America/Toronto",
      },
    ],
    capabilities: [
      {
        capabilityKey: "structural-framing",
        label: "Structural framing",
        trade: "framing",
      },
    ],
    city: "Hamilton, ON",
    defaultPayRateCents: 72000,
    defaultPayRateUnit: "day",
    email: "crew@beamline.example",
    equipment: [
      { equipmentKey: "telehandler", name: "Telehandler", quantity: 1 },
    ],
    kind: "company",
    name: "Beamline Framing",
    onboardingStatus: "profile_only",
    status: "active",
    trades: ["framing", "carpentry"],
  },
];

export function getVisualContractorList() {
  return {
    brokerage,
    contractors,
    summary: {
      activeCount: contractors.length,
      capabilityKeys: [
        ...new Set(
          contractors.flatMap((contractor) =>
            contractor.capabilities.map((capability) => capability.capabilityKey),
          ),
        ),
      ],
    },
  };
}

export function getVisualContractorDetail(contractorId: string) {
  const profile = contractors.find((contractor) => contractor._id === contractorId) ??
    contractors[0];
  const ratings = [
    {
      _id: "rating_visual_1",
      buildId: "build_visual_hamilton",
      createdAt: Date.UTC(2026, 4, 28, 16, 0),
      milestoneKey: "exterior-envelope",
      note: "Clean brickwork, minor mortar touchups noted.",
      rating: 4,
      source: "site_visit",
      submilestoneKey: "brick-siding",
    },
  ];
  return {
    performance: {
      averageQualityRating: 4,
      assignmentCount: 1,
      completedAssignmentCount: 1,
      ratingCount: ratings.length,
      totalActualCostCents: 612_000,
      totalActualHours: 72,
      totalEstimatedCostCents: 620_500,
      totalEstimatedHours: 73,
      totalVarianceCents: -8_500,
    },
    profile,
    ratings,
    workHistory: [
      {
        _id: "assignment_visual_1",
        buildId: "build_visual_hamilton",
        buildName: "Hamilton Infill Build",
        buildStatus: "active",
        actualCostCents: 612_000,
        actualHours: 72,
        agreedRateCents: profile.defaultPayRateCents,
        agreedRateUnit: profile.defaultPayRateUnit,
        costNotes: "Crew beat estimate by one hour after scaffold was staged.",
        evidencePhotos: [
          {
            evidenceKey: "ev_visual_brick_1",
            fileName: "brick-siding-east.jpg",
            label: "East elevation brick siding",
            milestoneKey: "exterior-envelope",
            previewUrl: null,
            source: "active_build_site_visit:visual",
            submilestoneKey: "brick-siding",
            tag: "Site visit evidence",
          },
        ],
        location: "219 King St E, Hamilton, ON",
        milestoneKey: "exterior-envelope",
        milestoneName: "Exterior envelope",
        estimatedCostCents: 620_500,
        estimatedHours: 73,
        postHoc: false,
        role: "Masonry lead",
        status: "active",
        submilestones: [
          {
            key: "brick-siding",
            name: "Brick siding",
            status: "complete",
          },
        ],
        updatedAt: Date.UTC(2026, 4, 29, 12, 0),
      },
    ],
  };
}

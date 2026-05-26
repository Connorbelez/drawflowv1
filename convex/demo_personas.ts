export const DEMO_ORG_KEY = "org_fairlend_demo";

export const MOCK_BUILDER_PERSONA = "mock_builder";
export const MOCK_STAFF_PERSONA = "mock_staff";

export const DEMO_PERSONAS = [
  {
    key: MOCK_BUILDER_PERSONA,
    label: "Mock Builder",
    role: "builder",
  },
  {
    key: MOCK_STAFF_PERSONA,
    label: "Mock Staff",
    role: "staff",
  },
] as const;

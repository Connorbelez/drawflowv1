import { src } from "./core-workflow-manifest-model";

export const validationGaps = [
  "NEEDS_VALIDATION — Draw request attribution: reconcile pooled approved-milestone availability in `builder-draw-request-workspace.md` with Draw Group readiness/Draw Release Work Orders in `draw_flow_prd.md`.",
  "NEEDS_VALIDATION — Cross-brokerage transfer: define source/destination consent, document ownership, historical visibility, and active-work repair/atomicity policy.",
  "NEEDS_VALIDATION — Lender Policy administration: configuration values are required and a Policy entity is organization-scoped, but no complete create/version/approve/activate workflow is specified; therefore no unsupported workflow was invented.",
  "NEEDS_VALIDATION — Webhook operations: define payload/version contract, retry/backoff, dead-letter/replay, secret rotation, and MVP event depth.",
  "NEEDS_VALIDATION — Partial draw policy: production requests support partial amounts, while the core PRD still lists partial draws as an open decision.",
  "NEEDS_VALIDATION — Notification preferences: V1 has a schema foundation but explicitly no preference UI, so preference-management is not modeled as a user workflow.",
  "NEEDS_VALIDATION — Material procurement: documentation supports planning and closing copy only; purchasing, delivery, receipt, and supplier-payment workflows are intentionally excluded.",
];

export const sourceCoverage: { source: string; workflows: string[] }[] = [
  { source: `${src.production} §8.1`, workflows: ["WF-TEN-001"] },
  {
    source: `${src.production} §8.2`,
    workflows: ["WF-TEN-004", "WF-TEN-002", "WF-TEN-003", "WF-OPS-001"],
  },
  {
    source: `${src.production} §8.3–8.4`,
    workflows: ["WF-TEN-002", "WF-TEN-003"],
  },
  { source: `${src.production} §8.5`, workflows: ["WF-CTR-001"] },
  { source: `${src.production} §8.6–8.7`, workflows: ["WF-PRP-001"] },
  {
    source: `${src.production} §8.8`,
    workflows: [
      "WF-BLD-001",
      "WF-CTR-002",
      "WF-MAT-001",
      "WF-CAL-001",
      "WF-BUD-001",
    ],
  },
  {
    source: `${src.production} §8.9`,
    workflows: ["WF-OPS-001", "WF-MIL-001", "WF-DRW-001"],
  },
  {
    source: `${src.production} §8.10`,
    workflows: ["WF-MIL-001", "WF-DRW-001"],
  },
  { source: `${src.core} §11.1–11.2`, workflows: ["WF-PRP-001"] },
  { source: `${src.core} §11.3`, workflows: ["WF-BLD-001", "WF-MIL-001"] },
  { source: `${src.core} §11.4–11.5`, workflows: ["WF-MIL-001", "WF-CAL-001"] },
  { source: `${src.core} §11.6`, workflows: ["WF-MIL-001", "WF-DRW-001"] },
  { source: `${src.core} §11.7`, workflows: ["WF-BUD-001"] },
  { source: `${src.core} §18.3.4–18.3.8`, workflows: ["WF-MIL-001"] },
  {
    source: `${src.core} §18.3.9–18.3.12`,
    workflows: ["WF-DRW-001", "WF-MIL-001", "WF-BUD-001", "WF-OPS-001"],
  },
  { source: `${src.contractor} §7, §9, §14.1–14.2`, workflows: ["WF-CTR-001"] },
  {
    source: `${src.contractor} §8, §10, §14.3–14.4`,
    workflows: ["WF-CTR-002", "WF-CAL-001", "WF-COM-001"],
  },
  { source: src.materials, workflows: ["WF-MAT-001"] },
  { source: src.drawRequest, workflows: ["WF-DRW-001"] },
  { source: src.calendar, workflows: ["WF-CAL-001"] },
  { source: src.notifications, workflows: ["WF-COM-001"] },
  { source: `${src.screens} SCR-028`, workflows: ["WF-INT-001"] },
];

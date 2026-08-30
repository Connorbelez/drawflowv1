import { z } from "zod";

export const LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH =
  "docs/lender-portal-mvp-execution/production-acceptance-contract.json";

export const AUTOMATED_TEST_SCRIPT = "test:lender-portal-production-journeys";
export const LINE_SPLIT_PATTERN = /\r?\n/;
export const LOCATION_HEADER_PATTERN = /^location:\s*(.+)$/i;
export const EXPECTED_SURFACE_IDS = [
  "LP-SURFACE-DASHBOARD",
  "LP-SURFACE-BUILD-DETAIL",
  "LP-SURFACE-MILESTONE-QUEUE",
  "LP-SURFACE-DRAW-QUEUE",
] as const;
export const EXPECTED_JOURNEY_IDS = Array.from(
  { length: 10 },
  (_, index) => `LP-E2E-${String(index + 1).padStart(2, "0")}`
);
export const EXPECTED_VERTICAL_SLICE_GATE_IDS = Array.from(
  { length: 10 },
  (_, index) => `LP-VSG-${String(index + 1).padStart(2, "0")}`
);
export const EXPECTED_OPERATIONAL_GATE_IDS = [
  "authenticated-production-browser",
  "focus-and-status-announcements",
  "responsive-zoom-and-screen-reader",
  "provider-and-webhook-delivery",
  "inbox-and-reauthorized-links",
  "phase3-migration-cutover",
  "exact-release-commit",
] as const;
export const PHASE3_CUTOVER_MIGRATIONS = [
  {
    id: "proposal-phase3-lifecycle",
    runner: "migrations:runProposalPhase3LifecycleBackfill",
  },
  {
    id: "workos-user-normalized-email",
    runner: "migrations:runWorkosUserNormalizedEmailBackfill",
  },
] as const;
export const PHASE3_CUTOVER_INDEXES = [
  {
    fields: ["proposalId", "assignmentId", "proposalRevisionId", "status"],
    name: "by_proposal_assignment_revision_status",
    table: "proposalLenderApprovals",
  },
  {
    fields: ["normalizedEmail"],
    name: "by_normalized_email",
    table: "users",
  },
] as const;
export const CANONICAL_MACHINE_BINDINGS = [
  [
    "LP-SURFACE-DASHBOARD",
    "proof-surface-dashboard",
    "src/routes/lender/-dashboard-route.test.tsx",
    "renders every Review requirement beyond the former three-row cap",
  ],
  [
    "LP-SURFACE-BUILD-DETAIL",
    "proof-surface-build-detail",
    "src/routes/lender/builds/-build-detail-route.test.tsx",
    "queries the authorized canonical boundary and renders promoted Variant C",
  ],
  [
    "LP-SURFACE-MILESTONE-QUEUE",
    "proof-surface-milestones",
    "src/routes/lender/-milestones-route.test.tsx",
    "opens canonical queue data through the ordinary target-only route contract",
  ],
  [
    "LP-SURFACE-DRAW-QUEUE",
    "proof-surface-draws",
    "src/routes/lender/-draws-route.test.tsx",
    "opens canonical queue data through the ordinary target-only route contract",
  ],
  [
    "LP-E2E-01",
    "proof-e2e-01",
    "src/routes/lender/proposals/-index.test.tsx",
    "renders the public lender Proposal list query through the production route",
  ],
  [
    "LP-E2E-02",
    "proof-e2e-02",
    "src/routes/lender/proposals/-detail-route.test.tsx",
    "wires an eligible lender closing through the supported route",
  ],
  [
    "LP-E2E-03",
    "proof-e2e-03",
    "src/routes/lender/proposals/-detail-route.test.tsx",
    "wires separate activation and opens the returned authorized Build",
  ],
  [
    "LP-E2E-04",
    "proof-e2e-04",
    "src/routes/lender/proposals/-detail-route.test.tsx",
    "renders sealed revision checkpoints and decisions without private fields",
  ],
  [
    "LP-E2E-05",
    "proof-e2e-05",
    "src/routes/lender/-milestones-route.test.tsx",
    "renders the ordinary Phase 5 detail from a queue target",
  ],
  [
    "LP-E2E-06",
    "proof-e2e-06",
    "src/routes/builder/proposals/-proposal.$proposalId.test.ts",
    "wires a numeric notification URL cycle to Builder correction and the returned N+1 tuple",
  ],
  [
    "LP-E2E-07",
    "proof-e2e-07",
    "src/routes/lender/-draws-route.test.tsx",
    "renders the canonical review surface for a complete deep-link tuple",
  ],
  [
    "LP-E2E-08",
    "proof-e2e-08",
    "src/routes/backoffice/lenders/-lender-control-plane.test.tsx",
    "reaches the promoted Variant E directory with canonical scoped members",
  ],
  [
    "LP-E2E-09",
    "proof-e2e-09",
    "src/routes/lender/-dashboard-route.test.tsx",
    "does not request portfolio data without an assigned lender organization",
  ],
  [
    "LP-E2E-10",
    "proof-e2e-10",
    "src/routes/lender/-notification-review-routes.test.ts",
    "branches current and withdrawn Proposal detail at the route query boundary",
  ],
  [
    "LP-VSG-01",
    "proof-vsg-01",
    "src/routes/lender/-dashboard-route.test.tsx",
    "keeps an assigned lender in loading state until Dashboard data is defined",
  ],
  [
    "LP-VSG-02",
    "proof-vsg-02",
    "src/routes/lender/builds/-build-detail-route.test.tsx",
    "renders the authorized Build overview from the supported route entry",
  ],
  [
    "LP-VSG-03",
    "proof-vsg-03",
    "src/routes/lender/-milestones-route.test.tsx",
    "retains the exact-cycle notification boundary for correlated links",
  ],
  [
    "LP-VSG-04",
    "proof-vsg-04",
    "src/routes/lender/-draws-route.test.tsx",
    "renders the promoted production Draw queue from the ordinary route entry",
  ],
  [
    "LP-VSG-05",
    "proof-vsg-05",
    "src/routes/lender/-draws-route.test.tsx",
    "renders the ordinary Phase 5 detail from a queue target without notification correlation",
  ],
  [
    "LP-VSG-06",
    "proof-vsg-06",
    "src/routes/builder/proposals/-proposal.$proposalId.test.ts",
    "keeps submitted Builder proposals read-only despite broad app permissions",
  ],
  [
    "LP-VSG-07",
    "proof-vsg-07",
    "src/routes/builder/proposals/-proposal.$proposalId.test.ts",
    "does not wire lender-only review or backoffice draw controls into the builder workspace",
  ],
  [
    "LP-VSG-08",
    "proof-vsg-08",
    "src/routes/backoffice/lenders/-lender-control-plane.test.tsx",
    "requires and forwards the operator-entered workflow policy audit reason",
  ],
  [
    "LP-VSG-09",
    "proof-vsg-09",
    "src/routes/backoffice/-proposals.$planId.test.tsx",
    "wires the supported Back Office detail route to explicit closing terms and separate activation",
  ],
  [
    "LP-VSG-10",
    "proof-vsg-10",
    "src/routes/backoffice/lenders/-lender-control-plane.test.tsx",
    "keeps an accepted role change pending until the WorkOS projection reconciles",
  ],
] as const;
export const CANONICAL_ROUTE_GRAPH = [
  [
    "route-dashboard",
    "src/routes/lender/index.tsx",
    "#/features/lender-dashboard/LenderDashboardVariantD.tsx",
    "src/features/lender-dashboard/LenderDashboardVariantD.tsx",
    "LenderDashboardVariantD",
    ["LenderDashboard", "LenderDashboardVariantD"],
    "src/features/lender-dashboard/LenderDashboardVariantD.tsx",
    "LenderDashboardVariantD",
    "api.lender_portal.getLenderDashboard",
  ],
  [
    "route-build-detail",
    "src/routes/lender/builds/$buildId.tsx",
    "#/features/lender-portal/LenderBuildDetailOverview.tsx",
    "src/features/lender-portal/LenderBuildDetailOverview.tsx",
    "LenderBuildDetailOverview",
    ["LenderBuildDetail", "LenderBuildDetailOverview"],
    "src/routes/lender/builds/$buildId.tsx",
    "LenderBuildDetail",
    "api.lender_portal.getLenderBuildDetail",
  ],
  [
    "route-milestone-queue",
    "src/routes/lender/milestones.tsx",
    "#/features/lender-portal/LenderMilestoneQueue.tsx",
    "src/features/lender-portal/LenderMilestoneQueue.tsx",
    "LenderMilestoneQueue",
    ["LenderMilestoneQueueRoute", "LenderMilestoneQueue"],
    "src/features/lender-portal/LenderMilestoneQueue.tsx",
    "LenderMilestoneQueue",
    "api.lender_portal_phase5.listAllAssignedLenderMilestoneReviewRequests",
  ],
  [
    "route-draw-queue",
    "src/routes/lender/draws.tsx",
    "#/features/lender-portal/LenderDrawQueue.tsx",
    "src/features/lender-portal/LenderDrawQueue.tsx",
    "LenderDrawQueue",
    ["LenderDrawQueueRoute", "LenderDrawQueue"],
    "src/features/lender-portal/LenderDrawQueue.tsx",
    "LenderDrawQueue",
    "api.lender_portal.getLenderDrawQueue",
  ],
  [
    "route-proposal-detail",
    "src/routes/lender/proposals/$proposalId.tsx",
    "#/features/lender-portal/LenderProposalNotificationReviewSurface.tsx",
    "src/features/lender-portal/LenderProposalNotificationReviewSurface.tsx",
    "LenderProposalNotificationReviewSurface",
    ["LenderProposalReview", "LenderProposalNotificationReviewSurface"],
    "src/routes/lender/proposals/$proposalId.tsx",
    "LenderProposalReview",
    "api.production_proposals.getCurrentLenderProposalDetail",
  ],
  [
    "route-proposal-list",
    "src/routes/lender/proposals/index.tsx",
    "#/features/lender-portfolio/LenderAssignedProposalList.tsx",
    "src/features/lender-portfolio/LenderAssignedProposalList.tsx",
    "LenderProposalPortfolio",
    ["LenderProposals", "LenderProposalPortfolio"],
    "src/features/lender-portfolio/LenderAssignedProposalList.tsx",
    "LenderProposalPortfolio",
    "api.lender_portal.listLenderAssignedProposalPage",
  ],
  [
    "route-builder-correction",
    "src/routes/builder/proposals/$proposalId/index.tsx",
    "#/features/lender-portal/LenderNotificationReviewSurface.tsx",
    "src/features/lender-portal/LenderNotificationReviewSurface.tsx",
    "BuilderNotificationReviewSurface",
    [
      "BuilderProductionProposalRoute",
      "BuilderProductionProposalWorkspace",
      "BuilderNotificationReviewSurface",
    ],
    "src/routes/builder/proposals/$proposalId/index.tsx",
    "BuilderProductionProposalWorkspace",
    "api.production_proposals.getBuilderProposalConfirmationState",
  ],
  [
    "route-backoffice-lenders",
    "src/routes/backoffice/lenders/index.tsx",
    "./-lender-control-plane",
    "src/routes/backoffice/lenders/-lender-control-plane.tsx",
    "LenderControlPlaneSurface",
    ["LenderControlPlaneRoute", "LenderControlPlaneSurface"],
    "src/routes/backoffice/lenders/-lender-control-plane.tsx",
    "LenderControlPlaneSurface",
    "api.lenderOrganizations.listLenderOrganizations",
  ],
  [
    "route-backoffice-proposal-detail",
    "src/routes/backoffice/proposals.$planId.tsx",
    "./-proposal-review-route-content.tsx",
    "src/routes/backoffice/-proposal-review-route-content.tsx",
    "ProposalReviewRouteContent",
    ["ProposalReviewRoute", "ProposalReviewRouteContent"],
    "src/routes/backoffice/-proposal-review-route-content.tsx",
    "ProposalReviewRouteContent",
    "api.production_proposals.getProposalDetailByString",
  ],
] as const;
export const CANONICAL_TEST_BODY_SHA256: Readonly<Record<string, string>> = {
  "proof-auth-dashboard-scope":
    "388b386d78dd91fe4d0622a5de6550ef8815231b2c37c4b6ee0d627ecd137d10",
  "proof-auth-evidence-scope":
    "df57ae767fcd68b00f730600a952f645ff4489b7eb42feb8d72d345f8fafd285",
  "proof-auth-organization-scope":
    "2fb6edff98b7bf23ddd5af27dcfad0f762206f684deb4d0be803aabfe0bcda6b",
  "proof-auth-review-privacy":
    "70022c4f9047bac562ad49ddc394147b16d3721db084738cc4da7705e98601a7",
  "proof-auth-snapshot-boundary":
    "14c8a74611b42502ecce17991fa68ca620f683878e3d8adfb52ba69707747e70",
  "proof-e2e-01":
    "5cff81480631c99fb74875171741382ee9af0283de0d97ffab9548b8eb4cca1c",
  "proof-e2e-02":
    "d4abb2867bd967488542bd6003fcc87e028a2dfb531b0ab6c9f565428373b540",
  "proof-e2e-03":
    "d129056c6ccb59e31b32de68ac7bd311e1790ecf56ce00bbdcbf021853f0c988",
  "proof-e2e-04":
    "d6d589258dd56aeab1fb0b21d4a9a063cc3a4d9cf79471e5570c62f36519181e",
  "proof-e2e-05":
    "79bc92a73b2c2e62d46e0d00b1a17615ba1fe56b6a418405e0da7124f2c1badd",
  "proof-e2e-06":
    "ba4024913f5cdabd8dd118a2b329956fd02ffeaff54d4fa869c65545247344ab",
  "proof-e2e-07":
    "fc23632bf9983bf4a6657818e8aa57f056f4aadde09fbab3197d265053f493ac",
  "proof-e2e-08":
    "967f6c82b3a869fe0265bd60e813a3a4725bef4b7b31b21019d2bc6cb9ea288f",
  "proof-e2e-09":
    "5353aa4d373b8006d73bc96179460c6d9aeb60b9da7d5a3c9d2ac1bb0d4e4b33",
  "proof-e2e-10":
    "033979a2e753d1f2e451565d54f47aa74d7ada7e79ecbd9b6fb074ed508d926a",
  "proof-surface-build-detail":
    "9899694c0ffffd3aca52151550d96583d2e14f74971b11a2551d417889959a45",
  "proof-surface-dashboard":
    "ae323f5180935aa5539a735d8fd342c3d9fed0cbdd8f8b2f5f1e0854b35a7366",
  "proof-surface-draws":
    "e61034892ce73a2a256b4b236f669bc582d66c02d6235ad886b8d587cb069d2d",
  "proof-surface-milestones":
    "35aedfbd0b2ad09094c46357276414e336313f1ccc5e64c4d27f95888ed1a41b",
  "proof-vsg-01":
    "e657b5f19ac274d163867110321c6f2af1dd318a9e50a5bb1b2ce85d3480c2e7",
  "proof-vsg-02":
    "b6308506704fa485d466d21f3abac02477c94f5bbad11bd2c762bcc28ce1d173",
  "proof-vsg-03":
    "4df8a893810d3e251159d7d22777c323378c25ef98351b8e05f73853bde18b5b",
  "proof-vsg-04":
    "fa7b99380dc2eae1a8bca2cabc28ab0d62a4aacd4e2541350c2db89768edbe70",
  "proof-vsg-05":
    "c67adf46e223f583d3db6a8219020cf4b82ed511fa28751679653bf68377aaa9",
  "proof-vsg-06":
    "51791cdeaa6a82952f62ed42f64320c936c22c35db2c6504cbda144b3fd066be",
  "proof-vsg-07":
    "d72639b04776d1870e16c2ca56a7bb28d41c1d7cc8161101be520061f09486a5",
  "proof-vsg-08":
    "e45cfc9e7be1441c9e307836de9314786ae4e79583e9a74cb2e28489e32ede8c",
  "proof-vsg-09":
    "b96173b4f50f745bbccade873765b3fd3631e29fc5ee8cc5b448ab08aab75ba8",
  "proof-vsg-10":
    "86b3e7417fb85a6f3638ef4ab35217ebbd3f8511dd318eade5cb94c801464883",
};
export const FORBIDDEN_EVIDENCE_SOURCE_PARTS = [
  "production-acceptance-contract",
  "lender-portal-production-acceptance",
] as const;
export const GITHUB_RELEASE_ASSET_REDIRECT_PATTERN =
  "^/github-production-release-asset/[0-9]+/[A-Za-z0-9-]+(?:/[A-Za-z0-9._-]+)?$";
export const PATH_SEGMENT_SEPARATOR_PATTERN = /[\\/]/;
export const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
export const WHITESPACE_CHARACTER_PATTERN = /\s/;
export const SHELL_CONTROL_PATTERN = /[;&|><]/;
export const WORD_SEPARATOR_PATTERN = /\s+/;
export const RAW_URL_PATH_PATTERN =
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/;
export const VIEWPORT_PATTERN = /^\d+x\d+$/;
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
export const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
export const BIGINT_SUFFIX_PATTERN = /n$/;
export const LEADING_DOT_PATTERN = /^\./;
export const UNKNOWN_STATIC_VALUE = Symbol("unknown-static-value");

export const sha40Schema = z.string().regex(/^[a-f0-9]{40}$/);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const publicKeySchema = z
  .object({
    id: z.string().min(1),
    publicKeyPem: z.string().startsWith("-----BEGIN PUBLIC KEY-----"),
    sha256: sha256Schema,
  })
  .strict();
export const reviewerPolicySchema = publicKeySchema
  .extend({
    reviewerDisplayName: z.string().min(3),
    reviewerId: z.string().min(3),
  })
  .strict();

export const productionRouteConsumerSchema = z
  .object({
    class: z.literal("production-route"),
    componentExport: z.string().min(1),
    componentSource: z.string().min(1),
    id: z.string().min(1),
    importModule: z.string().min(1),
    queryOwner: z.string().regex(/^api\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/),
    queryOwnerFunction: z.string().min(1),
    queryOwnerLocation: z.enum(["route", "component"]),
    queryOwnerSource: z.string().min(1),
    renderPath: z.array(z.string().min(1)).min(1),
    routeSource: z.string().min(1),
    routerPath: z.string().startsWith("/"),
    testTargets: z.array(z.string().min(1)).min(1),
  })
  .strict();
export const canonicalApiConsumerSchema = z
  .object({
    class: z.literal("canonical-api"),
    exportName: z.string().min(1),
    id: z.string().min(1),
    sourcePath: z.string().min(1),
  })
  .strict();
export const consumerSchema = z.discriminatedUnion("class", [
  productionRouteConsumerSchema,
  canonicalApiConsumerSchema,
]);
export const testCommandSchema = z
  .object({
    id: z.string().min(1),
    packageScript: z.literal(AUTOMATED_TEST_SCRIPT),
    runner: z.literal("vitest"),
    runnerExecutableSha256: sha256Schema,
    runnerVersion: z.string().regex(SEMVER_PATTERN),
    targetFiles: z.array(z.string().min(1)).min(1),
  })
  .strict();
export const testProofSchema = z
  .object({
    assertionName: z.string().min(8),
    commandId: z.string().min(1),
    consumerIds: z.array(z.string().min(1)).min(1),
    id: z.string().min(1),
    observableResult: z.string().min(16),
    proofClass: z.enum(["production-route", "authorization-boundary"]),
    targetFile: z.string().min(1),
  })
  .strict();
export const machineMappingSchema = z
  .object({
    consumerIds: z.array(z.string().min(1)).min(1),
    id: z.string().min(1),
    operationalGateIds: z.array(z.string().min(1)).min(1),
    testProofId: z.string().min(1),
  })
  .strict();
export const artifactKindSchema = z.enum([
  "machine-test-output",
  "browser-capture",
  "accessibility-report",
  "provider-delivery-report",
  "inbox-link-report",
  "migration-cutover-report",
  "release-artifact",
  "independent-review",
]);
export const operationalGateSchema = z
  .object({
    artifactKind: artifactKindSchema,
    evidenceType: z.enum([
      "authenticated-browser-journey",
      "focus-status-audit",
      "responsive-assistive-technology-audit",
      "provider-webhook-delivery",
      "inbox-reauthorization-journey",
      "phase3-migration-cutover",
      "immutable-release-bundle",
    ]),
    id: z.string().min(1),
  })
  .strict();
export const evidencePolicySchema = z
  .object({
    githubAttestation: z
      .object({
        oidcIssuer: z.literal("https://token.actions.githubusercontent.com"),
        repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
        signerDigest: sha40Schema,
        signerWorkflow: z
          .string()
          .regex(/^github\.com\/[A-Za-z0-9_./-]+\.ya?ml$/),
        sourceRepository: z
          .string()
          .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
      })
      .strict(),
    githubOwner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    githubRepository: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    initialOrigin: z.literal("https://github.com"),
    releaseAssetRedirects: z
      .array(
        z
          .object({
            origin: z.literal("https://release-assets.githubusercontent.com"),
            pathnamePattern: z.literal(GITHUB_RELEASE_ASSET_REDIRECT_PATTERN),
          })
          .strict()
      )
      .min(1),
  })
  .strict();
export const acceptanceContractSchema = z
  .object({
    attestationMaxAgeHours: z.number().int().positive().max(168),
    authorizationTestProofIds: z.array(z.string().min(1)).min(1),
    automatedTestScript: z.literal(AUTOMATED_TEST_SCRIPT),
    consumers: z.array(consumerSchema).min(1),
    evidencePolicy: evidencePolicySchema,
    journeys: z.array(machineMappingSchema),
    operationalGates: z.array(operationalGateSchema),
    schemaVersion: z.literal("lender-portal-production-acceptance/v3"),
    surfaces: z.array(
      machineMappingSchema.extend({
        component: z.string().min(1),
        productionRoute: z.string().min(1),
        queryOwner: z.string().min(1),
      })
    ),
    testCommands: z.array(testCommandSchema).min(1),
    testProofs: z.array(testProofSchema).min(1),
    trustedDeploymentOrigins: z.array(z.string().url()).min(1),
    trustedReleaseKeys: z.array(publicKeySchema).min(1),
    trustedReviewers: z.array(reviewerPolicySchema).min(1),
    verticalSliceGates: z.array(machineMappingSchema),
  })
  .strict();

export const artifactSchema = z
  .object({
    commitSha: sha40Schema,
    id: z.string().min(1),
    kind: artifactKindSchema,
    mediaType: z.literal("application/json"),
    sha256: sha256Schema,
    sourceTreeSha: sha40Schema,
    uri: z.string().url(),
  })
  .strict();
export const signatureSchema = z
  .object({
    algorithm: z.literal("ed25519"),
    keyId: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();
export const machineProofSchema = z
  .object({
    artifactId: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal("machine-test"),
    result: z.literal("passed"),
    testProofId: z.string().min(1),
  })
  .strict();
export const operationalProofSchema = z
  .object({
    artifactId: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal("operational-attestation"),
    result: z.literal("passed"),
  })
  .strict();
export const attestationPayloadSchema = z
  .object({
    artifacts: z.array(artifactSchema).min(1),
    attestationUri: z.string().url(),
    candidateSha: sha40Schema,
    contractSha256: sha256Schema,
    deployment: z
      .object({
        deployedAt: z.string().datetime({ offset: true }),
        deployedCommitSha: sha40Schema,
        environment: z.literal("production"),
        id: z.string().min(1),
        releaseArtifactId: z.string().min(1),
        releaseArtifactSha256: sha256Schema,
        releaseBundleGithubAttestationSha256: sha256Schema,
        releaseBundleGithubAttestationUri: z.string().url(),
        releaseBundleSha256: sha256Schema,
        releaseBundleUri: z.string().url(),
        sourceTreeSha: sha40Schema,
        url: z.string().url(),
      })
      .strict(),
    independentAcceptance: z
      .object({
        artifactId: z.string().min(1),
        artifactSha256: sha256Schema,
        decision: z.literal("accepted"),
        reviewerDisplayName: z.string().min(3),
        reviewerId: z.string().min(3),
        signature: signatureSchema,
        verifiedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    issuedAt: z.string().datetime({ offset: true }),
    releaseId: z.string().uuid(),
    journeys: z.array(machineProofSchema),
    operationalGates: z.array(operationalProofSchema),
    schemaVersion: z.literal(
      "lender-portal-production-acceptance-attestation/v3"
    ),
    surfaces: z.array(machineProofSchema),
    verticalSliceGates: z.array(machineProofSchema),
  })
  .strict();
export const signedAttestationSchema = z
  .object({ payload: attestationPayloadSchema, signature: signatureSchema })
  .strict();
export const machineArtifactPayloadSchema = z
  .object({
    artifactId: z.string().min(1),
    commitSha: sha40Schema,
    executionReport: z
      .object({
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        rawReportBase64: z.string().min(16),
        rawReportSha256: sha256Schema,
      })
      .strict(),
    proof: z
      .object({
        assertionName: z.string().min(1),
        commandId: z.string().min(1),
        consumerIds: z.array(z.string().min(1)).min(1),
        mappingId: z.string().min(1),
        observableResult: z.string().min(1),
        targetFile: z.string().min(1),
        testProofId: z.string().min(1),
      })
      .strict(),
    schemaVersion: z.literal("lender-portal-machine-proof/v2"),
    sourceTreeSha: sha40Schema,
  })
  .strict();
export const rawVitestExecutionReportSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    deploymentUrl: z.string().url(),
    executionId: z.string().uuid(),
    expectedTotals: z
      .object({
        failed: z.literal(0),
        passed: z.number().int().positive(),
        pending: z.literal(0),
        skipped: z.literal(0),
        suites: z.number().int().positive(),
        tests: z.number().int().positive(),
        todo: z.literal(0),
      })
      .strict(),
    finishedAt: z.string().datetime({ offset: true }),
    invocation: z
      .object({
        argv: z.array(z.string().min(1)).min(3),
        command: z.string().min(1),
        cwd: z.literal("."),
      })
      .strict(),
    nativeReport: z
      .object({
        rawReportBase64: z.string().min(16),
        rawReportSha256: sha256Schema,
      })
      .strict(),
    mappingId: z.string().min(1),
    releaseId: z.string().uuid(),
    runner: z
      .object({
        executableSha256: sha256Schema,
        name: z.literal("vitest"),
        version: z.string().regex(SEMVER_PATTERN),
      })
      .strict(),
    schemaVersion: z.literal("lender-portal-vitest-execution-report/v1"),
    sourceTreeSha: sha40Schema,
    startedAt: z.string().datetime({ offset: true }),
    success: z.literal(true),
    testResults: z
      .array(
        z
          .object({
            assertions: z
              .array(
                z
                  .object({
                    assertionId: z.string().min(8),
                    assertionName: z.string().min(1),
                    durationMs: z.number().nonnegative(),
                    status: z.literal("passed"),
                  })
                  .strict()
              )
              .min(1),
            targetFile: z.string().min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export const nativeVitestJsonReportSchema = z
  .object({
    numFailedTestSuites: z.literal(0),
    numFailedTests: z.number().int().min(0),
    numPassedTestSuites: z.number().int().positive(),
    numPassedTests: z.number().int().min(0),
    numPendingTestSuites: z.literal(0),
    numPendingTests: z.literal(0),
    numTodoTests: z.literal(0),
    numTotalTestSuites: z.number().int().positive(),
    numTotalTests: z.number().int().min(1),
    startTime: z.number().int().nonnegative(),
    success: z.literal(true),
    testResults: z.array(
      z
        .object({
          assertionResults: z.array(
            z
              .object({
                fullName: z.string().min(1),
                status: z.enum([
                  "failed",
                  "passed",
                  "pending",
                  "skipped",
                  "todo",
                ]),
                title: z.string().min(1),
              })
              .passthrough()
          ),
          name: z.string().min(1),
          status: z.enum(["failed", "passed", "pending", "skipped"]),
        })
        .passthrough()
    ),
  })
  .passthrough();
export const operationalArtifactPayloadSchema = z
  .object({
    artifactId: z.string().min(1),
    commitSha: sha40Schema,
    proof: z.record(z.string(), z.unknown()),
    schemaVersion: z.literal("lender-portal-operational-proof/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

export type AcceptanceContract = z.infer<typeof acceptanceContractSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type MachineMapping = z.infer<typeof machineMappingSchema>;
export type MachineProof = z.infer<typeof machineProofSchema>;
export type SignedAttestation = z.infer<typeof signedAttestationSchema>;
export type TestProof = z.infer<typeof testProofSchema>;

export interface LenderPortalReleaseGitState {
  dirtyEntryCount: number;
  headSha: string;
  isClean: boolean;
  treeSha: string;
}

export interface TestOnlyValidationHooks {
  fetchRemote(args: { label: string; url: string }): {
    contents: Buffer;
    effectiveUrl: string;
    redirectChain: string[];
  };
  readGitState(): LenderPortalReleaseGitState;
  readRepositoryFile?(path: string): Buffer;
  trustRoot?: {
    releaseKeys: z.infer<typeof publicKeySchema>[];
    reviewers: z.infer<typeof reviewerPolicySchema>[];
  };
  verifyGithubAttestation?(args: {
    artifactSha256: string;
    candidateSha: string;
    label: string;
    repository: string;
    signerDigest: string;
    signerWorkflow: string;
    sourceRepository: string;
  }): {
    artifactSha256: string;
    builderId: string;
    finishedAt: string;
    invocationId: string;
    sourceDigest: string;
    sourceRepository: string;
    signerDigest: string;
    signerWorkflow: string;
    startedAt: string;
  };
}

// biome-ignore-all lint/suspicious/noBitwiseOperators: POSIX open flags and ZIP CRC validation require bitwise arithmetic.
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  closeSync,
  existsSync,
  constants as fsConstants,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import ts from "typescript";
import { z } from "zod";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";

export const LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH =
  "docs/lender-portal-mvp-execution/production-acceptance-contract.json";

const AUTOMATED_TEST_SCRIPT = "test:lender-portal-production-journeys";
const LINE_SPLIT_PATTERN = /\r?\n/;
const LOCATION_HEADER_PATTERN = /^location:\s*(.+)$/i;
const EXPECTED_SURFACE_IDS = [
  "LP-SURFACE-DASHBOARD",
  "LP-SURFACE-BUILD-DETAIL",
  "LP-SURFACE-MILESTONE-QUEUE",
  "LP-SURFACE-DRAW-QUEUE",
] as const;
const EXPECTED_JOURNEY_IDS = Array.from(
  { length: 10 },
  (_, index) => `LP-E2E-${String(index + 1).padStart(2, "0")}`
);
const EXPECTED_VERTICAL_SLICE_GATE_IDS = Array.from(
  { length: 10 },
  (_, index) => `LP-VSG-${String(index + 1).padStart(2, "0")}`
);
const EXPECTED_OPERATIONAL_GATE_IDS = [
  "authenticated-production-browser",
  "focus-and-status-announcements",
  "responsive-zoom-and-screen-reader",
  "provider-and-webhook-delivery",
  "inbox-and-reauthorized-links",
  "phase3-migration-cutover",
  "exact-release-commit",
] as const;
const PHASE3_CUTOVER_MIGRATIONS = [
  {
    id: "proposal-phase3-lifecycle",
    runner: "migrations:runProposalPhase3LifecycleBackfill",
  },
  {
    id: "workos-user-normalized-email",
    runner: "migrations:runWorkosUserNormalizedEmailBackfill",
  },
] as const;
const PHASE3_CUTOVER_INDEXES = [
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
const CANONICAL_MACHINE_BINDINGS = [
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
const CANONICAL_ROUTE_GRAPH = [
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
    "#/features/production-proposals/ProductionProposalSurfaces.tsx",
    "src/features/production-proposals/ProductionProposalSurfaces.tsx",
    "ProductionProposalReviewSurface",
    ["ProposalReviewRoute", "ProductionProposalReviewSurface"],
    "src/routes/backoffice/proposals.$planId.tsx",
    "ProposalReviewRoute",
    "api.production_proposals.getProposalDetailByString",
  ],
] as const;
const CANONICAL_TEST_BODY_SHA256: Readonly<Record<string, string>> = {
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
const FORBIDDEN_EVIDENCE_SOURCE_PARTS = [
  "production-acceptance-contract",
  "lender-portal-production-acceptance",
] as const;
const GITHUB_RELEASE_ASSET_REDIRECT_PATTERN =
  "^/github-production-release-asset/[0-9]+/[A-Za-z0-9-]+(?:/[A-Za-z0-9._-]+)?$";
const PATH_SEGMENT_SEPARATOR_PATTERN = /[\\/]/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WHITESPACE_CHARACTER_PATTERN = /\s/;
const SHELL_CONTROL_PATTERN = /[;&|><]/;
const WORD_SEPARATOR_PATTERN = /\s+/;
const RAW_URL_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/;
const VIEWPORT_PATTERN = /^\d+x\d+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BIGINT_SUFFIX_PATTERN = /n$/;
const LEADING_DOT_PATTERN = /^\./;
const UNKNOWN_STATIC_VALUE = Symbol("unknown-static-value");

const sha40Schema = z.string().regex(/^[a-f0-9]{40}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const publicKeySchema = z
  .object({
    id: z.string().min(1),
    publicKeyPem: z.string().startsWith("-----BEGIN PUBLIC KEY-----"),
    sha256: sha256Schema,
  })
  .strict();
const reviewerPolicySchema = publicKeySchema
  .extend({
    reviewerDisplayName: z.string().min(3),
    reviewerId: z.string().min(3),
  })
  .strict();

const productionRouteConsumerSchema = z
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
const canonicalApiConsumerSchema = z
  .object({
    class: z.literal("canonical-api"),
    exportName: z.string().min(1),
    id: z.string().min(1),
    sourcePath: z.string().min(1),
  })
  .strict();
const consumerSchema = z.discriminatedUnion("class", [
  productionRouteConsumerSchema,
  canonicalApiConsumerSchema,
]);
const testCommandSchema = z
  .object({
    id: z.string().min(1),
    packageScript: z.literal(AUTOMATED_TEST_SCRIPT),
    runner: z.literal("vitest"),
    runnerExecutableSha256: sha256Schema,
    runnerVersion: z.string().regex(SEMVER_PATTERN),
    targetFiles: z.array(z.string().min(1)).min(1),
  })
  .strict();
const testProofSchema = z
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
const machineMappingSchema = z
  .object({
    consumerIds: z.array(z.string().min(1)).min(1),
    id: z.string().min(1),
    operationalGateIds: z.array(z.string().min(1)).min(1),
    testProofId: z.string().min(1),
  })
  .strict();
const artifactKindSchema = z.enum([
  "machine-test-output",
  "browser-capture",
  "accessibility-report",
  "provider-delivery-report",
  "inbox-link-report",
  "migration-cutover-report",
  "release-artifact",
  "independent-review",
]);
const operationalGateSchema = z
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
const evidencePolicySchema = z
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
const acceptanceContractSchema = z
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

const artifactSchema = z
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
const signatureSchema = z
  .object({
    algorithm: z.literal("ed25519"),
    keyId: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();
const machineProofSchema = z
  .object({
    artifactId: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal("machine-test"),
    result: z.literal("passed"),
    testProofId: z.string().min(1),
  })
  .strict();
const operationalProofSchema = z
  .object({
    artifactId: z.string().min(1),
    id: z.string().min(1),
    kind: z.literal("operational-attestation"),
    result: z.literal("passed"),
  })
  .strict();
const attestationPayloadSchema = z
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
const signedAttestationSchema = z
  .object({ payload: attestationPayloadSchema, signature: signatureSchema })
  .strict();
const machineArtifactPayloadSchema = z
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
const rawVitestExecutionReportSchema = z
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

const nativeVitestJsonReportSchema = z
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
const operationalArtifactPayloadSchema = z
  .object({
    artifactId: z.string().min(1),
    commitSha: sha40Schema,
    proof: z.record(z.string(), z.unknown()),
    schemaVersion: z.literal("lender-portal-operational-proof/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

type AcceptanceContract = z.infer<typeof acceptanceContractSchema>;
type Artifact = z.infer<typeof artifactSchema>;
type MachineMapping = z.infer<typeof machineMappingSchema>;
type MachineProof = z.infer<typeof machineProofSchema>;
type SignedAttestation = z.infer<typeof signedAttestationSchema>;
type TestProof = z.infer<typeof testProofSchema>;

export interface LenderPortalReleaseGitState {
  dirtyEntryCount: number;
  headSha: string;
  isClean: boolean;
  treeSha: string;
}

interface TestOnlyValidationHooks {
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

function fail(message: string): never {
  throw new Error(message);
}

export function resolveLenderPortalRepositoryPath(
  repositoryRoot: string,
  path: string
) {
  if (isAbsolute(path)) {
    fail(`Repository evidence path must be relative: ${path}`);
  }
  if (
    path
      .split(PATH_SEGMENT_SEPARATOR_PATTERN)
      .some((segment) => segment === "..")
  ) {
    fail(`Repository evidence path contains traversal: ${path}`);
  }
  const absoluteRoot = realpathSync(resolve(repositoryRoot));
  const absolutePath = resolve(absoluteRoot, path);
  const relativePath = relative(absoluteRoot, absolutePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    fail(`Repository path escapes or aliases the checkout root: ${path}`);
  }
  const candidateExists = existsSync(absolutePath);
  const realCandidate = realpathSync(
    candidateExists ? absolutePath : dirname(absolutePath)
  );
  const realRelativePath = relative(absoluteRoot, realCandidate);
  if (realRelativePath.startsWith("..") || isAbsolute(realRelativePath)) {
    fail(`Repository path escapes the checkout after realpath: ${path}`);
  }
  return candidateExists ? realCandidate : absolutePath;
}

function readStableFile(path: string) {
  const descriptor = openSync(
    path,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) {
      fail(`Release validation source is not a regular file: ${path}`);
    }
    const contents = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      contents.byteLength !== after.size
    ) {
      fail(`Release validation source changed while open: ${path}`);
    }
    return contents;
  } finally {
    closeSync(descriptor);
  }
}

function readStableRepositoryFile(repositoryRoot: string, path: string) {
  return readStableFile(
    resolveLenderPortalRepositoryPath(repositoryRoot, path)
  );
}

function trustedExecutable(
  name: keyof typeof LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables
) {
  const policy = LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables[name];
  const executablePath = realpathSync(policy.path);
  if (
    executablePath !== policy.path ||
    sha256(readStableFile(executablePath)) !== policy.sha256
  ) {
    fail(`Trusted ${name} executable does not match the immutable trust root`);
  }
  return executablePath;
}

function runGit(repositoryRoot: string, args: string[]) {
  const result = spawnSync(trustedExecutable("git"), args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(
      `Unable to inspect immutable release state with git ${args.join(" ")}: ${result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
}

export function readLenderPortalReleaseGitState(
  repositoryRoot: string
): LenderPortalReleaseGitState {
  const dirtyEntries = runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ])
    .split("\n")
    .filter(Boolean);
  return {
    dirtyEntryCount: dirtyEntries.length,
    headSha: runGit(repositoryRoot, ["rev-parse", "HEAD"]),
    isClean: dirtyEntries.length === 0,
    treeSha: runGit(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
  };
}

function sha256(contents: string | Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}

export function lenderPortalPublicKeyFingerprint(publicKeyPem: string) {
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    fail("Pinned signing key is not a valid canonical public key");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("Pinned signing key must use Ed25519");
  }
  return sha256(publicKey.export({ format: "der", type: "spki" }));
}

export function stableLenderPortalEvidenceJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableLenderPortalEvidenceJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableLenderPortalEvidenceJson(nestedValue)}`
      )
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    fail("Release evidence contains a non-JSON value");
  }
  return serialized;
}

function assertUnique(values: readonly string[], label: string) {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index
  );
  if (duplicates.length > 0) {
    fail(
      `${label} contains duplicate values: ${[...new Set(duplicates)].join(", ")}`
    );
  }
}

function assertExactValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string
) {
  assertUnique(actual, label);
  const missing = expected.filter((value) => !actual.includes(value));
  const foreign = actual.filter((value) => !expected.includes(value));
  if (missing.length > 0 || foreign.length > 0) {
    fail(
      `${label} must match the required values exactly; missing: ${missing.join(", ") || "none"}; foreign: ${foreign.join(", ") || "none"}`
    );
  }
}

function assertSafeProductionSource(path: string, consumerClass: string) {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.includes(".test.") ||
    (consumerClass === "production-route" &&
      normalized.includes("prototype")) ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("docs/") ||
    FORBIDDEN_EVIDENCE_SOURCE_PARTS.some((part) => normalized.includes(part))
  ) {
    fail(
      `${consumerClass} consumer points to forbidden evidence source ${path}`
    );
  }
  if (consumerClass === "production-route" && !normalized.startsWith("src/")) {
    fail(`Production route consumer must resolve inside src/: ${path}`);
  }
  if (consumerClass === "canonical-api" && !normalized.startsWith("convex/")) {
    fail(`Canonical API consumer must resolve inside convex/: ${path}`);
  }
}

function readTypescriptSource(
  repositoryRoot: string,
  path: string,
  consumerClass: "production-route" | "canonical-api"
) {
  assertSafeProductionSource(path, consumerClass);
  const absolutePath = resolveLenderPortalRepositoryPath(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    fail(`Missing production source ${path}`);
  }
  return ts.createSourceFile(
    path,
    readStableFile(absolutePath).toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function readTypescriptTestSource(repositoryRoot: string, path: string) {
  const absolutePath = resolveLenderPortalRepositoryPath(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    fail(`Missing executable test target ${path}`);
  }
  return ts.createSourceFile(
    path,
    readStableFile(absolutePath).toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function parseTypescriptSource(path: string, contents: string) {
  return ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function hasExportedSymbol(source: ts.SourceFile, name: string) {
  return source.statements.some((statement) => {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) {
      return false;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return true;
    }
    return (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name
      )
    );
  });
}

function resolveImportedProductionModule(args: {
  importModule: string;
  repositoryRoot: string;
  routeSource: string;
}) {
  let logicalPath: string;
  if (args.importModule.startsWith("#/")) {
    logicalPath = `src/${args.importModule.slice(2)}`;
  } else if (args.importModule.startsWith(".")) {
    logicalPath = join(dirname(args.routeSource), args.importModule);
  } else {
    fail(
      `Production route import must resolve to a repository module: ${args.importModule}`
    );
  }
  const candidates = extname(logicalPath)
    ? [logicalPath]
    : [
        `${logicalPath}.tsx`,
        `${logicalPath}.ts`,
        `${logicalPath}.js`,
        `${logicalPath}.d.ts`,
        join(logicalPath, "index.tsx"),
        join(logicalPath, "index.ts"),
      ];
  for (const candidate of candidates) {
    const absoluteCandidate = resolve(args.repositoryRoot, candidate);
    if (existsSync(absoluteCandidate)) {
      return resolveLenderPortalRepositoryPath(args.repositoryRoot, candidate);
    }
  }
  fail(`Production route import does not resolve: ${args.importModule}`);
}

function unaliasedNamedImport(
  source: ts.SourceFile,
  moduleName: string,
  symbolName: string
) {
  return source.statements.some((statement) => {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      !!bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => !element.propertyName && element.name.text === symbolName
      )
    );
  });
}

function importBinding(
  source: ts.SourceFile,
  localName: string
): { importedName: string; moduleName: string } | undefined {
  const bindings: Array<{ importedName: string; moduleName: string }> = [];
  for (const statement of source.statements) {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      )
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!(namedBindings && ts.isNamedImports(namedBindings))) {
      continue;
    }
    for (const element of namedBindings.elements) {
      if (element.name.text === localName) {
        bindings.push({
          importedName: element.propertyName?.text ?? element.name.text,
          moduleName: statement.moduleSpecifier.text,
        });
      }
    }
  }
  if (bindings.length > 1) {
    fail(`Imported binding ${localName} is ambiguous`);
  }
  return bindings[0];
}

function namedFunctionBody(source: ts.SourceFile, name: string) {
  const bodies: ts.ConciseBody[] = [];
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      statement.body
    ) {
      bodies.push(statement.body);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          bodies.push(declaration.initializer.body);
        }
      }
    }
  }
  if (bodies.length > 1) {
    fail(`Function binding ${name} is ambiguous`);
  }
  return bodies[0];
}

function routeComponentName(source: ts.SourceFile, routerPath: string) {
  const routeFactory = importBinding(source, "createFileRoute");
  if (
    routeFactory?.moduleName !== "@tanstack/react-router" ||
    routeFactory.importedName !== "createFileRoute"
  ) {
    fail("createFileRoute must resolve to the direct TanStack Router binding");
  }
  const routeCalls: ts.CallExpression[] = [];
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "createFileRoute"
    ) {
      routeCalls.push(node);
    }
  });
  if (routeCalls.length !== 1) {
    fail(
      "Production route source must contain exactly one createFileRoute registration"
    );
  }
  const routeDeclaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.declarationList.declarations.map((declaration) => ({
        declaration,
        exported:
          ts
            .getModifiers(statement)
            ?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
            ) ?? false,
      }))
    )
    .find(
      ({ declaration, exported }) =>
        exported &&
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "Route" &&
        declaration.initializer === routeCalls[0]
    );
  const routeCall = routeDeclaration?.declaration.initializer;
  if (!(routeCall && ts.isCallExpression(routeCall))) {
    fail("Production Route export does not own the unique route registration");
  }
  const factoryCall = routeCall.expression;
  if (
    !(
      ts.isCallExpression(factoryCall) &&
      factoryCall.arguments[0] &&
      ts.isStringLiteral(factoryCall.arguments[0])
    ) ||
    factoryCall.arguments[0].text !== routerPath ||
    !routeCall.arguments[0] ||
    !ts.isObjectLiteralExpression(routeCall.arguments[0])
  ) {
    fail(`Production Route export is not registered at ${routerPath}`);
  }
  const componentProperties = routeCall.arguments[0].properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(source) === "component"
  );
  if (
    componentProperties.length !== 1 ||
    !ts.isIdentifier(componentProperties[0]?.initializer)
  ) {
    fail("Production Route component binding is missing or ambiguous");
  }
  return componentProperties[0].initializer.text;
}

type StaticPrimitive = bigint | boolean | null | number | string | undefined;
type StaticExpressionValue = StaticPrimitive | typeof UNKNOWN_STATIC_VALUE;

function isKnownStaticValue(
  value: StaticExpressionValue
): value is StaticPrimitive {
  return value !== UNKNOWN_STATIC_VALUE;
}

function staticLooseEquality(left: StaticPrimitive, right: StaticPrimitive) {
  if (
    (left === null && right === undefined) ||
    (left === undefined && right === null)
  ) {
    return true;
  }
  if (typeof left === typeof right) {
    return left === right;
  }
  if (typeof left === "boolean") {
    return staticLooseEquality(Number(left), right);
  }
  if (typeof right === "boolean") {
    return staticLooseEquality(left, Number(right));
  }
  if (typeof left === "number" && typeof right === "string") {
    return left === Number(right);
  }
  if (typeof left === "string" && typeof right === "number") {
    return Number(left) === right;
  }
  if (typeof left === "bigint" && typeof right === "string") {
    try {
      return left === BigInt(right);
    } catch {
      return false;
    }
  }
  if (typeof left === "string" && typeof right === "bigint") {
    try {
      return BigInt(left) === right;
    } catch {
      return false;
    }
  }
  return false;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Static comparisons deliberately model only the primitive constant subset needed for fail-closed reachability.
function staticRelationalComparison(
  left: StaticPrimitive,
  operator: ts.SyntaxKind,
  right: StaticPrimitive
): boolean | undefined {
  let comparison: number | undefined;
  if (typeof left === "number" && typeof right === "number") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === "string" && typeof right === "string") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === "bigint" && typeof right === "bigint") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  }
  if (comparison === undefined) {
    return;
  }
  if (operator === ts.SyntaxKind.LessThanToken) {
    return comparison < 0;
  }
  if (operator === ts.SyntaxKind.LessThanEqualsToken) {
    return comparison <= 0;
  }
  if (operator === ts.SyntaxKind.GreaterThanToken) {
    return comparison > 0;
  }
  return comparison >= 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a deliberately explicit, side-effect-free evaluator for the supported static expression subset.
function staticExpressionValue(
  expression: ts.Expression
): StaticExpressionValue {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return staticExpressionValue(expression.expression);
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }
  if (ts.isBigIntLiteral(expression)) {
    return BigInt(
      expression.text.replaceAll("_", "").replace(BIGINT_SUFFIX_PATTERN, "")
    );
  }
  if (ts.isVoidExpression(expression)) {
    return;
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = staticExpressionValue(expression.operand);
    if (!isKnownStaticValue(operand)) {
      return UNKNOWN_STATIC_VALUE;
    }
    if (expression.operator === ts.SyntaxKind.ExclamationToken) {
      return !operand;
    }
    if (expression.operator === ts.SyntaxKind.PlusToken) {
      return typeof operand === "bigint"
        ? UNKNOWN_STATIC_VALUE
        : Number(operand);
    }
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      if (typeof operand === "bigint") {
        return -operand;
      }
      return Number.isNaN(Number(operand))
        ? UNKNOWN_STATIC_VALUE
        : -Number(operand);
    }
  }
  if (ts.isConditionalExpression(expression)) {
    const condition = staticExpressionTruthiness(expression.condition);
    if (condition === true) {
      return staticExpressionValue(expression.whenTrue);
    }
    if (condition === false) {
      return staticExpressionValue(expression.whenFalse);
    }
    return UNKNOWN_STATIC_VALUE;
  }
  if (ts.isBinaryExpression(expression)) {
    const left = staticExpressionValue(expression.left);
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (!isKnownStaticValue(left)) {
        return UNKNOWN_STATIC_VALUE;
      }
      return left ? staticExpressionValue(expression.right) : left;
    }
    if (operator === ts.SyntaxKind.BarBarToken) {
      if (!isKnownStaticValue(left)) {
        return UNKNOWN_STATIC_VALUE;
      }
      return left ? left : staticExpressionValue(expression.right);
    }
    if (operator === ts.SyntaxKind.QuestionQuestionToken) {
      return isKnownStaticValue(left) && left !== null && left !== undefined
        ? left
        : isKnownStaticValue(left)
          ? staticExpressionValue(expression.right)
          : UNKNOWN_STATIC_VALUE;
    }
    const right = staticExpressionValue(expression.right);
    if (!(isKnownStaticValue(left) && isKnownStaticValue(right))) {
      return UNKNOWN_STATIC_VALUE;
    }
    if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      return left === right;
    }
    if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      return left !== right;
    }
    if (operator === ts.SyntaxKind.EqualsEqualsToken) {
      return staticLooseEquality(left, right);
    }
    if (operator === ts.SyntaxKind.ExclamationEqualsToken) {
      return !staticLooseEquality(left, right);
    }
    if (
      operator === ts.SyntaxKind.LessThanToken ||
      operator === ts.SyntaxKind.LessThanEqualsToken ||
      operator === ts.SyntaxKind.GreaterThanToken ||
      operator === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      return (
        staticRelationalComparison(left, operator, right) ??
        UNKNOWN_STATIC_VALUE
      );
    }
  }
  return UNKNOWN_STATIC_VALUE;
}

function staticExpressionTruthiness(
  expression: ts.Expression
): boolean | undefined {
  const value = staticExpressionValue(expression);
  return isKnownStaticValue(value) ? Boolean(value) : undefined;
}

interface ReachabilityOutcome {
  breaks: boolean;
  continues: boolean;
  normal: boolean;
  returns: boolean;
  stops: boolean;
  throws: boolean;
}

const NORMAL_REACHABILITY: ReachabilityOutcome = {
  breaks: false,
  continues: false,
  normal: true,
  returns: false,
  stops: false,
  throws: false,
};

function abruptReachability(
  kind: Exclude<keyof ReachabilityOutcome, "normal">
): ReachabilityOutcome {
  return { ...NORMAL_REACHABILITY, [kind]: true, normal: false };
}

function combineReachability(
  ...outcomes: ReachabilityOutcome[]
): ReachabilityOutcome {
  return outcomes.reduce(
    (combined, outcome) => ({
      breaks: combined.breaks || outcome.breaks,
      continues: combined.continues || outcome.continues,
      normal: combined.normal || outcome.normal,
      returns: combined.returns || outcome.returns,
      stops: combined.stops || outcome.stops,
      throws: combined.throws || outcome.throws,
    }),
    {
      breaks: false,
      continues: false,
      normal: false,
      returns: false,
      stops: false,
      throws: false,
    }
  );
}

function sequenceReachability(
  before: ReachabilityOutcome,
  after: ReachabilityOutcome
): ReachabilityOutcome {
  return {
    breaks: before.breaks || (before.normal && after.breaks),
    continues: before.continues || (before.normal && after.continues),
    normal: before.normal && after.normal,
    returns: before.returns || (before.normal && after.returns),
    stops: before.stops || (before.normal && after.stops),
    throws: before.throws || (before.normal && after.throws),
  };
}

function consumeBreaks(outcome: ReachabilityOutcome): ReachabilityOutcome {
  return {
    ...outcome,
    breaks: false,
    normal: outcome.normal || outcome.breaks,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reachability must propagate all possible normal and abrupt completions across JavaScript control-flow constructs in one fail-closed traversal contract.
function walkReachableNode(
  node: ts.Node,
  visit: (node: ts.Node) => void,
  root = true
): ReachabilityOutcome {
  visit(node);
  if (!root && ts.isFunctionLike(node)) {
    return NORMAL_REACHABILITY;
  }
  if (ts.isBlock(node)) {
    let outcome = NORMAL_REACHABILITY;
    for (const statement of node.statements) {
      if (!outcome.normal) {
        break;
      }
      outcome = sequenceReachability(
        outcome,
        walkReachableNode(statement, visit, false)
      );
    }
    return outcome;
  }
  if (ts.isReturnStatement(node)) {
    if (node.expression) {
      walkReachableNode(node.expression, visit, false);
    }
    return abruptReachability("returns");
  }
  if (ts.isThrowStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    return abruptReachability("throws");
  }
  if (ts.isBreakStatement(node)) {
    return abruptReachability("breaks");
  }
  if (ts.isContinueStatement(node)) {
    return abruptReachability("continues");
  }
  if (ts.isIfStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    if (conditionTruthiness === false) {
      return node.elseStatement
        ? walkReachableNode(node.elseStatement, visit, false)
        : NORMAL_REACHABILITY;
    }
    if (conditionTruthiness === true) {
      return walkReachableNode(node.thenStatement, visit, false);
    }
    const thenOutcome = walkReachableNode(node.thenStatement, visit, false);
    const elseOutcome = node.elseStatement
      ? walkReachableNode(node.elseStatement, visit, false)
      : NORMAL_REACHABILITY;
    return combineReachability(thenOutcome, elseOutcome);
  }
  if (ts.isConditionalExpression(node)) {
    walkReachableNode(node.condition, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.condition);
    if (conditionTruthiness === false) {
      return walkReachableNode(node.whenFalse, visit, false);
    }
    if (conditionTruthiness === true) {
      return walkReachableNode(node.whenTrue, visit, false);
    }
    walkReachableNode(node.whenTrue, visit, false);
    walkReachableNode(node.whenFalse, visit, false);
    return NORMAL_REACHABILITY;
  }
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    walkReachableNode(node.left, visit, false);
    const leftValue = staticExpressionValue(node.left);
    const leftTruthiness = isKnownStaticValue(leftValue)
      ? Boolean(leftValue)
      : undefined;
    const skipsRight =
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        leftTruthiness === false) ||
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
        leftTruthiness === true) ||
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        isKnownStaticValue(leftValue) &&
        leftValue !== null &&
        leftValue !== undefined);
    if (!skipsRight) {
      walkReachableNode(node.right, visit, false);
    }
    return NORMAL_REACHABILITY;
  }
  if (ts.isWhileStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    if (conditionTruthiness === false) {
      return NORMAL_REACHABILITY;
    }
    const body = walkReachableNode(node.statement, visit, false);
    return {
      breaks: false,
      continues: false,
      normal: conditionTruthiness !== true || body.breaks,
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness === true),
      throws: body.throws,
    };
  }
  if (ts.isForStatement(node)) {
    if (node.initializer) {
      walkReachableNode(node.initializer, visit, false);
    }
    if (node.condition) {
      walkReachableNode(node.condition, visit, false);
    }
    if (
      node.condition &&
      staticExpressionTruthiness(node.condition) === false
    ) {
      return NORMAL_REACHABILITY;
    }
    const body = walkReachableNode(node.statement, visit, false);
    if (node.incrementor && (body.normal || body.continues)) {
      walkReachableNode(node.incrementor, visit, false);
    }
    const conditionTruthiness = node.condition
      ? staticExpressionTruthiness(node.condition)
      : true;
    return {
      breaks: false,
      continues: false,
      normal: conditionTruthiness !== true || body.breaks,
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness !== false),
      throws: body.throws,
    };
  }
  if (ts.isDoStatement(node)) {
    const body = walkReachableNode(node.statement, visit, false);
    if (body.normal || body.continues) {
      walkReachableNode(node.expression, visit, false);
    }
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    return {
      breaks: false,
      continues: false,
      normal:
        body.breaks ||
        ((body.normal || body.continues) && conditionTruthiness !== true),
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness === true),
      throws: body.throws,
    };
  }
  if (ts.isSwitchStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const discriminant = staticExpressionValue(node.expression);
    const clauses = [...node.caseBlock.clauses];
    const possibleStarts: number[] = [];
    let defaultIndex: number | undefined;
    let knownMatchFound = false;
    for (const [index, clause] of clauses.entries()) {
      if (ts.isDefaultClause(clause)) {
        defaultIndex = index;
        continue;
      }
      if (knownMatchFound) {
        continue;
      }
      walkReachableNode(clause.expression, visit, false);
      const caseValue = staticExpressionValue(clause.expression);
      if (
        !(isKnownStaticValue(discriminant) && isKnownStaticValue(caseValue))
      ) {
        possibleStarts.push(index);
      } else if (discriminant === caseValue) {
        possibleStarts.push(index);
        knownMatchFound = true;
      }
    }
    if (!knownMatchFound && defaultIndex !== undefined) {
      possibleStarts.push(defaultIndex);
    }
    const executeFrom = (start: number) => {
      let outcome = NORMAL_REACHABILITY;
      for (
        let index = start;
        index < clauses.length && outcome.normal;
        index += 1
      ) {
        const clause = clauses[index];
        if (!clause) {
          break;
        }
        for (const statement of clause.statements) {
          if (!outcome.normal) {
            break;
          }
          outcome = sequenceReachability(
            outcome,
            walkReachableNode(statement, visit, false)
          );
        }
      }
      return consumeBreaks(outcome);
    };
    const outcomes = [...new Set(possibleStarts)].map(executeFrom);
    if (!knownMatchFound && defaultIndex === undefined) {
      outcomes.push(NORMAL_REACHABILITY);
    }
    return outcomes.length > 0
      ? combineReachability(...outcomes)
      : NORMAL_REACHABILITY;
  }
  if (ts.isTryStatement(node)) {
    const tryOutcome = walkReachableNode(node.tryBlock, visit, false);
    let outcome = tryOutcome;
    if (node.catchClause && tryOutcome.throws) {
      const catchOutcome = walkReachableNode(
        node.catchClause.block,
        visit,
        false
      );
      outcome = combineReachability(
        { ...tryOutcome, throws: false },
        catchOutcome
      );
    }
    if (node.finallyBlock) {
      const finallyOutcome = walkReachableNode(node.finallyBlock, visit, false);
      const abruptFinally = { ...finallyOutcome, normal: false };
      outcome = finallyOutcome.normal
        ? combineReachability(outcome, abruptFinally)
        : abruptFinally;
    }
    return outcome;
  }
  node.forEachChild((child) => {
    walkReachableNode(child, visit, false);
  });
  return NORMAL_REACHABILITY;
}

function walkReachable(
  node: ts.Node,
  visit: (node: ts.Node) => void,
  root = true
) {
  walkReachableNode(node, visit, root);
}

function reachableReturnExpressions(body: ts.Node) {
  if (!ts.isBlock(body)) {
    return [body];
  }
  const expressions: ts.Expression[] = [];
  walkReachable(body, (node) => {
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
    }
  });
  return expressions;
}

function expressionRenders(expression: ts.Node, symbolName: string) {
  let rendered = false;
  walkReachable(expression, (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === symbolName
    ) {
      rendered = true;
    }
  });
  return rendered;
}

function bodyReturnsRenderedSymbol(body: ts.Node, symbolName: string) {
  return reachableReturnExpressions(body).some((expression) =>
    expressionRenders(expression, symbolName)
  );
}

function bodyShadowsIdentifier(body: ts.Node, name: string) {
  let shadowed = false;
  walkReachable(body, (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      shadowed = true;
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === name
    ) {
      shadowed = true;
    }
  });
  return shadowed;
}

function validateCanonicalQueryCall(args: {
  consumer: z.infer<typeof productionRouteConsumerSchema>;
  querySource: ts.SourceFile;
  repositoryRoot: string;
}) {
  const body = namedFunctionBody(
    args.querySource,
    args.consumer.queryOwnerFunction
  );
  if (!body) {
    fail(
      `${args.consumer.id}: query owner function ${args.consumer.queryOwnerFunction} is unavailable`
    );
  }
  const apiBinding = importBinding(args.querySource, "api");
  if (!apiBinding || apiBinding.importedName !== "api") {
    fail(`${args.consumer.id}: canonical api import is missing or aliased`);
  }
  const resolvedApiModule = resolveImportedProductionModule({
    importModule: apiBinding.moduleName,
    repositoryRoot: args.repositoryRoot,
    routeSource: args.consumer.queryOwnerSource,
  });
  const generatedApiModule = resolveLenderPortalRepositoryPath(
    args.repositoryRoot,
    "convex/_generated/api.js"
  );
  if (resolvedApiModule !== generatedApiModule) {
    fail(
      `${args.consumer.id}: api import does not resolve to generated Convex API`
    );
  }
  const queryHooks = ["usePaginatedQuery", "useQuery"].filter((hook) => {
    const binding = importBinding(args.querySource, hook);
    return (
      binding?.moduleName === "convex/react" && binding.importedName === hook
    );
  });
  if (
    bodyShadowsIdentifier(body, "api") ||
    queryHooks.some((hook) => bodyShadowsIdentifier(body, hook))
  ) {
    fail(`${args.consumer.id}: canonical query bindings are locally shadowed`);
  }
  const expectedQuerySegments = args.consumer.queryOwner.split(".");
  const queryExpressionMatches = (node: ts.Expression): boolean => {
    const segments: string[] = [];
    let current: ts.Expression = node;
    while (ts.isPropertyAccessExpression(current)) {
      segments.unshift(current.name.text);
      current = current.expression;
    }
    return (
      ts.isIdentifier(current) &&
      current.text === "api" &&
      stableLenderPortalEvidenceJson(["api", ...segments]) ===
        stableLenderPortalEvidenceJson(expectedQuerySegments)
    );
  };
  let resolved = false;
  walkReachable(body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      queryHooks.includes(node.expression.text) &&
      node.arguments[0] &&
      queryExpressionMatches(node.arguments[0])
    ) {
      resolved = true;
    }
  });
  if (!resolved) {
    fail(
      `${args.consumer.id}: canonical query owner is not called by its declared production function`
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Route certification intentionally validates each binding and reachability boundary in one fail-closed path.
function validateProductionRouteConsumer(
  repositoryRoot: string,
  consumer: z.infer<typeof productionRouteConsumerSchema>,
  sourceOverrides?: {
    componentSource?: string;
    querySource?: string;
    routeSource?: string;
  }
) {
  const routeSource = sourceOverrides?.routeSource
    ? parseTypescriptSource(consumer.routeSource, sourceOverrides.routeSource)
    : readTypescriptSource(
        repositoryRoot,
        consumer.routeSource,
        "production-route"
      );
  const componentSource = sourceOverrides?.componentSource
    ? parseTypescriptSource(
        consumer.componentSource,
        sourceOverrides.componentSource
      )
    : readTypescriptSource(
        repositoryRoot,
        consumer.componentSource,
        "production-route"
      );
  const querySource = sourceOverrides?.querySource
    ? parseTypescriptSource(
        consumer.queryOwnerSource,
        sourceOverrides.querySource
      )
    : readTypescriptSource(
        repositoryRoot,
        consumer.queryOwnerSource,
        "production-route"
      );
  const importedComponentPath = resolveImportedProductionModule({
    importModule: consumer.importModule,
    repositoryRoot,
    routeSource: consumer.routeSource,
  });
  const declaredComponentPath = resolveLenderPortalRepositoryPath(
    repositoryRoot,
    consumer.componentSource
  );
  if (importedComponentPath !== declaredComponentPath) {
    fail(
      `${consumer.id}: componentSource does not resolve to the rendered route import`
    );
  }
  const expectedQueryOwnerSource =
    consumer.queryOwnerLocation === "route"
      ? consumer.routeSource
      : consumer.componentSource;
  if (consumer.queryOwnerSource !== expectedQueryOwnerSource) {
    fail(
      `${consumer.id}: queryOwnerSource must be the actual rendered component or route owner`
    );
  }
  if (
    (consumer.queryOwnerLocation === "route" &&
      !consumer.renderPath.includes(consumer.queryOwnerFunction)) ||
    (consumer.queryOwnerLocation === "component" &&
      consumer.queryOwnerFunction !== consumer.componentExport)
  ) {
    fail(`${consumer.id}: query owner function is outside the render path`);
  }
  if (
    !unaliasedNamedImport(
      routeSource,
      "@tanstack/react-router",
      "createFileRoute"
    )
  ) {
    fail(`${consumer.id}: createFileRoute import is missing or aliased`);
  }
  const entryComponent = routeComponentName(routeSource, consumer.routerPath);
  if (!entryComponent) {
    fail(
      `${consumer.id}: production route is not registered at ${consumer.routerPath}`
    );
  }
  if (consumer.renderPath[0] !== entryComponent) {
    fail(
      `${consumer.id}: route component does not match its trusted render path`
    );
  }
  const componentImport = importBinding(routeSource, consumer.componentExport);
  if (
    consumer.renderPath.at(-1) !== consumer.componentExport ||
    !componentImport ||
    componentImport.importedName !== consumer.componentExport ||
    componentImport.moduleName !== consumer.importModule
  ) {
    fail(`${consumer.id}: production component import is missing or aliased`);
  }
  for (let index = 0; index < consumer.renderPath.length - 1; index += 1) {
    const ownerName = consumer.renderPath[index];
    const renderedName = consumer.renderPath[index + 1];
    if (!(ownerName && renderedName)) {
      fail(`${consumer.id}: trusted render path is malformed`);
    }
    const ownerBody = namedFunctionBody(routeSource, ownerName);
    if (
      !ownerBody ||
      bodyShadowsIdentifier(ownerBody, renderedName) ||
      !bodyReturnsRenderedSymbol(ownerBody, renderedName)
    ) {
      fail(
        `${consumer.id}: trusted render edge ${ownerName} -> ${renderedName} is absent`
      );
    }
  }
  if (!hasExportedSymbol(componentSource, consumer.componentExport)) {
    fail(
      `${consumer.id}: component export ${consumer.componentExport} is unavailable`
    );
  }
  validateCanonicalQueryCall({ consumer, querySource, repositoryRoot });
}

export function validateLenderPortalProductionRouteConsumerSourceFixture(args: {
  consumerValue: unknown;
  repositoryRoot: string;
  sourceOverrides: {
    componentSource?: string;
    querySource?: string;
    routeSource?: string;
  };
}) {
  validateProductionRouteConsumer(
    args.repositoryRoot,
    productionRouteConsumerSchema.parse(args.consumerValue),
    args.sourceOverrides
  );
}

function validateCanonicalApiConsumer(
  repositoryRoot: string,
  consumer: z.infer<typeof canonicalApiConsumerSchema>
) {
  const source = readTypescriptSource(
    repositoryRoot,
    consumer.sourcePath,
    "canonical-api"
  );
  if (!hasExportedSymbol(source, consumer.exportName)) {
    fail(
      `${consumer.id}: canonical API export ${consumer.exportName} is unavailable`
    );
  }
}

function tokenizeCommand(command: string) {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  for (const character of command) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        token += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (WHITESPACE_CHARACTER_PATTERN.test(character)) {
      if (token) {
        tokens.push(token);
      }
      token = "";
    } else {
      token += character;
    }
  }
  if (quote) {
    fail("Registered production test command contains an unterminated quote");
  }
  if (token) {
    tokens.push(token);
  }
  return tokens;
}

function collectTestAssertions(source: ts.SourceFile) {
  const assertions = new Map<
    string,
    Array<{ bodySha256: string; expectCalls: number }>
  >();
  const directVitestImports = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "vitest" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const specifier of statement.importClause.namedBindings.elements) {
        const importedName =
          specifier.propertyName?.text ?? specifier.name.text;
        if (importedName === specifier.name.text) {
          directVitestImports.add(importedName);
        }
      }
    }
  }
  const scopeDeclarations = (statements: readonly ts.Statement[]) => {
    const names = new Set<string>();
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            names.add(declaration.name.text);
          }
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        names.add(statement.name.text);
      }
    }
    return names;
  };
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Registration validation keeps scope, direct Vitest bindings, and executable body collection together to reject nested shadow decoys.
  const collectScope = (statements: readonly ts.Statement[]) => {
    const declarations = scopeDeclarations(statements);
    for (const statement of statements) {
      if (
        !(
          ts.isExpressionStatement(statement) &&
          ts.isCallExpression(statement.expression) &&
          ts.isIdentifier(statement.expression.expression)
        )
      ) {
        continue;
      }
      const registrationName = statement.expression.expression.text;
      const call = statement.expression;
      const callback = call.arguments[1];
      if (
        (registrationName === "describe" || registrationName === "suite") &&
        directVitestImports.has(registrationName) &&
        !declarations.has(registrationName) &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        ts.isBlock(callback.body)
      ) {
        collectScope(callback.body.statements);
        continue;
      }
      if (
        (registrationName !== "test" && registrationName !== "it") ||
        !directVitestImports.has(registrationName) ||
        declarations.has(registrationName) ||
        !call.arguments[0] ||
        !ts.isStringLiteral(call.arguments[0]) ||
        !callback ||
        !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        continue;
      }
      const body = callback.body;
      let expectCalls = 0;
      if (
        directVitestImports.has("expect") &&
        !bodyShadowsIdentifier(body, "expect")
      ) {
        walkReachable(body, (candidate) => {
          if (
            ts.isCallExpression(candidate) &&
            ts.isIdentifier(candidate.expression) &&
            candidate.expression.text === "expect"
          ) {
            expectCalls += 1;
          }
        });
      }
      const entries = assertions.get(call.arguments[0].text) ?? [];
      entries.push({
        bodySha256: sha256(body.getText(source)),
        expectCalls,
      });
      assertions.set(call.arguments[0].text, entries);
    }
  };
  collectScope(source.statements);
  return assertions;
}

function validateRegisteredAssertionSource(
  source: ts.SourceFile,
  proofId: string,
  assertionName: string
) {
  const matchedAssertions =
    collectTestAssertions(source).get(assertionName) ?? [];
  const expectedBodySha256 = CANONICAL_TEST_BODY_SHA256[proofId];
  if (
    matchedAssertions.length !== 1 ||
    !expectedBodySha256 ||
    matchedAssertions[0]?.bodySha256 !== expectedBodySha256 ||
    matchedAssertions[0].expectCalls === 0
  ) {
    fail(
      `${proofId} assertion does not uniquely match its trusted executable body and observable route behavior`
    );
  }
}

export function validateLenderPortalRegisteredAssertionSourceFixture(args: {
  assertionName: string;
  proofId: string;
  sourceText: string;
}) {
  validateRegisteredAssertionSource(
    parseTypescriptSource("fixture.test.tsx", args.sourceText),
    args.proofId,
    args.assertionName
  );
}

// The branches correspond to separate fail-closed registry invariants.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keeping them together prevents partial command/proof validation.
function validateTestRegistry(
  repositoryRoot: string,
  contract: AcceptanceContract,
  consumers: Map<string, AcceptanceContract["consumers"][number]>
) {
  const packageJson = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        readStableRepositoryFile(repositoryRoot, "package.json").toString(
          "utf8"
        )
      )
    );
  const commands = new Map(
    contract.testCommands.map((command) => [command.id, command])
  );
  const vitestPackage = z
    .object({ version: z.string().regex(SEMVER_PATTERN) })
    .parse(
      JSON.parse(
        readStableRepositoryFile(
          repositoryRoot,
          "node_modules/vitest/package.json"
        ).toString("utf8")
      )
    );
  const vitestExecutable = readStableRepositoryFile(
    repositoryRoot,
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.executablePath
  );
  for (const command of contract.testCommands) {
    assertUnique(command.targetFiles, `${command.id} target files`);
    const registered = packageJson.scripts[command.packageScript];
    if (!registered) {
      fail(`Missing registered test command ${command.packageScript}`);
    }
    const tokens = tokenizeCommand(registered);
    if (tokens[0] !== "vitest" || tokens[1] !== "run") {
      fail(`${command.id} must resolve to the exact vitest run entry point`);
    }
    if (tokens.some((token) => SHELL_CONTROL_PATTERN.test(token))) {
      fail(`${command.id} contains unsupported shell control syntax`);
    }
    if (
      command.runnerVersion !== vitestPackage.version ||
      command.runnerVersion !==
        LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.version ||
      command.runnerExecutableSha256 !== sha256(vitestExecutable) ||
      command.runnerExecutableSha256 !==
        LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.executableSha256
    ) {
      fail(`${command.id} does not pin the installed Vitest runner identity`);
    }
    assertExactValues(
      tokens.slice(2),
      command.targetFiles,
      `${command.id} executable targets`
    );
  }
  for (const proof of contract.testProofs) {
    const command = commands.get(proof.commandId);
    if (!command) {
      fail(`${proof.id} maps to unknown test command ${proof.commandId}`);
    }
    if (!command.targetFiles.includes(proof.targetFile)) {
      fail(`${proof.id} target is not registered by ${proof.commandId}`);
    }
    if (
      proof.observableResult.trim().split(WORD_SEPARATOR_PATTERN).length < 4
    ) {
      fail(`${proof.id} observable result is generic-only`);
    }
    if (!proof.targetFile.includes(".test.")) {
      fail(`${proof.id} does not resolve to an executable test target`);
    }
    validateRegisteredAssertionSource(
      readTypescriptTestSource(repositoryRoot, proof.targetFile),
      proof.id,
      proof.assertionName
    );
    assertUnique(proof.consumerIds, `${proof.id} consumer IDs`);
    const proofConsumers = proof.consumerIds.map((id) => {
      const consumer = consumers.get(id);
      if (!consumer) {
        fail(`${proof.id} maps to unknown production consumer ${id}`);
      }
      return consumer;
    });
    if (
      proof.proofClass === "production-route" &&
      !proofConsumers.some((consumer) => consumer.class === "production-route")
    ) {
      fail(
        `${proof.id} is backend-only and lacks a supported production route consumer`
      );
    }
    if (
      proof.proofClass === "production-route" &&
      !proofConsumers.some(
        (consumer) =>
          consumer.class === "production-route" &&
          consumer.testTargets.includes(proof.targetFile)
      )
    ) {
      fail(
        `${proof.id} test target is not registered to its supported production route consumer`
      );
    }
  }
}

function allMachineMappings(contract: AcceptanceContract) {
  return [
    ...contract.surfaces,
    ...contract.journeys,
    ...contract.verticalSliceGates,
  ];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One fail-closed trust-root audit intentionally validates every signer, provider tenant, principal, executable, workflow, and redirect policy together.
function validateTrustedPolicies(contract: AcceptanceContract) {
  const root = LENDER_PORTAL_PRODUCTION_TRUST_ROOT;
  assertExactValues(
    root.productionEvidencePrincipals.map((principal) => principal.role),
    ["backoffice", "builder", "lender-admin"],
    "Source-owned production evidence principal roles"
  );
  for (const field of [
    "assignmentIdentityHash",
    "organizationIdHash",
    "recipientHash",
    "roleHash",
    "subjectIdHash",
  ] as const) {
    const values = root.productionEvidencePrincipals.map(
      (principal) => principal[field]
    );
    if (values.some((value) => !sha256Schema.safeParse(value).success)) {
      fail(`Source-owned production evidence principal ${field} is invalid`);
    }
    assertUnique(values, `Source-owned production evidence principal ${field}`);
  }
  for (const provider of ["Resend", "WorkOS"] as const) {
    const tenantHashes = root.productionEvidencePrincipals.map(
      (principal) => principal.providerTenantIdHashes[provider]
    );
    if (tenantHashes.some((value) => !sha256Schema.safeParse(value).success)) {
      fail(`Source-owned ${provider} tenant identity is invalid`);
    }
    if (new Set(tenantHashes).size !== 1) {
      fail(
        `Source-owned ${provider} tenant identity is inconsistent across production evidence principals`
      );
    }
  }
  if (
    root.authKit.sessionCookieName !== "wos-session" ||
    root.authKit.sessionCookieDomain !== "drawflow.fairlend.ca"
  ) {
    fail("Source-owned AuthKit session cookie policy is invalid");
  }
  const workflow = root.github.allowedWorkflows[0];
  const expectedRepository = root.github.repository;
  const expectedWorkflowPrefix = `github.com/${expectedRepository}/.github/workflows/`;
  const contractPolicy = contract.evidencePolicy.githubAttestation;
  if (
    contractPolicy.repository !== expectedRepository ||
    contractPolicy.sourceRepository !== expectedRepository ||
    contractPolicy.oidcIssuer !== root.github.oidcIssuer ||
    contractPolicy.signerDigest !== workflow.signerDigest ||
    contractPolicy.signerWorkflow !== workflow.signerWorkflow ||
    !contractPolicy.signerWorkflow.startsWith(expectedWorkflowPrefix) ||
    !contractPolicy.signerWorkflow.endsWith(".yml")
  ) {
    fail(
      "GitHub Actions attestation claims do not match the immutable trust root"
    );
  }
  const [githubOwner, githubRepository] = expectedRepository.split("/");
  if (
    contract.evidencePolicy.githubOwner !== githubOwner ||
    contract.evidencePolicy.githubRepository !== githubRepository ||
    contract.evidencePolicy.initialOrigin !== root.github.initialOrigin ||
    stableLenderPortalEvidenceJson(
      contract.evidencePolicy.releaseAssetRedirects
    ) !== stableLenderPortalEvidenceJson(root.github.releaseAssetRedirects)
  ) {
    fail(
      "GitHub release transport claims do not match the immutable trust root"
    );
  }
  if (
    stableLenderPortalEvidenceJson(contract.trustedDeploymentOrigins) !==
      stableLenderPortalEvidenceJson(root.deploymentOrigins) ||
    stableLenderPortalEvidenceJson(contract.trustedReleaseKeys) !==
      stableLenderPortalEvidenceJson(root.releaseKeys) ||
    stableLenderPortalEvidenceJson(contract.trustedReviewers) !==
      stableLenderPortalEvidenceJson(root.reviewers)
  ) {
    fail("Signing or deployment claims do not match the immutable trust root");
  }
  assertUnique(contract.trustedDeploymentOrigins, "Trusted deployment origins");
  for (const origin of contract.trustedDeploymentOrigins) {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== origin ||
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".local") ||
      parsed.hostname.endsWith(".test")
    ) {
      fail(`Untrusted production deployment origin in contract: ${origin}`);
    }
  }
  const releaseIds = contract.trustedReleaseKeys.map((key) => key.id);
  const reviewerIds = contract.trustedReviewers.map((key) => key.id);
  const releaseFingerprints = contract.trustedReleaseKeys.map((key) =>
    lenderPortalPublicKeyFingerprint(key.publicKeyPem)
  );
  const reviewerFingerprints = contract.trustedReviewers.map((key) =>
    lenderPortalPublicKeyFingerprint(key.publicKeyPem)
  );
  assertUnique(releaseIds, "Trusted release key IDs");
  assertUnique(reviewerIds, "Trusted reviewer key IDs");
  assertUnique(releaseFingerprints, "Trusted release key fingerprints");
  assertUnique(reviewerFingerprints, "Trusted reviewer key fingerprints");
  for (const key of [
    ...contract.trustedReleaseKeys,
    ...contract.trustedReviewers,
  ]) {
    if (lenderPortalPublicKeyFingerprint(key.publicKeyPem) !== key.sha256) {
      fail(
        `Pinned signing key ${key.id} fingerprint does not match its material`
      );
    }
  }
  if (
    releaseIds.some((id) => reviewerIds.includes(id)) ||
    releaseFingerprints.some((fingerprint) =>
      reviewerFingerprints.includes(fingerprint)
    )
  ) {
    fail("Release and independent-review signing trust sets must be disjoint");
  }
}

function validateMachineMapping(
  mapping: MachineMapping,
  proofs: Map<string, TestProof>,
  consumers: Map<string, AcceptanceContract["consumers"][number]>,
  operationalGateIds: readonly string[]
) {
  const proof = proofs.get(mapping.testProofId);
  if (!proof) {
    fail(`${mapping.id} maps to unknown test proof ${mapping.testProofId}`);
  }
  assertExactValues(
    mapping.consumerIds,
    proof.consumerIds,
    `${mapping.id} consumer mapping`
  );
  for (const consumerId of mapping.consumerIds) {
    if (!consumers.has(consumerId)) {
      fail(`${mapping.id} maps to unknown consumer ${consumerId}`);
    }
  }
  assertUnique(mapping.operationalGateIds, `${mapping.id} operational gates`);
  for (const gateId of mapping.operationalGateIds) {
    if (!operationalGateIds.includes(gateId)) {
      fail(`${mapping.id} maps to unknown gate ${gateId}`);
    }
  }
  if (
    (mapping.id.startsWith("LP-E2E-") || mapping.id.startsWith("LP-VSG-")) &&
    (proof.proofClass !== "production-route" ||
      !mapping.consumerIds.some(
        (id) => consumers.get(id)?.class === "production-route"
      ))
  ) {
    fail(`${mapping.id} requires a real supported production-route proof`);
  }
  if (
    !mapping.operationalGateIds.includes("authenticated-production-browser")
  ) {
    fail(
      `${mapping.id} requires authenticated deployed-browser journey evidence`
    );
  }
}

export function validateLenderPortalProductionAcceptanceContractValue(args: {
  contractValue: unknown;
  repositoryRoot: string;
}) {
  const contract = acceptanceContractSchema.parse(args.contractValue);
  assertExactValues(
    contract.surfaces.map((item) => item.id),
    EXPECTED_SURFACE_IDS,
    "Production acceptance surfaces"
  );
  assertExactValues(
    contract.journeys.map((item) => item.id),
    EXPECTED_JOURNEY_IDS,
    "Acceptance journeys"
  );
  assertExactValues(
    contract.verticalSliceGates.map((item) => item.id),
    EXPECTED_VERTICAL_SLICE_GATE_IDS,
    "Vertical-slice gates"
  );
  assertExactValues(
    contract.operationalGates.map((item) => item.id),
    EXPECTED_OPERATIONAL_GATE_IDS,
    "Operational gates"
  );
  assertUnique(
    contract.consumers.map((item) => item.id),
    "Production consumer IDs"
  );
  assertUnique(
    contract.testCommands.map((item) => item.id),
    "Test command IDs"
  );
  assertUnique(
    contract.testProofs.map((item) => item.id),
    "Test proof IDs"
  );
  assertUnique(
    contract.authorizationTestProofIds,
    "Authorization test proof IDs"
  );
  validateTrustedPolicies(contract);
  const consumers = new Map(
    contract.consumers.map((consumer) => [consumer.id, consumer])
  );
  const routeGraph = contract.consumers
    .filter(
      (consumer): consumer is z.infer<typeof productionRouteConsumerSchema> =>
        consumer.class === "production-route"
    )
    .map((consumer) => [
      consumer.id,
      consumer.routeSource,
      consumer.importModule,
      consumer.componentSource,
      consumer.componentExport,
      consumer.renderPath,
      consumer.queryOwnerSource,
      consumer.queryOwnerFunction,
      consumer.queryOwner,
    ]);
  if (
    stableLenderPortalEvidenceJson(routeGraph) !==
    stableLenderPortalEvidenceJson(CANONICAL_ROUTE_GRAPH)
  ) {
    fail(
      "Production route/query graph does not match the trusted source policy"
    );
  }
  for (const consumer of contract.consumers) {
    if (consumer.class === "production-route") {
      validateProductionRouteConsumer(args.repositoryRoot, consumer);
    } else {
      validateCanonicalApiConsumer(args.repositoryRoot, consumer);
    }
  }
  validateTestRegistry(args.repositoryRoot, contract, consumers);
  const proofs = new Map(contract.testProofs.map((proof) => [proof.id, proof]));
  for (const proofId of contract.authorizationTestProofIds) {
    const proof = proofs.get(proofId);
    if (!proof || proof.proofClass !== "authorization-boundary") {
      fail(
        `Authorization proof ${proofId} is missing or has the wrong proof class`
      );
    }
  }
  const mappings = allMachineMappings(contract);
  const canonicalBindings = mappings.map((mapping) => {
    const proof = proofs.get(mapping.testProofId);
    return [
      mapping.id,
      mapping.testProofId,
      proof?.targetFile,
      proof?.assertionName,
    ];
  });
  if (
    stableLenderPortalEvidenceJson(canonicalBindings) !==
    stableLenderPortalEvidenceJson(CANONICAL_MACHINE_BINDINGS)
  ) {
    fail(
      "Machine mappings do not match the canonical per-ID acceptance policy"
    );
  }
  assertUnique(
    mappings.map((mapping) => mapping.testProofId),
    "Machine mapping test proof IDs"
  );
  assertUnique(
    mappings.map((mapping) => {
      const proof = proofs.get(mapping.testProofId);
      return `${proof?.targetFile ?? "missing"}::${proof?.assertionName ?? "missing"}`;
    }),
    "Machine mapping executable assertions"
  );
  const operationalGateIds = contract.operationalGates.map((gate) => gate.id);
  for (const mapping of mappings) {
    validateMachineMapping(mapping, proofs, consumers, operationalGateIds);
  }
  return contract;
}

export function validateLenderPortalProductionAcceptanceContract(args: {
  contractPath?: string;
  repositoryRoot: string;
}) {
  const contractPath =
    args.contractPath ?? LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH;
  const absolutePath = resolveLenderPortalRepositoryPath(
    args.repositoryRoot,
    contractPath
  );
  if (!existsSync(absolutePath)) {
    fail(`Missing lender production acceptance contract: ${contractPath}`);
  }
  const contractText = readStableFile(absolutePath).toString("utf8");
  const contract = validateLenderPortalProductionAcceptanceContractValue({
    contractValue: JSON.parse(contractText),
    repositoryRoot: args.repositoryRoot,
  });
  return { contract, contractSha256: sha256(contractText) };
}

function rawPathSegments(url: string) {
  const match = url.match(RAW_URL_PATH_PATTERN);
  return (match?.[1] ?? "").split("/").filter(Boolean);
}

function validateNoUrlTraversal(url: string, label: string) {
  for (const segment of rawPathSegments(url)) {
    let decoded = segment;
    try {
      for (let pass = 0; pass < 3; pass += 1) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) {
          break;
        }
        decoded = next;
      }
    } catch {
      fail(`${label} contains invalid URL path encoding`);
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      fail(`${label} contains forbidden URL path traversal`);
    }
  }
}

function validateInitialEvidenceUrl(
  contract: AcceptanceContract,
  evidenceUrl: string,
  label: string
) {
  validateNoUrlTraversal(evidenceUrl, label);
  let parsed: URL;
  try {
    parsed = new URL(evidenceUrl);
  } catch {
    fail(`${label} is not a trusted GitHub release asset URL`);
  }
  const prefix = `/${contract.evidencePolicy.githubOwner}/${contract.evidencePolicy.githubRepository}/releases/download/`;
  const suffix = parsed.pathname.slice(prefix.length);
  const parts = suffix.split("/");
  if (
    parsed.origin !== contract.evidencePolicy.initialOrigin ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !parsed.pathname.startsWith(prefix) ||
    parts.length !== 2 ||
    parts.some((part) => !part)
  ) {
    fail(`${label} is not a trusted GitHub release asset URL`);
  }
}

function validateEffectiveEvidenceUrl(
  contract: AcceptanceContract,
  effectiveUrl: string,
  label: string
) {
  validateNoUrlTraversal(effectiveUrl, `${label} redirect`);
  let parsed: URL;
  try {
    parsed = new URL(effectiveUrl);
  } catch {
    fail(`${label} resolved to an untrusted evidence origin`);
  }
  try {
    validateInitialEvidenceUrl(contract, effectiveUrl, label);
    return;
  } catch {
    // GitHub release assets may resolve only to the pinned release asset CDN.
  }
  const allowed = contract.evidencePolicy.releaseAssetRedirects.some(
    (redirect) =>
      parsed.origin === redirect.origin &&
      new RegExp(redirect.pathnamePattern).test(parsed.pathname)
  );
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    !allowed
  ) {
    fail(`${label} resolved to an untrusted evidence origin or path`);
  }
}

function validateRedirectChain(args: {
  contract: AcceptanceContract;
  effectiveUrl: string;
  initialUrl: string;
  label: string;
  redirectChain: string[];
}) {
  let current = args.initialUrl;
  for (const [index, hop] of args.redirectChain.entries()) {
    const resolved = new URL(hop, current).toString();
    validateEffectiveEvidenceUrl(
      args.contract,
      resolved,
      `${args.label} redirect hop ${index + 1}`
    );
    current = resolved;
  }
  if (current !== args.effectiveUrl) {
    fail(
      `${args.label} effective URL does not match its recorded redirect chain`
    );
  }
  validateEffectiveEvidenceUrl(args.contract, args.effectiveUrl, args.label);
}

function redirectLocations(headers: Buffer) {
  return headers
    .toString("utf8")
    .split(LINE_SPLIT_PATTERN)
    .map((line) => line.match(LOCATION_HEADER_PATTERN)?.[1]?.trim())
    .filter((location): location is string => Boolean(location));
}

function fetchRemoteEvidence(
  contract: AcceptanceContract,
  evidenceUrl: string,
  label: string
) {
  validateInitialEvidenceUrl(contract, evidenceUrl, label);
  const directory = mkdtempSync(join(tmpdir(), "lender-release-evidence-"));
  const outputPath = join(directory, "artifact");
  const headersPath = join(directory, "headers");
  try {
    const result = spawnSync(
      trustedExecutable("curl"),
      [
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--dump-header",
        headersPath,
        "--output",
        outputPath,
        "--write-out",
        "%{url_effective}",
        evidenceUrl,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 }
    );
    if (result.status !== 0 || !existsSync(outputPath)) {
      fail(`${label} could not be fetched from its durable evidence location`);
    }
    const effectiveUrl = result.stdout.trim();
    const redirectChain = existsSync(headersPath)
      ? redirectLocations(readStableFile(headersPath))
      : [];
    validateRedirectChain({
      contract,
      effectiveUrl,
      initialUrl: evidenceUrl,
      label,
      redirectChain,
    });
    return readStableFile(outputPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function fetchEvidence(args: {
  contract: AcceptanceContract;
  label: string;
  testOnlyHooks?: TestOnlyValidationHooks;
  url: string;
}) {
  validateInitialEvidenceUrl(args.contract, args.url, args.label);
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("Release validation hooks are test-only");
    }
    const result = args.testOnlyHooks.fetchRemote({
      label: args.label,
      url: args.url,
    });
    validateRedirectChain({
      contract: args.contract,
      effectiveUrl: result.effectiveUrl,
      initialUrl: args.url,
      label: args.label,
      redirectChain: result.redirectChain,
    });
    return result.contents;
  }
  return fetchRemoteEvidence(args.contract, args.url, args.label);
}

function verifyGithubAttestedArtifact(args: {
  artifact: Buffer;
  artifactSha256: string;
  allowPreDeployment?: boolean;
  attestation: SignedAttestation;
  attestationBundle: Buffer;
  contract: AcceptanceContract;
  label: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const policy = args.contract.evidencePolicy.githubAttestation;
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("GitHub attestation verification hooks are test-only");
    }
    if (!args.testOnlyHooks.verifyGithubAttestation) {
      fail(`${args.label} requires independently verified CI provenance`);
    }
    const verified = args.testOnlyHooks.verifyGithubAttestation({
      artifactSha256: args.artifactSha256,
      candidateSha: args.attestation.payload.candidateSha,
      label: args.label,
      repository: policy.repository,
      signerDigest: policy.signerDigest,
      signerWorkflow: policy.signerWorkflow,
      sourceRepository: policy.sourceRepository,
    });
    if (
      verified.artifactSha256 !== args.artifactSha256 ||
      verified.sourceDigest !== args.attestation.payload.candidateSha ||
      verified.sourceRepository !== policy.sourceRepository ||
      verified.signerDigest !== policy.signerDigest ||
      verified.signerWorkflow !== policy.signerWorkflow ||
      verified.builderId !== "https://github.com/actions/runner" ||
      !verified.invocationId ||
      Date.parse(verified.startedAt) <
        (args.allowPreDeployment
          ? Date.parse(args.attestation.payload.issuedAt) -
            args.contract.attestationMaxAgeHours * 60 * 60 * 1000
          : Date.parse(args.attestation.payload.deployment.deployedAt)) ||
      Date.parse(verified.startedAt) > Date.parse(verified.finishedAt) ||
      Date.parse(verified.finishedAt) >
        Date.parse(args.attestation.payload.issuedAt)
    ) {
      fail(`${args.label} GitHub Actions attestation is stale or foreign`);
    }
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "lender-ci-attestation-"));
  const artifactPath = join(directory, "artifact");
  const bundlePath = join(directory, "bundle.jsonl");
  try {
    writeFileSync(artifactPath, args.artifact);
    writeFileSync(bundlePath, args.attestationBundle);
    const result = spawnSync(
      trustedExecutable("gh"),
      [
        "attestation",
        "verify",
        artifactPath,
        "--bundle",
        bundlePath,
        "--repo",
        policy.repository,
        "--signer-workflow",
        policy.signerWorkflow,
        "--signer-digest",
        policy.signerDigest,
        "--source-digest",
        args.attestation.payload.candidateSha,
        "--cert-oidc-issuer",
        policy.oidcIssuer,
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    );
    if (result.status !== 0) {
      fail(
        `${args.label} lacks a valid GitHub Actions artifact attestation: ${result.stderr.trim()}`
      );
    }
    const verified = z
      .array(
        z
          .object({
            verificationResult: z
              .object({
                statement: z
                  .object({
                    predicate: z
                      .object({
                        runDetails: z
                          .object({
                            builder: z
                              .object({
                                id: z.literal(
                                  "https://github.com/actions/runner"
                                ),
                              })
                              .passthrough(),
                            metadata: z
                              .object({
                                finishedOn: z
                                  .string()
                                  .datetime({ offset: true }),
                                invocationId: z.string().min(1),
                                startedOn: z
                                  .string()
                                  .datetime({ offset: true }),
                              })
                              .passthrough(),
                          })
                          .passthrough(),
                      })
                      .passthrough(),
                    subject: z.array(
                      z
                        .object({
                          digest: z
                            .object({ sha256: sha256Schema })
                            .passthrough(),
                        })
                        .passthrough()
                    ),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough()
      )
      .min(1)
      .parse(JSON.parse(result.stdout));
    if (
      !verified.some((entry) => {
        const statement = entry.verificationResult.statement;
        const metadata = statement.predicate.runDetails.metadata;
        return (
          statement.subject.some(
            (subject) => subject.digest.sha256 === args.artifactSha256
          ) &&
          Date.parse(metadata.startedOn) >=
            (args.allowPreDeployment
              ? Date.parse(args.attestation.payload.issuedAt) -
                args.contract.attestationMaxAgeHours * 60 * 60 * 1000
              : Date.parse(args.attestation.payload.deployment.deployedAt)) &&
          Date.parse(metadata.startedOn) <= Date.parse(metadata.finishedOn) &&
          Date.parse(metadata.finishedOn) <=
            Date.parse(args.attestation.payload.issuedAt)
        );
      })
    ) {
      fail(`${args.label} attestation does not cover the exact artifact bytes`);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function trustedReleaseKey(
  keyId: string,
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const policies =
    testOnlyHooks?.trustRoot?.releaseKeys ??
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.releaseKeys;
  const key = policies.find((candidate) => candidate.id === keyId);
  if (!key) {
    fail("Release attestation was not signed by a pinned trusted key");
  }
  return key;
}

function trustedReviewer(
  acceptance: SignedAttestation["payload"]["independentAcceptance"],
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const policies =
    testOnlyHooks?.trustRoot?.reviewers ??
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.reviewers;
  const policy = policies.find(
    (candidate) => candidate.id === acceptance.signature.keyId
  );
  if (
    !policy ||
    policy.reviewerId !== acceptance.reviewerId ||
    policy.reviewerDisplayName !== acceptance.reviewerDisplayName
  ) {
    fail(
      "Independent acceptance reviewer identity is outside the pinned policy"
    );
  }
  return policy;
}

function verifyEd25519(
  statement: string,
  signature: string,
  publicKeyPem: string,
  label: string
) {
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(statement),
      publicKeyPem,
      Buffer.from(signature, "base64")
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    fail(`${label} signature verification failed`);
  }
}

export function createLenderPortalIndependentReviewStatement(
  payload: SignedAttestation["payload"]
) {
  return stableLenderPortalEvidenceJson({
    artifacts: payload.artifacts.map((artifact) => ({
      commitSha: artifact.commitSha,
      id: artifact.id,
      kind: artifact.kind,
      sha256: artifact.sha256,
      sourceTreeSha: artifact.sourceTreeSha,
      uri: artifact.uri,
    })),
    attestationUri: payload.attestationUri,
    candidateSha: payload.candidateSha,
    contractSha256: payload.contractSha256,
    decision: payload.independentAcceptance.decision,
    deployment: payload.deployment,
    issuedAt: payload.issuedAt,
    releaseId: payload.releaseId,
    journeys: payload.journeys,
    independentAcceptanceArtifactId: payload.independentAcceptance.artifactId,
    independentAcceptanceArtifactSha256:
      payload.independentAcceptance.artifactSha256,
    operationalGates: payload.operationalGates,
    reviewerDisplayName: payload.independentAcceptance.reviewerDisplayName,
    reviewerId: payload.independentAcceptance.reviewerId,
    surfaces: payload.surfaces,
    verifiedAt: payload.independentAcceptance.verifiedAt,
    verticalSliceGates: payload.verticalSliceGates,
  });
}

function verifySignatures(
  attestation: SignedAttestation,
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const releaseKey = trustedReleaseKey(
    attestation.signature.keyId,
    testOnlyHooks
  );
  verifyEd25519(
    stableLenderPortalEvidenceJson(attestation.payload),
    attestation.signature.value,
    releaseKey.publicKeyPem,
    "Release attestation"
  );
  const reviewer = trustedReviewer(
    attestation.payload.independentAcceptance,
    testOnlyHooks
  );
  verifyEd25519(
    createLenderPortalIndependentReviewStatement(attestation.payload),
    attestation.payload.independentAcceptance.signature.value,
    reviewer.publicKeyPem,
    "Independent acceptance"
  );
}

function assertGitStateMatches(
  expected: LenderPortalReleaseGitState,
  actual: LenderPortalReleaseGitState,
  phase: string
) {
  if (!actual.isClean || actual.dirtyEntryCount !== 0) {
    fail(
      `${phase} requires a clean immutable checkout; found ${actual.dirtyEntryCount} dirty entries`
    );
  }
  if (
    actual.headSha !== expected.headSha ||
    actual.treeSha !== expected.treeSha
  ) {
    fail(
      `${phase} detected a repository HEAD or tree change during validation`
    );
  }
}

function artifactEnvelope(
  contents: Buffer,
  artifact: Artifact,
  gitState: LenderPortalReleaseGitState
) {
  if (sha256(contents) !== artifact.sha256) {
    fail(`${artifact.id} durable evidence digest mismatch`);
  }
  if (
    artifact.commitSha !== gitState.headSha ||
    artifact.sourceTreeSha !== gitState.treeSha
  ) {
    fail(`${artifact.id} is stale or bound to a foreign commit/tree`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8"));
  } catch {
    fail(`${artifact.id} is not a structured JSON evidence artifact`);
  }
  const envelope = z
    .object({
      artifactId: z.string(),
      commitSha: sha40Schema,
      sourceTreeSha: sha40Schema,
    })
    .passthrough()
    .parse(parsed);
  if (
    envelope.artifactId !== artifact.id ||
    envelope.commitSha !== artifact.commitSha ||
    envelope.sourceTreeSha !== artifact.sourceTreeSha
  ) {
    fail(
      `${artifact.id} content metadata does not match its signed artifact identity`
    );
  }
  return parsed;
}

function machineInvocation(testProof: TestProof, packageScript: string) {
  const argv = [
    "bun",
    "run",
    packageScript,
    "--",
    testProof.targetFile,
    "--testNamePattern",
    testProof.assertionName,
    "--reporter=json",
  ];
  return { argv, command: argv.join(" "), cwd: "." as const };
}

function decodeExecutionReport(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  payload: z.infer<typeof machineArtifactPayloadSchema>;
  mappingId: string;
  registered: TestProof;
  testOnlyHooks?: TestOnlyValidationHooks;
  usedReportIds: Set<string>;
  usedReportDigests: Set<string>;
}) {
  const encoded = args.payload.executionReport.rawReportBase64;
  if (encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
    fail(`${args.registered.id} execution report is not canonical base64`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.toString("base64") !== encoded ||
    sha256(bytes) !== args.payload.executionReport.rawReportSha256
  ) {
    fail(`${args.registered.id} execution report bytes or digest are invalid`);
  }
  if (
    args.usedReportDigests.has(args.payload.executionReport.rawReportSha256)
  ) {
    fail(
      `${args.registered.id} replays execution report bytes across releases`
    );
  }
  args.usedReportDigests.add(args.payload.executionReport.rawReportSha256);
  const githubAttestationBundle = fetchEvidence({
    contract: args.contract,
    label: `${args.registered.id} GitHub Actions attestation bundle`,
    testOnlyHooks: args.testOnlyHooks,
    url: args.payload.executionReport.githubAttestationBundleUri,
  });
  if (
    sha256(githubAttestationBundle) !==
    args.payload.executionReport.githubAttestationBundleSha256
  ) {
    fail(`${args.registered.id} GitHub Actions attestation bundle is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: bytes,
    artifactSha256: args.payload.executionReport.rawReportSha256,
    attestation: args.attestation,
    attestationBundle: githubAttestationBundle,
    contract: args.contract,
    label: `${args.registered.id} execution report`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${args.registered.id} execution report is not valid JSON`);
  }
  const report = rawVitestExecutionReportSchema.parse(raw);
  const nativeEncoded = report.nativeReport.rawReportBase64;
  if (nativeEncoded.length % 4 !== 0 || !BASE64_PATTERN.test(nativeEncoded)) {
    fail(`${args.registered.id} native Vitest report is not canonical base64`);
  }
  const nativeBytes = Buffer.from(nativeEncoded, "base64");
  if (
    nativeBytes.toString("base64") !== nativeEncoded ||
    sha256(nativeBytes) !== report.nativeReport.rawReportSha256
  ) {
    fail(`${args.registered.id} native Vitest report digest is invalid`);
  }
  let nativeValue: unknown;
  try {
    nativeValue = JSON.parse(nativeBytes.toString("utf8"));
  } catch {
    fail(`${args.registered.id} native Vitest report is not valid JSON`);
  }
  const nativeReport = nativeVitestJsonReportSchema.parse(nativeValue);
  if (args.usedReportIds.has(report.executionId)) {
    fail(`${args.registered.id} replays an execution report identity`);
  }
  args.usedReportIds.add(report.executionId);
  const command = args.contract.testCommands.find(
    (candidate) => candidate.id === args.registered.commandId
  );
  if (!command) {
    fail(`${args.registered.id} has no designated runner command`);
  }
  const expectedInvocation = machineInvocation(
    args.registered,
    command.packageScript
  );
  const testResult = report.testResults[0];
  const assertion = testResult?.assertions[0];
  const nativeAssertions = nativeReport.testResults.flatMap((result) =>
    result.assertionResults.map((candidate) => ({
      ...candidate,
      targetFile: result.name,
    }))
  );
  const nativePassedAssertions = nativeAssertions.filter(
    (candidate) => candidate.status === "passed"
  );
  const nativeAssertion = nativePassedAssertions[0];
  const nonPassedAssertions = nativeAssertions.filter(
    (candidate) => candidate.status !== "passed"
  );
  const expectedTotals = {
    failed: 0,
    passed: nativePassedAssertions.length,
    pending: 0,
    skipped: 0,
    suites: nativeReport.testResults.length,
    tests: nativeAssertions.length,
    todo: 0,
  };
  if (
    report.commitSha !== args.attestation.payload.candidateSha ||
    report.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    report.deploymentId !== args.attestation.payload.deployment.id ||
    report.deploymentUrl !== args.attestation.payload.deployment.url ||
    report.releaseId !== args.attestation.payload.releaseId ||
    report.mappingId !== args.mappingId ||
    report.runner.name !== command.runner ||
    report.runner.version !== command.runnerVersion ||
    report.runner.executableSha256 !== command.runnerExecutableSha256 ||
    stableLenderPortalEvidenceJson(report.invocation) !==
      stableLenderPortalEvidenceJson(expectedInvocation) ||
    report.testResults.length !== 1 ||
    testResult?.targetFile !== args.registered.targetFile ||
    testResult.assertions.length !== 1 ||
    assertion?.assertionId !==
      `${args.registered.id}::${args.registered.assertionName}` ||
    assertion?.assertionName !== args.registered.assertionName ||
    assertion?.status !== "passed" ||
    nativeReport.numFailedTests !== 0 ||
    nativeReport.numPassedTests !== nativeAssertions.length ||
    nativeReport.numTotalTests !== nativeAssertions.length ||
    nativeReport.numPassedTestSuites !== nativeReport.testResults.length ||
    nativeReport.numTotalTestSuites !== nativeReport.testResults.length ||
    nativeReport.testResults.some((result) => result.status !== "passed") ||
    nonPassedAssertions.length !== 0 ||
    stableLenderPortalEvidenceJson(report.expectedTotals) !==
      stableLenderPortalEvidenceJson(expectedTotals) ||
    nativePassedAssertions.length !== 1 ||
    nativeAssertion?.title !== args.registered.assertionName ||
    !nativeAssertion.fullName.endsWith(args.registered.assertionName) ||
    !nativeAssertion.targetFile.endsWith(`/${args.registered.targetFile}`)
  ) {
    fail(
      `${args.registered.id} execution report does not prove its designated test invocation and result`
    );
  }
  const startedAt = Date.parse(report.startedAt);
  const finishedAt = Date.parse(report.finishedAt);
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  const issuedAt = Date.parse(args.attestation.payload.issuedAt);
  if (
    deployedAt > startedAt ||
    startedAt > finishedAt ||
    finishedAt > issuedAt ||
    nativeReport.startTime !== startedAt
  ) {
    fail(`${args.registered.id} execution report timestamps are inconsistent`);
  }
}

function validateMachineProofGroup(args: {
  artifacts: Map<string, Artifact>;
  artifactPayloads: Map<string, unknown>;
  contract: AcceptanceContract;
  label: string;
  mappings: readonly MachineMapping[];
  proofs: readonly MachineProof[];
  testOnlyHooks?: TestOnlyValidationHooks;
  usedArtifactIds: Set<string>;
  usedReportIds: Set<string>;
  usedReportDigests: Set<string>;
  attestation: SignedAttestation;
}) {
  assertExactValues(
    args.proofs.map((proof) => proof.id),
    args.mappings.map((mapping) => mapping.id),
    args.label
  );
  const mappingById = new Map(
    args.mappings.map((mapping) => [mapping.id, mapping])
  );
  const testProofById = new Map(
    args.contract.testProofs.map((proof) => [proof.id, proof])
  );
  for (const proof of args.proofs) {
    const mapping = mappingById.get(proof.id);
    if (!mapping || proof.testProofId !== mapping.testProofId) {
      fail(
        `${proof.id} is unmapped or references the wrong registered test proof`
      );
    }
    if (args.usedArtifactIds.has(proof.artifactId)) {
      fail(`${proof.id} reuses a machine evidence artifact`);
    }
    args.usedArtifactIds.add(proof.artifactId);
    const artifact = args.artifacts.get(proof.artifactId);
    if (!artifact || artifact.kind !== "machine-test-output") {
      fail(
        `${proof.id} must reference one unique machine-test-output artifact`
      );
    }
    const payload = machineArtifactPayloadSchema.parse(
      args.artifactPayloads.get(proof.artifactId)
    );
    const registered = testProofById.get(mapping.testProofId);
    if (!registered) {
      fail(`${proof.id} references a missing registered proof`);
    }
    const expectedProof = {
      assertionName: registered.assertionName,
      commandId: registered.commandId,
      consumerIds: registered.consumerIds,
      mappingId: mapping.id,
      observableResult: registered.observableResult,
      targetFile: registered.targetFile,
      testProofId: registered.id,
    };
    if (
      stableLenderPortalEvidenceJson(payload.proof) !==
      stableLenderPortalEvidenceJson(expectedProof)
    ) {
      fail(
        `${proof.id} machine artifact is stale, unrelated, or has mismatched test semantics`
      );
    }
    decodeExecutionReport({
      attestation: args.attestation,
      contract: args.contract,
      payload,
      mappingId: mapping.id,
      registered,
      testOnlyHooks: args.testOnlyHooks,
      usedReportIds: args.usedReportIds,
      usedReportDigests: args.usedReportDigests,
    });
  }
}

const phase3ExecutionStepSchema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    invocationId: z.string().uuid(),
    reportSha256: sha256Schema,
    result: z.literal("passed"),
  })
  .strict();

const phase3MigrationEvidenceSchema = z
  .object({
    apply: phase3ExecutionStepSchema,
    dryRun: phase3ExecutionStepSchema,
    id: z.enum(["proposal-phase3-lifecycle", "workos-user-normalized-email"]),
    readback: phase3ExecutionStepSchema.extend({
      remainingRecordCount: z.literal(0),
    }),
    runner: z.enum([
      "migrations:runProposalPhase3LifecycleBackfill",
      "migrations:runWorkosUserNormalizedEmailBackfill",
    ]),
  })
  .strict();

const phase3IndexEvidenceSchema = z
  .object({
    fields: z.array(z.string().min(1)).min(1),
    name: z.enum([
      "by_proposal_assignment_revision_status",
      "by_normalized_email",
    ]),
    staged: z.literal(false),
    status: z.literal("ready"),
    table: z.enum(["proposalLenderApprovals", "users"]),
    verifiedAt: z.string().datetime({ offset: true }),
  })
  .strict();

interface Phase3CutoverProof {
  ambiguity: {
    completePagination: true;
    openIssueCount: 0;
    query: "lender_portal_phase9:listLenderPortalPhase9MigrationIssues";
  };
  authenticatedReadback: {
    authorization: "admin-or-principle-broker";
    brokerageIdHash: string;
    organizationIdHash: string;
    query: "lender_portal_phase9:getLenderPortalPhase9MigrationRun";
    readAt: string;
    runTokenHash: string;
    status: "verified";
  };
  indexes: z.infer<typeof phase3IndexEvidenceSchema>[];
  manifestSealing: {
    archivingAssignmentCount: 0;
    buildingManifestCount: 0;
    failedManifestCount: 0;
    readAt: string;
    sealedManifestCount: number;
    withdrawnAssignmentCount: number;
  };
  migrations: z.infer<typeof phase3MigrationEvidenceSchema>[];
  recordedAt: string;
  rollbackRehearsal: {
    completedAt: string;
    exerciseId: string;
    recoveryMode: "disable-and-forward-recovery";
    reportSha256: string;
    result: "passed";
  };
  schemaSourceSha256: string;
}

function readStringArray(node: ts.Expression | undefined) {
  if (!(node && ts.isArrayLiteralExpression(node))) {
    return null;
  }
  const values: string[] = [];
  for (const element of node.elements) {
    if (!ts.isStringLiteral(element)) {
      return null;
    }
    values.push(element.text);
  }
  return values;
}

function tableNameForIndexCall(call: ts.CallExpression) {
  let current: ts.Node | undefined = call;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const name = current.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
        return name.text;
      }
    }
    current = current.parent;
  }
  return null;
}

function objectLiteralPropertyName(property: ts.ObjectLiteralElementLike) {
  if (ts.isSpreadAssignment(property)) {
    return null;
  }
  const name = property.name;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function phase3IndexDeclaration(node: ts.Node) {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  if (
    node.expression.name.text !== "index" ||
    !ts.isStringLiteral(node.arguments[0])
  ) {
    return null;
  }
  const name = node.arguments[0].text;
  if (!PHASE3_CUTOVER_INDEXES.some((expected) => expected.name === name)) {
    return null;
  }
  const definition = node.arguments[1];
  let fields = readStringArray(definition);
  let stagedOrUnknown = false;
  if (definition && ts.isObjectLiteralExpression(definition)) {
    const fieldsProperty = definition.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        objectLiteralPropertyName(property) === "fields"
    );
    fields =
      fieldsProperty && ts.isPropertyAssignment(fieldsProperty)
        ? readStringArray(fieldsProperty.initializer)
        : null;
    const stagedProperties = definition.properties.filter(
      (property) => objectLiteralPropertyName(property) === "staged"
    );
    const stagedProperty = stagedProperties[0];
    const hasDynamicProperty = definition.properties.some(
      (property) =>
        ts.isSpreadAssignment(property) ||
        (!ts.isSpreadAssignment(property) &&
          ts.isComputedPropertyName(property.name))
    );
    stagedOrUnknown = Boolean(
      hasDynamicProperty ||
        stagedProperties.length > 1 ||
        (stagedProperty &&
          (!ts.isPropertyAssignment(stagedProperty) ||
            stagedProperty.initializer.kind !== ts.SyntaxKind.FalseKeyword))
    );
  }
  return {
    fields,
    name,
    stagedOrUnknown,
    table: tableNameForIndexCall(node),
  };
}

export function validateLenderPortalPhase3IndexCutoverSource(
  sourceText: string
) {
  const source = ts.createSourceFile(
    "convex/schema.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declarations = new Map<
    string,
    {
      fields: string[] | null;
      stagedOrUnknown: boolean;
      table: string | null;
    }
  >();
  const visit = (node: ts.Node) => {
    const declaration = phase3IndexDeclaration(node);
    if (declaration) {
      if (declarations.has(declaration.name)) {
        fail(
          `Phase 3 cutover index ${declaration.name} is declared more than once`
        );
      }
      declarations.set(declaration.name, declaration);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const expected of PHASE3_CUTOVER_INDEXES) {
    const declaration = declarations.get(expected.name);
    if (
      !declaration ||
      declaration.table !== expected.table ||
      stableLenderPortalEvidenceJson(declaration.fields) !==
        stableLenderPortalEvidenceJson(expected.fields)
    ) {
      fail(
        `Phase 3 cutover index ${expected.name} does not match its canonical schema`
      );
    }
    if (declaration.stagedOrUnknown) {
      fail(
        `Phase 3 cutover index ${expected.name} is staged or has an unknown staged expression`
      );
    }
  }
}

function validatePhase3CutoverSemantics(args: {
  attestation: SignedAttestation;
  proof: Phase3CutoverProof;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const schemaPath = "convex/schema.ts";
  const schemaBytes = args.testOnlyHooks?.readRepositoryFile
    ? args.testOnlyHooks.readRepositoryFile(schemaPath)
    : readStableFile(
        resolveLenderPortalRepositoryPath(args.repositoryRoot, schemaPath)
      );
  if (sha256(schemaBytes) !== args.proof.schemaSourceSha256) {
    fail("Phase 3 cutover evidence does not match the candidate schema source");
  }
  validateLenderPortalPhase3IndexCutoverSource(schemaBytes.toString("utf8"));
  if (
    args.proof.authenticatedReadback.organizationIdHash ===
    args.proof.authenticatedReadback.brokerageIdHash
  ) {
    fail(
      "Phase 3 cutover readback must bind distinct tenant and Brokerage scopes"
    );
  }
  if (
    args.proof.manifestSealing.withdrawnAssignmentCount !==
    args.proof.manifestSealing.sealedManifestCount
  ) {
    fail("Phase 3 withdrawal manifests are not completely sealed");
  }
  for (const [index, expected] of PHASE3_CUTOVER_MIGRATIONS.entries()) {
    const migration = args.proof.migrations[index];
    if (migration?.id !== expected.id || migration.runner !== expected.runner) {
      fail("Phase 3 cutover migration evidence is missing or reordered");
    }
  }
  for (const [index, expected] of PHASE3_CUTOVER_INDEXES.entries()) {
    const evidence = args.proof.indexes[index];
    if (
      evidence?.name !== expected.name ||
      evidence.table !== expected.table ||
      stableLenderPortalEvidenceJson(evidence.fields) !==
        stableLenderPortalEvidenceJson(expected.fields)
    ) {
      fail("Phase 3 cutover index evidence is missing or mismatched");
    }
  }
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  const recordedAt = Date.parse(args.proof.recordedAt);
  const reportDigests: string[] = [args.proof.rollbackRehearsal.reportSha256];
  const invocationIds: string[] = [args.proof.rollbackRehearsal.exerciseId];
  let latestMigrationReadback = deployedAt;
  for (const migration of args.proof.migrations) {
    const dryRunAt = Date.parse(migration.dryRun.completedAt);
    const applyAt = Date.parse(migration.apply.completedAt);
    const readbackAt = Date.parse(migration.readback.completedAt);
    if (
      deployedAt > dryRunAt ||
      dryRunAt > applyAt ||
      applyAt > readbackAt ||
      readbackAt > recordedAt
    ) {
      fail("Phase 3 migration dry-run, apply, and readback order is invalid");
    }
    latestMigrationReadback = Math.max(latestMigrationReadback, readbackAt);
    for (const step of [
      migration.dryRun,
      migration.apply,
      migration.readback,
    ]) {
      reportDigests.push(step.reportSha256);
      invocationIds.push(step.invocationId);
    }
  }
  const finalEvidenceTimes = [
    Date.parse(args.proof.authenticatedReadback.readAt),
    Date.parse(args.proof.manifestSealing.readAt),
    Date.parse(args.proof.rollbackRehearsal.completedAt),
    ...args.proof.indexes.map((index) => Date.parse(index.verifiedAt)),
  ];
  if (
    finalEvidenceTimes.some(
      (timestamp) =>
        timestamp < latestMigrationReadback || timestamp > recordedAt
    )
  ) {
    fail(
      "Phase 3 cutover readback, index, or rollback evidence is out of sequence"
    );
  }
  assertUnique(reportDigests, "Phase 3 cutover report digests");
  assertUnique(invocationIds, "Phase 3 cutover invocation IDs");
}

function requiredOperationalProof(
  gateId: string,
  proof: Record<string, unknown>,
  attestation: SignedAttestation
) {
  const deployment = attestation.payload.deployment;
  const common = {
    deploymentId: z.literal(deployment.id),
    deploymentUrl: z.literal(deployment.url),
    gateId: z.literal(gateId),
    recordedAt: z.string().datetime({ offset: true }),
    releaseId: z.literal(attestation.payload.releaseId),
    result: z.literal("passed"),
    resultArtifactSha256: sha256Schema,
    resultArtifactUri: z.string().url(),
    resultGithubAttestationBundleSha256: sha256Schema,
    resultGithubAttestationBundleUri: z.string().url(),
  };
  const schemas: Record<string, z.ZodTypeAny> = {
    "authenticated-production-browser": z
      .object({
        ...common,
        observations: z
          .array(
            z
              .object({
                githubAttestationBundleSha256: sha256Schema,
                githubAttestationBundleUri: z.string().url(),
                manifestSha256: sha256Schema,
                manifestUri: z.string().url(),
                mappingId: z.string().min(1),
              })
              .strict()
          )
          .min(1),
        resultFormat: z.literal("playwright-production-journey-report/v1"),
      })
      .strict(),
    "focus-and-status-announcements": z
      .object({
        ...common,
        auditTool: z.literal("axe-core"),
        auditToolVersion: z.string().regex(SEMVER_PATTERN),
        focusTarget: z.string().min(2),
        liveRegionResult: z.literal("announced"),
        resultFormat: z.literal("axe-focus-status-report/v1"),
        route: z.string().startsWith("/"),
      })
      .strict(),
    "responsive-zoom-and-screen-reader": z
      .object({
        ...common,
        assistiveTechnology: z.literal("VoiceOver"),
        assistiveTechnologyVersion: z.string().min(2),
        resultFormat: z.literal("assistive-technology-report/v1"),
        route: z.string().startsWith("/"),
        viewport: z.string().regex(VIEWPORT_PATTERN),
        zoomPercent: z.number().int().min(100).max(400),
      })
      .strict(),
    "provider-and-webhook-delivery": z
      .object({
        ...common,
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        mappingIds: z.array(z.string().min(1)).min(1),
        provider: z.literal("WorkOS"),
        providerAccountId: z.string().min(2),
        providerReceiptSha256: sha256Schema,
        providerReceiptUri: z.string().url(),
        resultFormat: z.literal("provider-readback-receipt/v2"),
        tenantIdHash: sha256Schema,
      })
      .strict(),
    "inbox-and-reauthorized-links": z
      .object({
        ...common,
        inboxProvider: z.literal("Resend"),
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        mappingIds: z.array(z.string().min(1)).min(1),
        providerAccountId: z.string().min(2),
        receiptSha256: sha256Schema,
        receiptUri: z.string().url(),
        resultFormat: z.literal("inbox-readback-receipt/v2"),
        tenantIdHash: sha256Schema,
      })
      .strict(),
    "phase3-migration-cutover": z
      .object({
        ...common,
        ambiguity: z
          .object({
            completePagination: z.literal(true),
            openIssueCount: z.literal(0),
            query: z.literal(
              "lender_portal_phase9:listLenderPortalPhase9MigrationIssues"
            ),
          })
          .strict(),
        authenticatedReadback: z
          .object({
            authorization: z.literal("admin-or-principle-broker"),
            brokerageIdHash: sha256Schema,
            organizationIdHash: sha256Schema,
            query: z.literal(
              "lender_portal_phase9:getLenderPortalPhase9MigrationRun"
            ),
            readAt: z.string().datetime({ offset: true }),
            runTokenHash: sha256Schema,
            status: z.literal("verified"),
          })
          .strict(),
        indexes: z.array(phase3IndexEvidenceSchema).length(2),
        manifestSealing: z
          .object({
            archivingAssignmentCount: z.literal(0),
            buildingManifestCount: z.literal(0),
            failedManifestCount: z.literal(0),
            readAt: z.string().datetime({ offset: true }),
            sealedManifestCount: z.number().int().nonnegative(),
            withdrawnAssignmentCount: z.number().int().nonnegative(),
          })
          .strict(),
        migrations: z.array(phase3MigrationEvidenceSchema).length(2),
        resultFormat: z.literal("phase3-migration-cutover-report/v1"),
        rollbackRehearsal: z
          .object({
            completedAt: z.string().datetime({ offset: true }),
            exerciseId: z.string().uuid(),
            recoveryMode: z.literal("disable-and-forward-recovery"),
            reportSha256: sha256Schema,
            result: z.literal("passed"),
          })
          .strict(),
        schemaSourceSha256: sha256Schema,
      })
      .strict(),
    "exact-release-commit": z
      .object({
        ...common,
        buildCommand: z.literal("bun run build"),
        builderExecutablePath: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path
        ),
        builderExecutableSha256: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256
        ),
        builderVersion: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version
        ),
        bundleGithubAttestationSha256: sha256Schema,
        bundleGithubAttestationUri: z.string().url(),
        bundleSha256: z.literal(deployment.releaseBundleSha256),
        bundleUri: z.literal(deployment.releaseBundleUri),
        deployedCommitSha: z.literal(deployment.deployedCommitSha),
        resultFormat: z.literal("immutable-release-build-report/v1"),
        sourceTreeSha: z.literal(deployment.sourceTreeSha),
      })
      .strict(),
  };
  const schema = schemas[gateId];
  if (!schema) {
    fail(`Unknown operational gate semantics ${gateId}`);
  }
  return schema.parse(proof);
}

const operationalRawResultSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    gateId: z.string().min(1),
    recordedAt: z.string().datetime({ offset: true }),
    releaseId: z.string().uuid(),
    report: z.record(z.string(), z.unknown()),
    result: z.literal("passed"),
    schemaVersion: z.literal("lender-portal-operational-raw-result/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

const releaseBundleManifestSchema = z
  .object({
    artifacts: z
      .array(
        z
          .object({
            path: z.string().min(1),
            sha256: sha256Schema,
          })
          .strict()
      )
      .min(1),
    build: z
      .object({
        command: z.literal("bun run build"),
        executablePath: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path
        ),
        executableSha256: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256
        ),
        executableVersion: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version
        ),
        finishedAt: z.string().datetime({ offset: true }),
        startedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-release-bundle-manifest/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

export function validateLenderPortalReleaseBundleManifestFixture(
  value: unknown,
  deployedAt?: string
) {
  return parseReleaseBundleManifest(value, deployedAt);
}

function assertSafeReleaseBundleArtifactPath(path: string) {
  const segments = path.split(PATH_SEGMENT_SEPARATOR_PATTERN);
  if (
    isAbsolute(path) ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(path) ||
    path.startsWith("\\\\") ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    fail("Release bundle artifact path must be a safe relative path");
  }
}

function parseReleaseBundleManifest(value: unknown, deployedAt?: string) {
  const manifest = releaseBundleManifestSchema.parse(value);
  for (const artifact of manifest.artifacts) {
    assertSafeReleaseBundleArtifactPath(artifact.path);
  }
  if (
    deployedAt &&
    Date.parse(manifest.build.finishedAt) > Date.parse(deployedAt)
  ) {
    fail("Immutable release bundle build cannot finish after deployment");
  }
  return manifest;
}

const browserTraceManifestSchema = z
  .object({
    actor: z
      .object({
        organizationIdHash: sha256Schema,
        role: z.enum([
          "backoffice",
          "builder",
          "lender",
          "lender-admin",
          "lender-staff",
        ]),
        roleHash: sha256Schema,
        subjectIdHash: sha256Schema,
      })
      .strict(),
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    deploymentOrigin: z.string().url(),
    finishedAt: z.string().datetime({ offset: true }),
    mappingId: z.string().min(1),
    releaseId: z.string().uuid(),
    runId: z.string().uuid(),
    runner: z
      .object({
        executableSha256: sha256Schema,
        name: z.literal("playwright"),
        version: z.string().regex(SEMVER_PATTERN),
      })
      .strict(),
    schemaVersion: z.literal("lender-portal-browser-trace-manifest/v1"),
    sessionId: z.string().uuid(),
    sourceTreeSha: sha40Schema,
    startedAt: z.string().datetime({ offset: true }),
    steps: z
      .array(
        z
          .object({
            kind: z.enum(["assert", "authenticate", "navigate"]),
            observedAt: z.string().datetime({ offset: true }),
            observedResult: z.string().min(8),
            route: z.string().startsWith("/"),
            status: z.literal("passed"),
            stepId: z.string().min(1),
            traceCallId: z.string().min(1),
          })
          .strict()
      )
      .length(3),
    trace: z
      .object({
        byteLength: z.number().int().positive(),
        format: z.literal("playwright-trace-zip"),
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        sha256: sha256Schema,
        uri: z.string().url(),
      })
      .strict(),
  })
  .strict();

const providerWebhookReceiptSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    provider: z.literal("WorkOS"),
    providerAccountId: z.string().min(2),
    records: z.array(
      z
        .object({
          assignmentIdentityHash: sha256Schema,
          correlationId: z.string().min(2),
          deliveryId: z.string().min(2),
          mappingId: z.string().min(1),
          occurredAt: z.string().datetime({ offset: true }),
          readback: z
            .object({
              authorizationContextHash: sha256Schema,
              method: z.literal("authenticated-api-readback"),
              requestId: z.string().min(2),
              requestUrl: z.string().url(),
              responseBase64: z.string().min(16),
              responseSha256: sha256Schema,
            })
            .strict(),
          recipientHash: sha256Schema,
          organizationIdHash: sha256Schema,
          route: z.string().startsWith("/"),
          roleHash: sha256Schema,
          status: z.literal("delivered"),
          subjectIdHash: sha256Schema,
          tenantIdHash: sha256Schema,
          webhookEventId: z.string().min(2),
        })
        .strict()
    ),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-provider-readback-receipt/v2"),
    sourceTreeSha: sha40Schema,
    tenantIdHash: sha256Schema,
  })
  .strict();

const inboxReceiptSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    provider: z.literal("Resend"),
    providerAccountId: z.string().min(2),
    records: z.array(
      z
        .object({
          assignmentIdentityHash: sha256Schema,
          correlationId: z.string().min(2),
          deliveryId: z.string().min(2),
          linkPath: z.string().startsWith("/"),
          mappingId: z.string().min(1),
          messageId: z.string().min(2),
          occurredAt: z.string().datetime({ offset: true }),
          readback: z
            .object({
              authorizationContextHash: sha256Schema,
              method: z.literal("authenticated-api-readback"),
              requestId: z.string().min(2),
              requestUrl: z.string().url(),
              responseBase64: z.string().min(16),
              responseSha256: sha256Schema,
            })
            .strict(),
          reauthorizationResult: z.literal("authorized"),
          recipientHash: sha256Schema,
          organizationIdHash: sha256Schema,
          roleHash: sha256Schema,
          status: z.literal("delivered"),
          subjectIdHash: sha256Schema,
          tenantIdHash: sha256Schema,
        })
        .strict()
    ),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-inbox-readback-receipt/v2"),
    sourceTreeSha: sha40Schema,
    tenantIdHash: sha256Schema,
  })
  .strict();

function validateRawOperationalResult(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  gateId: string;
  parsedProof: Record<string, unknown>;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const resultArtifactUri = String(args.parsedProof.resultArtifactUri);
  const resultArtifactSha256 = String(args.parsedProof.resultArtifactSha256);
  const rawResultBytes = fetchEvidence({
    contract: args.contract,
    label: `${args.gateId} raw operational result`,
    testOnlyHooks: args.testOnlyHooks,
    url: resultArtifactUri,
  });
  if (sha256(rawResultBytes) !== resultArtifactSha256) {
    fail(`${args.gateId} raw operational result digest is invalid`);
  }
  const resultAttestationBundle = fetchEvidence({
    contract: args.contract,
    label: `${args.gateId} raw-result GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.resultGithubAttestationBundleUri),
  });
  if (
    sha256(resultAttestationBundle) !==
    args.parsedProof.resultGithubAttestationBundleSha256
  ) {
    fail(`${args.gateId} raw-result attestation digest is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: rawResultBytes,
    artifactSha256: resultArtifactSha256,
    attestation: args.attestation,
    attestationBundle: resultAttestationBundle,
    contract: args.contract,
    label: `${args.gateId} raw operational result`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let rawResultValue: unknown;
  try {
    rawResultValue = JSON.parse(rawResultBytes.toString("utf8"));
  } catch {
    fail(`${args.gateId} raw operational result is not valid JSON`);
  }
  const rawResult = operationalRawResultSchema.parse(rawResultValue);
  if (
    rawResult.gateId !== args.gateId ||
    rawResult.releaseId !== args.attestation.payload.releaseId ||
    rawResult.deploymentId !== args.attestation.payload.deployment.id ||
    rawResult.commitSha !== args.attestation.payload.candidateSha ||
    rawResult.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    rawResult.recordedAt !== args.parsedProof.recordedAt
  ) {
    fail(`${args.gateId} raw operational result is stale or foreign`);
  }
  const expectedRawReport = Object.fromEntries(
    Object.entries(args.parsedProof).filter(
      ([key]) =>
        ![
          "resultArtifactSha256",
          "resultArtifactUri",
          "resultGithubAttestationBundleSha256",
          "resultGithubAttestationBundleUri",
        ].includes(key)
    )
  );
  if (
    stableLenderPortalEvidenceJson(rawResult.report) !==
    stableLenderPortalEvidenceJson(expectedRawReport)
  ) {
    fail(`${args.gateId} raw operational result does not prove gate semantics`);
  }
  const recordedAt = Date.parse(rawResult.recordedAt);
  if (
    recordedAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
    recordedAt > Date.parse(args.attestation.payload.issuedAt)
  ) {
    fail(`${args.gateId} raw operational result timestamp is invalid`);
  }
  return recordedAt;
}

interface BrowserObservation {
  githubAttestationBundleSha256: string;
  githubAttestationBundleUri: string;
  manifestSha256: string;
  manifestUri: string;
  mappingId: string;
}

interface OperationalEvidenceUniqueness {
  authSessionDigests: Set<string>;
  correlationIds: Set<string>;
  deliveryIds: Set<string>;
  eventIds: Set<string>;
  manifestUris: Set<string>;
  messageIds: Set<string>;
  providerRequestIds: Set<string>;
  receiptUris: Set<string>;
  runIds: Set<string>;
  sessionIds: Set<string>;
  traceDigests: Set<string>;
  traceUris: Set<string>;
}

let crc32Table: Uint32Array | undefined;

function crc32(contents: Uint8Array) {
  crc32Table ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xed_b8_83_20 : 0);
    }
    return value >>> 0;
  });
  let value = 0xff_ff_ff_ff;
  for (const byte of contents) {
    const tableValue = crc32Table[(value ^ byte) & 0xff];
    if (tableValue === undefined) {
      fail("Authenticated browser trace CRC table lookup failed");
    }
    value = (value >>> 8) ^ tableValue;
  }
  return (value ^ 0xff_ff_ff_ff) >>> 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ZIP validation must keep central-directory, local-record, CRC, and encryption checks fail closed.
function parsePlaywrightTraceArchive(archive: Buffer) {
  let decompressed: Record<string, Uint8Array>;
  try {
    decompressed = unzipSync(archive);
  } catch {
    fail(
      "Authenticated browser trace is not a valid decompressible ZIP archive"
    );
  }
  const eocdOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0 || eocdOffset + 22 > archive.byteLength) {
    fail("Authenticated browser trace ZIP end record is missing");
  }
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const directoryDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const directorySize = archive.readUInt32LE(eocdOffset + 12);
  const directoryOffset = archive.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0 ||
    directoryOffset + directorySize !== eocdOffset
  ) {
    fail("Authenticated browser trace ZIP directory offsets are invalid");
  }
  const entryNames: string[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > eocdOffset ||
      archive.readUInt32LE(offset) !== 0x02_01_4b_50
    ) {
      fail("Authenticated browser trace ZIP central directory is malformed");
    }
    const flags = archive.readUInt16LE(offset + 8);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (
      flags & 1 ||
      nameEnd + extraLength + commentLength > eocdOffset ||
      localOffset + 30 > directoryOffset ||
      archive.readUInt32LE(localOffset) !== 0x04_03_4b_50
    ) {
      fail("Authenticated browser trace ZIP entry is malformed or encrypted");
    }
    const name = archive.subarray(nameStart, nameEnd).toString("utf8");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const compressedStart = localNameEnd + localExtraLength;
    if (
      localNameEnd > directoryOffset ||
      archive.subarray(localNameStart, localNameEnd).toString("utf8") !==
        name ||
      compressedStart + compressedSize > directoryOffset
    ) {
      fail(
        "Authenticated browser trace ZIP local record does not match its directory"
      );
    }
    const contents = decompressed[name];
    if (
      !contents ||
      contents.byteLength !== uncompressedSize ||
      crc32(contents) !== expectedCrc
    ) {
      fail(
        "Authenticated browser trace ZIP CRC or decompression result is invalid"
      );
    }
    entryNames.push(name);
    offset = nameEnd + extraLength + commentLength;
  }
  if (offset !== eocdOffset) {
    fail("Authenticated browser trace ZIP directory length is inconsistent");
  }
  assertUnique(entryNames, "Authenticated browser trace ZIP entries");
  if (!(decompressed["trace.trace"] && decompressed["trace.network"])) {
    fail("Authenticated browser trace lacks Playwright trace structure");
  }
  return {
    network: Buffer.from(decompressed["trace.network"]),
    trace: Buffer.from(decompressed["trace.trace"]),
  };
}

const traceAcceptanceMarkerSchema = z
  .object({
    actor: browserTraceManifestSchema.shape.actor,
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    mappingId: z.string().min(1),
    observedResult: z.string().min(8),
    releaseId: z.string().uuid(),
    route: z.string().startsWith("/"),
    runId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-playwright-trace-marker/v1"),
    sessionId: z.string().uuid(),
    sourceTreeSha: sha40Schema,
  })
  .strict();

function parseTraceJsonLines(contents: Buffer, label: string) {
  return contents
    .toString("utf8")
    .split(LINE_SPLIT_PATTERN)
    .filter(Boolean)
    .map((line) => {
      try {
        return z.record(z.string(), z.unknown()).parse(JSON.parse(line));
      } catch {
        return fail(
          `Authenticated Playwright ${label} contains a malformed event`
        );
      }
    });
}

function uniqueTraceEventIndex(
  events: Record<string, unknown>[],
  predicate: (event: Record<string, unknown>) => boolean,
  label: string
) {
  const indices = events
    .map((event, index) => (predicate(event) ? index : -1))
    .filter((index) => index >= 0);
  if (indices.length !== 1) {
    fail(`Authenticated Playwright trace requires one ${label} event`);
  }
  return indices[0] as number;
}

const playwrightStorageStateSchema = z
  .object({
    cookies: z.array(
      z
        .object({
          domain: z.string().min(1),
          expires: z.number(),
          httpOnly: z.literal(true),
          name: z.string().min(1),
          path: z.literal("/"),
          secure: z.literal(true),
          value: z.string().min(32),
        })
        .passthrough()
    ),
    origins: z.array(z.unknown()),
  })
  .passthrough();

interface AuthenticatedTraceSession {
  cookieName: string;
  cookieValue: string;
  sessionDigest: string;
}

function cookieDomainIncludesHost(cookieDomain: string, host: string) {
  const normalizedDomain = cookieDomain
    .toLowerCase()
    .replace(LEADING_DOT_PATTERN, "");
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === normalizedDomain &&
    normalizedDomain ===
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.authKit.sessionCookieDomain
  );
}

function validatePlaywrightTraceEvents(args: {
  context: BrowserObservationContext;
  manifest: z.infer<typeof browserTraceManifestSchema>;
  traceContents: Buffer;
}): AuthenticatedTraceSession {
  const events = parseTraceJsonLines(args.traceContents, "trace stream");
  const [authStep, navigateStep, assertStep] = args.manifest.steps;
  if (!(authStep && navigateStep && assertStep)) {
    fail("Authenticated Playwright trace manifest steps are incomplete");
  }
  const contextIndex = uniqueTraceEventIndex(
    events,
    (event) => event.type === "context-options",
    "context-options"
  );
  const beforeIndex = (stepCallId: string, apiName: string) =>
    uniqueTraceEventIndex(
      events,
      (event) =>
        event.type === "before" &&
        event.callId === stepCallId &&
        event.apiName === apiName,
      `${apiName} before`
    );
  const afterIndex = (stepCallId: string, apiName: string) =>
    uniqueTraceEventIndex(
      events,
      (event) =>
        event.type === "after" &&
        event.callId === stepCallId &&
        event.apiName === apiName,
      `${apiName} after`
    );
  const authBeforeIndex = beforeIndex(
    authStep.traceCallId,
    "browserContext.storageState"
  );
  const authAfterIndex = afterIndex(
    authStep.traceCallId,
    "browserContext.storageState"
  );
  const navigateBeforeIndex = beforeIndex(
    navigateStep.traceCallId,
    "page.goto"
  );
  const navigateAfterIndex = afterIndex(navigateStep.traceCallId, "page.goto");
  const assertBeforeIndex = beforeIndex(
    assertStep.traceCallId,
    "locator.textContent"
  );
  const assertAfterIndex = afterIndex(
    assertStep.traceCallId,
    "locator.textContent"
  );
  const consoleIndex = uniqueTraceEventIndex(
    events,
    (event) =>
      event.type === "console" &&
      event.messageType === "log" &&
      typeof event.text === "string" &&
      event.text.startsWith("LENDER_PORTAL_ACCEPTANCE:"),
    "acceptance correlation marker"
  );
  const contextEvent = events[contextIndex];
  const authAfter = events[authAfterIndex];
  const navigateBefore = events[navigateBeforeIndex];
  const navigateAfter = events[navigateAfterIndex];
  const assertBefore = events[assertBeforeIndex];
  const assertAfter = events[assertAfterIndex];
  const consoleEvent = events[consoleIndex];
  const orderedIndices = [
    contextIndex,
    authBeforeIndex,
    authAfterIndex,
    navigateBeforeIndex,
    navigateAfterIndex,
    assertBeforeIndex,
    assertAfterIndex,
    consoleIndex,
  ];
  if (
    orderedIndices.some((index, position) => {
      const previousIndex = orderedIndices[position - 1];
      return previousIndex !== undefined && index <= previousIndex;
    }) ||
    authAfter?.error !== undefined ||
    navigateAfter?.error !== undefined ||
    assertAfter?.error !== undefined
  ) {
    fail("Authenticated Playwright trace interaction sequence is invalid");
  }
  const markerText = String(consoleEvent?.text ?? "").slice(
    "LENDER_PORTAL_ACCEPTANCE:".length
  );
  let markerValue: unknown;
  try {
    markerValue = JSON.parse(Buffer.from(markerText, "base64url").toString());
  } catch {
    fail("Authenticated Playwright trace marker is malformed");
  }
  const marker = traceAcceptanceMarkerSchema.parse(markerValue);
  const storageState = z
    .object({ value: playwrightStorageStateSchema })
    .parse(authAfter?.result).value;
  const sessionCookieName =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.authKit.sessionCookieName;
  const deploymentHost = new URL(args.manifest.deploymentOrigin).hostname;
  const sessionCookies = storageState.cookies.filter(
    (cookie) =>
      cookie.name === sessionCookieName &&
      cookieDomainIncludesHost(cookie.domain, deploymentHost) &&
      (cookie.expires === -1 ||
        cookie.expires * 1000 > Date.parse(args.manifest.finishedAt))
  );
  if (sessionCookies.length !== 1) {
    fail(
      "Authenticated Playwright trace requires one active, production-scoped WorkOS session cookie"
    );
  }
  const sessionCookie = sessionCookies[0];
  if (!sessionCookie) {
    fail("Authenticated Playwright trace session cookie is unavailable");
  }
  const navigationUrl = z
    .object({ url: z.string().url() })
    .parse(navigateBefore?.params).url;
  const navigation = new URL(navigationUrl);
  const assertionParams = z
    .object({ selector: z.string().min(1) })
    .parse(assertBefore?.params);
  const assertionResult = z
    .object({ value: z.string() })
    .parse(assertAfter?.result);
  const expectedRoute = args.context.routes[0];
  const expectedAssertionSelector = `[data-lender-portal-acceptance="${args.manifest.mappingId}"]`;
  if (
    !contextEvent ||
    contextEvent.browserName !== "chromium" ||
    contextEvent.playwrightVersion !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version ||
    z.object({ baseURL: z.string().url() }).parse(contextEvent.options)
      .baseURL !== args.manifest.deploymentOrigin ||
    navigation.origin !== args.manifest.deploymentOrigin ||
    navigation.pathname !== expectedRoute ||
    assertionParams.selector !== expectedAssertionSelector ||
    assertionResult.value !== args.context.testProof.observableResult ||
    marker.mappingId !== args.manifest.mappingId ||
    marker.releaseId !== args.manifest.releaseId ||
    marker.runId !== args.manifest.runId ||
    marker.sessionId !== args.manifest.sessionId ||
    marker.commitSha !== args.manifest.commitSha ||
    marker.sourceTreeSha !== args.manifest.sourceTreeSha ||
    marker.deploymentId !== args.manifest.deploymentId ||
    marker.route !== expectedRoute ||
    marker.observedResult !== args.context.testProof.observableResult ||
    stableLenderPortalEvidenceJson(marker.actor) !==
      stableLenderPortalEvidenceJson(args.manifest.actor)
  ) {
    fail("Authenticated Playwright trace events are stale or unrelated");
  }
  return {
    cookieName: sessionCookie.name,
    cookieValue: sessionCookie.value,
    sessionDigest: sha256(sessionCookie.value),
  };
}

function validatePlaywrightNetworkEvents(args: {
  authentication: AuthenticatedTraceSession;
  context: BrowserObservationContext;
  manifest: z.infer<typeof browserTraceManifestSchema>;
  networkContents: Buffer;
}) {
  const networkEventSchema = z
    .object({
      snapshot: z
        .object({
          _resourceType: z.literal("document"),
          request: z
            .object({
              headers: z.array(
                z.object({ name: z.string(), value: z.string() }).passthrough()
              ),
              method: z.literal("GET"),
              url: z.string().url(),
            })
            .passthrough(),
          response: z
            .object({
              content: z.object({ mimeType: z.string() }).passthrough(),
              headers: z.array(
                z.object({ name: z.string(), value: z.string() }).passthrough()
              ),
              status: z.number().int(),
            })
            .passthrough(),
        })
        .passthrough(),
      type: z.literal("resource-snapshot"),
    })
    .passthrough();
  const events = parseTraceJsonLines(args.networkContents, "network stream");
  const snapshots = events
    .filter((event) => event.type === "resource-snapshot")
    .map((event) => networkEventSchema.parse(event));
  const expectedRoute = args.context.routes[0];
  const expectedUrl = `${args.manifest.deploymentOrigin}${expectedRoute}`;
  const matches = snapshots.filter((event) => {
    const requestHeaders = new Map(
      event.snapshot.request.headers.map((header) => [
        header.name.toLowerCase(),
        header.value,
      ])
    );
    const responseHeaders = new Map(
      event.snapshot.response.headers.map((header) => [
        header.name.toLowerCase(),
        header.value,
      ])
    );
    const cookieHeader = requestHeaders.get("cookie") ?? "";
    const sessionCookieValues = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([name]) => name === args.authentication.cookieName)
      .map(([, ...valueParts]) => valueParts.join("="));
    return (
      event.snapshot.request.url === expectedUrl &&
      event.snapshot.response.status >= 200 &&
      event.snapshot.response.status < 400 &&
      event.snapshot.response.content.mimeType.startsWith("text/html") &&
      requestHeaders.get("x-drawflow-acceptance-run-id") ===
        args.manifest.runId &&
      requestHeaders.get("x-drawflow-acceptance-session-id") ===
        args.manifest.sessionId &&
      requestHeaders.get("x-drawflow-acceptance-mapping-id") ===
        args.manifest.mappingId &&
      sessionCookieValues.length === 1 &&
      sessionCookieValues[0] === args.authentication.cookieValue &&
      responseHeaders.get("x-drawflow-auth-session-hash") ===
        args.authentication.sessionDigest &&
      responseHeaders.get("x-drawflow-auth-subject-hash") ===
        args.manifest.actor.subjectIdHash &&
      responseHeaders.get("x-drawflow-auth-organization-hash") ===
        args.manifest.actor.organizationIdHash &&
      responseHeaders.get("x-drawflow-auth-role-hash") ===
        args.manifest.actor.roleHash
    );
  });
  if (matches.length !== 1) {
    fail("Authenticated Playwright network events are stale or unrelated");
  }
}

function expectedEvidenceRole(routes: string[]) {
  if (routes.some((route) => route.startsWith("/builder"))) {
    return "builder" as const;
  }
  if (routes.some((route) => route.startsWith("/backoffice"))) {
    return "backoffice" as const;
  }
  return "lender-admin" as const;
}

function trustedEvidencePrincipalForRole(
  role: ReturnType<typeof expectedEvidenceRole>
) {
  const principal =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals.find(
      (candidate) => candidate.role === role
    );
  if (!principal) {
    fail(`No source-owned production evidence principal is pinned for ${role}`);
  }
  return principal;
}

function trustedEvidencePrincipalForMapping(
  contract: AcceptanceContract,
  mappingId: string
) {
  const route = canonicalRouteForMapping(contract, mappingId);
  return trustedEvidencePrincipalForRole(expectedEvidenceRole([route]));
}

function trustedProviderTenantIdHash(
  contract: AcceptanceContract,
  mappingIds: string[],
  provider: "Resend" | "WorkOS"
) {
  const tenantHashes = mappingIds.map(
    (mappingId) =>
      trustedEvidencePrincipalForMapping(contract, mappingId)
        .providerTenantIdHashes[provider]
  );
  const uniqueTenantHashes = [...new Set(tenantHashes)];
  if (uniqueTenantHashes.length !== 1 || !uniqueTenantHashes[0]) {
    fail(
      `${provider} operational mappings do not resolve to one source-owned tenant identity`
    );
  }
  return uniqueTenantHashes[0];
}

interface BrowserObservationContext {
  mapping: ReturnType<typeof allMachineMappings>[number];
  routes: string[];
  testProof: AcceptanceContract["testProofs"][number];
}

function browserObservationContext(args: {
  consumersById: Map<string, AcceptanceContract["consumers"][number]>;
  mapping: ReturnType<typeof allMachineMappings>[number] | undefined;
  proofsById: Map<string, AcceptanceContract["testProofs"][number]>;
}): BrowserObservationContext | undefined {
  if (!args.mapping) {
    return;
  }
  const testProof = args.proofsById.get(args.mapping.testProofId);
  const routes = args.mapping.consumerIds
    .map((consumerId) => args.consumersById.get(consumerId))
    .filter(
      (consumer): consumer is z.infer<typeof productionRouteConsumerSchema> =>
        consumer?.class === "production-route"
    )
    .map((consumer) => consumer.routerPath);
  if (!testProof || routes.length === 0) {
    return;
  }
  return { mapping: args.mapping, routes, testProof };
}

function validateBrowserObservation(args: {
  attestation: SignedAttestation;
  context: BrowserObservationContext;
  contract: AcceptanceContract;
  observation: BrowserObservation;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const { observation } = args;
  if (args.uniqueness.manifestUris.has(observation.manifestUri)) {
    fail(`${observation.mappingId} reuses a browser trace manifest`);
  }
  args.uniqueness.manifestUris.add(observation.manifestUri);
  const manifestBytes = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} browser trace manifest`,
    testOnlyHooks: args.testOnlyHooks,
    url: observation.manifestUri,
  });
  if (sha256(manifestBytes) !== observation.manifestSha256) {
    fail(`${observation.mappingId} browser trace manifest digest is invalid`);
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} browser trace GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: observation.githubAttestationBundleUri,
  });
  if (sha256(bundle) !== observation.githubAttestationBundleSha256) {
    fail(
      `${observation.mappingId} browser trace attestation digest is invalid`
    );
  }
  verifyGithubAttestedArtifact({
    artifact: manifestBytes,
    artifactSha256: observation.manifestSha256,
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: `${observation.mappingId} browser trace manifest`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail(`${observation.mappingId} browser trace manifest is not JSON`);
  }
  const manifest = browserTraceManifestSchema.parse(manifestValue);
  const stepKinds = manifest.steps.map((step) => step.kind);
  const [authenticateStep, navigateStep, assertionStep] = manifest.steps;
  const trustedPrincipal = trustedEvidencePrincipalForRole(
    expectedEvidenceRole(args.context.routes)
  );
  const trustedActor = {
    organizationIdHash: trustedPrincipal.organizationIdHash,
    role: trustedPrincipal.role,
    roleHash: trustedPrincipal.roleHash,
    subjectIdHash: trustedPrincipal.subjectIdHash,
  };
  const expectedRoute = args.context.routes[0];
  if (
    manifest.mappingId !== observation.mappingId ||
    manifest.releaseId !== args.attestation.payload.releaseId ||
    manifest.commitSha !== args.attestation.payload.candidateSha ||
    manifest.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    manifest.deploymentId !== args.attestation.payload.deployment.id ||
    manifest.deploymentOrigin !== args.attestation.payload.deployment.url ||
    manifest.runner.name !== "playwright" ||
    manifest.runner.version !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version ||
    manifest.runner.executableSha256 !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.executableSha256 ||
    stableLenderPortalEvidenceJson(manifest.actor) !==
      stableLenderPortalEvidenceJson(trustedActor) ||
    stableLenderPortalEvidenceJson(stepKinds) !==
      stableLenderPortalEvidenceJson(["authenticate", "navigate", "assert"]) ||
    manifest.steps.some((step) => !args.context.routes.includes(step.route)) ||
    authenticateStep?.observedResult !==
      `Authenticated ${trustedPrincipal.role} session` ||
    navigateStep?.observedResult !== `Reached ${expectedRoute}` ||
    assertionStep?.observedResult !== args.context.testProof.observableResult
  ) {
    fail(
      `${observation.mappingId} browser trace manifest is stale or unrelated`
    );
  }
  assertUnique(
    manifest.steps.map((step) => step.stepId),
    `${observation.mappingId} browser step IDs`
  );
  assertUnique(
    manifest.steps.map((step) => step.traceCallId),
    `${observation.mappingId} browser trace call IDs`
  );
  if (
    args.uniqueness.runIds.has(manifest.runId) ||
    args.uniqueness.sessionIds.has(manifest.sessionId) ||
    args.uniqueness.traceDigests.has(manifest.trace.sha256) ||
    args.uniqueness.traceUris.has(manifest.trace.uri)
  ) {
    fail(
      `${observation.mappingId} reuses browser run, session, or trace evidence`
    );
  }
  args.uniqueness.runIds.add(manifest.runId);
  args.uniqueness.sessionIds.add(manifest.sessionId);
  args.uniqueness.traceDigests.add(manifest.trace.sha256);
  args.uniqueness.traceUris.add(manifest.trace.uri);
  const startedAt = Date.parse(manifest.startedAt);
  const finishedAt = Date.parse(manifest.finishedAt);
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  if (
    startedAt < deployedAt ||
    startedAt > finishedAt ||
    finishedAt > args.recordedAt ||
    manifest.steps.some((step) => {
      const observedAt = Date.parse(step.observedAt);
      return observedAt < startedAt || observedAt > finishedAt;
    })
  ) {
    fail(`${observation.mappingId} browser trace timestamps are invalid`);
  }
  const trace = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} authenticated browser trace`,
    testOnlyHooks: args.testOnlyHooks,
    url: manifest.trace.uri,
  });
  if (
    sha256(trace) !== manifest.trace.sha256 ||
    trace.byteLength !== manifest.trace.byteLength
  ) {
    fail(
      `${observation.mappingId} authenticated browser trace digest is invalid`
    );
  }
  const traceBundle = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} trace-byte GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: manifest.trace.githubAttestationBundleUri,
  });
  if (sha256(traceBundle) !== manifest.trace.githubAttestationBundleSha256) {
    fail(`${observation.mappingId} trace-byte attestation digest is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: trace,
    artifactSha256: manifest.trace.sha256,
    attestation: args.attestation,
    attestationBundle: traceBundle,
    contract: args.contract,
    label: `${observation.mappingId} authenticated Playwright trace bytes`,
    testOnlyHooks: args.testOnlyHooks,
  });
  const archive = parsePlaywrightTraceArchive(trace);
  const authentication = validatePlaywrightTraceEvents({
    context: args.context,
    manifest,
    traceContents: archive.trace,
  });
  if (args.uniqueness.authSessionDigests.has(authentication.sessionDigest)) {
    fail(`${observation.mappingId} reuses an authenticated browser session`);
  }
  args.uniqueness.authSessionDigests.add(authentication.sessionDigest);
  validatePlaywrightNetworkEvents({
    authentication,
    context: args.context,
    manifest,
    networkContents: archive.network,
  });
}

function validateBrowserObservations(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  observations: BrowserObservation[];
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const mappings = allMachineMappings(args.contract);
  assertExactValues(
    args.observations.map((observation) => observation.mappingId),
    mappings.map((mapping) => mapping.id),
    "Authenticated production-browser journey observations"
  );
  const mappingsById = new Map(
    mappings.map((mapping) => [mapping.id, mapping])
  );
  const proofsById = new Map(
    args.contract.testProofs.map((testProof) => [testProof.id, testProof])
  );
  const consumersById = new Map(
    args.contract.consumers.map((consumer) => [consumer.id, consumer])
  );
  for (const observation of args.observations) {
    const context = browserObservationContext({
      consumersById,
      mapping: mappingsById.get(observation.mappingId),
      proofsById,
    });
    if (!context) {
      fail(
        `${observation.mappingId} browser observation does not match its production consumer and expected result`
      );
    }
    validateBrowserObservation({ ...args, context, observation });
  }
}

function mappingIdsForOperationalGate(
  contract: AcceptanceContract,
  gateId: string
) {
  return allMachineMappings(contract)
    .filter((mapping) => mapping.operationalGateIds.includes(gateId))
    .map((mapping) => mapping.id);
}

function canonicalRouteForMapping(
  contract: AcceptanceContract,
  mappingId: string
) {
  const mapping = allMachineMappings(contract).find(
    (candidate) => candidate.id === mappingId
  );
  const consumer = mapping?.consumerIds
    .map((consumerId) =>
      contract.consumers.find((candidate) => candidate.id === consumerId)
    )
    .find(
      (candidate): candidate is z.infer<typeof productionRouteConsumerSchema> =>
        candidate?.class === "production-route"
    );
  if (!consumer) {
    fail(`${mappingId} has no canonical notification route`);
  }
  return consumer.routerPath;
}

function canonicalProviderAuthorizationContextHash(args: {
  assignmentIdentityHash: string;
  mappingId: string;
  organizationIdHash: string;
  provider: "Resend" | "WorkOS";
  recipientHash: string;
  roleHash: string;
  subjectIdHash: string;
  tenantIdHash: string;
}) {
  return sha256(
    stableLenderPortalEvidenceJson({
      assignmentIdentityHash: args.assignmentIdentityHash,
      mappingId: args.mappingId,
      organizationIdHash: args.organizationIdHash,
      provider: args.provider,
      recipientHash: args.recipientHash,
      roleHash: args.roleHash,
      subjectIdHash: args.subjectIdHash,
      tenantIdHash: args.tenantIdHash,
    })
  );
}

function decodeAuthenticatedProviderReadback(args: {
  expected: Record<string, unknown>;
  expectedAuthorizationContextHash: string;
  expectedResourceId: string;
  provider: "Resend" | "WorkOS";
  readback: {
    authorizationContextHash: string;
    method: "authenticated-api-readback";
    requestId: string;
    requestUrl: string;
    responseBase64: string;
    responseSha256: string;
  };
  uniqueness: OperationalEvidenceUniqueness;
}) {
  if (args.uniqueness.providerRequestIds.has(args.readback.requestId)) {
    fail(`${args.provider} authenticated API request ID is reused`);
  }
  args.uniqueness.providerRequestIds.add(args.readback.requestId);
  const response = Buffer.from(args.readback.responseBase64, "base64");
  if (
    response.toString("base64") !== args.readback.responseBase64 ||
    sha256(response) !== args.readback.responseSha256
  ) {
    fail(`${args.provider} authenticated API response digest is invalid`);
  }
  const requestUrl = new URL(args.readback.requestUrl);
  const expectedOrigin =
    args.provider === "WorkOS"
      ? "https://api.workos.com"
      : "https://api.resend.com";
  const expectedPath = `${
    args.provider === "WorkOS" ? "/events/" : "/emails/"
  }${encodeURIComponent(args.expectedResourceId)}`;
  if (
    requestUrl.origin !== expectedOrigin ||
    args.readback.authorizationContextHash !==
      args.expectedAuthorizationContextHash
  ) {
    fail(`${args.provider} evidence is not an authenticated provider readback`);
  }
  if (requestUrl.pathname !== expectedPath || requestUrl.search) {
    fail(
      `${args.provider} authenticated provider resource does not match its receipt record`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.toString("utf8"));
  } catch {
    fail(`${args.provider} authenticated API response is not JSON`);
  }
  if (
    stableLenderPortalEvidenceJson(parsed) !==
    stableLenderPortalEvidenceJson(args.expected)
  ) {
    fail(`${args.provider} authenticated API response is stale or fabricated`);
  }
}

function validateProviderReceipt(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  parsedProof: Record<string, unknown>;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const receiptUri = String(args.parsedProof.providerReceiptUri);
  if (args.uniqueness.receiptUris.has(receiptUri)) {
    fail("Provider delivery receipt is reused");
  }
  args.uniqueness.receiptUris.add(receiptUri);
  const receipt = fetchEvidence({
    contract: args.contract,
    label: "Provider delivery receipt",
    testOnlyHooks: args.testOnlyHooks,
    url: receiptUri,
  });
  if (sha256(receipt) !== args.parsedProof.providerReceiptSha256) {
    fail("Provider delivery receipt digest is invalid");
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: "Provider delivery GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.githubAttestationBundleUri),
  });
  if (sha256(bundle) !== args.parsedProof.githubAttestationBundleSha256) {
    fail("Provider delivery attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    artifact: receipt,
    artifactSha256: String(args.parsedProof.providerReceiptSha256),
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: "Provider delivery receipt",
    testOnlyHooks: args.testOnlyHooks,
  });
  const parsed = providerWebhookReceiptSchema.parse(
    JSON.parse(receipt.toString("utf8"))
  );
  const expectedMappingIds = mappingIdsForOperationalGate(
    args.contract,
    "provider-and-webhook-delivery"
  );
  const expectedTenantIdHash = trustedProviderTenantIdHash(
    args.contract,
    expectedMappingIds,
    "WorkOS"
  );
  if (
    parsed.commitSha !== args.attestation.payload.candidateSha ||
    parsed.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    parsed.deploymentId !== args.attestation.payload.deployment.id ||
    parsed.releaseId !== args.attestation.payload.releaseId ||
    parsed.provider !== args.parsedProof.provider ||
    parsed.providerAccountId !== args.parsedProof.providerAccountId ||
    stableLenderPortalEvidenceJson(args.parsedProof.mappingIds) !==
      stableLenderPortalEvidenceJson(expectedMappingIds)
  ) {
    fail("Provider delivery receipt is fabricated, stale, or unrelated");
  }
  if (
    parsed.tenantIdHash !== expectedTenantIdHash ||
    args.parsedProof.tenantIdHash !== expectedTenantIdHash
  ) {
    fail("WorkOS tenant is not bound to the source-owned production principal");
  }
  assertExactValues(
    parsed.records.map((record) => record.mappingId),
    expectedMappingIds,
    "Provider receipt mapping records"
  );
  for (const record of parsed.records) {
    const trustedPrincipal = trustedEvidencePrincipalForMapping(
      args.contract,
      record.mappingId
    );
    const occurredAt = Date.parse(record.occurredAt);
    if (
      record.assignmentIdentityHash !==
        trustedPrincipal.assignmentIdentityHash ||
      record.tenantIdHash !== expectedTenantIdHash ||
      record.organizationIdHash !== trustedPrincipal.organizationIdHash ||
      record.recipientHash !== trustedPrincipal.recipientHash ||
      record.roleHash !== trustedPrincipal.roleHash ||
      record.subjectIdHash !== trustedPrincipal.subjectIdHash
    ) {
      fail(
        `${record.mappingId} provider tenant, organization, role, or recipient is not bound to its source-owned production evidence principal`
      );
    }
    if (
      record.route !==
        canonicalRouteForMapping(args.contract, record.mappingId) ||
      occurredAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
      occurredAt > args.recordedAt
    ) {
      fail(`${record.mappingId} provider receipt is stale or misrouted`);
    }
    if (
      args.uniqueness.deliveryIds.has(record.deliveryId) ||
      args.uniqueness.eventIds.has(record.webhookEventId) ||
      args.uniqueness.correlationIds.has(record.correlationId)
    ) {
      fail(`${record.mappingId} provider identifiers are reused`);
    }
    args.uniqueness.deliveryIds.add(record.deliveryId);
    args.uniqueness.eventIds.add(record.webhookEventId);
    args.uniqueness.correlationIds.add(record.correlationId);
    decodeAuthenticatedProviderReadback({
      expected: {
        accountId: parsed.providerAccountId,
        assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        organizationIdHash: trustedPrincipal.organizationIdHash,
        recipientHash: trustedPrincipal.recipientHash,
        roleHash: trustedPrincipal.roleHash,
        route: record.route,
        status: record.status,
        subjectIdHash: trustedPrincipal.subjectIdHash,
        tenantIdHash: expectedTenantIdHash,
        webhookEventId: record.webhookEventId,
      },
      expectedAuthorizationContextHash:
        canonicalProviderAuthorizationContextHash({
          assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
          mappingId: record.mappingId,
          organizationIdHash: trustedPrincipal.organizationIdHash,
          provider: "WorkOS",
          recipientHash: trustedPrincipal.recipientHash,
          roleHash: trustedPrincipal.roleHash,
          subjectIdHash: trustedPrincipal.subjectIdHash,
          tenantIdHash: expectedTenantIdHash,
        }),
      expectedResourceId: record.webhookEventId,
      provider: "WorkOS",
      readback: record.readback,
      uniqueness: args.uniqueness,
    });
  }
}

function validateInboxReceipt(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  parsedProof: Record<string, unknown>;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const receiptUri = String(args.parsedProof.receiptUri);
  if (args.uniqueness.receiptUris.has(receiptUri)) {
    fail("Inbox receipt is reused");
  }
  args.uniqueness.receiptUris.add(receiptUri);
  const receipt = fetchEvidence({
    contract: args.contract,
    label: "Inbox delivery and reauthorization receipt",
    testOnlyHooks: args.testOnlyHooks,
    url: receiptUri,
  });
  if (sha256(receipt) !== args.parsedProof.receiptSha256) {
    fail("Inbox receipt digest is invalid");
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: "Inbox receipt GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.githubAttestationBundleUri),
  });
  if (sha256(bundle) !== args.parsedProof.githubAttestationBundleSha256) {
    fail("Inbox receipt attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    artifact: receipt,
    artifactSha256: String(args.parsedProof.receiptSha256),
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: "Inbox receipt",
    testOnlyHooks: args.testOnlyHooks,
  });
  const parsed = inboxReceiptSchema.parse(JSON.parse(receipt.toString("utf8")));
  const expectedMappingIds = mappingIdsForOperationalGate(
    args.contract,
    "inbox-and-reauthorized-links"
  );
  const expectedTenantIdHash = trustedProviderTenantIdHash(
    args.contract,
    expectedMappingIds,
    "Resend"
  );
  if (
    parsed.commitSha !== args.attestation.payload.candidateSha ||
    parsed.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    parsed.deploymentId !== args.attestation.payload.deployment.id ||
    parsed.releaseId !== args.attestation.payload.releaseId ||
    parsed.provider !== args.parsedProof.inboxProvider ||
    parsed.providerAccountId !== args.parsedProof.providerAccountId ||
    stableLenderPortalEvidenceJson(args.parsedProof.mappingIds) !==
      stableLenderPortalEvidenceJson(expectedMappingIds)
  ) {
    fail("Inbox receipt is fabricated, stale, or unrelated");
  }
  if (
    parsed.tenantIdHash !== expectedTenantIdHash ||
    args.parsedProof.tenantIdHash !== expectedTenantIdHash
  ) {
    fail("Resend tenant is not bound to the source-owned production principal");
  }
  assertExactValues(
    parsed.records.map((record) => record.mappingId),
    expectedMappingIds,
    "Inbox receipt mapping records"
  );
  for (const record of parsed.records) {
    const trustedPrincipal = trustedEvidencePrincipalForMapping(
      args.contract,
      record.mappingId
    );
    const occurredAt = Date.parse(record.occurredAt);
    if (
      record.assignmentIdentityHash !==
        trustedPrincipal.assignmentIdentityHash ||
      record.tenantIdHash !== expectedTenantIdHash ||
      record.organizationIdHash !== trustedPrincipal.organizationIdHash ||
      record.recipientHash !== trustedPrincipal.recipientHash ||
      record.roleHash !== trustedPrincipal.roleHash ||
      record.subjectIdHash !== trustedPrincipal.subjectIdHash
    ) {
      fail(
        `${record.mappingId} inbox tenant, organization, role, or recipient is not bound to its source-owned production evidence principal`
      );
    }
    if (
      record.linkPath !==
        canonicalRouteForMapping(args.contract, record.mappingId) ||
      occurredAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
      occurredAt > args.recordedAt
    ) {
      fail(`${record.mappingId} inbox receipt is stale or misrouted`);
    }
    if (
      args.uniqueness.deliveryIds.has(record.deliveryId) ||
      args.uniqueness.messageIds.has(record.messageId) ||
      args.uniqueness.correlationIds.has(record.correlationId)
    ) {
      fail(`${record.mappingId} inbox identifiers are reused`);
    }
    args.uniqueness.deliveryIds.add(record.deliveryId);
    args.uniqueness.messageIds.add(record.messageId);
    args.uniqueness.correlationIds.add(record.correlationId);
    decodeAuthenticatedProviderReadback({
      expected: {
        accountId: parsed.providerAccountId,
        assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        linkPath: record.linkPath,
        messageId: record.messageId,
        organizationIdHash: trustedPrincipal.organizationIdHash,
        recipientHash: trustedPrincipal.recipientHash,
        roleHash: trustedPrincipal.roleHash,
        status: record.status,
        subjectIdHash: trustedPrincipal.subjectIdHash,
        tenantIdHash: expectedTenantIdHash,
      },
      expectedAuthorizationContextHash:
        canonicalProviderAuthorizationContextHash({
          assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
          mappingId: record.mappingId,
          organizationIdHash: trustedPrincipal.organizationIdHash,
          provider: "Resend",
          recipientHash: trustedPrincipal.recipientHash,
          roleHash: trustedPrincipal.roleHash,
          subjectIdHash: trustedPrincipal.subjectIdHash,
          tenantIdHash: expectedTenantIdHash,
        }),
      expectedResourceId: record.messageId,
      provider: "Resend",
      readback: record.readback,
      uniqueness: args.uniqueness,
    });
  }
}

function validateOperationalProofs(args: {
  artifactPayloads: Map<string, unknown>;
  artifacts: Map<string, Artifact>;
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
  usedArtifactIds: Set<string>;
}) {
  const proofs = args.attestation.payload.operationalGates;
  assertExactValues(
    proofs.map((proof) => proof.id),
    args.contract.operationalGates.map((gate) => gate.id),
    "Operational evidence"
  );
  const gates = new Map(
    args.contract.operationalGates.map((gate) => [gate.id, gate])
  );
  const uniqueness: OperationalEvidenceUniqueness = {
    authSessionDigests: new Set(),
    correlationIds: new Set(),
    deliveryIds: new Set(),
    eventIds: new Set(),
    manifestUris: new Set(),
    messageIds: new Set(),
    providerRequestIds: new Set(),
    receiptUris: new Set(),
    runIds: new Set(),
    sessionIds: new Set(),
    traceDigests: new Set(),
    traceUris: new Set(),
  };
  for (const proof of proofs) {
    if (args.usedArtifactIds.has(proof.artifactId)) {
      fail(`${proof.id} reuses an evidence artifact`);
    }
    args.usedArtifactIds.add(proof.artifactId);
    const gate = gates.get(proof.id);
    const artifact = args.artifacts.get(proof.artifactId);
    if (!(gate && artifact) || artifact.kind !== gate.artifactKind) {
      fail(`${proof.id} references missing or wrong-kind gate evidence`);
    }
    const payload = operationalArtifactPayloadSchema.parse(
      args.artifactPayloads.get(proof.artifactId)
    );
    const parsedProof = requiredOperationalProof(
      proof.id,
      payload.proof,
      args.attestation
    ) as Record<string, unknown>;
    const recordedAt = validateRawOperationalResult({
      attestation: args.attestation,
      contract: args.contract,
      gateId: proof.id,
      parsedProof,
      testOnlyHooks: args.testOnlyHooks,
    });
    if (proof.id === "authenticated-production-browser") {
      validateBrowserObservations({
        attestation: args.attestation,
        contract: args.contract,
        observations: parsedProof.observations as BrowserObservation[],
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "provider-and-webhook-delivery") {
      validateProviderReceipt({
        attestation: args.attestation,
        contract: args.contract,
        parsedProof,
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "inbox-and-reauthorized-links") {
      validateInboxReceipt({
        attestation: args.attestation,
        contract: args.contract,
        parsedProof,
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "phase3-migration-cutover") {
      validatePhase3CutoverSemantics({
        attestation: args.attestation,
        proof: parsedProof as unknown as Phase3CutoverProof,
        repositoryRoot: args.repositoryRoot,
        testOnlyHooks: args.testOnlyHooks,
      });
    }
  }
}

function validateFreshness(
  contract: AcceptanceContract,
  attestation: SignedAttestation,
  now: number
) {
  const issuedAt = Date.parse(attestation.payload.issuedAt);
  const deployedAt = Date.parse(attestation.payload.deployment.deployedAt);
  const verifiedAt = Date.parse(
    attestation.payload.independentAcceptance.verifiedAt
  );
  const maximumAge = contract.attestationMaxAgeHours * 60 * 60 * 1000;
  if (
    deployedAt > now ||
    now - deployedAt > maximumAge ||
    verifiedAt > now ||
    now - verifiedAt > maximumAge ||
    issuedAt > now ||
    now - issuedAt > maximumAge ||
    deployedAt > verifiedAt ||
    verifiedAt > issuedAt
  ) {
    fail("Release attestation is stale or has an inconsistent time sequence");
  }
}

function validateIdentity(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  contractSha256: string;
  gitState: LenderPortalReleaseGitState;
}) {
  const payload = args.attestation.payload;
  if (payload.contractSha256 !== args.contractSha256) {
    fail("Release attestation does not match the current acceptance contract");
  }
  if (
    payload.candidateSha !== args.gitState.headSha ||
    payload.deployment.deployedCommitSha !== args.gitState.headSha
  ) {
    fail(
      "Release attestation commit does not match the immutable checkout HEAD"
    );
  }
  if (payload.deployment.sourceTreeSha !== args.gitState.treeSha) {
    fail(
      "Release attestation source tree does not match the immutable checkout tree"
    );
  }
  const deploymentUrl = new URL(payload.deployment.url);
  if (
    deploymentUrl.protocol !== "https:" ||
    deploymentUrl.username ||
    deploymentUrl.password ||
    deploymentUrl.port ||
    !args.contract.trustedDeploymentOrigins.includes(deploymentUrl.origin)
  ) {
    fail(
      "Release attestation deployment URL is outside the trusted production domain policy"
    );
  }
}

function loadAttestation(args: {
  contract: AcceptanceContract;
  evidenceLocation: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const contents = fetchEvidence({
    contract: args.contract,
    label: "Release attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: args.evidenceLocation,
  });
  const attestation = signedAttestationSchema.parse(
    JSON.parse(contents.toString("utf8"))
  );
  validateInitialEvidenceUrl(
    args.contract,
    attestation.payload.attestationUri,
    "Signed release attestation"
  );
  if (attestation.payload.attestationUri !== args.evidenceLocation) {
    fail("Signed release attestation URI does not match its durable location");
  }
  return attestation;
}

function resolveCurrentGitState(args: {
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("Release validation hooks are test-only");
    }
    return args.testOnlyHooks.readGitState();
  }
  return readLenderPortalReleaseGitState(args.repositoryRoot);
}

export function validateLenderPortalReleaseAcceptanceEvidence(args: {
  contract: AcceptanceContract;
  contractSha256: string;
  evidenceLocation: string;
  gitState: LenderPortalReleaseGitState;
  now?: number;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  validateTrustedPolicies(args.contract);
  if (!args.gitState.isClean || args.gitState.dirtyEntryCount !== 0) {
    fail(
      `Release validation requires a clean immutable checkout; found ${args.gitState.dirtyEntryCount} dirty entries`
    );
  }
  assertGitStateMatches(
    args.gitState,
    resolveCurrentGitState(args),
    "Release validation start"
  );
  const attestation = loadAttestation({
    contract: args.contract,
    evidenceLocation: args.evidenceLocation,
    testOnlyHooks: args.testOnlyHooks,
  });
  validateIdentity({
    attestation,
    contract: args.contract,
    contractSha256: args.contractSha256,
    gitState: args.gitState,
  });
  verifySignatures(attestation, args.testOnlyHooks);

  const artifactIds = attestation.payload.artifacts.map(
    (artifact) => artifact.id
  );
  const artifactUris = attestation.payload.artifacts.map(
    (artifact) => artifact.uri
  );
  const artifactDigests = attestation.payload.artifacts.map(
    (artifact) => artifact.sha256
  );
  assertUnique(artifactIds, "Evidence artifact IDs");
  assertUnique(artifactUris, "Evidence artifact URIs");
  assertUnique(artifactDigests, "Evidence artifact digests");
  const artifacts = new Map(
    attestation.payload.artifacts.map((artifact) => [artifact.id, artifact])
  );
  const independentArtifact = artifacts.get(
    attestation.payload.independentAcceptance.artifactId
  );
  const releaseArtifact = artifacts.get(
    attestation.payload.deployment.releaseArtifactId
  );
  if (
    !independentArtifact ||
    independentArtifact.kind !== "independent-review" ||
    independentArtifact.sha256 !==
      attestation.payload.independentAcceptance.artifactSha256
  ) {
    fail(
      "Independent acceptance must reference its own durable independent-review artifact"
    );
  }
  if (
    !releaseArtifact ||
    releaseArtifact.kind !== "release-artifact" ||
    releaseArtifact.sha256 !==
      attestation.payload.deployment.releaseArtifactSha256
  ) {
    fail(
      "Deployment must reference its own durable immutable release artifact"
    );
  }
  if (
    independentArtifact.uri === attestation.payload.attestationUri ||
    independentArtifact.uri === releaseArtifact.uri ||
    independentArtifact.sha256 === releaseArtifact.sha256
  ) {
    fail(
      "Independent acceptance evidence must be distinct from release evidence and attestation"
    );
  }

  const artifactPayloads = new Map<string, unknown>();
  for (const artifact of attestation.payload.artifacts) {
    const contents = fetchEvidence({
      contract: args.contract,
      label: artifact.id,
      testOnlyHooks: args.testOnlyHooks,
      url: artifact.uri,
    });
    artifactPayloads.set(
      artifact.id,
      artifactEnvelope(contents, artifact, args.gitState)
    );
  }
  const releasePayload = operationalArtifactPayloadSchema.parse(
    artifactPayloads.get(releaseArtifact.id)
  );
  requiredOperationalProof(
    "exact-release-commit",
    releasePayload.proof,
    attestation
  );
  const releaseBundle = fetchEvidence({
    contract: args.contract,
    label: "Immutable release bundle",
    testOnlyHooks: args.testOnlyHooks,
    url: attestation.payload.deployment.releaseBundleUri,
  });
  if (
    sha256(releaseBundle) !== attestation.payload.deployment.releaseBundleSha256
  ) {
    fail(
      "Immutable release bundle digest does not match the signed deployment"
    );
  }
  const releaseBundleAttestation = fetchEvidence({
    contract: args.contract,
    label: "Immutable release bundle GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: attestation.payload.deployment.releaseBundleGithubAttestationUri,
  });
  if (
    sha256(releaseBundleAttestation) !==
    attestation.payload.deployment.releaseBundleGithubAttestationSha256
  ) {
    fail("Immutable release bundle attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    allowPreDeployment: true,
    artifact: releaseBundle,
    artifactSha256: attestation.payload.deployment.releaseBundleSha256,
    attestation,
    attestationBundle: releaseBundleAttestation,
    contract: args.contract,
    label: "Immutable release bundle",
    testOnlyHooks: args.testOnlyHooks,
  });
  let releaseManifestValue: unknown;
  try {
    releaseManifestValue = JSON.parse(releaseBundle.toString("utf8"));
  } catch {
    fail("Immutable release bundle does not contain build provenance JSON");
  }
  const releaseManifest = parseReleaseBundleManifest(
    releaseManifestValue,
    attestation.payload.deployment.deployedAt
  );
  if (
    releaseManifest.releaseId !== attestation.payload.releaseId ||
    releaseManifest.commitSha !== attestation.payload.candidateSha ||
    releaseManifest.sourceTreeSha !==
      attestation.payload.deployment.sourceTreeSha ||
    releaseManifest.deploymentId !== attestation.payload.deployment.id ||
    Date.parse(releaseManifest.build.startedAt) >
      Date.parse(releaseManifest.build.finishedAt) ||
    Date.parse(releaseManifest.build.finishedAt) >
      Date.parse(attestation.payload.issuedAt)
  ) {
    fail("Immutable release bundle build provenance is stale or foreign");
  }
  assertUnique(
    releaseManifest.artifacts.map((artifact) => artifact.path),
    "Release bundle artifact paths"
  );
  assertUnique(
    releaseManifest.artifacts.map((artifact) => artifact.sha256),
    "Release bundle artifact digests"
  );
  const independentPayload = operationalArtifactPayloadSchema.parse(
    artifactPayloads.get(independentArtifact.id)
  );
  z.object({
    attestationUri: z.literal(attestation.payload.attestationUri),
    decision: z.literal("accepted"),
    releaseArtifactId: z.literal(releaseArtifact.id),
    releaseArtifactSha256: z.literal(releaseArtifact.sha256),
    reviewerDisplayName: z.literal(
      attestation.payload.independentAcceptance.reviewerDisplayName
    ),
    reviewerId: z.literal(attestation.payload.independentAcceptance.reviewerId),
  })
    .strict()
    .parse(independentPayload.proof);

  const usedArtifactIds = new Set<string>();
  const usedReportDigests = new Set<string>();
  const usedReportIds = new Set<string>();
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Production surface evidence",
    mappings: args.contract.surfaces,
    proofs: attestation.payload.surfaces,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Journey evidence",
    mappings: args.contract.journeys,
    proofs: attestation.payload.journeys,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Vertical-slice evidence",
    mappings: args.contract.verticalSliceGates,
    proofs: attestation.payload.verticalSliceGates,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateOperationalProofs({
    artifactPayloads,
    artifacts,
    attestation,
    contract: args.contract,
    repositoryRoot: args.repositoryRoot,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
  });
  validateFreshness(args.contract, attestation, args.now ?? Date.now());
  assertGitStateMatches(
    args.gitState,
    resolveCurrentGitState(args),
    "Release validation completion"
  );
  return attestation;
}

function parseCliArgument(prefix: string) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

if (import.meta.main) {
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const contractResult = validateLenderPortalProductionAcceptanceContract({
    repositoryRoot,
  });
  const evidenceLocation = parseCliArgument("--evidence=");
  const contractOnly = process.argv.slice(2).includes("--contract-only");
  if (contractOnly && evidenceLocation) {
    fail("Use either --contract-only or --evidence, not both");
  }
  if (contractOnly) {
    console.log(
      `Non-release acceptance contract validation passed (${contractResult.contractSha256})`
    );
  } else {
    if (!evidenceLocation) {
      fail(
        "Release acceptance validation requires --evidence=<trusted GitHub release attestation URL>"
      );
    }
    const gitState = readLenderPortalReleaseGitState(repositoryRoot);
    validateLenderPortalReleaseAcceptanceEvidence({
      contract: contractResult.contract,
      contractSha256: contractResult.contractSha256,
      evidenceLocation,
      gitState,
      repositoryRoot,
    });
  }
}

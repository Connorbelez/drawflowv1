/**
 * Immutable lender-portal release trust root.
 *
 * This policy is source-owned and therefore bound to the reviewed Git commit
 * and Git tree. The mutable acceptance contract may repeat these claims for
 * transparency, but it cannot introduce or rotate trust. Any policy rotation
 * requires an independently reviewed source change and a new immutable release
 * commit.
 */
export const LENDER_PORTAL_PRODUCTION_TRUST_ROOT = {
  schemaVersion: "lender-portal-production-trust-root/v1",
  github: {
    repository: "Connorbelez/drawflowv1",
    oidcIssuer: "https://token.actions.githubusercontent.com",
    sourceDigestPolicy: "candidate-commit",
    allowedWorkflows: [
      {
        signerDigest: "62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4",
        signerWorkflow:
          "github.com/Connorbelez/drawflowv1/.github/workflows/lender-portal-production-evidence.yml",
      },
    ],
    initialOrigin: "https://github.com",
    releaseAssetRedirects: [
      {
        origin: "https://release-assets.githubusercontent.com",
        pathnamePattern:
          "^/github-production-release-asset/[0-9]+/[A-Za-z0-9-]+(?:/[A-Za-z0-9._-]+)?$",
      },
    ],
  },
  deploymentOrigins: ["https://drawflow.fairlend.ca"],
  authKit: {
    sessionCookieName: "wos-session",
    sessionCookieDomain: "drawflow.fairlend.ca",
  },
  productionEvidencePrincipals: [
    {
      assignmentIdentityHash:
        "1705156b9945bb569c18e4989978048a0ba7f834f0e9ee940be6dedbc85d6fda",
      organizationIdHash:
        "94b654f43c9f6d4289f2eb397d0ce34a20ac791c163d1d024a58adf408b224f0",
      providerTenantIdHashes: {
        Resend:
          "e8fc6501b37ca1df1a7cbeb46849e3ec5242507b3fe330b9f0e6e70707ba077a",
        WorkOS:
          "ef84e796aa44f6744e2344f3e7b24a1048c02aa46a8afefe96def9034e31efa5",
      },
      recipientHash:
        "caf9371f35f93efa7535b09a0349b0c3599c3db2505af6c9452d376e0ee356d4",
      role: "backoffice",
      roleHash:
        "66e1d4c07bd6a84028577d882daa083819b3e552073ba19d3a3f28a9b29b712c",
      subjectIdHash:
        "a7341a6095dc6ca5bd23b3f4cf65eba2f352ba884b953ca622bf72dd2d24ff74",
    },
    {
      assignmentIdentityHash:
        "eb4d8e22d644a066a42276831b9f3746d43af3be3a696b3524430024fbd0ccf4",
      organizationIdHash:
        "aac2a15dfa2ec8790660f46fea4b9f7c88eb1705eb07bdf1077c6ae31f405907",
      providerTenantIdHashes: {
        Resend:
          "e8fc6501b37ca1df1a7cbeb46849e3ec5242507b3fe330b9f0e6e70707ba077a",
        WorkOS:
          "ef84e796aa44f6744e2344f3e7b24a1048c02aa46a8afefe96def9034e31efa5",
      },
      recipientHash:
        "33bcf59d5536bc8be3e5384c8aa05c5a5117c7eefa526dca23879ca7ab2628b8",
      role: "builder",
      roleHash:
        "018b39478d9d7f842f4162f8167bd4204962b5ebfe4c32296457690e915dd658",
      subjectIdHash:
        "82a22046361304718d479ebef25afda8aa54e7d92b268bc1522388969494286b",
    },
    {
      assignmentIdentityHash:
        "6afb5eca4347fa79f4521688b996415d1ee56e8ddc72f111be430b707bf99b77",
      organizationIdHash:
        "09d5f3f99029aad808340e1e760af9e606c79b204634260723dc18dd618961f5",
      providerTenantIdHashes: {
        Resend:
          "e8fc6501b37ca1df1a7cbeb46849e3ec5242507b3fe330b9f0e6e70707ba077a",
        WorkOS:
          "ef84e796aa44f6744e2344f3e7b24a1048c02aa46a8afefe96def9034e31efa5",
      },
      recipientHash:
        "52ba3ee1be07d8396f87037a9c3877d2cd731cf195801aec1f87e9564b608eb6",
      role: "lender-admin",
      roleHash:
        "bb66e725ef064fff6863005090e060f8b667f3c0c361de3c589fab534f50598a",
      subjectIdHash:
        "23e42a9dd31579d646aa8af2d927678bd72cd9b9acbc19fc386dfa0d5cfcb749",
    },
  ],
  releaseKeys: [
    {
      id: "fairlend-release-v1",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA15s4ohkhIZGQ2i6kkRM59+JhVF6tkXKR+oAIdwqoty8=\n-----END PUBLIC KEY-----\n",
      sha256:
        "14e8198fc8ae722d17cc95084c569d39145d9bdc24ef9c68e363f8180493ae84",
    },
  ],
  reviewers: [
    {
      id: "fairlend-independent-review-v1",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA0u/x68Sc9tl5MJ+L39dzaj9Nx9yMIhCa+3Ul41MGm2g=\n-----END PUBLIC KEY-----\n",
      reviewerId: "fairlend-independent-release-review",
      reviewerDisplayName: "FairLend Independent Release Review",
      sha256:
        "acf342812860f41030eef766a494ede0d9aac070c675ddbfa6ff8ea8bc4dbee6",
    },
  ],
  runners: {
    playwright: {
      executablePath: "node_modules/@playwright/test/cli.js",
      executableSha256:
        "79e23e6a249176295b8490567daa7717448a75866d6ea6f6b296ff3d23305c69",
      version: "1.59.1",
    },
    vitest: {
      executablePath: "node_modules/vitest/vitest.mjs",
      executableSha256:
        "39db22f579acf5639bbb17a261408debbde03f4692c0c439e77e7f13aeba74d6",
      version: "3.2.4",
    },
  },
  executables: {
    bun: {
      path: "/opt/homebrew/bin/bun",
      sha256:
        "1d77af7bfd811aebb7d37bec496a5eed14fe227ded3ab7866d2f39786e8107b6",
      version: "1.3.11",
    },
    curl: {
      path: "/usr/bin/curl",
      sha256:
        "5ab042572ea0e068644e3b8f9e8dd1ad197bfcf33d199316615b46ddc4390a41",
    },
    gh: {
      path: "/opt/homebrew/bin/gh",
      sha256:
        "02d2d4a85241c6a8c0b77ebb1ec76fc723caf7fb128e00915b306b968847cba1",
    },
    git: {
      path: "/usr/bin/git",
      sha256:
        "179301dcb41ea78accc3fa0048a7e6f6710d891945a751a34addd622020c1818",
    },
  },
} as const;

export type LenderPortalProductionTrustRoot =
  typeof LENDER_PORTAL_PRODUCTION_TRUST_ROOT;

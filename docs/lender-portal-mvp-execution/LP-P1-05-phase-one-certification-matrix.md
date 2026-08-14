# LP-P1-05 Phase 1 certification matrix

Prepared: 2026-08-14  
Branch: `codex/lp-phase-1-completion`  
Candidate: bound in the final exact-SHA evidence after the implementation
commit and consolidated review

This matrix audits the Phase 1 implementation before independent acceptance.
It does not mark any deferred review gate accepted.

## Canonical ownership audit

| Boundary | Canonical owner used | Parallel owner check |
|---|---|---|
| Organization, membership, roles, permissions | WorkOS plus `workosProjection` webhook/sync projection | No lender organization, lender membership, `manager`, or lender role-alias table or capability was added. |
| Brokerage tenant | Existing `brokerages` row linked by `workosOrganizationId` | No portal-specific tenant row was added. |
| Active organization authorization | `resolveActiveLenderOrganizationContext` and lender fluent builders in `authz.ts` | The browser never supplies an organization selector to the lender read model. |
| WorkOS commands | Existing `workosManagement` actions and protected transfer operation | The lender UI performs no optimistic projection write. |
| Review policy | Existing immutable Back Office/domain policy boundaries | Organization management describes effects only and exposes no policy mutation. |
| Audit | Existing `auditEvents` plus reconciliation keys and `workosManagementOperations` | The Phase 1 read model writes no duplicate history. |

The repository ownership scan found no production `lenderOrganizations`,
`lenderMembership`, `lender-manager`, `lenderManager`, or portal approval-policy
owner. The unrelated `managerRoles` variable in `build_participants.ts` is a
Build participant grouping, not a lender organization role or alias.

## Phase 1 work criteria

| ID | Result | Implementation and verification |
|---|---|---|
| `LP-P1-W01` | Implemented | LP-P1-01 preflight and inventory identify the existing WorkOS projection, brokerage, role, permission, invitation, webhook, and sync boundaries. |
| `LP-P1-W02` | Implemented | One active organization is resolved server-side; multi-organization membership remains canonical and is tested in `authz.test.ts` and `workos_projection.test.ts`. |
| `LP-P1-W03` | Implemented for Phase 1 | Existing role/capability helpers are extended by lender organization and lender user-management builders. Assignment and locked-policy eligibility remain named later-phase inputs rather than fabricated Phase 1 state. |
| `LP-P1-W04` | Implemented | Production lender operations reuse `workosManagement`; the promoted route never writes WorkOS projections. Existing legacy development proposal-fixture helpers are not reachable from the lender route and are not an identity owner or production membership command. |
| `LP-P1-W05` | Implemented | Active-organization server scope plus exact `admin`, `principle-broker`, `broker`, and `broker-staff` roles; unsupported roles fail closed. |
| `LP-P1-W06` | Implemented | Ordinary Principal Broker removal, role change, deactivation, and reactivation return transfer-required. Protected transfer is idempotent, auditable, recoverable, and preserves exactly one active Principal Broker. |
| `LP-P1-W07` | Implemented | Variant E is extracted and used directly by prototype and production. It composes the existing `UserManagementDirectoryTable` and `UserDetailSheet` and preserves the four tabs. |
| `LP-P1-W08` | Implemented | Draft validation, review, authorization, pending submission, accepted/waiting-for-sync, protected, and failure states are visible. The membership-effect boundary defines implemented and later-phase consumers without policy mutation. |
| `LP-P1-W09` | Implemented | Provisioning and WorkOS lifecycle commands record actor, roles, time, prior/new state, warnings, reason where applicable, and reconciliation/idempotency keys. |

## Phase 1 test criteria

| ID | Result | Automated or browser proof |
|---|---|---|
| `LP-P1-T01` | Pass | Multi-organization context and tenant-scoped projection tests; lender read model accepts no client organization id. |
| `LP-P1-T02` | Pass | Cross-organization target, unsupported role, and Broker administration denials in `authz.test.ts`, `workosManagement.test.ts`, `workos_projection.test.ts`, and the route guard test. |
| `LP-P1-T03` | Pass | Protected command tests plus idempotent/partial-failure Principal Broker transfer tests. |
| `LP-P1-T04` | Pass | Adapter failure, delayed sync, transfer retry, and no-optimistic-projection assertions in `workosManagement.test.ts`; production status copy waits for reconciliation. |
| `LP-P1-T05` | Pass | Active projection middleware denies inactive membership. Read-model deactivation removes current access state, and the live signed-in unsupported role renders the route-scoped restricted state without organization data. |
| `LP-P1-T06` | Pass | Deactivation preserves the canonical membership row and organization audit history; repeated read reconstruction is write-free. |
| `LP-P1-T07` | Pass for available Phase 1 consumers | Current authorization and search authority reconcile from canonical membership. Proposal assignment (Phase 2), review quorum (Phase 4), participant queues/counts (Phase 7), and recipients/notification intent (Phase 8) do not yet exist; deterministic input contracts are returned and documented, and no locked policy snapshot is edited. |

## Phase 1 exit criteria

| ID | Result | Proof |
|---|---|---|
| `LP-P1-X01` | Pass | Every added lender read or command resolves authenticated active-organization context on the server; product assignment/policy authority is explicitly unavailable until its owning phase. |
| `LP-P1-X02` | Pass | Back Office regression tests remain green. Lender Admin and Principal Broker use the approved Variant E composition and WorkOS-first command matrix. |
| `LP-P1-X03` | Pass | No parallel lender organization, membership, manager capability, role alias, or lender-owned review policy was introduced. |
| `LP-P1-X04` | Pass | Allowed same-organization Admin/Principal Broker cases are green; Broker, foreign organization, foreign tenant/resource, missing organization, inactive membership, and unauthenticated cases are red. |

## E2E-08 boundary matrix

| Boundary | Actors | Result and evidence |
|---|---|---|
| Brokerage provisioning | Back Office Admin, canonical WorkOS projection | Provisioning requires the authoritative organization projection and preserves the WorkOS organization name. |
| Same-organization administration | Lender Admin or Principal Broker, member | Route guard, Convex middleware, supported-role validation, and focused action tests pass. |
| Cross-organization denial | Lender administrator, foreign membership/resource | Target-scope resolution fails before calling the adapter; read projection returns only the active organization. |
| Invite and role change | Administrator, WorkOS adapter, webhook projection | Accepted commands return waiting-for-sync and audit warnings; no optimistic membership row appears. |
| Deactivation and reactivation | Administrator, member | Required reason/history acknowledgement in UI; command authorization and canonical read-model reconciliation pass. |
| Principal Broker transfer | Current Principal Broker, replacement | Normal command fails closed; protected transfer is idempotent, partial-failure recoverable, audited, and webhook-reconciled. |
| History and rebuild | Administrator, canonical audit/projection | Historical membership and audit rows remain readable; repeated read reconstruction changes no receipt or audit count. |
| Browser boundary | Signed-in unsupported projected role | `/lender/organization` renders Access restricted and exposes no organization rows. Accepted Variant E is exact-pixel stable at desktop and usable at 390px. |

## Variant E mismatch ledger

The pre-extraction `810d39f9` screenshot and extracted prototype screenshot are
both 1778 × 1234 pixels. The strict comparison passed with MAE `0.0`, p95 `0.0`,
SSIM `1.0`, and `100%` exact pixels. See
`LP-P1-04-visual-verification.md` for artifact paths and interaction evidence.

## Vertical-slice consumer disposition

The authoritative consumer inventory is
`LP-P1-03-membership-consumer-inventory.md`. Implemented authorization,
collaboration search authority, organization management, Build/cost-document
operations, Back Office support, and audit/history consumers either reconcile
or reread canonical state. The absent Phase 2/4/7/8 consumers have named owners
and deterministic inputs. External API, analytics, reporting, and support
contracts remain explicitly unknown until Phase 9 rather than inferred.

## Deferred final gates

The following occur only after the clean candidate commit exists, per the
user's explicit consolidated-review instruction:

1. CodeRabbit CLI review of the full Phase 1 candidate range.
2. Independent exact-SHA acceptance review of LP-P1-03, LP-P1-04, and LP-P1-05
   plus confirmation that prior LP-P1-01/02 evidence remains valid.
3. Exact-SHA evidence files and tracking changes from `in-progress`/`ready` to
   `verified` only after zero unresolved material findings.

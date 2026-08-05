# Cost Documents and Quote Solicitation rollout and certification

This runbook governs the ENG-383 Cost Documents and Quote Solicitation release.
It treats canonical Cost/Quote state, private files, invitation credentials,
communication delivery, audit history, and retention as one public application
workflow. It does not authorize direct production-table mutation or manual
rewriting of immutable history.

## Certification states

Run the governed certifier against one clean Git commit:

```sh
bun run certify:cost-quote-workflow -- \
  --application-origin https://<production-host> \
  --output /absolute/evidence/path/cost-quote-automated.json
```

The certifier writes SHA-256-addressed command logs and one JSON result bound to
Git HEAD. Without manual evidence, the only successful status is
`automated_passed_manual_qa_pending`. That result proves the automated gates but
does **not** claim visual certification.

After every ENG-384 through ENG-403 ticket is in Linear `In Review`, complete
the browser matrix in this runbook with the signed-in all-roles account, the
Codex in-app browser, and GPT-5.6 Luna. Then run:

```sh
bun run certify:cost-quote-workflow -- \
  --application-origin https://<production-host> \
  --output /absolute/evidence/path/cost-quote-certified.json \
  --visual-evidence /absolute/evidence/path/manual-browser-qa.json
```

Only a complete, exact-commit manual evidence file can produce `certified`.
Arc evidence, another model, another commit, missing workflows, missing or
tampered screenshots, horizontal overflow, inaccessible controls, hierarchy
drift, or unexpected console errors fail closed.

## 1. Release scope and ownership

Record these values before deployment:

- immutable 40-character Git commit;
- target Vercel deployment ID and application origin;
- target Convex deployment name, cloud URL, and site URL;
- WorkOS environment and organization used for post-deploy read-back;
- representative Build, Builder Owner, Builder Staff, Homeowner, eligible and
  ineligible Contractor, Backoffice, and provisional recipient identities;
- Resend verified sending domain and webhook endpoint;
- operator WorkOS user ID and incident/change reference; and
- evidence directory outside the repository.

The application and Convex deployment must represent the same Git commit. Never
certify a local tree with tracked changes or combine evidence from different
deployments.

## 2. Environment configuration

Set secrets through Vercel, Convex, WorkOS, or Resend administration. Never put
secret values in the repository or evidence logs.

Required application/runtime configuration:

| Variable | Owner | Requirement |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vercel | Exact production Convex cloud URL |
| `WORKOS_CLIENT_ID` | Convex | WorkOS client for the target environment |
| `WORKOS_API_KEY` | Convex | Management API key for governed WorkOS changes |
| `CONVEX_SITE_URL` | Convex | HTTPS site URL used by private response uploads |
| `QUOTE_INVITATION_PUBLIC_ORIGIN` | Convex | HTTPS public application origin; loopback only in local development |
| `COMMUNICATION_TOKEN_SECRET` | Convex | At least 32 random bytes; rotation invalidates outstanding invitation links |
| `DATA_RETENTION_TOMBSTONE_HMAC_KEY` | Convex | Dedicated HMAC key required before destructive retention work |
| `RESEND_API_KEY` | Convex | Resend key for the verified sending domain |
| `RESEND_FROM_EMAIL` | Convex | Sender on the verified Resend domain |
| `RESEND_WEBHOOK_SECRET` | Convex | Written by the governed webhook configuration command |
| `VITE_CONVEX_SITE_URL` | operator shell | Target used only while configuring the Resend webhook |

Read back non-secret values and the presence—not the value—of every secret from
the target environment. Stop if origins, deployment names, or sender domains do
not match the release record.

## 3. Pre-deploy data validation and migration

1. Back up Convex documents and file storage and record the verified backup
   manifest. It must satisfy the 24-hour RPO predicate before destructive
   recovery could be authorized.
2. Preview the Quote Response Template identity migration:

   ```sh
   bun x convex run --prod \
     quote_response_template_migrations:runQuoteResponseTemplateVersionIdentityBackfill \
     '{"dryRun":true,"oneBatchOnly":true}'
   ```

3. Run it to completion:

   ```sh
   bun x convex run --prod \
     quote_response_template_migrations:runQuoteResponseTemplateVersionIdentityBackfill
   ```

4. Require the migration component to report `state: "success"`,
   `isDone: true`, and no error:

   ```sh
   bun x convex run --prod --component migrations lib:getStatus \
     '{"names":["quote_response_template_migrations:backfillQuoteResponseTemplateVersionIdentity"]}'
   ```

5. Validate every stored version has immutable `name` and `audience`; do not
   rely on a compatibility read fallback to hide an incomplete backfill. Follow
   [quote-response-template-version-identity-cutover.md](./quote-response-template-version-identity-cutover.md)
   for the full expand/backfill/narrow contract.

There is no Cost or Quote business-record rewrite in this cutover. Existing
canonical records remain authoritative and immutable.

## 4. Automated release gates

The certifier executes and hashes evidence for:

1. focused public Convex Cost, Quote, email, override, and retention contracts;
2. focused production route and component contracts;
3. certifier fail-closed tests;
4. the complete repository test suite;
5. Convex code generation;
6. Convex TypeScript compilation; and
7. the production TanStack build.

The acceptance manifest is source-bound to exact executable test titles. A
renamed, deleted, duplicated, or missing anchor fails before any gate runs. The
manifest covers the integrated Cost happy path, Quote happy path, failure/race
matrix, security boundaries, controlled-time retention, and route/component
contract. Test setup may seed fixture state, but workflow operations go through
production routes and public `api.*` Convex functions.

## 5. Deploy and activate scheduled work

Deploy the same source commit to Convex and the application. `convex/crons.ts`
is the canonical scheduled-job registration; do not create parallel provider
schedules.

Confirm the Convex dashboard shows these jobs enabled after deployment:

| Job | Schedule | Operational purpose |
| --- | --- | --- |
| `schedule quote invitation reminders` | every minute | Create bounded 72-hour and 24-hour reminder intents |
| `dispatch communication intents` | every minute | Lease, render, send, retry, and escalate durable email intents |
| `expire open Build collaboration asset staging sessions` | every 15 minutes | Expire abandoned staged Cost/Quote assets |
| `expire finalized Build collaboration asset staging sessions` | every 15 minutes | Expire finalized but unconsumed staging |
| `reconcile data retention schedules` | 02:00 UTC daily | Rebuild retention projections and reminders |
| `run data retention maintenance` | 03:00 UTC daily | Run bounded legal-hold-safe disposal work |
| `clean expired data retention tombstones` | 04:00 UTC daily | Remove tombstones only after their governed expiry |

Inspect the durable run ledgers and cursors after one invocation. A page or
Build failure must be visible and retryable; do not advance a cursor manually.

## 6. Resend webhook verification

Configure or reconcile one webhook for the exact Convex site deployment:

```sh
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site \
  bun run configure:resend-webhook
```

The command must target `https://<deployment>.convex.site/resend-webhook`, enable
the supported email events, reuse the existing endpoint on replay, and write
the returned signing secret to the same Convex deployment without printing it.

Before sending, select a dedicated non-customer test organization and an
operator-controlled recipient address approved for release verification. Record
the organization ID, recipient profile ID, Quote Round/Invitation IDs, and
resulting provider message ID in the release evidence. Never send a release
probe to a real customer or an address inferred from production data.

Send one governed test invitation in that dedicated organization and verify
this chain by immutable IDs:

1. domain mutation and `communicationIntents` row commit together;
2. `communicationAttempts` records the claim/enqueue result;
3. `emailMessages.providerResendEmailId` matches the Resend message;
4. a signed callback creates one deduplicated `emailDeliveryEvents` row; and
5. `communicationOutcomes` and the public Control Register show the normalized
   delivery projection without exposing recipient identity or raw errors.

Replay the same callback and deliver an older callback after a newer terminal
event. Neither may duplicate the event nor regress the projection. Follow
[resend-email-transport.md](./resend-email-transport.md) for recovery details.
Close/cancel the test Round, revoke its access, and clean transient data only
through the established public lifecycle and scheduled retention paths. Keep
canonical Invitation, delivery, outcome, and audit history intact.

## 7. Post-deploy public read-back

Use authenticated production identities and public queries/mutations only.
Record response shapes and stable entity IDs, not secrets, bearer links, raw
tokens, private addresses, or provider payloads.

Read back at least:

- the Builder Owner Cost register and one immutable multi-page Cost detail;
- a private page through `/api/cost-documents/page` with `no-store` response
  headers and without a public storage URL;
- Roadmap Reconciliation totals and progressive detail for the same record;
- the Quote Round Control Register and immutable comparison;
- the recipient Field Ledger through an invitation browser session;
- current submission receipt/history, withdrawn/superseded revisions, and
  nullable Preferred pointer;
- current communication intent/attempt/outcome projection;
- the active retention schedule, legal-hold result, backup manifest metadata,
  and reconciliation run state; and
- cross-organization, cross-Build, cross-recipient, stale-role, revoked-access,
  and break-glass denials.

The application release endpoint, application origin, Convex deployment, and
Git commit must match the release record.

## 8. Manual Codex browser QA matrix

Manual QA starts only after ENG-384 through ENG-403 are all `In Review`. Use the
already signed-in Codex in-app browser account with all roles. Do not use Arc.
GPT-5.6 Luna is the required browser-QA certifier.

Execute every workflow exported by
`COST_QUOTE_MANUAL_BROWSER_WORKFLOWS` in
`scripts/cost-quote-workflow-certification.ts`:

- Cost: Builder Owner desktop/mobile, Builder Staff desktop, Homeowner mobile,
  Contractor desktop, and Backoffice desktop;
- Quote: Builder Owner desktop, Builder Staff desktop, Homeowner mobile,
  provisional recipient desktop/mobile, and Backoffice desktop.

For each workflow:

1. start from its canonical production route and finish the listed business
   operations, including governed failure/recovery branches;
2. preserve the approved prototype hierarchy and role-appropriate controls;
3. inspect keyboard/focus behavior and accessible names for every interactive
   control;
4. prove `document.documentElement.scrollWidth <= window.innerWidth` at the
   target viewport;
5. record zero unexpected console errors; expected authorization denials must
   remain typed and user-safe;
6. capture screenshot evidence and SHA-256 it; and
7. bind the result to the exact Git commit. Any QA bug fix changes HEAD and
   invalidates the complete release-wide CodeRabbit, automated, and manual
   browser evidence set across every workflow. Re-run the full certification
   package against the new exact commit.

Record the browser's finite `devicePixelRatio` from 0.5 through 4. The declared
CSS viewport must equal the canonical target. Codex in-app capture transport
may encode that full viewport at a different uniform raster scale, so each PNG
must preserve the target aspect ratio with the same horizontal and vertical
scale (0.5 through 4). Cropped, asymmetrically scaled, placeholder, or
mismatched screenshots are rejected.

Copy
[cost-quote-manual-browser-qa.template.json](./cost-quote-manual-browser-qa.template.json)
to the external evidence directory. Delete the template's placeholder
`workflowResults` object first, then add one fully populated result for every
required workflow. Do not leave `<required-workflow-id>` or any other
placeholder in submitted evidence; the certifier rejects partial or mismatched
evidence. `completedAt` must use ISO-8601 with an explicit timezone. UTC `Z`
timestamps and numeric UTC offsets are accepted, and fractional seconds are
optional (for example, `2026-08-04T12:00:00Z` or
`2026-08-04T08:00:00.000-04:00`).

## 9. Monitoring and alerting

Monitor by organization and stable business correlation:

- Cost staging sessions stuck open/finalized, quarantined or missing governed
  assets, unavailable integrity exceptions, likely-duplicate overrides, and
  delivery action-required outcomes;
- Quote Rounds near/past deadline, undispatched recipients, expired/revoked
  credentials, stale Package acknowledgements, response revision caps,
  Preferred staleness, and reminder cooldown/retry state;
- communication intents stuck beyond a lease, repeated transient failures,
  permanent provider failures, webhook signature failures, and event backlog;
- retention schedule drift, legal-hold blocks, fan-out page/Build failures,
  backup RPO breaches, restore RTO breaches, and quarterly drill failures; and
- authorization denials or break-glass events above baseline.

Alert payloads must use tenant/entity IDs and closed error categories. Do not
put recipient email, filenames, invoice facts, bearer tokens, raw IP/user-agent,
provider bodies, or free-form document content in alerts.

## 10. Rollback

Rollback is application/version recovery, not business-state reversal.

1. Freeze new rollout actions and record an incident. Do not delete or edit
   submitted Cost Documents, Quote submissions, invitations, audits, attempts,
   outcomes, or tombstones.
2. Preserve the current verified backup manifest and export the failed
   certification/read-back evidence.
3. Roll the application back to the last known compatible Vercel deployment.
4. Deploy a forward-compatible Convex repair. Never deploy an older schema that
   rejects rows written by the new release. If a narrowing migration caused the
   failure, restore the compatibility schema first; do not reverse the data
   backfill.
5. Keep the communication outbox durable. Correct provider configuration, then
   use the owning retry/reminder/revision path; never rewrite sent history.
6. Keep retention and legal holds active. Destructive restore still requires
   Brokerage Admin break-glass, incident reference, mandatory reason, and a
   fresh eligible backup.
7. Re-run migration status, focused/full gates, CodeRabbit on the repaired exact
   diff, and post-deploy read-back before resuming rollout.

## 11. Closeout

Attach to ENG-403 and ENG-383:

- exact Git commit and deployment identifiers;
- automated certification JSON and all hashed logs;
- migration preview/apply/status evidence;
- Resend webhook and normalized delivery read-back;
- scheduled-job/run-ledger read-back;
- post-deploy public query/denial evidence;
- GPT-5.6 Luna Codex-browser evidence and screenshot hashes; and
- defects found, owning ticket/commit, CodeRabbit zero-finding result, and
  re-certification result.

Move tickets from `In Review` to `Done` only after the exact-commit automated
result is `certified` and every discovered defect has been fixed and re-run.

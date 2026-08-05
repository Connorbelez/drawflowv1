# Build collaboration authenticated CI contract

The `build-collaboration-e2e` workflow is a required production acceptance
gate. It provisions fresh Build-local fixture data through a protected control
service, materializes eight authenticated Playwright storage states, and then
runs the collaboration persona and loaded-state revocation suite.

The GitHub `build-collaboration-e2e` environment must define:

- `PLAYWRIGHT_BASE_URL`
- `BUILD_COLLABORATION_E2E_SETUP_URL`
- `BUILD_COLLABORATION_E2E_CONTROL_TOKEN`
- one base64-encoded Playwright storage-state secret for each variable named in
  `scripts/prepare-build-collaboration-e2e.ts`

The fixture must exercise the canonical production shell for every persona:

| Production shell | Personas |
| --- | --- |
| `/backoffice/builds/$buildId` | Admin, Principal Broker, Broker, Broker Staff |
| `/builder/builds/$buildId` | Builder, Builder Staff |
| `/homeowner/builds/$buildId` | Homeowner with an active Build grant |
| `/contractor/builds/$buildId` | Contractor with an active Build grant or qualifying assignment |

The preparation and cutover-certification validators reject a persona routed
through any other shell. The shared collaboration module still derives its
effective role and permissions from server-side organization and Build access;
the URL never grants authority.

The setup endpoint receives `POST {"baseUrl": string, "runId": string}` with
the control token as a Bearer token. It must idempotently seed one active Build,
the approved eight personas, visible and restricted posts, a focused Action
Item, a typed reference, Seen receipts, and a removable Homeowner or
Contractor. It returns the same shape as
`tests/e2e/fixtures/build-collaboration.example.json`, except that
`storageState` and `revocation.controlToken` are injected by the preparation
script.

The endpoint must return real Build and entity IDs. Placeholder IDs and
placeholder revocation URLs fail before Playwright starts. The revocation
control must remove the selected participant from the seeded Build and be
idempotent for the workflow run.

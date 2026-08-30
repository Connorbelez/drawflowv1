# Onboarding QA browser/API gaps

Date: 2026-08-26

## Credentialed browser actions

The contractor and existing-owner builder QA runs required entering
`ALL_ROLE_LOGIN_EMAIL` and `ALL_ROLE_LOGIN_PW` into the hosted WorkOS sign-in
form after the disposable builder identity had been cleaned up. This restored
the Back Office admin session so `/backoffice/onboard-contractor` and
`/backoffice/builders` could be exercised. No credential values, session
tokens, or invitation tokens are recorded here.

The builder QA run used an already-authenticated Back Office admin session, so
the admin credentials were not entered during that part of the run. The
AgentMail identities completed their own WorkOS sign-up and verification.

## Follow-up API coverage

The builder onboarding run still used the browser for these operations:

- Open `/backoffice/onboard-builder` and submit the new-builder form.
- Open the invitation URL delivered to `drawflow-builder-1@agentmail.to`.
- Complete WorkOS sign-up and email verification for the invited builder.
- Sign into the local app as the invited builder and complete the first-run
  proposal setup through milestone generation.
- Open `/backoffice/onboard-contractor`, create a contractor profile, and
  enable the invite-after-create action.
- Complete WorkOS sign-up, email verification, contractor profile confirmation,
  and local contractor dashboard access for the invited identity.
- Open `/backoffice/builders`, select an existing WorkOS builder under
  “Builders awaiting a profile,” and create the linked owner profile.

Future API coverage should expose authenticated admin commands for the builder
and contractor profile/invitation operations, plus deterministic test identity
and email-provider paths for the remaining invitation and first-run
operations. Do not place credentials or invitation tokens in this document.

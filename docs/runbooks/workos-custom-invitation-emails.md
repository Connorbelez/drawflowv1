# WorkOS invitation emails

DrawFlow owns invitation email content in code. WorkOS still owns the identity
invitation, role assignment, acceptance URL, and membership lifecycle.

## Code ownership

- `convex/identity_invitation_emails.ts` contains the role-to-persona mapping and
  the versioned subject, copy, and CTA for Contractor, Builder, Lender, and
  brokerage invitations.
- `convex/workosManagement/invitationEmails.ts` writes the durable
  `communicationIntents` outbox row.
- `convex/quote_notifications/email.ts` renders the selected template through
  the existing Resend dispatcher.
- `src/routes/invitations/$invitationId.tsx` is the application-owned landing
  page. It loads the current WorkOS acceptance URL server-side and displays the
  role-specific onboarding steps before the invitee accepts.

The outbox stores the opaque WorkOS invitation ID, not the bearer acceptance
URL. The landing page retrieves the URL only after the recipient opens the
application link.

## Invitation handoff feedback

Contractor invite claims record the asynchronous handoff separately from the
claim lifecycle:

- `queued` means the WorkOS action has been scheduled.
- `sent` means WorkOS accepted the invitation and the custom email was queued.
- `failed` means the handoff needs attention; the stored safe error is shown on
  the Builder and Back Office contractor detail screens.

If WorkOS reports that the email is already invited, DrawFlow resends the latest
pending WorkOS invitation and keeps the current claim retryable. Other failures
are persisted without exposing WorkOS exception details to the user.

## Required WorkOS configuration

Repeat this configuration for every WorkOS environment that sends DrawFlow
invites, including staging and production:

1. In WorkOS Dashboard, open **Emails → Configuration → Manage**.
2. Disable WorkOS default AuthKit invitation emails. DrawFlow must be the only
   sender for these invitation types.
3. Keep the WorkOS Application invitation/redirect configuration valid for the
   acceptance flow. The application-owned landing page is the URL in the
   DrawFlow email; the acceptance URL returned by WorkOS remains the final
   authentication step.

## Required DrawFlow environment variables

- `WORKOS_API_KEY` — reads the invitation acceptance URL on the landing page.
- `RESEND_API_KEY` — sends the application-owned email.
- `RESEND_FROM_EMAIL` — verified sender, for example
  `DrawFlow <notifications@updates.fairlend.ca>`.
- `DRAWFLOW_APP_ORIGINS` — comma-separated allowed application origins. The
  first origin is used for invitation links.
- `RESEND_WEBHOOK_SECRET` and `COMMUNICATION_TOKEN_SECRET` — existing email
  transport requirements.

After changing a template, deploy the Convex functions and the web application
together, then send one test invitation for each persona. Verify the
`communicationIntents` row is `sent` and that the landing page routes to the
correct WorkOS acceptance flow.

## Source of truth

WorkOS branding controls logos, colors, display name, and some default copy.
Those settings do not replace the DrawFlow templates. To change the actual
subject, body, CTA, or onboarding steps, edit the versioned files above and
deploy them.

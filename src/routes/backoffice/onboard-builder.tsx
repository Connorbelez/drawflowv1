import { createFileRoute } from "@tanstack/react-router";

import { ProvisionBuilderWizard } from "#/features/builder-onboarding/ProvisionBuilderWizard.tsx";
import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/backoffice/onboard-builder")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  ssr: false,
  staticData: {
    breadcrumb: {
      label: "Onboard builder",
      to: "/backoffice/onboard-builder",
    },
  },
  component: ProvisionBuilderWizard,
});

import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { AppShell } from "#/components/app-shell.tsx";
import {
  contractorNavGroups,
  footerNavLinks,
} from "#/features/contractor/contractorNav.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/contractor")({
  beforeLoad: ({ context, location }) =>
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "contractor",
    }),
  staticData: {
    breadcrumb: {
      label: "Contractor",
      to: "/contractor",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { pathname } = useLocation();
  if (
    pathname === "/contractor/onboarding" ||
    pathname.startsWith("/contractor/onboarding/")
  ) {
    return <ContractorWorkspaceShell />;
  }
  return <ContractorWorkspaceProfileGate />;
}

function ContractorWorkspaceProfileGate() {
  const access = useQuery(
    api.contractorWorkspace.getContractorWorkspaceAccess,
    {}
  );
  if (access === undefined) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
        <p className="text-muted-foreground text-sm">
          Checking contractor workspace access…
        </p>
      </main>
    );
  }
  if (!access.profileLinked) {
    return <ContractorProfileLinkRedirect />;
  }
  return <ContractorWorkspaceShell />;
}

function ContractorProfileLinkRedirect() {
  const navigate = useNavigate();
  const redirectStarted = useRef(false);
  useEffect(() => {
    if (redirectStarted.current) {
      return;
    }
    redirectStarted.current = true;
    Promise.resolve(
      navigate({
        replace: true,
        search: {
          reason: "profile-link-required",
          workspace: "contractor",
        },
        to: "/protected-access",
      })
    ).catch(() => undefined);
  }, [navigate]);
  return (
    <main
      className="grid min-h-svh place-items-center bg-muted/30 p-6"
      data-testid="profile-link-redirect"
    >
      <p className="text-muted-foreground text-sm">
        Opening contractor access recovery…
      </p>
    </main>
  );
}

function ContractorWorkspaceShell() {
  return (
    <AppShell
      sidebar={{
        brand: {
          label: "DrawFlow Contractor",
          to: "/contractor" as never,
        },
        footerLinks: footerNavLinks,
        groups: contractorNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}

import { Send } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import type {
  UserManagementHandlers,
  WorkosOrganizationRow,
} from "./-user-management-types";

export function InviteSheet({
  onClose,
  onInvite,
  open,
  organizations,
  roleOptions,
}: {
  onClose: () => void;
  onInvite: UserManagementHandlers["onInviteUser"];
  open: boolean;
  organizations: WorkosOrganizationRow[];
  roleOptions: string[];
}): ReactElement {
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.workosOrganizationId ?? ""
  );
  const [roleSlug, setRoleSlug] = useState(roleOptions[0] ?? "builder");
  const [sending, setSending] = useState(false);

  const effectiveOrgId =
    organizationId &&
    organizations.some((o) => o.workosOrganizationId === organizationId)
      ? organizationId
      : (organizations[0]?.workosOrganizationId ?? "");

  return (
    <Sheet
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent className="w-full min-w-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invite someone</SheetTitle>
          <SheetDescription>
            Send a WorkOS invitation. The recipient gets an email and shows up
            here once they accept.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <form
            className="flex flex-col gap-3"
            id="invite-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!effectiveOrgId) {
                return;
              }
              setSending(true);
              try {
                await onInvite({
                  email,
                  organizationId: effectiveOrgId,
                  roleSlug,
                });
                setEmail("");
                onClose();
              } finally {
                setSending(false);
              }
            }}
          >
            <Field htmlFor="invite-email" label="Work email">
              <Input
                autoFocus
                id="invite-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="someone@example.com"
                required
                type="email"
                value={email}
              />
            </Field>
            <Field htmlFor="invite-org" label="Organization">
              <NativeSelect
                className="w-full"
                id="invite-org"
                onChange={(event) => setOrganizationId(event.target.value)}
                value={effectiveOrgId}
              >
                {organizations.map((organization) => (
                  <NativeSelectOption
                    key={organization.workosOrganizationId}
                    value={organization.workosOrganizationId}
                  >
                    {organization.name ?? organization.workosOrganizationId}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor="invite-role" label="Role">
              <NativeSelect
                className="w-full"
                id="invite-role"
                onChange={(event) => setRoleSlug(event.target.value)}
                value={roleSlug}
              >
                {(roleOptions.length > 0 ? roleOptions : ["builder"]).map(
                  (role) => (
                    <NativeSelectOption key={role} value={role}>
                      {role}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </Field>
          </form>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button
            disabled={sending || !effectiveOrgId || !email}
            form="invite-form"
            type="submit"
          >
            <Send />
            Send invitation
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={htmlFor}>
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

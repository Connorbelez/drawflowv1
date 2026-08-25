import type { FunctionReturnType } from "convex/server";
import type { FormEvent } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import type { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type DirectoryMetadata = FunctionReturnType<
  typeof api.lenderOrganizations.getLenderOrganizationDirectoryMetadata
>;

interface ProvisionForm {
  brokerageId: Id<"brokerages"> | "";
  displayName: string;
  legalName: string;
}

export interface LenderOrganizationProvisionDialogProps {
  controlPlane: DirectoryMetadata | undefined;
  form: ProvisionForm;
  onChange: (update: (current: ProvisionForm) => ProvisionForm) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  open: boolean;
}

export function LenderOrganizationProvisionDialog({
  controlPlane,
  form,
  onChange,
  onOpenChange,
  onSubmit,
  open,
}: LenderOrganizationProvisionDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision lender organization</DialogTitle>
          <DialogDescription>
            Create an application organization under an existing Brokerage. No
            WorkOS organization will be created.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="lender-display-name">Display name</Label>
            <Input
              id="lender-display-name"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="Northstar Lending"
              value={form.displayName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lender-legal-name">Legal name</Label>
            <Input
              id="lender-legal-name"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  legalName: event.target.value,
                }))
              }
              placeholder="Northstar Lending Corporation"
              value={form.legalName}
            />
          </div>
          <div className="space-y-2">
            <Label>Parent Brokerage</Label>
            <Select
              onValueChange={(value) =>
                onChange((current) => ({
                  ...current,
                  brokerageId: value ? (value as Id<"brokerages">) : "",
                }))
              }
              value={form.brokerageId || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a Brokerage" />
              </SelectTrigger>
              <SelectContent>
                {(controlPlane?.brokerages ?? []).map((brokerage) => (
                  <SelectItem key={brokerage.id} value={brokerage.id}>
                    {brokerage.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Provision organization</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { CheckCircle2 } from "lucide-react";

import { Logo } from "#/components/logo.tsx";
import { Badge } from "#/components/ui/badge.tsx";

export function AccessPortalHeader() {
  return (
    <header className="access-header">
      <a aria-label="DrawFlow access portal" className="access-brand" href="/">
        <Logo aria-hidden="true" className="access-logo" />
        <span>Construction draw control</span>
      </a>
      <Badge className="access-system-badge" variant="outline">
        <CheckCircle2 aria-hidden="true" />
        Secure access online
      </Badge>
    </header>
  );
}

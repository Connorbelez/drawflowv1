import { Building2, ShieldCheck } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { PersonaAccessSelector } from "./PersonaAccessSelector.tsx";

export function AccessGatewaySection() {
  return (
    <main className="access-gateway" id="main-content">
      <section aria-labelledby="access-title" className="access-intro">
        <div className="access-intro-copy">
          <Badge className="access-context-badge" variant="secondary">
            <Building2 aria-hidden="true" />
            FairLend organization access
          </Badge>
          <h1 id="access-title">One entry point. Your DrawFlow workspace.</h1>
          <p className="access-lede">
            Choose the work you are here to do. We verify your organization and
            role, then open the right control plane.
          </p>
        </div>

        <div className="access-policy-note">
          <ShieldCheck aria-hidden="true" />
          <div>
            <p>Reimbursement draw sequence</p>
            <ol aria-label="Reimbursement draw sequence">
              <li>Work</li>
              <li>Evidence</li>
              <li>Approval</li>
              <li>Release</li>
            </ol>
            <span>Interest begins only after funds release.</span>
          </div>
        </div>

        <div aria-hidden="true" className="access-calibration-mark">
          <span />
        </div>
      </section>

      <section
        aria-label="Workspace access"
        className="access-selector-section"
      >
        <Frame className="access-selector-frame">
          <FramePanel className="access-selector-panel">
            <PersonaAccessSelector />
          </FramePanel>
        </Frame>
      </section>
    </main>
  );
}

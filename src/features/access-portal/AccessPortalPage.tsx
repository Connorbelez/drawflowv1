import { AccessGatewaySection } from "./AccessGatewaySection.tsx";
import { AccessPortalHeader } from "./AccessPortalHeader.tsx";
import { AccessTrustRail } from "./AccessTrustRail.tsx";
import "./access-portal.css";

export function AccessPortalPage() {
  return (
    <div className="access-shell">
      <a className="access-skip-link" href="#main-content">
        Skip to workspace access
      </a>
      <div className="access-canvas">
        <AccessPortalHeader />
        <AccessGatewaySection />
        <AccessTrustRail />
      </div>
    </div>
  );
}

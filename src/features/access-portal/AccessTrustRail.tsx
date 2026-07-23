import { FileClock, Network, ShieldCheck } from "lucide-react";

const trustSignals = [
  {
    description: "WorkOS organization identity",
    icon: Network,
    label: "Organization scoped",
  },
  {
    description: "Builder, lender, and contractor paths",
    icon: ShieldCheck,
    label: "Role aware",
  },
  {
    description: "Material decisions retain actor and timestamp",
    icon: FileClock,
    label: "Audit ready",
  },
] as const;

export function AccessTrustRail() {
  return (
    <footer className="access-trust-rail">
      {trustSignals.map(({ description, icon: Icon, label }) => (
        <div className="access-trust-item" key={label}>
          <Icon aria-hidden="true" />
          <div>
            <strong>{label}</strong>
            <span>{description}</span>
          </div>
        </div>
      ))}
      <p className="access-legal">© {new Date().getFullYear()} DrawFlow</p>
    </footer>
  );
}

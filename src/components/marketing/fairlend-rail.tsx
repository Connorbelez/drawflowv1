import type { ReactElement } from "react";

import "./fairlend-rail.css";

export type PageRailSection = {
  id: string;
  label: string;
  number: string;
  tone: "dark" | "paper";
};

export function PageRail({
  ariaLabel = "Page section",
  section,
}: {
  ariaLabel?: string;
  section: PageRailSection;
}): ReactElement {
  return (
    <aside
      aria-label={ariaLabel}
      className="fairlend-investor-rail fairlend-investor-rail--sticky"
      data-tone={section.tone}
    >
      <span aria-hidden="true" />
      <p className="fairlend-investor-rail__animated" key={section.id}>
        {section.label}
      </p>
      <span aria-hidden="true" />
      <p>Built for communities.</p>
      <span aria-hidden="true" />
      <p>Made to last.</p>
      <strong
        className="fairlend-investor-rail__animated"
        key={`${section.id}-number`}
      >
        {section.number}
      </strong>
    </aside>
  );
}

/** Backward-compatible alias for the original investor page rail. */
export const FairlendInvestorRail = PageRail;

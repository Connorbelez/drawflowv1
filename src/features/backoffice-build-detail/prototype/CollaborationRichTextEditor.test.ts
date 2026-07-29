import { describe, expect, it } from "vitest";

import {
  type CollaborationTagOption,
  extractTagReferences,
} from "./CollaborationRichTextEditor";

const OPTIONS: CollaborationTagOption[] = [
  {
    eyebrow: "Evidence Package",
    id: "evidence-204",
    kind: "evidence",
    label: "Evidence EP-204",
    summary: "7 of 8 requirements complete",
  },
  {
    eyebrow: "Builder PM",
    id: "alex",
    initials: "AC",
    kind: "participant",
    label: "Alex Chen",
    summary: "Builder PM on this Build",
  },
];

describe("extractTagReferences", () => {
  it("extracts and de-duplicates typed Build references", () => {
    const html = `
      <p>
        Review
        <span data-type="collaboration-reference" data-reference-id="evidence-204" data-reference-kind="evidence" data-label="Evidence EP-204"></span>
        with
        <span data-type="collaboration-reference" data-reference-id="alex" data-reference-kind="participant" data-label="Alex Chen"></span>
        <span data-type="collaboration-reference" data-reference-id="evidence-204" data-reference-kind="evidence" data-label="Evidence EP-204"></span>
      </p>
    `;

    expect(extractTagReferences(html, OPTIONS)).toEqual([
      {
        eyebrow: "Evidence Package",
        id: "evidence-204",
        kind: "evidence",
        label: "Evidence EP-204",
        summary: "7 of 8 requirements complete",
      },
      {
        eyebrow: "Builder PM",
        id: "alex",
        kind: "participant",
        label: "Alex Chen",
        summary: "Builder PM on this Build",
      },
    ]);
  });

  it("keeps legacy participant mentions readable", () => {
    const html =
      '<p><span data-type="collaboration-mention" data-participant-id="alex" data-label="Alex Chen"></span></p>';

    expect(extractTagReferences(html, OPTIONS)).toEqual([
      {
        eyebrow: "Builder PM",
        id: "alex",
        kind: "participant",
        label: "Alex Chen",
        summary: "Builder PM on this Build",
      },
    ]);
  });

  it("uses serialized metadata when the referenced entity is no longer indexed", () => {
    const html =
      '<p><span data-type="collaboration-reference" data-reference-id="visit-1" data-reference-kind="site_visit" data-label="Site Visit SV-1" data-eyebrow="Site Visit" data-summary="Report submitted"></span></p>';

    expect(extractTagReferences(html, OPTIONS)).toEqual([
      {
        eyebrow: "Site Visit",
        id: "visit-1",
        kind: "site_visit",
        label: "Site Visit SV-1",
        summary: "Report submitted",
      },
    ]);
  });
});

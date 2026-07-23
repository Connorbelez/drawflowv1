import { describe, expect, test, vi } from "vitest";

import { preventSiteVisitDraftUnload } from "./site-visit-draft-storage.ts";

describe("site visit draft unload protection", () => {
  test("requests a browser confirmation before leaving staged evidence", () => {
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      returnValue: false,
    } as unknown as BeforeUnloadEvent;

    preventSiteVisitDraftUnload(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(true);
  });
});

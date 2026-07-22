// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Card, CardFrame } from "./card.tsx";

describe("Card layout containment", () => {
  afterEach(cleanup);

  test("cards can shrink inside narrow grid and flex layouts", () => {
    render(
      <>
        <Card data-testid="card">Card</Card>
        <CardFrame data-testid="frame">Frame</CardFrame>
      </>
    );

    expect(screen.getByTestId("card").className).toContain("min-w-0");
    expect(screen.getByTestId("frame").className).toContain("min-w-0");
  });
});

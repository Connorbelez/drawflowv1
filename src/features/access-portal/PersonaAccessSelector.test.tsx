// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PersonaAccessSelector } from "./PersonaAccessSelector.tsx";

afterEach(cleanup);

describe("PersonaAccessSelector", () => {
  test("defaults to the builder path and exposes all three workspace personas", () => {
    render(<PersonaAccessSelector />);

    expect(
      screen
        .getByRole("radio", { name: /builder or developer/i })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("radio", { name: /lender team/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /contractor/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continue to secure sign in" }).getAttribute("href"),
    ).toBe("/api/auth/sign-in?returnPathname=%2Fbuilder");
  });

  test("updates both destination context and WorkOS return path when persona changes", () => {
    render(<PersonaAccessSelector />);

    fireEvent.click(screen.getByRole("radio", { name: /lender team/i }));

    expect(screen.getByText("Operations and approvals")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continue to secure sign in" }).getAttribute("href"),
    ).toBe("/api/auth/sign-in?returnPathname=%2Fbackoffice");
    expect(
      screen.getByRole("link", { name: "Activate your account" }).getAttribute("href"),
    ).toBe("/api/auth/sign-up?returnPathname=%2Fbackoffice");
  });

  test("selects a persona when the visible option card is clicked", () => {
    render(<PersonaAccessSelector />);

    fireEvent.click(screen.getByText("Contractor", { exact: true }));

    expect(
      screen.getByRole("radio", { name: /contractor/i }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Continue to secure sign in" }).getAttribute("href"),
    ).toBe("/api/auth/sign-in?returnPathname=%2Fcontractor");
  });
});

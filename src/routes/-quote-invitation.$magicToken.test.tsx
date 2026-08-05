// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  QuoteInvitationClaimActions,
  quoteInvitationAuthHrefs,
  quoteInvitationIsReadOnly,
} from "./quote-invitation.$magicToken.tsx";

afterEach(cleanup);

describe("Quote invitation public route", () => {
  test("derives deadline closure from browser time and durable round state", () => {
    const access = {
      roundState: "open" as const,
    } as Parameters<typeof quoteInvitationIsReadOnly>[0];

    expect(quoteInvitationIsReadOnly(access, false)).toBe(false);
    expect(quoteInvitationIsReadOnly(access, true)).toBe(true);
    expect(
      quoteInvitationIsReadOnly({ ...access, roundState: "closed" }, false)
    ).toBe(true);
  });

  test("offers cold recipients both account creation and sign-in with the exact invitation return path", () => {
    const magicToken = "cold/recipient-token";
    const hrefs = quoteInvitationAuthHrefs(magicToken);

    render(
      <QuoteInvitationClaimActions
        claiming={false}
        hasAuthenticatedUser={false}
        magicToken={magicToken}
        onClaim={() => undefined}
      />
    );

    expect(
      screen
        .getByRole("link", { name: "Create account to claim" })
        .getAttribute("href")
    ).toBe(hrefs.signUpHref);
    expect(
      screen
        .getByRole("link", { name: "Sign in to claim" })
        .getAttribute("href")
    ).toBe(hrefs.signInHref);
    expect(hrefs).toEqual({
      signInHref:
        "/api/auth/sign-in?returnPathname=%2Fquote-invitation%2Fcold%252Frecipient-token",
      signUpHref:
        "/api/auth/sign-up?returnPathname=%2Fquote-invitation%2Fcold%252Frecipient-token",
    });
  });

  test("keeps the authenticated claim action explicit and callback-driven", () => {
    const onClaim = vi.fn();
    render(
      <QuoteInvitationClaimActions
        claiming={false}
        hasAuthenticatedUser
        magicToken="authenticated-token"
        onClaim={onClaim}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Claim this invitation" })
    );
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /Create account/ })).toBeNull();
  });
});

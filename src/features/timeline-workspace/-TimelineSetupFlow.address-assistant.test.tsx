// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { cloneElement, type ComponentProps, type ReactElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { dispatchAssistantClientAction } from "#/features/assistant/assistantClientActionBridge";

vi.mock("#/components/address/GoogleAddressAutocomplete.tsx", () => ({
  GoogleAddressAutocomplete: ({
    inputRender,
    onChange,
    onPlaceSelect,
    value,
  }: {
    inputRender: ReactElement<ComponentProps<"input">>;
    onChange: (value: string) => void;
    onPlaceSelect: (
      suggestion: { description: string; placeId: string },
      details: {
        formattedAddress: string;
        latitude: number;
        longitude: number;
        placeId: string;
      },
    ) => void;
    value: string;
  }) => (
    <div>
      {cloneElement(inputRender, {
        onChange: (event) => onChange(event.currentTarget.value),
        value,
      })}
      <button
        data-testid="select-address-place"
        onClick={() =>
          onPlaceSelect(
            {
              description: "1420 Maple Ridge Dr",
              placeId: "place-maple-ridge",
            },
            {
              formattedAddress:
                "1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
              latitude: 43.2557,
              longitude: -79.8711,
              placeId: "place-maple-ridge",
            },
          )
        }
        type="button"
      >
        Select address place
      </button>
    </div>
  ),
}));

import { TimelineSetupFlow } from "./-TimelineSetupFlow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("TimelineSetupFlow assistant address updates", () => {
  test("clears prior place coordinates when the assistant replaces the address", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const onComplete = vi.fn();
    render(
      <TimelineSetupFlow
        baseItems={[
          {
            data: {
              amount: 100_000,
              draw: "Draw 1",
              drawX: 12,
              durationDays: 10,
              evidence: "Not started",
              icon: "foundation",
              name: "Foundation",
              policy: "Upcoming",
              status: "upcoming",
              subMilestones: ["Permit mobilization"],
            },
            eyebrow: "Milestone 1",
            id: "foundation",
            label: "Foundation",
            lane: 0,
            markerLabel: "1",
            tone: "upcoming",
            x: 0,
          },
        ]}
        onComplete={onComplete}
        settingsTemplates={[
          {
            isDefault: true,
            rows: [
              {
                dependencyKeys: [],
                durationDays: 10,
                icon: "foundation",
                key: "single-family-foundation",
                name: "Foundation",
                percentageBps: 10_000,
                subMilestones: ["Permit mobilization"],
                type: "foundation",
              },
            ],
            summary: "Assistant address regression fixture",
            templateKey: "single-family-full-build",
            title: "Single Family Full Build",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId("select-address-place"));
    expect(
      (screen.getByTestId("timeline-setup-address-input") as HTMLInputElement)
        .value,
    ).toContain("Maple Ridge");

    await waitFor(() =>
      expect(
        dispatchAssistantClientAction({
          actionKey: "set_proposal_setup_address",
          input: { address: "88 New Site Road, Hamilton, ON" },
        }),
      ).toBe(true),
    );

    await waitFor(() =>
      expect(
        (
          screen.getByTestId(
            "timeline-setup-address-input",
          ) as HTMLInputElement
        ).value,
      ).toBe("88 New Site Road, Hamilton, ON"),
    );

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    fireEvent.click(await screen.findByTestId("timeline-setup-complete"));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({
      projectAddress: "88 New Site Road, Hamilton, ON",
    });
    expect(onComplete.mock.calls[0]?.[0]).not.toHaveProperty(
      "projectAddressLatitude",
    );
    expect(onComplete.mock.calls[0]?.[0]).not.toHaveProperty(
      "projectAddressLongitude",
    );
    expect(onComplete.mock.calls[0]?.[0]).not.toHaveProperty(
      "projectAddressPlaceId",
    );
  });
});

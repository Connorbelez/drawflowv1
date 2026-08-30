// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mapsMocks = vi.hoisted(() => ({
  fetchDetails: vi.fn(),
  fetchSuggestions: vi.fn(),
}));

vi.mock("#/lib/google-maps.ts", () => ({
  fetchGoogleAddressPlaceDetails: mapsMocks.fetchDetails,
  fetchGoogleAddressSuggestions: mapsMocks.fetchSuggestions,
  isGoogleAddressPlaceDetailsInCountry: (
    details: { countryCode?: string } | null,
    countryCode: string,
  ) => details?.countryCode?.toUpperCase() === countryCode.toUpperCase(),
  isGoogleMapsConfigured: () => true,
}));

import { GoogleAddressAutocomplete } from "./GoogleAddressAutocomplete";

const canadianSuggestion = {
  description: "26 Luverne Ave, North York, ON, Canada",
  mainText: "26 Luverne Ave",
  placeId: "place-ca",
  secondaryText: "North York, ON, Canada",
};

const nonCanadianSuggestion = {
  description: "500 Market St, San Francisco, CA, USA",
  mainText: "500 Market St",
  placeId: "place-us",
  secondaryText: "San Francisco, CA, USA",
};

beforeEach(() => {
  vi.useFakeTimers();
  mapsMocks.fetchDetails.mockReset();
  mapsMocks.fetchSuggestions.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function resolveSuggestions() {
  await act(async () => {
    vi.advanceTimersByTime(220);
    await Promise.resolve();
  });
}

describe("GoogleAddressAutocomplete country restriction", () => {
  test("forwards the Canadian restriction and accepts a resolved Canadian keyboard selection", async () => {
    const onChange = vi.fn();
    const onPlaceSelect = vi.fn();
    const canadianDetails = {
      countryCode: "CA",
      formattedAddress: canadianSuggestion.description,
      latitude: 43.7591,
      longitude: -79.443,
      placeId: canadianSuggestion.placeId,
    };
    mapsMocks.fetchSuggestions.mockResolvedValue([canadianSuggestion]);
    mapsMocks.fetchDetails.mockResolvedValue(canadianDetails);

    render(
      <GoogleAddressAutocomplete
        countryCode="CA"
        onChange={onChange}
        onPlaceSelect={onPlaceSelect}
        testId="project-address"
        value="Hamilton, ON"
      />,
    );

    const input = screen.getByTestId("project-address");
    fireEvent.change(input, { target: { value: "26 Luverne" } });
    await resolveSuggestions();

    expect(mapsMocks.fetchSuggestions).toHaveBeenCalledWith("26 Luverne", {
      countryCode: "CA",
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(mapsMocks.fetchDetails).toHaveBeenCalledWith(canadianSuggestion, {
      countryCode: "CA",
    });
    expect(onChange).toHaveBeenCalledWith(canadianSuggestion.description, {
      source: "selection",
    });
    expect(onPlaceSelect).toHaveBeenCalledWith(
      canadianSuggestion,
      canadianDetails,
    );
  });

  test("rejects a non-Canadian pointer selection without persisting it and still allows clearing", async () => {
    const onChange = vi.fn();
    const onPlaceSelect = vi.fn();
    mapsMocks.fetchSuggestions.mockResolvedValue([nonCanadianSuggestion]);
    mapsMocks.fetchDetails.mockResolvedValue({
      countryCode: "US",
      formattedAddress: nonCanadianSuggestion.description,
      latitude: 37.79,
      longitude: -122.4,
      placeId: nonCanadianSuggestion.placeId,
    });

    render(
      <GoogleAddressAutocomplete
        countryCode="CA"
        onChange={onChange}
        onPlaceSelect={onPlaceSelect}
        testId="project-address"
        value="Hamilton, ON"
      />,
    );

    const input = screen.getByTestId("project-address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500 Market" } });
    await resolveSuggestions();

    await act(async () => {
      fireEvent.click(screen.getByText("500 Market St"));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "Choose a Canadian address",
    );
    expect(input.value).toBe("Hamilton, ON");
    expect(onChange).not.toHaveBeenCalled();
    expect(onPlaceSelect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("", { source: "typing" });
  });

  test("rejects the same non-Canadian result selected from the keyboard", async () => {
    const onChange = vi.fn();
    const onPlaceSelect = vi.fn();
    mapsMocks.fetchSuggestions.mockResolvedValue([nonCanadianSuggestion]);
    mapsMocks.fetchDetails.mockResolvedValue({
      countryCode: "US",
      formattedAddress: nonCanadianSuggestion.description,
      latitude: 37.79,
      longitude: -122.4,
      placeId: nonCanadianSuggestion.placeId,
    });

    render(
      <GoogleAddressAutocomplete
        countryCode="CA"
        onChange={onChange}
        onPlaceSelect={onPlaceSelect}
        testId="project-address"
        value="Hamilton, ON"
      />,
    );

    const input = screen.getByTestId("project-address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500 Market" } });
    await resolveSuggestions();

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "Choose a Canadian address",
    );
    expect(input.value).toBe("Hamilton, ON");
    expect(onChange).not.toHaveBeenCalled();
    expect(onPlaceSelect).not.toHaveBeenCalled();
  });
});

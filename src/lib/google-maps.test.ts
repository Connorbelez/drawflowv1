// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createGoogleSatelliteMapUrl,
  fetchGoogleAddressSuggestions,
} from "./google-maps";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.google;
  delete window.__drawflowGoogleMapsPlacesPromise;
  document.head.innerHTML = "";
});

describe("google maps helpers", () => {
  test("creates satellite Static Maps URLs from a site address", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");

    const result = createGoogleSatelliteMapUrl({
      address: "123 King St W, Toronto, ON",
      markerLabel: "B",
      size: "640x360",
      zoom: 19,
    });

    expect(result).not.toBeNull();
    const url = new URL(result ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://maps.googleapis.com/maps/api/staticmap",
    );
    expect(url.searchParams.get("center")).toBe("123 King St W, Toronto, ON");
    expect(url.searchParams.get("maptype")).toBe("satellite");
    expect(url.searchParams.get("zoom")).toBe("19");
    expect(url.searchParams.get("size")).toBe("640x360");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.get("markers")).toBe(
      "color:red|label:B|123 King St W, Toronto, ON",
    );
    expect(url.searchParams.get("key")).toBe("maps-key");
  });

  test("normalizes Google Places address predictions", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");
    window.google = {
      maps: {
        places: {
          AutocompleteService: class {
            getPlacePredictions(
              _request: unknown,
              callback: (predictions: any[], status: string) => void,
            ) {
              callback(
                [
                  {
                    description: "123 King St W, Toronto, ON, Canada",
                    place_id: "place-123",
                    structured_formatting: {
                      main_text: "123 King St W",
                      secondary_text: "Toronto, ON, Canada",
                    },
                  },
                ],
                "OK",
              );
            }
          },
          PlacesServiceStatus: {
            OK: "OK",
            ZERO_RESULTS: "ZERO_RESULTS",
          },
        },
      },
    };

    await expect(fetchGoogleAddressSuggestions("123 King")).resolves.toEqual([
      {
        description: "123 King St W, Toronto, ON, Canada",
        mainText: "123 King St W",
        placeId: "place-123",
        secondaryText: "Toronto, ON, Canada",
      },
    ]);
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createGoogleMapsEmbedUrl,
  createGoogleMapsOpenUrl,
  createGoogleSatelliteMapUrl,
  fetchGoogleAddressPlaceDetails,
  fetchGoogleAddressSuggestions,
} from "./google-maps";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.google;
  delete window.__drawflowGoogleMapsPlacesPromise;
  document.head.innerHTML = "";
});

describe("google maps helpers", () => {
  test("creates interactive embed and external map URLs from site coordinates", () => {
    const input = {
      address: "1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
      latitude: 43.2557,
      longitude: -79.8711,
    };

    const embedUrl = new URL(createGoogleMapsEmbedUrl(input));
    expect(embedUrl.origin + embedUrl.pathname).toBe(
      "https://www.google.com/maps",
    );
    expect(embedUrl.searchParams.get("q")).toBe("43.2557,-79.8711");
    expect(embedUrl.searchParams.get("output")).toBe("embed");

    const openUrl = new URL(createGoogleMapsOpenUrl(input));
    expect(openUrl.origin + openUrl.pathname).toBe(
      "https://www.google.com/maps/search/",
    );
    expect(openUrl.searchParams.get("api")).toBe("1");
    expect(openUrl.searchParams.get("query")).toBe("43.2557,-79.8711");
  });

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

  test("creates satellite Static Maps URLs from resolved coordinates", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");

    const result = createGoogleSatelliteMapUrl({
      address: "Ignored when coordinates exist",
      latitude: 43.653226,
      longitude: -79.383184,
      markerLabel: "B",
    });

    expect(result).not.toBeNull();
    const url = new URL(result ?? "");
    expect(url.searchParams.get("center")).toBe("43.653226,-79.383184");
    expect(url.searchParams.get("markers")).toBe(
      "color:red|label:B|43.653226,-79.383184",
    );
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
    } as any;

    await expect(fetchGoogleAddressSuggestions("123 King")).resolves.toEqual([
      {
        description: "123 King St W, Toronto, ON, Canada",
        mainText: "123 King St W",
        placeId: "place-123",
        secondaryText: "Toronto, ON, Canada",
      },
    ]);
  });

  test("resolves Google Places detail geometry from a selected prediction", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");
    window.google = {
      maps: {
        places: {
          AutocompleteService: class {
            getPlacePredictions() {}
          },
          PlacesService: class {
            getDetails(
              _request: unknown,
              callback: (place: any, status: string) => void,
            ) {
              callback(
                {
                  formatted_address: "26 Luverne Ave, North York, ON, Canada",
                  geometry: {
                    location: {
                      lat: () => 43.7591,
                      lng: () => -79.443,
                    },
                  },
                  place_id: "place-26",
                },
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
    } as any;

    await expect(
      fetchGoogleAddressPlaceDetails({
        description: "26 Luverne Ave, North York, ON, Canada",
        mainText: "26 Luverne Ave",
        placeId: "place-26",
        secondaryText: "North York, ON, Canada",
      }),
    ).resolves.toEqual({
      formattedAddress: "26 Luverne Ave, North York, ON, Canada",
      latitude: 43.7591,
      longitude: -79.443,
      placeId: "place-26",
    });
  });

  test("falls back to geocoding when Places details omits geometry", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");
    window.google = {
      maps: {
        Geocoder: class {
          geocode(
            request: unknown,
            callback: (results: any[], status: string) => void,
          ) {
            expect(request).toEqual({ placeId: "place-26" });
            callback(
              [
                {
                  formatted_address: "26 Luverne Ave, North York, ON, Canada",
                  geometry: {
                    location: {
                      lat: () => 43.7591,
                      lng: () => -79.443,
                    },
                  },
                  place_id: "place-26",
                },
              ],
              "OK",
            );
          }
        },
        GeocoderStatus: {
          OK: "OK",
          ZERO_RESULTS: "ZERO_RESULTS",
        },
        places: {
          AutocompleteService: class {
            getPlacePredictions() {}
          },
          PlacesService: class {
            getDetails(
              _request: unknown,
              callback: (place: any, status: string) => void,
            ) {
              callback({ place_id: "place-26" }, "OK");
            }
          },
          PlacesServiceStatus: {
            OK: "OK",
            ZERO_RESULTS: "ZERO_RESULTS",
          },
        },
      },
    } as any;

    await expect(
      fetchGoogleAddressPlaceDetails({
        description: "26 Luverne Ave, North York, ON, Canada",
        mainText: "26 Luverne Ave",
        placeId: "place-26",
        secondaryText: "North York, ON, Canada",
      }),
    ).resolves.toMatchObject({
      latitude: 43.7591,
      longitude: -79.443,
      placeId: "place-26",
    });
  });
});

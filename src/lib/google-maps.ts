export interface GoogleAddressSuggestion {
  description: string;
  mainText: string;
  placeId: string;
  secondaryText?: string;
}

export interface GoogleAddressPlaceDetails {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

interface GoogleAutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

interface GoogleAutocompleteService {
  getPlacePredictions: (
    request: {
      input: string;
      types?: string[];
    },
    callback: (
      predictions: GoogleAutocompletePrediction[] | null,
      status: string
    ) => void
  ) => void;
}

interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

interface GooglePlaceResult {
  formatted_address?: string;
  geometry?: {
    location?: GoogleLatLng;
  };
  place_id?: string;
}

interface GoogleGeocoderResult {
  formatted_address?: string;
  geometry?: {
    location?: GoogleLatLng;
  };
  place_id?: string;
}

interface GoogleGeocoder {
  geocode: (
    request: { address?: string; placeId?: string },
    callback: (results: GoogleGeocoderResult[] | null, status: string) => void
  ) => void;
}

interface GooglePlacesService {
  getDetails: (
    request: {
      fields?: string[];
      placeId: string;
    },
    callback: (place: GooglePlaceResult | null, status: string) => void
  ) => void;
}

interface GoogleMapsPlacesNamespace {
  AutocompleteService: new () => GoogleAutocompleteService;
  PlacesService: new (element: HTMLElement) => GooglePlacesService;
  PlacesServiceStatus?: {
    OK?: string;
    ZERO_RESULTS?: string;
  };
}

declare global {
  interface Window {
    __drawflowGoogleMapsPlacesPromise?: Promise<GoogleMapsPlacesNamespace | null>;
    google?: {
      maps?: {
        Geocoder?: new () => GoogleGeocoder;
        GeocoderStatus?: {
          OK?: string;
          ZERO_RESULTS?: string;
        };
        places?: GoogleMapsPlacesNamespace;
      };
    };
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "drawflow-google-maps-js";
const GOOGLE_MAPS_API_BASE = "https://maps.googleapis.com/maps/api";

export function getGoogleMapsApiKey(): string | null {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function isGoogleMapsConfigured(): boolean {
  return getGoogleMapsApiKey() !== null;
}

export async function fetchGoogleAddressSuggestions(
  input: string
): Promise<GoogleAddressSuggestion[]> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const places = await loadGooglePlaces();
  if (!places) {
    return [];
  }

  const service = new places.AutocompleteService();
  const okStatus = places.PlacesServiceStatus?.OK ?? "OK";
  const zeroResultsStatus =
    places.PlacesServiceStatus?.ZERO_RESULTS ?? "ZERO_RESULTS";

  return new Promise((resolve, reject) => {
    service.getPlacePredictions(
      {
        input: trimmed,
        types: ["address"],
      },
      (predictions, status) => {
        if (status === zeroResultsStatus) {
          resolve([]);
          return;
        }
        if (status !== okStatus) {
          reject(new Error(`Google Places autocomplete failed: ${status}`));
          return;
        }
        resolve((predictions ?? []).map(normalizeAddressPrediction));
      }
    );
  });
}

export async function fetchGoogleAddressPlaceDetails(
  suggestion: GoogleAddressSuggestion
): Promise<GoogleAddressPlaceDetails | null> {
  const places = await loadGooglePlaces();
  if (!places || typeof document === "undefined") {
    return null;
  }

  const serviceNode = document.createElement("div");
  serviceNode.hidden = true;
  document.body.appendChild(serviceNode);
  const service = new places.PlacesService(serviceNode);
  const okStatus = places.PlacesServiceStatus?.OK ?? "OK";

  try {
    const placeDetails = await new Promise<GoogleAddressPlaceDetails | null>(
      (resolve, reject) => {
        service.getDetails(
          {
            fields: ["formatted_address", "geometry", "place_id"],
            placeId: suggestion.placeId,
          },
          (place, status) => {
            if (status !== okStatus) {
              reject(new Error(`Google Places details failed: ${status}`));
              return;
            }
            resolve(normalizePlaceDetails(place, suggestion));
          }
        );
      }
    );
    return placeDetails ?? (await geocodeGoogleAddressSuggestion(suggestion));
  } catch {
    return await geocodeGoogleAddressSuggestion(suggestion);
  } finally {
    serviceNode.remove();
  }
}

function normalizePlaceDetails(
  place: GooglePlaceResult | GoogleGeocoderResult | null,
  suggestion: GoogleAddressSuggestion
): GoogleAddressPlaceDetails | null {
  const location = place?.geometry?.location;
  if (!location) {
    return null;
  }

  return {
    formattedAddress: place.formatted_address ?? suggestion.description,
    latitude: location.lat(),
    longitude: location.lng(),
    placeId: place.place_id ?? suggestion.placeId,
  };
}

function geocodeGoogleAddressSuggestion(
  suggestion: GoogleAddressSuggestion
): Promise<GoogleAddressPlaceDetails | null> {
  const geocoderCtor = window.google?.maps?.Geocoder;
  if (!geocoderCtor) {
    return Promise.resolve(null);
  }
  const okStatus = window.google?.maps?.GeocoderStatus?.OK ?? "OK";
  const geocoder = new geocoderCtor();

  return new Promise((resolve, reject) => {
    geocoder.geocode(
      { placeId: suggestion.placeId },
      (results, status) => {
        if (status !== okStatus) {
          reject(new Error(`Google geocoding failed: ${status}`));
          return;
        }
        resolve(normalizePlaceDetails(results?.[0] ?? null, suggestion));
      }
    );
  });
}

export function createGoogleSatelliteMapUrl({
  address,
  latitude,
  longitude,
  markerLabel = "S",
  scale = 2,
  size = "640x360",
  zoom = 18,
}: {
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  markerLabel?: string;
  scale?: 1 | 2;
  size?: `${number}x${number}`;
  zoom?: number;
}): string | null {
  const key = getGoogleMapsApiKey();
  const coordinateCenter =
    typeof latitude === "number" && typeof longitude === "number"
      ? `${latitude},${longitude}`
      : null;
  const center = coordinateCenter ?? address?.trim();
  if (!(key && center)) {
    return null;
  }

  const url = new URL(`${GOOGLE_MAPS_API_BASE}/staticmap`);
  url.searchParams.set("center", center);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("size", size);
  url.searchParams.set("scale", String(scale));
  url.searchParams.set("maptype", "satellite");
  url.searchParams.set(
    "markers",
    `color:red|label:${markerLabel.slice(0, 1).toUpperCase()}|${center}`
  );
  url.searchParams.set("key", key);
  return url.toString();
}

function normalizeAddressPrediction(
  prediction: GoogleAutocompletePrediction
): GoogleAddressSuggestion {
  return {
    description: prediction.description,
    mainText:
      prediction.structured_formatting?.main_text ?? prediction.description,
    placeId: prediction.place_id,
    secondaryText: prediction.structured_formatting?.secondary_text,
  };
}

function loadGooglePlaces(): Promise<GoogleMapsPlacesNamespace | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps.places);
  }
  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.resolve(null);
  }
  if (window.__drawflowGoogleMapsPlacesPromise) {
    return window.__drawflowGoogleMapsPlacesPromise;
  }

  window.__drawflowGoogleMapsPlacesPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const handleLoad = () => resolve(window.google?.maps?.places ?? null);
    const handleError = () =>
      reject(new Error("Unable to load the Google Maps JavaScript API."));

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `${GOOGLE_MAPS_API_BASE}/js?${new URLSearchParams({
      key,
      libraries: "places",
      loading: "async",
    }).toString()}`;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return window.__drawflowGoogleMapsPlacesPromise;
}

export interface GoogleAddressSuggestion {
  description: string;
  mainText: string;
  placeId: string;
  secondaryText?: string;
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

interface GoogleMapsPlacesNamespace {
  AutocompleteService: new () => GoogleAutocompleteService;
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

export function createGoogleSatelliteMapUrl({
  address,
  markerLabel = "S",
  scale = 2,
  size = "640x360",
  zoom = 18,
}: {
  address: string;
  markerLabel?: string;
  scale?: 1 | 2;
  size?: `${number}x${number}`;
  zoom?: number;
}): string | null {
  const key = getGoogleMapsApiKey();
  const center = address.trim();
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

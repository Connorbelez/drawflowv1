import { useCallback, useState, useSyncExternalStore } from "react";
import {
  readBrowserConnectivity,
  readServerConnectivity,
  subscribeToConnectivity,
} from "./site-visit-token-route-contracts";

type ReplacementRequest = (input: {
  buildId: string;
  reason: string;
  token: string;
}) => Promise<unknown>;

export function useSiteVisitReplacementRequest({
  buildId,
  requestReplacement,
  siteVisitToken,
}: {
  buildId: string;
  requestReplacement: ReplacementRequest;
  siteVisitToken: string;
}) {
  const [requestingReplacement, setRequestingReplacement] = useState(false);
  const [replacementError, setReplacementError] = useState("");
  const [replacementReference, setReplacementReference] = useState("");

  const requestNewLink = useCallback(
    async (reason: string) => {
      setReplacementError("");
      setRequestingReplacement(true);
      try {
        const result = (await requestReplacement({
          buildId,
          reason,
          token: siteVisitToken,
        })) as { reference: string; requested: true };
        setReplacementReference(result.reference);
      } catch {
        setReplacementError(
          "The replacement-link request could not be recorded. Contact the requester and share the Build identity shown below."
        );
      } finally {
        setRequestingReplacement(false);
      }
    },
    [buildId, requestReplacement, siteVisitToken]
  );

  return {
    replacementError,
    replacementReference,
    requestingReplacement,
    requestNewLink,
  };
}

export function useSiteVisitConnectivity() {
  return useSyncExternalStore(
    subscribeToConnectivity,
    readBrowserConnectivity,
    readServerConnectivity
  );
}

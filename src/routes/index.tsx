import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { Route as MarketingRoute } from "./marketing.tsx";

export const Route = createFileRoute("/")({
  // Root homepage uses marketing GSAP scene; keep SSR off like /marketing.
  ssr: false,
  component: HomePage,
  head: getHomePageHead,
});

function HomePage() {
  const MarketingPage = MarketingRoute.options.component as ComponentType;

  return <MarketingPage />;
}

function getHomePageHead() {
  return MarketingRoute.options.head?.();
}

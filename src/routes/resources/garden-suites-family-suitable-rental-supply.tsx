import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute(
  "/resources/garden-suites-family-suitable-rental-supply"
)({
  component: GardenSuitesSupplyArticle,
  head: () => getArticlePageHead("gardenSuitesSupply"),
});

function GardenSuitesSupplyArticle() {
  return <FairlendArticlePage pageId="gardenSuitesSupply" />;
}

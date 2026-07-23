import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute(
  "/resources/sustainable-rental-housing-investor-returns"
)({
  component: SustainableReturnsArticle,
  head: () => getArticlePageHead("sustainableReturns"),
});

function SustainableReturnsArticle() {
  return <FairlendArticlePage pageId="sustainableReturns" />;
}

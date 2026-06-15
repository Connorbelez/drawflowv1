import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute(
  "/resources/financing-gap-gta-multiplex-builds"
)({
  component: FinancingGapArticle,
  head: () => getArticlePageHead("financingGap"),
});

function FinancingGapArticle() {
  return <FairlendArticlePage pageId="financingGap" />;
}

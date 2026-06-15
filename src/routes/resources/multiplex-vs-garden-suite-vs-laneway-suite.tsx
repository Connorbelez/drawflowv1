import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute(
  "/resources/multiplex-vs-garden-suite-vs-laneway-suite"
)({
  component: MultiplexVsSuiteArticle,
  head: () => getArticlePageHead("multiplexVsSuite"),
});

function MultiplexVsSuiteArticle() {
  return <FairlendArticlePage pageId="multiplexVsSuite" />;
}

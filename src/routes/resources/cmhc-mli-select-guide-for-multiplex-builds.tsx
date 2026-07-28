import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute(
  "/resources/cmhc-mli-select-guide-for-multiplex-builds"
)({
  component: MliSelectGuideArticle,
  head: () => getArticlePageHead("mliSelectGuide"),
});

function MliSelectGuideArticle() {
  return <FairlendArticlePage pageId="mliSelectGuide" />;
}

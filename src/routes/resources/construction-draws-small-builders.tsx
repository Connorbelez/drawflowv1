import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/resources/construction-draws-small-builders")({
  component: ConstructionDrawsArticle,
  head: () => getArticlePageHead("constructionDraws"),
});

function ConstructionDrawsArticle() {
  return <FairlendArticlePage pageId="constructionDraws" />;
}

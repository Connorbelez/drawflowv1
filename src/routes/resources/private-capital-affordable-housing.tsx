import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendArticlePage,
  getArticlePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/resources/private-capital-affordable-housing")({
  component: PrivateCapitalArticle,
  head: () => getArticlePageHead("privateCapital"),
});

function PrivateCapitalArticle() {
  return <FairlendArticlePage pageId="privateCapital" />;
}

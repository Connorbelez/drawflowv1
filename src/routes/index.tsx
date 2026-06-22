import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendPublicPage,
  getCorePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => getCorePageHead("home"),
});

function HomePage() {
  return <FairlendPublicPage pageId="home" />;
}

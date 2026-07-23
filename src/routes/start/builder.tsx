import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendIntakePage,
  getIntakePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/start/builder")({
  component: StartBuilderPage,
  head: () => getIntakePageHead("startBuilder"),
});

function StartBuilderPage() {
  return <FairlendIntakePage pageId="startBuilder" />;
}

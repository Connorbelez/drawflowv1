import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendIntakePage,
  getIntakePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/start/media")({
  component: StartMediaPage,
  head: () => getIntakePageHead("startMedia"),
});

function StartMediaPage() {
  return <FairlendIntakePage pageId="startMedia" />;
}

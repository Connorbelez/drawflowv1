import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendIntakePage,
  getIntakePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/start/broker")({
  component: StartBrokerPage,
  head: () => getIntakePageHead("startBroker"),
});

function StartBrokerPage() {
  return <FairlendIntakePage pageId="startBroker" />;
}

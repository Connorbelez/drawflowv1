import { createFileRoute } from "@tanstack/react-router";

import {
  FairlendIntakePage,
  getIntakePageHead,
} from "#/features/fairlend-public/fairlend-public-pages.tsx";

export const Route = createFileRoute("/start/investor")({
  component: StartInvestorPage,
  head: () => getIntakePageHead("startInvestor"),
});

function StartInvestorPage() {
  return <FairlendIntakePage pageId="startInvestor" />;
}

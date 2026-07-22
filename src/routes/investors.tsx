import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { FairlendInvestorOverview } from "#/components/marketing/fairlend-investor-overview.tsx";

const investorAssetBase = "/assets/fairlend-investor-page-jun14";
const heroBuildingAsset = `${investorAssetBase}/hero-multifamily-building-photo.webp`;
const heroBlueprintAsset = `${investorAssetBase}/hero-blueprint-board.webp`;

export const Route = createFileRoute("/investors")({
  component: InvestorsPage,
  head: () => ({
    meta: [
      {
        title: "Investors | Fairlend",
      },
      {
        name: "description",
        content:
          "Explore Fairlend investor opportunities across private mortgage investments and construction-backed build funding, managed with underwriting and execution support.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: heroBuildingAsset,
      },
      {
        rel: "preload",
        as: "image",
        href: heroBlueprintAsset,
      },
    ],
  }),
});

function InvestorsPage(): ReactElement {
  return <FairlendInvestorOverview />;
}

import {
  Building06Icon,
  DashboardSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { SidebarNavGroup } from "#/components/app-shared.tsx";

const icon = (value: typeof DashboardSquare01Icon) => (
  <HugeiconsIcon icon={value} strokeWidth={2} />
);

export const homeownerNavGroups: SidebarNavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        icon: icon(DashboardSquare01Icon),
        title: "Home",
        to: "/homeowner",
      },
      {
        icon: icon(Building06Icon),
        matchPrefix: true,
        title: "My builds",
        to: "/homeowner",
      },
    ],
  },
];

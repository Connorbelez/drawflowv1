import {
  Calendar03Icon,
  DashboardSquare01Icon,
  ImageUploadIcon,
  Settings01Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  type SidebarNavGroup,
  footerNavLinks,
} from "#/components/app-shared.tsx";

export { footerNavLinks };

const icon = (i: typeof DashboardSquare01Icon) => (
  <HugeiconsIcon icon={i} strokeWidth={2} />
);

/**
 * Contractor Workspace navigation (PRD §8.1). Contractor-specific navigation,
 * deliberately not folded into builder or backoffice navigation. Centers the
 * field-operational surfaces: work, schedule, evidence, profile.
 */
export const contractorNavGroups: SidebarNavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Dashboard",
        to: "/contractor",
        icon: icon(DashboardSquare01Icon),
      },
      {
        title: "Work",
        to: "/contractor/work",
        icon: icon(ToolsIcon),
      },
      {
        title: "Schedule",
        to: "/contractor/schedule",
        icon: icon(Calendar03Icon),
        matchPrefix: true,
      },
      {
        title: "Evidence",
        to: "/contractor/evidence",
        icon: icon(ImageUploadIcon),
      },
      {
        title: "Profile",
        to: "/contractor/profile",
        icon: icon(Settings01Icon),
      },
    ],
  },
];

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  isNavItemActive,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "#/components/app-shared.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "#/components/ui/sidebar.tsx";

export function NavGroup({ label, items }: SidebarNavGroup) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {items.map((item) => {
          const itemActive = isNavItemActive(item, pathname);
          const childActive =
            item.subItems?.some((sub) => isNavItemActive(sub, pathname)) ??
            false;
          return (
            <Collapsible
              className="group/collapsible"
              defaultOpen={itemActive || childActive}
              key={item.title}
              render={<SidebarMenuItem />}
            >
              {item.subItems?.length ? (
                <>
                  <CollapsibleTrigger
                    render={<SidebarMenuButton isActive={itemActive} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                    <HugeiconsIcon
                      className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.subItems.map((sub) => (
                        <SidebarMenuSubItem key={sub.title}>
                          <NavSubLink item={sub} pathname={pathname} />
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : (
                <NavLeafLink active={itemActive} item={item} />
              )}
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavLeafLink({
  item,
  active,
}: {
  item: SidebarNavItem;
  active: boolean;
}) {
  return (
    <SidebarMenuButton
      isActive={active}
      render={<Link preload="intent" to={item.to} viewTransition />}
    >
      {item.icon}
      <span>{item.title}</span>
    </SidebarMenuButton>
  );
}

function NavSubLink({
  item,
  pathname,
}: {
  item: SidebarNavItem;
  pathname: string;
}) {
  const active = isNavItemActive(item, pathname);
  return (
    <SidebarMenuSubButton
      isActive={active}
      render={<Link preload="intent" to={item.to} viewTransition />}
    >
      {item.icon}
      <span>{item.title}</span>
    </SidebarMenuSubButton>
  );
}

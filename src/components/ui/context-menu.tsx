import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import type * as React from "react";
import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "#/components/ui/menu.tsx";
import { cn } from "#/lib/utils.ts";

function ContextMenu({
  ...props
}: ContextMenuPrimitive.Root.Props): React.ReactElement {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuPortal({
  ...props
}: ContextMenuPrimitive.Portal.Props): React.ReactElement {
  return <MenuPortal data-slot="context-menu-portal" {...props} />;
}

function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.Trigger
      className={cn("select-none", className)}
      data-slot="context-menu-trigger"
      {...props}
    />
  );
}

function ContextMenuContent({
  align = "start",
  alignOffset = 4,
  className,
  side = "right",
  sideOffset = 0,
  ...props
}: React.ComponentProps<typeof MenuPopup>): React.ReactElement {
  return (
    <MenuPopup
      align={align}
      alignOffset={alignOffset}
      className={cn("min-w-56", className)}
      data-slot="context-menu-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenuSubPopup>): React.ReactElement {
  return (
    <MenuSubPopup
      className={cn("min-w-48", className)}
      data-slot="context-menu-sub-content"
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  MenuItem as ContextMenuItem,
  MenuCheckboxItem as ContextMenuCheckboxItem,
  MenuRadioItem as ContextMenuRadioItem,
  MenuGroupLabel as ContextMenuLabel,
  MenuSeparator as ContextMenuSeparator,
  MenuShortcut as ContextMenuShortcut,
  MenuGroup as ContextMenuGroup,
  ContextMenuPortal,
  MenuSub as ContextMenuSub,
  ContextMenuSubContent,
  MenuSubTrigger as ContextMenuSubTrigger,
  MenuRadioGroup as ContextMenuRadioGroup,
};

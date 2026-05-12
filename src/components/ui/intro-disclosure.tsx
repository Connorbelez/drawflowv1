import type { ReactNode } from "react";
import * as React from "react";
import { X } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { cn } from "#/lib/utils.ts";

export interface IntroDisclosureTab {
  badge?: ReactNode;
  content: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  id: string;
  label: string;
}

interface IntroDisclosureProps {
  className?: string;
  defaultTabId?: string;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  tabs: IntroDisclosureTab[];
  triggerHidden?: boolean;
  title: string;
  triggerDescription?: ReactNode;
  triggerIcon?: ReactNode;
  triggerLabel: string;
}

export function IntroDisclosure({
  className,
  defaultTabId,
  open,
  setOpen,
  tabs,
  triggerHidden = false,
  title,
  triggerDescription,
  triggerIcon,
  triggerLabel,
}: IntroDisclosureProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [activeTabId, setActiveTabId] = React.useState(
    defaultTabId ?? tabs[0]?.id
  );
  const isOpen = open ?? internalOpen;
  const handleOpenChange = setOpen ?? setInternalOpen;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  React.useEffect(() => {
    if (defaultTabId && tabs.some((tab) => tab.id === defaultTabId)) {
      setActiveTabId(defaultTabId);
    }
  }, [defaultTabId, tabs]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {triggerHidden ? null : (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 px-3">
          <Button
            aria-label={triggerLabel}
            className="min-h-14 w-full justify-start gap-3 rounded-md border border-border bg-card px-3 text-left text-foreground shadow-none hover:bg-muted"
            data-testid="intro-disclosure-trigger"
            onClick={() => handleOpenChange(true)}
            size="lg"
            variant="outline"
          >
            {triggerIcon ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                {triggerIcon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-sm">
                {triggerLabel}
              </span>
              {triggerDescription ? (
                <span className="block truncate text-muted-foreground text-xs">
                  {triggerDescription}
                </span>
              ) : null}
            </span>
          </Button>
        </div>
      )}
      <Drawer open={isOpen} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader className="border-border border-b px-4 pb-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <DrawerTitle className="text-base">{title}</DrawerTitle>
              <DrawerDescription className="sr-only">
                {activeTab?.description ?? triggerLabel}
              </DrawerDescription>
              <Button
                aria-label="Close workspace panels"
                data-testid="intro-disclosure-close"
                onClick={() => handleOpenChange(false)}
                size="icon"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
          </DrawerHeader>
          <div
            aria-labelledby={`intro-disclosure-tab-${activeTab?.id}`}
            className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+7.5rem)]"
            data-testid={`intro-disclosure-panel-${activeTab?.id}`}
            id={`intro-disclosure-panel-${activeTab?.id}`}
            role="tabpanel"
          >
            {activeTab?.content}
          </div>
          <div className="absolute inset-x-2 bottom-2 rounded-b-xl border-border border-t bg-popover px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-3">
            <div
              aria-label={`${title} tabs`}
              className="grid grid-cols-2 gap-1 rounded-md border border-border bg-card p-1"
              role="tablist"
            >
              {tabs.map((tab) => (
                <button
                  aria-controls={`intro-disclosure-panel-${tab.id}`}
                  aria-selected={activeTab?.id === tab.id}
                  className={cn(
                    "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-sm border px-1 font-medium text-[0.72rem] transition",
                    activeTab?.id === tab.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-bg-base text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`intro-disclosure-tab-${tab.id}`}
                  id={`intro-disclosure-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.icon ? (
                    <span className="shrink-0">{tab.icon}</span>
                  ) : null}
                  <span className="truncate">{tab.label}</span>
                  {tab.badge ? (
                    <span className="shrink-0">{tab.badge}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {activeTab?.description ? (
              <div className="mt-2 truncate text-center text-muted-foreground text-xs">
                {activeTab.description}
              </div>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default IntroDisclosure;

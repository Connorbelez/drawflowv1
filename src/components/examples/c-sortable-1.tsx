"use client";

import {
  DragDropVerticalIcon,
  File02Icon,
  ImageIcon,
  MusicNote03Icon,
  Video02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/reui/badge.tsx";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";

interface SortableItem {
  description: string;
  id: string;
  size: string;
  title: string;
  type: "image" | "document" | "audio" | "video";
}

const defaultItems: SortableItem[] = [
  {
    id: "1",
    title: "Product Demo",
    description: "Main product image",
    type: "image",
    size: "2.4 MB",
  },
  {
    id: "2",
    title: "Product Specification",
    description: "Technical details document",
    type: "document",
    size: "1.2 MB",
  },
  {
    id: "3",
    title: "Product Demo Video",
    description: "How to use the product",
    type: "video",
    size: "15.7 MB",
  },
  {
    id: "4",
    title: "Product Audio Guide",
    description: "Audio instructions",
    type: "audio",
    size: "8.3 MB",
  },
  {
    id: "5",
    title: "Product Specification",
    description: "Additional product view",
    type: "image",
    size: "3.1 MB",
  },
];

const getTypeIcon = (type: SortableItem["type"]) => {
  switch (type) {
    case "image":
      return (
        <HugeiconsIcon className="h-4 w-4" icon={ImageIcon} strokeWidth={2} />
      );
    case "document":
      return (
        <HugeiconsIcon className="h-4 w-4" icon={File02Icon} strokeWidth={2} />
      );
    case "audio":
      return (
        <HugeiconsIcon
          className="h-4 w-4"
          icon={MusicNote03Icon}
          strokeWidth={2}
        />
      );
    case "video":
      return (
        <HugeiconsIcon className="h-4 w-4" icon={Video02Icon} strokeWidth={2} />
      );
  }
};

const getTypeColor = (type: SortableItem["type"]) => {
  switch (type) {
    case "image":
      return "primary-light";
    case "document":
      return "success-light";
    case "audio":
      return "destructive-light";
    case "video":
      return "info-light";
  }
};

export function Pattern() {
  const [items, setItems] = useState<SortableItem[]>(defaultItems);

  const handleValueChange = (newItems: SortableItem[]) => {
    setItems(newItems);

    // Show toast with new order
    toast.success("Items reordered successfully!", {
      description: newItems
        .map((item, index) => `${index + 1}. ${item.title}`)
        .join(", "),
    });
  };

  const getItemValue = (item: SortableItem) => item.id;

  return (
    <div className="mx-auto w-full max-w-xl space-y-8 p-6">
      <Sortable
        className="space-y-2"
        getItemValue={getItemValue}
        onValueChange={handleValueChange}
        strategy="vertical"
        value={items}
      >
        {items.map((item) => (
          <SortableItem key={item.id} value={item.id}>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:bg-accent/50"
              onClick={() => {}}
            >
              <SortableItemHandle className="text-muted-foreground hover:text-foreground">
                <HugeiconsIcon
                  className="h-4 w-4"
                  icon={DragDropVerticalIcon}
                  strokeWidth={2}
                />
              </SortableItemHandle>

              <div className="flex items-center gap-2 text-muted-foreground">
                {getTypeIcon(item.type)}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="truncate font-medium text-sm">{item.title}</h4>
                <p className="truncate text-muted-foreground text-xs">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={getTypeColor(item.type)}>{item.type}</Badge>
                <span className="text-muted-foreground text-xs">
                  {item.size}
                </span>
              </div>
            </div>
          </SortableItem>
        ))}
      </Sortable>
    </div>
  );
}

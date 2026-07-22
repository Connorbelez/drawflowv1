"use client";

import {
  createContext,
  Fragment,
  type HTMLAttributes,
  type ReactNode,
  useContext,
} from "react";

import { Card } from "#/components/ui/card.tsx";
import { ScrollArea, ScrollBar } from "#/components/ui/scroll-area.tsx";
import { cn } from "#/lib/utils.ts";

type KanbanItem = {
  column: string;
  id: string;
  name: string;
} & Record<string, unknown>;

type KanbanColumn = {
  id: string;
  name: string;
} & Record<string, unknown>;

const ReadonlyKanbanContext = createContext<readonly KanbanItem[]>([]);

export interface KanbanBoardProps {
  children: ReactNode;
  className?: string;
  id: string;
}

export function KanbanBoard({ children, className, id }: KanbanBoardProps) {
  return (
    <div
      className={cn(
        "flex size-full min-h-40 flex-col divide-y overflow-hidden rounded-md border bg-secondary text-xs shadow-sm ring-2 ring-transparent",
        className
      )}
      id={id}
    >
      {children}
    </div>
  );
}

export type KanbanCardProps<T extends KanbanItem = KanbanItem> = T & {
  children?: ReactNode;
  className?: string;
};

export function KanbanCard<T extends KanbanItem = KanbanItem>({
  children,
  className,
  name,
}: KanbanCardProps<T>) {
  return (
    <Card className={cn("gap-4 rounded-md p-3 shadow-sm", className)}>
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </Card>
  );
}

export type KanbanCardsProps<T extends KanbanItem = KanbanItem> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: (item: T) => ReactNode;
  id: string;
};

export function KanbanCards<T extends KanbanItem = KanbanItem>({
  children,
  className,
  id,
  ...props
}: KanbanCardsProps<T>) {
  const data = useContext(ReadonlyKanbanContext) as readonly T[];
  const filteredData = data.filter((item) => item.column === id);

  return (
    <ScrollArea className="overflow-hidden">
      <div
        className={cn("flex flex-grow flex-col gap-2 p-2", className)}
        id={id}
        {...props}
      >
        {filteredData.map((item) => (
          <Fragment key={item.id}>{children(item)}</Fragment>
        ))}
      </div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}

export type KanbanHeaderProps = HTMLAttributes<HTMLDivElement>;

export function KanbanHeader({ className, ...props }: KanbanHeaderProps) {
  return (
    <div
      className={cn("m-0 p-2 font-semibold text-sm", className)}
      {...props}
    />
  );
}

export interface KanbanProviderProps<
  T extends KanbanItem = KanbanItem,
  C extends KanbanColumn = KanbanColumn,
> {
  children: (column: C) => ReactNode;
  className?: string;
  columns: C[];
  data: T[];
}

export function KanbanProvider<
  T extends KanbanItem = KanbanItem,
  C extends KanbanColumn = KanbanColumn,
>({ children, className, columns, data }: KanbanProviderProps<T, C>) {
  return (
    <ReadonlyKanbanContext.Provider value={data}>
      <div
        className={cn(
          "grid size-full auto-cols-fr grid-flow-col gap-4",
          className
        )}
      >
        {columns.map((column) => children(column))}
      </div>
    </ReadonlyKanbanContext.Provider>
  );
}

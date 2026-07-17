import { ArrowUpRight } from "lucide-react";

import { Card } from "#/components/ui/card.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Radio } from "#/components/ui/radio-group.tsx";
import { cn } from "#/lib/utils.ts";
import type { AccessPersona } from "./access-personas.ts";

interface PersonaOptionCardProps {
  persona: AccessPersona;
  selected: boolean;
}

export function PersonaOptionCard({
  persona,
  selected,
}: PersonaOptionCardProps) {
  const Icon = persona.icon;

  return (
    <Card
      className={cn(
        "group flex-row rounded-xl shadow-none transition-[border-color,background-color,transform] duration-200 ease-out before:rounded-[calc(var(--radius-xl)-1px)]",
        "hover:border-foreground/24 hover:bg-accent/40 active:translate-y-px",
        "has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-1 has-focus-visible:ring-offset-background",
        selected && "border-foreground/28 bg-accent/72"
      )}
      data-selected={selected ? "true" : undefined}
      render={
        <Label
          className="min-h-20 w-full cursor-pointer gap-4 p-4"
          htmlFor={`access-persona-${persona.id}`}
        />
      }
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground transition-colors duration-200",
          selected && "border-foreground bg-foreground text-background"
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-sm leading-5">
          {persona.label}
        </span>
        <span className="mt-1 block text-muted-foreground text-sm leading-5">
          {persona.description}
        </span>
      </span>
      <Radio
        aria-label={persona.label}
        className="sr-only"
        id={`access-persona-${persona.id}`}
        value={persona.id}
      />
      <ArrowUpRight
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200",
          selected && "translate-x-0.5 -translate-y-0.5 text-foreground"
        )}
      />
    </Card>
  );
}

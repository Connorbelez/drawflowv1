"use client";

import { ArrowRight, LockKeyhole, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { RadioGroup } from "#/components/ui/radio-group.tsx";
import {
  ACCESS_PERSONAS,
  type AccessPersonaId,
  getAccessPersona,
} from "./access-personas.ts";
import { PersonaOptionCard } from "./PersonaOptionCard.tsx";

export function PersonaAccessSelector() {
  const [selectedId, setSelectedId] = useState<AccessPersonaId>("builder");
  const selected = getAccessPersona(selectedId);
  const encodedDestination = encodeURIComponent(selected.destination);

  const selectPersona = (value: string) => {
    const updateSelection = () => setSelectedId(value as AccessPersonaId);

    if (
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      document.startViewTransition(() => flushSync(updateSelection));
      return;
    }

    updateSelection();
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-lg leading-6">
            Where should DrawFlow open?
          </h2>
          <p className="mt-1 max-w-[48ch] text-muted-foreground text-sm leading-5">
            Access is granted only by your confirmed WorkOS membership.
          </p>
        </div>
        <Badge className="hidden sm:inline-flex" variant="outline">
          <LockKeyhole aria-hidden="true" />
          Secured by WorkOS
        </Badge>
      </div>

      <RadioGroup
        aria-label="DrawFlow workspace"
        className="gap-3 px-5 py-5 sm:px-6"
        onValueChange={selectPersona}
        value={selectedId}
      >
        {ACCESS_PERSONAS.map((persona) => (
          <PersonaOptionCard
            key={persona.id}
            persona={persona}
            selected={persona.id === selectedId}
          />
        ))}
      </RadioGroup>

      <div className="mt-auto border-t px-5 py-5 sm:px-6">
        <div
          aria-live="polite"
          className="access-route-preview mb-4 flex items-start gap-3"
        >
          <span
            aria-hidden="true"
            className="mt-2 size-1.5 rounded-full bg-foreground"
          />
          <div>
            <p className="font-medium text-sm">{selected.routeLabel}</p>
            <p className="mt-1 text-muted-foreground text-sm leading-5">
              {selected.detail}
            </p>
          </div>
        </div>

        <Button
          className="access-primary-action w-full justify-between"
          render={
            // biome-ignore lint/a11y/useAnchorContent: Button injects its accessible children into the rendered anchor.
            <a
              aria-label="Continue to secure sign in"
              href={`/api/auth/sign-in?returnPathname=${encodedDestination}`}
            />
          }
          size="xl"
        >
          Continue to secure sign in
          <ArrowRight aria-hidden="true" />
        </Button>

        <Button
          className="mt-2 w-full text-muted-foreground"
          render={
            // biome-ignore lint/a11y/useAnchorContent: Button injects its accessible children into the rendered anchor.
            <a
              aria-label="Activate your account"
              href={`/api/auth/sign-up?returnPathname=${encodedDestination}`}
            />
          }
          variant="ghost"
        >
          <UserRoundPlus aria-hidden="true" />
          Activate your account
        </Button>
      </div>
    </div>
  );
}

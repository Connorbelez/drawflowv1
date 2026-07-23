import { Sparkles } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";

export function DrawFlowAssistantLauncher({
  disabled = false,
  onOpen,
  onPreload,
}: {
  disabled?: boolean;
  onOpen: () => void;
  onPreload?: () => void;
}): ReactElement {
  return (
    <Button
      aria-label={
        disabled
          ? "Loading DrawFlow AI assistant"
          : "Open DrawFlow AI assistant"
      }
      className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-[100000] size-12 rounded-full shadow-lg"
      data-drawflow-assistant-launcher=""
      disabled={disabled}
      onClick={onOpen}
      onFocus={onPreload}
      onPointerEnter={onPreload}
      size="icon"
    >
      <Sparkles className="size-5" />
    </Button>
  );
}

declare module "#/components/ScrollReveal.jsx" {
  import type { ComponentType, ElementType, ReactNode, RefObject } from "react";

  type ScrollRevealProps = {
    children: ReactNode;
    "aria-hidden"?: boolean | "false" | "true";
    ariaHidden?: boolean;
    as?: ElementType;
    baseOpacity?: number;
    baseRotation?: number;
    blurStrength?: number;
    containerClassName?: string;
    rotationEnd?: string;
    rotationStart?: string;
    textAs?: ElementType;
    textClassName?: string;
    triggerRef?: RefObject<HTMLElement | null>;
    wordAnimationEnd?: string;
    wordAnimationStart?: string;
  };

  const ScrollReveal: ComponentType<ScrollRevealProps>;
  export default ScrollReveal;
}

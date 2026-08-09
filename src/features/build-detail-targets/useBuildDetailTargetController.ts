import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type BuildDetailTarget,
  focusForBuildDetailTarget,
  sameBuildDetailTarget,
} from "./buildDetailTarget.ts";

export interface BuildDetailTargetContext {
  focusSelector?: string;
  scrollY?: number;
  selectedTab?: string;
}

export interface BuildDetailHistoryFrame extends BuildDetailTargetContext {
  focus: string;
  target: BuildDetailTarget;
}

export interface BuildDetailHistoryState {
  frames: BuildDetailHistoryFrame[];
  index: number;
  interactive: boolean;
}

const EMPTY_HISTORY: BuildDetailHistoryState = {
  frames: [],
  index: -1,
  interactive: false,
};

export function pushBuildDetailHistory(
  state: BuildDetailHistoryState,
  target: BuildDetailTarget,
  context: BuildDetailTargetContext = {},
) {
  const focus = focusForBuildDetailTarget(target);
  const current = state.frames[state.index];
  if (current && sameBuildDetailTarget(current.target, target)) {
    return state;
  }
  const frames = [
    ...state.frames.slice(0, state.index + 1),
    { ...context, focus, target },
  ];
  return {
    frames,
    index: frames.length - 1,
    interactive: state.interactive || state.frames.length === 0,
  } satisfies BuildDetailHistoryState;
}

export function resolveBuildDetailCloseNavigation(
  state: BuildDetailHistoryState,
  hasPendingInteractiveTarget = false,
) {
  if (!(state.interactive && state.index >= 0)) {
    return { replace: true } as const;
  }
  return {
    delta: -(state.index + 1 + (hasPendingInteractiveTarget ? 1 : 0)),
    replace: false,
  } as const;
}

export function reconcileBuildDetailHistory(
  state: BuildDetailHistoryState,
  focus: string | undefined,
  target: BuildDetailTarget | undefined,
) {
  if (!(focus && target)) {
    return EMPTY_HISTORY;
  }
  const matchingIndex = state.frames.findIndex(
    (frame) =>
      frame.focus === focus && sameBuildDetailTarget(frame.target, target),
  );
  if (matchingIndex >= 0) {
    if (state.index === matchingIndex) {
      return state;
    }
    return { ...state, index: matchingIndex };
  }
  return {
    frames: [{ focus, target }],
    index: 0,
    interactive: false,
  } satisfies BuildDetailHistoryState;
}

export function useBuildDetailTargetController({
  focus,
  resolutionState,
  target,
}: {
  focus?: string;
  resolutionState: "integrity_error" | "loading" | "revoked" | "visible";
  target?: BuildDetailTarget;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [history, setHistory] =
    useState<BuildDetailHistoryState>(EMPTY_HISTORY);
  const historyRef = useRef(history);
  const pendingInteractiveFocus = useRef<string | null>(null);
  const pendingInteractiveContext = useRef<BuildDetailTargetContext>({});
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const changeFocus = useCallback(
    (nextFocus: string | undefined, replace: boolean) =>
      navigate({
        replace,
        resetScroll: false,
        search: ((previous: Record<string, unknown>) => ({
          ...previous,
          focus: nextFocus,
        })) as never,
        to: "." as never,
      } as never),
    [navigate],
  );

  useEffect(() => {
    if (resolutionState === "loading") {
      return;
    }
    if (resolutionState === "revoked") {
      pendingInteractiveFocus.current = null;
      setHistory(EMPTY_HISTORY);
      if (focus) {
        void changeFocus(undefined, true);
      }
      return;
    }
    if (resolutionState === "visible") {
      const isPendingInteractiveTarget = Boolean(
        focus && target && pendingInteractiveFocus.current === focus,
      );
      const pendingContext = isPendingInteractiveTarget
        ? pendingInteractiveContext.current
        : undefined;
      if (isPendingInteractiveTarget) {
        pendingInteractiveFocus.current = null;
        pendingInteractiveContext.current = {};
      }
      setHistory((current) =>
        isPendingInteractiveTarget && target
          ? pushBuildDetailHistory(current, target, pendingContext)
          : reconcileBuildDetailHistory(current, focus, target),
      );
    }
  }, [changeFocus, focus, resolutionState, target]);

  const openTarget = useCallback(
    (nextTarget: BuildDetailTarget, context: BuildDetailTargetContext = {}) => {
      const next = pushBuildDetailHistory(
        historyRef.current,
        nextTarget,
        context,
      );
      if (next === historyRef.current) {
        return;
      }
      historyRef.current = next;
      setHistory(next);
      void changeFocus(focusForBuildDetailTarget(nextTarget), false);
    },
    [changeFocus],
  );

  const openFocus = useCallback(
    (
      nextFocus: string,
      options: {
        context?: BuildDetailTargetContext;
        navigate?: boolean;
      } = {},
    ) => {
      if (
        historyRef.current.frames[historyRef.current.index]?.focus === nextFocus
      ) {
        return;
      }
      pendingInteractiveFocus.current = nextFocus;
      pendingInteractiveContext.current = options.context ?? {};
      if (options.navigate !== false) {
        void changeFocus(nextFocus, false);
      }
    },
    [changeFocus],
  );

  const close = useCallback(() => {
    const current = historyRef.current;
    const hasPendingInteractiveTarget =
      pendingInteractiveFocus.current !== null;
    pendingInteractiveFocus.current = null;
    pendingInteractiveContext.current = {};
    historyRef.current = EMPTY_HISTORY;
    setHistory(EMPTY_HISTORY);
    const navigation = resolveBuildDetailCloseNavigation(
      current,
      hasPendingInteractiveTarget,
    );
    if (!navigation.replace) {
      router.history.go(navigation.delta);
      return;
    }
    void changeFocus(undefined, true);
  }, [changeFocus, router.history]);

  const back = useCallback(() => {
    if (historyRef.current.index > 0) {
      router.history.back();
    }
  }, [router.history]);

  const forward = useCallback(() => {
    if (
      historyRef.current.index >= 0 &&
      historyRef.current.index < historyRef.current.frames.length - 1
    ) {
      router.history.forward();
    }
  }, [router.history]);

  const currentFrame = history.frames[history.index];
  useEffect(() => {
    if (resolutionState !== "visible" || !currentFrame) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      if (currentFrame.scrollY !== undefined) {
        window.scrollTo({ behavior: "auto", top: currentFrame.scrollY });
      }
      if (currentFrame.focusSelector) {
        try {
          document
            .querySelector<HTMLElement>(currentFrame.focusSelector)
            ?.focus({ preventScroll: true });
        } catch {
          // The selector is captured from a trusted local element; ignore a
          // stale selector after route content changes.
        }
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [currentFrame, resolutionState]);
  return {
    back,
    canGoBack: history.index > 0,
    canGoForward:
      history.index >= 0 && history.index < history.frames.length - 1,
    close,
    currentFrame,
    forward,
    history,
    openFocus,
    openTarget,
  };
}

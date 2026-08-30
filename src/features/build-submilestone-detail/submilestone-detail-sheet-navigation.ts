import { useEffect, useState } from "react";

import type {
  CanonicalDirtySection,
  PendingCanonicalNavigation,
} from "./submilestone-detail-sheet-contracts.ts";

interface SheetNavigationArgs {
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function useSheetNavigation({
  onGoBack,
  onGoForward,
  onOpenChange,
  open,
}: SheetNavigationArgs) {
  const [dirtySections, setDirtySections] = useState<
    Record<CanonicalDirtySection, boolean>
  >({
    guidance: false,
    scope: false,
  });
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingCanonicalNavigation | null>(null);
  const [scopeGuidanceOpen, setScopeGuidanceOpen] = useState(false);
  const hasUnsavedCanonicalChanges =
    dirtySections.scope || dirtySections.guidance;

  useEffect(() => {
    if (!open) {
      setDirtySections({ guidance: false, scope: false });
      setPendingNavigation(null);
      setScopeGuidanceOpen(false);
    }
  }, [open]);

  const onCanonicalDirtyChange = (
    section: CanonicalDirtySection,
    dirty: boolean
  ) => {
    setDirtySections((current) =>
      current[section] === dirty ? current : { ...current, [section]: dirty }
    );
  };
  const requestNavigation = (action: () => void, label: string) => {
    if (!hasUnsavedCanonicalChanges) {
      action();
      return;
    }
    setPendingNavigation({ action, label });
  };
  const closeGuidanceAnd = (action: () => void) => {
    setScopeGuidanceOpen(false);
    action();
  };
  const handleClose = () =>
    requestNavigation(
      () => closeGuidanceAnd(() => onOpenChange(false)),
      "close this Sub-milestone detail"
    );
  const handleGoBack = () =>
    requestNavigation(
      () => closeGuidanceAnd(onGoBack),
      "open the previous Sub-milestone"
    );
  const handleGoForward = () =>
    requestNavigation(
      () => closeGuidanceAnd(onGoForward),
      "open the next Sub-milestone"
    );
  const discardCanonicalChangesAndContinue = () => {
    const action = pendingNavigation?.action;
    setPendingNavigation(null);
    setDirtySections({ guidance: false, scope: false });
    action?.();
  };

  return {
    discardCanonicalChangesAndContinue,
    handleClose,
    handleGoBack,
    handleGoForward,
    onCanonicalDirtyChange,
    pendingNavigation,
    requestNavigation,
    scopeGuidanceOpen,
    setPendingNavigation,
    setScopeGuidanceOpen,
  };
}

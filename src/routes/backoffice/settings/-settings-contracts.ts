export type ActiveTab = "template" | "scenarios";

export type PendingConfirmation = "seed" | "save" | null;

export type TimelineSettingsWorkspaceLabels = {
  emptyBody: string;
  emptyTitle: string;
  eyebrow: string;
  loadingText: string;
  sectionLabel: string;
  seedButtonLabel: string;
  seedConfirmBody: string;
  seedConfirmTitle: string;
  title: string;
};

export type TimelineSettingsMutationResult =
  | { settings?: unknown; [key: string]: unknown }
  | unknown;

export const SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS = 1_000_000;

export const SETTINGS_TAB_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
} as const;

export const SETTINGS_TAB_REDUCED_TRANSITION = { duration: 0 } as const;

export const SETTINGS_TAB_PANEL_VARIANTS = {
  enter: ({
    direction,
    reducedMotion,
  }: {
    direction: number;
    reducedMotion: boolean;
  }) => ({
    opacity: reducedMotion ? 1 : 0,
    scale: reducedMotion ? 1 : 0.992,
    x: reducedMotion ? 0 : direction * 18,
  }),
  exit: ({
    direction,
    reducedMotion,
  }: {
    direction: number;
    reducedMotion: boolean;
  }) => ({
    opacity: reducedMotion ? 1 : 0,
    scale: reducedMotion ? 1 : 0.996,
    x: reducedMotion ? 0 : direction * -12,
  }),
  show: {
    opacity: 1,
    scale: 1,
    x: 0,
  },
};

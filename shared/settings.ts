export type OverlaySettings = {
  /** Semi-transparent panel behind the numbers; off for a fully transparent overlay. */
  showBackground: boolean;
  showProgress: boolean;
};

/** Settings persisted between app starts. Votes are deliberately never stored. */
export type Settings = {
  /** Last TikTok username the user connected to; empty if none. */
  username: string;
  target: number;
  overlay: OverlaySettings;
};

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  showBackground: true,
  showProgress: true
};

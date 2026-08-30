export type ColorTheme =
  | "default"
  | "catppuccin"
  | "rose-pine"
  | "tokyo-night"
  | "nord"
  | "gruvbox";

export type ViewMode = "list" | "gallery";

export type UserSettings = {
  viewMode: ViewMode;
  theme: ColorTheme;
};

export type PaletteTab = {
  id: number;
  windowId: number;
  title: string;
  url: string;
  hostname: string;
  faviconUrl?: string;
  previewUrl?: string;
  active: boolean;
  windowFocused: boolean;
  pinned: boolean;
  lastAccessed?: number;
};

export type BrowserMessage =
  | { type: "get-tabs" }
  | { type: "activate-tab"; tab: PaletteTab }
  | { type: "open-url"; url: string }
  | { type: "open-shortcut-settings" }
  | { type: "open-palette"; mode?: "search" | "switcher"; previewUrl?: string }
  | { type: "update-switcher-preview"; previewUrl: string }
  | { type: "cycle-tab-switcher"; direction?: "next" | "prev" }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<UserSettings> };



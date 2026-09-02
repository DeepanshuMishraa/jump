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
  disableMouseTabSwitcher: boolean;
  disableMouseCommandPalette: boolean;
  pinnedTabIds: number[];
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
  | { type: "search-history"; query: string; maxResults?: number }
  | { type: "activate-tab"; tab: PaletteTab }
  | { type: "open-url"; url: string; openerTabId?: number }
  | { type: "search-web"; query: string; openerTabId?: number }
  | { type: "open-shortcut-settings" }
  | { type: "open-palette"; mode?: "search" | "switcher"; previewUrl?: string }
  | { type: "update-switcher-preview"; previewUrl: string }
  | { type: "cycle-tab-switcher"; direction?: "next" | "prev" }
  | { type: "request-pin-selected-tab" }
  | { type: "set-tab-pinned"; tabId: number; pinned: boolean }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<UserSettings> };



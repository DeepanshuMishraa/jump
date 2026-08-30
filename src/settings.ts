import type { ColorTheme, UserSettings, ViewMode } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  viewMode: "list",
  theme: "default",
};

export type ThemeInfo = {
  id: ColorTheme;
  name: string;
  badge: string;
  bg: string;
  accent: string;
  text: string;
};

export const THEMES: ThemeInfo[] = [
  {
    id: "default",
    name: "OLED Black",
    badge: "Pitch Dark",
    bg: "#08080a",
    accent: "#38bdf8",
    text: "#ffffff",
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    badge: "Mocha",
    bg: "#1e1e2e",
    accent: "#cba6f7",
    text: "#cdd6f4",
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    badge: "Moon",
    bg: "#191724",
    accent: "#ebbcba",
    text: "#e0def4",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    badge: "Night",
    bg: "#1a1b26",
    accent: "#7aa2f7",
    text: "#c0caf5",
  },
  {
    id: "nord",
    name: "Nord",
    badge: "Arctic",
    bg: "#242933",
    accent: "#88c0d0",
    text: "#eceff4",
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    badge: "Retro",
    bg: "#282828",
    accent: "#fe8019",
    text: "#ebdbb2",
  },
];

export async function getStoredSettings(): Promise<UserSettings> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      const data = await chrome.storage.sync.get(["viewMode", "theme"]);
      return {
        viewMode: (data.viewMode as ViewMode) || DEFAULT_SETTINGS.viewMode,
        theme: (data.theme as ColorTheme) || DEFAULT_SETTINGS.theme,
      };
    }
  } catch {
    // Fallback to localStorage if chrome.storage is unavailable
  }

  try {
    const raw = localStorage.getItem("jump_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}

  return DEFAULT_SETTINGS;
}

export async function saveStoredSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getStoredSettings();
  const next: UserSettings = { ...current, ...partial };

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      await chrome.storage.sync.set(next);
    }
  } catch {}

  try {
    localStorage.setItem("jump_settings", JSON.stringify(next));
  } catch {}

  return next;
}

export function subscribeToSettings(callback: (settings: UserSettings) => void) {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === "sync" || areaName === "local") {
      void getStoredSettings().then(callback);
    }
  };

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  return () => {};
}

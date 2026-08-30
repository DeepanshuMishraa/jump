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

const LOCAL_SETTINGS_KEY = "jump_settings";
type SettingsBackend = "sync" | "local" | "localStorage";

let selectedBackend: SettingsBackend | undefined;
let saveQueue = Promise.resolve<UserSettings>(DEFAULT_SETTINGS);
const subscribers = new Set<(settings: UserSettings) => void>();

function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "gallery";
}

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "default" || value === "catppuccin" || value === "rose-pine" ||
    value === "tokyo-night" || value === "nord" || value === "gruvbox";
}

export function parseStoredSettings(value: unknown): UserSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const viewMode = "viewMode" in value && isViewMode(value.viewMode) ? value.viewMode : DEFAULT_SETTINGS.viewMode;
  const theme = "theme" in value && isColorTheme(value.theme) ? value.theme : DEFAULT_SETTINGS.theme;
  return { viewMode, theme };
}

function parseSettingsUpdate(value: unknown): Partial<UserSettings> {
  if (typeof value !== "object" || value === null) return {};
  return {
    ...( "viewMode" in value && isViewMode(value.viewMode) ? { viewMode: value.viewMode } : {}),
    ...( "theme" in value && isColorTheme(value.theme) ? { theme: value.theme } : {}),
  };
}

function canUseSyncStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.sync !== undefined;
}

function canUseChromeLocalStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local !== undefined;
}

function readLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return raw === null ? DEFAULT_SETTINGS : parseStoredSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeLocalSettings(settings: UserSettings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory result available to the current caller.
  }
}

async function readChromeLocalSettings() {
  if (!canUseChromeLocalStorage()) throw new Error("Local extension storage is unavailable");
  const stored: unknown = await chrome.storage.local.get(["viewMode", "theme"]);
  return parseStoredSettings(stored);
}

async function writeChromeLocalSettings(settings: UserSettings) {
  if (!canUseChromeLocalStorage()) throw new Error("Local extension storage is unavailable");
  await chrome.storage.local.set(settings);
}

function notifySubscribers(settings: UserSettings) {
  subscribers.forEach((callback) => callback(settings));
}

export async function getStoredSettings(): Promise<UserSettings> {
  if (selectedBackend === "local") return readChromeLocalSettings();
  if (selectedBackend === "localStorage") return readLocalSettings();

  if (canUseSyncStorage()) {
    try {
      const settings = parseStoredSettings(await chrome.storage.sync.get(["viewMode", "theme"]));
      selectedBackend = "sync";
      return settings;
    } catch {
      if (canUseChromeLocalStorage()) {
        selectedBackend = "local";
        return readChromeLocalSettings();
      }
      selectedBackend = "localStorage";
    }
  } else if (canUseChromeLocalStorage()) {
    selectedBackend = "local";
    return readChromeLocalSettings();
  } else {
    selectedBackend = "localStorage";
  }

  return readLocalSettings();
}

async function saveSettings(partial: Partial<UserSettings>) {
  const current = await getStoredSettings();
  const update = parseSettingsUpdate(partial);
  const next: UserSettings = { ...current, ...update };

  if (selectedBackend === "sync" && canUseSyncStorage()) {
    try {
      await chrome.storage.sync.set(update);
      return next;
    } catch {
      selectedBackend = canUseChromeLocalStorage() ? "local" : "localStorage";
    }
  }

  if (selectedBackend === "local") {
    try {
      await writeChromeLocalSettings(next);
    } catch {
      selectedBackend = "localStorage";
      writeLocalSettings(next);
    }
  } else {
    writeLocalSettings(next);
  }
  notifySubscribers(next);
  return next;
}

export function saveStoredSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const pendingSave = saveQueue.then(() => saveSettings(partial), () => saveSettings(partial));
  saveQueue = pendingSave;
  return pendingSave;
}

export function subscribeToSettings(callback: (settings: UserSettings) => void) {
  subscribers.add(callback);
  const storageListener = (_changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== "sync" && areaName !== "local") return;
    if (areaName === "sync" && selectedBackend !== "sync") return;
    if (areaName === "local" && selectedBackend !== "local") return;
    void getStoredSettings().then(callback);
  };
  const localStorageListener = (event: StorageEvent) => {
    if (selectedBackend !== "localStorage" || (event.key !== null && event.key !== LOCAL_SETTINGS_KEY)) return;
    callback(readLocalSettings());
  };

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) chrome.storage.onChanged.addListener(storageListener);
  if (typeof window !== "undefined") window.addEventListener("storage", localStorageListener);

  return () => {
    subscribers.delete(callback);
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) chrome.storage.onChanged.removeListener(storageListener);
    if (typeof window !== "undefined") window.removeEventListener("storage", localStorageListener);
  };
}

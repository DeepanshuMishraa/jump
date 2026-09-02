import { useEffect, useRef, useState } from "react";
import { openShortcutSettings } from "../browser";
import { ArrowUpRightIcon, CommandIcon, GridIcon, ListIcon } from "../icons";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings } from "../settings";
import type { UserSettings, ViewMode } from "../types";
import { resolveSettingsRead } from "./settingsState";

const VIEW_OPTIONS = [
  { mode: "list", label: "List", Icon: ListIcon },
  { mode: "gallery", label: "Gallery", Icon: GridIcon },
] as const;

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const settingsRevision = useRef(0);
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const defaultSearchShortcut = isMac ? "⌘⇧P" : "Ctrl Shift P";
  const defaultSwitcherShortcut = isMac ? "⌥Q" : "Alt Q";
  const defaultPinShortcut = isMac ? "⌘K" : "Ctrl K";
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version
    ? chrome.runtime.getManifest().version
    : "0.1.3";

  useEffect(() => {
    const readRevision = settingsRevision.current;
    void getStoredSettings().then((loaded) => {
      setSettings((current) => resolveSettingsRead(
        current,
        loaded,
        readRevision,
        settingsRevision.current,
      ));
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.commands?.getAll) return;
    void chrome.commands.getAll().then((commands) => {
      const currentShortcuts: Record<string, string> = {};
      commands.forEach((command) => {
        if (command.name && command.shortcut) currentShortcuts[command.name] = command.shortcut;
      });
      setShortcuts(currentShortcuts);
    });
  }, []);

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const saveRevision = settingsRevision.current + 1;
    settingsRevision.current = saveRevision;
    setSettings((current) => ({ ...current, [key]: value }));
    const next = await saveStoredSettings({ [key]: value });
    if (settingsRevision.current === saveRevision) setSettings(next);
  };

  const updateViewMode = (mode: ViewMode) => updateSetting("viewMode", mode);

  return (
    <main className="popup-container">
      <header className="popup-header">
        <div className="popup-brand">
          <span className="popup-mark" aria-hidden="true">
            <CommandIcon size={14} />
          </span>
          <div className="popup-brand-text">
            <div className="popup-title-row">
              <h1 className="popup-title">Jump</h1>
              <span className="popup-version-pill">v{version}</span>
            </div>
            <p className="popup-tagline">Fast tab search &amp; switcher</p>
          </div>
        </div>
      </header>

      <section className="popup-section" aria-labelledby="default-view-label">
        <div className="popup-section-heading">
          <span id="default-view-label">Default view</span>
          <span className="popup-section-context">Command palette</span>
        </div>

        <div className="popup-segmented" role="group" aria-label="Default command palette view">
          {VIEW_OPTIONS.map(({ mode, label, Icon }) => {
            const isActive = settings.viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`popup-segmented-item ${isActive ? "active" : ""}`}
                aria-pressed={isActive}
                disabled={mode === "gallery"}
                aria-disabled={mode === "gallery"}
                onClick={() => {
                  if (mode !== "gallery") void updateViewMode(mode);
                }}
              >
                <Icon size={13} />
                <span>{label}</span>
                {mode === "gallery" && <span className="popup-coming-soon">Coming soon</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-section popup-mouse-settings" aria-labelledby="mouse-settings-label">
        <div className="popup-section-heading">
          <span id="mouse-settings-label">Keyboard-only navigation</span>
          <span className="popup-section-context">Disable mouse</span>
        </div>
        <label className="popup-toggle-row">
          <span>Tab switcher</span>
          <input
            type="checkbox"
            checked={settings.disableMouseTabSwitcher}
            onChange={(event) => void updateSetting("disableMouseTabSwitcher", event.target.checked)}
          />
        </label>
        <label className="popup-toggle-row">
          <span>Command palette</span>
          <input
            type="checkbox"
            checked={settings.disableMouseCommandPalette}
            onChange={(event) => void updateSetting("disableMouseCommandPalette", event.target.checked)}
          />
        </label>
      </section>

      <section className="popup-shortcuts" aria-label="Keyboard shortcuts">
        <div className="popup-shortcut-row">
          <span>Search tabs</span>
          <span className="popup-key-group">
            <kbd>{shortcuts["open-palette"] ?? defaultSearchShortcut}</kbd>
          </span>
        </div>
        <div className="popup-shortcut-row">
          <span>Visual switcher</span>
          <span className="popup-key-group">
            <kbd>{shortcuts["open-tab-switcher"] ?? defaultSwitcherShortcut}</kbd>
          </span>
        </div>
        <div className="popup-shortcut-row">
          <span>Pin selected tab</span>
          <span className="popup-key-group">
            <kbd>{shortcuts["pin-tab"] ?? defaultPinShortcut}</kbd>
          </span>
        </div>
      </section>

      <footer className="popup-footer-bar">
        <button
          type="button"
          className="popup-settings-link"
          onClick={async () => {
            try {
              await openShortcutSettings();
            } finally {
              window.close();
            }
          }}
        >
          <span>Customize shortcuts</span>
          <ArrowUpRightIcon size={11} />
        </button>
      </footer>
    </main>
  );
}

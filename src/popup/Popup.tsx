import { useEffect, useRef, useState } from "react";
import { openShortcutSettings } from "../browser";
import { ArrowUpRightIcon, CommandIcon } from "../icons";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings } from "../settings";
import type { TabSwitchMode, UserSettings } from "../types";
import { resolveSettingsRead } from "./settingsState";

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const settingsRevision = useRef(0);
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const defaultSearchShortcut = isMac ? "⌘⇧P" : "Ctrl Shift P";
  const defaultSwitcherShortcut = isMac ? "⌥Q" : "Alt Q";
  const defaultPinShortcut = isMac ? "⌘K" : "Alt K";
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
    }).catch(() => {
      // Keep defaults when settings are temporarily unavailable.
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
    const previousSettings = settings;
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      const next = await saveStoredSettings({ [key]: value });
      if (settingsRevision.current === saveRevision) setSettings(next);
    } catch {
      if (settingsRevision.current === saveRevision) {
        try {
          setSettings(await getStoredSettings());
        } catch {
          setSettings(previousSettings);
        }
      }
    }
  };

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

      <section className="popup-section" aria-labelledby="tab-switching-label">
        <div className="popup-section-heading">
          <span id="tab-switching-label">Tab switching</span>
          <span className="popup-section-context">Cycle order</span>
        </div>
        <div className="popup-segmented" role="group" aria-label="Tab switching order">
          {(["recent", "order"] as const satisfies readonly TabSwitchMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`popup-segmented-item ${settings.tabSwitchMode === mode ? "active" : ""}`}
              aria-pressed={settings.tabSwitchMode === mode}
              onClick={() => void updateSetting("tabSwitchMode", mode)}
            >
              <span>{mode === "recent" ? "Recent" : "Tab order"}</span>
            </button>
          ))}
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

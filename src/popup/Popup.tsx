import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings } from "../settings";
import type { UserSettings, ViewMode } from "../types";

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version
    ? `v${chrome.runtime.getManifest().version}`
    : "v0.1.0";

  useEffect(() => {
    void getStoredSettings().then(setSettings);
  }, []);

  const updateViewMode = async (mode: ViewMode) => {
    const next = await saveStoredSettings({ viewMode: mode });
    setSettings(next);
  };

  return (
    <div className="popup-container">
      <div className="popup-segmented">
        <button
          type="button"
          className={`popup-segmented-item ${settings.viewMode === "list" ? "active" : ""}`}
          onClick={() => void updateViewMode("list")}
        >
          List
        </button>
        <button
          type="button"
          className={`popup-segmented-item ${settings.viewMode === "gallery" ? "active" : ""}`}
          onClick={() => void updateViewMode("gallery")}
        >
          Gallery
        </button>
      </div>

      <div className="popup-version">{version}</div>
    </div>
  );
}

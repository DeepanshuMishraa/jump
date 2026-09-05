import { useState } from "react";
import { GlobeIcon, MuteIcon, SpeakerIcon } from "../icons";
import type { PaletteTab } from "../types";

export function TabFavicon({ tab, size = 16 }: { tab: PaletteTab; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const failed = tab.faviconUrl !== undefined && failedUrl === tab.faviconUrl;
  if (!tab.faviconUrl || failed) {
    return (
      <span className="item-icon fallback-favicon" style={{ width: size, height: size }} aria-hidden="true">
        <GlobeIcon size={Math.round(size * 0.75)} />
      </span>
    );
  }
  return <img className="item-icon tab-favicon" style={{ width: size, height: size }} src={tab.faviconUrl} alt="" onError={() => setFailedUrl(tab.faviconUrl)} loading="eager" />;
}

export function TabSoundIndicator({
  tab,
  size = 14,
  onToggleMute,
}: {
  tab: PaletteTab;
  size?: number;
  onToggleMute?: () => void;
}) {
  if (!tab.muted && !tab.audible) return null;

  const label = tab.muted ? "Unmute tab" : "Mute tab";
  const icon = tab.muted
    ? <MuteIcon size={size} className="tab-audible-icon" />
    : <SpeakerIcon size={size} className="tab-audible-icon" />;
  if (!onToggleMute) return icon;

  return (
    <button
      type="button"
      className="tab-sound-button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onToggleMute();
      }}
    >
      {icon}
    </button>
  );
}

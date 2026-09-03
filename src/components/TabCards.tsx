import { PinIcon } from "../icons";
import type { PaletteTab } from "../types";
import { TabFavicon, TabSoundIndicator } from "./TabVisuals";

type CardProps = {
  tab: PaletteTab;
  index: number;
  isSelected: boolean;
  previewUrl?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
};

export function SwitcherCard({ tab, isSelected, previewUrl, index, onClick, onMouseEnter }: CardProps) {
  const effectivePreview = tab.previewUrl || (tab.active && tab.windowFocused ? previewUrl : undefined);
  return (
    <div data-switcher-index={index} className={`switcher-card ${isSelected ? "is-selected" : ""}`} onClick={onClick} onMouseEnter={onMouseEnter} role="option" aria-selected={isSelected}>
      <div className="switcher-thumbnail">
        {effectivePreview ? <img src={effectivePreview} alt="" className="switcher-thumbnail-image" loading="eager" /> : (
          <div className="switcher-placeholder">
            <div className="switcher-placeholder-icon"><TabFavicon tab={tab} size={32} /></div>
            <span className="switcher-placeholder-domain">{tab.hostname || "Web Page"}</span>
          </div>
        )}
        <div className="switcher-thumbnail-glass" />
      </div>
      <div className="switcher-card-footer">
        <TabFavicon tab={tab} size={18} />
        <span className="switcher-card-title">{tab.title}</span>
        {tab.pinned && <PinIcon className="tab-pinned-icon" size={13} />}
        <TabSoundIndicator tab={tab} />
      </div>
    </div>
  );
}

export function GalleryCard({ tab, index, isSelected, previewUrl, onClick, onMouseEnter }: CardProps) {
  const effectivePreview = tab.previewUrl || (tab.active && tab.windowFocused ? previewUrl : undefined);
  return (
    <div data-index={index} className={`gallery-card ${isSelected ? "selected" : ""}`} onClick={onClick} onMouseEnter={onMouseEnter} role="option" aria-selected={isSelected}>
      <div className="gallery-thumbnail">
        {effectivePreview ? <img src={effectivePreview} alt="" className="gallery-thumbnail-image" loading="eager" /> : (
          <div className="gallery-placeholder">
            <TabFavicon tab={tab} size={28} />
            <span className="gallery-placeholder-domain">{tab.hostname || "Web Page"}</span>
          </div>
        )}
      </div>
      <div className="gallery-meta">
        <div className="gallery-meta-left">
          <TabFavicon tab={tab} size={15} />
          <span className="gallery-title">{tab.title}</span>
          {tab.pinned && <PinIcon className="tab-pinned-icon" size={12} />}
          <TabSoundIndicator tab={tab} />
        </div>
        {tab.hostname && <span className="gallery-domain">{tab.hostname}</span>}
      </div>
    </div>
  );
}

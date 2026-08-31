import { ArrowRightIcon, GlobeIcon, SearchIcon } from "./icons";
import type { SearchResult } from "./paletteSearch";

export function PaletteAction({
  result,
  index,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  result: Exclude<SearchResult, { kind: "tab" }>;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const isBang = result.kind === "bang";
  const isUrl = result.kind === "url";
  const title = isBang || isUrl ? (isBang ? result.query : result.url) : result.query;
  const domain = isBang ? `${result.label} (!${result.bang})` : isUrl ? "Open URL" : "Search on Web";
  const actionLabel = isBang || isUrl ? "Open" : "Search";

  return (
    <div
      data-index={index}
      className={`list-row palette-action-row ${isSelected ? "selected" : ""}`}
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <div className="list-row-left">
        <span className="action-icon-badge">
          {isBang || isUrl ? <GlobeIcon size={16} /> : <SearchIcon size={16} />}
        </span>
        <div className="row-content">
          <span className="row-title">{title}</span>
          <span className="row-domain">— {domain}</span>
        </div>
      </div>

      <div className={`list-row-action ${isSelected ? "active" : ""}`}>
        <span className="action-text">{actionLabel}</span>
        <span className="action-arrow-badge">
          <ArrowRightIcon size={12} />
        </span>
      </div>
    </div>
  );
}

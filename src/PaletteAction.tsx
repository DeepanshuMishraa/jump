import { ArrowRightIcon, SearchIcon } from "./icons";
import type { SearchResult } from "./paletteSearch";

export function PaletteAction({
  result,
  index,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  result: Extract<SearchResult, { kind: "search" }>;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
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
          <SearchIcon size={16} />
        </span>
        <div className="row-content">
          <span className="row-title">{result.query}</span>
          <span className="row-domain">— Search on Web</span>
        </div>
      </div>

      <div className={`list-row-action ${isSelected ? "active" : ""}`}>
        <span className="action-text">Search</span>
        <span className="action-arrow-badge">
          <ArrowRightIcon size={12} />
        </span>
      </div>
    </div>
  );
}

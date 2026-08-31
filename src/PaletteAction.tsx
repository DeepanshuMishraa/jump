import { SearchIcon } from "./icons";
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
  const title = result.kind === "url" ? "Open in new tab" : `Search for "${result.query}"`;
  const subtitle = result.kind === "url" ? result.url : "Use your browser's default search engine";

  return (
    <div
      data-index={index}
      className={`list-row palette-action-row ${isSelected ? "selected" : ""}`}
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <SearchIcon size={18} />
      <div className="row-content">
        <span className="row-title">{title}</span>
        <span className="row-subtitle">{subtitle}</span>
      </div>
    </div>
  );
}

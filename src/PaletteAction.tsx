import { useState } from "react";
import { ArrowRightIcon, GlobeIcon, SearchIcon } from "./icons";
import type { SearchResult } from "./paletteSearch";

function historyHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function HistoryFavicon({ result }: { result: Extract<SearchResult, { kind: "visited" }> }) {
  const [source, setSource] = useState(
    result.item.faviconUrl ?? `chrome://favicon/size/16@1x/${encodeURIComponent(result.item.url)}`,
  );
  const [usedFallback, setUsedFallback] = useState(false);

  if (!source) return <GlobeIcon size={16} />;
  return (
    <img
      className="history-favicon"
      src={source}
      alt=""
      onError={() => {
        if (!usedFallback) {
          setUsedFallback(true);
          try {
            const hostname = new URL(result.item.url).hostname;
            setSource(`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(hostname)}`);
          } catch {
            setSource("");
          }
        } else {
          setSource("");
        }
      }}
    />
  );
}

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
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const isBang = result.kind === "bang";
  const isUrl = result.kind === "url";
  const isHistory = result.kind === "history";
  const isVisited = result.kind === "visited";
  const title = isBang || isUrl || isHistory
    ? (isBang || isHistory ? result.query : result.url)
    : isVisited ? result.item.title : result.query;
  const domain = isBang ? `${result.label} (!${result.bang})`
    : isUrl ? "Open URL"
    : isHistory ? "Recent search"
    : isVisited ? historyHostname(result.item.url)
    : "Search on Web";
  const actionLabel = isBang || isUrl || isVisited ? "Open" : isHistory ? "Search again" : "Search";

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
          {isBang || isUrl ? <GlobeIcon size={16} /> : isVisited ? <HistoryFavicon result={result} /> : <SearchIcon size={16} />}
        </span>
        <div className="row-content">
          <span className="row-title">{title}</span>
          <span className="row-domain">— {domain}</span>
        </div>
      </div>

      <div className={`list-row-action ${isSelected ? "selected" : ""}`}>
        <span className="action-text">{actionLabel}</span>
        <span className="action-arrow-badge">
          <ArrowRightIcon size={12} />
        </span>
      </div>
    </div>
  );
}

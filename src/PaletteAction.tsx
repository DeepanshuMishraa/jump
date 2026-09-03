import { useState } from "react";
import { ArrowRightIcon, GlobeIcon, PinIcon, SearchIcon } from "./icons";
import type { SearchResult } from "./paletteSearch";

function historyHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PinnedFavicon({ result }: { result: Extract<SearchResult, { kind: "pinned" }> }) {
  const [failed, setFailed] = useState(false);
  const source = result.tab.faviconUrl || `chrome://favicon/size/32@1x/${encodeURIComponent(result.tab.url)}`;
  if (failed) return <GlobeIcon size={16} />;
  return <img className="item-icon tab-favicon" src={source} alt="" onError={() => setFailed(true)} />;
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
  onAutocomplete,
}: {
  result: Exclude<SearchResult, { kind: "tab" }>;
  index: number;
  isSelected: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onAutocomplete?: () => void;
}) {
  const isBang = result.kind === "bang";
  const isUrl = result.kind === "url";
  const isHistory = result.kind === "history";
  const isVisited = result.kind === "visited";
  const isPinned = result.kind === "pinned";
  const title = isPinned ? result.tab.title
    : isBang || isUrl || isHistory
      ? (isBang || isHistory ? result.query : result.url)
      : isVisited ? result.item.title : result.query;
  const domain = isPinned ? result.tab.hostname || historyHostname(result.tab.url)
    : isBang ? `${result.label} (!${result.bang})`
    : isUrl ? "Open URL"
    : isHistory ? "Recent search"
    : isVisited ? historyHostname(result.item.url)
    : "Search on Web";
  const actionLabel = isPinned || isBang || isUrl || isVisited ? "Open" : isHistory ? "Search again" : "Search";
  const canAutocomplete = isPinned || isHistory;

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
        {isPinned ? (
          <span className="tab-favicon-wrapper">
            <PinnedFavicon result={result} />
          </span>
        ) : (
          <span className="action-icon-badge">
            {isBang || isUrl ? <GlobeIcon size={16} />
              : isVisited ? <HistoryFavicon result={result} />
              : <SearchIcon size={16} />}
          </span>
        )}
        <div className="row-content">
          <span className="row-title">{title}</span>
          {isPinned && <PinIcon className="tab-pinned-icon" size={12} />}
          <span className="row-domain">— {domain}</span>
        </div>
      </div>

      {canAutocomplete ? (
        <button
          type="button"
          className={`list-row-action ${isSelected ? "selected" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onAutocomplete?.();
          }}
          aria-label={`Complete ${title}`}
          title="Complete in search field"
        >
          <span className="action-text">{actionLabel}</span>
          <span className="action-arrow-badge"><ArrowRightIcon size={12} /></span>
        </button>
      ) : (
        <div className={`list-row-action ${isSelected ? "selected" : ""}`}>
          <span className="action-text">{actionLabel}</span>
          <span className="action-arrow-badge"><ArrowRightIcon size={12} /></span>
        </div>
      )}
    </div>
  );
}

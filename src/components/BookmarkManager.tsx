import { useCallback, useMemo, useRef, useState } from "react";
import { getBookmarks, openBookmark } from "../browser";
import { BookmarkIcon, FolderIcon, GlobeIcon, SearchIcon, XIcon } from "../icons";
import { useMountEffect } from "../hooks/useMountEffect";
import type { BookmarkItem, ColorTheme, PalettePosition } from "../types";

function getDisplayDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function BookmarkFavicon({ bookmark }: { bookmark: BookmarkItem }) {
  const [failed, setFailed] = useState(false);
  const faviconUrl = bookmark.faviconUrl;

  if (!faviconUrl || failed) {
    return (
      <span className="bookmark-favicon-fallback" aria-hidden="true">
        <GlobeIcon size={14} />
      </span>
    );
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

export function BookmarkManager({
  theme,
  useVibrancy = true,
  disableMouse = false,
  position = { x: 0.5, y: 0.28 },
  isClosing = false,
  onClose,
}: {
  theme: ColorTheme;
  useVibrancy?: boolean;
  disableMouse?: boolean;
  position?: PalettePosition;
  isClosing?: boolean;
  onClose: () => void;
}) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useMountEffect(() => {
    inputRef.current?.focus();
    void getBookmarks()
      .then(setBookmarks)
      .catch(() => setBookmarks([]));
  });

  const availableFolders = useMemo(() => {
    const folderSet = new Set<string>();
    for (const b of bookmarks) {
      if (b.folderPath.length > 0) {
        const last = b.folderPath[b.folderPath.length - 1]?.trim();
        if (last) folderSet.add(last);
      }
    }
    return Array.from(folderSet);
  }, [bookmarks]);

  const folderTabs = useMemo(() => ["All", ...availableFolders], [availableFolders]);

  const filteredBookmarks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return bookmarks
      .filter((bookmark) => {
        if (selectedFolder && !bookmark.folderPath.includes(selectedFolder)) {
          return false;
        }
        if (!normalized) return true;
        const matchable = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath.join(" ")}`.toLowerCase();
        return matchable.includes(normalized);
      })
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  }, [bookmarks, query, selectedFolder]);

  const openSelected = useCallback(
    (bookmark?: BookmarkItem) => {
      const target = bookmark ?? filteredBookmarks[selectedIndex];
      if (!target) return;
      void openBookmark(target.url);
      onClose();
    },
    [filteredBookmarks, selectedIndex, onClose],
  );

  const updateSelectedIndex = useCallback((nextIndex: number) => {
    setSelectedIndex(nextIndex);
    const row = rowRefs.current[nextIndex];
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const cycleFolder = useCallback(
    (direction: "next" | "prev") => {
      if (folderTabs.length <= 1) return;
      const current = selectedFolder ?? "All";
      const currentIdx = folderTabs.indexOf(current);
      const nextIdx =
        direction === "next"
          ? (currentIdx + 1) % folderTabs.length
          : (currentIdx - 1 + folderTabs.length) % folderTabs.length;

      const nextFolder = folderTabs[nextIdx] === "All" ? null : folderTabs[nextIdx];
      setSelectedFolder(nextFolder);
      setSelectedIndex(0);
    },
    [folderTabs, selectedFolder],
  );

  const clearQuery = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation refs
  const selectedIndexRef = useRef(selectedIndex);
  const countRef = useRef(filteredBookmarks.length);
  const filteredBookmarksRef = useRef(filteredBookmarks);
  const queryRef = useRef(query);
  const onCloseRef = useRef(onClose);
  const cycleFolderRef = useRef(cycleFolder);
  const updateSelectedIndexRef = useRef(updateSelectedIndex);

  selectedIndexRef.current = selectedIndex;
  countRef.current = filteredBookmarks.length;
  filteredBookmarksRef.current = filteredBookmarks;
  queryRef.current = query;
  onCloseRef.current = onClose;
  cycleFolderRef.current = cycleFolder;
  updateSelectedIndexRef.current = updateSelectedIndex;

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (queryRef.current) {
          setQuery("");
          setSelectedIndex(0);
          inputRef.current?.focus();
        } else {
          onCloseRef.current();
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          // Wrap around: when reaching the end, go back to start
          const next = (selectedIndexRef.current + 1) % count;
          updateSelectedIndexRef.current(next);
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          // Wrap around: when at the start, go to the end
          const next = (selectedIndexRef.current - 1 + count) % count;
          updateSelectedIndexRef.current(next);
        }
      } else if (event.key === "ArrowLeft") {
        const isInput = document.activeElement === inputRef.current;
        const atStart = inputRef.current
          ? inputRef.current.selectionStart === 0 && inputRef.current.selectionEnd === 0
          : true;
        if (!isInput || !queryRef.current || atStart || event.altKey) {
          event.preventDefault();
          cycleFolderRef.current("prev");
        }
      } else if (event.key === "ArrowRight") {
        const isInput = document.activeElement === inputRef.current;
        const atEnd = inputRef.current
          ? inputRef.current.selectionStart === queryRef.current.length &&
            inputRef.current.selectionEnd === queryRef.current.length
          : true;
        if (!isInput || !queryRef.current || atEnd || event.altKey) {
          event.preventDefault();
          cycleFolderRef.current("next");
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        const target = filteredBookmarksRef.current[selectedIndexRef.current];
        if (target) {
          void openBookmark(target.url);
          onCloseRef.current();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  });

  return (
    <div
      className={`palette-backdrop ${isClosing ? "is-closing" : ""}`}
      data-theme={theme}
      data-vibrancy={useVibrancy ? "on" : "off"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`palette-card bookmark-card ${isClosing ? "is-closing" : ""}`}
        style={{
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
      >
        {/* Minimal Search Row */}
        <div className="search-bar-row">
          <BookmarkIcon size={16} className="search-lead-icon" />

          {availableFolders.length > 0 ? (
            <button
              type="button"
              className="bookmark-scope-pill"
              onClick={() => cycleFolder("next")}
              title="Switch folder (← / →)"
              aria-label={`Current folder: ${selectedFolder ?? "All"}. Press Left or Right arrow to cycle`}
            >
              <FolderIcon size={11} className="bookmark-scope-icon" />
              <span>{selectedFolder ?? "All"}</span>
              <span className="bookmark-scope-arrow" aria-hidden="true">
                ▾
              </span>
            </button>
          ) : null}

          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder={selectedFolder ? `Search in ${selectedFolder}...` : "Search bookmarks..."}
            aria-label="Search bookmarks"
            autoComplete="off"
            spellCheck="false"
          />

          {query ? (
            <button
              type="button"
              className="clear-icon-btn"
              onClick={clearQuery}
              aria-label="Clear search"
            >
              <XIcon size={13} />
            </button>
          ) : null}

          <span className="bookmark-count-pill" aria-label={`${filteredBookmarks.length} bookmarks`}>
            {filteredBookmarks.length}
          </span>
        </div>

        <div className="palette-divider" />

        {/* Bookmark List */}
        <div
          ref={listRef}
          className="bookmark-list"
          role="listbox"
          aria-label="Bookmarks"
        >
          {filteredBookmarks.length === 0 ? (
            <div className="bookmark-empty-state">
              <span>{query ? "No matching bookmarks" : "No bookmarks found"}</span>
            </div>
          ) : (
            filteredBookmarks.map((bookmark, index) => {
              const isSelected = index === selectedIndex;
              const domain = getDisplayDomain(bookmark.url);

              return (
                <div
                  key={bookmark.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  className={`bookmark-row ${isSelected ? "selected" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={disableMouse ? undefined : () => updateSelectedIndex(index)}
                  onClick={disableMouse ? undefined : () => openSelected(bookmark)}
                >
                  <div className="bookmark-row-left">
                    <span className="bookmark-favicon">
                      <BookmarkFavicon bookmark={bookmark} />
                    </span>
                    <span className="bookmark-title">{bookmark.title}</span>
                  </div>

                  <div className="bookmark-row-right">
                    {domain ? <span className="bookmark-domain">{domain}</span> : null}
                    <span className="bookmark-return-hint" aria-hidden="true">
                      ↵
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

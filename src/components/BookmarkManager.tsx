import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getBookmarks, openBookmark } from "../browser";
import { BookmarkIcon, FolderIcon, GlobeIcon, SearchIcon, XIcon } from "../icons";
import { useMountEffect } from "../hooks/useMountEffect";
import { dragPreviewCellForPoint, isAltModifierActive, nextFreeDragPosition, snapPalettePosition } from "../paletteDrag";
import { saveStoredSettings } from "../settings";
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
  opacity = 1,
  disableMouse = false,
  position = { x: 0.5, y: 0.28 },
  isClosing = false,
  onClose,
}: {
  theme: ColorTheme;
  useVibrancy?: boolean;
  opacity?: number;
  disableMouse?: boolean;
  position?: PalettePosition;
  isClosing?: boolean;
  onClose: () => void;
}) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const isKeyboardNavRef = useRef(false);
  const scrollNeededRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const [dragPosition, setDragPosition] = useState<PalettePosition>();
  const [dragPreviewCell, setDragPreviewCell] = useState<{ column: number; row: number }>();
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startPosition: PalettePosition; moved: boolean } | undefined>(undefined);
  const positionRef = useRef(position);
  const disableMouseRef = useRef(disableMouse);
  positionRef.current = position;
  disableMouseRef.current = disableMouse;

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
        if (selectedFolder && !bookmark.folderPath.some((folder) => folder.trim() === selectedFolder)) {
          return false;
        }
        if (!normalized) return true;
        const normalizedFolders = bookmark.folderPath.map((folder) => folder.trim()).join(" ");
        const matchable = `${bookmark.title} ${bookmark.url} ${normalizedFolders}`.toLowerCase();
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

  const handleRowMouseEnter = useCallback((index: number) => {
    if (disableMouseRef.current || isKeyboardNavRef.current) return;
    selectedIndexRef.current = index;
    setSelectedIndex(index);
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
      selectedIndexRef.current = 0;
      setSelectedIndex(0);
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    },
    [folderTabs, selectedFolder],
  );

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (disableMouseRef.current || event.button !== 0 || !isAltModifierActive(event)) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPosition: positionRef.current, moved: false };
    setDragPosition(positionRef.current);
    setDragPreviewCell(dragPreviewCellForPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  }, []);

  const updateDrag = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    setDragPosition(nextFreeDragPosition({
      startX: drag.startX, startY: drag.startY, startPosition: drag.startPosition,
      clientX: event.clientX, clientY: event.clientY,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    }));
    setDragPreviewCell(dragPreviewCellForPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);

  const finishDrag = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const card = cardRef.current;
    const rect = card?.getBoundingClientRect();
    const nextPosition = snapPalettePosition({
      ...dragPreviewCellForPoint({
        clientX: event.clientX, clientY: event.clientY,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      }),
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      cardWidth: rect?.width ?? 640, cardHeight: rect?.height ?? 320,
    });
    dragRef.current = undefined;
    setDragPosition(undefined);
    setDragPreviewCell(undefined);
    if (drag.moved) void saveStoredSettings({ palettePosition: nextPosition });
  }, []);

  useMountEffect(() => {
    const move = (event: PointerEvent) => updateDrag(event);
    const up = (event: PointerEvent) => finishDrag(event);
    const cancel = () => {
      dragRef.current = undefined;
      setDragPosition(undefined);
      setDragPreviewCell(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  });

  const clearQuery = useCallback(() => {
    setQuery("");
    selectedIndexRef.current = 0;
    setSelectedIndex(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation refs
  const selectedIndexRef = useRef(selectedIndex);
  const countRef = useRef(filteredBookmarks.length);
  const filteredBookmarksRef = useRef(filteredBookmarks);
  const queryRef = useRef(query);
  const onCloseRef = useRef(onClose);
  const cycleFolderRef = useRef(cycleFolder);

  selectedIndexRef.current = selectedIndex;
  countRef.current = filteredBookmarks.length;
  filteredBookmarksRef.current = filteredBookmarks;
  queryRef.current = query;
  onCloseRef.current = onClose;
  cycleFolderRef.current = cycleFolder;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (
        lastMousePosRef.current.x !== -1 &&
        (Math.abs(event.clientX - lastMousePosRef.current.x) > 1 ||
         Math.abs(event.clientY - lastMousePosRef.current.y) > 1)
      ) {
        if (isKeyboardNavRef.current) {
          isKeyboardNavRef.current = false;
          setIsKeyboardNav(false);
        }
      }
      lastMousePosRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleWheel = () => {
      if (isKeyboardNavRef.current) {
        isKeyboardNavRef.current = false;
        setIsKeyboardNav(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredBookmarks.length === 0) return 0;
      const clamped = Math.min(prev, filteredBookmarks.length - 1);
      selectedIndexRef.current = clamped;
      return clamped;
    });
  }, [filteredBookmarks.length]);

  useLayoutEffect(() => {
    if (!scrollNeededRef.current) return;
    scrollNeededRef.current = false;

    const list = listRef.current;
    if (!list) return;

    const count = filteredBookmarks.length;
    if (count <= 1 || selectedIndex === 0) {
      list.scrollTop = 0;
      return;
    }

    if (selectedIndex === count - 1) {
      list.scrollTop = list.scrollHeight;
      return;
    }

    const row = rowRefs.current[selectedIndex] ?? list.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (!row) return;

    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const topPadding = 6;
    const bottomPadding = 6;

    if (rowRect.top < listRect.top + topPadding) {
      list.scrollTop -= Math.ceil(listRect.top + topPadding - rowRect.top);
    } else if (rowRect.bottom > listRect.bottom - bottomPadding) {
      list.scrollTop += Math.ceil(rowRect.bottom - (listRect.bottom - bottomPadding));
    }
  }, [selectedIndex, filteredBookmarks.length]);

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (queryRef.current) {
          setQuery("");
          selectedIndexRef.current = 0;
          setSelectedIndex(0);
          if (listRef.current) {
            listRef.current.scrollTop = 0;
          }
          inputRef.current?.focus();
        } else {
          onCloseRef.current();
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          const current = selectedIndexRef.current;
          if (event.metaKey || event.ctrlKey) {
            if (current < count - 1) {
              scrollNeededRef.current = true;
              isKeyboardNavRef.current = true;
              setIsKeyboardNav(true);
              selectedIndexRef.current = count - 1;
              setSelectedIndex(count - 1);
            }
          } else if (current < count - 1) {
            // Do not cycle: stop at the last result
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            const next = current + 1;
            selectedIndexRef.current = next;
            setSelectedIndex(next);
          }
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          const current = selectedIndexRef.current;
          if (event.metaKey || event.ctrlKey) {
            if (current > 0) {
              scrollNeededRef.current = true;
              isKeyboardNavRef.current = true;
              setIsKeyboardNav(true);
              selectedIndexRef.current = 0;
              setSelectedIndex(0);
            }
          } else if (current > 0) {
            // Do not cycle: stop at the first result
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            const next = current - 1;
            selectedIndexRef.current = next;
            setSelectedIndex(next);
          }
        }
      } else if (event.key === "PageDown") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          const current = selectedIndexRef.current;
          const next = Math.min(count - 1, current + 6);
          if (next !== current) {
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            selectedIndexRef.current = next;
            setSelectedIndex(next);
          }
        }
      } else if (event.key === "PageUp") {
        event.preventDefault();
        const count = countRef.current;
        if (count > 0) {
          const current = selectedIndexRef.current;
          const next = Math.max(0, current - 6);
          if (next !== current) {
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            selectedIndexRef.current = next;
            setSelectedIndex(next);
          }
        }
      } else if (event.key === "Home") {
        const isInput = document.activeElement === inputRef.current;
        if (!isInput || event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (selectedIndexRef.current !== 0) {
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            selectedIndexRef.current = 0;
            setSelectedIndex(0);
          }
        }
      } else if (event.key === "End") {
        const isInput = document.activeElement === inputRef.current;
        if (!isInput || event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const count = countRef.current;
          if (count > 0 && selectedIndexRef.current !== count - 1) {
            scrollNeededRef.current = true;
            isKeyboardNavRef.current = true;
            setIsKeyboardNav(true);
            selectedIndexRef.current = count - 1;
            setSelectedIndex(count - 1);
          }
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
      } else if (event.key === "Tab") {
        event.preventDefault();
        cycleFolderRef.current(event.shiftKey ? "prev" : "next");
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
        if (event.target instanceof HTMLButtonElement) return;
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
      {dragRef.current && (
        <div className="palette-placement-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={index}
              className={`palette-placement-cell ${dragPreviewCell?.column === index % 3 && dragPreviewCell?.row === Math.floor(index / 3) ? "is-preview" : ""}`}
            />
          ))}
        </div>
      )}
      <div
        className={`palette-card bookmark-card ${dragRef.current ? "is-dragging" : ""} ${isClosing ? "is-closing" : ""}`}
        style={{
          left: `${(dragPosition ?? position).x * 100}%`,
          top: `${(dragPosition ?? position).y * 100}%`,
          opacity,
        }}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
        onPointerDown={startDrag}
      >
        {/* Minimal Search Row */}
        <div className="search-bar-row">
          <BookmarkIcon size={16} className="search-lead-icon" />

          {availableFolders.length > 0 ? (
            <button
              type="button"
              className="bookmark-scope-pill"
              onClick={disableMouse ? undefined : () => cycleFolder("next")}
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
              selectedIndexRef.current = 0;
              setSelectedIndex(0);
              if (listRef.current) {
                listRef.current.scrollTop = 0;
              }
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
          data-keyboard-nav={isKeyboardNav ? "true" : "false"}
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
                  data-index={index}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  className={`bookmark-row ${isSelected ? "selected" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={disableMouse ? undefined : () => handleRowMouseEnter(index)}
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

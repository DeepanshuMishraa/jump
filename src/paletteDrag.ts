import type { PalettePosition } from "./types";

export function canStartPaletteDrag({
  altKey,
  button,
  mouseDisabled,
}: {
  altKey: boolean;
  button: number;
  mouseDisabled: boolean;
}) {
  return altKey && button === 0 && !mouseDisabled;
}

type ModifierKeyName =
  | "Alt"
  | "AltGraph"
  | "CapsLock"
  | "Control"
  | "Fn"
  | "FnLock"
  | "Hyper"
  | "Meta"
  | "NumLock"
  | "ScrollLock"
  | "Shift"
  | "Super"
  | "Symbol"
  | "SymbolLock";

type AltModifierSource = {
  key?: string;
  altKey?: boolean;
  getModifierState?: (keyArg: ModifierKeyName) => boolean;
};

/** True while the Alt/Option modifier is held, tolerating missed key events. */
export function isAltModifierActive(event: AltModifierSource) {
  return event.altKey === true || event.key === "Alt" || event.getModifierState?.("Alt") === true;
}

export function dragPreviewCellForPoint({
  clientX,
  clientY,
  viewportWidth,
  viewportHeight,
}: {
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { column: 1, row: 1 };
  return {
    column: Math.min(2, Math.max(0, Math.floor((clientX / viewportWidth) * 3))),
    row: Math.min(2, Math.max(0, Math.floor((clientY / viewportHeight) * 3))),
  };
}

export function nextFreeDragPosition({
  startX,
  startY,
  startPosition,
  clientX,
  clientY,
  viewportWidth,
  viewportHeight,
}: {
  startX: number;
  startY: number;
  startPosition: PalettePosition;
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
}): PalettePosition {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return startPosition;
  return {
    x: Math.min(1, Math.max(0, startPosition.x + (clientX - startX) / viewportWidth)),
    y: Math.min(1, Math.max(0, startPosition.y + (clientY - startY) / viewportHeight)),
  };
}

export function snapPalettePosition({
  column,
  row,
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
}: {
  column: number;
  row: number;
  viewportWidth: number;
  viewportHeight: number;
  cardWidth: number;
  cardHeight: number;
}): PalettePosition {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { x: 0.5, y: 0.28 };
  const x = Math.min(
    1 - cardWidth / (viewportWidth * 2),
    Math.max(cardWidth / (viewportWidth * 2), (column + 0.5) / 3),
  );
  const y = Math.min(
    1 - cardHeight / viewportHeight,
    Math.max(0, (row + 0.5) / 3 - cardHeight / (viewportHeight * 2)),
  );
  return { x, y };
}

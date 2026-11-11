type NavigationKeySource = {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

/** Maps Emacs-style Ctrl+N / Ctrl+P to the arrow key they stand in for. */
export function emacsNavigationKey(event: NavigationKeySource): "ArrowDown" | "ArrowUp" | null {
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return null;
  // Alt is allowed so the switcher can be cycled while Alt is still held.
  if (event.code === "KeyN" || event.key.toLowerCase() === "n") return "ArrowDown";
  if (event.code === "KeyP" || event.key.toLowerCase() === "p") return "ArrowUp";
  return null;
}

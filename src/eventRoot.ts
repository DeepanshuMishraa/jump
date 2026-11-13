import { createContext, useContext } from "react";

/**
 * Where the palette listens for keyboard events.
 *
 * The in-page palette lives in a closed shadow root: its keystrokes are
 * retargeted to the shadow host before they reach `window`, and the content
 * script forwards clones into the shadow tree with `composed: false` so the
 * page never sees them. Those clones cannot reach `window`, so keyboard
 * listeners have to live on the palette's event root instead.
 *
 * `content.tsx` provides the shadow root; the new-tab page keeps the default
 * (`window`) because it renders `App` in a normal document.
 */
const fallbackEventRoot: EventTarget =
  typeof window === "undefined" ? new EventTarget() : window;

export const EventRootContext = createContext<EventTarget>(fallbackEventRoot);

export function useEventRoot(): EventTarget {
  return useContext(EventRootContext);
}

/**
 * Focused element inside the palette's tree. `document.activeElement` stops at
 * the shadow host, so keyboard handlers must ask the event root instead.
 */
export function activeElementIn(root: EventTarget): Element | null {
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
    return root.activeElement;
  }
  if (typeof Document !== "undefined" && root instanceof Document) {
    return root.activeElement;
  }
  return typeof document === "undefined" ? null : document.activeElement;
}

/**
 * State shared between the two content scripts.
 *
 * `keyGuard.ts` runs at document_start so its window capture listeners are
 * registered before any page script. `content.tsx` (the React palette) runs at
 * document_idle. Content scripts of one extension share a single isolated
 * world per frame, so both bundles see the same `globalThis` object; the page
 * itself never sees it.
 */
export type PaletteGuardState = {
  /** Shadow host of the open palette; undefined while the palette is closed. */
  host?: HTMLElement;
  shadowRoot?: ShadowRoot;
  mountPoint?: HTMLElement;
  /** Last element that held focus inside the palette. */
  lastFocus?: HTMLElement;
};

const STATE_KEY = "__jumpPaletteGuardState";

export function paletteGuardState(): PaletteGuardState {
  const scope = globalThis as typeof globalThis & { [STATE_KEY]?: PaletteGuardState };
  scope[STATE_KEY] ??= {};
  return scope[STATE_KEY];
}

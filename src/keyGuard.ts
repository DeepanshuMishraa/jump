/**
 * Early keyboard guard for the in-page palette (runs at document_start).
 *
 * Kept separate from the React palette bundle so only this small script runs
 * before the page; the palette itself still loads at document_idle. While the
 * palette is open, its keystrokes are stopped at the window (before any page
 * listener) and re-dispatched inside the shadow tree with `composed: false`,
 * so sites with global shortcuts or "type anywhere" focus handlers (ChatGPT,
 * T3 Code) never see or steal them.
 */
import { paletteGuardState } from "./paletteGuardState";

const state = paletteGuardState();

const CLIPBOARD_EVENT_TYPES = new Set(["paste", "copy", "cut"]);
const KEY_EVENT_TYPES = new Set(["keydown", "keyup", "keypress"]);

const FORWARDED_EVENT_TYPES = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "focusin",
  "focusout",
  "paste",
  "copy",
  "cut",
] as const;

function modifierStateInit(event: KeyboardEvent) {
  return {
    modifierAltGraph: event.getModifierState("AltGraph"),
    modifierCapsLock: event.getModifierState("CapsLock"),
    modifierFn: event.getModifierState("Fn"),
    modifierFnLock: event.getModifierState("FnLock"),
    modifierHyper: event.getModifierState("Hyper"),
    modifierNumLock: event.getModifierState("NumLock"),
    modifierScrollLock: event.getModifierState("ScrollLock"),
    modifierSuper: event.getModifierState("Super"),
    modifierSymbol: event.getModifierState("Symbol"),
    modifierSymbolLock: event.getModifierState("SymbolLock"),
  };
}

// A clone keeps the palette's own handlers working after the original event has
// been stopped at the window. `composed: false` keeps the clone inside the
// shadow tree, so the page never observes it.
function cloneForwardedEvent(event: Event): Event | undefined {
  const init = { bubbles: event.bubbles, cancelable: event.cancelable, composed: false };
  if (event instanceof KeyboardEvent) {
    return new KeyboardEvent(event.type, {
      ...init,
      key: event.key,
      code: event.code,
      location: event.location,
      repeat: event.repeat,
      isComposing: event.isComposing,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ...modifierStateInit(event),
    });
  }
  if (event instanceof InputEvent) {
    return new InputEvent(event.type, {
      ...init,
      inputType: event.inputType,
      data: event.data,
      isComposing: event.isComposing,
    });
  }
  if (event instanceof CompositionEvent) {
    return new CompositionEvent(event.type, { ...init, data: event.data });
  }
  if (event instanceof FocusEvent) {
    return new FocusEvent(event.type, { ...init, relatedTarget: event.relatedTarget });
  }
  return undefined;
}

// Registered at document_start, before any page script, so these window capture
// listeners run before the page's own global shortcuts. Events from inside the
// closed shadow root are retargeted to `host` here; stopping them at the window
// keeps page capture listeners from ever seeing palette keystrokes.
function handlePageEvent(event: Event) {
  const { host, shadowRoot, mountPoint, lastFocus } = state;
  if (!host || !shadowRoot || !mountPoint) return;

  const fromPalette = event.target === host;
  if (!fromPalette && !KEY_EVENT_TYPES.has(event.type)) return;

  event.stopImmediatePropagation();

  if (!fromPalette) {
    // The page holds focus (it stole it, or focus has not moved in yet). Pull
    // focus back to the palette element that last had it and deliver the key
    // there; moving focus during keydown also sends the typed character to it.
    const refocus = lastFocus?.isConnected ? lastFocus : undefined;
    if (refocus) {
      refocus.focus({ preventScroll: true });
      if (shadowRoot.activeElement === refocus) {
        const forwarded = cloneForwardedEvent(event);
        if (forwarded) {
          refocus.dispatchEvent(forwarded);
          if (forwarded.defaultPrevented) event.preventDefault();
        }
        return;
      }
    }
    // Nothing to refocus: keep the page from acting on the key and deliver it
    // to the palette root instead.
    event.preventDefault();
    const forwarded = cloneForwardedEvent(event);
    if (forwarded) mountPoint.dispatchEvent(forwarded);
    return;
  }

  // Clipboard events must keep their native behaviour; only hide them from the page.
  if (CLIPBOARD_EVENT_TYPES.has(event.type)) return;

  const forwarded = cloneForwardedEvent(event);
  if (!forwarded) return;
  const target = shadowRoot.activeElement ?? mountPoint;
  target.dispatchEvent(forwarded);
  // Native typing is never cancelled: only a handler that vetoed the clone
  // should veto the real event.
  if (forwarded.defaultPrevented) event.preventDefault();
}

for (const type of FORWARDED_EVENT_TYPES) {
  window.addEventListener(type, handlePageEvent, { capture: true });
}

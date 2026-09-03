import { useEffect } from "react";

/** Explicit escape hatch for one-time external subscriptions and synchronization. */
export function useMountEffect(effect: () => void | (() => void)) {
  useEffect(effect, []);
}

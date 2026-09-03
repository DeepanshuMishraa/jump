import { useEffect } from "react";

/** Explicit escape hatch for one-time external subscriptions and synchronization. */
export function useMountEffect(effect: () => void | (() => void)) {
  /* eslint-disable no-restricted-syntax */
  useEffect(effect, []);
  /* eslint-enable no-restricted-syntax */
}

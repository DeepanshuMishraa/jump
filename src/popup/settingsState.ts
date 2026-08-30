import type { UserSettings } from "../types";

export function resolveSettingsRead(
  current: UserSettings,
  loaded: UserSettings,
  readRevision: number,
  currentRevision: number,
) {
  return readRevision === currentRevision ? loaded : current;
}

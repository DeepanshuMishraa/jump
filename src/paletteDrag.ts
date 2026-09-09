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

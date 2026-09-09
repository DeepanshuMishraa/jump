export function canStartPaletteDrag({
  altKey,
  button,
}: {
  altKey: boolean;
  button: number;
}) {
  return altKey && button === 0;
}

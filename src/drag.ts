export const DRAG_EDGE_SIZE = 64;
export const DRAG_MAX_SCROLL_SPEED = 14;

export function dragAutoScrollVelocity(
  pointerY: number,
  top: number,
  bottom: number,
  edgeSize = DRAG_EDGE_SIZE,
  maxSpeed = DRAG_MAX_SCROLL_SPEED,
): number {
  if (pointerY < top - 24 || pointerY > bottom + 24) return 0;
  if (pointerY < top + edgeSize) {
    const intensity = Math.min(1, (top + edgeSize - pointerY) / edgeSize);
    return -Math.max(2, Math.round(maxSpeed * intensity));
  }
  if (pointerY > bottom - edgeSize) {
    const intensity = Math.min(1, (pointerY - (bottom - edgeSize)) / edgeSize);
    return Math.max(2, Math.round(maxSpeed * intensity));
  }
  return 0;
}

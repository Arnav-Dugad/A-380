/**
 * Screen area covered by interface panels. The camera's principal point is shifted so the
 * subject sits in the middle of the visible area (beside the desktop panels, above the
 * mobile bottom sheet), and framing distances are fitted to that area rather than to the
 * whole canvas.
 */
export interface Insets {
  left: number;
  right: number;
  bottom: number;
}

const contributions = new Map<string, Insets>();
export const viewInset: Insets = { left: 0, right: 0, bottom: 0 };

export function setInset(key: string, inset: Insets | null): void {
  if (inset) contributions.set(key, inset);
  else contributions.delete(key);
  viewInset.left = viewInset.right = viewInset.bottom = 0;
  for (const c of contributions.values()) {
    viewInset.left = Math.max(viewInset.left, c.left);
    viewInset.right = Math.max(viewInset.right, c.right);
    viewInset.bottom = Math.max(viewInset.bottom, c.bottom);
  }
}

/** The visible area in CSS pixels. */
export function freeArea(): { w: number; h: number; W: number; H: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return {
    w: Math.max(120, W - viewInset.left - viewInset.right),
    h: Math.max(120, H - viewInset.bottom),
    W,
    H,
  };
}

/**
 * How much further the camera must stand back, compared with the desktop layout the presets
 * were composed for (1600 × 900 with a 360 px side panel), to fit the same view in the
 * visible area.
 */
export function fitScale(): number {
  const { w, h, H } = freeArea();
  const kh = 1240 / 900 / (w / H);
  const kv = 1 / (h / H);
  return Math.min(3.2, Math.max(1, kh, kv));
}

/** Tangent of the half-angle of the visible area along its tighter axis, for a vertical FOV. */
export function freeHalfTan(fovDeg: number): number {
  const { w, h, H } = freeArea();
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return t * Math.min(w / H, h / H);
}

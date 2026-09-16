/**
 * WCAG-style luminance check for a hex color.
 * Used to pick dark vs white text on top of user-chosen document fills
 * (e.g. the line-items table header background).
 */
export function isLightColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return true; // unknown value → fall back to a light surface
  let h = match[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const to01 = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const r = to01(0);
  const g = to01(2);
  const b = to01(4);
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5;
}
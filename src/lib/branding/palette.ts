import type { CSSProperties } from "react";

/**
 * Per-operator accent color. Today we assign one of a fixed demo palette
 * round-robin at signup (see `accentForIndex`) so multi-tenant storefronts +
 * dashboards look visually distinct; later operators will pick their own.
 *
 * The chosen base hex is stored on `operators.brand_color`. The rest of the app
 * reads four CSS variables (`--brand`, `--brand-deep`, `--brand-tint`,
 * `--brand-ring`) that Tailwind's `brand.*` tokens point at; `brandVars()`
 * derives all four shades from the single base and returns them as an inline
 * style object to drop on a wrapping element. When no color is set the vars are
 * absent and Tailwind falls back to the default blue.
 */
export interface AccentColor {
  key: string;
  name: string;
  base: string; // dark, saturated primary hex
}

/** The demo palette. Order defines the round-robin cycle — don't reorder. */
export const ACCENT_COLORS: AccentColor[] = [
  { key: "midnight", name: "Midnight Blue", base: "#13294B" },
  { key: "pine", name: "Pine", base: "#123B33" },
  { key: "umber", name: "Burnt Umber", base: "#4A2E12" },
  { key: "oxblood", name: "Oxblood", base: "#5A1E1A" },
];

/** Round-robin pick, safe for any (even negative) integer index. */
export function accentForIndex(i: number): AccentColor {
  const n = ACCENT_COLORS.length;
  return ACCENT_COLORS[((Math.trunc(i) % n) + n) % n]!;
}

// ---- color math ----------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** r,g,b in 0..255 → [h 0..360, s 0..1, l 0..1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** [h 0..360, s 0..1, l 0..1] → hex. */
function hslToHex(h: number, s: number, l: number): string {
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export interface BrandShades {
  DEFAULT: string; // primary fill (white text sits on it)
  deep: string; // pressed states + text color on `tint`
  tint: string; // light background behind `deep` text
  ring: string; // selection ring / soft border
}

/**
 * Derive the four brand shades from a single dark base color, preserving hue.
 * `tint`/`ring` are pushed to high lightness (in HSL, so hue survives) to stay
 * legible behind `deep`-colored text on the cream canvas; `deep` is a darker,
 * slightly more saturated version of the base for pressed states.
 */
export function deriveShades(base: string): BrandShades {
  const [h, s, l] = rgbToHsl(...hexToRgb(base));
  return {
    DEFAULT: base,
    deep: hslToHex(h, Math.min(s + 0.05, 1), Math.max(l * 0.72, 0.06)),
    tint: hslToHex(h, Math.min(s, 0.42), 0.94),
    ring: hslToHex(h, Math.min(s, 0.5), 0.86),
  };
}

/**
 * Inline style object setting the four brand CSS variables for a subtree.
 * Returns `{}` (no override → default blue) when the operator has no color.
 */
export function brandVars(base: string | null | undefined): CSSProperties {
  if (!base) return {};
  const s = deriveShades(base);
  const [r, g, b] = hexToRgb(base);
  return {
    "--brand": s.DEFAULT,
    "--brand-deep": s.deep,
    "--brand-tint": s.tint,
    "--brand-ring": s.ring,
    // Soft accent glow for drop shadows (see the two shadow-[…] call sites).
    "--brand-glow": `rgba(${r}, ${g}, ${b}, 0.5)`,
  } as CSSProperties;
}

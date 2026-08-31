/**
 * The one palette. Every colour in the app is authored here as a CSS hex
 * string and derived from there.
 *
 * Colour reaches the screen through two incompatible APIs: Pixi wants packed
 * 24-bit numbers, CSS wants strings. Before this module each side kept its own
 * copy — `TimelineController` held `0x6666cc`, `Inspector.svelte` held
 * `"#6666cc"` under a comment admitting the mirror — so a palette tweak had to
 * be made twice and correctly, or the canvas and the inspector badge silently
 * disagreed. Authoring in CSS (the form you can paste into a stylesheet or a
 * colour picker) and deriving the numeric form at the Pixi boundary makes that
 * class of drift unrepresentable.
 */

/** `"#6666cc"` -> `0x6666cc`. The only place the two forms are bridged. */
export function toPixi(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

// ─── Event categories ────────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  "Primeval History": "#6666cc",
  Abraham: "#c8882a",
  Jacob: "#3d8c3d",
  Joseph: "#cc5533",
};

export const DEFAULT_CATEGORY_COLOR = "#7777aa";

// ─── Canvas theme ────────────────────────────────────────────────────────────

/** Canvas colours, in the packed form Pixi's renderer takes. */
export interface TimelineColors {
  background: number;
  spine: number;
}

const THEME_PALETTE = {
  light: { background: "#f5f5f5", spine: "#7777bb" },
  dark: { background: "#13131f", spine: "#5555aa" },
} satisfies Record<string, Record<keyof TimelineColors, string>>;

export type Theme = keyof typeof THEME_PALETTE;

export const THEME_COLORS = {
  light: {
    background: toPixi(THEME_PALETTE.light.background),
    spine: toPixi(THEME_PALETTE.light.spine),
  },
  dark: {
    background: toPixi(THEME_PALETTE.dark.background),
    spine: toPixi(THEME_PALETTE.dark.spine),
  },
} satisfies Record<Theme, TimelineColors>;

import { describe, expect, it } from "vitest";

import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  THEME_COLORS,
  THEME_PALETTE,
  UNCATEGORIZED,
  fillFor,
  toPixi,
} from "./theme.js";

describe("toPixi", () => {
  it("unpacks a CSS hex string into the number Pixi wants", () => {
    expect(toPixi("#6666cc")).toBe(0x6666cc);
    expect(toPixi("#000000")).toBe(0x000000);
  });
});

/**
 * The claim the module exists to make: every colour is authored once as CSS
 * and the packed form is derived from it, so the two cannot drift.
 *
 * Asserted as a round-trip — pack, unpack, compare to the string it came from
 * — rather than against literal hex values. A palette tweak is a decision, not
 * a regression, and a test that pins the numbers would fail on every one.
 */
describe("the CSS form and the packed form agree", () => {
  it.each(Object.entries(CATEGORY_COLORS))(
    "round-trips the %s category colour",
    (_name, hex) => {
      expect(`#${toPixi(hex).toString(16).padStart(6, "0")}`).toBe(hex);
    },
  );

  it.each(Object.entries(THEME_PALETTE))(
    "derives every %s canvas colour from its authored string",
    (theme, authored) => {
      // The packed table is written out entry by entry, which is exactly where
      // a hand-typed number or a colour pasted into the wrong theme would go
      // unnoticed — both sides look plausible in isolation.
      expect(THEME_COLORS[theme as keyof typeof THEME_COLORS]).toEqual({
        background: toPixi(authored.background),
        spine: toPixi(authored.spine),
      });
    },
  );
});

/**
 * The fall-through is load-bearing, not incidental.
 *
 * Bins and events are coloured by looking their category up here, and the
 * timeline stamps an event with no category as `UNCATEGORIZED`. That key is
 * deliberately absent from the palette, which is the only reason the engine
 * could unify on it without moving a pixel — so the assertion that matters is
 * the colour that comes back, not the shape of the lookup.
 */
describe("fillFor", () => {
  it("packs a category's own palette colour", () => {
    expect(fillFor("Abraham")).toBe(toPixi(CATEGORY_COLORS.Abraham));
  });

  it("falls through to the default for the uncategorised key", () => {
    expect(fillFor(UNCATEGORIZED)).toBe(toPixi(DEFAULT_CATEGORY_COLOR));
  });

  it("falls through for an absent category", () => {
    expect(fillFor(undefined)).toBe(toPixi(DEFAULT_CATEGORY_COLOR));
  });

  it("falls through for a category the palette has never heard of", () => {
    expect(fillFor("Ruritania")).toBe(toPixi(DEFAULT_CATEGORY_COLOR));
  });
});

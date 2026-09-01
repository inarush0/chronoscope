import { describe, expect, it } from "vitest";

import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
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

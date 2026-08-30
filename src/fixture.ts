/**
 * Hardcoded fixture for the vanilla-TS scaffold.
 *
 * Deliberately *not* the real dataset: this exists so `main.ts` can prove Pixi
 * bundles and `TimelineController` renders without any server, before
 * `dataset/build.ts` starts emitting JSON. It is sized and spread to exercise
 * both LOD tiers — ~40 events across ~4000 years puts the default view under
 * the 40px/event threshold (LOD A, density bins), and zooming into any cluster
 * crosses back into LOD B (individual dots and bars).
 *
 * Delete this once the real dataset JSON is wired in.
 */

import type { TimelineEvent } from "./lib/timeline/types.js";

/**
 * "4004 BC" / "1446-04-15 BC" / "57 AD" -> epoch ms, proleptic Gregorian UTC.
 * A trimmed copy of `dataset/lib/dates.ts`; 1 BC is astronomical year 0.
 */
function at(year: number, era: "BC" | "AD", month = 1, day = 1): number {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(era === "BC" ? 1 - year : year);
  return date.getTime();
}

type Row = [
  id: string,
  title: string,
  start: number,
  end: number | null,
  category: string | undefined,
];

const PRIMEVAL = "Primeval History";
const ABRAHAM = "Abraham";
const JACOB = "Jacob";
const JOSEPH = "Joseph";

const ROWS: Row[] = [
  // Primeval history — a dense cluster at the far left, then a long gap.
  ["fx-creation", "The Six Days of Creation", at(4004, "BC"), null, PRIMEVAL],
  ["fx-eden", "The Garden of Eden", at(4004, "BC"), null, PRIMEVAL],
  ["fx-fall", "The Fall", at(4004, "BC"), null, PRIMEVAL],
  ["fx-cain-abel", "Cain and Abel", at(3875, "BC"), null, PRIMEVAL],
  ["fx-seth", "Birth of Seth", at(3874, "BC"), null, PRIMEVAL],
  [
    "fx-enoch",
    "Enoch Walks with God",
    at(3382, "BC"),
    at(3017, "BC"),
    PRIMEVAL,
  ],
  [
    "fx-methuselah",
    "Life of Methuselah",
    at(3317, "BC"),
    at(2348, "BC"),
    PRIMEVAL,
  ],
  ["fx-ark", "Building of the Ark", at(2468, "BC"), at(2349, "BC"), PRIMEVAL],
  ["fx-flood", "The Flood", at(2348, "BC"), at(2347, "BC"), PRIMEVAL],
  ["fx-covenant-noah", "The Rainbow Covenant", at(2347, "BC"), null, PRIMEVAL],
  ["fx-babel", "The Tower of Babel", at(2247, "BC"), null, PRIMEVAL],
  ["fx-peleg", "The Earth Divided", at(2247, "BC"), null, PRIMEVAL],

  // Abraham — mid-timeline cluster.
  ["fx-abram-born", "Birth of Abram", at(1996, "BC"), null, ABRAHAM],
  ["fx-call", "The Call of Abram", at(1921, "BC"), null, ABRAHAM],
  [
    "fx-egypt-famine",
    "Abram in Egypt",
    at(1920, "BC"),
    at(1919, "BC"),
    ABRAHAM,
  ],
  ["fx-lot-parts", "Abram and Lot Part", at(1918, "BC"), null, ABRAHAM],
  ["fx-kings", "The Battle of the Kings", at(1913, "BC"), null, ABRAHAM],
  [
    "fx-covenant-pieces",
    "The Covenant Between the Pieces",
    at(1913, "BC"),
    null,
    ABRAHAM,
  ],
  ["fx-ishmael", "Birth of Ishmael", at(1910, "BC"), null, ABRAHAM],
  [
    "fx-circumcision",
    "The Covenant of Circumcision",
    at(1897, "BC"),
    null,
    ABRAHAM,
  ],
  ["fx-sodom", "Sodom and Gomorrah", at(1897, "BC"), null, ABRAHAM],
  ["fx-isaac-born", "Birth of Isaac", at(1896, "BC"), null, ABRAHAM],
  ["fx-hagar", "Hagar and Ishmael Sent Away", at(1891, "BC"), null, ABRAHAM],
  ["fx-moriah", "The Binding of Isaac", at(1871, "BC"), null, ABRAHAM],
  ["fx-sarah-dies", "Death of Sarah", at(1859, "BC"), null, ABRAHAM],
  ["fx-rebekah", "Isaac Marries Rebekah", at(1856, "BC"), null, ABRAHAM],
  ["fx-abraham-dies", "Death of Abraham", at(1821, "BC"), null, ABRAHAM],

  // Jacob.
  ["fx-jacob-born", "Birth of Jacob and Esau", at(1836, "BC"), null, JACOB],
  ["fx-birthright", "Esau Sells His Birthright", at(1804, "BC"), null, JACOB],
  ["fx-blessing", "Jacob Steals the Blessing", at(1760, "BC"), null, JACOB],
  ["fx-ladder", "Jacob's Ladder at Bethel", at(1760, "BC"), null, JACOB],
  ["fx-laban", "Jacob Serves Laban", at(1760, "BC"), at(1739, "BC"), JACOB],
  ["fx-peniel", "Wrestling at Peniel", at(1739, "BC"), null, JACOB],

  // Joseph.
  ["fx-joseph-born", "Birth of Joseph", at(1745, "BC"), null, JOSEPH],
  ["fx-coat", "The Coat of Many Colours", at(1729, "BC"), null, JOSEPH],
  ["fx-sold", "Joseph Sold into Egypt", at(1728, "BC"), null, JOSEPH],
  ["fx-prison", "Joseph in Prison", at(1720, "BC"), at(1715, "BC"), JOSEPH],
  ["fx-vizier", "Joseph Made Vizier", at(1715, "BC"), at(1635, "BC"), JOSEPH],
  [
    "fx-seven-plenty",
    "The Seven Years of Plenty",
    at(1715, "BC"),
    at(1708, "BC"),
    JOSEPH,
  ],
  [
    "fx-seven-famine",
    "The Seven Years of Famine",
    at(1708, "BC"),
    at(1701, "BC"),
    JOSEPH,
  ],
  ["fx-jacob-egypt", "Jacob Goes Down to Egypt", at(1706, "BC"), null, JOSEPH],

  // Uncategorised tail — exercises DEFAULT_EVENT_COLOR and a long empty gap
  // between the patriarchs and the Exodus (the gap indicator should appear).
  [
    "fx-sojourn",
    "The Sojourn in Egypt",
    at(1706, "BC"),
    at(1491, "BC"),
    undefined,
  ],
  ["fx-exodus", "The Exodus", at(1491, "BC"), null, undefined],
  ["fx-sinai", "The Law Given at Sinai", at(1491, "BC", 6), null, undefined],
  [
    "fx-wilderness",
    "Wandering in the Wilderness",
    at(1491, "BC"),
    at(1451, "BC"),
    undefined,
  ],
];

export const FIXTURE_EVENTS: TimelineEvent[] = ROWS.map(
  ([id, title, start, end, category]) => ({
    id,
    title,
    start,
    ...(end !== null ? { end } : {}),
    ...(category !== undefined ? { category } : {}),
    book: "Genesis",
  }),
);

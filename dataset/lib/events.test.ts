import { describe, expect, it } from "vitest";

import { resolveBook, type AuthoredEvent, type BookFile } from "./events.ts";

/**
 * `resolveBook` is the only gate between an authored event file and the shipped
 * artifact: `build.ts` refuses to write when it reports a problem, and
 * `validate.ts` exits non-zero. So the interesting property is not that a
 * malformed event produces *an error* — it is that a rejected event produces an
 * error *and no resolved row*. A resolver that reported the problem but still
 * pushed the event would leave a `NaN` start in `static/chronoscope.json`, and
 * the sort in `buildArtifact` would scatter it somewhere unpredictable.
 *
 * Not every problem is fatal to its event: a duplicate id still resolves (the
 * build refuses on the error, so there is nothing to protect downstream from).
 * The tests below say which is which.
 */
const bookOf = (...events: AuthoredEvent[]): BookFile => ({
  book: "Genesis",
  order: 1,
  testament: "Old Testament",
  events,
});

const good: AuthoredEvent = {
  id: "gen-creation",
  title: "The creation",
  start: "4004-10-23 BC",
};

describe("resolveBook", () => {
  it("resolves a well-formed event without complaint", () => {
    const { resolved, errors } = resolveBook(bookOf(good), "genesis.json");

    expect(errors).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].precision).toBe("day");
  });

  it("drops an event whose start date will not parse", () => {
    const { resolved, errors } = resolveBook(
      bookOf({ ...good, start: "October 23rd, 4004 BC" }),
      "genesis.json",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("genesis.json [0] gen-creation");
    // The no-row half of the invariant: nothing reaches the artifact.
    expect(resolved).toEqual([]);
  });

  it("keeps the sound events in a file that also has a broken one", () => {
    const { resolved, errors } = resolveBook(
      bookOf({ ...good, start: "4004 BCE" }, { ...good, id: "gen-flood" }),
      "genesis.json",
    );

    expect(errors).toHaveLength(1);
    // Indexed by position in the authored file, not in the resolved output.
    expect(errors[0]).toContain("[0]");
    expect(resolved.map((event) => event.id)).toEqual(["gen-flood"]);
  });

  it("drops an event whose end date will not parse", () => {
    const { resolved, errors } = resolveBook(
      bookOf({ ...good, end: "4004-13-01 BC" }),
      "genesis.json",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("month out of range");
    expect(resolved).toEqual([]);
  });

  it("reports an end that precedes its start, but still resolves the event", () => {
    const { resolved, errors } = resolveBook(
      bookOf({ ...good, start: "3000 BC", end: "3100 BC" }),
      "genesis.json",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("precedes start");
    // Both dates parsed, so there is a row; the build refuses on the error.
    expect(resolved).toHaveLength(1);
  });

  it("reports an id used twice in the same file", () => {
    const { errors } = resolveBook(
      bookOf(good, { ...good, title: "The creation, again" }),
      "genesis.json",
    );

    expect(errors).toEqual([
      expect.stringContaining("duplicate id within file"),
    ]);
  });

  it("drops an event with no id, since nothing can be said about it", () => {
    const { resolved, errors } = resolveBook(
      bookOf({ ...good, id: "" }),
      "genesis.json",
    );

    expect(errors).toEqual([expect.stringContaining('missing "id"')]);
    expect(resolved).toEqual([]);
  });

  it("reports an unknown datingBasis", () => {
    const { errors } = resolveBook(
      // The types describe the authored files, but the files are unvalidated
      // JSON — so smuggling a value past them is exactly what the guard is for.
      bookOf({ ...good, datingBasis: "vibes" as "narrative" }),
      "genesis.json",
    );

    expect(errors).toEqual([expect.stringContaining("unknown datingBasis")]);
  });
});

/**
 * The NRSV is under copyright, so authored prose must never reproduce it — see
 * docs/extraction.md. The guard is a regex, and a regex that is slightly too
 * greedy silently swallows ordinary punctuation while one slightly too narrow
 * lets the translation through. Both directions are asserted.
 */
describe("resolveBook's translation-quoting guard", () => {
  const withDescription = (description: string) =>
    resolveBook(bookOf({ ...good, description }), "genesis.json").errors.filter(
      (error) => error.includes("quotes the translation"),
    );

  it("catches a quoted span in a description", () => {
    expect(
      withDescription('God says "Let there be light" and there is.'),
    ).toHaveLength(1);
  });

  it("catches a quoted span that opens the description", () => {
    expect(
      withDescription('"Let there be light" opens the account.'),
    ).toHaveLength(1);
  });

  it("leaves possessive apostrophes alone, even a pair of them", () => {
    // The plural possessive closes at a word boundary, so only the *opening*
    // boundary rule keeps this from reading as a quoted span.
    expect(
      withDescription("Abraham's answer to the prophets' warning."),
    ).toEqual([]);
  });

  it("leaves an unquoted paraphrase alone", () => {
    expect(withDescription("God calls light into being.")).toEqual([]);
  });

  it("checks the title as well as the description", () => {
    const { errors } = resolveBook(
      bookOf({ ...good, title: 'God says "Let there be light"' }),
      "genesis.json",
    );

    expect(errors).toEqual([
      expect.stringContaining("title quotes the translation"),
    ]);
  });
});

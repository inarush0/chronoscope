import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { UsageError, anchoredPath, flagValue } from "./args.ts";

/**
 * The rule this module exists to hold in one place: an explicit flag resolves
 * from the cwd (where the caller typed it) and a default resolves from the
 * script's own directory (so the script works from any cwd). All three dataset
 * entrypoints wrote some version of that by hand and only build.ts wrote it in
 * full — see #56.
 *
 * `scriptDir` is a parameter rather than `import.meta.dirname` precisely so the
 * two halves of the rule are distinguishable here: the fixture directory below
 * is nowhere near the cwd the test runs in, so a path anchored to the wrong one
 * cannot accidentally match.
 */
const SCRIPT_DIR = "/opt/chronoscope/dataset";

describe("flagValue", () => {
  it("returns the value that follows the flag", () => {
    expect(flagValue(["--slug", "torah"], "--slug", "bible")).toBe("torah");
  });

  it("returns the fallback when the flag is absent", () => {
    expect(flagValue(["--out", "x.json"], "--slug", "bible")).toBe("bible");
  });

  // `args[index + 1]` on the old build.ts returned undefined here, which
  // `resolve()` then rejected with a TypeError about paths and strings — a
  // message about the wrong thing entirely. Refusing up front, named after the
  // flag the caller actually typed, is the deliberate replacement.
  it("refuses a flag given last with no value after it", () => {
    const call = () => flagValue(["--events"], "--events", "events");
    expect(call).toThrow(UsageError);
    expect(call).toThrow("--events");
  });

  // An empty value must not read as "absent". The old `anchored` in build.ts
  // used "" as its own sentinel for absence, so `--events ""` fell through to
  // the default and quietly worked on a tree the caller never named.
  it("refuses an empty value rather than falling back", () => {
    expect(() => flagValue(["--slug", ""], "--slug", "bible")).toThrow(
      UsageError,
    );
  });
});

describe("anchoredPath", () => {
  it("resolves an explicit relative value against the cwd", () => {
    expect(
      anchoredPath(["--events", "tmp/events"], "--events", {
        scriptDir: SCRIPT_DIR,
        fallback: "events",
      }),
    ).toBe(resolve(process.cwd(), "tmp/events"));
  });

  it("resolves the fallback against the script directory, not the cwd", () => {
    expect(
      anchoredPath([], "--events", {
        scriptDir: SCRIPT_DIR,
        fallback: "events",
      }),
    ).toBe("/opt/chronoscope/dataset/events");
  });

  it("resolves a fallback that climbs out of the script directory", () => {
    expect(
      anchoredPath([], "--out", {
        scriptDir: SCRIPT_DIR,
        fallback: "../static/chronoscope.json",
      }),
    ).toBe("/opt/chronoscope/static/chronoscope.json");
  });

  it("takes an explicit absolute value as given", () => {
    expect(
      anchoredPath(["--events", "/srv/events"], "--events", {
        scriptDir: SCRIPT_DIR,
        fallback: "events",
      }),
    ).toBe("/srv/events");
  });

  it("refuses a flag given last with no value after it", () => {
    expect(() =>
      anchoredPath(["--events"], "--events", {
        scriptDir: SCRIPT_DIR,
        fallback: "events",
      }),
    ).toThrow(UsageError);
  });

  it("refuses an empty value rather than anchoring to the script dir", () => {
    expect(() =>
      anchoredPath(["--events", ""], "--events", {
        scriptDir: SCRIPT_DIR,
        fallback: "events",
      }),
    ).toThrow(UsageError);
  });
});

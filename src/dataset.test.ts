import { afterEach, describe, expect, it, vi } from "vitest";

import { type Dataset, initialView, loadDataset } from "./dataset.js";
import type { TimelineEvent } from "./timeline/types.js";

/** `start` doubles as the id, so a failure names the event that moved. */
function ev(start: number, rest: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id: `e${start}`, title: `event at ${start}`, start, ...rest };
}

/**
 * The one impure function in the module reaches the network through `fetch`,
 * which node has natively — so the seam is already there and a stub on
 * `globalThis` is the whole harness. Only the fields `loadDataset` reads are
 * stubbed; a full `Response` would be scaffolding nothing asserts.
 *
 * Returns the `json` mock, because whether the body was ever read is the
 * observable difference between refusing a failed response and parsing it.
 */
function stubFetch(res: Omit<Partial<Response>, "json">, body: unknown) {
  const json = vi.fn().mockResolvedValue(body);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ...res, json }));
  return json;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDataset", () => {
  const PAYLOAD: Dataset = {
    datasetSlug: "chronoscope",
    books: [{ name: "Genesis", eventCount: 2 }],
    events: [ev(0), ev(100)],
  };

  it("returns the parsed payload", async () => {
    stubFetch({ ok: true }, PAYLOAD);

    await expect(loadDataset()).resolves.toEqual(PAYLOAD);
  });

  it("throws with the status on a failed response, and never reads the body", async () => {
    // The consequence, not just the complaint: an error page is still valid
    // JSON, so dropping the `ok` check would hand the caller `{ oops: true }`
    // as if it were the dataset. Asserting the body was never parsed is what
    // distinguishes refusing the response from parsing it and throwing later.
    const json = stubFetch(
      { ok: false, status: 404, statusText: "Not Found" },
      { oops: true },
    );

    await expect(loadDataset()).rejects.toThrow(/404 Not Found/);
    expect(json).not.toHaveBeenCalled();
  });
});

describe("initialView", () => {
  it("pads the extent by 5% on each side", () => {
    // 0–1000 is a span of 1000, so the padding is a round 50 either way.
    expect(initialView([ev(0), ev(1000)])).toEqual({ start: -50, end: 1050 });
  });

  it("takes both ends of an interval into the extent", () => {
    // One interval and nothing else, so both edges must come from it: a
    // version that read only `start` would collapse the view onto 200, and
    // one that read only `end` onto 1000. Span 800, so the padding is 40.
    expect(initialView([ev(200, { end: 1000 })])).toEqual({
      start: 160,
      end: 1040,
    });
  });

  it("degenerates to the instant itself for a single-event dataset", () => {
    // max - min is 0, so 5% of it is 0: the view collapses onto the event.
    // Zero-width, but finite — the caller gets a range, not NaN.
    expect(initialView([ev(500)])).toEqual({ start: 500, end: 500 });
  });
});

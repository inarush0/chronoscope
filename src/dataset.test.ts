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
 * `globalThis` is the whole harness. Only the two fields `loadDataset` reads
 * are stubbed; a full `Response` would be scaffolding nothing asserts.
 */
function stubFetch(res: Partial<Response>): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res as Response));
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
    stubFetch({ ok: true, json: async () => PAYLOAD });

    await expect(loadDataset()).resolves.toEqual(PAYLOAD);
  });

  it("throws with the status on a failed response, and yields no dataset", async () => {
    // Assert the consequence: a 404 body still parses as JSON, so a caller
    // that only checked for a thrown error could be handed the error page as
    // if it were the dataset.
    stubFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ oops: true }),
    });

    let resolved: Dataset | undefined;
    await expect(
      loadDataset().then((d) => {
        resolved = d;
      }),
    ).rejects.toThrow(/404 Not Found/);
    expect(resolved).toBeUndefined();
  });
});

describe("initialView", () => {
  it("pads the extent by 5% on each side", () => {
    // 0–1000 is a span of 1000, so the padding is a round 50 either way.
    expect(initialView([ev(0), ev(1000)])).toEqual({ start: -50, end: 1050 });
  });

  it("counts an interval's end, not only its start", () => {
    // The lone event ends long after it begins; the extent has to follow it
    // there, or the view opens with the interval running off the right edge.
    expect(initialView([ev(0), ev(200, { end: 1000 })])).toEqual({
      start: -50,
      end: 1050,
    });
  });

  it("degenerates to the instant itself for a single-event dataset", () => {
    // max - min is 0, so 5% of it is 0: the view collapses onto the event.
    // Zero-width, but finite — the caller gets a range, not NaN.
    expect(initialView([ev(500)])).toEqual({ start: 500, end: 500 });
  });
});

/**
 * Spreads coincident low-precision dates across the period they assert.
 *
 * Most authored dates carry a year and nothing more ("30 AD"), so every event
 * in that year resolves to the same millisecond — 89 of them land on 30-01-01.
 * Events at an identical timestamp cannot be told apart by the timeline no
 * matter how far it zooms: they stay one density bar forever, and nothing in
 * that bar can be hovered, selected, or inspected.
 *
 * So each group of events sharing a resolved timestamp is distributed evenly
 * across the calendar period its precision covers — a "30 AD" event may land
 * anywhere within 30 AD, a "30-04 AD" event anywhere within April. The offsets
 * are for layout only. They stay inside the interval the authored date already
 * asserts, so no displayed year or month changes, and day-precision dates
 * assert an exact day and never move.
 *
 * Order within a group is canonical book order, then the order the events are
 * written in the file, which is narrative order.
 */

import { precisionSpan, type Precision } from "./dates.ts";

interface Spreadable {
  start: number;
  end: number | null;
  precision: Precision;
  endPrecision: Precision | null;
}

/**
 * Offsets coincident events in place. Expects the full dataset in canonical
 * order, since events sharing a year routinely come from different books.
 * Returns how many events moved.
 */
export function spreadCoincidentDates(events: Spreadable[]): number {
  const groups = new Map<number, Spreadable[]>();

  for (const event of events) {
    if (event.precision === "day") continue;
    const group = groups.get(event.start);
    if (group) group.push(event);
    else groups.set(event.start, [event]);
  }

  let moved = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    group.forEach((event, index) => {
      // Interior fractions only: an event never lands on the boundary it
      // shares with the neighbouring year, where it would collide again.
      const fraction = (index + 1) / (group.length + 1);
      const start =
        event.start +
        Math.round(fraction * precisionSpan(event.start, event.precision));

      let end = event.end;
      if (
        end !== null &&
        event.endPrecision !== null &&
        event.endPrecision !== "day"
      ) {
        // Offsetting both ends by the same fraction preserves the duration.
        end += Math.round(fraction * precisionSpan(end, event.endPrecision));
      }

      // A precise end anchors the event: never let an offset start run past it.
      event.start = end !== null ? Math.min(start, end) : start;
      event.end = end;
      moved++;
    });
  }

  return moved;
}

/**
 * The right-hand detail panel. Replaces `Inspector.svelte`.
 *
 * Built once and shown/hidden by attaching and detaching its `<aside>`, which
 * is what makes the timeline canvas shrink and re-render (parity item 8.1).
 */

import type { TimelineEvent } from "../timeline/types.js";
import { formatYear } from "../format.js";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from "../theme.js";

const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="2" y1="2" x2="12" y2="12" />
  <line x1="12" y1="2" x2="2" y2="12" />
</svg>`;

export interface Inspector {
  /** Pass `null` to hide the panel. */
  show(event: TimelineEvent | null): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function createInspector(
  parent: HTMLElement,
  onClose: () => void,
): Inspector {
  const panel = el("aside", "inspector-panel");
  const inspector = el("div", "inspector");
  panel.append(inspector);

  const header = el("div", "inspector-header");
  const badge = el("span", "category-badge");
  const closeBtn = el("button", "close-btn");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close inspector");
  closeBtn.innerHTML = CLOSE_ICON;
  closeBtn.addEventListener("click", onClose);
  header.append(badge, closeBtn);

  const title = el("h2", "event-title");
  const date = el("div", "event-date");

  const reference = el("div", "event-reference");
  const referenceIcon = el("span", "reference-icon");
  referenceIcon.textContent = "📖";
  const referenceText = el("span", "reference-text");
  reference.append(referenceIcon, referenceText);

  const description = el("p", "event-description");

  inspector.append(header, title, date, reference, description);

  function show(event: TimelineEvent | null): void {
    if (!event) {
      panel.remove();
      return;
    }

    const color =
      CATEGORY_COLORS[event.category ?? ""] ?? DEFAULT_CATEGORY_COLOR;
    badge.textContent = event.category ?? "Event";
    badge.style.background = `${color}22`;
    badge.style.color = color;
    badge.style.borderColor = `${color}55`;

    title.textContent = event.title;
    date.textContent =
      event.end != null
        ? `${formatYear(event.start)} – ${formatYear(event.end)}`
        : formatYear(event.start);

    const ref = event.meta?.["reference"];
    reference.style.display = ref == null ? "none" : "";
    // Reset to plain text: BGLinks replaced the previous reference with an
    // <a>, and the re-scan below needs a raw reference to find.
    referenceText.textContent = ref == null ? "" : String(ref);

    const desc = event.meta?.["description"];
    description.style.display = desc == null ? "none" : "";
    description.textContent = desc == null ? "" : String(desc);

    if (panel.parentNode !== parent) parent.append(panel);

    // BGLinks scans the whole document, so this must re-run on every selection
    // change, not only at page load (parity item 9.3).
    window.BGLinks?.linkVerses();
  }

  return { show };
}

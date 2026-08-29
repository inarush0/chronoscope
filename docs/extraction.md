# Extracting events from the book texts

Events are written by Claude reading the book text directly in a Claude Code
session — there is no API-calling extraction script. The output of a session is
one JSON file per book in `data/events/`, which is the source of truth.

## Workflow

1. Pick the next book with no file in `data/events/` (see `data/books.json`).
2. Read `../bible/books/<NN>-<Book>.txt`. Each chapter is preceded by a
   `[Book N]` header and a one-line summary, which gives a usable skeleton.
3. Write `data/events/<NN>-<Book>.json` in the format below.
4. `bun run validate` — checks dates, duplicate ids, ordering.
5. `bun run build-db` — regenerates `data/chronoscope.sqlite`. With the compose
   stack running, refresh the browser to see the new events; `DATASET_RELOAD`
   makes the app re-open the file on change.

## File format

```json
{
  "book": "Joshua",
  "order": 6,
  "testament": "Old Testament",
  "events": [
    {
      "id": "jos-jordan-crossing",
      "title": "Israel Crosses the Jordan",
      "start": "1406-01-10 BC",
      "end": "1406-01-11 BC",
      "category": "Entering the Land",
      "reference": "Joshua 3:1-4:24",
      "description": "The priests carrying the ark step into the flooded Jordan...",
      "datingBasis": "narrative"
    }
  ]
}
```

Dates are human-readable (`"<year>[-<month>[-<day>]] BC|AD"`) and converted to
epoch milliseconds at build time by `scripts/lib/dates.ts`. Write only the
precision you actually have: `"1406 BC"` is honest, `"1406-01-10 BC"` claims a
day the text may not support. `end` is optional and only for events that span
time.

## Conventions

- **id** — `<3-4 letter book prefix>-<slug>`, unique across the whole dataset.
- **category** — thematic grouping within the book, used for colouring and
  grouping in the UI. Aim for 4-10 categories per book covering all its events.
- **granularity** — one event per narrative pericope; roughly 40-70 events for a
  major narrative book, fewer for short or legal ones.
- **description** — 1-3 sentences summarising what the passage narrates, not
  interpreting it. **Never quote the translation.** See below.
- **reference** — canonical range (`"Joshua 3:1-4:24"`); the inspector turns
  this into a BibleGateway link, so the format must stay parseable.

### Do not quote scripture

The NRSV/NRSVUE is under copyright. The app displays passage text only through
BibleGateway's pop-over, served under their license — so the dataset itself must
contain **no verbatim translation text**, however short or famous the line.

Write reported speech instead of quotation:

| instead of | write |
| --- | --- |
| Joshua says, "as for me and my household, we will serve the LORD." | Joshua pledges that he and his household will serve the LORD. |
| Moses names the altar "The LORD is my banner." | Moses builds an altar and names it for the LORD as his banner. |
| the people ask, "What is it?" | their puzzled question at the sight gives manna its name |

This applies to name glosses and etymologies too: describe what the name means
rather than reproducing the translation's wording. Quotation marks in a
description are the signal to look twice — the audit is simply to grep the event
files for quoted spans.

### datingBasis

Records how the date was arrived at, so pseudo-precision is visible:

| value | use for |
| --- | --- |
| `narrative` | the text itself sequences the event (regnal years, "in the second month") |
| `traditional` | traditional/Ussher chronology anchors the date |
| `composition` | non-narrative book dated by when it was written or compiled |
| `scholarly-estimate` | conventional scholarly dating with no internal anchor |

### Non-narrative books

Wisdom literature, prophets, and epistles get a small number of
**composition/context** events rather than a forced narrative sequence — e.g.
"Paul writes Romans from Corinth" dated `"57 AD"` with
`datingBasis: "composition"`. Where a prophetic book does narrate datable
episodes (Jeremiah's imprisonment, Daniel's visions), extract those as
`narrative` events as well.

## Chronology

Dates follow the traditional (Ussher-style) scheme already used by Genesis and
Exodus, so books join up without contradiction:

| anchor | date |
| --- | --- |
| Creation | 4004 BC |
| Flood | 2348 BC |
| Tower of Babel | 2242 BC |
| Abraham born | 1996 BC |
| Abraham enters Canaan | 1921 BC |
| Isaac born | 1896 BC |
| Jacob and Esau born | 1836 BC |
| Joseph sold into Egypt | 1728 BC |
| Jacob's family enters Egypt | 1706 BC |
| Joseph dies | 1635 BC |
| Moses born | 1526 BC |
| Exodus from Egypt | 1446 BC |
| Tabernacle erected | 1445 BC |
| Conquest begins | 1406 BC |
| Joshua dies | 1375 BC |
| United monarchy | 1050-930 BC |
| Fall of Jerusalem | 586 BC |
| Return from exile | 538 BC |
| Crucifixion | 30 AD |

Note that Exodus 12:40's four hundred thirty years in Egypt cannot be reconciled
with both a 1706 BC entry and a 1446 BC exodus. Report the figure in a
description where the text states it, but do not derive event dates from it.

Keep a book's events inside its anchor span, and make sure the last event of one
book does not post-date the first event of the next unless the narratives
genuinely overlap.

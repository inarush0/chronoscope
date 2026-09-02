# Research notes

A **research note** records what was measured or read while answering one
question, on the day it was answered. It is not an ADR: an ADR states a
decision and the reasoning that survives it, while a note is the raw legwork a
decision was made from — surveys of options, command output, version-pinned
quotes from upstream docs. A note may end in a recommendation, or in a menu
with no pick at all.

Each note is a **dated snapshot and is not maintained**. It names the tool
versions, the date and the commit it was measured against, and it keeps saying
that after the tree has moved on. A stale claim in a note is not a bug to fix;
correcting it would destroy the record of what was true when the decision was
made. If a note's conclusion has been overtaken, say so in the ADR or issue
that supersedes it, not by editing the note.

`docs/adr/` holds decisions, `docs/*.md` holds loose living notes, and this
directory holds the snapshots. The convention starts here, with the three notes
from [map #38](https://github.com/inarush0/chronoscope/issues/38).

#!/usr/bin/env bun
/**
 * Extracts timeline events for a Bible book from a PDF using the Claude API.
 * Outputs a JSON file ready for use with seed.ts.
 *
 * The PDF is uploaded to the Anthropic Files API on first run; the file ID is
 * cached in .pdf-cache.json at the repo root so subsequent runs skip the upload.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... bun scripts/extract-book.ts <book-name> <id-prefix> <pdf-path> <output-path>
 *
 * Example:
 *   ANTHROPIC_API_KEY=... bun scripts/extract-book.ts Exodus exo \
 *     "../../New Revised Standard Version Bible.pdf" \
 *     "../../chronoscope/src/lib/data/exodus.json"
 */

import Anthropic from '@anthropic-ai/sdk';
import type { BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY env var is required');
  process.exit(1);
}

const [, , bookName, idPrefix, pdfPath, outputPath] = process.argv;
if (!bookName || !idPrefix || !pdfPath || !outputPath) {
  console.error(
    'Usage: bun scripts/extract-book.ts <book-name> <id-prefix> <pdf-path> <output-path>',
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── PDF File ID Cache ────────────────────────────────────────────────────────

const CACHE_PATH = join(__dirname, '..', '.pdf-cache.json');
const resolvedPdfPath = resolve(pdfPath);

async function getPdfFileId(): Promise<string> {
  const cache: Record<string, string> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
    : {};

  if (cache[resolvedPdfPath]) {
    console.log('Using cached PDF file ID.');
    return cache[resolvedPdfPath];
  }

  console.log('Uploading PDF to Anthropic Files API (this only happens once)...');
  const pdfBuffer = readFileSync(resolvedPdfPath);
  const file = await client.beta.files.upload({
    file: new File([pdfBuffer], 'bible.pdf', { type: 'application/pdf' }),
  });

  cache[resolvedPdfPath] = file.id;
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`Uploaded. File ID: ${file.id}`);
  return file.id;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a biblical scholar extracting structured timeline events from Bible books.

## Output Format
Output ONLY a valid JSON object — no markdown fences, no explanation:

{
  "events": [
    {
      "id": "<id-prefix>-<kebab-case-descriptor>",
      "start": <unix_milliseconds_integer>,
      "end": <unix_milliseconds_integer — omit for point-in-time events>,
      "title": "<concise event title>",
      "category": "<narrative section grouping>",
      "meta": {
        "reference": "<Book Chapter:Verse–Verse>",
        "description": "<One to two sentences in past tense.>"
      }
    }
  ]
}

## Dating — Ussher Chronology
Convert a BCE year to Unix milliseconds: new Date(Date.UTC(1 - bceYear, 0, 1)).getTime()
Convert a CE year to Unix milliseconds:  new Date(Date.UTC(ceYear, 0, 1)).getTime()

Key reference dates:
  4004 BC — Creation
  2349 BC — The Flood
  2166 BC — Abraham born
  2066 BC — Isaac born
  2006 BC — Jacob born
  1885 BC — Joseph becomes Vizier of Egypt
  1805 BC — Death of Joseph
  1527 BC — Moses born
  1491 BC — The Exodus; arrival at Sinai; Ten Commandments
  1490 BC — Tabernacle completed
  1451 BC — Israel enters Canaan; Joshua's conquest begins
  1425 BC — Death of Joshua
  1010 BC — David becomes king of Israel
   970 BC — Solomon becomes king
   960 BC — Solomon's Temple completed
   930 BC — Kingdom divides (Israel / Judah)
   722 BC — Fall of Samaria; Northern Kingdom ends
   605 BC — First Babylonian deportation
   586 BC — Fall of Jerusalem; Temple destroyed; exile begins
   536 BC — First exiles return under Zerubbabel
   516 BC — Second Temple completed
   458 BC — Ezra leads second return from exile
   445 BC — Nehemiah rebuilds Jerusalem walls
     6 BC — Birth of Jesus (scholarly consensus)
    30 AD — Crucifixion and Resurrection of Jesus
    35 AD — Conversion of Paul
    48 AD — Paul's first missionary journey
    70 AD — Destruction of Jerusalem and the Temple

## Rules
- All events ordered by start time ascending
- Use "end" only for durations measured in years (wilderness wanderings, reigns, construction periods)
- Capture all significant narrative passages — major episodes, not verse-by-verse
- Categories group thematically related events within the book
- All timestamps must be integers
- Use Ussher dates consistently; approximate reasonably for events where timing is implied`;

const fileId = await getPdfFileId();

console.log(`Extracting events for the Book of ${bookName}...`);

const system: BetaTextBlockParam[] = [
  {
    type: 'text',
    text: SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral' },
  },
];

const response = await client.beta.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 16000,
  betas: ['files-api-2025-04-14', 'prompt-caching-2024-07-31'],
  system,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'file',
            file_id: fileId,
          },
        },
        {
          type: 'text',
          text: `Extract all significant timeline events from the Book of ${bookName}. Use "${idPrefix}" as the id prefix. Output only raw JSON.`,
        },
      ],
    },
  ],
});

// ─── Parse & Write ────────────────────────────────────────────────────────────

const raw = response.content.find((b) => b.type === 'text')?.text ?? '';
const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

let parsed: { events: unknown[] };
try {
  parsed = JSON.parse(cleaned) as { events: unknown[] };
} catch {
  console.error('Failed to parse response as JSON. Raw output:');
  console.error(raw);
  process.exit(1);
}

if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
  console.error('Response is missing or has an empty "events" array');
  process.exit(1);
}

writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
console.log(`Done: ${parsed.events.length} events written to ${outputPath}`);

const u = response.usage;
const parts = [
  `input: ${u.input_tokens}`,
  `output: ${u.output_tokens}`,
  'cache_creation_input_tokens' in u && u.cache_creation_input_tokens
    ? `cache write: ${u.cache_creation_input_tokens}`
    : null,
  'cache_read_input_tokens' in u && u.cache_read_input_tokens
    ? `cache read: ${u.cache_read_input_tokens}`
    : null,
].filter(Boolean);
console.log(`Tokens — ${parts.join(', ')}`);

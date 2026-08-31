# Chronoscope

## Toolchain

**npm and node 24. Never `bun` — it is gone from this repo.** The dataset build
scripts under `dataset/` are `.ts` files node runs directly by stripping their
types, so they must stay within erasable syntax: no enums, no namespaces, no
parameter properties. `dataset/tsconfig.json` sets `erasableSyntaxOnly` to
enforce that; `npm run check:dataset` is what catches a violation.

The frontend is vanilla TypeScript on Vite — no framework, no Svelte. There is
no server tier: `main.go` embeds the built `dist/` and serves it. Run
`npm run build:binary` rather than bare `go build`, because `//go:embed dist`
needs the frontend built first and `dist/` is gitignored.

The script table lives in `README.md`; don't duplicate it here.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `inarush0/chronoscope`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

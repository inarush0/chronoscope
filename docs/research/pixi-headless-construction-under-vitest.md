# Constructing a Pixi `Application` headlessly under Vitest

Research for [#39](https://github.com/inarush0/chronoscope/issues/39), a sub-issue
of [map #38](https://github.com/inarush0/chronoscope/issues/38). **This is a
survey: it reports options and their costs, it does not pick one.** The choice is
made in the prototype ticket, [#42](https://github.com/inarush0/chronoscope/issues/42).

Investigated 2026-08-31 / 2026-09-01. Every "verified" claim below was run
locally on **node v24.18.0, darwin arm64 (Darwin 25.5.0)** against **pixi.js
8.20.1** and **vitest 4.1.11**, in a throwaway sandbox outside this repo. No
dependency was added to this repo and no file under `src/` was touched.

## What the barrier actually is

`TimelineController.create()`
(`src/timeline/TimelineController.ts:157`) calls `app.init({ canvas, ...,
resolution: window.devicePixelRatio || 1 })`. Pixi's default `BrowserAdapter`
reaches for `document` during `init`, so in bare node this throws before any
GL question is asked:

```
$ node -e "…new Application().init({ preference: 'canvas', width: 800, height: 600 })"
FAIL: ReferenceError: document is not defined
```

Verified locally, node 24.18.0 + pixi 8.20.1. Note the `preference: 'canvas'` —
even the non-GPU path needs a DOM. In the same process, with no DOM at all:

- `import("pixi.js")` — **ok**
- `new Graphics().rect(0,0,10,10).fill(0xff0000)`, then `getLocalBounds()` —
  **ok**, returns `{x:0,y:0,width:10,height:10}`
- `new Container().addChild(new Graphics())` — **ok**

So the scene graph is already headless-safe on node 24. `Application.init` is
the entire barrier, which matches decision 4 on the map.

### The `app` surface the controller actually uses

Relevant to option E. Across all 722 lines, `this.app` is touched in six places:

| Use | Site |
| --- | --- |
| `app.screen.width` / `.height` | `viewWidth` / `viewHeight` getters (`:203`, `:206`) |
| `app.renderer.background.color = …` | `setColors` (`:253`) |
| `app.renderer.resize(w, h)` | `resize` (`:707`) |
| `app.canvas` | `destroy` (`:711`), to unbind listeners |
| `app.ticker.add/remove` | `create` (`:179`), `destroy` (`:718`) |
| `app.stage.addChild` | `create` (`:174`) |

Plus `app.destroy` in `destroy` (`:720`). The four query methods named on the
map — `getEventAt`, `getBinAt`, `getGaps`, `zoomToSelection` — read the app only
through `viewWidth`/`viewHeight`, i.e. a width and a height.

---

## Option A — Vitest browser mode (Playwright)

**Verified working, highest fidelity, heaviest install.**

Vitest 4 splits the provider out of core: `@vitest/browser-playwright`,
`@vitest/browser-webdriverio`, or `@vitest/browser-preview`
([Vitest browser guide](https://vitest.dev/guide/browser/)). The docs are
explicit that the preview provider is unsuitable for CI ("to run tests in CI you
need to install either `playwright` or `webdriverio`") and that "headless mode is
not available by default" without one of those two providers
([Playwright provider docs](https://vitest.dev/guide/browser/playwright)).

`@vitest/browser-playwright@4.1.11` (published 2026-08-31) declares
`peerDependencies: { vitest: "4.1.11", playwright: "*" }` — an **exact** pin on
vitest, so the two must be bumped in lockstep forever after.

I ran the real thing: a Vitest 4.1.11 browser-mode test that calls
`Application.init` exactly the way `TimelineController.create` does (canvas,
`antialias: true`, `resolution: window.devicePixelRatio`, `autoDensity`).

```
stdout | browser.test.ts > inits a real WebGL Pixi Application in headless chromium
renderer type: 1 | GL_VERSION: WebGL 2.0 (OpenGL ES 3.0 Chromium)
  | UNMASKED_RENDERER: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)

 Test Files  1 passed (1)   Duration  882ms (warm) / 2.60s (cold)
```

Pixi picked its **WebGL** renderer (`type: 1`), against a real WebGL 2.0 context
backed by SwANGLE — ANGLE over SwiftShader's Vulkan, i.e. software rasterisation
with no GPU present. That is Chromium's documented headless story
([Chromium: Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md));
Playwright ships it as the headless default.

**Costs, measured:**

- node_modules: `playwright` 5.0M + `playwright-core` 13M = **18M**.
- Browser binaries: `npx playwright install chromium` downloaded **94.7 MiB**
  and left **554M on disk** (`chromium-1234` 356M, `chromium_headless_shell-1234`
  196M, `ffmpeg` 2.5M). In GitHub Actions this is either a per-run download or a
  cache entry to maintain; on Linux it is `npx playwright install --with-deps
  chromium`, which also apt-installs system libraries (not measured — CI is
  ubuntu, my measurements are darwin).
- Config: node tests and browser tests cannot share one config block. Vitest's
  documented answer is `test.projects` — one project `environment: 'node'` for
  `format.test.ts` / `viewport.test.ts`, one browser project for the rest
  ([projects configuration](https://vitest.dev/guide/browser/#projects-configuration)).
- Vitest opens **a single page per test file**, so isolation is file-level, not
  test-level (documented on the Playwright provider page).

**What it buys:** a real `document`, real pointer events, real WebGL — the same
renderer path production uses. It is the only option that would let
`timelineView.ts` and `inspector.ts` be tested against a real DOM rather than an
emulation, which is the fog item on the map.

**Unverified, flag for #42:** whether `@vitest/coverage-v8` reports correctly for
browser-mode projects in Vitest 4, and whether merged coverage across a node
project and a browser project comes out as one number. I did not test this and
it matters a lot to #38.

**Flakiness:** nothing flaked in my runs, but the honest read is that this adds a
browser process, a download, and a CI system-dependency step to the critical
path. Decision 8 on the map (coverage in its own non-gating job) exists precisely
to contain this.

---

## Option B — node + jsdom + node-canvas + Pixi's Canvas renderer

**Verified working, ~35× faster than option A per test, needs one native module.**

PixiJS **reintroduced a Canvas 2D renderer in v8.16.0** — PR
[#11815 "feat: Canvas renderer"](https://github.com/pixijs/pixijs/pull/11815),
merged 2026-02-03, released as
[v8.16.0](https://pixijs.com/blog/8.16.0) the same day. It is selected with
`preference: 'canvas'` (`RendererPreference = 'webgl' | 'webgpu' | 'canvas'`),
and when given an array the option acts as a blocklist — everything not listed is
excluded. Pixi's own blog calls it an early, experimental release. The PR's
support checklist marks **meshes, custom shaders and compressed textures
unsupported**, filters "simplified", masking and bitmap text partial.

The relevant fact for us: `CanvasContextSystem` only ever asks for
`canvas.getContext("2d")`, where `GlContextSystem` asks for `webgl2` then
`webgl` and throws `"This browser does not support WebGL. Try using the canvas
renderer"` if both are null (read from `pixi.js@8.20.1` lib sources).

Verified under Vitest 4.1.11 with `environment: 'jsdom'`, `jsdom@30.0.1` and
`canvas@3.2.3` installed:

```
2d ctx: present
renderer type: 4 screen: 800 600
 ✓ jsdom.test.ts > inits a Pixi canvas-renderer Application under vitest jsdom  15ms
 Duration 537ms (environment 234ms)
```

`init`, `render(stage)`, `renderer.resize(400,300)` (screen updated to 400) and
`destroy` all succeeded. That covers every `app` member the controller uses.

**node-canvas is not optional.** Both negative cases were verified:

- `jsdom@30.0.1` without the `canvas` package: `getContext('2d')` and
  `getContext('webgl2')` both return `null` and jsdom logs *"Not implemented:
  HTMLCanvasElement's getContext() method: without installing the canvas npm
  package"*. Pixi then dies with `TypeError: Cannot read properties of null
  (reading 'imageSmoothingEnabled')`.
- `happy-dom@20.12.0`: also returns `null` for both contexts, same Pixi failure.
  So the "faster jsdom alternative" does **not** work here.

**Costs, measured:**

- `jsdom` 8.3M, `canvas` 19M on disk.
- `canvas@3.2.3` (released 2026-03-31) ships **N-API prebuilds**
  (`canvas-v3.2.3-napi-v7-{linux-x64,linux-arm64,darwin-arm64,darwin-x64,win32-x64}.tar.gz`)
  and declares `engines: ^18.12.0 || >= 20.9.0`. N-API means the prebuild is
  ABI-independent — **no node-24-specific build needed**, unlike headless-gl
  below. It installed here without compiling.
- Test cost is 15ms per test, 234ms of one-time jsdom environment setup.

**Fidelity gap:** the renderer under test is `type: 4` (canvas), production is
`type: 1` (WebGL). For the four query methods this is irrelevant — they read a
width and a height — but any future test that cares about drawing would be
testing a different renderer than ships. It also means the WebGL code path in
`create()` is never executed in CI.

**It hands us a `document`** (jsdom's), which answers the map's fog item for
`timelineView.ts` and `inspector.ts` at emulation fidelity rather than real-browser
fidelity.

---

## Option C — headless-gl (`gl`), and `@pixi/node`

**Does not currently work on node 24. Verified failing.**

`gl` is at **8.1.6** on npm (last publish 2024-10-29, `engines: node >=18`).
Its README claims "Prebuilt binaries are generally available for LTS node
versions (e.g. 20, 22, 24)", but the release assets do not bear that out:

- **v8.1.6** assets stop at `node-v127` (= node 22); the rest are `node-v108`
  (node 18) and `node-v115` (node 20), across darwin-arm64/linux-x64/linuxmusl/win32.
  There is **no `node-v137` asset**, and 137 is node 24's ABI (confirmed via `node-abi`: 20→115, 22→127,
  23→131, **24→137**, 25→141).
- **v9.0.0-rc.10** (2026-04-10, still a release candidate) tops out at
  `node-v134` and ships linux/linuxmusl/win32 only — no darwin, and still no 137.

With no prebuild, npm falls back to a source build, which fails:

```
$ npm i gl            # node v24.18.0, ABI 137
node-gyp … /include/node/cppgc/macros.h:51:1: error: unknown type name 'concept'
                       macros.h:52:5: error: use of undeclared identifier 'requires'
gyp ERR! build error — `make` failed with exit code: 2
```

Node 24's headers require C++20; `gl`'s `binding.gyp` does not ask for it. That
is a fixable upstream one-liner, but today it is a hard stop on this repo's
`engines: node >=24`.

Beyond the build: `gl` targets **WebGL 1.0.3**, with WebGL 2 only as an opt-in
experiment (`createWebGL2Context: true`); Pixi 8 asks for `webgl2` first. It
provides **no DOM at all** (no `Image`, no video, textures must be fed as
`Uint8Array` via `texImage2D`), supports only 13 extensions, and on Linux needs
`build-essential libxi-dev libglu1-mesa-dev libglew-dev pkg-config`.

**`@pixi/node`** is the packaged version of this route and worth knowing about:
version **8.0.0** was published 2026-04-19 from
[pixijs-userland/node](https://github.com/pixijs-userland/node) — userland, not
the core repo. Its peer dependencies are `pixi.js ^8.18.1`, **`gl ^8.1.6`**,
`canvas ^3.2.0`, `@xmldom/xmldom`, `cross-fetch`, and its README says that in a
headless environment (server or CI) you must run under **xvfb**. It inherits the
node-24 blocker wholesale.

---

## Option D — what PixiJS itself does (context, not a candidate)

Pixi does **not** ship a headless or no-op renderer, and its own suite does not
stub GL. From `.configs/jest.config.js` on `pixijs/pixijs@dev`:

```js
runner: '@pixi/jest-electron/runner',
testEnvironment: '@pixi/jest-electron/environment',
```

Pixi runs Jest **inside a real Electron renderer process** — a real browser
engine with real WebGL. `@pixi/jest-electron@26.1.0` depends on `electron ^32`
and the jest 26 runner internals, so it is not usable from Vitest and not a
candidate here. The transferable finding is the negative one: **the framework's
own answer to "how do you test a renderer" is "run a browser"**, and the closest
thing to an official headless recipe is the
[Environments guide](https://pixijs.com/8.x/guides/concepts/environments), which
tells you to implement the `Adapter` interface yourself (`createCanvas`,
`createImage`, `getCanvasRenderingContext2D`, `getWebGLRenderingContext`,
`getNavigator`, `getBaseUrl`, `getFontFaceSet`, `fetch`, `parseXML` — that is the
full contract, from `pixi.js/lib/environment/adapter.d.ts`). A hand-written
adapter is a fifth path, but it is option B's dependencies re-implemented by us.

---

## Option E — a seam in `TimelineController`, no `Application` at all

**Cheapest in CI, only one that requires editing `src/`.**

Given the evidence above — `Graphics` and `Container` work in bare node 24 with
no DOM, and `app` is used for exactly the seven call sites tabulated at the top —
a test could construct a controller against a stand-in that supplies
`screen.{width,height}`, a no-op `ticker`, a `stage`, a `renderer.background`
/`renderer.resize`, and a `canvas` to attach listeners to.

Per AGENTS.md ("find the seam that is already there before building one"), the
seam already half-exists: the **private constructor already takes `app`, the
options, and the two `Graphics` layers as parameters** — `create()` is only the
Pixi-flavoured way of producing them. The minimal change is making that existing
constructor reachable from a test (or adding a second factory beside `create`)
rather than extracting a new port type.

**Costs:**

- Zero new dependencies, zero CI weight, microsecond-scale tests, and coverage
  keeps running through the plain `@vitest/coverage-v8` node path.
- It **modifies production code to enable a test**, and what gets asserted runs
  against a fake — `Application.init` itself, and the `create()` wiring around
  it, stay uncovered by construction.
- It **does not hand us a `document`**. `timelineView.ts` and `inspector.ts` are
  in scope per decision 7, and they are DOM code, so this option leaves that half
  of the map unanswered and needs A or B alongside it anyway.
- Whether the stand-in is a hand-written object, a typed `Surface` port, or
  `Application` narrowed to an interface is a design question for #42, not a
  research finding.

---

## Summary table

| | Works on node 24? | New deps (disk) | CI cost | Per-test cost | Gives `document`? | Renderer fidelity |
| --- | --- | --- | --- | --- | --- | --- |
| **A** Vitest browser mode (Playwright) | Yes, verified | `playwright` 18M + **554M browsers** (94.7 MiB download) | browser install/cache step, `--with-deps` on Linux | ~200ms test, 2.6s cold run | Real browser DOM | **WebGL 2** via SwANGLE — same path as prod |
| **B** jsdom + node-canvas + `preference:'canvas'` | Yes, verified | `jsdom` 8.3M + `canvas` 19M (N-API prebuilds) | none beyond `npm ci` | 15ms test, 234ms env setup | jsdom emulation | Canvas 2D (`type 4`), **not** the prod path |
| **C** headless-gl / `@pixi/node` | **No** — no ABI-137 prebuild, source build fails | `gl` + `canvas` + xvfb + Linux GL headers | xvfb + apt deps | n/a | No (gl has no DOM) | WebGL 1 (WebGL 2 experimental) |
| **D** Pixi's own harness (Electron + jest) | n/a — jest-only, electron 32 | n/a | n/a | n/a | Real | Real |
| **E** Seam in `TimelineController` | Yes (scene graph verified headless) | none | none | microseconds | **No** | none — no renderer at all |

## Loose ends someone should close in #42

1. **Coverage under browser mode.** Unverified. If `@vitest/coverage-v8` cannot
   merge a node project and a browser project into one TS number, that reshapes
   #38's reporting ticket.
2. **All measurements are darwin arm64.** The CI runner is ubuntu; the Playwright
   `--with-deps` apt payload and the node-canvas linux-x64 prebuild path were
   reasoned about from release assets, not run.
3. **Version drift.** `package.json` says `pixi.js: ^8.16.0`; the lockfile has
   **8.20.1**, which is what I tested. Everything about the Canvas renderer
   applies from 8.16.0 onward and to nothing earlier — a downgrade below 8.16.0
   deletes option B entirely.
4. **`gl` is one upstream commit from viable.** If `binding.gyp` gains a C++20
   flag and an ABI-137 prebuild ships, option C's arithmetic changes. Worth a
   re-check rather than a permanent ruling.

## Sources

- PixiJS PR [#11815 "feat: Canvas renderer"](https://github.com/pixijs/pixijs/pull/11815) (merged 2026-02-03) and [PixiJS v8.16.0 release notes](https://pixijs.com/blog/8.16.0)
- [PixiJS Environments guide](https://pixijs.com/8.x/guides/concepts/environments) and `pixi.js@8.20.1` lib sources (`environment/adapter.d.ts`, `rendering/renderers/autoDetectRenderer.d.ts`, `gl/context/GlContextSystem`, `canvas/CanvasContextSystem`)
- [`pixijs/pixijs@dev` `.configs/jest.config.js`](https://github.com/pixijs/pixijs/blob/dev/.configs/jest.config.js) and its `package.json` (`@pixi/jest-electron ^26.1.0`)
- [Vitest browser mode guide](https://vitest.dev/guide/browser/), [Playwright provider](https://vitest.dev/guide/browser/playwright), [projects configuration](https://vitest.dev/guide/browser/#projects-configuration), [test environments](https://vitest.dev/guide/environment)
- [stackgl/headless-gl README + releases](https://github.com/stackgl/headless-gl), npm `gl@8.1.6`, `node-abi@4.35.0`
- [pixijs-userland/node README](https://github.com/pixijs-userland/node), npm `@pixi/node@8.0.0`
- [Automattic/node-canvas releases](https://github.com/Automattic/node-canvas/releases), npm `canvas@3.2.3`
- [Chromium docs: Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
- Local runs on node v24.18.0 / pixi 8.20.1 / vitest 4.1.11, sandboxed outside this repo

# Page TOC

A Thymer plugin. **Platform knowledge and workspace rules live in the `thymer` skill
(`~/.claude/skills/thymer/`) and the parent repo's `CLAUDE.md` (`~/repos/thymer`)** —
this file holds only what is specific to this plugin.

Mechanics (all repos identical): `./setup.sh` re-links `sdk/`, `bin/thymercli` and
`examples/` from the shared cache (they're gitignored symlinks — don't edit `sdk/`);
`./build.sh .` bundles to `dist/plugin.js`, the paste-ready form (committed on purpose;
`hooks/pre-push` keeps it in sync with source).

## Notes

One AppPlugin, FOUR TOC surfaces (three built 2026-08-10, sticky added 2026-08-11):

1. **Popup** — palette command "Page TOC: open popup"; centered modal, type-to-filter,
   ↑/↓/Enter/Esc. A hidden `<button data-action="plugin.toc">` is mounted in every
   editor panel so a custom keyboard shortcut (`"plugin.toc": "Key+Combo"` in Change
   Keyboard Shortcuts) can reach it — the dispatcher clicks `[data-action]` inside the
   focused panel only.
2. **Right rail** — per-panel fixed overlay (tick marks, hover → full card that
   overlaps content, scroll-spy highlight). No width gate (removed 2026-08-10
   after live measurements showed the editor's right margin floors at a
   non-constant 40–50px, making margin-based gating flaky) — the rail shows in
   any panel with headings, 6px off the panel's right edge. While the rail is
   enabled, Thymer's OWN scrollbar (`.panel .vscrollbar.scrollbar` — Thymer
   draws its scrollbar as a DOM element; the native one is effectively
   invisible) is hidden via injected CSS, restored on toggle-off/unload. Tracks
   resizes live (rAF on window resize + ResizeObserver on panel elements for
   divider drags). Toggle via palette; per-device localStorage
   (`ptoc.<ws>.state`).
3. **Sidebar widget** — `ui.addSidebarWidget`, mirrors the ACTIVE panel's page,
   scroll-spy shared with the rail. Toggle via palette. No runtime `config.custom`
   writes anywhere (they'd vaporize the widget).
4. **Sticky header** (RemNote-style, 2026-08-11; per-pixel CSS-sticky emulation
   built from frame-by-frame study of a RemNote recording) — per-panel fixed bar
   anchored BELOW Thymer's own sticky "<Collection> / <Page>" strip
   (`.panel-bar--tabsbar` inside the scroller; covering it was a reported bug).
   The model (`_outlineFor`) is an AUGMENTED tree: real `parent_guid` tree, then
   headings become virtual parents of the sibling lines after them (until a
   heading of same-or-bigger hsize), so outline levels and heading sections
   resolve uniformly; plus `docOrder`/`docIndex` for terminator lookup
   (`_stickyTermIndex` = first line whose augDepth ≤ the node's). Per frame, the
   pinned stack resolves top-down: at each level the candidate is the last
   sibling whose row top ≤ the slot line; it pins only if it has aug-children
   (leaves slide under the bar) and its terminator is still below the slot; its
   offset is `min(0, terminatorTop − slotBottom)` — a parent DOCKS the instant
   its row top reaches its slot (seamless freeze) and the next sibling PUSHES
   dying crumbs out pixel-by-pixel (crumbs absolutely positioned, DOM
   deepest-first so pushed crumbs slide UNDER shallower ones; bar
   `overflow:hidden`). Missing rows resolve by docIndex vs first/last rendered
   row (virtualization ⇒ ±∞). Depth cap `sticky_max_depth` (default 6, 0 =
   unlimited, settings-panel number field): pins only the FIRST N levels —
   deeper levels simply never pin, which keeps the bar geometry honest (an
   earlier first+⋯+tail middle-collapse pinned rows still visible below the
   shorter bar and was replaced). Resolution guard is 100 iterations — runaway
   protection only, NOT a depth policy (a 12 guard froze deep outlines, user-
   reported). Crumbs render at the real row's typography (font-size/line-height
   from `span.lineitem-text` — the row element lies, reporting 15px even for
   headings; metrics are part of the rebuild key so a rebuild during a Thymer
   re-render self-heals), flush left at the content margin like headings, with
   dots marking non-heading lines. Segment text: a ref segment's `text` is an
   OBJECT — `{guid, title}` or just `{guid}`; title-less refs resolve via
   `data.getRecord(guid).getName()` (`_segText`, shared with the heading model).
   Click = shared jump with a `topOffset` that lands the line just below the
   crumbs that will pin above it. Empty-model guard: a load racing the record's
   sync caches nothing, and `_renderStickyPane` re-refreshes when DOM rows exist
   but the model is empty. Live-verified over CDP (Tarp Lists + deep test
   outline): dock at slot, mid-push states, full push-out/replace, 15-deep
   chains capped to first 6, and a whole-document sweep asserting no crumb shows
   while its row is still visible below the bar.

Shared model: flat `rec.getLineItems()` walk with visited-set + `parent_guid` filter
(margin-notes pattern — flat order is document order on the live client);
`item.type === "heading"`, level via `item.getHeadingSize()` (MCP shows it as
`meta_properties.hsize`; h2/h3 observed live). Jump = scoped
`.listitem[data-guid]` lookup → scroll `.panel-scroller-y` → own-node flash overlay.
If the target row isn't in the DOM (collapsed section — and possibly virtualization
on very long documents, unverified) the jump toasts instead of scrolling.

`plugin.json.custom`: `popup`/`rail`/`sidebar`/`sticky` (master switches, read at
load), `sticky_max_depth` (pin only the first N levels; 0 = unlimited), and
`min_headings` (hide rail/sidebar below N headings).

CDP-testing gotcha (2026-08-11): in a BACKGROUNDED debug-Chrome tab, rAF never
fires — the sticky bar only updates on the 1500ms fallback tick (wait >2s between
scroll and assert), smooth scrolls never animate (crumb-click jumps look like
no-ops; check for `.ptoc-flash` instead), and Thymer unmounts the document
entirely after a while (0 `.listitem` rows while a stale screenshot still shows
content — `Page.captureScreenshot` wakes the renderer and remounts).

Deploy gotcha: no create-plugin API — the record must exist first (in-app ⌘P →
Plugins → Create Plugin, or MCP `create_collection type:global_plugin`). Then:
`./bin/thymercli plugin update code "Page TOC" --file dist/plugin.js -w <ws>` and
`plugin update config "Page TOC" --file plugin.json -w <ws>`.

Live-verified over CDP on the web client (2026-08-10, Tarp Lists page, 9 headings):
plugin loads (record guid: see the live workspace, never committed), rail renders ticks +
hover card, sidebar lists headings, popup opens focused / filters / Enter-jumps
(scroll 0→1144) / closes, sidebar click jumps back, scroll-spy highlights the
correct tick. Deploy quirks hit: (a) in-app-created plugins keep the default name
"New Global Plugin" until a config push renames them — match by diffing the list,
not by name; (b) the WEB replica lags syncing plugin-record code pushes made via
the desktop MCP — reload again after ~a minute; (c) pushing a minimal plugin.json
is safe here: the app auto-merges it over the default config fields (verified —
`off`, `managed`, etc. survived). Untested: popup shortcut dispatch via a real
custom keybinding, desktop title-bar z-index, virtualized long documents.

# Page TOC

A Thymer plugin. **Platform knowledge and workspace rules live in the `thymer` skill
(`~/.claude/skills/thymer/`) and the parent repo's `CLAUDE.md` (`~/repos/thymer`)** —
this file holds only what is specific to this plugin.

Mechanics (all repos identical): `./setup.sh` re-links `sdk/`, `bin/thymercli` and
`examples/` from the shared cache (they're gitignored symlinks — don't edit `sdk/`);
`./build.sh .` bundles to `dist/plugin.js`, the paste-ready form (committed on purpose;
`hooks/pre-push` keeps it in sync with source).

## Notes

One AppPlugin, THREE TOC surfaces built for side-by-side comparison (2026-08-10):

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

Shared model: flat `rec.getLineItems()` walk with visited-set + `parent_guid` filter
(margin-notes pattern — flat order is document order on the live client);
`item.type === "heading"`, level via `item.getHeadingSize()` (MCP shows it as
`meta_properties.hsize`; h2/h3 observed live). Jump = scoped
`.listitem[data-guid]` lookup → scroll `.panel-scroller-y` → own-node flash overlay.
If the target row isn't in the DOM (collapsed section — and possibly virtualization
on very long documents, unverified) the jump toasts instead of scrolling.

`plugin.json.custom`: `popup`/`rail`/`sidebar` (master switches, read at load) and
`min_headings` (hide rail/sidebar below N headings).

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

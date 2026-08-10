# Page TOC

A table of contents for every [Thymer](https://thymer.com) page — three surfaces,
pick the ones you like.

## Surfaces

- **Popup** — a centered, keyboard-navigable heading list showing the page title.
  Type to filter, ↑/↓ to move, Enter to jump, Esc to close. Open it from the
  command palette ("Page TOC: Show TOC") or bind a key (see below).
- **Right rail** — a rounded tick rail floating at the panel's right edge, one
  tick per heading, the current section brightened as you scroll. It replaces
  Thymer's scrollbar while enabled. Hover to expand the full heading list, or
  drive it entirely by keyboard: open with a shortcut, ↑/↓ to select, Enter to
  jump, Esc (or clicking/typing anywhere) to dismiss.
- **Sidebar outline** — an "On this page" section in the sidebar mirroring the
  active panel's headings, aligned with the native section headers, with the
  current section highlighted live.

All three share one heading model (H1–H6, indented by level) and jump with a
smooth scroll plus a highlight flash that tracks the target line.

## Install

Create a plugin in Thymer (⌘P → Plugins → Create Plugin), then paste
[`dist/plugin.js`](dist/plugin.js) into **Edit Code → Custom Code** and
[`plugin.json`](plugin.json) into **Configuration**, and save.

## Keyboard shortcuts

The plugin exposes two shortcut actions. Bind them via ⌘P → "Change Keyboard
Shortcuts":

```
"plugin.toc": "Meta+G",      // open the popup
"plugin.tocrail": "Ctrl+G"   // open the rail in keyboard mode
```

Any keys work; these two are unbound in stock Thymer.

## Settings

⌘P → **"Plugin: Page TOC"** opens a settings panel with on/off toggles for each
surface. Changes preview immediately and are saved (to the plugin's synced
configuration) when the panel closes. `min_headings` in the plugin
configuration hides the rail/sidebar on pages with fewer headings.

## Notes

- No Thymer-owned DOM is ever mutated: the rail and popup are overlay nodes,
  the sidebar section uses the SDK's sidebar-widget API, and the scrollbar
  replacement is a CSS rule that's removed when the rail is off.
- Built and tested against Thymer 0.0.19-era clients (2026-08). Alpha moves
  fast — selectors and SDK behavior may shift.

## Development

`./setup.sh` links the SDK from the shared cache; `./build.sh .` bundles
`plugin.js` to the paste-ready `dist/plugin.js`.

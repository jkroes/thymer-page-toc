/// <reference path="./sdk/types.d.ts" />
// Page TOC — four table-of-contents surfaces:
//   1. POPUP   — centered, keyboard-navigable (palette command / plugin.toc shortcut)
//   2. RAIL    — floating right-of-page tick rail, expands on hover, scroll-spy
//   3. SIDEBAR — global sidebar widget mirroring the active panel's page
//   4. STICKY  — RemNote-style pinned ancestor rows at the top of each panel:
//                the outline ancestors (plus nearest preceding section headings)
//                of the topmost visible line, shown while their own rows are
//                scrolled out of view
//
// All three share one heading model (flat getLineItems() walk, margin-notes style)
// and one jump routine (read-only row geometry + scroller scroll). No Thymer-owned
// DOM is ever mutated; the only nodes touched are our own overlays plus one hidden
// <button data-action="plugin.toc"> per panel so a custom keyboard shortcut can
// reach the popup.

const STYLE_ID = "ptoc-style";
const RAILS_ID = "ptoc-rails";
const POPUP_ID = "ptoc-popup";
const STICKY_ID = "ptoc-sticky";
const STICKY_ROWH = 24;   // fixed crumb row height (kept in sync with CSS)
const STICKY_PADV = 8;    // bar top+bottom padding
const STICKY_MAX = 4;     // crumb rows shown before collapsing to first + … + last two
const ACTION = "plugin.toc";
const RAIL_ACTION = "plugin.tocrail";
const SCROLLBAR_STYLE_ID = "ptoc-scrollbar-style";
// Injected only while the rail is enabled: the rail replaces the native scrollbar.
const SCROLLBAR_CSS = `
.panel-scroller-y { scrollbar-width: none; }
.panel-scroller-y::-webkit-scrollbar { width: 0; height: 0; display: none; }
/* Thymer draws its own scrollbar (.vscrollbar) — that's the visible one. */
.panel .vscrollbar.scrollbar { display: none !important; }
`;

const CSS = `
/* ---- shared ---- */
.ptoc-item { cursor: pointer; border-radius: 4px; padding: 3px 8px; font-size: 12.5px;
  line-height: 1.45; color: var(--panel-fg-color, #ccc); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.ptoc-item:hover { background: var(--side-bg-focus, rgba(128,128,128,.18)); }
.ptoc-item.ptoc-active { color: var(--ed-text-color, #fff); font-weight: 600; }
.ptoc-h1 { padding-left: 8px; }
.ptoc-h2 { padding-left: 20px; }
.ptoc-h3 { padding-left: 32px; }
.ptoc-h4 { padding-left: 44px; }
.ptoc-h5 { padding-left: 56px; }
.ptoc-h6 { padding-left: 68px; }
.ptoc-empty { opacity: .55; font-size: 12px; padding: 4px 8px; font-style: italic; }

/* ---- popup ---- */
#${POPUP_ID} { position: fixed; inset: 0; z-index: 10500; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,.35); }
#${POPUP_ID} .ptoc-card { width: min(560px, 90vw); max-height: 62vh; display: flex;
  flex-direction: column; border-radius: 10px; overflow: hidden;
  background: var(--panel-bg-color, #1e1e1e);
  border: 1px solid var(--divider-color, rgba(128,128,128,.35));
  box-shadow: 0 12px 40px rgba(0,0,0,.5); }
#${POPUP_ID} .ptoc-popup-title { font-size: 11.5px; font-weight: 700; opacity: .6;
  text-transform: uppercase; letter-spacing: .06em; padding: 11px 16px 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--panel-fg-color, #ccc); }
#${POPUP_ID} input { border: none; outline: none; background: transparent;
  color: var(--ed-text-color, #eee); font-size: 15px; padding: 13px 16px;
  border-bottom: 1px solid var(--divider-color, rgba(128,128,128,.25)); }
#${POPUP_ID} .ptoc-list { overflow-y: auto; padding: 6px; }
#${POPUP_ID} .ptoc-item { font-size: 13.5px; padding-top: 5px; padding-bottom: 5px; }
#${POPUP_ID} .ptoc-item.ptoc-sel { background: var(--side-bg-active-focus, rgba(100,140,255,.25));
  color: var(--ed-text-color, #fff); }

/* ---- rail ---- */
#${RAILS_ID} .ptoc-rail { position: fixed; z-index: 480; display: flex;
  flex-direction: column; justify-content: center; align-items: flex-end; }
#${RAILS_ID} .ptoc-ticks { display: flex; flex-direction: column; gap: 7px;
  padding: 8px 4px; align-items: flex-end; border-radius: 8px;
  background: var(--panel-bg-color, rgba(30,30,30,.85));
  border: 1px solid var(--divider-color, rgba(128,128,128,.3)); }
#${RAILS_ID} .ptoc-tick { height: 2px; border-radius: 1px;
  background: var(--panel-fg-color, #888); opacity: .38; }
#${RAILS_ID} .ptoc-tick.ptoc-active { opacity: 1;
  background: var(--ed-text-color, #fff); }
#${RAILS_ID} .ptoc-card { display: none; flex-direction: column; gap: 1px;
  max-height: 60vh; max-width: 260px; overflow-y: auto; padding: 8px 6px;
  border-radius: 8px; background: var(--panel-bg-color, #1e1e1e);
  border: 1px solid var(--divider-color, rgba(128,128,128,.35));
  box-shadow: 0 6px 24px rgba(0,0,0,.4); }
#${RAILS_ID} .ptoc-rail:hover:not(.ptoc-nohover) .ptoc-ticks { display: none; }
#${RAILS_ID} .ptoc-rail:hover:not(.ptoc-nohover) .ptoc-card { display: flex; }
#${RAILS_ID} .ptoc-rail.ptoc-kb .ptoc-ticks { display: none; }
#${RAILS_ID} .ptoc-rail.ptoc-kb .ptoc-card { display: flex; outline: none; }
#${RAILS_ID} .ptoc-item.ptoc-sel { background: var(--side-bg-active-focus, rgba(100,140,255,.25));
  color: var(--ed-text-color, #fff); }

/* ---- sidebar widget ---- */
/* -11px margin lines our 8px paddings up with the native section headers (15px
   from the sidebar edge, measured live against "Collections") */
.ptoc-side { padding: 4px 8px 8px; margin-left: -19px; }
.ptoc-side .ptoc-side-title { font-size: 13px; font-weight: 700; opacity: .75;
  padding: 4px 8px; }
/* indent with margin, not padding, so the item box (active bar, hover bg)
   starts at the text instead of stretching to the widget's left edge */
.ptoc-side .ptoc-item { padding-left: 8px; }
.ptoc-side .ptoc-h2 { margin-left: 12px; }
.ptoc-side .ptoc-h3 { margin-left: 24px; }
.ptoc-side .ptoc-h4 { margin-left: 36px; }
.ptoc-side .ptoc-h5 { margin-left: 48px; }
.ptoc-side .ptoc-h6 { margin-left: 60px; }

/* ---- settings panel ---- */
.ptoc-settings { padding: 28px 32px; max-width: 420px; color: var(--panel-fg-color, #ccc); }
.ptoc-settings h2 { font-size: 17px; margin: 0 0 4px; color: var(--ed-text-color, #eee); }
.ptoc-settings .ptoc-set-sub { font-size: 12px; opacity: .65; margin-bottom: 20px; }
.ptoc-settings label { display: flex; align-items: center; gap: 10px; padding: 10px 0;
  font-size: 14px; cursor: pointer; border-bottom: 1px solid var(--divider-color, rgba(128,128,128,.15)); }
.ptoc-settings label span.ptoc-set-desc { font-size: 12px; opacity: .6; display: block; }
.ptoc-settings input[type=checkbox] { width: 16px; height: 16px; accent-color: #6a8dff; }
.ptoc-settings .ptoc-set-note { font-size: 11.5px; opacity: .55; margin-top: 18px; }

/* ---- sticky header ---- */
/* Crumbs are absolutely positioned at per-frame computed y's (CSS-sticky
   emulation: dock at slot, push-out by the subtree's terminator). DOM order is
   deepest-first so a pushed crumb slides UNDER the shallower one above it. */
/* background is set inline, sampled from the editor's real computed background,
   so the bar reads as a seamless part of the content (no border/shadow — the
   clipped line beneath is the boundary cue, as in RemNote) */
#${STICKY_ID} .ptoc-bar { position: fixed; z-index: 460; pointer-events: none;
  overflow: hidden; box-sizing: border-box;
  background: var(--ptoc-bg, var(--panel-bg-color, #1e1e1e)); }
#${STICKY_ID} .ptoc-crumb { pointer-events: auto; cursor: pointer; position: absolute;
  left: 0; right: 0; padding-right: 10px; box-sizing: border-box;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: var(--ptoc-bg, var(--panel-bg-color, #1e1e1e));
  color: var(--panel-fg-color, #ccc); }
/* height / line-height / font-size are set inline per crumb, copied from the
   crumb's real editor row so pinned text matches the outline exactly */
#${STICKY_ID} .ptoc-crumb:hover { background: var(--side-bg-focus, rgba(128,128,128,.18)); }
#${STICKY_ID} .ptoc-crumb.ptoc-crumb-h { font-weight: 600; color: var(--ed-text-color, #eee); }
#${STICKY_ID} .ptoc-crumb .ptoc-dot { position: absolute; opacity: .5; font-size: 9px; }

/* ---- jump flash ---- */
.ptoc-flash { position: fixed; z-index: 470; pointer-events: none; border-radius: 4px;
  background: rgba(120,160,255,.25); transition: opacity .9s ease; }
`;

export class Plugin extends AppPlugin {
    onLoad() {
        this._handlers = [];
        this._model = new Map();      // recGuid -> [{guid, text, hsize}]
        this._outline = new Map();    // recGuid -> full outline model (see _outlineFor)
        this._activeByRec = new Map(); // recGuid -> active heading guid (scroll-spy)
        this._popup = null;
        this._sidebar = null;
        this._sidebarContainer = null;
        this._lastSidebarRec = null;

        const custom = (this.getConfiguration() || {}).custom || {};
        this._cfg = {
            popup: custom.popup !== false,
            rail: custom.rail !== false,
            sidebar: custom.sidebar !== false,
            sticky: custom.sticky !== false,
            // max pinned rows before collapsing to first + ⋯ + rest; 0 = unlimited
            stickyMaxDepth: custom.sticky_max_depth === undefined
                ? 6 : Math.max(0, Number(custom.sticky_max_depth) || 0),
            minHeadings: Number(custom.min_headings) || 1,
        };

        if (!document.getElementById(STYLE_ID)) {
            const st = document.createElement("style");
            st.id = STYLE_ID;
            st.textContent = CSS;
            document.head.appendChild(st);
        }
        this._railsRoot = document.createElement("div");
        this._railsRoot.id = RAILS_ID;
        document.body.appendChild(this._railsRoot);
        this._stickyRoot = document.createElement("div");
        this._stickyRoot.id = STICKY_ID;
        document.body.appendChild(this._stickyRoot);

        if (this._cfg.popup) {
            this.ui.addCommandPaletteCommand({
                label: "Page TOC: Show TOC",
                icon: "ti-list-search",
                onSelected: () => this._openPopup(),
            });
        }
        this.ui.addCommandPaletteCommand({
            label: "Page TOC: navigate rail",
            icon: "ti-list-search",
            onSelected: () => this._openRailKb(),
        });
        this.ui.registerCustomPanelType("settings", (panel) => this._renderSettings(panel));
        this.ui.addCommandPaletteCommand({
            label: "Plugin: Page TOC",
            icon: "ti-settings",
            onSelected: () => this._openSettings(),
        });

        for (const ev of ["panel.navigated", "panel.focused", "panel.closed"])
            this._handlers.push(this.events.on(ev, () => this._refreshSoon(150)));
        this._handlers.push(this.events.on("panel.closed", (ev) => {
            const pid = ev?.panelId ?? ev?.panel?.getId?.();
            if (this._settingsPanelId && pid === this._settingsPanelId) {
                this._settingsPanelId = null;
                this._commitSettings();
            }
        }));
        for (const ev of ["lineitem.created", "lineitem.updated", "lineitem.moved",
                          "lineitem.deleted", "lineitem.undeleted"])
            this._handlers.push(this.events.on(ev, () => {
                this._model.clear();
                this._outline.clear();
                this._refreshSoon(300);
            }));

        this._onScroll = () => this._scheduleReposition();
        this._onResize = () => {
            this._scheduleReposition(); // rAF-throttled: rail tracks the resize live
            this._refreshSoon(150);     // debounced full refresh once the resize settles
        };
        document.addEventListener("scroll", this._onScroll, { capture: true, passive: true });
        window.addEventListener("resize", this._onResize);
        // typing while the card is hover-expanded means attention is in the editor —
        // collapse the card (keyboard mode has its own listener and is exempt)
        this._onKeyGlobal = (e) => {
            if (this._kb || ["Shift", "Meta", "Control", "Alt"].includes(e.key)) return;
            const rail = this._railsRoot?.querySelector(".ptoc-rail:hover:not(.ptoc-nohover)");
            if (rail) this._suppressHover(rail);
        };
        document.addEventListener("keydown", this._onKeyGlobal, { capture: true });
        // Panel-divider drags resize panels without a window resize event.
        this._resizeObs = new ResizeObserver(() => this._scheduleReposition());
        // Collapses/virtualization/re-renders fire no events — a slow tick catches them.
        this._tick = setInterval(() => {
            this._reposition();
            this._ensureActionButtons();
            this._renderSidebarSoon(); // keep the sidebar's active-heading highlight tracking scroll
        }, 1500);

        if (this._cfg.sidebar) this._mountSidebar();
        this._syncScrollbarStyle();
        this._refreshSoon(400);
    }

    onUnload() {
        this._commitSettings(); // settings panel may still be open on unload
        for (const h of this._handlers || []) this.events.off(h);
        clearInterval(this._tick);
        clearTimeout(this._refreshTimer);
        this._resizeObs?.disconnect();
        document.removeEventListener("scroll", this._onScroll, { capture: true });
        window.removeEventListener("resize", this._onResize);
        document.removeEventListener("keydown", this._onKeyGlobal, { capture: true });
        this._closePopup();
        this._closeRailKb();
        this._sidebar?.remove();
        this._railsRoot?.remove();
        this._stickyRoot?.remove();
        document.getElementById(STYLE_ID)?.remove();
        document.getElementById(SCROLLBAR_STYLE_ID)?.remove();
        document.querySelectorAll(`[data-action="${ACTION}"].ptoc-action`).forEach((b) => b.remove());
    }

    // ---- settings ----

    _applyCfg(which, on) {
        this._cfg[which] = on;
        this._pendingCfg = { ...(this._pendingCfg || {}), [which]: on };
        if (which === "sidebar") {
            if (on) this._mountSidebar();
            else { this._sidebar?.remove(); this._sidebar = null; this._sidebarContainer = null; }
        }
        if (which === "rail" && !on && this._kb) this._closeRailKb();
        if (which === "sticky" && !on && this._stickyRoot) this._stickyRoot.textContent = "";
        this._syncScrollbarStyle();
        this._refreshSoon(50);
    }

    // Commit deferred to settings-panel close: saveConfiguration reloads the plugin,
    // which mid-session would zombify the open panel (collection-colors lesson).
    _commitSettings() {
        if (!this._pendingCfg) return;
        const pending = this._pendingCfg;
        this._pendingCfg = null;
        // re-resolve the handle fresh — stale handles silently revert config
        const h = this.data.getPluginByGuid(this.getGuid());
        if (!h) return;
        const conf = h.getConfiguration() || this.getConfiguration() || {};
        conf.custom = { ...(conf.custom || {}), ...pending };
        h.saveConfiguration(conf); // triggers a plugin reload with the new config
    }

    _renderSettings(panel) {
        panel.setTitle?.("Page TOC Settings");
        const el = panel.getElement();
        el.textContent = "";
        const box = document.createElement("div");
        box.className = "ptoc-settings";
        box.innerHTML = `<h2>Page TOC</h2>
            <div class="ptoc-set-sub">Changes preview immediately and are saved when this panel closes.</div>`;
        const rows = [
            ["popup", "Command popup", "Centered keyboard-navigable TOC (\u2318G / palette)"],
            ["rail", "Right rail", "Tick rail with hover card and scroll-spy (\u2303G); hides Thymer's scrollbar"],
            ["sidebar", "Sidebar outline", "\"On this page\" section in the sidebar"],
            ["sticky", "Sticky outline header", "Pins the ancestors (and section headings) of the topmost visible line to the top of the panel"],
        ];
        for (const [key, title, desc] of rows) {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!this._cfg[key];
            cb.addEventListener("change", () => this._applyCfg(key, cb.checked));
            const text = document.createElement("div");
            text.innerHTML = `${title}<span class="ptoc-set-desc">${desc}</span>`;
            label.appendChild(cb);
            label.appendChild(text);
            box.appendChild(label);
        }
        const depthLabel = document.createElement("label");
        const depthInput = document.createElement("input");
        depthInput.type = "number";
        depthInput.min = "0";
        depthInput.step = "1";
        depthInput.style.width = "56px";
        depthInput.value = String(this._cfg.stickyMaxDepth);
        depthInput.addEventListener("change", () => {
            const v = Math.max(0, Math.floor(Number(depthInput.value) || 0));
            depthInput.value = String(v);
            this._cfg.stickyMaxDepth = v;
            this._pendingCfg = { ...(this._pendingCfg || {}), sticky_max_depth: v };
            this._refreshSoon(50);
        });
        const depthText = document.createElement("div");
        depthText.innerHTML = `Sticky depth cap<span class="ptoc-set-desc">Pin only the first N outline levels (0 = unlimited)</span>`;
        depthLabel.appendChild(depthInput);
        depthLabel.appendChild(depthText);
        box.appendChild(depthLabel);

        const note = document.createElement("div");
        note.className = "ptoc-set-note";
        note.textContent = "Saving reloads the plugin once. The popup toggle affects new sessions' palette commands.";
        box.appendChild(note);
        el.appendChild(box);
        this._settingsPanelId = panel.getId?.() ?? null;
    }

    async _openSettings() {
        const p = await this.ui.createPanel({ afterPanel: this.ui.getActivePanel() || undefined });
        if (p) p.navigateToCustomType("settings");
    }

    // The rail stands in for the native scrollbar — hide it only while the rail is on.
    _syncScrollbarStyle() {
        const want = this._cfg.rail;
        const existing = document.getElementById(SCROLLBAR_STYLE_ID);
        if (want && !existing) {
            const st = document.createElement("style");
            st.id = SCROLLBAR_STYLE_ID;
            st.textContent = SCROLLBAR_CSS;
            document.head.appendChild(st);
        } else if (!want && existing) {
            existing.remove();
        }
    }

    // ---- shared model ----

    async _tocFor(rec) {
        const cached = this._model.get(rec.guid);
        if (cached) return cached;
        const headings = [];
        // Flat list is in document order on the live client (proven by margin-notes);
        // recursing into children with a visited-set keeps it pre-order even if not.
        const top = await rec.getLineItems();
        const visited = new Set();
        const walk = async (list) => {
            for (const item of list || []) {
                if (!item || visited.has(item.guid)) continue;
                visited.add(item.guid);
                if (item.type === "heading") {
                    const text = this._segText(item.segments);
                    let hsize = 2;
                    try { hsize = item.getHeadingSize?.() ?? 2; } catch {}
                    if (text) headings.push({ guid: item.guid, text, hsize });
                }
                const kids = await this._childrenOf(item);
                // children arrays are append-only history; parent_guid is the authority.
                await walk((kids || []).filter((k) => k && k.parent_guid === item.guid));
            }
        };
        await walk(top);
        this._model.set(rec.guid, headings);
        return headings;
    }

    async _childrenOf(item) {
        if (typeof item.getChildren === "function") return (await item.getChildren()) || [];
        return Array.isArray(item.children) ? item.children : [];
    }

    // Segment text: a ref segment's `text` is an OBJECT, not a string — {guid, title},
    // or just {guid} for refs that render the target's live name.
    _segText(segs) {
        return (segs || []).map((s) => {
            if (typeof s.text === "string") return s.text;
            if (!s.text) return "";
            if (s.text.title || s.text.name) return s.text.title || s.text.name;
            if (s.text.guid) {
                try { return this.data.getRecord(s.text.guid)?.getName?.() || ""; } catch {}
            }
            return "";
        }).join("").trim();
    }

    // Full outline model for the sticky header. Real tree from parent_guid, then an
    // AUGMENTED tree where headings become virtual parents of the sibling lines
    // that follow them (until a heading of the same-or-bigger size) — so the
    // pinned-stack resolution treats outline levels and heading sections uniformly.
    async _outlineFor(rec) {
        const cached = this._outline.get(rec.guid);
        if (cached) return cached;
        const byGuid = new Map();   // guid -> {guid, text, type, hsize, realDepth, ...}
        const kidsReal = new Map(); // real parentGuid ("" = top level) -> [guid, ...]
        const docOrder = [];        // guids in document order
        const top = await rec.getLineItems();
        const visited = new Set();
        const walk = async (list, parentGuid, depth) => {
            for (const item of list || []) {
                if (!item || visited.has(item.guid)) continue;
                visited.add(item.guid);
                const text = this._segText(item.segments);
                let hsize = 2;
                if (item.type === "heading") {
                    try { hsize = item.getHeadingSize?.() ?? 2; } catch {}
                }
                byGuid.set(item.guid, {
                    guid: item.guid, text, type: item.type || "", hsize,
                    realDepth: depth,
                });
                if (!kidsReal.has(parentGuid)) kidsReal.set(parentGuid, []);
                kidsReal.get(parentGuid).push(item.guid);
                docOrder.push(item.guid);
                const ch = await this._childrenOf(item);
                await walk((ch || []).filter((k) => k && k.parent_guid === item.guid),
                    item.guid, depth + 1);
            }
        };
        await walk(top, "", 0);
        const augKids = new Map();
        const addKid = (p, g) => {
            if (!augKids.has(p)) augKids.set(p, []);
            augKids.get(p).push(g);
        };
        for (const [p, list] of kidsReal) {
            const stack = []; // open heading sections within this sibling group
            for (const g of list) {
                const n = byGuid.get(g);
                if (n.type === "heading")
                    while (stack.length && stack[stack.length - 1].hsize >= n.hsize)
                        stack.pop();
                addKid(stack.length ? stack[stack.length - 1].guid : p, g);
                if (n.type === "heading") stack.push(n);
            }
        }
        docOrder.forEach((g, i) => { byGuid.get(g).docIndex = i; });
        const setDepth = (p, d) => {
            for (const g of augKids.get(p) || []) {
                byGuid.get(g).augDepth = d;
                setDepth(g, d + 1);
            }
        };
        setDepth("", 0);
        const model = { byGuid, augKids, docOrder };
        // a load racing the record's sync returns no items — don't cache emptiness
        if (byGuid.size) this._outline.set(rec.guid, model);
        return model;
    }

    // First line after `node`'s augmented subtree (its scope terminator), as a
    // docOrder index; -1 = the subtree runs to the end of the document.
    _stickyTermIndex(o, node) {
        for (let i = node.docIndex + 1; i < o.docOrder.length; i++)
            if (o.byGuid.get(o.docOrder[i]).augDepth <= node.augDepth) return i;
        return -1;
    }

    _editorPanes() {
        let panels = null;
        try { panels = typeof this.ui.getPanels === "function" ? this.ui.getPanels() : null; } catch {}
        if (!Array.isArray(panels) || !panels.length) {
            const p = this.ui.getActivePanel?.();
            panels = p ? [p] : [];
        }
        const panes = [];
        for (const p of panels) {
            let rec = null, el = null, active = false;
            try { rec = p.getActiveRecord?.() || null; } catch {}
            if (!rec) continue;
            try { el = p.getElement?.() || null; } catch {}
            try { active = !!p.isActive?.(); } catch {}
            panes.push({ rec, recGuid: rec.guid, el, active });
        }
        if (panes.length > 1 && panes.some((p) => !p.el))
            return panes.filter((p) => p.el || p.active);
        return panes;
    }

    // ---- jump (shared) ----

    _jump(scopeEl, guid, topOffset = 90) {
        const scope = scopeEl || document;
        const row = scope.querySelector(`.listitem[data-guid="${guid}"]`);
        if (!row) {
            this.ui.addToaster({
                message: "Heading isn't rendered — inside a collapsed section?",
                autoDestroyTime: 2500,
            });
            return false;
        }
        const scroller = row.closest(".panel-scroller-y");
        if (scroller) {
            const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
                + scroller.scrollTop;
            scroller.scrollTo({ top: Math.max(0, top - topOffset), behavior: "smooth" });
        } else {
            row.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        this._flash(scope, guid);
        return true;
    }

    // The row keeps moving while the smooth scroll animates, so the flash re-anchors
    // to the row's rect every frame for its whole lifetime instead of snapshotting.
    _flash(scope, guid) {
        const f = document.createElement("div");
        f.className = "ptoc-flash";
        document.body.appendChild(f);
        const t0 = performance.now();
        const track = () => {
            if (!f.isConnected) return;
            const row = (scope || document).querySelector(`.listitem[data-guid="${guid}"]`);
            if (row) {
                const r = row.getBoundingClientRect();
                Object.assign(f.style, {
                    left: `${r.left}px`, top: `${r.top}px`,
                    width: `${r.width}px`, height: `${r.height}px`,
                });
            }
            const age = performance.now() - t0;
            if (age > 700) f.style.opacity = "0"; // fade only after the scroll has settled
            if (age > 1600) f.remove();
            else requestAnimationFrame(track);
        };
        requestAnimationFrame(track);
    }

    // ---- refresh loop ----

    _refreshSoon(ms) {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this._refresh(), ms);
    }

    async _refresh() {
        // a re-render can orphan the keyboard-mode rail — never leave it stuck
        if (this._kb && !this._kb.rail.isConnected) this._closeRailKb();
        const panes = this._editorPanes();
        for (const pane of panes) {
            pane.toc = await this._tocFor(pane.rec);
            if (this._cfg.sticky) pane.outline = await this._outlineFor(pane.rec);
        }
        this._panes = panes;
        this._resizeObs?.disconnect();
        for (const pane of panes) {
            const panelEl = pane.el?.closest?.(".panel") || pane.el;
            if (panelEl) this._resizeObs?.observe(panelEl);
        }
        this._renderRails(panes);
        this._renderSticky(panes);
        this._renderSidebarSoon();
        this._ensureActionButtons();
    }

    _scheduleReposition() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => { this._rafPending = false; this._reposition(); });
    }

    _reposition() {
        if (!this._panes) return;
        // run scroll-spy every frame (even with the rail off) so the sidebar's
        // active highlight updates immediately, not on the slow tick
        let changed = false;
        for (const pane of this._panes) {
            const prev = this._activeByRec.get(pane.recGuid);
            if (this._scrollSpy(pane) !== prev) changed = true;
        }
        this._renderRails(this._panes);
        this._renderSticky(this._panes);
        if (changed) this._renderSidebarSoon();
    }

    // ---- 1) POPUP ----

    _openPopup() {
        if (!this._cfg.popup) return;
        this._closePopup();
        const pane = (this._panes || this._editorPanes()).find((p) => p.active)
            || (this._panes || [])[0];
        if (!pane) {
            this.ui.addToaster({ message: "Page TOC: no page open", autoDestroyTime: 2000 });
            return;
        }
        this._tocFor(pane.rec).then((toc) => {
            if (!toc.length) {
                this.ui.addToaster({ message: "Page TOC: no headings on this page", autoDestroyTime: 2000 });
                return;
            }
            this._prevFocus = document.activeElement;
            const root = document.createElement("div");
            root.id = POPUP_ID;
            const card = document.createElement("div");
            card.className = "ptoc-card";
            let pageName = "";
            try { pageName = pane.rec.getName?.() || ""; } catch {}
            if (pageName) {
                const t = document.createElement("div");
                t.className = "ptoc-popup-title";
                t.textContent = pageName;
                card.appendChild(t);
            }
            const input = document.createElement("input");
            input.placeholder = "Jump to heading…";
            input.spellcheck = false;
            const list = document.createElement("div");
            list.className = "ptoc-list";
            card.appendChild(input);
            card.appendChild(list);
            root.appendChild(card);

            let filtered = toc, sel = 0;
            const render = () => {
                list.textContent = "";
                if (!filtered.length) {
                    const d = document.createElement("div");
                    d.className = "ptoc-empty";
                    d.textContent = "No matching headings";
                    list.appendChild(d);
                    return;
                }
                filtered.forEach((h, i) => {
                    const d = document.createElement("div");
                    d.className = `ptoc-item ptoc-h${Math.min(h.hsize, 6)}`
                        + (i === sel ? " ptoc-sel" : "");
                    d.textContent = h.text;
                    d.addEventListener("click", () => go(h));
                    d.addEventListener("mousemove", () => {
                        if (sel !== i) { sel = i; render(); }
                    });
                    list.appendChild(d);
                });
                list.children[sel]?.scrollIntoView({ block: "nearest" });
            };
            const go = (h) => {
                this._closePopup();
                this._jump(pane.el, h.guid);
            };
            input.addEventListener("input", () => {
                const q = input.value.trim().toLowerCase();
                filtered = q ? toc.filter((h) => h.text.toLowerCase().includes(q)) : toc;
                sel = 0;
                render();
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % (filtered.length || 1); render(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + (filtered.length || 1)) % (filtered.length || 1); render(); }
                else if (e.key === "Enter") { e.preventDefault(); if (filtered[sel]) go(filtered[sel]); }
                else if (e.key === "Escape") { e.preventDefault(); this._closePopup(); }
            });
            root.addEventListener("mousedown", (e) => {
                if (e.target === root) this._closePopup();
            });
            document.body.appendChild(root);
            this._popup = root;
            render();
            input.focus();
        });
    }

    _closePopup() {
        if (!this._popup) return;
        this._popup.remove();
        this._popup = null;
        try { this._prevFocus?.focus?.(); } catch {}
        this._prevFocus = null;
    }

    // Hidden per-panel button so a custom shortcut ("plugin.toc": "Key+Combo") can
    // dispatch — the shortcut system clicks [data-action] inside the FOCUSED panel only.
    _ensureActionButtons() {
        const actions = [];
        if (this._cfg.popup) actions.push([ACTION, () => this._openPopup()]);
        if (this._cfg.rail) actions.push([RAIL_ACTION, () => this._openRailKb()]);
        for (const pane of this._panes || []) {
            if (!pane.el || !pane.el.isConnected) continue;
            for (const [action, handler] of actions) {
                if (pane.el.querySelector(`[data-action="${action}"]`)) continue;
                const b = document.createElement("button");
                b.className = "ptoc-action";
                b.setAttribute("data-action", action);
                b.style.display = "none";
                b.addEventListener("click", handler);
                pane.el.appendChild(b);
            }
        }
    }

    // ---- rail keyboard mode ----

    _openRailKb() {
        if (!this._cfg.rail) return;
        if (this._kb) { this._closeRailKb(); return; } // shortcut acts as a toggle
        const pane = (this._panes || this._editorPanes()).find((p) => p.active)
            || (this._panes || [])[0];
        if (!pane || !(pane.toc || []).length) {
            this.ui.addToaster({ message: "Page TOC: no headings on this page", autoDestroyTime: 2000 });
            return;
        }
        this._renderRails(this._panes);
        const rail = this._railsRoot?.querySelector(`.ptoc-rail[data-rec="${pane.recGuid}"]`);
        const card = rail?.querySelector(".ptoc-card");
        if (!card) return;
        const items = [...card.querySelectorAll(".ptoc-item")];
        let sel = Math.max(0, (pane.toc || []).findIndex(
            (h) => h.guid === this._activeByRec.get(pane.recGuid)));
        const apply = () => {
            items.forEach((el, i) => el.classList.toggle("ptoc-sel", i === sel));
            items[sel]?.scrollIntoView({ block: "nearest" });
        };
        const onKey = (e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); sel = (sel + 1) % items.length; apply(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); sel = (sel - 1 + items.length) % items.length; apply(); }
            else if (e.key === "Enter") {
                e.preventDefault(); e.stopPropagation();
                const h = pane.toc[sel];
                this._closeRailKb();
                if (h) this._jump(pane.el, h.guid);
            } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this._closeRailKb(); }
        };
        rail.classList.add("ptoc-kb");
        // Thymer reclaims focus after the shortcut dispatch, so don't fight it:
        // intercept keys at WINDOW capture phase (ahead of Thymer's document
        // handlers, so Escape works even with the editor focused), and treat any
        // click outside the card as dismissal so the mode can't get stuck.
        const onDown = (e) => { if (!card.contains(e.target)) this._closeRailKb(); };
        this._kb = { rail, card, onKey, onDown };
        window.addEventListener("keydown", onKey, { capture: true });
        window.addEventListener("pointerdown", onDown, { capture: true });
        apply();
    }

    // hide the hover card until the pointer leaves the rail
    _suppressHover(rail) {
        rail.classList.add("ptoc-nohover");
        rail.addEventListener("mouseleave", () => rail.classList.remove("ptoc-nohover"), { once: true });
    }

    _closeRailKb() {
        if (!this._kb) return;
        const { rail, card, onKey, onDown } = this._kb;
        window.removeEventListener("keydown", onKey, { capture: true });
        window.removeEventListener("pointerdown", onDown, { capture: true });
        rail.classList.remove("ptoc-kb");
        card.querySelectorAll(".ptoc-sel").forEach((el) => el.classList.remove("ptoc-sel"));
        this._kb = null;
        // if the pointer is resting over the rail, :hover would instantly re-expand
        // the card — suppress hover until the mouse actually leaves
        if (rail.matches(":hover")) this._suppressHover(rail);
        this._refreshSoon(50);
    }

    // ---- 2) RAIL ----

    _renderRails(panes) {
        if (!this._railsRoot) return;
        // Don't rebuild under the pointer — it would collapse the hovered card.
        if (this._kb) return;
        if (this._railsRoot.querySelector(".ptoc-rail:hover")) return;
        this._railsRoot.textContent = "";
        if (!this._cfg.rail) return;
        for (const pane of panes || []) {
            const toc = pane.toc || [];
            if (toc.length < this._cfg.minHeadings || !pane.el?.isConnected) continue;
            const panelEl = pane.el.closest(".panel") || pane.el;
            const pr = panelEl.getBoundingClientRect();
            if (!pr.width || !pr.height) continue;
            const activeGuid = this._scrollSpy(pane);
            const rail = document.createElement("div");
            rail.className = "ptoc-rail";
            rail.dataset.rec = pane.recGuid;
            Object.assign(rail.style, {
                left: `${pr.right - 240 - 6}px`,
                width: "240px",
                alignItems: "flex-end",
                top: `${pr.top + 70}px`,
                height: `${Math.max(0, pr.height - 140)}px`,
                pointerEvents: "none",
            });

            const ticks = document.createElement("div");
            ticks.className = "ptoc-ticks";
            ticks.style.pointerEvents = "auto";
            const card = document.createElement("div");
            card.className = "ptoc-card";
            card.style.pointerEvents = "auto";
            for (const h of toc) {
                const t = document.createElement("div");
                t.className = "ptoc-tick" + (h.guid === activeGuid ? " ptoc-active" : "");
                t.style.width = "16px";
                ticks.appendChild(t);

                const d = document.createElement("div");
                d.className = `ptoc-item ptoc-h${Math.min(h.hsize, 6)}`
                    + (h.guid === activeGuid ? " ptoc-active" : "");
                d.textContent = h.text;
                d.addEventListener("click", () => this._jump(pane.el, h.guid));
                card.appendChild(d);
            }
            rail.appendChild(ticks);
            rail.appendChild(card);
            this._railsRoot.appendChild(rail);
        }
    }

    // Last heading whose row top is above the fold line (~140px into the scroller).
    _scrollSpy(pane) {
        const scroller = pane.el?.querySelector(".panel-scroller-y")
            || pane.el?.closest(".panel-scroller-y");
        if (!scroller) return null;
        const foldY = scroller.getBoundingClientRect().top + 140;
        let active = null;
        for (const h of pane.toc || []) {
            const row = pane.el.querySelector(`.listitem[data-guid="${h.guid}"]`);
            if (!row) continue;
            if (row.getBoundingClientRect().top <= foldY) active = h.guid;
            else break;
        }
        this._activeByRec.set(pane.recGuid, active);
        return active;
    }

    // ---- 4) STICKY HEADER ----

    _renderSticky(panes) {
        const root = this._stickyRoot;
        if (!root) return;
        if (!this._cfg.sticky) {
            if (root.childElementCount) root.textContent = "";
            return;
        }
        const seen = new Set();
        for (const pane of panes || []) {
            if (!pane.outline || !pane.el?.isConnected) continue;
            this._renderStickyPane(pane);
            seen.add(pane.recGuid);
        }
        for (const el of [...root.children])
            if (!seen.has(el.dataset.rec)) el.remove();
    }

    // CSS-sticky emulation (RemNote semantics): walking the augmented tree top-down,
    // a node PINS the moment its row top reaches its slot in the bar (it "docks" —
    // visually freezing in place), stays while its subtree spans the slot line, and
    // is PUSHED OUT pixel-by-pixel by its terminator (the next line outside its
    // subtree) — offset = min(0, terminatorTop - slotBottom). Leaves never pin;
    // they just slide under the bar edge.
    _renderStickyPane(pane) {
        const root = this._stickyRoot;
        let bar = root.querySelector(`.ptoc-bar[data-rec="${pane.recGuid}"]`);
        const scroller = pane.el.querySelector(".panel-scroller-y")
            || pane.el.closest(".panel-scroller-y");
        const sr = scroller?.getBoundingClientRect();
        if (!sr || !sr.width || !sr.height) { bar?.remove(); return; }
        // Sit BELOW Thymer's own sticky "<Collection> / <Page>" strip inside the
        // scroller, so the bar reads as part of the editor content.
        const nativeBar = scroller.querySelector(".panel-bar--tabsbar");
        const nbr = nativeBar?.getBoundingClientRect();
        const barTop = nbr && nbr.height ? nbr.bottom : sr.top;
        const o = pane.outline;
        const rowEls = [...pane.el.querySelectorAll(".listitem[data-guid]")];
        // outline loaded before the record synced → rows exist but model is empty;
        // debounced re-refresh picks up the real content
        if (!o.byGuid.size) {
            bar?.remove();
            if (rowEls.length) this._refreshSoon(300);
            return;
        }
        if (!rowEls.length) { bar?.remove(); return; }

        const rowByGuid = new Map();
        for (const el of rowEls) rowByGuid.set(el.getAttribute("data-guid"), el);
        const firstIdx = o.byGuid.get(rowEls[0].getAttribute("data-guid"))?.docIndex ?? 0;
        const lastIdx = o.byGuid.get(rowEls[rowEls.length - 1].getAttribute("data-guid"))?.docIndex
            ?? o.docOrder.length - 1;
        // row top; missing rows resolve by document position (virtualization),
        // null = unknowable (collapsed away)
        const topOf = (guid) => {
            const el = rowByGuid.get(guid);
            if (el) return el.getBoundingClientRect().top;
            const n = o.byGuid.get(guid);
            if (!n) return null;
            if (n.docIndex < firstIdx) return -1e9;
            if (n.docIndex > lastIdx) return 1e9;
            return null;
        };

        // crumb height/typography copied from the real row so pinned text renders
        // at outline size; single text line = the row's computed line-height
        const metricsOf = (guid) => {
            const row = rowByGuid.get(guid);
            // the row element reports 15px even for headings — real typography
            // lives on the inner span.lineitem-text
            const el = row?.querySelector(".lineitem-text") || row;
            if (!el) return { h: STICKY_ROWH, fs: "", lh: `${STICKY_ROWH}px` };
            const cs = getComputedStyle(el);
            let lh = parseFloat(cs.lineHeight);
            if (!lh || Number.isNaN(lh)) lh = (parseFloat(cs.fontSize) || 16) * 1.45;
            return { h: Math.ceil(lh) + 2, fs: cs.fontSize, lh: `${Math.ceil(lh) + 2}px` };
        };

        // Mirror the editor's indentation EXACTLY: measure the rendered row's text
        // left edge. Fallback for rows virtualized out of the DOM: the editor
        // indents 30px per real-tree level, and non-heading rows sit a further
        // 8px in (their bullet occupies that gap).
        const baseLeft = rowEls[0].getBoundingClientRect().left;
        const indentOf = (guid) => {
            const t = rowByGuid.get(guid)?.querySelector(".lineitem-text");
            if (t) return Math.max(0, Math.round(t.getBoundingClientRect().left - baseLeft));
            const n = o.byGuid.get(guid);
            return (n?.realDepth || 0) * 30 + (n?.type === "heading" ? 0 : 8);
        };

        let y = barTop + STICKY_PADV / 2;
        let level = o.augKids.get("") || [];
        const cap = this._cfg.stickyMaxDepth; // 0 = unlimited
        const chain = []; // {n, top, off, m: {h, fs, lh}}
        for (let guard = 0; guard < 100; guard++) {
            // depth cap = show only the FIRST cap levels; deeper ones never pin,
            // so the bar geometry needs no special truncation handling
            if (cap > 0 && chain.length >= cap) break;
            let cand = null;
            for (const guid of level) {
                const t = topOf(guid);
                if (t === null) continue;
                if (t > y) break; // doc order — later siblings are lower on screen
                cand = o.byGuid.get(guid);
            }
            if (!cand) break;
            if (!(o.augKids.get(cand.guid) || []).length) break; // leaf — slides under
            const ti = this._stickyTermIndex(o, cand);
            const termT = ti < 0 ? 1e9 : (topOf(o.docOrder[ti]) ?? 1e9);
            if (termT <= y) break; // subtree already fully above the slot
            const m = metricsOf(cand.guid);
            const off = Math.min(0, termT - (y + m.h));
            chain.push({ n: cand, top: y + off, off, m });
            y += m.h + off;
            level = o.augKids.get(cand.guid) || [];
        }

        if (!chain.length) { bar?.remove(); return; }

        const display = chain.map((c) => ({
            guid: c.n.guid, n: c.n, top: c.top, m: c.m, ind: indentOf(c.n.guid),
        }));
        const barH = (y + STICKY_PADV / 2) - barTop;

        if (!bar) {
            bar = document.createElement("div");
            bar.className = "ptoc-bar";
            bar.dataset.rec = pane.recGuid;
            root.appendChild(bar);
        }
        // seamless: use the editor's real computed background (custom CSS themes
        // the content area; the generic panel token can differ from it)
        let bg = "";
        for (let el = rowEls[0]; el && el !== document.documentElement; el = el.parentElement) {
            const c = getComputedStyle(el).backgroundColor;
            if (c && c !== "transparent" && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c)) {
                bg = c;
                break;
            }
        }
        Object.assign(bar.style, {
            left: `${sr.left}px`, top: `${barTop}px`, width: `${sr.width}px`,
            height: `${barH}px`,
        });
        if (bg) bar.style.setProperty("--ptoc-bg", bg);

        // metrics are part of the key: a rebuild during a Thymer re-render can read
        // degraded rows (no .lineitem-text yet) — recovering metrics must re-render
        const key = display.map((d) => `${d.guid}:${d.m.h}:${d.m.fs}:${d.ind}`).join("|");
        if (bar.dataset.key !== key) {
            bar.dataset.key = key;
            bar.textContent = "";
            // Rows all share rect.left — the indent is an inline margin-left (30px
            // steps) on an inner element. Baseline = any rendered row's left edge.
            const basePad = Math.max(0, baseLeft - sr.left);
            const prefixH = []; // total crumb height above display[i]
            display.reduce((acc, d, i) => { prefixH[i] = acc; return acc + d.m.h; }, 0);
            // deepest first: during a push the deeper crumb slides UNDER the shallower
            for (let i = display.length - 1; i >= 0; i--) {
                const d = display[i];
                const el = document.createElement("div");
                el.dataset.guid = d.guid;
                Object.assign(el.style, {
                    height: `${d.m.h}px`, lineHeight: d.m.lh,
                    ...(d.m.fs ? { fontSize: d.m.fs } : {}),
                });
                const isHeading = d.n.type === "heading";
                el.className = "ptoc-crumb" + (isHeading ? " ptoc-crumb-h" : "");
                // crumb text starts exactly where the row's text starts; the dot
                // sits absolutely in the bullet gap so it never pushes the text
                el.style.paddingLeft = `${basePad + d.ind}px`;
                if (!isHeading) {
                    const dot = document.createElement("span");
                    dot.className = "ptoc-dot";
                    dot.textContent = "●";
                    dot.style.left = `${basePad + d.ind - 14}px`;
                    el.appendChild(dot);
                }
                el.appendChild(document.createTextNode(d.n.text || "…"));
                el.title = d.n.text || "";
                // refocus the clicked line at the top of the editor, just below
                // the crumbs (its ancestors) that will pin above it
                const slotOffset = (barTop - sr.top) + STICKY_PADV / 2 + prefixH[i] + 4;
                el.addEventListener("click", () => this._jump(pane.el, d.guid, slotOffset));
                bar.appendChild(el);
            }
        }
        // per-frame updates (docking/pushing move crumbs without a rebuild);
        // crumbs truncate at the editor content's right edge, not the panel's
        const contentRight = rowEls[0].getBoundingClientRect().right;
        const rightOff = Math.max(0, Math.round(sr.right - contentRight));
        for (const el of bar.children) {
            const d = display.find((x) => x.guid === el.dataset.guid);
            if (!d) continue;
            el.style.top = `${d.top - barTop}px`;
            el.style.right = `${rightOff}px`;
        }
    }

    // ---- 3) SIDEBAR WIDGET ----

    _mountSidebar() {
        if (this._sidebar) return;
        this._sidebar = this.ui.addSidebarWidget((container) => {
            this._sidebarContainer = container;
            this._fillSidebar(container);
            return () => { if (this._sidebarContainer === container) this._sidebarContainer = null; };
        });
    }

    _renderSidebarSoon() {
        if (!this._sidebar || !this._sidebarContainer) return;
        clearTimeout(this._sidebarTimer);
        this._sidebarTimer = setTimeout(() => {
            if (this._sidebarContainer) this._fillSidebar(this._sidebarContainer);
        }, 100);
    }

    async _fillSidebar(container) {
        // getActiveRecord() is null when the window is unfocused — keep the last page
        // rather than blanking the widget.
        const pane = (this._panes || this._editorPanes()).find((p) => p.active)
            || (this._panes || [])[0];
        if (pane) this._lastSidebarRec = pane;
        const target = pane || this._lastSidebarRec;
        container.textContent = "";
        const box = document.createElement("div");
        box.className = "ptoc-side";
        const title = document.createElement("div");
        title.className = "ptoc-side-title";
        title.textContent = "On this page";
        box.appendChild(title);
        if (!target) {
            const d = document.createElement("div");
            d.className = "ptoc-empty";
            d.textContent = "No page open";
            box.appendChild(d);
        } else {
            const toc = await this._tocFor(target.rec);
            const activeGuid = this._activeByRec.get(target.recGuid) || null;
            if (toc.length < this._cfg.minHeadings) {
                const d = document.createElement("div");
                d.className = "ptoc-empty";
                d.textContent = "No headings";
                box.appendChild(d);
            }
            for (const h of toc) {
                const d = document.createElement("div");
                d.className = `ptoc-item ptoc-h${Math.min(h.hsize, 6)}`
                    + (h.guid === activeGuid ? " ptoc-active" : "");
                d.textContent = h.text;
                d.addEventListener("click", () => this._jump(target.el, h.guid));
                box.appendChild(d);
            }
        }
        container.appendChild(box);
    }
}

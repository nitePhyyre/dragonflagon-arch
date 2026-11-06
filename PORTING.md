# DF Architect — Foundry v14 compatibility fork

Fork of [flamewave000/dragonflagon-arch](https://github.com/flamewave000/dragonflagon-arch),
BSD 3-Clause (see `LICENSE`, retained unchanged). Branch `v14`, based on the
`df-architect_5.0.0` tag, whose `src/` is byte-identical to the released 5.0.0 build except for
line endings.

The module id stays `df-architect` so existing world/client settings keep working. `manifest`
and `download` were removed from `module.json` on purpose — leaving the upstream URLs in place
would let Foundry "update" this fork back to the v12 release and overwrite it.

## Why the fork exists

Upstream is verified for Foundry 12.331. On 14.369 it threw continuously from core's render loop:

```
Uncaught TypeError: Cannot set properties of undefined (setting 'tint')
    at AmbientLight._refreshState (foundry.mjs:195306)
```

`src/lights/AltLightOrigin.mjs` registered a libWrapper **OVERRIDE** on
`AmbientLight.prototype._draw` carrying the v12 body: it assigned `this.controlIcon` and never
`this.controls`. v13 replaced the light's `ControlIcon` with an `AmbientLightShapeControls`
container at `AmbientLight#controls`. The override completed without throwing, so
`PlaceableObject#draw` set its private `#drawn` flag and every subsequent `refreshState` flag
died on `this.controls.tint`, once per ticker frame.

## Status

### Ported (read against core 14.369 source; **none of it is runtime-tested yet**)

| File | Change |
| --- | --- |
| `lights/AltLightOrigin.mjs` | Rewritten. The `_draw` OVERRIDE is now a WRAPPER that adds a `PIXI.Graphics` crosshair child; a WRAPPER on `_refreshState` draws it and hides core's `controls` while it is up. The `ControlIcon` subclass and its instance registry are gone. Also fixes a latent bug: the old key listeners were added with a fresh `.bind(this)` each time, so `removeEventListener` never removed anything. |
| `general/ShowLayerControls.mjs` | Scene controls migrated to records. `x.controlIcon.visible = true` replaced by a `showWidget` helper — lights expose `controls`, sounds still expose `controlIcon`. `Wall#updateSource` → `Wall#initializeEdge`. |
| `general/AltGridSnap.mjs` | Scene controls migrated to records. The "place on control bar" button is rebuilt against the ApplicationV2 layer bar (`[data-application-part="layers"] menu`, `aria-pressed`) instead of `ol#controls > li` and an `active` class. `ui.controls.initialize()` → `render({reset: true})`. |
| `walls/WallJoinSplit.mjs`, `walls/WallGapFiller.mjs`, `walls/WallCtrlInvert.mjs` | Scene control tools migrated to records with explicit `order` (9.1 split, 9.2 join, 9.3 wall-gaps, 9.4 ctrlInvert — between core's last wall preset `window` at 9 and its `snap` toggle at 10). `onClick` → `onChange`. |
| `walls/WallChangeType.mjs` | Rewritten. `SceneControls#_onClickTool` no longer exists, and wall types are now `button` tools, so it listens for clicks on the controls element and reads the clicked preset's `createData` instead of calling the removed `WallsLayer#_getWallDataFromActiveTool`. |
| `walls/WallShortcuts.mjs` | Rewritten. Wall-type tool names updated (`walls` → `solid`); shortcuts click the real tool button so core's own delegated handler runs; `canvas.walls._forceSnap` → `canvas.forceSnapVertices`; `event.data.originalEvent.shiftKey` → `event.shiftKey`; the dead `document.data[key]` poke replaced with `preview.document.updateSource(createData)`. |
| `general/LayerShortcuts.mjs` | `ui.controls.activeControl` → `ui.controls.control?.name`. |
| `core/CounterUI.mjs` | `Sidebar#_collapsed` → `Sidebar#expanded`. |
| all `src/*.mjs` | `String.prototype.localize` was **removed in v14** (only `capitalize`, `compare`, `titleCase`, `stripDiacritics`, `stripScripts`, `slugify` remain). 63 call sites rewritten to `game.i18n.localize(...)`, and the now-false ambient declaration dropped from `src/global.d.ts`. |

### Known still broken

1. **`walls/WallCtrlInvert.mjs` — the actual inversion is dead.** It works by wrapping
   `KeyboardManager#isModifierActive` and flipping the CONTROL key in `game.keyboard.downKeys`.
   v14's wall drag handlers no longer ask the keyboard manager: `client/canvas/layers/walls.mjs:536`
   reads `event.ctrlKey || event.metaKey` straight off the event. The scene-control toggle is
   ported and the wrapper no longer errors, but it changes nothing. Needs a redesign that
   intercepts the drag event (or `WallsLayer#_chain`) instead.
2. **Config-sheet injection is unported.** `tiles/TileConfigExt.mjs`, `lights/AltLightInverted.mjs`
   and `general/QuickColourPicker.mjs` all run off `renderTileConfig` /
   `renderAmbientLightConfig` and use jQuery (`html.find(...)`). Those sheets are ApplicationV2
   from v13, so the hook now hands over an `HTMLElement` — `html.find` throws. Their selectors
   also target v12 markup and need re-checking against the current sheets.
3. **`core/CounterUI.mjs` is still ApplicationV1** (`extends Application`, `this.element.find`,
   `html[0]`). AppV1 survives in v14 (`client/appv1/`, deprecated since v13, removal targeted at
   v16) so this is not urgent, but it is on the clock. Line 115 also contains a pre-existing bug
   from the author's TypeScript migration: `document.querySelector < HTMLElement > ('div.fpsCounter')`
   is parsed as two comparisons and evaluates to a boolean.
4. **`Dialog` usages** in `core/architect.mjs` and `walls/WallGapFiller.mjs` are AppV1 — same
   clock as above.
5. **Unaudited:** `core/settings.mjs`, `core/migration.mjs`, `core/declarations.mjs`,
   `core/libWrapperShared.mjs`, `walls/WallCounter.mjs`, `walls/WallDirections.mjs`,
   `walls/WallAltDrop.mjs`, `tiles/TileCounter.mjs`, `lights/LightCounter.mjs`,
   `sounds/SoundCounter.mjs`, `general/PIXIAppOverride.mjs`. Only the `.localize()` sweep touched
   them. (`PIXIAppOverride` was read and looks harmless.)

### Not part of the fork

`src/general/CaptureGameScreen.mjs`, `src/general/capture/*.mjs`, `src/lights/LightTemplate.mjs`,
`src/tiles/TileFlattener*.mjs` are TypeScript-in-`.mjs` leftovers from the author's unfinished v12
migration. They are not listed in `module.json` and do not parse as JavaScript, so they never
load. Left exactly as upstream has them, including the `.localize()` sweep being reverted on them.

## v14 API notes gathered while porting

- Legacy globals (`AmbientLight`, `Wall`, `WallsLayer`, `SceneControls`, `Sidebar`, …) still
  resolve via `addBackwardsCompatibilityReferences` in `client/client.mjs`, deprecated since v13.
  libWrapper string targets therefore still work.
- **PIXI is still 7.4.3** in v14 — no PIXI 8 migration needed.
- `getSceneControlButtons` now receives `Record<string, SceneControl>`; `SceneControl#tools` is
  likewise a record. Both sort by numeric `order` (fractional and negative values are fine).
  Tool callbacks are `onChange(event, active)`.
- `SceneControls`: use `ui.controls.control` (object), `.controls`, `.tools`, `.tool`, and
  `activate({control, tool, toggles, event})`. `activeControl` / `activeTool` / `initialize()` are
  deprecated until v15. `_onClickTool` is gone; `button: true` tools bypass `activate` entirely.
- `PlaceableObject#applyRenderFlags` returns early unless the private `#drawn` flag is set, so a
  plain draw/refresh race cannot throw — an unguarded field access in `_refreshState` means
  something replaced `_draw`.
- `RenderFlags extends Set`; use `renderFlags.set({...})`. Assigning `renderFlags.foo = true` just
  adds an own property and registers nothing.
- Removed/moved: `String.prototype.localize`, `WallsLayer#_forceSnap` (→ `canvas.forceSnapVertices`),
  `WallsLayer#_getWallDataFromActiveTool` (→ the preset tool's `createData`), `Wall#updateSource`
  (→ `Wall#initializeEdge`), `Sidebar#_collapsed` (→ `Sidebar#expanded`),
  `AmbientLight#controlIcon` (→ `AmbientLight#controls`).

## Installing this fork for testing

It has to replace the installed copy — two modules cannot share the id `df-architect`. Back up
first:

```powershell
$data = "$env:LOCALAPPDATA\FoundryVTT\Data\modules"
Move-Item "$data\df-architect" "$data\df-architect.v12-backup"
Copy-Item -Recurse "$HOME\GitHub\dragonflagon-arch" "$data\df-architect"
```

Then hard-reload Foundry (ctrl+shift+r) — soft reloads serve cached `.mjs`. To go back, delete
`$data\df-architect` and rename the backup.

The `.git` directory comes along with that copy, which Foundry ignores. There is intentionally no
build step: upstream keeps `module.json` as a `doit`-filled template (`{{sources}}`, `{{css}}`) and
ships only SCSS, so the fork baseline commit materialized the concrete 5.0.0 manifest and the
compiled CSS. Edit `css/*.scss` and `css/*.css` together, or re-run `sass`.

# Verification log

## Batch 1 — steps 01–05 · ✅ PASSED 2026-09-01

Run in full against After Effects. No divergences, nothing to fix. Steps 01–05
are confirmed at parity with the shipped build. Kept as the record of what was
checked; new entries append below.

---

# Batch 1 (passed) — steps 01–05

One sitting at the machine, grouped so you set up each project once. **Run in
order.** Runs A–C are front-loaded because a failure there invalidates
everything after them.

Mark each `[x]` as it passes. On a failure, note what you actually saw — the
detail matters more than the pass.

**Blocker key**
- 🛑 **Blocker** — stop, report, fix before step 06.
- ⚠️ **Carry forward** — note it and keep going; isolated to its own feature.

**Standing rules**
- **Reopen the project** (don't just undo) before any run that rewrites Time
  Remap. Runs C and D both do.
- **Press Cmd+Z with After Effects focused, not the panel.** The shipped panel
  forwarded Cmd+Z to AE via `app.executeCommand(16)`; that is a known gap with
  its own commit queued after parity, not a failure of the step under test.
- Both panels can be installed at once — different extension IDs, both under
  Window > Extensions.

**Shared state** — *corrected after batch 2; see L0 in batch 3.* Only one of
these is genuinely shared between the two panels:

- **Shared:** the Twixtor `.ffx` path — `app.settings`, section `ValencyMotion`, key
  `presetPath`. That is After Effects state, not browser state, so both panels
  read and write the same value. Changing the preset in one **does** change it
  in the other.
- **Probably not shared:** everything in `localStorage`, including graph
  favourites (`graph-favorites-sandbox`) and the splitter height
  (`graph-top-height`). The panels have different extension IDs and therefore
  different origins. They use the same key *names*, in what are most likely
  separate stores.

So if an A/B comparison disagrees, the Twixtor preset path is the one worth
checking first. A difference in favourites or panel layout between the two
panels is expected, not a symptom.

---

## ✅ Run A — Wiring sweep 🛑

**Setup:** new panel open, **no composition open at all.** No other setup.

This is two checks at once: every control is actually wired, and every no-comp
guard path reports. A handler that renders but isn't bound throws nothing and
just does nothing, so the only way to catch it is to click it.

**Steps — click every one of these, in the new panel:**

| Tab | Controls |
|-----|----------|
| Twixtor | Analyze, Del KF, Align, `.ffx` (then cancel the dialog), Easy Ease, Graph 1–6 |
| Graph | APPLY, ★, System, Favorites, any preset tile |
| Render | Remove Unused Footage, Organize |
| Theme | tab opens (placeholder until step 09) |

**Correct:** every button that reaches the host puts a readable message in the
panel — "Select a composition first." for most. Preset tiles animate the curve
over ~350ms. ★ toggles gold. System/Favorites switch. **No control does
nothing, and no `alert()` dialog appears anywhere.**

**A failure means:** a dead handler — the control rendered but was never bound.
🛑 Blocker: the same wiring pattern is reused by every remaining step, so a
break here means step 06 would repeat it.

## ✅ Run B — Dialog suppression checkpoint 🛑

Do this **immediately after Run A**, before anything else. Worse than an undo
leak: a suppression that never unwinds makes After Effects swallow *every*
dialog until it is restarted, which would silently invalidate every check below.

Run A already fired the Twixtor guard paths, which is where the old code
suppressed dialogs before validating.

**Steps:** in After Effects, do something that must raise a dialog — File >
Close Project on an unsaved project, or open Composition Settings.

**Correct:** the dialog appears normally.

**A failure means:** the `endSuppressDialogs` unwind was skipped. 🛑 Blocker —
**restart After Effects immediately**, report it, and treat every check you ran
after Run A as void.

## ✅ Run C — Duplicate frame parity 🛑

**Setup:** real footage with actual duplicated frames — `sampleImage` needs
pixels, a solid proves nothing. One comp, one layer, used for all four runs.

`tools/dump-timeremap.jsx` is read-only. **File > Scripts > Run Script File…**
with exactly one layer selected. It prints layer name, comp fps, in/out point,
startTime, stretch, key count, and every key time and value to 6 decimals, and
offers to save to `.txt`.

**Reopen the project between every run.** The operation is destructive; without
a reset, run 2 compounds on run 1.

| # | Panel | Detect Small Movement | Dump to |
|---|-------|-----------------------|---------|
| 1 | shipped `.zxp` | off | `old-off.txt` |
| 2 | new panel | off | `new-off.txt` |
| 3 | shipped `.zxp` | on | `old-on.txt` |
| 4 | new panel | on | `new-on.txt` |

**While run 2 is going,** watch the panel: the button should read "Analyzing…"
and be disabled, and the note under it should brighten to "Working — After
Effects is frozen." That confirms `evalScript` is async as expected. If the
panel visibly freezes and neither ever appears, note it — the assumption was
verified by construction, not observed.

**Correct:** `diff old-off.txt new-off.txt` and `diff old-on.txt new-on.txt`
are both empty. `outPoint` is rewritten by the operation and is in the dump
deliberately — it has to match too.

**A failure means:**
- Different **key count**, or "No eligible layers" / a too-high skipped tally →
  the effects group lookup. `layer.Effects` became
  `layer.property("ADBE Effect Parade")`; a null there is treated as "skip".
- Different key **times or values** → something in the port is misread. Keep
  both dumps.
- The boolean change is **not** a candidate: the old panel sent `"true"`/
  `"false"` and the host tested `=== "true"`; the mapping to the 0.015/0.10
  noise gate is provably unchanged for every input.

🛑 Blocker either way — this validates the whole bridge approach.

---

## ✅ Run D — Del KF and Align ⚠️

**Setup:** same footage comp as Run C. **Reopen the project first** — both of
these rewrite Time Remap.

**D1 — Del KF.** Enable time remap, select some keys **in the timeline**, click
Del KF.
**Correct:** selected keys gone, the rest re-spaced one frame apart from the
original first key time, outPoint pulled in. Message reports the count. One
Cmd+Z restores.

**D2 — Del KF with nothing selected.** Click it with no keys selected.
**Correct:** "No time-remap keyframes selected." and **no entry in Edit > Undo
History**. The original returned silently here.

**D3 — Align.** Reopen the project. Layer with keys at non-frame-aligned times.
Note the in point, click Align.
**Correct:** stretch becomes 50%, **the in point has not moved**, every key sits
on a whole frame, same-frame keys collapsed to one. One Cmd+Z restores
everything including the stretch.

**A failure in D3 means:** the in-point-hold offset (`startTime += oldIn -
inPoint`) or the frame-snap rounding. ⚠️ Isolated to this function.

## ✅ Run E — Auto Twixtor ⚠️ (plus a 🛑 checkpoint)

**Setup:** comp with footage, and a valid Twixtor `.ffx`. Set it once via the
`.ffx` button — **this writes the shared `app.settings` key, so it changes the
shipped panel too.**

**E1 — Split path.** Select **exactly one** layer, run any graph button.
**Correct:** same output as the shipped panel on the same layer. The split
happens at the midpoint, the original keeps the first half.
*Known difference, should not matter:* AE's Split Layer honours the preference
"Create Split Layers Above Original Layer" (on by default); `duplicate()`
always places the copy above. I traced every path — both halves are precomposed
together in every branch, nothing reads them by index, and they never overlap in
time — so stacking cannot affect the result. Confirm the output matches anyway.

**E2 — Multi-layer path.** Select two or more layers, run a graph button.
**Correct:** matches the shipped panel.

**E3 — Offsets.** Run each of the five offsets.
**Correct:** the tail key moves −10/−5/0/+5/+10 frames, matching the
highlighted button.

**E4 — All seven curves.** Easy Ease and Graph 1–6 on the same source.
**Correct:** each matches the shipped panel's matching button. The
`KeyframeEase` values were carried over verbatim, so a mismatch means a mode is
routed to the wrong curve.

**E5 — Preset persistence.** Close and reopen the panel.
**Correct:** the `.ffx` path is still set.

**E6 — Dialog suppression checkpoint 🛑.** After a real Twixtor run, raise a
dialog in AE again (Composition Settings).
**Correct:** it appears. If not, the unwind failed on the success path —
restart AE and report. 🛑 Blocker.

## ✅ Run F — Graph editor ⚠️

**Setup:** a layer with two position keyframes, and separately scale and
rotation keys.

**F1 — Curve parity.** In both panels load the same built-in preset, select the
two keys, hit APPLY. Compare in AE's own graph editor. Repeat for scale
(multi-dimensional, non-spatial) and rotation (single-dimensional).
**Correct:** identical curves. Position is spatial — one speed for the whole
vector; scale gets a separate ease per dimension.
**A failure means:** the spatial-vs-dimensional branch, or the `toFixed(4)`
rounding the panel applies before the call. ⚠️ Isolated.

**F2 — Guards.** APPLY with no comp, and with a comp but no keys selected.
**Correct:** a message in the panel, no `alert()`, **no "Apply Bezier Graph"
entry in Undo History**. This host function already closed its undo group
correctly on both guards — nothing was fixed here, so a leak would be a
regression I introduced. 🛑 if it leaks.

**F3 — Interaction.** Drag each handle, including past the top and bottom of
the box. Click several presets. Star a curve, switch to Favorites, right-click
to delete. Drag the 6px gap between the two panels. Close and reopen.
**Correct:** handles clamp to x 0–100 and y −50–150, the **nearer** handle is
grabbed, presets animate ~350ms, ★ lights gold when the current curve matches a
saved one, neither split panel shrinks below 130px, and both favourites and
split position survive a reload.

## ✅ Run G — Project utilities ⚠️

**Setup:** a **separate scratch project** — these change project structure.
Include loose root-level items of several kinds (a comp, a solid, a video, an
audio file, an image, something with an unrecognised extension) and at least one
imported item used in no comp.

**G1 — Remove Unused Footage.**
**Correct:** exactly the same items disappear as running File > Remove Unused
Footage by hand. Message reports the count. **One Cmd+Z brings them back** —
this is new; the original ran the menu command with no undo group of its own.

**G2 — Organize.**
**Correct:** items sorted into Pre-comps / Solids / Video Files / Audio Files /
Image Files / Other Files, existing folders of those names reused not
duplicated, nested items untouched. One Cmd+Z restores the flat layout.

**G3 — Localised AE**, if you have one. Run G1 there.
**Correct:** it works. This is the case the old English-label menu lookup failed
on outright and the whole reason for the change. ⚠️ Carry forward if you have no
localised install.

---

# Batch 2 (pending) — steps 06+

## [ ] 06 — Preset browser: scan and apply

**Setup:** a real preset tree — a root folder with several subfolders, `.ffx`
files in each.

**Steps:** click ✛ and pick the root. Switch folders with the dropdown. Search.
Star a preset. Apply one with each Apply mode (Adj / Solid / Selected) and each
Time mode (Match / 1 Frame / custom, using ▲▼).

**Correct:** the dropdown lists the root plus its immediate subfolders; the list
shows the `.ffx` files of the selected folder, favourites first then
alphabetical; search matches across **all** folders. Adj creates an adjustment
layer, Solid a solid, Selected applies to the selected layer. Match takes the
selected layer's in/out, 1 Frame is one frame from the playhead, custom is N
frames. One Cmd+Z per apply.

**A failure in the scan** points at the folder walk having moved panel-side —
see the note below. **A failure in apply** points at the argument order into
`applyPreset`.

> The root folder is remembered under `saved-preset-folder-path` and favourites
> under `fav-presets` — the **same key names** the shipped panel uses. That was
> originally described here as the two panels sharing state; see L0 in batch 3.
> Same names, most likely separate stores, so **expect to pick the root folder
> again in the new panel**. That is not a failure of the scan.

> **Dropped: the `app.settings("PS_PRO", "presetRoot")` write.** Audited before
> removing it, because `app.settings` lives in After Effects, survives
> reinstalling the extension, and is shared across anything using the same
> section name.
>
> The whole `PS_PRO` section turns out to be write-only. It holds exactly two
> keys — `presetRoot` (written by `scanPresetFolders`) and `renderPaths`
> (written by `saveRenderPathsAE`) — and **neither is ever read back**, in
> `main.js` or `host.jsx`. Both are shadow copies of localStorage values the
> panel actually reads (`saved-preset-folder-path` and `render-paths`). So the
> section is not load-bearing for anything else. The other two sections *are*
> live: `ValencyMotion` now holds both the Twixtor preset path and the last
> render path; they were `ValencyMotion` and `ValencyMotion` before the rebrand.
>
> **Can the stale value and the new localStorage root disagree visibly? No.**
> *(Reasoning corrected — the original said "both panels share that key", which
> rests on the shared-localStorage assumption. See L0. The conclusion is
> unchanged, and rests on something simpler.)* **Nothing reads
> `PS_PRO/presetRoot` at all** — not the shipped panel, not this one. Each panel
> reads its root from its own localStorage. A stale `app.settings` value is
> therefore invisible to both regardless of whether the stores are shared.
> Existing users keep whatever is already in `PS_PRO/presetRoot`; nothing reads
> it, so nothing changes. The only
> theoretical exposure is another extension using the same global section name,
> which is a property of the original design and unaffected by dropping a write.
>
> **Note for step 07:** `saveRenderPathsAE` is the other half of this. It is a
> host function whose only job is writing a key nobody reads.

## [ ] 06 — Preset browser: guard paths

**Steps:** apply a preset with no comp open. With a comp but no layer selected,
apply with Apply=Selected, and again with Time=Match.

**Correct:** "Select a composition first." / "Select a layer to apply the preset
to." / "Select a layer to match the duration against." — all in the panel, no
`alert()`, and **no stray "Apply Preset" entry in Edit > Undo History**. The
original had no `try` around this body at all, so a throw left the group open.

## [ ] 06 — Preset browser: layer colour

The Layer Clr dropdown lives in the **theme tab**, which lands in step 09. Until
then this reads `localStorage["layer-color"]` directly, defaulting to 1 (Red) —
the same key and default the shipped panel uses.

**Steps:** *(rewritten — the original version set this in the shipped panel,
which only works if localStorage is shared. See L0.)* Set
`localStorage["layer-color"]` in the **new** panel's DevTools console
(`localhost:8860`) to a distinctive value such as `"9"`, then apply an Adj or
Solid preset from that same panel. From step 09 onward the Theme tab's Layer
Clr dropdown sets it for you, which is the better way to run this.

**Correct:** the created layer takes that label colour. If it is always red,
the key is not being read.

## [ ] 06 — Preset browser: Save

**Steps:** select some animated properties on a layer, click Save, save the
preset into the current root.

**Correct:** AE's own Save Animation Preset dialog opens, and after saving the
list refreshes to include the new preset without reopening the panel.

> Still a menu command (`findMenuCommandId("Save Animation Preset...") || 3075`)
> because there is no scripting API for saving a preset. **This is the one
> remaining locale-dependent call in the port** — on a localised install the
> lookup fails and it falls through to the hardcoded 3075. Worth trying on a
> localised AE if you have one; if 3075 is wrong there, nothing can be done
> beyond telling the user.

## [ ] 07 — Render: the stray "Temp" comp (check this first)

**You may already have one from the shipped panel.** Its `getSystemTemplates`
fabricated a comp named `Temp` plus a render queue item to read the output
module template list, and removed them inside a `try` with an empty `catch` — so
any throw left both behind, silently.

**Steps:** open your existing projects and look for a 100×100 composition named
`Temp` at the project root, and for an orphaned render queue item.

**If you find one, it is ours, not yours.** Safe to delete. The port removes
both in a `finally`, so it cannot happen again.

## [ ] 07 — Render: the project no longer gets dirtied on every visit

`Project.dirty` is read-only with no way to reset it, so the old behaviour was
permanent: opening the Render tab modified the project and you got an
unexplained "save changes?" on quit.

**Steps:** open a saved project (no asterisk in the title). **With at least one
item in the render queue**, open the Render tab.
**Correct:** templates populate and **the project is still not marked modified**.

**Then:** close the project without saving, reopen it, empty the render queue,
and open the Render tab again.
**Correct:** templates still populate (from the cache) and the project is still
clean. Only a first-ever run with an empty cache, or pressing ⟳, pays the cost.

**⟳ always pays it** — that is deliberate. Press it and the project will be
marked modified if the queue is empty.

## [ ] 07 — Render: templates stay current

Output module templates live in AE's preferences, not the project, so a cache
cannot know about one added elsewhere.

**Steps:** add a new output module template in After Effects. With something in
the render queue, revisit the Render tab.
**Correct:** the new template appears without pressing ⟳ — the free read runs on
every visit and refreshes the cache. With an *empty* queue it will not appear
until you press ⟳; that is the documented trade.

The cache is keyed to the AE version, so upgrading should show a fresh read
rather than a stale list.

## [ ] 07 — Render: the render itself

**Setup:** a comp, a valid output template, and a destination folder.

**Steps:** render with "Render to specific folder" on, and again with it off
(save dialog). Try with a layer selection and without. Try with Auto-set Work
Area on. Try with Auto-Import on, for both a movie template and an image
sequence template.

**Correct:** output matches the shipped panel — same filename numbering
(`prefix N`), same sequence padding, same folder. With a selection, only the
selected enabled+unlocked layers are soloed during the render and **un-soloed
afterwards**, and the work area is restored to exactly where it was. Auto-import
adds the result above the topmost selected layer at its in point.

**Undo:** one Cmd+Z removes the auto-imported layer. Nothing else is undoable —
deliberate. The render, the project save and the cache purge are not undoable
operations, and an undo group spanning `app.project.save()` would offer to walk
you back past a state already written to disk.

## [ ] 07 — Render: prefix with regex characters

**Steps:** set the render prefix (theme tab, or `localStorage["render-prefix"]`)
to something containing brackets or a dot — `shot(a)` or `v1.5` — and render
twice into the same folder.

**Correct:** both renders succeed and the second is numbered one higher than the
first. In the shipped panel `shot(a)` threw an uncaught invalid-regex error and
`v1.5` matched the wrong files, because the prefix went into a `RegExp`
unescaped.

## [ ] 07 — Render: misconfigured click keeps your queue

**Steps:** queue up some render items by hand. Turn on "Render to specific
folder" but leave the selected destination unset. Click RENDER.

**Correct:** "Destination folder is not set." and **your queued items are still
there**. The original removed every QUEUED item first and only then discovered
the destination was missing.

## [ ] 08 — Library: browsing, tabs and breadcrumbs

**Setup:** a real media library — nested folders, several hundred files in at
least one of them, a mix of video, image, audio and unsupported types.

**Steps:** add a root with **+**. Open folders, use the breadcrumbs to jump
back. Open a second tab, navigate it somewhere else, switch between them, close
one. Search. Star a folder and a file. Reopen the panel.

**Correct:** matches the shipped panel in *behaviour* — roots at Home, folders
before files, favourites sorted first, tabs and breadcrumbs surviving a reload.

Roots, favourites, hidden items, tabs and the cache folder use the same key
*names* as the shipped panel, but see L0 in batch 3: the stores are most likely
separate, so **you will need to add your roots and cache folder again in the new
panel**. The listing cache files themselves *are* shared once both panels point
at the same cache folder, since those are files on disk.

**Watch the folder with several hundred files.** The listing scan moved from
`cep.fs.readdir` plus an ExtendScript `Folder.getFiles()` round trip to a single
Node `readdirSync(..., { withFileTypes: true })`. It should feel the same or
faster; if it is noticeably slower, the `withFileTypes` path is failing and the
per-entry `statSync` fallback is running.

## [ ] 08 — Library: import

**Steps:** double-click a video, an image, an audio file and an unsupported
file. Click the download badge on a folder containing an image sequence.

**Correct:** the asset lands in the active comp at the playhead, scaled to
cover, above the selected layer if there was one. One Cmd+Z each. Unsupported
files report "After Effects cannot import this file format." rather than
appearing to do nothing.

**Sequences:** the original swallowed per-sequence failures in an empty catch,
so a folder where every sequence failed still looked successful. Failures are
counted and reported now — "Imported 2 sequences. 1 failed."

## [ ] 08 — Library: media lifecycle on a big folder

The question this step was meant to answer. Findings, and what to confirm:

- **Videos were already handled** in the shipped panel — off-screen elements got
  `pause()`, `removeAttribute("src")`, `load()`, which releases the decoder.
- **Images were not.** They were emitted with a plain `src` and
  `loading="lazy"`, so they loaded near the viewport and **never released**. The
  panel's own image-unload branch was unreachable, because the selector required
  `[data-src]` and images never had it. Both are managed here via
  `IntersectionObserver` with the same 600px band.
- **It does not accumulate across navigation** either way — changing folder
  replaces the grid and the old elements are collected. The unbounded case was
  one folder with many images.

**Steps:** open a folder with several hundred images and scroll to the bottom
and back, watching memory in the CEP debugger (`localhost:8860`, Chrome task
manager). Then the same with several hundred videos.

**Correct:** memory rises while scrolling and comes back down. If it only ever
rises, the observer is not releasing.

> **Known ceiling, not fixed:** Chromium caps simultaneous media elements per
> renderer (historically ~75). The 600px band can hold roughly 60–100 video
> tiles live at once on a wide panel. Past the cap, `src` assignment silently
> no-ops and tiles stay blank — and with no `onerror` (see POST-PARITY.md item
> 5) that is indistinguishable from still loading. Narrowing the band or
> capping concurrent videos would fix it; both are post-parity.

## [ ] 08 — Library: cache behaviour

**Steps:** set a cache folder. Browse into a folder. Add a file to it outside
the panel and revisit. Rename a file outside the panel and revisit. **Overwrite
a file in place** (same name, new content) and revisit. Clear the cache.

**Correct:** additions, deletions and renames are picked up. **An overwrite is
not** — the preview stays stale. That is the shipped behaviour, ported as-is;
see POST-PARITY.md item 4.

A half-written or corrupt `cache_*.json` should fall back to a full rescan
rather than showing an error — the parse is guarded.

## [ ] 09 — Theme: no flash of defaults on open

**Divergence from the shipped panel, deliberate.** The original called
`loadTheme()` from `window.onload`, which fires after first paint, so it
visibly rendered the stylesheet's defaults and then snapped to the user's
theme. The port applies stored tokens at module scope before React mounts.

**Steps:** save a theme that looks clearly different from the defaults (very
different gradient), then close and reopen the panel. Watch the first frame.

**Correct:** the panel appears already themed. No blue-then-magenta or
default-then-yours flash. The shipped panel will still flash — that is the
difference, not a fault.

## [ ] 09 — Theme: slot storage is format-compatible

*(Rewritten. This was written as "slots are shared with the shipped panel" and
tested by saving in one and loading in the other — which only works if
localStorage is shared. See L0 in batch 3.)*

What is actually guaranteed is the **format**, not the sharing: `theme-slot-<N>`
holds the same JSON shape the shipped panel writes, with **every value as a
string** (`radius: "12"`, not `12`), `theme-name-<N>` the display name,
`last-active-slot` the id.

**Steps:** save a theme into slot 3, rename it, close and reopen the panel, load
it. Then, in DevTools (`localhost:8860`), copy the raw `theme-slot-3` string out
of the shipped panel's console and paste it into the new panel's, and load the
slot.

**Correct:** slots and names survive a reload within a panel. A slot string
lifted from the shipped panel loads correctly, and one missing newer fields
merges over the defaults rather than failing. **If the two panels turn out to
share storage after all (L0), the copy step is unnecessary** and slots appear in
both automatically.

## [ ] 09 — Theme: every control applies AND persists

The failure this checks for is a setting that applies but does not survive a
reload, or saves but does not apply.

**Steps:** change every control — bg colour, radius, both gradient colours,
both angle buttons, anim, background image, background **video**, video start
time, fit, blur, dim, hue, volume, render device, prefix, layer colour. After
each, close and reopen the panel.

**Correct:** each change is visible immediately and still there after a reload.
The glow behind the active tab should track the gradient start colour — it is
derived as `<gradStart>66`, not a separate setting.

**Cross-tab, the ones other tabs read:** set Layer Clr to something distinctive
and apply an Adj preset from the Presets tab — the layer takes that colour. Set
Prefix and render — the filename uses it. Set Volume and play an audio file in
the Library tab.

## [ ] 09 — Theme: background video

**Steps:** choose a video background. Scrub the Time slider. Switch to an image
background, then Clear.

**Correct:** the video plays behind the panel, blurred/dimmed/hue-shifted by
those sliders, and the Time slider moves its start frame. Switching to an image
or clearing **stops and releases it** — the original left a stale `src` on the
element.

## [ ] 09 — Theme: two controls that do nothing (expected)

Both ported faithfully and queued in POST-PARITY.md; **not** faults of the port.

- **Render device** persists but never reaches the renderer, in either panel.
- **Anim** persists but all three options resolve to identical CSS, in either
  panel.

**Correct:** they remember their value across a reload and change nothing else.

---

## [ ] Rebrand — storage renamed with no migration

Every stored name moved to Valency naming and **nothing reads the old names**.
There is no fallback and no migration, deliberately: this product is standalone
and shares nothing with the old one.

| Was | Now |
|-----|-----|
| `app.settings` `AutoTwix` / `presetPath` | `ValencyMotion` / `twixtorPresetPath` |
| `app.settings` `RenderAutomator` / `lastPath` | `ValencyMotion` / `lastRenderPath` |
| `~/Documents/AutoEditPro/sys_id.txt` | `~/Documents/Valency/machine-id.txt` |
| unprefixed localStorage keys | `valency.<group>.<key>` |
| `com.valency.aepanel` | `com.valency.motion` |

**Expect these on first launch after the rename — all correct, not bugs:**

- **Every setting is back to its default.** Theme, slots, library roots, preset
  root, render destinations, favourites. The old values are still on disk under
  the old names and are simply never read.
- **The Twixtor `.ffx` path is empty** and needs picking again. `app.settings`
  is After Effects state and survives uninstall, so the old value is still there
  under `AutoTwix` — it is just not what the panel looks at now.
**Steps:** launch the panel with no prior Valency state. Visit every tab.

**Correct:** no errors, no blank panels. Reading a missing `app.settings`
section returns nothing and the panel falls back to its default rather than
throwing — the Twixtor path guard is `haveSetting()` before `getSetting()`.
Every tab renders with defaults and accepts new values that then persist.

**A throw on any tab** means a missing-key path is unguarded; note which tab.

---

# Post-parity checks

## [ ] P1 — Cmd+Z and Cmd+Shift+Z reach After Effects

Restores something the shipped panel did and the port had lost: with panel
focus, undo and redo were dead because the panel is a separate process and the
keystroke never reached the host.

**Steps:** click somewhere neutral in the panel (a tab, a heading — not a text
field). Run any operation that changes the project, e.g. Analyze or Organize.
Press Cmd+Z. Then Cmd+Shift+Z.

**Correct:** the operation undoes and redoes in After Effects, exactly as if AE
had focus.

**Then the deliberate difference:** click into a text field — the preset search
box, the library search box, or the render prefix in the Theme tab — type
something, and press Cmd+Z.

**Correct:** your *typing* undoes. After Effects is untouched. The shipped panel
intercepted every Cmd+Z, so this case sent an undo to AE instead, and you could
not undo an edit to a search box.

**A failure means:** if nothing happens with panel focus, the host call is not
landing — check the DevTools console at `localhost:8860`. If AE undoes while
you are typing in a field, the editable-target guard is not matching.

## [ ] P2 — Library thumbnail size control

Restores the 2x2 / 3x3 / 4x4 radios the first-generation library UI had. The
rewrite that replaced it dropped them and deleted their CSS, which is why this
looked like collateral rather than a decision.

**Steps:** open the Library tab with a folder of media showing. Switch between
2x2, 3x3 and 4x4. Resize the panel at each. Close and reopen the panel.

**Correct:** thumbnails get larger at 2x2 and smaller at 4x4, the choice
persists across a reload, and the grid still reflows on resize — the columns
are auto-fitted, so the setting drives the *minimum* tile width rather than a
fixed column count. On a narrow panel 4x4 may show fewer than four columns;
that is the auto-fit working, not a fault.

**Default is 3x3**, which is the 110px minimum the grid had hardcoded, so an
existing library looks unchanged until you touch the control.

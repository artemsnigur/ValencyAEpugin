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

**Shared state, deliberate** — the two panels share three stores, so a change in
one shows up in the other. If an A/B comparison disagrees unexpectedly, check
these before blaming the port: the Twixtor `.ffx` path (`app.settings`,
section `AutoTwix`, key `presetPath`), graph favourites (`localStorage`,
`graph-favorites-sandbox`), and the graph splitter height (`graph-top-height`).

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
> under `fav-presets` — **both the shipped panel's keys**, so the two panels
> share them, same as the Twixtor path and graph favourites.

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
> live: `AutoTwix` (Twixtor preset path, read and written) and
> `RenderAutomator` (last render path, read and written inside
> `startZxpRender`).
>
> **Can the stale value and the new localStorage root disagree visibly? No.**
> The shipped panel reads its root from localStorage too, never from
> `app.settings`, and both panels share that key — so a folder picked in either
> is seen by both. Existing users keep whatever stale value is already in
> `PS_PRO/presetRoot`; nothing reads it, so nothing changes. The only
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

**Steps:** set Layer Clr in the **shipped** panel, then apply an Adj or Solid
preset from the **new** panel.

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

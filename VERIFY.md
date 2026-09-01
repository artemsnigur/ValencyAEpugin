# Verification batch — steps 01–05

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

## Run A — Wiring sweep 🛑

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

## Run B — Dialog suppression checkpoint 🛑

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

## Run C — Duplicate frame parity 🛑

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

## Run D — Del KF and Align ⚠️

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

## Run E — Auto Twixtor ⚠️ (plus a 🛑 checkpoint)

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

## Run F — Graph editor ⚠️

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

## Run G — Project utilities ⚠️

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

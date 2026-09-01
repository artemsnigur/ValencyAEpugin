# Verification queue

Checks that need After Effects and a human. The build and typechecker cannot
catch any of these. Newest steps at the bottom; work through them in batches.

Mark an entry `[x]` when it passes. If one fails, note what you saw — the
failure detail matters more than the pass.

Two standing checks apply to **every** entry, because both fail silently:

- **Click every control the step introduced.** A handler that is rendered but
  not wired throws nothing; the button just does nothing.
- **Undo every operation with a single Cmd+Z.** A missing or leaked undo group
  is invisible until someone needs it. **Press it with After Effects focused,
  not the panel** — the shipped panel intercepted Cmd+Z inside the panel and
  forwarded it to AE via `app.executeCommand(16)`; that forwarding is not
  ported yet, so Cmd+Z with panel focus currently does nothing. Tracked as a
  known gap, not a failure of the step under test.

---

## [ ] 02 — Duplicate frame remover: parity against the shipped build

Two changes in this port could in principle alter detection results. One is
provably safe by inspection; the other is worth the run.

- `isLowMovement` now crosses as a real boolean instead of the string `"true"`.
  **Provably equivalent** — the old panel sent `"true"`/`"false"` and the host
  tested `=== "true"`; the mapping to `0.015` / `0.10` is unchanged for every
  input, including the missing-checkbox path.
- `layer.Effects` became `layer.property("ADBE Effect Parade")`. Equivalent as
  far as the docs and types go, but unverified at runtime. **If this one is
  wrong the symptom is a wrong layer count, not wrong keyframes** — the code
  treats a null group as "skip this layer", so you would see "No eligible
  layers" or a too-high "Skipped N layers" tally. Everything downstream of
  creating the slider is character-identical to the original.

### Steps

Both extensions can be installed at once (different extension IDs), so both
appear under Window > Extensions.

`tools/dump-timeremap.jsx` prints the exact result. It is read-only. Run it via
**File > Scripts > Run Script File…** with exactly one layer selected; it dumps
layer name, comp fps, in/out point, startTime, stretch, time-remap key count
and every key time and value to 6 decimals, and offers to save to `.txt`.

Use real footage with actual duplicated frames — `sampleImage` needs pixels, so
a solid proves nothing. Same comp and same layer for all four runs.

**Undo fully, or reopen the project, between every run.** The operation is
destructive; without a reset, run 2 compounds on run 1.

| Run | Panel | Detect Small Movement | Save as |
|-----|-------|-----------------------|---------|
| 1 | shipped `.zxp` | off | `old-off.txt` |
| 2 | new panel | off | `new-off.txt` |
| 3 | shipped `.zxp` | on | `old-on.txt` |
| 4 | new panel | on | `new-on.txt` |

### Correct result

`diff old-off.txt new-off.txt` and `diff old-on.txt new-on.txt` are both empty.
`outPoint` is rewritten by the operation and is in the dump deliberately — it
has to match too.

A different **key count** points at the slider not being created (the Effects
change). Different key **times or values** means something in the port is
misread — keep both dumps.

## [ ] 02 — Duplicate frame remover: busy state actually paints

`evalScript` is callback-based and crosses to another process, so the panel
should keep painting while After Effects is frozen. Verified by construction,
not observed.

**Steps:** run Analyze on a layer long enough to take a few seconds.

**Correct result:** the button reads "Analyzing…" and is disabled, and the note
under it turns bright and reads "Working — After Effects is frozen." for the
duration. If the panel visibly freezes and neither ever appears, the assumption
is wrong — say so rather than working around it.

## [ ] 02 — Duplicate frame remover: guard paths

The original opened an undo group *before* validating and returned from inside
the `try`, so both guard paths leaked an open undo group. Validation now runs
before `beginUndoGroup`.

**Steps:** click Analyze in three states — no comp open; comp open with nothing
selected; a selection containing only locked or null layers.

**Correct result:** a readable message in the panel each time ("Select a
composition first." / "Select one or more layers first." / "No eligible
layers…"), no `alert()` dialog, and **no stray "Run Duplicate Frame Remover"
entry in Edit > Undo History**.

---

## [ ] 03 — Align (stretchAndSnap)

**Steps:** layer with time-remap keys at non-frame-aligned times. Note its in
point, then click Align.

**Correct result:** stretch becomes 50%, the in point has **not** moved, every
key sits on a whole frame, and keys that landed on the same frame collapsed to
one. Message reports layers aligned and keys collapsed. Single Cmd+Z restores
everything including the stretch.

## [ ] 03 — Del KF (removeKeyframes)

**Steps:** layer with time remap enabled. Select some keys **in the timeline**,
then click Del KF.

**Correct result:** selected keys gone, remaining keys re-spaced one frame apart
starting at the original first key time, outPoint pulled in to match. Message
reports the count. Single Cmd+Z.

**Also:** click Del KF with no keys selected. Expect "No time-remap keyframes
selected." and no undo entry — the original returned silently here.

## [ ] 03 — Remove Unused Footage

Behaviour change: the original called
`app.executeCommand(app.findMenuCommandId("Remove Unused Footage"))` with no
undo group. It is now `app.project.removeUnusedFootage()`, which the docs
define as the same command, wrapped in an undo group and returning a count.

**Steps:** project with at least one imported item used in no comp. Click
Remove Unused Footage.

**Correct result:** exactly the same items disappear as when running
File > Remove Unused Footage by hand. Message reports the count. **Single Cmd+Z
brings them back** — this is new; the original left no undo group of its own.

**Worth testing on a non-English AE if you have one** — that is the case the
old menu lookup failed on and the reason for the change.

## [ ] 03 — Organize

**Steps:** project with loose root-level items of several kinds — a comp, a
solid, a video, an audio file, an image, and something with an unrecognised
extension. Click Organize.

**Correct result:** items sorted into Pre-comps / Solids / Video Files /
Audio Files / Image Files / Other Files, existing folders of those names reused
rather than duplicated, nested items untouched. Single Cmd+Z restores the flat
layout — the original leaked the undo group whenever the move loop threw, so
confirm the group closes cleanly.

---

## [ ] 04 — Auto Twixtor: split-layer reimplementation

Behaviour change. The original moved the playhead to the layer midpoint and ran
`app.executeCommand(app.findMenuCommandId("Split Layer") || 2159)`. That is now
`duplicate()` plus trimming both halves at the midpoint — no locale dependency,
no hardcoded command ID, and the playhead no longer jumps.

**Steps:** select **exactly one** layer and run any Twixtor graph button.

**Correct result:** identical output to the shipped panel on the same layer.
The split happens at the midpoint, the original keeps the first half, the new
layer takes the second.

**Known difference worth checking:** AE's Split Layer honours the preference
"Create Split Layers Above Original Layer" (on by default). `duplicate()`
always places the copy above. If that preference is **off** on your install,
the shipped panel put the new layer below and this port puts it above. It
should not change the result — both halves get precomposed together on the next
line — but confirm the output matches.

## [ ] 04 — Auto Twixtor: dialog suppression unwinds

Worse than an undo leak: a suppression that never unwinds makes After Effects
swallow every dialog until it is restarted. `beginSuppressDialogs` now runs
after validation and unwinds in a `finally`.

**Steps:** trigger each guard path — no comp, no selection, and a preset path
pointing at a missing `.ffx`. Then, after each one, do something in AE that
*should* raise a dialog (e.g. close an unsaved project).

**Correct result:** the guard message appears **in the panel** (the original
alerted while dialogs were suppressed, so the warning was swallowed), and AE
still shows its own dialogs normally afterwards. If dialogs stop appearing, the
unwind failed — restart AE and report it.

**Also force a mid-run failure** if you can (e.g. a `.ffx` that is not a valid
Twixtor preset) and confirm dialogs still work afterwards.

## [ ] 04 — Auto Twixtor: offset and preset are arguments now

`setTwixtorOffset` is deleted. The offset index and preset path live in the
panel and are passed to `runTwixtor` on every call.

**Steps:** pick each of the five offsets and run a graph. Set a preset via
`.ffx`, close and reopen the panel, and run again.

**Correct result:** the offset applied matches the highlighted button
(-10/-5/0/+5/+10 frames on the tail key). The preset path survives a panel
reload.

> **Deliberate: the two panels share one setting.** The path is stored via
> `app.settings` under the same section (`AutoTwix`) and key (`presetPath`) the
> shipped panel uses. That is intentional — it means a path set in either panel
> is visible to the other, which is what you want while A/B testing. It also
> means **picking a different `.ffx` in the new panel silently changes the
> shipped panel too.** If an A/B comparison suddenly disagrees, check this
> before blaming the port. Revisit if the two ever need to diverge.

## [ ] 04 — Auto Twixtor: all seven graph buttons

**Steps:** run Easy Ease and Graph 1–6 on the same source.

**Correct result:** each produces the same ease as the shipped panel's matching
button. The `KeyframeEase` values were carried over verbatim, so any difference
means the mode is being routed to the wrong curve.

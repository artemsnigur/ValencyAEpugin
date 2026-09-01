# Verification queue

Checks that need After Effects and a human. The build and typechecker cannot
catch any of these. Newest steps at the bottom; work through them in batches.

Mark an entry `[x]` when it passes. If one fails, note what you saw — the
failure detail matters more than the pass.

Two standing checks apply to **every** entry, because both fail silently:

- **Click every control the step introduced.** A handler that is rendered but
  not wired throws nothing; the button just does nothing.
- **Undo every operation with a single Cmd+Z.** A missing or leaked undo group
  is invisible until someone needs it.

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

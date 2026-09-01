# Post-parity queue

Work deliberately deferred until `src/` reaches feature parity and
`AutoEditRestored/` is deleted. Each is its own commit. Nothing here blocks a
migration step.

## 1. Forward Cmd+Z / Cmd+Shift+Z to After Effects

The shipped panel intercepted undo/redo **inside the panel** and forwarded them
to the host:

```js
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault(); e.stopPropagation();
    csInterface.evalScript(e.shiftKey ? "app.executeCommand(17)"   // Redo
                                      : "app.executeCommand(16)"); // Undo
  }
});
```

Not ported yet, so Cmd+Z with panel focus currently does nothing. Numeric
command IDs, not label lookups, so this is **not** the locale bug that affected
`Remove Unused Footage` — no scripting API exists for undo/redo and these IDs
are the sanctioned route.

**Not porting:** the same listener's `F5` / `Cmd+R` → `location.reload()`
binding. It was registered twice (a weaker duplicate on `document` missing
`preventDefault` and `metaKey`), it is a developer affordance, and silently
discarding panel state on a stray F5 is a misfeature in a shipped panel.

## 2. Restore the library grid size control

The first-generation library UI (`#tab-footage`, dead in the shipped build) had
2x2 / 3x3 / 4x4 thumbnail sizing radios. The live tabbed/breadcrumb browser
that replaced it dropped them, and the `.media-grid` / `.grid-3` CSS was deleted
too — which suggests it was swept up in the rewrite rather than removed on
purpose. Sizing is orthogonal to the navigation change.

Cheap to restore because the live grid already auto-fits:

```css
.library-grid { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
```

Three radios writing a CSS custom property that `minmax()` reads — swap the
`110px` for `var(--lib-thumb-min)` and set it from the panel. No host code, no
change to navigation.

## 3. Reword provenance comments when AutoEditRestored/ is deleted

Roughly a dozen `Ported from AutoEditRestored/...` comments across `src/` will
become dangling references to a folder that no longer exists. Fold the reword
into the deletion commit.

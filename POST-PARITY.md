# Post-parity queue

Work deliberately deferred until `src/` reaches feature parity and
the reference dump is deleted. Each is its own commit. Nothing here blocks a
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

## 3. Library cache: compare mtime, not just names

`listingMatches` compares a sorted join of entry **names** between the cached
listing and disk — the shipped panel's check, ported as-is. Additions,
deletions and renames are caught; **a file overwritten in place is not**, so a
re-rendered clip goes on showing its old preview indefinitely.

Fix: store `mtimeMs` per entry alongside the name and compare that too. The
cache format is shared with the shipped panel - genuinely so, since the cache is
files on disk rather than localStorage - so either bump the cache filename
prefix or make the extra field optional so an old cache still parses.

## 4. Library cards: surface load failures

No `onerror` anywhere on the media elements. A corrupt, unreadable or
unsupported file renders as an empty tile — indistinguishable from one that has
simply not lazy-loaded yet. Ported as-is.

Fix: an `onError` handler swapping in a "could not preview" state, now trivial
since the cards are React components. Distinguishing it from the not-yet-loaded
state also needs the placeholder to be visibly different from the error state.

## 5. Animation dropdown: implement the variants or drop it

`#anim-select` offers Classic Pop / Elastic Bounce / Liquid Glass. In the
shipped stylesheet all three resolve to **identical rules** — same transition,
same `brightness(1.08)` hover, same `brightness(0.95)` active — and so does the
no-attribute default:

```css
body[data-anim="pop"] .pop-anim, body:not([data-anim]) .pop-anim,
body[data-anim="elastic"] .pop-anim,
body[data-anim="glow"] .pop-anim { transition: … }   /* one rule for all */
```

So the picker persists `btn-anim` and changes nothing visible. Ported as-is.

Same shape as item 6: a menu that lies. Either give the three names distinct
motion, or collapse the control.

---

# Recorded decisions (not bugs, not queued work)

## D1. The library does not require a cache folder

The original blocked the Library tab until a cache folder was chosen — the grid
showed "Step 1: Set Cache Folder" and browsing was unavailable, and
`clearLibraryCache` refused with "Cache folder is not set."

The port **browses without one**, silently skipping the cache: `readCachedListing`
and `writeCachedListing` both return early when the folder is empty, so every
visit is a fresh scan. Setting a folder turns caching on.

Deliberately left as a divergence pending a decision, because the original's
behaviour is arguable in both directions:

- **Keeping the gate** makes the cost explicit and stops users blaming the panel
  for slow browsing they could have avoided. It is also a strange first-run
  experience: a media browser that refuses to browse.
- **Not gating** works immediately and degrades to "slower on large folders".
  The risk is that nobody ever sets a cache folder and the feature is dead
  weight.

Note the *guard* on clearing the cache **is** restored — that one is about not
silently doing nothing when a button is pressed.


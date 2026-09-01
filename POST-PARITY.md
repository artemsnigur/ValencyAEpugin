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

## 3. Reword provenance comments when the reference dump  is deleted

Roughly a dozen `Ported from the reference dump ...` comments across `src/` will
become dangling references to a folder that no longer exists. Fold the reword
into the deletion commit.

## 4. Library cache: compare mtime, not just names

`listingMatches` compares a sorted join of entry **names** between the cached
listing and disk — the shipped panel's check, ported as-is. Additions,
deletions and renames are caught; **a file overwritten in place is not**, so a
re-rendered clip goes on showing its old preview indefinitely.

Fix: store `mtimeMs` per entry alongside the name and compare that too. The
cache format is shared with the shipped panel - genuinely so, since the cache is
files on disk rather than localStorage - so either bump the cache filename
prefix or make the extra field optional so an old cache still parses.

## 5. Library cards: surface load failures

No `onerror` anywhere on the media elements. A corrupt, unreadable or
unsupported file renders as an empty tile — indistinguishable from one that has
simply not lazy-loaded yet. Ported as-is.

Fix: an `onError` handler swapping in a "could not preview" state, now trivial
since the cards are React components. Distinguishing it from the not-yet-loaded
state also needs the placeholder to be visibly different from the error state.

## 6. Render device dropdown: wire it or remove it

`#render-device` persists a choice under `render-device` that **never reaches
the renderer**. In the shipped panel it is read back only to restore the
dropdown's own value (main.js:1096, 1190) and preserved across a reset (1396,
1448). `startZxpRender` never looks at it. Ported as-is for parity.

A selector that remembers a choice which does nothing is worse than no
selector — the user believes they have configured something. Two options:

- **Wire it:** map the choice onto something real. `app.project.gpuAccelType`
  is settable, so the dropdown could actually switch the project's render
  engine before queuing.
- **Remove it.** The read-only "Project render engine: CPU/GPU" line added in
  step 09 (from `getProjectRenderEngine`) is the honest version of the same
  information, and it makes the fake selector beside it more confusing, not
  less.

## 7. Animation dropdown: implement the variants or drop it

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

## 8. Wire release credentials into CI

`.github/workflows/main.yml` runs `npm run zxp` on tag push with no `.env`
present, so **a release built today would ship with the licensing placeholders
and a panel that reports itself unconfigured**.

Needs two repository secrets and a step before the build:

```
VITE_LICENSE_ENDPOINT
VITE_LICENSE_KEY
```

written into a `.env` in the workspace immediately before `npm run zxp`. Not
wired now — deliberately, so no credential path exists until the endpoint work
is settled. Until then, releases must be built locally from a real `.env`.

## 9. Machine identity on Windows 11 24H2

Tracked separately in **LICENSING-HWID.md** because it is a live product
problem rather than migration work: `wmic` is gone in 24H2, so `getHWID` falls
through to a cached or random identity and customers who upgrade can lose their
licence. That document has the failure chain, replacement identifiers, the
macOS exposure, and what the Apps Script has to do first.

The client-side half of the fix is blocked on the server; a client-only change
causes the lockout it is meant to prevent.
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

## D2. Logout failure is silent

The original showed "Connection Error. You must be connected to the internet to
log out and unlink your PC." when the logout request failed, and **kept the user
logged in**.

The port's `logoutLicense` swallows the error, returns `""`, and clears local
state regardless — so a user who logs out while offline is logged out locally
but **still bound on the server**, with no message saying so. They then cannot
re-activate from another machine, and nothing told them why.

Left as a divergence pending a decision because the right behaviour is not
obvious: refusing to log out when offline is correct for the server's benefit
but traps a user who genuinely wants off this machine. The original chose to
refuse. Worth deciding alongside the wider rebind question in
`LICENSING-HWID.md`, since both are about what happens when client and server
disagree about who owns a machine.

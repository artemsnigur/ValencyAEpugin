# Post-parity queue

Work deliberately deferred until `src/` reaches feature parity and
the reference dump is deleted. Each is its own commit. Nothing here blocks a
migration step.

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


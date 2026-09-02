# Post-parity queue

**Empty.** Every queued item is done and pushed; VERIFY.md P1-P9 holds the
checks they need. What remains below is a decision, not work.

| Item | Commit |
|------|--------|
| Forward Cmd+Z / Cmd+Shift+Z to After Effects | `f018143` |
| Restore the library thumbnail size control | `7b7ae85` |
| Library cache detects in-place overwrites | `138b1cf` |
| Library previews show when they fail to load | `10e2068` |
| Remove the render device dropdown | `d23f276` |
| Give the three animation variants distinct motion | `cc2433b` |

Two further items were struck rather than completed, when licensing was removed
and the product became free: the Windows 11 24H2 machine identity problem and
wiring release credentials into CI. Both existed only because activation did.
The licensing implementation is preserved on `archive/licensing`.

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


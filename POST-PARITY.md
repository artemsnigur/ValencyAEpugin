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

# Recorded decisions

## D1. The library browses without a cache folder — decided

**Decided: leave it as it is.** The gate protects an optimisation, not data.
Browsing works without a cache; it is only slower on repeat visits, and a media
browser that refuses to browse is a strange first run.

The original blocked the Library tab until a cache folder was chosen — the grid
showed "Step 1: Set Cache Folder" and browsing was unavailable, and
`clearLibraryCache` refused with "Cache folder is not set."

The port **browses without one**, silently skipping the cache: `readCachedListing`
and `writeCachedListing` both return early when the folder is empty, so every
visit is a fresh scan. Setting a folder turns caching on.

The argument for keeping the gate was that it makes the cost explicit and stops
users blaming the panel for slow browsing they could have avoided. That was
outweighed: the cost is only ever slower repeat visits, and refusing to open at
all is a worse first impression than being slow later.

The residual risk is accepted — someone may never set a cache folder and never
get caching. That is a smaller problem than a browser that will not browse.

Note the *guard* on clearing the cache **is** restored — that one is about not
silently doing nothing when a button is pressed.


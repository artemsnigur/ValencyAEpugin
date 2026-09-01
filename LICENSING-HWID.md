# Machine identity is breaking on Windows 11 24H2

Not a porting note. This is a live licensing problem in the **shipped** product
that gets worse on its own as 24H2 rolls out, and it can lock out customers who
did nothing wrong.

Written while porting step 10. The port itself changes none of this — `getHWID`
is carried over faithfully, flaw intact, because a client-only fix causes the
lockout it is trying to prevent (see "Why the client cannot fix this alone").

---

## The failure chain

`AutoEditRestored/main.js:1468-1517`, `getHWID()`:

1. **1471-1477** — read `~/Documents/AutoEditPro/sys_id.txt`. If it holds more
   than 5 characters, **return it immediately**. The hardware is never
   consulted again once this file exists.
2. **1482-1490** — Windows: `execSync("wmic csproduct get uuid")`, then match a
   UUID with a regex.
3. **1491-1497** — macOS: `execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID")`,
   then match the quoted value.
4. **1499-1501** — if neither produced ≥5 characters, fall back to
   `os.hostname() + "-" + os.userInfo().username`.
5. **1503-1511** — **any throw above lands here.** Use `localStorage["sundx_hwid"]`
   if present; otherwise generate
   `"AE-SYS-" + Date.now().toString(36) + "-" + random`, and store it.
6. **1512-1516** — write whatever was produced to `sys_id.txt`.

**`wmic` was deprecated across Windows 10/11 and is removed from Windows 11
24H2.** On those machines step 2 throws, so step 5 runs: the identity becomes a
cached value, or a **random string generated at that moment**.

### Who this hurts

| Situation | Result |
|---|---|
| On 24H2, `sys_id.txt` already exists from an older build | Keeps working — step 1 short-circuits before the broken call. **Masked, not fixed.** |
| On 24H2, file missing — new install, new machine, Documents cleared, or a cache wipe | New random identity. Server sees a mismatch. **Licence refused.** |
| Upgrades to 24H2 *and* loses the file | Same. They changed nothing but the OS. |
| Machine renamed (the 4 fallback) | Identity changes. Same outcome. |

The share of users one cache-clear away from a new identity grows with every
24H2 rollout. It is invisible until it happens, then looks like piracy
enforcement to a paying customer.

### Also true today

Because step 1 wins over everything, the identity is a **plaintext,
user-editable file**. Device binding is defeated by editing a text file
regardless of what the server does. That is the flaw already recorded against
step 10 — it and the 24H2 breakage are two faces of the same design.

---

## Replacing `wmic` on Windows

`Get-CimInstance` is Microsoft's documented replacement for `wmic`; the
underlying WMI class is unchanged. Candidates, all runnable through
`child_process` from CEP's Node with **no native module**:

| Source | Command | Elevation | Stability |
|---|---|---|---|
| **`MachineGuid`** | `reg query "HKLM\SOFTWARE\Microsoft\Cryptography" /v MachineGuid` | **No** — HKLM but world-readable | Per **OS install**. Survives hardware changes; changes on reinstall. |
| **SMBIOS UUID** (the `wmic` value) | `powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"` | **No** for local queries | Per **machine**. Same value `wmic` returned, so **existing bindings keep matching**. |
| BIOS serial | `powershell -NoProfile -Command "(Get-CimInstance Win32_BIOS).SerialNumber"` | No | Per machine; often blank or `To be filled by O.E.M.` on white-box builds. |
| Volume serial | `vol C:` | No | Changes on reformat. Weak. |

**Recommended: SMBIOS UUID via `Get-CimInstance`, falling back to
`MachineGuid`.** The first returns the *same string* `wmic` did, so machines
already bound keep working — that is the property that makes a migration
possible at all. `MachineGuid` is the backstop for machines where SMBIOS UUID
is absent or all-zeros (some VMs and OEM builds).

**Caveats to verify on real hardware, not from documentation:**

- Spawning `powershell.exe` costs ~200-600 ms cold. `getHWID` is called on
  every licence check, so it needs caching — but caching in a user-writable
  file is the current flaw. Cache **in memory for the session**.
- PowerShell may be constrained by execution policy or AppLocker in managed
  environments. `-NoProfile` helps; `reg query` avoids PowerShell entirely and
  is the more robust of the two.
- Some VMs report an all-zero or duplicated SMBIOS UUID. Duplicates across
  machines are worse than a missing value — they silently share an identity.

---

## macOS: same single point of failure, lower exposure

`ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID` is not deprecated
and has been stable for many macOS releases. `IOPlatformUUID` is the standard
per-machine identifier.

**But the exposure is structurally identical**: one `execSync` inside the same
`try`, so any failure — a shell issue, a sandbox restriction, a parse miss —
drops into the same random-identity fallback at step 5. The difference is
likelihood, not blast radius.

Two smaller macOS risks:

- The value is extracted with a regex over `grep` output. A format change
  breaks the parse, and the code cannot tell that apart from a missing value.
- `system_profiler SPHardwareDataType` exposes the same UUID as a documented
  alternative, but it is slower. Useful as a cross-check, not a primary.

Neither needs elevation.

---

## Why the client cannot fix this alone

1. **Drift is detectable; its cause is not.** Comparing `sys_id.txt` to a fresh
   hardware read is trivial. But "user edited it", "copied from another
   machine", "written by an older build", and "this machine cannot produce a
   hardware UUID" are indistinguishable from the client.
2. **On the broken machines there is nothing to prefer.** "Read hardware first"
   on a 24H2 box without `wmic` still fails, so it either reproduces the same
   fallback (no fix) or mints a new random ID (immediate lockout).
3. **The rebind path is gated on the value that changed.** `action=logout` is
   the only self-service unbind and it sends the current HWID. If the server
   matches the stored HWID before unbinding, a client that starts sending a
   different one cannot log out either — no self-service recovery, support
   becomes the only route. **Unconfirmed:** requires reading the Apps Script.
4. **The obvious middle ground is a no-op.** "Use hardware when it matches the
   file, else keep the file" leaves an attacker's edited file winning, since it
   is drifted by definition. It changes nothing for anyone.

---

## What the migration needs from the Apps Script

A client change alone causes the lockout. The server has to lead:

1. **Accept two identifiers during a transition.** The client sends both the
   stored value and a freshly computed hardware value (`hwid` plus a new
   `hwid2`). The server matches against **either**, and on a match through the
   old one, **re-anchors** the stored record to the new one. Existing bindings
   migrate silently on next contact.
2. **Prefer the hardware value once re-anchored**, so an edited `sys_id.txt`
   stops being authoritative — this is what actually closes the flaw.
3. **Ungate the rebind path**, or add one. Logout must not require a matching
   HWID, or a user whose identity legitimately changed can never recover
   without support. A password-authenticated rebind is the obvious shape and
   would also close the passwordless-logout hole recorded separately.
4. **Decide what happens to identities that cannot be re-anchored** — machines
   with no readable hardware UUID at all. Some fallback has to exist, and
   whatever it is becomes the weakest link.
5. **Watch for duplicate hardware UUIDs** while re-anchoring. VMs and some OEM
   batches share SMBIOS UUIDs; two customers colliding on one identity is worse
   than the current failure.

**Sequencing:** ship the server accepting both first, let clients circulate long
enough for most installs to re-anchor, then make the hardware value
authoritative. The client change is the last step, not the first.

---

## Confidence

- **Verified in this repo:** the failure chain, line numbers, fallback order,
  and that `sys_id.txt` short-circuits the hardware read.
- **General knowledge, not tested here:** `wmic` removal in Windows 11 24H2,
  `Get-CimInstance` as the replacement, `MachineGuid` semantics and
  permissions, `ioreg` stability. Confirm on real machines before relying on
  the table above.
- **Unknown, needs the Apps Script:** everything about server behaviour on
  mismatch, and whether logout is HWID-gated.

import { useState } from "react";

export type HostResult = { ok: boolean; message: string };

/**
 * Tracks busy/result state for host calls, one at a time.
 *
 * The caller supplies the evalTS call as a thunk so it keeps its own argument
 * and return types - this hook deliberately knows nothing about them.
 *
 * evalScript is callback-based and crosses to another process, so the panel
 * keeps painting while After Effects is blocked executing the script, which is
 * why showing a busy state is worth anything.
 */
export const useHostAction = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<HostResult | null>(null);

  const run = (key: string, call: () => Promise<HostResult>) => {
    if (busy) return;
    setBusy(key);
    setResult(null);

    call()
      .then((res) => setResult(res))
      .catch((e) => {
        setResult({
          ok: false,
          message:
            typeof e === "string" ? e : e?.message || "Unknown host error.",
        });
      })
      .then(() => setBusy(null));
  };

  return { busy, result, run };
};

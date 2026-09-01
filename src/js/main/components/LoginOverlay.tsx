import { useState } from "react";
import { KEYS, checkLicense, getHWID, isConfigured } from "./licenseStore";

/**
 * Activation overlay.
 *
 * Ported from #login-overlay in the shipped 1.4.0 markup. Note that the
 * deobfuscated dump force-hides this with `#login-overlay { display: none
 * !important }` in its head, so the dump cannot be used to compare licensing
 * behaviour - only the shipped .zxp can.
 */
export const LoginOverlay = ({ onActivated }: { onActivated: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // A build without .env values cannot reach the server at all. Say so instead
  // of showing a form that will always fail with a network error.
  if (!isConfigured()) {
    return (
      <div className="login-overlay">
        <div className="login-box panel">
          <h2>Licensing not configured</h2>
          <p className="login-note">
            This build was compiled without licensing credentials, so activation
            is unavailable. Copy <code>.env.example</code> to <code>.env</code>,
            fill in the values, and rebuild.
          </p>
        </div>
      </div>
    );
  }

  const activate = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (trimmedEmail === "" || trimmedEmail.indexOf("@") === -1) {
      return setStatus({ text: "Please enter a valid Email.", ok: false });
    }
    if (trimmedPassword === "") {
      return setStatus({ text: "Please enter a password.", ok: false });
    }

    setBusy(true);
    setStatus(null);
    const result = await checkLicense(trimmedEmail, getHWID(), trimmedPassword);
    setBusy(false);

    if (!result.success) {
      return setStatus({ text: result.msg, ok: false });
    }
    try {
      localStorage.setItem(KEYS.savedKey, trimmedEmail);
    } catch {
      // Without storage the activation cannot persist; the session still works.
    }
    setStatus({ text: "Success! Unlocking...", ok: true });
    setTimeout(onActivated, 1000);
  };

  return (
    <div className="login-overlay">
      <div className="login-box panel">
        <h2>Activation</h2>
        <p className="login-note">Create a password on your first login.</p>
        <input
          type="text"
          className="styled-input full-width pop-anim login-field"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="styled-input full-width pop-anim login-field"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") activate();
          }}
        />
        <button className="grad-btn pop-anim full-width" onClick={activate} disabled={busy}>
          {busy ? "Checking..." : "Activate"}
        </button>
        {status && (
          <p className={`login-status${status.ok ? " is-ok" : " is-error"}`}>
            {status.text}
          </p>
        )}
        {/*
          Inert until Valency has a store. The previous product's link went to
          its developer's Payhip page, which would have sold Valency users
          someone else's product.
        */}
        <p className="login-note" style={{ marginTop: "10px", marginBottom: 0 }}>
          Get License
        </p>
      </div>
    </div>
  );
};

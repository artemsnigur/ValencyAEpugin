import { openLinkInBrowser } from "../../lib/utils/bolt";
import { KEYS, getHWID, logoutLicense } from "./licenseStore";

const BUG_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSeqO-tHRqdJMWlBI-yXahbnbjyZPHY2eg4aL3GY5fy3PU3e4Q/viewform?usp=sharing&ouid=106577620163208559655";

/**
 * Support & License.
 *
 * Ported from the second panel of #tab-theme in AutoEditRestored/index.html.
 * Help / Guide is not ported: it opened a modal of screenshots from an `img/`
 * folder that is not part of this repo.
 */
export const LicensePanel = ({
  licenseKey,
  onLoggedOut,
  version,
}: {
  licenseKey: string;
  onLoggedOut: () => void;
  version: string;
}) => {
  const shown =
    licenseKey.length > 15 ? `${licenseKey.substring(0, 15)}...` : licenseKey;

  const logout = async () => {
    if (!confirm("Are you sure you want to log out?\nThis will unlink your license from this PC.")) {
      return;
    }
    await logoutLicense(licenseKey, getHWID());
    try {
      localStorage.removeItem(KEYS.savedKey);
    } catch {
      /* ignore */
    }
    onLoggedOut();
  };

  return (
    <div className="panel compact-panel">
      <h3 style={{ textAlign: "center", marginBottom: "10px" }}>Support &amp; License</h3>
      <div className="flex-buttons" style={{ marginBottom: "10px" }}>
        <button
          className="outline-btn pop-anim"
          style={{ flex: 1, fontSize: "10px" }}
          onClick={() => openLinkInBrowser(BUG_FORM)}
        >
          Report Bug
        </button>
      </div>
      <div className="flex-buttons" style={{ marginBottom: "10px" }}>
        <button
          className="grad-btn pop-anim"
          style={{ flex: 2, fontSize: "11px" }}
          onClick={() => openLinkInBrowser("https://www.instagram.com/sundxedit/")}
        >
          Follow Developer
        </button>
        <button className="outline-btn pop-anim logout-btn" onClick={logout}>
          Log Out
        </button>
      </div>
      <p className="license-line">
        License: {licenseKey ? shown : "Unregistered"} | Version {version}
      </p>
    </div>
  );
};

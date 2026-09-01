import { KEYS, getHWID, logoutLicense } from "./licenseStore";

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
      {/*
        Removed with the rebrand: "Report Bug" pointed at a Google Form owned by
        the previous product's developer, and "Follow Developer" at their
        Instagram. Both routed Valency users to a third party. A replacement bug
        link goes here when there is one.
      */}
      <div className="flex-buttons" style={{ marginBottom: "10px" }}>
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

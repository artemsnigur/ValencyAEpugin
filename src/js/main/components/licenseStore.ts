import { child_process, os } from "../../lib/cep/node";
import { csi } from "../../lib/utils/bolt";

export const KEYS = {
  savedKey: "saved-license-key",
  hwidCache: "sundx_hwid",
};

const PLACEHOLDER = "REPLACE_WITH_";

/**
 * Endpoint and shared key, injected at build time from .env.
 *
 * This keeps the values out of a public git history and does nothing else.
 * They are string-replaced into the bundle, so anyone with the packaged .zxp
 * can read them. Server-side checks are what protect the endpoint.
 */
const ENDPOINT = import.meta.env.VITE_LICENSE_ENDPOINT || "";
const SHARED_KEY = import.meta.env.VITE_LICENSE_KEY || "";

const configured = (value: string) =>
  value !== "" && value.indexOf(PLACEHOLDER) === -1;

/** False when this build has no usable licensing configuration. */
export const isConfigured = () => configured(ENDPOINT) && configured(SHARED_KEY);

/**
 * Machine identifier.
 *
 * Ported faithfully from getHWID() in AutoEditRestored/main.js:1468, flaw
 * intact and deliberately so. See LICENSING-HWID.md: the cached file wins over
 * the hardware read, which both defeats device binding and hides the fact that
 * `wmic` no longer exists on Windows 11 24H2. A client-only fix causes the
 * lockout it is meant to prevent, so this waits on the Apps Script.
 */
export const getHWID = (): string => {
  // SystemPath.MY_DOCUMENTS, the same path the shipped panel used.
  const documents = csi.getSystemPath("myDocuments") as string;
  const idFile = `${documents}/AutoEditPro/sys_id.txt`;

  try {
    const existing = window.cep.fs.readFile(idFile);
    if (existing.err === 0 && existing.data && existing.data.length > 5) {
      return existing.data.trim();
    }
  } catch {
    // Fall through to a hardware read.
  }

  let id = "";
  try {
    if (os.platform() === "win32") {
      const out = child_process.execSync("wmic csproduct get uuid", {
        encoding: "utf8",
      });
      const match = out.match(
        /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i
      );
      if (match) id = match[0];
    } else if (os.platform() === "darwin") {
      const out = child_process.execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
        { encoding: "utf8" }
      );
      const match = out.match(/"([^"]+)"$/m);
      if (match) id = match[1];
    }
    if (!id || id.length < 5) {
      id = `${os.hostname()}-${os.userInfo().username}`;
    }
    id = id.toUpperCase().trim();
  } catch {
    // Every hardware failure lands here, including the Windows 11 24H2 case
    // where wmic no longer exists.
    const cached = localStorage.getItem(KEYS.hwidCache);
    if (cached) {
      id = cached;
    } else {
      id = `AE-SYS-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substr(2, 6)
        .toUpperCase()}`;
      try {
        localStorage.setItem(KEYS.hwidCache, id);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    window.cep.fs.makedir(`${documents}/AutoEditPro`);
    window.cep.fs.writeFile(idFile, id);
  } catch {
    // Not fatal; the value is still used for this session.
  }
  return id;
};

export type LicenseCheck = { success: boolean; msg: string };

const call = async (params: Record<string, string>, timeoutMs: number) => {
  const query = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?${query}`, { signal: controller.signal });
    return (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }
};

/** Reply strings the server returns, mapped to what the user is told. */
const MESSAGES: Record<string, string> = {
  HWID_ERROR: "License is bound to another PC.",
  WRONG_PASSWORD: "Wrong Password.",
  BANNED: "Account Suspended.",
  DENIED: "Access denied.",
};

export const checkLicense = async (
  email: string,
  hwid: string,
  password: string
): Promise<LicenseCheck> => {
  try {
    const reply = await call(
      { email, hwid, pass: password, key: SHARED_KEY },
      15000
    );
    if (reply === "OK") return { success: true, msg: "" };
    return { success: false, msg: MESSAGES[reply] || "Email not found. Buy first." };
  } catch {
    return { success: false, msg: "Server Timeout. Try again." };
  }
};

export const logoutLicense = async (email: string, hwid: string) => {
  try {
    return await call({ email, hwid, key: SHARED_KEY, action: "logout" }, 10000);
  } catch {
    return "";
  }
};

/** Returns a reply only when the server says the session is no longer valid. */
export const silentCheck = async (
  email: string,
  hwid: string
): Promise<string> => {
  try {
    const reply = await call(
      { email, hwid, key: SHARED_KEY, action: "silent_check" },
      10000
    );
    return reply === "BANNED" || reply === "HWID_ERROR" || reply === "NOT_FOUND"
      ? reply
      : "";
  } catch {
    return "";
  }
};

/**
 * Latest published version, or "" if unavailable.
 *
 * Sent with no key, exactly as the original did - noted in the plan as the one
 * unauthenticated call to the endpoint.
 */
export const checkUpdate = async (): Promise<string> => {
  try {
    const reply = await call({ action: "check_update" }, 10000);
    if (reply === "" || reply.indexOf("Error") > -1 || reply.indexOf("DENIED") > -1) {
      return "";
    }
    return reply;
  } catch {
    return "";
  }
};

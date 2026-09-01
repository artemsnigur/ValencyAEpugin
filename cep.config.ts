import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

const config: CEP_Config = {
  version,
  id: "com.valency.motion",
  displayName: "Valency",
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "AEFT", version: "[0.0,99.9]" }, 
  ],

  type: "Panel",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 500,
  height: 550,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "Valency",
      autoVisible: true,
      width: 600,
      height: 650,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    // Self-signed. Installs show an untrusted-publisher warning naming the org
    // below - that is expected, and the reason these values are real rather
    // than placeholders: the warning should read "Valency", not "Company".
    //
    // vite-cep-plugin interpolates these into a shell command unquoted, so
    // every value here must stay a single token with no spaces.
    country: "PT",
    province: "Porto",
    org: "Valency",
    // Not a secret. It is the passphrase for a throwaway .p12 that ZXPSignCmd
    // generates into a temp directory at build time, uses once, and never
    // ships. Named so nobody mistakes it for a credential, or copies a literal
    // "password" somewhere it would matter.
    password: "selfsigned-not-a-secret",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: [],
  copyZipAssets: [],
};
export default config;

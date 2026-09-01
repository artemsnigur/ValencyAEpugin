import React from "react";
import ReactDOM from "react-dom/client";
import { initBolt } from "../lib/utils/bolt";
import "../index.scss";
import { App } from "./main";
import { applyStoredTheme } from "./components/themeStore";

// Applied before render: the shipped panel called loadTheme() from
// window.onload, which fires after first paint and visibly flashed the
// stylesheet defaults before the user's theme landed.
applyStoredTheme();

initBolt();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AutoTwixtor } from "./components/AutoTwixtor";
import { DuplicateFrames } from "./components/DuplicateFrames";
import { GraphEditor } from "./components/GraphEditor";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { PresetBrowser } from "./components/PresetBrowser";
import { RenderQueue } from "./components/RenderQueue";
import { ThemePanel } from "./components/ThemePanel";
import { ProjectUtilities } from "./components/ProjectUtilities";
import { evalTS } from "../lib/utils/bolt";
import "./main.scss";

type TabId =
  | "tab-twixtor"
  | "tab-graph"
  | "tab-presets"
  | "tab-render"
  | "tab-library"
  | "tab-theme";

type Tab = {
  id: TabId;
  label: string;
  /** The theme tab ships icon-only at a fixed width. */
  iconOnly?: boolean;
  /** Migration step that fills this tab in. */
  step: string;
};

// Order is taken verbatim from the shipped 1.4.0 markup and must not change
// until parity is reached - reordering is its own commit afterwards.
const TABS: Tab[] = [
  { id: "tab-twixtor", label: "Twixtor", step: "done" },
  { id: "tab-graph", label: "Graph", step: "done" },
  { id: "tab-presets", label: "Presets", step: "done" },
  { id: "tab-render", label: "Render", step: "done" },
  { id: "tab-library", label: "Library", step: "done" },
  { id: "tab-theme", label: "Theme", iconOnly: true, step: "done" },
];

const GearIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>(TABS[0].id);

  const navRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  // Measure the active button and slide the highlight under it. Same geometry
  // as updateActiveBg() in the shipped panel: width from the button, offset
  // from its position within the nav bar.
  const positionIndicator = useCallback(() => {
    const btn = btnRefs.current[activeTab];
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!btn || !nav || !indicator) return;

    const btnBox = btn.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    // A hidden or not-yet-laid-out panel measures zero; leave the highlight
    // where it is rather than collapsing it.
    if (btnBox.width === 0) return;

    indicator.style.width = `${btnBox.width}px`;
    indicator.style.transform = `translateX(${btnBox.left - navBox.left}px)`;
    indicator.style.opacity = "1";
  }, [activeTab]);

  useLayoutEffect(positionIndicator, [positionIndicator]);

  // Forward undo/redo to After Effects while the panel has focus.
  //
  // Without this Cmd+Z does nothing here: the panel is a separate CEF process,
  // so the keystroke never reaches the host. The shipped panel did the same.
  //
  // One deliberate difference: it skips editable fields. The original
  // intercepted every Cmd+Z, so pressing it while typing in a search box or
  // the render prefix sent an undo to After Effects instead of undoing your
  // typing.
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node || !node.tagName) return false;
      const tag = node.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || node.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      evalTS(e.shiftKey ? "redo" : "undo").catch(() => {
        // Nothing useful to say if the host call fails - the keystroke is lost
        // either way, and a dialog here would be worse than silence.
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // CEP panels are resized by the host, and the panel can be laid out while
  // hidden, so re-measure on any nav-bar size change rather than on window
  // resize alone.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(positionIndicator);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [positionIndicator]);

  return (
    <>
      <div className="nav-bar" ref={navRef}>
        <div className="active-bg" ref={indicatorRef} />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              btnRefs.current[tab.id] = el;
            }}
            className={[
              "tab-btn",
              tab.iconOnly ? "icon-btn" : "",
              activeTab === tab.id ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.iconOnly ? tab.label : undefined}
          >
            {tab.iconOnly ? <GearIcon /> : tab.label}
          </button>
        ))}
      </div>

      <div className="content-area">
        {TABS.map((tab) =>
          activeTab === tab.id ? (
            <div key={tab.id} id={tab.id} className="tab-content">
              {tab.id === "tab-twixtor" ? (
                <>
                  <DuplicateFrames />
                  <AutoTwixtor />
                </>
              ) : tab.id === "tab-graph" ? (
                <GraphEditor />
              ) : tab.id === "tab-theme" ? (
                <ThemePanel />
              ) : tab.id === "tab-library" ? (
                <LibraryBrowser />
              ) : tab.id === "tab-presets" ? (
                <PresetBrowser />
              ) : tab.id === "tab-render" ? (
                <>
                  <RenderQueue />
                  <ProjectUtilities />
                </>
              ) : (
                <p className="tab-placeholder">
                  {tab.label}
                  <br />
                  lands in {tab.step}
                </p>
              )}
            </div>
          ) : null
        )}
      </div>
    </>
  );
};

import { useEffect, useRef, useState } from "react";
import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  LibEntry,
  VIDEO_EXTS,
  extOf,
  fileUrl,
} from "./libraryStore";

/**
 * How long an off-screen card keeps its decoder before releasing it. Long
 * enough to outlast a resize drag or a fast scroll, short enough that memory
 * still comes back down promptly.
 */
const RELEASE_DELAY_MS = 500;

type Props = {
  entry: LibEntry;
  favourite: boolean;
  deleteMode: boolean;
  playing: boolean;
  onToggleStar: (path: string) => void;
  onHide: (path: string) => void;
  onImport: (path: string) => void;
  onPlayAudio: (path: string) => void;
};

/**
 * One media tile.
 *
 * Preview elements load only while near the viewport and are released again
 * when they leave it. The shipped panel managed videos this way but emitted
 * images with a plain `src` and `loading="lazy"`, which never releases - its
 * image-unload branch was unreachable because the selector required
 * `[data-src]`. Both are managed here.
 */
export const LibraryCard = ({
  entry,
  favourite,
  deleteMode,
  playing,
  onToggleStar,
  onHide,
  onImport,
  onPlayAudio,
}: Props) => {
  const ext = extOf(entry.name);
  const isVideo = VIDEO_EXTS.indexOf(ext) > -1;
  const isImage = IMAGE_EXTS.indexOf(ext) > -1;
  const isAudio = AUDIO_EXTS.indexOf(ext) > -1;

  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new source is a new chance to succeed - re-entering the viewport should
  // not inherit a previous failure.
  useEffect(() => {
    if (near) setFailed(false);
  }, [near, entry.path]);

  useEffect(() => {
    const node = ref.current;
    if (!node || (!isVideo && !isImage)) return;

    // Entering is immediate; leaving waits. Resizing the panel reflows the grid
    // and moves every card, so without the delay cards cross the band boundary
    // mid-drag and their src is torn down and re-set repeatedly - the flicker
    // that made resizing a media folder look broken. Fast scrolling had the
    // same problem in milder form.
    let release: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (release) clearTimeout(release);
          setNear(true);
        } else {
          if (release) clearTimeout(release);
          release = setTimeout(() => setNear(false), RELEASE_DELAY_MS);
        }
      },
      // The shipped panel used a 600px band above and below; same here.
      { root: null, rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => {
      if (release) clearTimeout(release);
      observer.disconnect();
    };
  }, [isVideo, isImage]);

  const src = fileUrl(entry.path);

  return (
    <div
      ref={ref}
      className={`lib-item-container pop-anim${deleteMode ? " delete-target" : ""}`}
      title={entry.name}
      onClick={() => {
        if (deleteMode) return onHide(entry.path);
        if (isAudio) onPlayAudio(entry.path);
      }}
      onDoubleClick={() => {
        if (!deleteMode) onImport(entry.path);
      }}
    >
      <div className={`lib-file${playing ? " playing-active" : ""}`}>
        <div
          className={`lib-star${favourite ? " active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(entry.path);
          }}
        >
          ★
        </div>

        {/*
          Three states, deliberately distinguishable. The shipped panel had no
          onError at all, so an unreadable file rendered as an empty tile that
          looked identical to one still waiting to lazy-load.
        */}
        {isVideo &&
          (failed ? (
            <div className="lib-broken" title="Preview unavailable">!</div>
          ) : near ? (
            <video
              src={src}
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="lib-placeholder" />
          ))}

        {isImage &&
          (failed ? (
            <div className="lib-broken" title="Preview unavailable">!</div>
          ) : near ? (
            <img
              src={src}
              alt={entry.name}
              className="lib-thumb"
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="lib-placeholder" />
          ))}

        {isAudio && (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="white" className="lib-type-icon">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        )}

        {!isVideo && !isImage && !isAudio && (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="white" className="lib-type-icon faint">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        )}

        <div className="media-badge">{ext.toUpperCase()}</div>
        {isAudio && (
          <div className="audio-progress-bar">
            <div className="audio-progress-fill" />
          </div>
        )}
      </div>
      <span className="lib-name">{entry.name}</span>
    </div>
  );
};

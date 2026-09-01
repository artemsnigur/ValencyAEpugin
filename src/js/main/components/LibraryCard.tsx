import { useEffect, useRef, useState } from "react";
import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  LibEntry,
  VIDEO_EXTS,
  extOf,
  fileUrl,
} from "./libraryStore";

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

  useEffect(() => {
    const node = ref.current;
    if (!node || (!isVideo && !isImage)) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0].isIntersecting),
      // The shipped panel used a 600px band above and below; same here.
      { root: null, rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
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

        {isVideo &&
          (near ? (
            <video src={src} muted loop playsInline preload="metadata" />
          ) : (
            <div className="lib-placeholder" />
          ))}

        {isImage &&
          (near ? (
            <img src={src} alt={entry.name} className="lib-thumb" />
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

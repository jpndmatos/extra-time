import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { request, type Goal } from "./types";

type Clip = NonNullable<Goal["media"]>;
const metadata = new Map<string, { at: number; promise: Promise<Clip> }>();
export function warmClip(media: Goal["media"]) {
  if (media?.kind !== "resolve") return Promise.resolve(media);
  const cached = metadata.get(media.url);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.promise;
  const promise = request<Clip>("/api/media", {
    method: "POST",
    body: JSON.stringify({ url: media.url }),
  });
  metadata.set(media.url, { at: Date.now(), promise });
  promise.catch(() => metadata.delete(media.url));
  if (metadata.size > 64) metadata.delete(metadata.keys().next().value!);
  return promise;
}

export default function ClipPlayback({
  media,
  title,
  sourceUrl,
}: {
  media: NonNullable<Goal["media"]>;
  title: string;
  sourceUrl: string;
}) {
  const [resolved, setResolved] = useState<Goal["media"]>(
    media.kind === "resolve" ? null : media,
  );
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    if (resolved?.kind !== "video") return;
    const element = video.current;
    if (!element) return;
    element.muted = true;
    element.play().catch(() => setNeedsPlay(true));
  }, [resolved?.url]);
  useEffect(() => {
    if (media.kind !== "resolve") {
      setResolved(media);
      return;
    }
    let active = true;
    setResolved(null);
    setError("");
    warmClip(media)
      .then((value) => {
        if (active) setResolved(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [media.kind, media.url]);
  if (error)
    return (
      <div className="stage-message">
        <h2>Try the original clip</h2>
        <p role="alert">{error}</p>
        <a
          className="primary"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Reddit thread
          <ExternalLink size={15} />
        </a>
      </div>
    );
  if (!resolved)
    return (
      <div className="stage-message" role="status">
        <h2>Loading the goal…</h2>
        <p>Connecting to the original clip host.</p>
      </div>
    );
  if (resolved.kind === "video")
    return (
      <>
        <video
          ref={video}
          className="goal-video"
          controls
          autoPlay
          muted
          playsInline
          preload="auto"
          aria-label={title}
          src={resolved.url}
          onError={() =>
            setError(
              "The original host could not play this clip. It may have been removed or restricted.",
            )
          }
          onPlaying={() => setNeedsPlay(false)}
        />
        {needsPlay && (
          <button
            className="primary autoplay-retry"
            onClick={() =>
              video.current?.play().catch(() => setNeedsPlay(true))
            }
          >
            Play goal
          </button>
        )}
      </>
    );
  return (
    <iframe
      src={autoplayUrl(resolved.url)}
      title={title}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}

function autoplayUrl(value: string) {
  const url = new URL(value);
  if (url.hostname === "streamable.com") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("muted", "1");
  }
  if (url.hostname === "www.youtube-nocookie.com") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("playsinline", "1");
  }
  return url.href;
}

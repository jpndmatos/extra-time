import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { request, type Clip, type ClipSource, type Goal } from "./types";
import { clipSources } from "./clipSources";

const metadata = new Map<string, { at: number; promise: Promise<Clip> }>();
export function warmClip(media: Goal["media"], refresh = false) {
  if (media?.kind !== "resolve") return Promise.resolve(media);
  const cached = metadata.get(media.url);
  if (!refresh && cached && Date.now() - cached.at < 10 * 60_000)
    return cached.promise;
  const promise = request<Clip>("/api/media", {
    method: "POST",
    body: JSON.stringify({ url: media.url, refresh }),
    signal: AbortSignal.timeout(14_000),
  });
  metadata.set(media.url, { at: Date.now(), promise });
  promise.catch(() => {
    if (metadata.get(media.url)?.promise === promise)
      metadata.delete(media.url);
  });
  if (metadata.size > 64) metadata.delete(metadata.keys().next().value!);
  return promise;
}

export default function ClipPlayback({
  media,
  mirrors,
  alternatives = [],
  title,
  sourceUrl,
}: {
  media: Clip;
  mirrors?: ClipSource[] | null;
  alternatives?: string[];
  title: string;
  sourceUrl: string;
}) {
  const sources = clipSources(media, sourceUrl, mirrors ?? []);
  const [failed, setFailed] = useState<string[]>([]);
  const [lastError, setLastError] = useState("");
  const [retry, setRetry] = useState(0);
  const current = sources.find((source) => !failed.includes(source.media.url));
  const next = sources.find(
    (source) =>
      source.media.url !== current?.media.url &&
      !failed.includes(source.media.url),
  );
  useEffect(() => {
    if (next) void warmClip(next.media).catch(() => {});
  }, [next?.media.url]);
  const fail = useCallback(
    (reason: string) => {
      if (!current) return;
      setLastError(reason);
      setFailed((previous) =>
        previous.includes(current.media.url)
          ? previous
          : [...previous, current.media.url],
      );
    },
    [current?.media.url],
  );
  if (!current)
    return (
      <div className="stage-message playback-exhausted">
        <h2>No working clip right now</h2>
        <p role="alert">
          {lastError || "The available hosts could not play this goal."}
        </p>
        <p>
          All {sources.length} available{" "}
          {sources.length === 1 ? "source was" : "sources were"} tried. The
          original posts may have newer mirrors.
        </p>
        <div className="playback-actions">
          <button
            className="primary"
            onClick={() => {
              sources.forEach((source) => metadata.delete(source.media.url));
              setFailed([]);
              setRetry((value) => value + 1);
            }}
          >
            <RefreshCw size={15} />
            Retry sources
          </button>
          <a
            className="quiet"
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Original post
            <ExternalLink size={15} />
          </a>
          {alternatives
            .filter((url) => url !== sourceUrl)
            .slice(0, 3)
            .map((url, index) => (
              <a
                className="quiet"
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Alternate post {index + 1}
                <ExternalLink size={14} />
              </a>
            ))}
        </div>
      </div>
    );
  const number = sources.indexOf(current) + 1;
  return (
    <>
      <PlayerAttempt
        key={`${current.media.url}-${retry}`}
        media={current.media}
        title={title}
        onFailure={fail}
        refresh={retry > 0}
      />
      <div className="playback-tools">
        <span role="status">
          {failed.length ? "Backup · " : ""}Source {number}/{sources.length}
        </span>
        <a
          href={current.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open Reddit post for source ${number}`}
        >
          <ExternalLink size={13} />
        </a>
        <button
          onClick={() => fail("Playback did not work in this host’s player.")}
        >
          {sources.length > number ? "Try next source" : "Clip not playing?"}
        </button>
      </div>
    </>
  );
}

function PlayerAttempt({
  media,
  title,
  onFailure,
  refresh,
}: {
  media: Clip;
  title: string;
  onFailure: (reason: string) => void;
  refresh: boolean;
}) {
  const [resolved, setResolved] = useState<Clip | null>(
    media.kind === "resolve" ? null : media,
  );
  const [needsPlay, setNeedsPlay] = useState(false);
  const [renew, setRenew] = useState(0);
  const renewed = useRef(false);
  const handlingFailure = useRef(false);
  const frameLoaded = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDeadline = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const recover = useCallback(
    (reason: string) => {
      if (handlingFailure.current) return;
      handlingFailure.current = true;
      clearDeadline();
      // An expired CDN URL gets one fresh publisher lookup before moving on.
      if (media.kind === "resolve" && !renewed.current) {
        renewed.current = true;
        setResolved(null);
        setRenew((value) => value + 1);
      } else onFailure(reason);
    },
    [media.kind, onFailure, clearDeadline],
  );
  const armDeadline = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      recover(
        "The clip stopped responding. Please try another source or retry later.",
      );
    }, 15_000);
  }, [recover]);
  useEffect(() => {
    let active = true;
    handlingFailure.current = false;
    setNeedsPlay(false);
    if (media.kind !== "resolve") {
      setResolved(media);
      return;
    }
    setResolved(null);
    warmClip(media, refresh || renew > 0)
      .then((value) => {
        if (active) setResolved(value);
      })
      .catch(() => {
        if (active)
          onFailure("The original clip host could not load this goal.");
      });
    return () => {
      active = false;
    };
  }, [media.kind, media.url, refresh, renew, onFailure]);
  useEffect(() => {
    if (!resolved) return;
    let active = true;
    if (resolved.kind !== "embed" || !frameLoaded.current) armDeadline();
    if (resolved.kind === "video") {
      const element = video.current;
      if (element) {
        element.muted = true;
        element.play().catch((error) => {
          if (!active) return;
          if (error.name === "NotAllowedError") {
            clearDeadline();
            setNeedsPlay(true);
          } else if (error.name !== "AbortError")
            recover("This video could not be played.");
        });
      }
    }
    return () => {
      active = false;
      clearDeadline();
    };
  }, [resolved?.url, renew, armDeadline, clearDeadline, recover]);
  if (!resolved)
    return (
      <div className="stage-message" role="status">
        <h2>{renew ? "Refreshing the clip…" : "Loading the goal…"}</h2>
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
            recover("The video was removed, restricted or could not be loaded.")
          }
          onPlaying={() => {
            clearDeadline();
            setNeedsPlay(false);
          }}
          onTimeUpdate={() => {
            if (
              video.current &&
              !video.current.paused &&
              video.current.readyState >= 3
            )
              clearDeadline();
          }}
          onWaiting={() => {
            if (!video.current?.paused) armDeadline();
          }}
          onStalled={() => {
            if (!video.current?.paused) armDeadline();
          }}
          onPause={clearDeadline}
          onEnded={clearDeadline}
        />
        {needsPlay && (
          <button
            className="primary autoplay-retry"
            onClick={() =>
              video.current
                ?.play()
                .then(() => setNeedsPlay(false))
                .catch(() => setNeedsPlay(true))
            }
          >
            Play goal
          </button>
        )}
      </>
    );
  // Cross-origin frames cannot expose their internal video errors. onLoad only
  // confirms the frame arrived; the source switch stays available to the viewer.
  return (
    <iframe
      src={autoplayUrl(resolved.url)}
      title={title}
      onLoad={() => {
        frameLoaded.current = true;
        clearDeadline();
      }}
      onError={() => recover("The embedded player could not load.")}
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

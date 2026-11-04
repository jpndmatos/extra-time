import { useState } from "react";
import type { Team } from "./types";
import { appBase } from "./api";

export default function TeamCrest({
  team,
  src,
  large = false,
}: {
  team?: Team;
  src?: string | null;
  large?: boolean;
}) {
  const candidates = [
    ...new Set(
      [src, team?.crest]
        .filter((url): url is string => !!url)
        .flatMap((url) => {
          const alternate =
            /^https:\/\/crests\.football-data\.org\/\d+\.(?:png|svg)$/.test(url)
              ? url.replace(/\.(png|svg)$/, (_, format) =>
                  format === "png" ? ".svg" : ".png",
                )
              : null;
          return alternate ? [url, alternate] : [url];
        }),
    ),
  ];
  const [failed, setFailed] = useState<string[]>([]);
  const url = candidates.find((candidate) => !failed.includes(candidate));
  return (
    <span className={`team-crest${large ? " large" : ""}`} aria-hidden="true">
      {url ? (
        <img
          src={url.startsWith("/crests/") ? `${appBase}${url.slice(1)}` : url}
          alt=""
          width={large ? 36 : 22}
          height={large ? 36 : 22}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((previous) => [...previous, url])}
        />
      ) : (
        <span className="crest-fallback">
          {team?.shortName.slice(0, 3) || "FC"}
        </span>
      )}
    </span>
  );
}

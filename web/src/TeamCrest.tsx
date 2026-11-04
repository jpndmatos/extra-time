import { useState } from "react";
import type { Team } from "./types";

// Football-data's club IDs are stable; fixtures supply crests for other clubs.
const clubIds: Record<string, number> = {
  benfica: 1903,
  porto: 503,
  sporting: 498,
  braga: 561,
  arsenal: 57,
  liverpool: 64,
  chelsea: 61,
  "man-city": 65,
  "man-utd": 66,
  tottenham: 73,
  newcastle: 67,
  "aston-villa": 58,
  "real-madrid": 86,
  barcelona: 81,
  atletico: 78,
  psg: 524,
  marseille: 516,
  bayern: 5,
  dortmund: 4,
  leverkusen: 3,
  inter: 108,
  milan: 98,
  juventus: 109,
  napoli: 113,
};
export default function TeamCrest({
  team,
  src,
  large = false,
}: {
  team?: Team;
  src?: string | null;
  large?: boolean;
}) {
  const url =
    src ||
    team?.crest ||
    (team && clubIds[team.id]
      ? `https://crests.football-data.org/${clubIds[team.id]}.svg`
      : "");
  const [failed, setFailed] = useState("");
  return (
    <span className={`team-crest${large ? " large" : ""}`} aria-hidden="true">
      {url && failed !== url ? (
        <img
          src={url}
          alt=""
          width={large ? 36 : 22}
          height={large ? 36 : 22}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(url)}
        />
      ) : (
        <span className="crest-fallback">
          {team?.shortName.slice(0, 3) || "FC"}
        </span>
      )}
    </span>
  );
}

import { memo, useEffect, useRef } from "react";
import { Check, EyeOff, Star } from "lucide-react";
import TeamCrest from "./TeamCrest";
import { warmClip } from "./ClipPlayback";
import type { Goal, Team } from "./types";

type Props = {
  goal: Goal;
  home?: Team;
  away?: Team;
  homeName: string;
  awayName: string;
  homeCrest?: string | null;
  awayCrest?: string | null;
  hidden: boolean;
  watched: boolean;
  selected: boolean;
  onSelect: (goal: Goal, keyboard: boolean) => void;
};

// Selecting a clip should update its two affected rows, not every badge in the feed.
export default memo(function GoalRow({
  goal,
  home,
  away,
  homeName,
  awayName,
  homeCrest,
  awayCrest,
  hidden,
  watched,
  selected,
  onSelect,
}: Props) {
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelWarm = () => {
    clearTimeout(intent.current);
    intent.current = undefined;
  };
  function prepare() {
    cancelWarm();
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (hidden || connection?.saveData) return;
    // A brief hover/focus signals intent; merely crossing the list should not fetch clips.
    intent.current = setTimeout(() => {
      void warmClip(goal.media).catch(() => {});
    }, 150);
  }
  useEffect(() => cancelWarm, [goal.id, hidden]);
  return (
    <button
      type="button"
      data-goal-id={goal.id}
      className={`goal-row${selected ? " selected" : ""}${watched ? " watched" : ""}`}
      onClick={(event) => {
        cancelWarm();
        onSelect(goal, event.detail === 0);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") prepare();
      }}
      onPointerLeave={cancelWarm}
      onFocus={prepare}
      onBlur={cancelWarm}
      aria-pressed={selected}
      aria-label={`${homeName} ${hidden ? "versus" : `${goal.homeScore}–${goal.awayScore}`} ${awayName}${hidden ? ", reveal goal" : `, ${goal.minute || "unknown"} minutes, ${goal.scorer}${goal.watchReason ? `, ${goal.watchReason}` : ""}`}${watched ? ", watched" : ""}`}
    >
      <span className="goal-minute">
        {hidden ? (
          <EyeOff size={15} />
        ) : goal.minute ? (
          `${goal.minute}′`
        ) : (
          "Goal"
        )}
      </span>
      <span className="goal-copy">
        <span className="goal-matchup">
          {[
            {
              team: home,
              name: homeName,
              crest: homeCrest,
              score: goal.homeScore,
            },
            {
              team: away,
              name: awayName,
              crest: awayCrest,
              score: goal.awayScore,
            },
          ].map(({ team, name, crest, score }, side) => (
            <span className="goal-team" key={side}>
              <TeamCrest team={team} src={crest} />
              <span className="goal-team-name" title={name}>
                {name}
              </span>
              <b>{hidden ? "—" : score}</b>
            </span>
          ))}
        </span>
        <strong title={hidden ? undefined : goal.scorer}>
          {hidden ? "Goal details hidden" : goal.scorer}
        </strong>
        {!hidden && (goal.watchReason || goal.alternatives.length > 0) && (
          <small>
            {goal.watchReason && (
              <span
                className="watch-tag"
                title="Label from a Reddit post title"
              >
                <Star size={11} />
                {goal.watchReason}
              </span>
            )}
            {goal.alternatives.length > 0 && (
              <span>{goal.alternatives.length} alternate</span>
            )}
          </small>
        )}
      </span>
      {watched && (
        <span
          className="queue-play"
          aria-hidden="true"
          title={watched ? "Watched" : "Unwatched"}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
});

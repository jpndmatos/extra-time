import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Goal as GoalIcon,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import ClipPlayback, { warmClip } from "./ClipPlayback";
import TeamCrest from "./TeamCrest";
import { clubCrest } from "./goalCategories";
import { searchGoals } from "./goalNavigation";
import { matchGoals } from "./matchGoals";
import { useCompactPlayer } from "./useCompactPlayer";
import { useLiveFeed } from "./useLiveFeed";
import { useMatchday } from "./useMatchday";
import { request, type Dashboard, type Goal, type Preferences } from "./types";

const empty: Preferences = {
  teams: [],
  matches: [],
  watched: [],
  spoilers: false,
};
function samplePreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("touchline.sample") || "null",
    );
    if (
      value &&
      Array.isArray(value.watched) &&
      Array.isArray(value.teams) &&
      Array.isArray(value.matches)
    )
      return value;
  } catch {
    /* Storage is optional. */
  }
  return empty;
}

export default function App() {
  const initial = new URLSearchParams(location.search);
  const sample = initial.get("sample") === "true";
  const { day, followingToday } = useMatchday(
    sample ? initial.get("day") : null,
  );
  const compact = useCompactPlayer();
  const [data, setData] = useState<Dashboard | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(
    sample ? samplePreferences : empty,
  );
  const latest = useRef(prefs);
  latest.current = prefs;
  const [ready, setReady] = useState(sample);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [preferencesRetry, setPreferencesRetry] = useState(0);
  const writes = useRef(Promise.resolve());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePlayer, setMobilePlayer] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [query, setQuery] = useState((initial.get("q") || "").slice(0, 100));
  const [revealed, setRevealed] = useState<string[]>([]);
  const [newCount, setNewCount] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const seenAccordion = useRef<HTMLDetailsElement>(null);
  const connections = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const panel = connections.current;
      if (!panel?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        panel.open = false;
        panel.querySelector("summary")?.focus();
      } else if (!panel.contains(event.target as Node)) panel.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);

  const live = useLiveFeed(day, sample, (next) => {
    if (known.current) {
      const matching = searchGoals(
        next.goals.filter((goal) => !latest.current.watched.includes(goal.id)),
        next.teams,
        query,
        latest.current.spoilers,
        revealed,
      );
      const added = matching.filter(
        (goal) => !known.current!.has(goal.id),
      ).length;
      if (added) setNewCount((count) => count + added);
    }
    known.current = new Set(next.goals.map((goal) => goal.id));
    setData(next);
    setLoading(false);
    setError("");
  });
  useEffect(() => {
    const params = new URLSearchParams();
    if (sample) params.set("sample", "true");
    if (sample && !followingToday) params.set("day", day);
    if (query.trim()) params.set("q", query.trim());
    history.replaceState(
      null,
      "",
      `${location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }, [sample, day, followingToday, query]);
  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    request<Preferences>("/api/preferences", { signal: controller.signal })
      .then((value) => {
        setPrefs(value);
        setReady(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setWriteError(error.message);
      });
    return () => controller.abort();
  }, [sample, preferencesRetry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    request<Dashboard>(
      `/api/dashboard?day=${encodeURIComponent(day)}&sample=${sample}`,
      { signal: controller.signal },
    )
      .then((value) => {
        known.current ??= new Set(value.goals.map((goal) => goal.id));
        setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, sample, refresh]);
  function save(next: Preferences) {
    setPrefs(next);
    latest.current = next;
    setWriteError("");
    if (sample) {
      try {
        localStorage.setItem("touchline.sample", JSON.stringify(next));
      } catch {
        setWriteError(
          "Browser storage is unavailable. Seen goals will last for this visit.",
        );
      }
      return;
    }
    writes.current = writes.current.then(async () => {
      try {
        await request("/api/preferences", {
          method: "PUT",
          body: JSON.stringify(next),
        });
      } catch (error) {
        setWriteError(
          error instanceof Error
            ? error.message
            : "Your viewing preferences could not be saved.",
        );
      }
    });
  }
  function markSeen(goal: Goal) {
    if (
      !ready ||
      (latest.current.spoilers && !revealed.includes(goal.id)) ||
      latest.current.watched.includes(goal.id)
    )
      return;
    save({
      ...latest.current,
      watched: [...latest.current.watched, goal.id].slice(-1000),
    });
  }
  function select(goal: Goal) {
    if (latest.current.watched.includes(goal.id) && seenAccordion.current)
      seenAccordion.current.open = true;
    setSelectedId(goal.id);
    setMobilePlayer(true);
    setNewCount(0);
    markSeen(goal);
  }
  const goals = data
    ? searchGoals(data.goals, data.teams, query, prefs.spoilers, revealed)
    : [];
  const unseenGoals = goals.filter((goal) => !prefs.watched.includes(goal.id));
  const seenGoals = goals.filter((goal) => prefs.watched.includes(goal.id));
  const selected =
    data?.goals.find((goal) => goal.id === selectedId) || goals[0];
  const hideScore = !!(
    prefs.spoilers &&
    selected &&
    !revealed.includes(selected.id)
  );
  const match = matchGoals(data, selected);
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selectedId, selected?.id]);
  useEffect(() => {
    if (selected && (!compact || mobilePlayer)) markSeen(selected);
  }, [selected?.id, ready, compact, mobilePlayer, hideScore]);
  useEffect(() => {
    const container = list.current;
    const active = container?.querySelector<HTMLElement>(".goal-row.selected");
    if (
      !container ||
      !active ||
      !container.clientHeight ||
      !active.getClientRects().length
    )
      return;
    const bounds = container.getBoundingClientRect(),
      row = active.getBoundingClientRect();
    if (row.top < bounds.top) container.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom)
      container.scrollTop += row.bottom - bounds.bottom;
  }, [selected?.id, mobilePlayer]);
  useEffect(() => {
    if (!cinema) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCinema(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [cinema]);
  const club = (id: string) => data?.teams.find((team) => team.id === id);
  const name = (id: string) =>
    club(id)?.name ||
    data?.goals.find((goal) => goal.homeId === id)?.homeName ||
    data?.goals.find((goal) => goal.awayId === id)?.awayName ||
    id;
  const minute = (goal: Goal) => (goal.minute ? `${goal.minute}′` : "Goal");

  function renderGoal(goal: Goal) {
    const hidden = prefs.spoilers && !revealed.includes(goal.id),
      watched = prefs.watched.includes(goal.id);
    return (
      <button
        type="button"
        key={goal.id}
        data-goal-id={goal.id}
        className={`goal-row${selected?.id === goal.id ? " selected" : ""}${watched ? " watched" : ""}`}
        onClick={(event) => {
          if (event.detail === 0) list.current?.focus();
          select(goal);
        }}
        onPointerEnter={() => {
          if (!hidden) void warmClip(goal.media).catch(() => {});
        }}
        onFocus={() => {
          if (!hidden) void warmClip(goal.media).catch(() => {});
        }}
        aria-pressed={selected?.id === goal.id}
        aria-label={`${name(goal.homeId)} ${hidden ? "versus" : `${goal.homeScore}–${goal.awayScore}`} ${name(goal.awayId)}${hidden ? ", reveal goal" : `, ${goal.minute || "unknown"} minutes`}${watched ? ", watched" : ""}`}
      >
        <span className="goal-minute">
          {hidden ? <EyeOff size={15} /> : minute(goal)}
        </span>
        <span className="goal-copy">
          <span className="goal-matchup">
            {[goal.homeId, goal.awayId].map((id, side) => (
              <span className="goal-team" key={`${side}-${id}`}>
                <TeamCrest
                  team={club(id)}
                  src={clubCrest(club(id), data?.teams || [], name(id))}
                />
                <span className="goal-team-name" title={name(id)}>
                  {name(id)}
                </span>
                <b>
                  {hidden ? "—" : side === 0 ? goal.homeScore : goal.awayScore}
                </b>
              </span>
            ))}
          </span>
          <strong>{hidden ? "Goal details hidden" : goal.scorer}</strong>
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
        <span
          className="queue-play"
          aria-hidden="true"
          title={watched ? "Watched" : "Unwatched"}
        >
          {watched && selected?.id !== goal.id ? (
            <Check size={13} />
          ) : (
            <Play
              size={13}
              fill={selected?.id === goal.id ? "currentColor" : "none"}
            />
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="app-shell goal-hub">
      <a className="skip-link" href="#main">
        Skip to goals
      </a>
      <header className="topbar goal-hub-header">
        <div className="header-browse">
          <a className="brand" href="/" aria-label="Touchline home">
            <img
              className="brand-mark"
              src="/icon.svg"
              width="32"
              height="32"
              alt=""
            />
          </a>
        </div>
        <label className="goal-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchInput}
            name="goal-search"
            type="search"
            aria-label="Search goals"
            placeholder={prefs.spoilers ? "Find a team" : "Find team or scorer"}
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
              }
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear goal search"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="header-utilities">
          <div className="header-tools" role="group" aria-label="Goal controls">
            <div className="heading-actions">
              <button
                type="button"
                className="icon-button spoiler-toggle"
                title={prefs.spoilers ? "Show spoilers" : "Hide spoilers"}
                aria-label={prefs.spoilers ? "Show spoilers" : "Hide spoilers"}
                aria-pressed={prefs.spoilers}
                disabled={!ready}
                onClick={() =>
                  save({ ...latest.current, spoilers: !prefs.spoilers })
                }
              >
                {prefs.spoilers ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="button"
              className="icon-button refresh"
              title="Refresh goals"
              aria-label="Refresh goals"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <details className="connection-status" ref={connections}>
            <summary aria-label="Connections and refresh status">
              {sample ? (
                <span className="connection-label">Sample</span>
              ) : (
                data?.sources.map((source) => (
                  <span
                    className="source-summary"
                    key={source.name}
                    title={`${source.name}: ${source.state}`}
                  >
                    <span
                      className="connection-dot"
                      data-state={
                        live.state === "offline"
                          ? "offline"
                          : /partial|unavailable/i.test(source.message)
                            ? "waiting"
                            : source.state
                      }
                    />
                    <span>
                      {source.name === "Reddit"
                        ? /RSS|public feed/i.test(source.message)
                          ? "Reddit RSS"
                          : "Reddit API"
                        : "Fixtures"}
                    </span>
                  </span>
                ))
              )}
              <time dateTime={data?.updatedAt}>
                {data
                  ? new Date(data.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "…"}
              </time>
            </summary>
            <div className="connection-panel">
              <strong>Connections</strong>
              {data?.sources.map((source) => {
                const publicFeed = /RSS|public feed/i.test(source.message);
                return (
                  <div className="connection-source" key={source.name}>
                    <div>
                      <span
                        className="connection-dot"
                        data-state={source.state}
                      />
                      <b>
                        {source.name === "Reddit"
                          ? publicFeed
                            ? "Reddit · public feed"
                            : "Reddit API"
                          : "Football-data API"}
                      </b>
                      <span>
                        {sample
                          ? "Sample"
                          : /partial|unavailable/i.test(source.message) &&
                              source.state === "connected"
                            ? "partial"
                            : source.state}
                      </span>
                    </div>
                    <p>{source.message}</p>
                    {source.name === "Reddit" && publicFeed && (
                      <p>OAuth API is not connected.</p>
                    )}
                    <small>
                      {source.updatedAt
                        ? `Last fetched ${new Date(source.updatedAt).toLocaleTimeString()}`
                        : "No successful fetch yet"}
                    </small>
                  </div>
                );
              })}
              <small>
                Hub {live.state} ·{" "}
                {data
                  ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}`
                  : "Connecting…"}
              </small>
            </div>
          </details>
        </div>
      </header>
      {sample && (
        <div className="sample-banner" role="status">
          <span>
            Sample workspace. Fictional goal details; no footage supplied.
          </span>
          <a href="/">Exit sample</a>
        </div>
      )}
      <main id="main" className="main view-goals" tabIndex={-1}>
        <h1 className="sr-only">Goals</h1>
        {writeError && (
          <div className="notice error" role="alert">
            {writeError}
            <button
              type="button"
              onClick={() =>
                ready
                  ? save(latest.current)
                  : setPreferencesRetry((value) => value + 1)
              }
            >
              Retry saving
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}
        <p
          className="live-status hub-status"
          role="status"
          data-state={live.state}
        >
          {live.state === "offline"
            ? "Offline. Your loaded goals are still here."
            : live.state === "reconnecting"
              ? "Reconnecting to live updates…"
              : null}
        </p>
        {loading && !data ? (
          <section
            className="loading-view"
            aria-label="Loading goals"
            aria-busy="true"
          >
            <div />
            <div />
            <p role="status">Loading goals…</p>
          </section>
        ) : (
          <div
            className={`goal-workspace${compact && mobilePlayer && selected ? " player-open" : ""}${cinema ? " cinema" : ""}`}
          >
            <section className="goal-queue" aria-label="Goal feed">
              {newCount > 0 && (
                <button
                  type="button"
                  className="new-goals"
                  onClick={() => {
                    setNewCount(0);
                    if (goals[0]) select(goals[0]);
                  }}
                >
                  {newCount} new {newCount === 1 ? "goal" : "goals"}
                </button>
              )}
              <p className="sr-only" id="goal-keyboard-help">
                Use the up and down arrow keys to browse goals. Press Enter to
                play.
              </p>
              <div
                className="goal-list scroll-region"
                ref={list}
                tabIndex={0}
                aria-label="Recent goal clips"
                aria-describedby="goal-keyboard-help"
                onKeyDown={(event) => {
                  if (
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                  )
                    return;
                  const rows = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      ".goal-row",
                    ),
                  ).filter((row) => row.getClientRects().length > 0);
                  if (!rows.length) return;
                  const current = rows.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  const target =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? rows.length - 1
                        : event.key === "ArrowUp"
                          ? current < 0
                            ? rows.length - 1
                            : Math.max(0, current - 1)
                          : Math.min(rows.length - 1, current + 1);
                  event.preventDefault();
                  rows[target]?.focus();
                }}
              >
                {unseenGoals.map(renderGoal)}
                {!unseenGoals.length && seenGoals.length > 0 && (
                  <p className="caught-up">You’re caught up.</p>
                )}
                {seenGoals.length > 0 && (
                  <details className="seen-goals" ref={seenAccordion}>
                    <summary>
                      <ChevronRight size={14} aria-hidden="true" />
                      <span>Seen</span>
                      <span className="seen-count">{seenGoals.length}</span>
                    </summary>
                    {seenGoals.map(renderGoal)}
                  </details>
                )}
                {!goals.length && (
                  <div className="empty queue-empty">
                    <GoalIcon size={26} />
                    <h3>
                      {query.trim() ? "No matching goals" : "No recent goals"}
                    </h3>
                    <p>
                      {query.trim()
                        ? "Try another team or scorer."
                        : "New r/soccer goal posts appear here automatically."}
                    </p>
                    {query && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => {
                          setQuery("");
                          searchInput.current?.focus();
                        }}
                      >
                        {query ? "Clear search" : "Show all goals"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {loading && (
                <div className="queue-footer" role="status">
                  Refreshing…
                </div>
              )}
            </section>
            <section
              className="player-column scroll-region"
              tabIndex={0}
              aria-label="Goal player"
            >
              <button
                type="button"
                className="mobile-back quiet"
                onClick={() => setMobilePlayer(false)}
              >
                <ArrowLeft size={15} />
                Back to goals
              </button>
              {selected ? (
                <>
                  <div className="video-stage">
                    {hideScore ? (
                      <div className="stage-message">
                        <EyeOff size={30} />
                        <h2>A goal worth waiting for.</h2>
                        <p>Reveal this goal when you’re ready.</p>
                        <button
                          type="button"
                          className="primary"
                          onClick={() =>
                            setRevealed((current) => [...current, selected.id])
                          }
                        >
                          Reveal goal
                        </button>
                      </div>
                    ) : selected.media && (!compact || mobilePlayer) ? (
                      <ClipPlayback
                        key={selected.id}
                        media={selected.media}
                        mirrors={selected.mirrors}
                        alternatives={selected.alternatives}
                        sourceUrl={selected.sourceUrl}
                        title={`${name(selected.homeId)} versus ${name(selected.awayId)} goal clip`}
                      />
                    ) : (
                      <div className="stage-message">
                        <div className="scoreline">
                          <span>
                            {club(selected.homeId)?.shortName ||
                              name(selected.homeId)}
                          </span>
                          <strong>
                            {selected.homeScore}
                            <i>:</i>
                            {selected.awayScore}
                          </strong>
                          <span>
                            {club(selected.awayId)?.shortName ||
                              name(selected.awayId)}
                          </span>
                        </div>
                        <h2>
                          {selected.minute
                            ? `${selected.minute} minutes. In the net.`
                            : "In the net."}
                        </h2>
                        <p>
                          {selected.sample
                            ? "Sample goal metadata. No footage is supplied."
                            : "Watch this goal in its original Reddit thread."}
                        </p>
                        {selected.sourceUrl && (
                          <a
                            className="quiet"
                            href={selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch at source
                            <ExternalLink size={15} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="goal-info">
                    {match && (
                      <div className="match-context" aria-label="Match score">
                        <div className="match-scoreline">
                          <span className="match-club">
                            <TeamCrest
                              team={club(selected.homeId)}
                              src={clubCrest(
                                club(selected.homeId),
                                data?.teams || [],
                                name(selected.homeId),
                              )}
                            />
                            <span>{name(selected.homeId)}</span>
                          </span>
                          <strong
                            aria-label={
                              hideScore
                                ? "Score hidden"
                                : `${prefs.spoilers ? selected.homeScore : match.homeScore} to ${prefs.spoilers ? selected.awayScore : match.awayScore}`
                            }
                          >
                            {hideScore
                              ? "— : —"
                              : `${prefs.spoilers ? selected.homeScore : match.homeScore} : ${prefs.spoilers ? selected.awayScore : match.awayScore}`}
                          </strong>
                          <span className="match-club">
                            <TeamCrest
                              team={club(selected.awayId)}
                              src={clubCrest(
                                club(selected.awayId),
                                data?.teams || [],
                                name(selected.awayId),
                              )}
                            />
                            <span>{name(selected.awayId)}</span>
                          </span>
                        </div>
                        <small>
                          {hideScore
                            ? "Score hidden"
                            : prefs.spoilers
                              ? "Score at this goal"
                              : match.label}
                        </small>
                      </div>
                    )}
                    <div className="clip-details">
                      <div className="clip-caption">
                        <h2 className="scorer-heading" key={selected.id}>
                          {hideScore ? "Goal details hidden" : selected.scorer}
                        </h2>
                        <p>
                          {hideScore
                            ? "Reveal to see goal details"
                            : `${minute(selected)} goal`}
                        </p>
                        {!hideScore && selected.watchReason && (
                          <a
                            className="watch-reason"
                            href={selected.watchSourceUrl || selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Star size={14} />
                            {selected.watchReason}, tagged on Reddit
                            <ExternalLink size={12} />
                          </a>
                        )}
                        {!hideScore && !selected.sample && (
                          <details className="post-details">
                            <summary>Original post</summary>
                            <p>{selected.title}</p>
                            {selected.author && (
                              <p>Posted to r/soccer by u/{selected.author}</p>
                            )}
                            <p>
                              Starts muted. Use the player controls for sound.
                            </p>
                          </details>
                        )}
                      </div>
                      <div className="clip-actions">
                        <div className="player-tools">
                          <button
                            type="button"
                            className="icon-button cinema-toggle"
                            aria-label={
                              cinema ? "Exit cinema view" : "Expand player"
                            }
                            title={
                              cinema
                                ? "Exit cinema view (Esc)"
                                : "Expand player"
                            }
                            aria-pressed={cinema}
                            onClick={() => setCinema(!cinema)}
                          >
                            {cinema ? (
                              <Minimize2 size={17} />
                            ) : (
                              <Maximize2 size={17} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            disabled={!ready}
                            aria-label={
                              prefs.watched.includes(selected.id)
                                ? "Mark as unwatched"
                                : "Mark as watched"
                            }
                            title={
                              prefs.watched.includes(selected.id)
                                ? "Mark as unwatched"
                                : "Mark as watched"
                            }
                            aria-pressed={prefs.watched.includes(selected.id)}
                            onClick={() =>
                              save({
                                ...latest.current,
                                watched: latest.current.watched.includes(
                                  selected.id,
                                )
                                  ? latest.current.watched.filter(
                                      (id) => id !== selected.id,
                                    )
                                  : [
                                      ...latest.current.watched,
                                      selected.id,
                                    ].slice(-1000),
                              })
                            }
                          >
                            {prefs.watched.includes(selected.id) ? (
                              <Check size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </button>
                        </div>
                        {selected.sourceUrl && (
                          <a
                            className="quiet"
                            href={selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Reddit thread
                            <ExternalLink size={15} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  {match && match.goals.length > 1 && (
                    <nav
                      className="match-goals"
                      aria-label="Goals from this match"
                    >
                      {match.goals.map((goal) => {
                        const hidden =
                          prefs.spoilers && !revealed.includes(goal.id);
                        return (
                          <button
                            type="button"
                            key={goal.id}
                            data-match-goal-id={goal.id}
                            aria-current={
                              goal.id === selected.id ? "true" : undefined
                            }
                            aria-label={
                              hidden
                                ? "Reveal another goal from this match"
                                : `${minute(goal)} ${goal.scorer}, ${goal.homeScore} to ${goal.awayScore}`
                            }
                            onClick={() => select(goal)}
                            onPointerEnter={() => {
                              if (!hidden)
                                void warmClip(goal.media).catch(() => {});
                            }}
                          >
                            <span className="match-goal-minute">
                              {hidden ? <EyeOff size={13} /> : minute(goal)}
                            </span>
                            <span className="match-goal-copy">
                              <b>{hidden ? "Goal hidden" : goal.scorer}</b>
                              <span>
                                {hidden
                                  ? "Reveal goal"
                                  : `${goal.homeScore}–${goal.awayScore}`}
                              </span>
                            </span>
                            {goal.id === selected.id ? (
                              <Play size={12} fill="currentColor" />
                            ) : prefs.watched.includes(goal.id) ? (
                              <Check size={12} />
                            ) : (
                              <Play size={12} />
                            )}
                          </button>
                        );
                      })}
                    </nav>
                  )}
                  {selected.alternatives.length > 0 && (
                    <details className="post-details alternates">
                      <summary>Other posts of this goal</summary>
                      {selected.alternatives.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Alternate post {index + 1}
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </details>
                  )}
                </>
              ) : (
                <div className="player-welcome">
                  <h2>{query ? "No matching goals" : "Waiting for goals"}</h2>
                  <p>
                    {query
                      ? "Clear the filters to see all recent goals."
                      : "Recent r/soccer goal clips will appear here."}
                  </p>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() =>
                      query ? setQuery("") : setRefresh((value) => value + 1)
                    }
                  >
                    {query ? "Show all goals" : "Refresh goals"}
                  </button>
                  {!query &&
                    data?.sources.some((source) =>
                      source.name.toLowerCase().includes("reddit"),
                    ) && (
                      <details className="post-details">
                        <summary>Feed status</summary>
                        {data.sources
                          .filter((source) =>
                            source.name.toLowerCase().includes("reddit"),
                          )
                          .map((source) => (
                            <p key={source.name}>{source.message}</p>
                          ))}
                      </details>
                    )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

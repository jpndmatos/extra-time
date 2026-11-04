import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import GoalRow from "./GoalRow";
import TeamCrest from "./TeamCrest";
import { appBase, browserPreferences } from "./api";
import { clubCrest } from "./goalCategories";
import { searchGoals } from "./goalNavigation";
import { matchGoals } from "./matchGoals";
import { goalPostIds, hasSeenGoal, setGoalSeen } from "./goalHistory";
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
function storedPreferences(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
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
    sample || browserPreferences
      ? () =>
          storedPreferences(
            sample ? "touchline.sample" : "touchline.preferences",
          )
      : empty,
  );
  const latest = useRef(prefs);
  latest.current = prefs;
  const [ready, setReady] = useState(sample || browserPreferences);
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
  const searchQuery = useDeferredValue(query);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [newCount, setNewCount] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const seenAccordion = useRef<HTMLDetailsElement>(null);
  const connections = useRef<HTMLDetailsElement>(null);

  // Expire posts locally too, including when the event stream is offline.
  useEffect(() => {
    if (sample || !data?.goals.length) return;
    const expires = Math.min(
      ...data.goals.map((goal) => Date.parse(goal.publishedAt) + 48 * 3600_000),
    );
    if (!Number.isFinite(expires)) return;
    const timer = window.setTimeout(
      () =>
        setData((current) =>
          current
            ? {
                ...current,
                goals: current.goals.filter(
                  (goal) =>
                    Date.parse(goal.publishedAt) + 48 * 3600_000 > Date.now(),
                ),
              }
            : current,
        ),
      Math.max(0, Math.min(expires - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [data, sample]);

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
      const watched = new Set(latest.current.watched);
      const matching = searchGoals(
        next.goals.filter((goal) => !hasSeenGoal(goal, watched)),
        next.teams,
        query,
        latest.current.spoilers,
        revealed,
      );
      const added = matching.filter(
        (goal) => !goalPostIds(goal).some((id) => known.current!.has(id)),
      ).length;
      if (added) setNewCount((count) => count + added);
    }
    known.current = new Set(next.goals.flatMap(goalPostIds));
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
    if (sample || browserPreferences) return;
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
        known.current ??= new Set(value.goals.flatMap(goalPostIds));
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
    if (sample || browserPreferences) {
      try {
        localStorage.setItem(
          sample ? "touchline.sample" : "touchline.preferences",
          JSON.stringify(next),
        );
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
  const markSeen = useCallback(
    (goal: Goal) => {
      if (
        !ready ||
        (latest.current.spoilers &&
          !goalPostIds(goal).some((id) => revealed.includes(id))) ||
        hasSeenGoal(goal, new Set(latest.current.watched))
      )
        return;
      save({
        ...latest.current,
        watched: setGoalSeen(goal, latest.current.watched, true),
      });
    },
    [ready, revealed],
  );
  const select = useCallback(
    (goal: Goal) => {
      if (
        hasSeenGoal(goal, new Set(latest.current.watched)) &&
        seenAccordion.current
      )
        seenAccordion.current.open = true;
      setSelectedId((current) =>
        current && goalPostIds(goal).includes(current) ? current : goal.id,
      );
      setMobilePlayer(true);
      setNewCount(0);
      markSeen(goal);
    },
    [markSeen],
  );
  const chooseRow = useCallback(
    (goal: Goal, keyboard: boolean) => {
      if (keyboard) list.current?.focus();
      select(goal);
    },
    [select],
  );
  const goals = useMemo(
    () =>
      data
        ? searchGoals(
            data.goals,
            data.teams,
            searchQuery,
            prefs.spoilers,
            revealed,
          )
        : [],
    [data, searchQuery, prefs.spoilers, revealed],
  );
  const watched = useMemo(() => {
    const ids = new Set(prefs.watched);
    for (const goal of data?.goals || [])
      if (hasSeenGoal(goal, ids)) ids.add(goal.id);
    return ids;
  }, [prefs.watched, data?.goals]);
  const visibleDetails = useMemo(() => {
    const ids = new Set(revealed);
    for (const goal of data?.goals || [])
      if (goalPostIds(goal).some((id) => ids.has(id))) ids.add(goal.id);
    return ids;
  }, [revealed, data?.goals]);
  const unseenGoals = useMemo(
    () => goals.filter((goal) => !watched.has(goal.id)),
    [goals, watched],
  );
  const seenGoals = useMemo(
    () => goals.filter((goal) => watched.has(goal.id)),
    [goals, watched],
  );
  const selected =
    data?.goals.find((goal) => goal.id === selectedId) ||
    (selectedId
      ? data?.goals.find((goal) => goalPostIds(goal).includes(selectedId))
      : undefined) ||
    goals[0];
  const hideScore = !!(
    prefs.spoilers &&
    selected &&
    !visibleDetails.has(selected.id)
  );
  const match = useMemo(() => matchGoals(data, selected), [data, selected]);
  useEffect(() => {
    if (
      selected &&
      (!selectedId || !goalPostIds(selected).includes(selectedId))
    )
      setSelectedId(selected.id);
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
  const clubs = useMemo(
    () => new Map(data?.teams.map((team) => [team.id, team])),
    [data?.teams],
  );
  const crests = useMemo(
    () =>
      new Map(
        data?.teams.map((team) => [team.id, clubCrest(team, data.teams)]),
      ),
    [data?.teams],
  );
  const names = useMemo(() => {
    const index = new Map(data?.teams.map((team) => [team.id, team.name]));
    for (const goal of data?.goals || []) {
      if (goal.homeName && !index.has(goal.homeId))
        index.set(goal.homeId, goal.homeName);
      if (goal.awayName && !index.has(goal.awayId))
        index.set(goal.awayId, goal.awayName);
    }
    return index;
  }, [data?.teams, data?.goals]);
  const club = (id: string) => clubs.get(id);
  const name = (id: string) => names.get(id) || id;
  const minute = (goal: Goal) => (goal.minute ? `${goal.minute}′` : "Goal");

  function renderGoal(goal: Goal) {
    return (
      <GoalRow
        key={goal.id}
        goal={goal}
        home={club(goal.homeId)}
        away={club(goal.awayId)}
        homeName={name(goal.homeId)}
        awayName={name(goal.awayId)}
        homeCrest={crests.get(goal.homeId)}
        awayCrest={crests.get(goal.awayId)}
        selected={selected?.id === goal.id}
        watched={watched.has(goal.id)}
        hidden={prefs.spoilers && !visibleDetails.has(goal.id)}
        onSelect={chooseRow}
      />
    );
  }

  return (
    <div className="app-shell goal-hub">
      <a className="skip-link" href="#main">
        Skip to goals
      </a>
      <header className="topbar goal-hub-header">
        <div className="header-browse">
          <a className="brand" href={appBase} aria-label="Touchline home">
            <img
              className="brand-mark"
              src={`${appBase}icon.svg`}
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
              aria-busy={loading}
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </header>
      {sample && (
        <div className="sample-banner" role="status">
          <span>
            Sample workspace. Fictional goal details; no footage supplied.
          </span>
          <a href={appBase}>Exit sample</a>
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
          className={`live-status hub-status${live.state !== "offline" ? " sr-only" : ""}`}
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
                        <time dateTime={source.updatedAt || undefined}>
                          {source.updatedAt
                            ? new Date(source.updatedAt).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            : "—"}
                        </time>
                      </span>
                    ))
                  )}
                  {sample && (
                    <time dateTime={data?.updatedAt}>
                      {data
                        ? new Date(data.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "…"}
                    </time>
                  )}
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
                    {live.state === "polling"
                      ? "Checking for updates every 30 seconds"
                      : `Hub ${live.state}`}{" "}
                    ·{" "}
                    {data
                      ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}`
                      : "Connecting…"}
                  </small>
                </div>
              </details>
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
                        <h2>Goal hidden</h2>
                        <p>Reveal the clip, score and scorer.</p>
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
                        key={
                          selectedId &&
                          goalPostIds(selected).includes(selectedId)
                            ? selectedId
                            : selected.id
                        }
                        media={selected.media}
                        mirrors={selected.mirrors}
                        alternatives={selected.alternatives}
                        sourceUrl={selected.sourceUrl}
                        title={`${name(selected.homeId)} versus ${name(selected.awayId)} goal clip`}
                      />
                    ) : (
                      <div className="stage-message">
                        <GoalIcon size={26} aria-hidden="true" />
                        <h2>
                          {selected.sample ? "Sample goal" : "Clip unavailable"}
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
                              watched.has(selected.id)
                                ? "Mark as unwatched"
                                : "Mark as watched"
                            }
                            title={
                              watched.has(selected.id)
                                ? "Mark as unwatched"
                                : "Mark as watched"
                            }
                            aria-pressed={watched.has(selected.id)}
                            onClick={() =>
                              save({
                                ...latest.current,
                                watched: setGoalSeen(
                                  selected,
                                  latest.current.watched,
                                  !watched.has(selected.id),
                                ),
                              })
                            }
                          >
                            {watched.has(selected.id) ? (
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
                            ) : watched.has(goal.id) ? (
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

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
import { goalPostIds, hasSeenGoal, sameGoal, setGoalSeen } from "./goalHistory";
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
  const visit = useRef<{
    goal: Goal;
    eligible: boolean;
    autoMark: boolean;
  } | null>(null);
  const [retained, setRetained] = useState<Set<string>>(() => new Set());
  const [cinema, setCinema] = useState(false);
  const [playbackActions, setPlaybackActions] = useState<HTMLDivElement | null>(
    null,
  );
  const [query, setQuery] = useState((initial.get("q") || "").slice(0, 100));
  const searchQuery = useDeferredValue(query);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [newCount, setNewCount] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const queueScroll = useRef(0);
  const feedAnchor = useRef<{ id: string; top: number }[]>([]);
  const restoreAnchor = useRef(false);
  const seenAccordion = useRef<HTMLDetailsElement>(null);
  const connections = useRef<HTMLDetailsElement>(null);
  const matchStrip = useRef<HTMLElement>(null);

  function rememberFeed() {
    const feed = list.current;
    if (!feed?.clientHeight) return;
    const bounds = feed.getBoundingClientRect();
    feedAnchor.current =
      feed.scrollTop > 0
        ? Array.from(feed.querySelectorAll<HTMLElement>(".goal-row"))
            .filter((row) => !row.closest("details:not([open])"))
            .map((row) => {
              const bounds = row.getBoundingClientRect();
              return {
                id: row.dataset.goalId!,
                top: bounds.top,
                bottom: bounds.bottom,
              };
            })
            .filter((row) => row.bottom > bounds.top && row.top < bounds.bottom)
        : [];
  }
  function preserveFeed() {
    rememberFeed();
    restoreAnchor.current = feedAnchor.current.length > 0;
  }

  // Expire posts locally too, including when the event stream is offline.
  useEffect(() => {
    if (sample || !data?.goals.length) return;
    const expires = Math.min(
      ...data.goals.map((goal) => Date.parse(goal.publishedAt) + 48 * 3600_000),
    );
    if (!Number.isFinite(expires)) return;
    const timer = window.setTimeout(
      () => {
        preserveFeed();
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
        );
      },
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
    preserveFeed();
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
        preserveFeed();
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
          keepalive: true,
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
  const retainRow = useCallback((goal: Goal) => {
    setRetained((current) => new Set([...current, ...goalPostIds(goal)]));
  }, []);
  const markSeen = useCallback(
    (goal: Goal) => {
      if (!ready || hasSeenGoal(goal, new Set(latest.current.watched))) return;
      retainRow(goal);
      save({
        ...latest.current,
        watched: setGoalSeen(goal, latest.current.watched, true),
      });
    },
    [ready, retainRow],
  );
  const finishVisit = useCallback(() => {
    const previous = visit.current;
    visit.current = null;
    if (previous?.eligible && previous.autoMark) markSeen(previous.goal);
  }, [markSeen]);
  const leave = useRef(finishVisit);
  leave.current = finishVisit;
  useEffect(() => {
    const finish = () => leave.current();
    window.addEventListener("pagehide", finish);
    return () => window.removeEventListener("pagehide", finish);
  }, []);
  const select = useCallback(
    (goal: Goal) => {
      if (list.current?.clientHeight)
        queueScroll.current = list.current.scrollTop;
      rememberFeed();
      if (visit.current && !sameGoal(visit.current.goal, goal)) finishVisit();
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
    },
    [finishVisit],
  );
  const chooseRow = useCallback(
    (goal: Goal, keyboard: boolean) => {
      if (keyboard) list.current?.focus({ preventScroll: true });
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
  const queuedGoals = useMemo(
    () =>
      goals.filter(
        (goal) => !watched.has(goal.id) || hasSeenGoal(goal, retained),
      ),
    [goals, watched, retained],
  );
  const seenGoals = useMemo(
    () =>
      goals.filter(
        (goal) => watched.has(goal.id) && !hasSeenGoal(goal, retained),
      ),
    [goals, watched, retained],
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
  useLayoutEffect(() => {
    const strip = matchStrip.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip?.clientWidth || !active) return;
    const bounds = strip.getBoundingClientRect();
    const tile = active.getBoundingClientRect();
    if (tile.left < bounds.left + 8)
      strip.scrollLeft += tile.left - bounds.left - 8;
    else if (tile.right > bounds.right - 8)
      strip.scrollLeft += tile.right - bounds.right + 8;
  }, [selected?.id, match?.goals, compact, mobilePlayer]);
  useEffect(() => {
    if (
      selected &&
      (!selectedId || !goalPostIds(selected).includes(selectedId))
    )
      setSelectedId(selected.id);
  }, [selectedId, selected?.id]);
  useLayoutEffect(() => {
    if (!selected || (compact && !mobilePlayer)) return;
    if (visit.current && sameGoal(visit.current.goal, selected)) {
      visit.current.goal = selected;
      visit.current.eligible ||= ready && !hideScore;
    } else
      visit.current = {
        goal: selected,
        eligible: ready && !hideScore,
        autoMark: true,
      };
  }, [selected, ready, compact, mobilePlayer, hideScore]);
  useLayoutEffect(() => {
    if (compact && !mobilePlayer && list.current)
      list.current.scrollTop = queueScroll.current;
  }, [compact, mobilePlayer]);
  useLayoutEffect(() => {
    const feed = list.current;
    if (!restoreAnchor.current || !feed?.clientHeight) return;
    // Use the next surviving visible row if the first one has just expired.
    const rows = Array.from(feed.querySelectorAll<HTMLElement>(".goal-row"));
    for (const anchor of feedAnchor.current) {
      const row = rows.find((item) => item.dataset.goalId === anchor.id);
      if (!row || row.closest("details:not([open])")) continue;
      feed.scrollTop += row.getBoundingClientRect().top - anchor.top;
      queueScroll.current = feed.scrollTop;
      break;
    }
    restoreAnchor.current = false;
    rememberFeed();
  }, [data, compact, mobilePlayer]);
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
          {compact && mobilePlayer && selected ? (
            <button
              type="button"
              className="header-back"
              aria-label="Back to goals"
              title="Back to goals"
              onClick={() => {
                finishVisit();
                setMobilePlayer(false);
              }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <a className="brand" href={appBase} aria-label="Extra Time home" title="Extra Time — Goal clips">
              <img
                className="brand-mark"
                src={`${appBase}icon.svg?v=12`}
                width="32"
                height="32"
                alt=""
              />
            </a>
          )}
        </div>
        <label className="goal-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchInput}
            name="goal-search"
            type="search"
            aria-label="Search goals"
            placeholder={prefs.spoilers ? "Find a team" : "Search goals"}
            value={query}
            maxLength={100}
            onChange={(event) => {
              if (compact && mobilePlayer) {
                finishVisit();
                setMobilePlayer(false);
              }
              setQuery(event.target.value);
            }}
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
                    restoreAnchor.current = false;
                    feedAnchor.current = [];
                    if (list.current) list.current.scrollTop = 0;
                    queueScroll.current = 0;
                    setNewCount(0);
                    if (queuedGoals[0]) select(queuedGoals[0]);
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
                onScroll={(event) => {
                  if (event.currentTarget.clientHeight)
                    queueScroll.current = event.currentTarget.scrollTop;
                }}
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
                  ).filter(
                    (row) =>
                      row.getClientRects().length > 0 &&
                      !row.closest("details:not([open])"),
                  );
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
                {queuedGoals.map(renderGoal)}
                {!queuedGoals.length && seenGoals.length > 0 && (
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
            </section>
            <section
              className="player-column scroll-region"
              tabIndex={0}
              aria-label="Goal player"
            >
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
                        controlsTarget={playbackActions}
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
                        <div className="clip-headline">
                          <h2 className="scorer-heading" key={selected.id}>
                            {hideScore
                              ? "Goal details hidden"
                              : selected.scorer}
                          </h2>
                          <p>
                            {hideScore
                              ? "Reveal to see goal details"
                              : selected.minute
                                ? `${minute(selected)} goal`
                                : "Goal"}
                          </p>
                        </div>
                        {!hideScore && selected.watchReason && (
                          <a
                            className="watch-reason"
                            href={selected.watchSourceUrl || selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Star size={14} />
                            <span title="Tagged in the Reddit post title">
                              {selected.watchReason}
                            </span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="clip-actions">
                        <div
                          className="playback-action-slot"
                          ref={setPlaybackActions}
                        />
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
                            className="icon-button seen-toggle"
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
                            onClick={() => {
                              if (visit.current) visit.current.autoMark = false;
                              if (!watched.has(selected.id))
                                retainRow(selected);
                              save({
                                ...latest.current,
                                watched: setGoalSeen(
                                  selected,
                                  latest.current.watched,
                                  !watched.has(selected.id),
                                ),
                              });
                            }}
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
                            className="icon-button reddit-thread"
                            aria-label="Reddit thread"
                            title="Open Reddit thread"
                            href={selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="sr-only">Reddit thread</span>
                            <ExternalLink size={15} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  {match && match.goals.length > 1 && (
                    <nav
                      className="match-goals"
                      ref={matchStrip}
                      aria-label="Goals from this match"
                    >
                      {match.goals.map((goal) => {
                        const hidden =
                          prefs.spoilers && !visibleDetails.has(goal.id);
                        return (
                          <button
                            type="button"
                            key={goal.id}
                            data-match-goal-id={goal.id}
                            data-watched={watched.has(goal.id)}
                            aria-current={
                              goal.id === selected.id ? "true" : undefined
                            }
                            aria-label={
                              hidden
                                ? "Reveal another goal from this match"
                                : `${minute(goal)} ${goal.scorer}, ${goal.homeScore} to ${goal.awayScore}`
                            }
                            title={
                              hidden
                                ? "Reveal goal"
                                : `${minute(goal)} · ${goal.scorer}`
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
                            <span className="match-goal-score">
                              {hidden
                                ? "—"
                                : `${goal.homeScore}–${goal.awayScore}`}
                            </span>
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
        <footer
          className="workspace-footer"
          data-player-open={
            compact && mobilePlayer && selected ? "true" : "false"
          }
          aria-label="Feed connections and original post"
        >
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
                        ? new Date(source.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
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
          {selected && !selected.sample && (
            <div
              className="post-attribution"
              aria-label="Original post details"
            >
              <a
                className="reddit-attribution"
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open original r/soccer post${selected.author ? ` by u/${selected.author}` : ""}`}
                title={
                  selected.author
                    ? `r/soccer · u/${selected.author}`
                    : "r/soccer"
                }
              >
                <svg
                  className="reddit-mark"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m12 9 1-5 5 1" />
                  <circle cx="19.5" cy="5" r="1.5" />
                  <path d="M4.5 12a2 2 0 1 0-1 4m16-4a2 2 0 1 1 1 4" />
                  <ellipse cx="12" cy="14.5" rx="8" ry="5" />
                  <circle
                    cx="8.5"
                    cy="14"
                    r=".8"
                    fill="currentColor"
                    stroke="none"
                  />
                  <circle
                    cx="15.5"
                    cy="14"
                    r=".8"
                    fill="currentColor"
                    stroke="none"
                  />
                  <path d="M8.5 17c2 1.3 5 1.3 7 0" />
                </svg>
                <span className="reddit-community">r/soccer</span>
                {selected.author && (
                  <>
                    <span className="reddit-divider" aria-hidden="true">
                      ·
                    </span>
                    <span className="reddit-author">u/{selected.author}</span>
                  </>
                )}
              </a>
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveFeed } from "./useLiveFeed";
import { useMatchday } from "./useMatchday";
import ClipPlayback, { warmClip } from "./ClipPlayback";
import TeamCrest from "./TeamCrest";
import { adjacentGoal, searchGoals } from "./goalNavigation";
import { useCompactPlayer } from "./useCompactPlayer";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Goal as GoalIcon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Star,
  X,
  Play,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  localDay,
  request,
  tracked,
  type Dashboard,
  type Fixture,
  type Goal,
  type Preferences,
} from "./types";

const empty: Preferences = {
  teams: [],
  matches: [],
  spoilers: false,
  watched: [],
};
const sampleDefaults: Preferences = {
  ...empty,
  teams: ["benfica", "arsenal", "liverpool"],
};
type View = "goals" | "teams" | "sources";
const tabs: { id: View; label: string }[] = [
  { id: "goals", label: "Goal room" },
  { id: "teams", label: "Your teams" },
  { id: "sources", label: "Sources" },
];
function loadSample(): Preferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem("touchline.sample") || "null",
    );
    if (
      saved &&
      Array.isArray(saved.teams) &&
      Array.isArray(saved.matches) &&
      Array.isArray(saved.watched)
    )
      return saved;
  } catch {
    /* Local storage is optional. */
  }
  return sampleDefaults;
}

export default function App() {
  const compactPlayer = useCompactPlayer();
  const initial = new URLSearchParams(location.search);
  const sample = initial.get("sample") === "true";
  const [view, setView] = useState<View>(
    tabs.some((t) => t.id === initial.get("view"))
      ? (initial.get("view") as View)
      : "goals",
  );
  const matchday = useMatchday(initial.get("day"));
  const day = matchday.day;
  const [team, setTeam] = useState(initial.get("team") || "");
  const [match, setMatch] = useState(initial.get("match") || "");
  const [feed, setFeed] = useState<"all" | "following" | "watch">(
    initial.get("feed") === "watch"
      ? "watch"
      : initial.get("feed") === "following"
        ? "following"
        : "all",
  );
  const [goalSearch, setGoalSearch] = useState(
    (initial.get("q") || "").slice(0, 100),
  );
  const goalSearchInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(sample ? loadSample : empty);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [preferencesRetry, setPreferencesRetry] = useState(0);
  const [error, setError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [ready, setReady] = useState(sample);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [unwatched, setUnwatched] = useState(false);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [mobilePlayer, setMobilePlayer] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const matchesTrigger = useRef<HTMLButtonElement>(null);
  const matchesClose = useRef<HTMLButtonElement>(null);
  const matchesPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!matchesOpen) return;
    matchesClose.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const controls = Array.from(
          matchesPanel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex="0"]',
          ) || [],
        ).filter((element) => element.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "Escape") {
        setMatchesOpen(false);
        matchesTrigger.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [matchesOpen]);
  const [newGoalCount, setNewGoalCount] = useState(0);
  const knownGoals = useRef<Set<string> | null>(null);
  const queue = useRef(Promise.resolve());
  const latest = useRef(prefs);
  latest.current = prefs;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!cinema) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCinema(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [cinema]);
  const live = useLiveFeed(day, sample, (next) => {
    if (knownGoals.current) {
      const candidates = tracked(
        next.goals,
        next.matches,
        latest.current,
        team,
        match,
        unwatched,
        feed !== "following",
        feed === "watch",
      );
      const added = searchGoals(
        candidates,
        next.teams,
        goalSearch,
        latest.current.spoilers,
        revealed,
      ).filter((goal) => !knownGoals.current!.has(goal.id)).length;
      if (added) setNewGoalCount((count) => count + added);
    }
    knownGoals.current = new Set(next.goals.map((goal) => goal.id));
    setData(next);
    setLoading(false);
    setError("");
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "goals") params.set("view", view);
    if (sample) params.set("sample", "true");
    if (team) params.set("team", team);
    if (match) params.set("match", match);
    if (feed !== "all") params.set("feed", feed);
    if (goalSearch.trim()) params.set("q", goalSearch.trim());
    if (!matchday.followingToday) params.set("day", day);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [
    view,
    sample,
    day,
    team,
    match,
    feed,
    goalSearch,
    matchday.followingToday,
  ]);

  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    request<Preferences>("/api/preferences", { signal: controller.signal })
      .then((value) => {
        setPrefs(value);
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setWriteError(e.message);
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
      .then((value) => setData(value))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
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
          "Browser storage is unavailable. Sample changes will last for this visit.",
        );
      }
      return;
    }
    setPendingWrites((v) => v + 1);
    queue.current = queue.current.then(async () => {
      try {
        await request("/api/preferences", {
          method: "PUT",
          body: JSON.stringify(next),
        });
      } catch (e) {
        setWriteError(
          e instanceof Error ? e.message : "Your changes could not be saved.",
        );
      } finally {
        setPendingWrites((v) => v - 1);
      }
    });
  }
  function toggle(key: "teams" | "matches" | "watched", id: string) {
    const current = latest.current;
    const values = current[key];
    save({
      ...current,
      [key]: values.includes(id)
        ? values.filter((v) => v !== id)
        : [...values, id].slice(
            key === "watched" ? -1000 : 0,
            key === "watched" ? undefined : key === "teams" ? 50 : 100,
          ),
    });
  }
  function navigate(next: View) {
    setView(next);
    setCinema(false);
    setImporting(false);
    setMobilePlayer(false);
    window.setTimeout(() => heading.current?.focus(), 0);
  }
  function dateChange(delta: number) {
    matchday.move(delta);
    setMatch("");
  }
  function select(goal: Goal) {
    setNewGoalCount(0);
    setSelectedId(goal.id);
    setPlaybackAttempt((value) => value + 1);
    setPlaying(true);
    setMobilePlayer(true);
  }
  function name(id: string) {
    return data?.teams.find((t) => t.id === id)?.name || id;
  }
  function short(id: string) {
    return data?.teams.find((t) => t.id === id)?.shortName || id.slice(0, 3);
  }
  const feedGoals = data
    ? tracked(
        data.goals,
        data.matches,
        prefs,
        team,
        match,
        unwatched,
        feed !== "following",
        feed === "watch",
      )
    : [];
  const visibleGoals = data
    ? searchGoals(feedGoals, data.teams, goalSearch, prefs.spoilers, revealed)
    : [];
  const playingGoal = playing
    ? data?.goals.find((goal) => goal.id === selectedId)
    : undefined;
  const selected =
    playingGoal ||
    visibleGoals.find((g) => g.id === selectedId) ||
    visibleGoals[0];
  const selectedIndex = visibleGoals.findIndex(
    (goal) => goal.id === selected?.id,
  );
  const previousGoal = adjacentGoal(visibleGoals, selected?.id, -1);
  const nextGoal = adjacentGoal(visibleGoals, selected?.id, 1);
  useEffect(() => {
    if (selectedId === null && selected) setSelectedId(selected.id);
  }, [selectedId, selected?.id]);
  const hideScore =
    prefs.spoilers && selected && !revealed.includes(selected.id);
  const activeMatch = data?.matches.find((fixture) => fixture.id === match);
  const selectedDate = new Date(day + "T12:00:00");
  const competitionRank = (competition: string) => {
    const leagues = [
      "champions league",
      "premier league",
      "primera division",
      "la liga",
      "bundesliga",
      "serie a",
      "ligue 1",
      "primeira liga",
      "europa league",
      "championship",
    ];
    const rank = leagues.findIndex((league) =>
      competition.toLowerCase().includes(league),
    );
    return rank < 0 ? leagues.length : rank;
  };
  const orderMatches = (a: Fixture, b: Fixture) =>
    Number(prefs.matches.includes(b.id)) -
      Number(prefs.matches.includes(a.id)) ||
    competitionRank(a.competition) - competitionRank(b.competition) ||
    a.kickoff.localeCompare(b.kickoff);
  const relevantMatches =
    data?.matches.filter(
      (fixture) =>
        !team ||
        fixture.homeId === team ||
        fixture.awayId === team ||
        data.goals.some(
          (goal) =>
            fixture.goalIds?.includes(goal.id) &&
            (goal.homeId === team || goal.awayId === team),
        ),
    ) || [];
  const goalMatches = relevantMatches
    .filter((fixture) => !!fixture.goalIds?.length)
    .sort(orderMatches);
  const scheduledMatches = relevantMatches
    .filter(
      (fixture) =>
        !fixture.goalIds?.length && localDay(new Date(fixture.kickoff)) === day,
    )
    .sort(orderMatches);
  const matchList = [...goalMatches, ...scheduledMatches];
  const filteredTeams =
    data?.teams.filter((t) =>
      `${t.name} ${t.country} ${t.aliases.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const connected =
    data?.sources.filter((s) => s.state === "connected").length || 0;
  const oldestDay = new Date();
  oldestDay.setDate(oldestDay.getDate() - 6);
  const latestDay = new Date();
  latestDay.setDate(latestDay.getDate() + 6);

  async function importClip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setImportError("");
    try {
      const goal = await request<Goal>("/api/clips", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          redditUrl: form.get("source"),
          clipUrl: form.get("clip") || null,
        }),
      });
      // Adding a clip is explicit interest in its teams; preserve any existing follows.
      save({
        ...latest.current,
        teams: [
          ...new Set([...latest.current.teams, goal.homeId, goal.awayId]),
        ],
      });
      setTeam("");
      setMatch("");
      setSelectedId(goal.id);
      setImporting(false);
      setView("goals");
      setRefresh((v) => v + 1);
      setMobilePlayer(true);
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "The clip could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }

  function matchRow(fixture: Fixture) {
    const followed = prefs.matches.includes(fixture.id);
    const live = ["IN_PLAY", "PAUSED", "LIVE"].includes(fixture.status);
    const isTracked =
      prefs.teams.includes(fixture.homeId) ||
      prefs.teams.includes(fixture.awayId) ||
      followed;
    return (
      <article
        className={`fixture ${isTracked ? "tracked" : ""} ${match === fixture.id ? "selected" : ""}`}
        key={fixture.id}
      >
        <div className="fixture-meta">
          <span>{fixture.competition}</span>
          <span>
            {fixture.source === "reddit"
              ? "From goal posts"
              : fixture.status === "FINISHED"
                ? "Full time"
                : live
                  ? fixture.sample
                    ? "Sample in play"
                    : "In play"
                  : ["TIMED", "SCHEDULED"].includes(fixture.status)
                    ? new Intl.DateTimeFormat(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(fixture.kickoff))
                    : fixture.status.toLowerCase()}
          </span>
        </div>
        <div className="fixture-body">
          <button
            type="button"
            className="fixture-teams"
            aria-current={match === fixture.id ? "true" : undefined}
            onClick={() => {
              setMatch(fixture.id);
              setSelectedId(null);
              setPlaying(true);
              setTeam("");
              setFeed("all");
              setMatchesOpen(false);
              navigate("goals");
            }}
            aria-label={`Show goals from ${fixture.homeName} versus ${fixture.awayName}`}
          >
            <span>
              <TeamCrest
                team={data?.teams.find((t) => t.id === fixture.homeId)}
                src={fixture.homeCrest}
              />
              <span className="fixture-name">{fixture.homeName}</span>
              <b>{prefs.spoilers ? "—" : (fixture.homeScore ?? "—")}</b>
            </span>
            <span>
              <TeamCrest
                team={data?.teams.find((t) => t.id === fixture.awayId)}
                src={fixture.awayCrest}
              />
              <span className="fixture-name">{fixture.awayName}</span>
              <b>{prefs.spoilers ? "—" : (fixture.awayScore ?? "—")}</b>
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`${followed ? "Unfollow" : "Follow"} match: ${fixture.homeName} versus ${fixture.awayName}`}
            aria-pressed={followed}
            onClick={() => toggle("matches", fixture.id)}
            disabled={!ready}
          >
            <Bookmark size={17} fill={followed ? "currentColor" : "none"} />
          </button>
        </div>
        {!!fixture.goalIds?.length && (
          <p className="fixture-clips">
            <span>
              {fixture.goalIds.length}{" "}
              {fixture.goalIds.length === 1 ? "goal clip" : "goal clips"}
            </span>
            <span>
              {fixture.source === "reddit" ? "Posted " : ""}
              {new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short",
              }).format(new Date(fixture.kickoff))}
            </span>
          </p>
        )}
      </article>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to goal room
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Touchline home">
          <GoalIcon size={27} strokeWidth={1.6} />
          <span>touchline</span>
        </a>
        <nav aria-label="Main navigation">
          {tabs
            .filter((tab) => tab.id !== "sources")
            .map((tab) => (
              <button
                type="button"
                key={tab.id}
                aria-current={view === tab.id ? "page" : undefined}
                onClick={() => navigate(tab.id)}
              >
                {tab.label}
              </button>
            ))}
        </nav>
        <button
          type="button"
          className="source-status"
          aria-current={view === "sources" ? "page" : undefined}
          title={
            sample ? "Sample workspace" : `${connected}/2 sources connected`
          }
          onClick={() => navigate("sources")}
        >
          <Settings2 size={16} />
          Sources
        </button>
      </header>
      {sample && (
        <div className="sample-banner" role="status">
          <span>
            Sample workspace. Fixtures and goal details are fictional; no video
            is supplied.
          </span>
          <a href="?view=goals">Exit sample</a>
        </div>
      )}
      <main id="main" tabIndex={-1} className={`main view-${view}`}>
        <div
          className={`page-heading ${view === "goals" && !importing ? "workspace-heading" : ""}`}
        >
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {importing
                ? "Add a goal clip"
                : tabs.find((t) => t.id === view)?.label}
            </h1>
            <p>
              {view === "goals"
                ? "Recent r/soccer goals. Your clubs, one place."
                : view === "teams"
                  ? "Pick your clubs. Their goals will find their way here."
                  : "Choose where your fixtures and goal clips come from."}
            </p>
          </div>
          <div className="heading-actions">
            {view === "goals" && (
              <button
                type="button"
                ref={matchesTrigger}
                className="quiet matches-trigger"
                aria-expanded={matchesOpen}
                aria-controls="matches-sidebar"
                onClick={() => setMatchesOpen(!matchesOpen)}
              >
                Matches <span>{matchList.length}</span>
              </button>
            )}
            <button
              type="button"
              className="quiet"
              aria-label={prefs.spoilers ? "Show spoilers" : "Hide spoilers"}
              aria-pressed={prefs.spoilers}
              onClick={() =>
                save({ ...latest.current, spoilers: !prefs.spoilers })
              }
              disabled={!ready}
            >
              {prefs.spoilers ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>
                {prefs.spoilers ? "Spoilers hidden" : "Hide spoilers"}
              </span>
            </button>
            <button
              type="button"
              className="quiet add-clip-action"
              onClick={() => {
                setImporting(!importing);
                setImportError("");
              }}
              disabled={sample || !ready}
            >
              {importing ? <X size={16} /> : <Plus size={16} />}
              {importing ? "Close form" : "Add clip"}
            </button>
          </div>
        </div>
        {writeError && (
          <div className="notice error" role="alert">
            {writeError}
            <button
              type="button"
              onClick={() =>
                ready ? save(latest.current) : setPreferencesRetry((v) => v + 1)
              }
            >
              {ready ? "Retry saving" : "Retry loading"}
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button type="button" onClick={() => setRefresh((v) => v + 1)}>
              Try again
            </button>
          </div>
        )}
        {!ready && !sample && !writeError && (
          <p role="status" className="notice">
            Loading your favourites…
          </p>
        )}
        {importing ? (
          <section
            className="import-panel scroll-region"
            tabIndex={0}
            aria-label="Add a clip form"
          >
            <div className="form-intro">
              <h2>A link is enough.</h2>
              <p>
                Paste a goal post from Reddit. Add a supported clip URL for
                inline playback; other hosts open in the original thread.
              </p>
            </div>
            <form onSubmit={importClip}>
              <label>
                Reddit post title
                <input
                  name="title"
                  required
                  maxLength={500}
                  placeholder="Benfica [1]-0 FC Porto - Player 18'"
                  autoFocus
                />
              </label>
              <label>
                Reddit thread URL
                <input
                  name="source"
                  type="url"
                  required
                  maxLength={1000}
                  placeholder="https://www.reddit.com/r/soccer/comments/…"
                />
              </label>
              <label>
                Clip URL <small>Optional, supported video host</small>
                <input
                  name="clip"
                  type="url"
                  maxLength={1000}
                  placeholder="https://streamable.com/…"
                />
              </label>
              <p className="muted">
                Both clubs will be followed when you add the clip. Clips stay on
                their original host.
              </p>
              {importError && (
                <p role="alert" className="notice error">
                  {importError}
                </p>
              )}
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Adding clip…" : "Add to goal room"}
              </button>
            </form>
          </section>
        ) : (
          <>
            {view === "goals" && (
              <div className="workspace-toolbar">
                <div className="team-filters" aria-label="Filter by team">
                  <div className="feed-tabs">
                    <button
                      type="button"
                      aria-pressed={feed === "all" && !team && !match}
                      onClick={() => {
                        setFeed("all");
                        setSelectedId(null);
                        setPlaying(true);
                        setTeam("");
                        setMatch("");
                      }}
                    >
                      All r/soccer
                    </button>
                    <button
                      type="button"
                      aria-pressed={feed === "following" && !team && !match}
                      onClick={() => {
                        setFeed("following");
                        setSelectedId(null);
                        setPlaying(true);
                        setTeam("");
                        setMatch("");
                      }}
                    >
                      Following
                    </button>
                    <button
                      type="button"
                      aria-pressed={feed === "watch" && !team && !match}
                      onClick={() => {
                        setFeed("watch");
                        setTeam("");
                        setMatch("");
                        setSelectedId(null);
                        setPlaying(true);
                      }}
                    >
                      <Star size={14} />
                      Ones to watch
                    </button>
                  </div>
                  <div
                    className={`club-filters ${prefs.teams.length ? "has-clubs" : ""}`}
                  >
                    {data?.teams
                      .filter((t) => prefs.teams.includes(t.id))
                      .map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          aria-pressed={team === t.id}
                          onClick={() => {
                            setTeam(team === t.id ? "" : t.id);
                            setMatch("");
                          }}
                        >
                          <TeamCrest team={t} />
                          {t.name}
                        </button>
                      ))}
                    <button
                      type="button"
                      className="add-team"
                      aria-label="Choose favourite teams"
                      onClick={() => navigate("teams")}
                    >
                      <Star size={15} />
                      <span>Teams</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button refresh"
                  aria-label="Refresh sources"
                  onClick={() => setRefresh((v) => v + 1)}
                  disabled={loading || pendingWrites > 0}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            )}
            {loading && !data ? (
              <section
                className="loading-view"
                aria-label="Loading goal room"
                aria-busy="true"
              >
                <div />
                <div />
                <div />
                <p role="status">Loading your goal room…</p>
              </section>
            ) : (
              data && (
                <>
                  {view === "goals" && (
                    <div
                      className={`goal-workspace ${mobilePlayer && selected ? "player-open" : ""}${cinema ? " cinema" : ""}`}
                    >
                      <section className="goal-queue" aria-label="Goal feed">
                        <div className="section-bar">
                          <h2>
                            {feed === "watch"
                              ? "Ones to watch"
                              : "Recent goals"}{" "}
                            <span>{visibleGoals.length}</span>
                          </h2>
                          <label className="check-filter">
                            <input
                              type="checkbox"
                              checked={unwatched}
                              onChange={(e) => setUnwatched(e.target.checked)}
                            />
                            Unwatched
                          </label>
                        </div>
                        <label className="goal-search">
                          <Search size={15} aria-hidden="true" />
                          <input
                            ref={goalSearchInput}
                            name="goal-search"
                            type="search"
                            aria-label="Search goals"
                            placeholder={
                              prefs.spoilers
                                ? "Find a team"
                                : "Find team or scorer"
                            }
                            value={goalSearch}
                            maxLength={100}
                            onChange={(event) =>
                              setGoalSearch(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                setGoalSearch("");
                              }
                            }}
                          />
                          {!!goalSearch && (
                            <button
                              type="button"
                              aria-label="Clear goal search"
                              onClick={() => {
                                setGoalSearch("");
                                goalSearchInput.current?.focus();
                              }}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </label>
                        <p id="goal-keyboard-help" className="sr-only">
                          Use the up and down arrow keys to browse goals. Press
                          Enter to play.
                        </p>
                        {match && (
                          <div className="active-filter">
                            <span>
                              {activeMatch
                                ? `${activeMatch.homeName} vs ${activeMatch.awayName}`
                                : "Selected match"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setMatch("")}
                              aria-label="Clear match filter"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        <div
                          className="goal-list scroll-region"
                          tabIndex={0}
                          aria-label="Recent goal clips"
                          aria-describedby="goal-keyboard-help"
                          onKeyDown={(event) => {
                            if (
                              event.altKey ||
                              event.ctrlKey ||
                              event.metaKey ||
                              event.shiftKey ||
                              !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                                event.key,
                              )
                            )
                              return;
                            const rows = Array.from(
                              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                ".goal-row",
                              ),
                            );
                            if (!rows.length) return;
                            const index = rows.indexOf(
                              document.activeElement as HTMLButtonElement,
                            );
                            const target =
                              event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? rows.length - 1
                                  : event.key === "ArrowUp"
                                    ? index < 0
                                      ? rows.length - 1
                                      : Math.max(0, index - 1)
                                    : Math.min(rows.length - 1, index + 1);
                            event.preventDefault();
                            rows[target]?.focus();
                          }}
                        >
                          {visibleGoals.length ? (
                            visibleGoals.map((goal) => (
                              <button
                                type="button"
                                key={goal.id}
                                className={`goal-row ${selected?.id === goal.id ? "selected" : ""}`}
                                onClick={() => select(goal)}
                                onPointerEnter={() => {
                                  if (
                                    !prefs.spoilers ||
                                    revealed.includes(goal.id)
                                  )
                                    void warmClip(goal.media).catch(() => {});
                                }}
                                onFocus={() => {
                                  if (
                                    !prefs.spoilers ||
                                    revealed.includes(goal.id)
                                  )
                                    void warmClip(goal.media).catch(() => {});
                                }}
                                aria-pressed={selected?.id === goal.id}
                                aria-label={
                                  prefs.spoilers && !revealed.includes(goal.id)
                                    ? `${name(goal.homeId)} versus ${name(goal.awayId)}, reveal goal`
                                    : `${name(goal.homeId)} ${goal.homeScore}–${goal.awayScore} ${name(goal.awayId)}, ${goal.minute} minutes`
                                }
                              >
                                <span className="goal-minute">
                                  {prefs.spoilers &&
                                  !revealed.includes(goal.id) ? (
                                    <EyeOff size={17} />
                                  ) : (
                                    `${goal.minute}′`
                                  )}
                                </span>
                                <span className="goal-copy">
                                  <span className="goal-matchup">
                                    <span className="goal-team">
                                      <TeamCrest
                                        team={data.teams.find(
                                          (t) => t.id === goal.homeId,
                                        )}
                                      />
                                      <span className="goal-team-name">
                                        {name(goal.homeId)}
                                      </span>
                                      <b>
                                        {prefs.spoilers &&
                                        !revealed.includes(goal.id)
                                          ? "—"
                                          : goal.homeScore}
                                      </b>
                                    </span>
                                    <span className="goal-team">
                                      <TeamCrest
                                        team={data.teams.find(
                                          (t) => t.id === goal.awayId,
                                        )}
                                      />
                                      <span className="goal-team-name">
                                        {name(goal.awayId)}
                                      </span>
                                      <b>
                                        {prefs.spoilers &&
                                        !revealed.includes(goal.id)
                                          ? "—"
                                          : goal.awayScore}
                                      </b>
                                    </span>
                                  </span>
                                  <strong>
                                    {prefs.spoilers &&
                                    !revealed.includes(goal.id)
                                      ? "Goal details hidden"
                                      : goal.scorer}
                                  </strong>
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
                                    {goal.sample
                                      ? "Sample goal"
                                      : new Intl.DateTimeFormat(undefined, {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }).format(new Date(goal.publishedAt))}
                                    {prefs.watched.includes(goal.id) && (
                                      <span className="watched-note">
                                        <Check size={12} aria-hidden="true" />
                                        Watched
                                      </span>
                                    )}
                                    {goal.alternatives.length
                                      ? ` / ${goal.alternatives.length} alternate`
                                      : ""}
                                  </small>
                                </span>
                                <span className="queue-play" aria-hidden="true">
                                  <Play
                                    size={13}
                                    fill={
                                      selected?.id === goal.id
                                        ? "currentColor"
                                        : "none"
                                    }
                                  />
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="empty queue-empty">
                              <GoalIcon size={26} />
                              <h3>
                                {goalSearch.trim()
                                  ? "No matching goals"
                                  : feed === "watch"
                                    ? "No tagged goals yet"
                                    : prefs.teams.length || prefs.matches.length
                                      ? "No goals in this feed"
                                      : "Start with your teams"}
                              </h3>
                              <p>
                                {goalSearch.trim()
                                  ? prefs.spoilers
                                    ? "Try another team or clear your search."
                                    : "Try another team or scorer, or clear your search."
                                  : feed === "watch"
                                    ? "Posts labelled great goal, screamer, golazo and similar appear here. These labels come from Reddit titles."
                                    : unwatched
                                      ? "You’re caught up. Turn off Unwatched to see your clips."
                                      : match || team
                                        ? "No matching goal clips yet. Try another team or clear the filter."
                                        : prefs.teams.length
                                          ? "Your followed teams’ goals will appear when a source finds them. You can also add a clip link."
                                          : "Follow a club to keep its goals close."}
                              </p>
                              <button
                                type="button"
                                className="quiet"
                                onClick={() =>
                                  goalSearch.trim()
                                    ? (setGoalSearch(""),
                                      goalSearchInput.current?.focus())
                                    : feed === "watch"
                                      ? (setFeed("all"),
                                        setSelectedId(null),
                                        setPlaying(true))
                                      : unwatched
                                        ? setUnwatched(false)
                                        : match || team
                                          ? (setMatch(""), setTeam(""))
                                          : navigate(
                                              prefs.teams.length
                                                ? "sources"
                                                : "teams",
                                            )
                                }
                              >
                                {goalSearch.trim()
                                  ? "Clear search"
                                  : feed === "watch"
                                    ? "Show all goals"
                                    : unwatched
                                      ? "Show all goals"
                                      : match || team
                                        ? "Clear filter"
                                        : prefs.teams.length
                                          ? "Check sources"
                                          : "Choose teams"}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="queue-footer">
                          {sample
                            ? "Sample goals, no footage"
                            : "Recent posts / last 48 hours"}
                          {loading && <span role="status">Refreshing…</span>}
                        </div>
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
                            <div className="player-header">
                              <span className="match-scoreboard">
                                <span className="scoreboard-team home">
                                  <TeamCrest
                                    team={data.teams.find(
                                      (t) => t.id === selected.homeId,
                                    )}
                                  />
                                  <span title={name(selected.homeId)}>
                                    {name(selected.homeId)}
                                  </span>
                                </span>
                                <strong
                                  className="scoreboard-result"
                                  aria-label={
                                    hideScore
                                      ? "Score hidden"
                                      : `Score at this goal: ${selected.homeScore} to ${selected.awayScore}`
                                  }
                                >
                                  {hideScore ? (
                                    <EyeOff size={18} />
                                  ) : (
                                    <>
                                      {selected.homeScore}
                                      <span>:</span>
                                      {selected.awayScore}
                                    </>
                                  )}
                                </strong>
                                <span className="scoreboard-team away">
                                  <TeamCrest
                                    team={data.teams.find(
                                      (t) => t.id === selected.awayId,
                                    )}
                                  />
                                  <span title={name(selected.awayId)}>
                                    {name(selected.awayId)}
                                  </span>
                                </span>
                              </span>
                              <button
                                type="button"
                                className="icon-button cinema-toggle"
                                aria-label={
                                  cinema ? "Exit cinema view" : "Expand player"
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
                                onClick={() => toggle("watched", selected.id)}
                                aria-label={
                                  prefs.watched.includes(selected.id)
                                    ? "Mark as unwatched"
                                    : "Mark as watched"
                                }
                                aria-pressed={prefs.watched.includes(
                                  selected.id,
                                )}
                              >
                                {prefs.watched.includes(selected.id) ? (
                                  <Check size={17} />
                                ) : (
                                  <Eye size={17} />
                                )}
                              </button>
                            </div>
                            <div className="video-stage">
                              {hideScore ? (
                                <div className="stage-message">
                                  <EyeOff size={30} />
                                  <h2>A goal worth waiting for.</h2>
                                  <p>Reveal this goal when you’re ready.</p>
                                  <button
                                    type="button"
                                    className="primary"
                                    onClick={() => (
                                      setRevealed([...revealed, selected.id]),
                                      setPlaying(true)
                                    )}
                                  >
                                    Reveal goal
                                  </button>
                                </div>
                              ) : playingGoal?.id === selected.id &&
                                selected.media &&
                                (!compactPlayer || mobilePlayer) ? (
                                <ClipPlayback
                                  key={`${selected.id}-${playbackAttempt}`}
                                  media={selected.media}
                                  mirrors={selected.mirrors}
                                  alternatives={selected.alternatives}
                                  sourceUrl={selected.sourceUrl}
                                  title={`${name(selected.homeId)} versus ${name(selected.awayId)} goal clip`}
                                />
                              ) : (
                                <div className="stage-message">
                                  <div className="scoreline">
                                    <span>{short(selected.homeId)}</span>
                                    <strong>
                                      {selected.homeScore}
                                      <i>:</i>
                                      {selected.awayScore}
                                    </strong>
                                    <span>{short(selected.awayId)}</span>
                                  </div>
                                  <h2>
                                    {selected.minute} minutes. In the net.
                                  </h2>
                                  <p>
                                    {selected.sample
                                      ? "A sample goal to explore the workspace. Connect a source or add a clip for real footage."
                                      : selected.media
                                        ? "Load the clip from its original host."
                                        : "This host opens in the original Reddit thread."}
                                  </p>
                                  {selected.media ? (
                                    <button
                                      type="button"
                                      className="primary"
                                      onClick={() => {
                                        setSelectedId(selected.id);
                                        setNewGoalCount(0);
                                        setPlaying(true);
                                        if (
                                          !prefs.watched.includes(selected.id)
                                        )
                                          toggle("watched", selected.id);
                                      }}
                                    >
                                      <Play size={17} fill="currentColor" />
                                      Play clip
                                    </button>
                                  ) : selected.sourceUrl ? (
                                    <a
                                      className="primary"
                                      href={selected.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Watch at source
                                      <ExternalLink size={15} />
                                    </a>
                                  ) : (
                                    <a className="quiet" href="?view=sources">
                                      Connect a source
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="clip-details">
                              <div>
                                <h2>
                                  {hideScore
                                    ? "Goal details hidden"
                                    : selected.scorer}
                                </h2>
                                <p>
                                  {hideScore
                                    ? "Scores and scorers stay hidden until you reveal this goal."
                                    : selected.sample
                                      ? "Fictional goal metadata for the sample workspace."
                                      : `${selected.minute}′ / ${name(selected.homeId)} vs ${name(selected.awayId)}`}
                                </p>
                                {selected.watchReason && (
                                  <a
                                    className="watch-reason"
                                    href={
                                      selected.watchSourceUrl ||
                                      selected.sourceUrl
                                    }
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
                                      <p>
                                        Posted to r/soccer by u/
                                        {selected.author}
                                      </p>
                                    )}
                                  </details>
                                )}
                              </div>
                              <div className="clip-actions">
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
                                <nav
                                  className="clip-navigation"
                                  aria-label="Goal navigation"
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "ArrowLeft" ||
                                      event.key === "ArrowRight"
                                    ) {
                                      event.preventDefault();
                                      const goal =
                                        event.key === "ArrowLeft"
                                          ? previousGoal
                                          : nextGoal;
                                      if (goal) select(goal);
                                    }
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Previous goal"
                                    disabled={!previousGoal}
                                    onClick={() =>
                                      previousGoal && select(previousGoal)
                                    }
                                  >
                                    <ChevronLeft size={17} />
                                  </button>
                                  <span title="Position in the current results">
                                    {selectedIndex >= 0
                                      ? `${selectedIndex + 1} / ${visibleGoals.length}`
                                      : `${visibleGoals.length} results`}
                                  </span>
                                  <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Next goal"
                                    disabled={!nextGoal}
                                    onClick={() => nextGoal && select(nextGoal)}
                                  >
                                    <ChevronRight size={17} />
                                  </button>
                                </nav>
                              </div>
                            </div>
                            {playing && (
                              <details className="playback-help">
                                <summary>Playback help</summary>
                                <p className="playback-note">
                                  Starts muted. Use the player controls for
                                  sound. Removed or restricted clip? Check the
                                  Reddit thread for mirrors.
                                </p>
                              </details>
                            )}
                            {!!selected.alternatives.length && (
                              <div className="alternates">
                                <h3>Other posts of this goal</h3>
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
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="player-welcome">
                            <span className="wordmark">touchline</span>
                            <h2>
                              {feed === "watch" ? (
                                "Ones to watch"
                              ) : (
                                <>
                                  Your teams.
                                  <br />
                                  Their goals.
                                </>
                              )}
                            </h2>
                            <p>
                              {feed === "watch"
                                ? "Great goals and other title-tagged clips appear here."
                                : "Follow your clubs, pick a match, keep the moments."}
                            </p>
                            <button
                              type="button"
                              className="primary"
                              onClick={() =>
                                feed === "watch"
                                  ? setFeed("all")
                                  : navigate("teams")
                              }
                            >
                              {feed === "watch"
                                ? "Show all goals"
                                : "Choose your teams"}
                              <ArrowRight size={17} />
                            </button>
                            {!sample && (
                              <a href="?sample=true">
                                Explore a sample workspace
                              </a>
                            )}
                          </div>
                        )}
                      </section>
                      {matchesOpen && (
                        <button
                          type="button"
                          className="matches-scrim"
                          aria-label="Close matches"
                          onClick={() => {
                            setMatchesOpen(false);
                            matchesTrigger.current?.focus();
                          }}
                        />
                      )}
                      <div
                        ref={matchesPanel}
                        id="matches-sidebar"
                        role={matchesOpen ? "dialog" : "complementary"}
                        aria-modal={matchesOpen ? true : undefined}
                        className={`match-rail${matchesOpen ? " matches-open" : ""}`}
                        aria-label="Matches"
                      >
                        <div className="section-bar">
                          <h2>Matches</h2>
                          <button
                            type="button"
                            ref={matchesClose}
                            className="icon-button matches-close"
                            aria-label="Close matches sidebar"
                            onClick={() => {
                              setMatchesOpen(false);
                              matchesTrigger.current?.focus();
                            }}
                          >
                            <X size={17} />
                          </button>
                          <span className="muted">
                            {matchList.length} matches
                          </span>
                        </div>
                        {dateControls()}
                        <div
                          className="match-list scroll-region"
                          tabIndex={0}
                          aria-label="Today’s matches"
                        >
                          {matchList.length ? (
                            <>
                              {!!goalMatches.length && (
                                <>
                                  <h3 className="match-group-heading">
                                    With goals <span>Last 48 hours</span>
                                  </h3>
                                  {goalMatches.map(matchRow)}
                                </>
                              )}
                              {!!scheduledMatches.length && (
                                <>
                                  <h3 className="match-group-heading">
                                    Fixtures{" "}
                                    <span>
                                      {new Intl.DateTimeFormat(undefined, {
                                        day: "numeric",
                                        month: "short",
                                      }).format(selectedDate)}
                                    </span>
                                  </h3>
                                  {scheduledMatches.map(matchRow)}
                                </>
                              )}
                            </>
                          ) : (
                            <div className="empty">
                              <p>
                                {connected
                                  ? "No fixtures available for this day."
                                  : "Connect match data to see kickoffs and scores."}
                              </p>
                              <button
                                type="button"
                                className="quiet"
                                onClick={() => navigate("sources")}
                              >
                                Source setup
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="rail-note">
                          {sample
                            ? "Fictional matchday"
                            : "Times shown in your time zone"}
                        </p>
                      </div>
                    </div>
                  )}
                  {view === "teams" && (
                    <section className="teams-view">
                      <div className="section-bar">
                        <h2>{prefs.teams.length} teams followed</h2>
                        <label className="search-input">
                          <Search size={16} />
                          <span className="sr-only">Search teams</span>
                          <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search club or country"
                          />
                        </label>
                      </div>
                      <details className="catalog-note">
                        <summary>{data.teams.length} clubs available</summary>
                        <p className="panel-note">
                          {data.teams.length} clubs available from the
                          catalogue, fixtures and current r/soccer goal posts.
                        </p>
                      </details>
                      <div
                        className="team-list scroll-region"
                        tabIndex={0}
                        aria-label="Choose favourite teams"
                      >
                        {filteredTeams.map((t) => (
                          <div className="team-row" key={t.id}>
                            <TeamCrest team={t} large />
                            <div>
                              <h3>{t.name}</h3>
                              <p>{t.country}</p>
                            </div>
                            <button
                              type="button"
                              className="follow-button"
                              aria-pressed={prefs.teams.includes(t.id)}
                              aria-label={`${prefs.teams.includes(t.id) ? "Unfollow" : "Follow"} ${t.name}`}
                              onClick={() => toggle("teams", t.id)}
                              disabled={!ready}
                            >
                              <Star
                                size={16}
                                fill={
                                  prefs.teams.includes(t.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                              <span>
                                {prefs.teams.includes(t.id)
                                  ? "Following"
                                  : "Follow"}
                              </span>
                            </button>
                          </div>
                        ))}
                        {!filteredTeams.length && (
                          <div className="empty">
                            <h3>No club found</h3>
                            <p>Try the club name or its country.</p>
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => setSearch("")}
                            >
                              Clear search
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                  {view === "sources" && (
                    <section
                      className="sources-view scroll-region"
                      tabIndex={0}
                      aria-label="Source connections"
                    >
                      <div className="source-list">
                        {data.sources.map((source) => (
                          <article className="source-row" key={source.name}>
                            <div>
                              <h2>{source.name}</h2>
                              <p>{source.message}</p>
                              {source.updatedAt && (
                                <small>
                                  Last fetched{" "}
                                  {new Intl.DateTimeFormat(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }).format(new Date(source.updatedAt))}
                                </small>
                              )}
                            </div>
                            <span className="connection-label">
                              {source.state === "connected"
                                ? "Connected"
                                : source.state === "error"
                                  ? "Needs attention"
                                  : source.state === "sample"
                                    ? "Sample"
                                    : "Not connected"}
                            </span>
                          </article>
                        ))}
                      </div>
                      <div className="setup-notes">
                        <section>
                          <h2>Connect fixtures</h2>
                          <details className="setup-disclosure">
                            <summary>Configure fixture access</summary>
                            <p>
                              Create a football-data.org account, then set{" "}
                              <code>FootballData:Token</code> using .NET user
                              secrets. Restart the backend after changing
                              settings.
                            </p>
                            <a
                              href="https://www.football-data.org/client/register"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Get a fixture key
                              <ExternalLink size={14} />
                            </a>
                            <p>
                              Run <code>./scripts/configure-provider.ps1</code>{" "}
                              to enter your key privately on this computer.
                            </p>
                          </details>
                          <p>
                            Free-plan scores are delayed. Match coverage and
                            freshness depend on your provider plan.
                          </p>
                          <p>
                            <a
                              href="https://www.football-data.org"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Football-data.org
                            </a>
                          </p>
                        </section>
                        <section>
                          <h2>Reddit goal feed</h2>
                          <p>
                            Recent r/soccer posts arrive through Reddit’s public
                            RSS feed, refreshed every two minutes. Reddit
                            retires RSS on 13 November 2026; this connection
                            will stop then.
                          </p>
                          <a
                            href="https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Reddit’s RSS announcement
                            <ExternalLink size={14} />
                          </a>
                          <details className="setup-disclosure">
                            <summary>Approved API access</summary>
                            <p>
                              A Reddit login does not establish API approval.
                              Only enable the connector if you already have an
                              approved app. Credentials belong in server-side
                              user secrets.
                            </p>
                            <p>
                              New public Data API access requests are closed.
                              Reddit’s app-registration page is for existing API
                              apps; it does not issue a new API key.
                            </p>
                            <p>
                              Set <code>Reddit:Enabled</code> and either an
                              OAuth access token or your approved app’s client
                              ID and secret. The README has the commands.
                            </p>
                            <a
                              href="https://developers.reddit.com/app-registration"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Reddit developer access
                              <ExternalLink size={14} />
                            </a>
                          </details>
                        </section>
                        <section>
                          <h2>Your clip links</h2>
                          <p>
                            Add a Reddit goal post and its clip URL yourself.
                            Streamable, Streamain, Streamin and YouTube can play
                            here; other hosts open at the source. Nothing is
                            downloaded or rehosted.
                          </p>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setImporting(true)}
                            disabled={sample}
                          >
                            Add a clip link
                            <Plus size={15} />
                          </button>
                        </section>
                      </div>
                      <details className="storage-details">
                        <summary>Local storage and sample workspace</summary>
                        <p>
                          This is a single-user local workspace. Your follows
                          and added clips are stored in its SQLite database.
                        </p>
                        {!sample && (
                          <a href="?sample=true">Try the sample workspace</a>
                        )}
                      </details>
                    </section>
                  )}
                </>
              )
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <span
          className="live-status"
          data-state={live.state}
          title={
            live.receivedAt
              ? `Last feed change: ${new Date(live.receivedAt).toLocaleTimeString()}`
              : undefined
          }
        >
          {sample
            ? "Sample / auto updates off"
            : live.state === "connected"
              ? connected
                ? "Auto updates on"
                : "Waiting for source access"
              : live.state === "paused"
                ? "Updates paused while hidden"
                : live.state === "offline"
                  ? "Offline / keeping your feed"
                  : live.state === "reconnecting"
                    ? "Reconnecting / keeping your feed"
                    : "Connecting to updates…"}
          {newGoalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setNewGoalCount(0);
                setSelectedId(visibleGoals[0]?.id || null);
                setPlaying(false);
                setMobilePlayer(false);
              }}
            >
              {newGoalCount} new {newGoalCount === 1 ? "goal" : "goals"}
            </button>
          )}
        </span>
        <span role="status">
          {pendingWrites
            ? "Saving favourites…"
            : sample
              ? "Sample changes stay in this browser"
              : "Local workspace"}
        </span>
      </footer>
    </div>
  );

  function dateControls() {
    return (
      <div className="date-control">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous day"
          onClick={() => dateChange(-1)}
          disabled={day <= localDay(oldestDay)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="today-control"
          aria-label="Go to today"
          aria-pressed={matchday.followingToday}
          onClick={() => {
            matchday.today();
            setMatch("");
          }}
          title="Follow today automatically"
        >
          {new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(selectedDate)}
          <small>{matchday.followingToday ? "Today" : "Go to today"}</small>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Next day"
          onClick={() => dateChange(1)}
          disabled={day >= localDay(latestDay)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }
}

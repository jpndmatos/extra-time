import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveFeed } from "./useLiveFeed";
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
type View = "goals" | "matchday" | "teams" | "sources";
const tabs: { id: View; label: string }[] = [
  { id: "goals", label: "Goal room" },
  { id: "matchday", label: "Matchday" },
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
  const initial = new URLSearchParams(location.search);
  const sample = initial.get("sample") === "true";
  const [view, setView] = useState<View>(
    tabs.some((t) => t.id === initial.get("view"))
      ? (initial.get("view") as View)
      : "goals",
  );
  const [day, setDay] = useState(initial.get("day") || localDay(new Date()));
  const [team, setTeam] = useState(initial.get("team") || "");
  const [match, setMatch] = useState(initial.get("match") || "");
  const [data, setData] = useState<Dashboard | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(sample ? loadSample : empty);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [preferencesRetry, setPreferencesRetry] = useState(0);
  const [error, setError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [ready, setReady] = useState(sample);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [unwatched, setUnwatched] = useState(false);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [mobilePlayer, setMobilePlayer] = useState(false);
  const [cinema, setCinema] = useState(false);
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
      const added = tracked(
        next.goals,
        next.matches,
        latest.current,
        team,
        match,
        unwatched,
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
    params.set("day", day);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [view, sample, day, team, match]);

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
    const date = new Date(day + "T12:00:00");
    date.setDate(date.getDate() + delta);
    setDay(localDay(date));
    setMatch("");
  }
  function select(goal: Goal) {
    setNewGoalCount(0);
    setSelectedId(goal.id);
    setPlaying(false);
    setMobilePlayer(true);
  }
  function name(id: string) {
    return data?.teams.find((t) => t.id === id)?.name || id;
  }
  function short(id: string) {
    return data?.teams.find((t) => t.id === id)?.shortName || id.slice(0, 3);
  }
  const visibleGoals = data
    ? tracked(data.goals, data.matches, prefs, team, match, unwatched)
    : [];
  const playingGoal = playing
    ? data?.goals.find((goal) => goal.id === selectedId)
    : undefined;
  const selected =
    playingGoal ||
    visibleGoals.find((g) => g.id === selectedId) ||
    visibleGoals[0];
  useEffect(() => {
    if (selectedId === null && selected) setSelectedId(selected.id);
  }, [selectedId, selected?.id]);
  const hideScore =
    prefs.spoilers && selected && !revealed.includes(selected.id);
  const selectedDate = new Date(day + "T12:00:00");
  const matchList =
    data?.matches
      .filter(
        (m) =>
          localDay(new Date(m.kickoff)) === day &&
          (!team || m.homeId === team || m.awayId === team),
      )
      .sort(
        (a, b) =>
          Number(prefs.matches.includes(b.id)) -
            Number(prefs.matches.includes(a.id)) ||
          a.kickoff.localeCompare(b.kickoff),
      ) || [];
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
        className={`fixture ${isTracked ? "tracked" : ""}`}
        key={fixture.id}
      >
        <div className="fixture-meta">
          <span>{fixture.competition}</span>
          <span>
            {fixture.status === "FINISHED"
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
            className="fixture-teams"
            onClick={() => {
              setMatch(fixture.id);
              setTeam("");
              navigate("goals");
            }}
            aria-label={`Show goals from ${fixture.homeName} versus ${fixture.awayName}`}
          >
            <span>
              {fixture.homeName}
              <b>{prefs.spoilers ? "—" : (fixture.homeScore ?? "—")}</b>
            </span>
            <span>
              {fixture.awayName}
              <b>{prefs.spoilers ? "—" : (fixture.awayScore ?? "—")}</b>
            </span>
          </button>
          <button
            className="icon-button"
            aria-label={`${followed ? "Unfollow" : "Follow"} match: ${fixture.homeName} versus ${fixture.awayName}`}
            aria-pressed={followed}
            onClick={() => toggle("matches", fixture.id)}
            disabled={!ready}
          >
            <Bookmark size={17} fill={followed ? "currentColor" : "none"} />
          </button>
        </div>
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={view === tab.id ? "page" : undefined}
              onClick={() => navigate(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="source-status" onClick={() => navigate("sources")}>
          <Settings2 size={16} />
          {sample ? "Sample workspace" : `${connected}/2 sources connected`}
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
        <div className="page-heading">
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {importing
                ? "Add a goal clip"
                : tabs.find((t) => t.id === view)?.label}
            </h1>
            <p>
              {view === "goals"
                ? "Just the goals from the teams and matches you follow."
                : view === "matchday"
                  ? "Follow a fixture to keep all its goals in your feed."
                  : view === "teams"
                    ? "Pick your clubs. Their goals will find their way here."
                    : "Choose where your fixtures and goal clips come from."}
            </p>
          </div>
          <div className="heading-actions">
            <button
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
              className="primary"
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
            <button onClick={() => setRefresh((v) => v + 1)}>Try again</button>
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
                Paste a goal post from Reddit. Add a Streamable or YouTube URL
                for inline playback; other hosts open in the original thread.
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
                Clip URL <small>Optional, Streamable or YouTube</small>
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
            {(view === "goals" || view === "matchday") && (
              <div className="workspace-toolbar">
                <div className="team-filters" aria-label="Filter by team">
                  <button
                    aria-pressed={!team}
                    onClick={() => {
                      setTeam("");
                      setMatch("");
                    }}
                  >
                    All followed
                  </button>
                  {data?.teams
                    .filter((t) => prefs.teams.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        aria-pressed={team === t.id}
                        onClick={() => {
                          setTeam(team === t.id ? "" : t.id);
                          setMatch("");
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  <button
                    className="add-team"
                    aria-label="Choose favourite teams"
                    onClick={() => navigate("teams")}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <button
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
                            Recent goals <span>{visibleGoals.length}</span>
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
                        {match && (
                          <div className="active-filter">
                            <span>Selected match</span>
                            <button
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
                        >
                          {visibleGoals.length ? (
                            visibleGoals.map((goal) => (
                              <button
                                key={goal.id}
                                className={`goal-row ${selected?.id === goal.id ? "selected" : ""}`}
                                onClick={() => select(goal)}
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
                                  <span>
                                    {short(goal.homeId)}
                                    <b>
                                      {prefs.spoilers &&
                                      !revealed.includes(goal.id)
                                        ? "Goal"
                                        : `${goal.homeScore} – ${goal.awayScore}`}
                                    </b>
                                    {short(goal.awayId)}
                                  </span>
                                  <strong>
                                    {prefs.spoilers &&
                                    !revealed.includes(goal.id)
                                      ? "Goal details hidden"
                                      : goal.scorer}
                                  </strong>
                                  <small>
                                    {goal.sample
                                      ? "Sample goal"
                                      : "Reddit goal post"}
                                    {prefs.watched.includes(goal.id)
                                      ? " / Watched"
                                      : ""}
                                    {goal.alternatives.length
                                      ? ` / ${goal.alternatives.length} alternate`
                                      : ""}
                                  </small>
                                </span>
                                <Play size={14} />
                              </button>
                            ))
                          ) : (
                            <div className="empty queue-empty">
                              <GoalIcon size={26} />
                              <h3>
                                {prefs.teams.length || prefs.matches.length
                                  ? "No goals in this feed"
                                  : "Start with your teams"}
                              </h3>
                              <p>
                                {unwatched
                                  ? "You’re caught up. Turn off Unwatched to see your clips."
                                  : match || team
                                    ? "No matching goal clips yet. Try another team or clear the filter."
                                    : prefs.teams.length
                                      ? "Your followed teams’ goals will appear when a source finds them. You can also add a clip link."
                                      : "Follow a club to keep its goals close."}
                              </p>
                              <button
                                className="quiet"
                                onClick={() =>
                                  unwatched
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
                                {unwatched
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
                          className="mobile-back quiet"
                          onClick={() => setMobilePlayer(false)}
                        >
                          <ArrowLeft size={15} />
                          Back to goals
                        </button>
                        {selected ? (
                          <>
                            <div className="player-header">
                              <span>
                                {name(selected.homeId)}{" "}
                                <span className="muted">vs</span>{" "}
                                {name(selected.awayId)}
                              </span>
                              <button
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
                                    className="primary"
                                    onClick={() =>
                                      setRevealed([...revealed, selected.id])
                                    }
                                  >
                                    Reveal goal
                                  </button>
                                </div>
                              ) : playingGoal?.id === selected.id &&
                                selected.media ? (
                                <iframe
                                  key={selected.id}
                                  src={selected.media.url}
                                  title={`${name(selected.homeId)} versus ${name(selected.awayId)} goal clip`}
                                  allow="fullscreen; encrypted-media; picture-in-picture"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  allowFullScreen
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
                                      : selected.title}
                                </p>
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
                            {playing && (
                              <p className="playback-note">
                                If the clip is removed, blocked or won’t play,
                                open the Reddit thread for the original post and
                                mirrors.
                              </p>
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
                              Your teams.
                              <br />
                              Their goals.
                            </h2>
                            <p>
                              Follow your clubs, pick a match, keep the moments.
                            </p>
                            <button
                              className="primary"
                              onClick={() => navigate("teams")}
                            >
                              Choose your teams
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
                      <aside className="match-rail">
                        <div className="section-bar">
                          <h2>Matchday</h2>
                          <button
                            className="icon-button"
                            onClick={() => navigate("matchday")}
                            aria-label="Open full matchday"
                          >
                            <ArrowRight size={16} />
                          </button>
                        </div>
                        {dateControls()}
                        <div
                          className="match-list scroll-region"
                          tabIndex={0}
                          aria-label="Today’s matches"
                        >
                          {matchList.length ? (
                            matchList.map(matchRow)
                          ) : (
                            <div className="empty">
                              <p>
                                {connected
                                  ? "No fixtures available for this day."
                                  : "Connect match data to see kickoffs and scores."}
                              </p>
                              <button
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
                      </aside>
                    </div>
                  )}
                  {view === "matchday" && (
                    <section className="matchday-view">
                      <div className="section-bar">
                        <h2>Fixtures</h2>
                        {dateControls()}
                      </div>
                      <div
                        className="matchday-list scroll-region"
                        tabIndex={0}
                        aria-label="Matchday fixtures"
                      >
                        {matchList.length ? (
                          matchList.map(matchRow)
                        ) : (
                          <div className="empty">
                            <h3>No fixtures here yet</h3>
                            <p>Try another day or connect football-data.org.</p>
                            <button
                              className="quiet"
                              onClick={() => navigate("sources")}
                            >
                              Check sources
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
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
                      <div
                        className="team-list scroll-region"
                        tabIndex={0}
                        aria-label="Choose favourite teams"
                      >
                        {filteredTeams.map((t) => (
                          <div className="team-row" key={t.id}>
                            <span className="club-code">{t.shortName}</span>
                            <div>
                              <h3>{t.name}</h3>
                              <p>{t.country}</p>
                            </div>
                            <button
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
                              className="quiet"
                              onClick={() => setSearch("")}
                            >
                              Clear search
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="panel-note">
                        24 supported clubs across Portugal, England, Spain,
                        France, Germany and Italy. More can be added to the
                        shared team catalogue.
                      </p>
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
                            Free-plan scores are delayed. Match coverage and
                            freshness depend on your provider plan.
                          </p>
                        </section>
                        <section>
                          <h2>Check Reddit access first</h2>
                          <p>
                            A Reddit login does not establish API approval. Only
                            enable the connector if you already have an approved
                            app. Credentials belong in server-side user secrets.
                          </p>
                          <p>
                            Set <code>Reddit:Enabled</code> and either an OAuth
                            access token or your approved app’s client ID and
                            secret. The README has the commands.
                          </p>
                          <a
                            href="https://developers.reddit.com/app-registration"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Reddit developer access
                            <ExternalLink size={14} />
                          </a>
                        </section>
                        <section>
                          <h2>Keep watching in the meantime</h2>
                          <p>
                            Add a Reddit goal post and its clip URL yourself.
                            Streamable and YouTube can play here; other hosts
                            open at the source. Nothing is downloaded or
                            rehosted.
                          </p>
                          <button
                            className="quiet"
                            onClick={() => setImporting(true)}
                            disabled={sample}
                          >
                            Add a clip link
                            <Plus size={15} />
                          </button>
                        </section>
                      </div>
                      <div className="notice">
                        <p>
                          This is a single-user local workspace. Your follows
                          and added clips are stored in its SQLite database.
                        </p>
                        {!sample && (
                          <a href="?sample=true">Try the sample workspace</a>
                        )}
                      </div>
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
          className="icon-button"
          aria-label="Previous day"
          onClick={() => dateChange(-1)}
          disabled={day <= localDay(oldestDay)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(selectedDate)}
        </span>
        <button
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

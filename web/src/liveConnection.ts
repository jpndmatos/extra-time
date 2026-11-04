import { apiUrl } from "./api";
import { request, type Dashboard } from "./types";

export type ConnectionState =
  "connecting" | "connected" | "reconnecting" | "polling";

function dashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Dashboard>;
  return (
    data.sample === false &&
    [data.goals, data.teams, data.matches, data.sources].every(Array.isArray)
  );
}

// One stream and at most one fallback request per visible tab. Neither transport
// touches the player, and a disposed subscription cannot publish stale responses.
export function connectLiveFeed(
  day: string,
  onDashboard: (data: Dashboard) => void,
  onState: (state: ConnectionState) => void,
  onReceived: (at: number) => void,
  version?: { get: () => string | null; set: (value: string) => void },
) {
  let disposed = false;
  let healthy = false;
  let fallbackHealthy = false;
  let stream: EventSource | null = null;
  let retryDelay = 3_000;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | null = null;
  const path = `/api/dashboard?day=${encodeURIComponent(day)}&sample=false`;

  function publish(data: unknown) {
    if (disposed || !dashboard(data)) return false;
    onDashboard(data);
    onReceived(Date.now());
    return true;
  }
  function stopPolling() {
    clearTimeout(poll);
    poll = undefined;
    pending?.abort();
    pending = null;
  }
  async function pollOnce() {
    poll = undefined;
    if (disposed || healthy || pending) return;
    const controller = new AbortController();
    pending = controller;
    try {
      const data = await request<Dashboard>(path, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && !healthy && publish(data)) {
        fallbackHealthy = true;
        onState("polling");
      }
    } catch {
      if (!disposed && !controller.signal.aborted && !healthy) {
        fallbackHealthy = false;
        onState("reconnecting");
      }
    } finally {
      if (pending === controller) pending = null;
      if (!disposed && !healthy) poll = setTimeout(pollOnce, 30_000);
    }
  }
  function connect() {
    if (disposed) return;
    if (!poll && !pending) onState("connecting");
    if (typeof EventSource === "undefined") {
      poll = setTimeout(pollOnce, 0);
      return;
    }
    const params = new URLSearchParams({ day });
    const previous = version?.get();
    if (previous && /^[a-f0-9]{64}$/i.test(previous))
      params.set("version", previous);
    const current = new EventSource(apiUrl(`/api/live?${params}`));
    stream = current;
    function lost() {
      if (disposed || stream !== current) return;
      current.close();
      stream = null;
      healthy = false;
      clearTimeout(heartbeat);
      onState(fallbackHealthy ? "polling" : "reconnecting");
      if (!poll && !pending) poll = setTimeout(pollOnce, 1_000);
      reconnect = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }
    function alive() {
      if (disposed || stream !== current) return;
      healthy = true;
      retryDelay = 3_000;
      stopPolling();
      clearTimeout(heartbeat);
      heartbeat = setTimeout(lost, 45_000);
      onState("connected");
    }
    // An open socket alone is not proof that events are arriving.
    heartbeat = setTimeout(lost, 45_000);
    current.addEventListener("dashboard", (event) => {
      if (disposed || stream !== current) return;
      try {
        if (publish(JSON.parse((event as MessageEvent).data))) {
          const id = (event as MessageEvent).lastEventId;
          if (/^[a-f0-9]{64}$/i.test(id)) version?.set(id);
          alive();
        }
      } catch {
        /* A malformed event must not replace the loaded feed. */
      }
    });
    current.addEventListener("heartbeat", alive);
    current.onerror = lost;
  }
  connect();
  return () => {
    disposed = true;
    stream?.close();
    clearTimeout(reconnect);
    clearTimeout(heartbeat);
    stopPolling();
  };
}

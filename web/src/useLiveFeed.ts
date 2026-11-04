import { useEffect, useRef, useState } from "react";
import type { Dashboard } from "./types";
import { apiUrl } from "./api";

export type LiveState =
  "connecting" | "connected" | "reconnecting" | "paused" | "offline" | "sample";

export function useLiveFeed(
  day: string,
  sample: boolean,
  onDashboard: (data: Dashboard) => void,
) {
  const callback = useRef(onDashboard);
  callback.current = onDashboard;
  const [state, setState] = useState<LiveState>(
    sample ? "sample" : "connecting",
  );
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  useEffect(() => {
    if (sample) {
      setState("sample");
      return;
    }
    let stream: EventSource | null = null;
    let disposed = false;
    function connect() {
      stream?.close();
      stream = null;
      if (disposed) return;
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      if (document.visibilityState !== "visible") {
        setState("paused");
        return;
      }
      setState("connecting");
      stream = new EventSource(
        apiUrl(`/api/live?day=${encodeURIComponent(day)}`),
      );
      stream.onopen = () => setState("connected");
      stream.addEventListener("dashboard", (event) => {
        try {
          const next = JSON.parse((event as MessageEvent).data) as Dashboard;
          if (
            next.sample ||
            !Array.isArray(next.goals) ||
            !Array.isArray(next.matches)
          )
            return;
          callback.current(next);
          setReceivedAt(Date.now());
          setState("connected");
        } catch {
          setState("reconnecting");
        }
      });
      stream.addEventListener("heartbeat", () => setState("connected"));
      // EventSource performs bounded server-directed reconnects automatically.
      stream.onerror = () => {
        if (!disposed) setState(navigator.onLine ? "reconnecting" : "offline");
      };
    }
    connect();
    document.addEventListener("visibilitychange", connect);
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    return () => {
      disposed = true;
      stream?.close();
      document.removeEventListener("visibilitychange", connect);
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
    };
  }, [day, sample]);
  return { state, receivedAt };
}

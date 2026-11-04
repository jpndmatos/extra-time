import { useEffect, useRef, useState } from "react";
import type { Dashboard } from "./types";
import { connectLiveFeed } from "./liveConnection";

export type LiveState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling"
  | "paused"
  | "offline"
  | "sample";

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
    let disconnect: (() => void) | undefined;
    let disposed = false;
    function connect() {
      disconnect?.();
      disconnect = undefined;
      if (disposed) return;
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      if (document.visibilityState !== "visible") {
        setState("paused");
        return;
      }
      disconnect = connectLiveFeed(
        day,
        (data) => callback.current(data),
        setState,
        setReceivedAt,
      );
    }
    connect();
    document.addEventListener("visibilitychange", connect);
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    return () => {
      disposed = true;
      disconnect?.();
      document.removeEventListener("visibilitychange", connect);
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
    };
  }, [day, sample]);
  return { state, receivedAt };
}

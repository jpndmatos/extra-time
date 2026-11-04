import { useEffect, useState } from "react";
import { localDay } from "./types";

export function useMatchday(requestedDay: string | null) {
  const [day, setDay] = useState(requestedDay || localDay(new Date()));
  const [followingToday, setFollowingToday] = useState(
    !requestedDay || requestedDay === localDay(new Date()),
  );
  useEffect(() => {
    if (!followingToday) return;
    const update = () => {
      if (document.visibilityState === "visible") setDay(localDay(new Date()));
    };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    update();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [followingToday]);
  function move(delta: number) {
    setFollowingToday(false);
    setDay((current) => {
      const next = new Date(current + "T12:00:00");
      next.setDate(next.getDate() + delta);
      return localDay(next);
    });
  }
  function today() {
    setDay(localDay(new Date()));
    setFollowingToday(true);
  }
  return { day, followingToday, move, today };
}

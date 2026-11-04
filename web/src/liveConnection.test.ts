import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLiveFeed } from "./liveConnection";
import { request, type Dashboard } from "./types";
vi.mock("./types", () => ({ request: vi.fn() }));
const data = {
  sample: false,
  goals: [],
  teams: [],
  matches: [],
  sources: [],
} as unknown as Dashboard;
class Source extends EventTarget {
  static instances: Source[] = [];
  closed = false;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    super();
    Source.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  fail() {
    this.onerror?.();
  }
  send(value: unknown, lastEventId = "") {
    this.dispatchEvent(
      new MessageEvent("dashboard", {
        data: JSON.stringify(value),
        lastEventId,
      }),
    );
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", Source);
  Source.instances = [];
  vi.mocked(request).mockReset().mockResolvedValue(data);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const receive = vi.fn(),
    state = vi.fn(),
    at = vi.fn();
  return {
    receive,
    state,
    at,
    stop: connectLiveFeed("2026-11-04", receive, state, at),
  };
}
describe("live feed transport", () => {
  it("resumes from a validated event version without requesting an unchanged snapshot", async () => {
    let id: string | null = null;
    const stop = connectLiveFeed("2026-11-04", vi.fn(), vi.fn(), vi.fn(), {
      get: () => id,
      set: (value) => {
        id = value;
      },
    });
    Source.instances[0].send(data, "A".repeat(64));
    expect(id).toBe("A".repeat(64));
    Source.instances[0].fail();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(
      new URL(
        Source.instances[1].url,
        "https://touchline.test",
      ).searchParams.get("version"),
    ).toBe(id);
    stop();
  });
  it("does not send arbitrary saved values as resume parameters", () => {
    const stop = connectLiveFeed("2026-11-04", vi.fn(), vi.fn(), vi.fn(), {
      get: () => "invalid/version?token=untrusted",
      set: vi.fn(),
    });
    expect(
      new URL(
        Source.instances[0].url,
        "https://touchline.test",
      ).searchParams.has("version"),
    ).toBe(false);
    stop();
  });
  it("publishes valid events, ignores malformed/sample payloads and cancels every timer", () => {
    const client = setup(),
      source = Source.instances[0];
    source.send({ ...data, sample: true });
    source.send({ goals: [] });
    expect(client.receive).not.toHaveBeenCalled();
    source.send(data);
    expect(client.receive).toHaveBeenCalledExactlyOnceWith(data);
    expect(client.state).toHaveBeenLastCalledWith("connected");
    client.stop();
    expect(source.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("polls after failure and backs off stream reconnections without dropping the loaded feed", async () => {
    const client = setup();
    Source.instances[0].fail();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(client.receive).toHaveBeenCalledExactlyOnceWith(data);
    expect(client.state).toHaveBeenLastCalledWith("polling");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(Source.instances).toHaveLength(2);
    Source.instances[1].fail();
    expect(client.state).toHaveBeenLastCalledWith("polling");
    await vi.advanceTimersByTimeAsync(5_999);
    expect(Source.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(Source.instances).toHaveLength(3);
    client.stop();
  });
  it("returns to streaming and stops fallback requests as soon as events recover", async () => {
    const client = setup();
    Source.instances[0].fail();
    await vi.advanceTimersByTimeAsync(3_000);
    Source.instances[1].send(data);
    expect(client.state).toHaveBeenLastCalledWith("connected");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request).toHaveBeenCalledTimes(1);
    client.stop();
  });
  it("detects a silent socket and never overlaps fallback fetches", async () => {
    vi.mocked(request).mockImplementation(() => new Promise(() => {}));
    const client = setup();
    await vi.advanceTimersByTimeAsync(46_000);
    expect(Source.instances[0].closed).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(request).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(request).mock.calls[0][1]?.signal;
    client.stop();
    expect(signal?.aborted).toBe(true);
  });
  it("does not publish a late fallback response after disposal", async () => {
    let resolve!: (data: Dashboard) => void;
    vi.mocked(request).mockReturnValue(
      new Promise<Dashboard>((done) => {
        resolve = done;
      }),
    );
    const client = setup();
    Source.instances[0].fail();
    await vi.advanceTimersByTimeAsync(1_000);
    client.stop();
    resolve(data);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.receive).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses polling when EventSource is unavailable", async () => {
    vi.stubGlobal("EventSource", undefined);
    const client = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.receive).toHaveBeenCalledExactlyOnceWith(data);
    expect(client.state).toHaveBeenLastCalledWith("polling");
    client.stop();
  });
});

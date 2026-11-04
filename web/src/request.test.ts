import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./types";
afterEach(() => vi.unstubAllGlobals());
describe("API requests", () => {
  it("keeps GET reads simple and adds JSON content type only for a request body", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await request("/api/dashboard");
    expect(fetch.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
    await request("/api/media", { method: "POST", body: "{}" });
    expect(fetch.mock.calls[1][1].headers.get("Content-Type")).toBe(
      "application/json",
    );
    expect(fetch.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("preserves explicit headers and caller cancellation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(
      await request("/api/test", {
        body: "test",
        headers: new Headers({ "Content-Type": "text/plain" }),
        signal: controller.signal,
      }),
    ).toBeUndefined();
    expect(fetch.mock.calls[0][1].headers.get("Content-Type")).toBe(
      "text/plain",
    );
    controller.abort();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("does not surface malformed problem details or low-level network errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: { unexpected: true } }, { status: 502 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(request("/api/test")).rejects.toThrow(
      "Touchline could not complete",
    );
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(request("/api/test")).rejects.toThrow("Check your connection");
  });
  it("preserves HTTP status so playback retries temporary failures without retrying a removed clip", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: "Host warming up" }, { status: 503 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(request("/api/media")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
    fetch.mockResolvedValue(Response.json(null, { status: 422 }));
    await expect(request("/api/media")).rejects.toBeInstanceOf(ApiError);
    await expect(request("/api/media")).rejects.toMatchObject({ status: 422 });
  });
});

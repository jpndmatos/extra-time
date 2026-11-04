import { describe, expect, it } from "vitest";
import { clipSources } from "./clipSources";

describe("goal playback sources", () => {
  const primary = { kind: "embed", url: "https://streamable.com/e/primary" };
  const backup = {
    media: { kind: "resolve", url: "https://streamin.link/v/abcdef12" },
    sourceUrl: "https://www.reddit.com/r/soccer/comments/backup/",
  };
  it("keeps primary and independent mirrors with the right attribution", () => {
    const sources = clipSources(primary, "original", [backup]);
    expect(sources.map((source) => source.media.url)).toEqual([
      primary.url,
      backup.media.url,
    ]);
    expect(sources[1].sourceUrl).toBe(backup.sourceUrl);
  });
  it("tries each URL once even when several posts share a video", () => {
    expect(
      clipSources(primary, "original", [
        { media: primary, sourceUrl: "duplicate" },
        backup,
        backup,
      ]),
    ).toHaveLength(2);
  });
  it("bounds recovery attempts", () => {
    expect(
      clipSources(
        primary,
        "original",
        Array.from({ length: 20 }, (_, index) => ({
          media: { kind: "embed", url: `https://streamable.com/e/${index}` },
          sourceUrl: "post",
        })),
      ),
    ).toHaveLength(12);
  });
});

import type { Clip, ClipSource } from "./types";

export function clipSources(
  media: Clip,
  sourceUrl: string,
  mirrors: ClipSource[] = [],
): ClipSource[] {
  const seen = new Set<string>();
  return [{ media, sourceUrl }, ...mirrors]
    .filter((source) => {
      if (seen.has(source.media.url)) return false;
      seen.add(source.media.url);
      return true;
    })
    .slice(0, 12);
}

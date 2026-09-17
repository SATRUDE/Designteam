import type { FigmaPublishItemInput, PublishMode } from "@/lib/figma/types";

export type FigmaLayoutEntry = {
  order: number;
  url: string;
  mode: PublishMode;
  frameName: string;
  imageNames: string[];
};

function toSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** Deterministic: URL lexical, then desktop before mobile. */
export function buildLayoutEntries(items: FigmaPublishItemInput[]): FigmaLayoutEntry[] {
  const sorted = [...items].sort((a, b) => {
    if (a.url !== b.url) return a.url.localeCompare(b.url);
    if (a.mode !== b.mode) return a.mode === "desktop" ? -1 : 1;
    return 0;
  });
  return sorted.map((item, index) => {
    const stem = toSlug(item.url) || "page";
    return {
      order: index,
      url: item.url,
      mode: item.mode,
      frameName: `${String(index + 1).padStart(3, "0")} ${stem} ${item.mode}`,
      imageNames: item.images.map((img) => img.name),
    };
  });
}

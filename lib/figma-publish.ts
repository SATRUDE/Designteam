function sanitizePagePrefix(prefix: string) {
  const trimmed = prefix.trim();
  return trimmed ? trimmed.slice(0, 80) : "Crawler import";
}

export function parseFigmaFileKey(urlOrKey: string): string | null {
  const raw = urlOrKey.trim();
  if (!raw) return null;
  if (!raw.includes("figma.com/")) return /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : null;
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    const designIdx = parts.indexOf("design");
    if (designIdx >= 0 && parts[designIdx + 1]) {
      return parts[designIdx + 1];
    }
    const fileIdx = parts.indexOf("file");
    if (fileIdx >= 0 && parts[fileIdx + 1]) {
      return parts[fileIdx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export function buildRunPageName(prefix: string) {
  const safe = sanitizePagePrefix(prefix);
  const ts = new Date().toISOString().replace("T", " ").replace(/\..+$/, "");
  return `${safe} - ${ts}`;
}

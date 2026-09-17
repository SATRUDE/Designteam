/**
 * Keep in sync with lib/figma/import-payload.ts (validate rules + version).
 */

export const FIGMA_IMPORT_PAYLOAD_VERSION = 1 as const;

export type PublishMode = "desktop" | "mobile";

export type FigmaPublishImageInput = {
  name: string;
  base64: string;
};

export type FigmaPublishItemInput = {
  url: string;
  mode: PublishMode;
  images: FigmaPublishImageInput[];
};

export type FigmaLayoutEntry = {
  order: number;
  url: string;
  mode: PublishMode;
  frameName: string;
  imageNames: string[];
};

export type DesignteamFigmaImportV1 = {
  version: typeof FIGMA_IMPORT_PAYLOAD_VERSION;
  createdAt: string;
  pageNamePrefix: string;
  pageName: string;
  layout: FigmaLayoutEntry[];
  items: FigmaPublishItemInput[];
};

function isPublishMode(v: unknown): v is PublishMode {
  return v === "desktop" || v === "mobile";
}

function isImageInput(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" && typeof o.base64 === "string";
}

function isItemInput(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || !isPublishMode(o.mode)) return false;
  if (!Array.isArray(o.images) || o.images.length === 0) return false;
  return o.images.every(isImageInput);
}

function isLayoutEntry(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.order === "number" &&
    typeof o.url === "string" &&
    isPublishMode(o.mode) &&
    typeof o.frameName === "string" &&
    Array.isArray(o.imageNames) &&
    o.imageNames.every((n) => typeof n === "string")
  );
}

export function validateImportPayload(raw: unknown): raw is DesignteamFigmaImportV1 {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.version !== FIGMA_IMPORT_PAYLOAD_VERSION) return false;
  if (typeof o.createdAt !== "string") return false;
  if (typeof o.pageNamePrefix !== "string") return false;
  if (typeof o.pageName !== "string") return false;
  if (!Array.isArray(o.layout) || !o.layout.every(isLayoutEntry)) return false;
  if (!Array.isArray(o.items) || !o.items.every(isItemInput)) return false;
  return true;
}

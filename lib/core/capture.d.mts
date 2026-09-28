import type { Browser } from "playwright-core";

export type CaptureMode = "desktop" | "mobile";
export type CookieSelector = string | {
  frameSelector: string;
  innerSelector: string;
};
export interface CaptureOptions {
  cookieSelector?: CookieSelector;
  normalizeFixedChrome?: boolean;
}

export function isValidUrl(input: string): boolean;
export function capturePage(
  browser: Browser,
  url: string,
  mode: CaptureMode,
  options?: CaptureOptions,
): Promise<Buffer>;

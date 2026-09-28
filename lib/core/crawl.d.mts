import type { Browser } from "playwright-core";

export interface CrawlLink {
  url: string;
  label?: string;
}

export interface CrawlResult {
  links: CrawlLink[];
  warnings?: string[];
}

export function crawlPage(browser: Browser, url: string): Promise<CrawlResult>;

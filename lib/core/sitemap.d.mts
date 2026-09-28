export interface SitemapOptions {
  sitemapUrl?: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  maxSitemaps?: number;
  maxRequests?: number;
  maxUrls?: number;
  maxBodyBytes?: number;
}

export function discoverSitemapLinks(url: string, options?: SitemapOptions): Promise<{
  urls: string[];
  warnings: string[];
}>;

/** A chapter link found on the index page, plus its scraped body once fetched. */
export interface Chapter {
  url: string;
  /** Anchor text from the index page — the fallback title. */
  linkText: string;
  /** Leading number parsed out of the URL or anchor text, used for sorting. */
  order: number | null;
  /** Title taken from the chapter page itself once fetched. */
  title?: string;
  /** Cleaned inner HTML of the chapter page's content container. */
  html?: string;
  wordCount?: number;
}

export interface StoryMeta {
  title: string;
  author: string;
  language: string;
  /** Cleaned index-page HTML minus the chapter list — used as the synopsis. */
  descriptionHtml: string;
  sourceUrl: string;
}

/** Supplies raw image bytes to the builder, so it never fetches anything itself. */
export type ImageFetcher = (url: string) => Promise<{ data: Uint8Array; mimeType: string }>;

/** Progress reporting, shared by the scraper and the builder. */
export interface BuildHooks {
  /** Replaces the current busy message; fires often. */
  onStatus?: (message: string) => void;
  /** A recoverable problem worth mentioning in the reply, e.g. a skipped image. */
  onWarning?: (message: string) => void;
}

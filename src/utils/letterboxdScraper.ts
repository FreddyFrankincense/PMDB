import {
  FILM_CATALOG,
  inferTierFromRating,
  resolveFilmMetadata,
  slugifyTitle,
} from '../data/filmCatalog';
import {
  CineasteArchiveState,
  LetterboxdList,
  LetterboxdListEntry,
} from '../types/cinema';
import { FilmEntry } from '../types/letterboxd';
import { makeFilmId } from './letterboxdCsvParser';
import { syncProfileFilmsIntoArchive } from './unifiedArchiveSync';

export type LetterboxdTargetType = 'film' | 'list' | 'profile';

export type ScraperStrategyUsed =
  | 'server_proxy'
  | 'browser_fetch'
  | 'rss_feed'
  | 'paginated_crawl'
  | 'metadata_canon'
  | 'raw_html';

export interface ScrapedListPayload {
  id: string;
  name: string;
  description: string;
  letterboxdUrl: string;
  isRanked: boolean;
  creatorUsername?: string;
  expectedFilmCount?: number;
  films: FilmEntry[];
}

export interface CrawlPageRange {
  startPage: number;
  endPage: number;
}

export interface CrawlGapAnalysisSummary {
  targetTotalPages: number;
  expectedTotalItems?: number;
  actualUniqueItems: number;
  itemShortfall: number;
  initialMissingPages: number[];
  initialMissingRanges: CrawlPageRange[];
  initialMissingRangesLabel: string;
  recoveredPages: number[];
  remainingMissingPages: number[];
  remainingMissingRangesLabel: string;
  verifiedComplete: boolean;
}

export interface ScraperProgressUpdate {
  phase:
    | 'discovering'
    | 'films'
    | 'gap_analysis'
    | 'lists_index'
    | 'lists_expand'
    | 'complete';
  phaseLabel: string;
  message: string;
  currentPage: number;
  totalPages: number;
  overallPagesCompleted: number;
  overallTotalPages: number;
  percentComplete: number;
  totalItemsDiscovered: number;
  filmsScraped: number;
  expectedTotalFilms?: number;
  currentFilmPage: number;
  totalFilmPages: number;
  listsScraped: number;
  expectedTotalLists?: number;
  currentListPage: number;
  totalListPages: number;
  listsExpandedCount?: number;
  totalListsToExpand?: number;
  startedAtMs: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  pagesPerSecond: number;
  retryCount?: number;
  lastBackoffDelayMs?: number;
  gapAnalysisActive?: boolean;
  missingPagesQueued?: number;
  missingRangesLabel?: string;
  gapPagesRecovered?: number;
}

export interface ScraperRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  requestTimeoutMs: number;
}

export const DEFAULT_SCRAPER_RETRY_CONFIG: ScraperRetryConfig = {
  maxRetries: 4,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  jitterMs: 300,
  requestTimeoutMs: 8500,
};

/**
 * Parses an HTTP `Retry-After` header (either integer seconds or HTTP-date) into milliseconds.
 */
export function parseRetryAfterHeaderMs(retryAfterHeader: string | null | undefined): number | null {
  if (!retryAfterHeader) return null;
  const trimmed = retryAfterHeader.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), 30000);
  }

  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    const deltaMs = parsedDate - Date.now();
    return deltaMs > 0 ? Math.min(deltaMs, 30000) : 0;
  }

  return null;
}

/**
 * Computes exponential backoff delay (`baseDelayMs * 2^attempt + jitter`),
 * honoring any server-supplied `Retry-After` floor when HTTP 429 occurs.
 */
export function computeExponentialBackoffMs(
  attempt: number,
  config: Partial<ScraperRetryConfig> = {},
  retryAfterMs?: number | null
): number {
  const baseDelayMs = config.baseDelayMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.baseDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.maxDelayMs;
  const jitterMs = config.jitterMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.jitterMs;

  const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt));
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  const computed = Math.min(maxDelayMs, exponential + jitter);

  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return Math.min(maxDelayMs * 2, Math.max(computed, retryAfterMs + jitter));
  }

  return computed;
}

/**
 * Sleeps for `delayMs` milliseconds, resolving early if `abortSignal` fires.
 */
export function sleepWithAbort(delayMs: number, abortSignal?: AbortSignal): Promise<void> {
  if (delayMs <= 0 || abortSignal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      resolve();
    };
    const cleanup = () => {
      abortSignal?.removeEventListener('abort', onAbort);
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Returns true if an HTTP status code is transient and should be retried with exponential backoff
 * (e.g., 429 Too Many Requests, 408 Request Timeout, or 5xx Gateway/Cloudflare errors).
 */
export function isRetryableHttpStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 520 ||
    status === 522 ||
    status === 524
  );
}

export function formatScraperEta(
  estimatedRemainingMs: number | null,
  isComplete = false,
  elapsedMs = 0
): string {
  if (isComplete) {
    return `Finished in ${(Math.max(100, elapsedMs) / 1000).toFixed(1)}s`;
  }
  if (estimatedRemainingMs === null || estimatedRemainingMs < 0) {
    return 'Calculating ETA...';
  }
  if (estimatedRemainingMs === 0) {
    return '< 1s remaining';
  }
  const totalSec = Math.ceil(estimatedRemainingMs / 1000);
  if (totalSec < 60) {
    return `~${totalSec}s remaining`;
  }
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `~${mins}m ${secs}s remaining`;
}

function buildScraperProgress(opts: {
  phase: ScraperProgressUpdate['phase'];
  phaseLabel: string;
  message: string;
  filmsScraped: number;
  expectedTotalFilms?: number;
  currentFilmPage: number;
  totalFilmPages: number;
  listsScraped: number;
  expectedTotalLists?: number;
  currentListPage: number;
  totalListPages: number;
  listsExpandedCount?: number;
  totalListsToExpand?: number;
  startedAtMs: number;
  retryCount?: number;
  lastBackoffDelayMs?: number;
  gapAnalysisActive?: boolean;
  missingPagesQueued?: number;
  missingRangesLabel?: string;
  gapPagesRecovered?: number;
}): ScraperProgressUpdate {
  const elapsedMs = Math.max(50, Date.now() - opts.startedAtMs);
  const listsExpanded = opts.listsExpandedCount ?? 0;
  const listsToExpand = opts.totalListsToExpand ?? 0;

  const overallPagesCompleted =
    opts.currentFilmPage + opts.currentListPage + listsExpanded;
  const overallTotalPages = Math.max(
    1,
    opts.totalFilmPages + opts.totalListPages + listsToExpand
  );

  const percentComplete =
    opts.phase === 'complete'
      ? 100
      : opts.phase === 'discovering'
      ? 4
      : Math.min(
          99,
          Math.max(5, Math.round((overallPagesCompleted / overallTotalPages) * 100))
        );

  const pagesPerSecond =
    overallPagesCompleted > 0
      ? Number((overallPagesCompleted / (elapsedMs / 1000)).toFixed(1))
      : 0;

  const remainingPages = Math.max(0, overallTotalPages - overallPagesCompleted);
  const estimatedRemainingMs =
    opts.phase === 'complete'
      ? 0
      : overallPagesCompleted <= 0
      ? null
      : Math.round((elapsedMs / overallPagesCompleted) * remainingPages);

  let currentPage = overallPagesCompleted;
  let totalPages = overallTotalPages;
  if (opts.phase === 'films' || opts.phase === 'gap_analysis') {
    currentPage = opts.currentFilmPage;
    totalPages = opts.totalFilmPages;
  } else if (opts.phase === 'lists_index') {
    currentPage = opts.currentListPage;
    totalPages = opts.totalListPages;
  } else if (opts.phase === 'lists_expand') {
    currentPage = listsExpanded > 0 ? listsExpanded : opts.currentListPage;
    totalPages = listsToExpand > 0 ? listsToExpand : opts.totalListPages;
  } else if (opts.phase === 'discovering') {
    currentPage = 1;
    totalPages = 1;
  }

  return {
    phase: opts.phase,
    phaseLabel: opts.phaseLabel,
    message: opts.message,
    currentPage,
    totalPages: Math.max(1, totalPages),
    overallPagesCompleted,
    overallTotalPages,
    percentComplete,
    totalItemsDiscovered: opts.filmsScraped + opts.listsScraped,
    filmsScraped: opts.filmsScraped,
    expectedTotalFilms: opts.expectedTotalFilms,
    currentFilmPage: opts.currentFilmPage,
    totalFilmPages: opts.totalFilmPages,
    listsScraped: opts.listsScraped,
    expectedTotalLists: opts.expectedTotalLists,
    currentListPage: opts.currentListPage,
    totalListPages: opts.totalListPages,
    listsExpandedCount: opts.listsExpandedCount,
    totalListsToExpand: opts.totalListsToExpand,
    startedAtMs: opts.startedAtMs,
    elapsedMs,
    estimatedRemainingMs,
    pagesPerSecond,
    retryCount: opts.retryCount,
    lastBackoffDelayMs: opts.lastBackoffDelayMs,
    gapAnalysisActive: opts.gapAnalysisActive,
    missingPagesQueued: opts.missingPagesQueued,
    missingRangesLabel: opts.missingRangesLabel,
    gapPagesRecovered: opts.gapPagesRecovered,
  };
}

/**
 * Compresses a sorted array of page numbers (e.g. [3, 4, 5, 12, 19, 20])
 * into contiguous `{ startPage, endPage }` range objects.
 */
export function groupPagesIntoRanges(pages: number[]): CrawlPageRange[] {
  const uniqueSorted = Array.from(new Set(pages.filter((p) => p >= 1))).sort(
    (a, b) => a - b
  );
  if (uniqueSorted.length === 0) return [];

  const ranges: CrawlPageRange[] = [];
  let start = uniqueSorted[0];
  let prev = uniqueSorted[0];

  for (let i = 1; i < uniqueSorted.length; i++) {
    const curr = uniqueSorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push({ startPage: start, endPage: prev });
      start = curr;
      prev = curr;
    }
  }
  ranges.push({ startPage: start, endPage: prev });
  return ranges;
}

/**
 * Formats an array of page numbers into a compact archival range string
 * (e.g. "p.3–5, p.12, p.84" or "0 gaps").
 */
export function formatPageRangesCompact(pages: number[], maxSegments = 6): string {
  const ranges = groupPagesIntoRanges(pages);
  if (ranges.length === 0) return '0 gaps';
  const formatted = ranges.map((r) =>
    r.startPage === r.endPage ? `p.${r.startPage}` : `p.${r.startPage}–${r.endPage}`
  );
  if (formatted.length <= maxSegments) {
    return formatted.join(', ');
  }
  return `${formatted.slice(0, maxSegments).join(', ')} (+${
    formatted.length - maxSegments
  } more)`;
}

/**
 * Intelligently analyzes post-crawl item totals and per-page item counts to identify
 * any missing or under-populated pages across a multi-page crawl (e.g., 6,024 films across 84 pages).
 * Returns only the missing/incomplete page numbers and contiguous page ranges so the scraper
 * queues strictly the missing pages without re-fetching intact pages.
 */
export function analyzeCrawlPageGaps(params: {
  discoveredMaxPage: number;
  expectedTotalItems?: number;
  itemsPerPage: number;
  maxAllowedPages?: number;
  actualUniqueItems: number;
  pageItemCounts: Map<number, number>;
}): {
  targetTotalPages: number;
  missingPages: number[];
  missingRanges: CrawlPageRange[];
  missingRangesLabel: string;
  itemShortfall: number;
} {
  const maxCap = params.maxAllowedPages ?? 2000;
  const computedPagesFromTotal =
    params.expectedTotalItems && params.expectedTotalItems > 0
      ? Math.ceil(params.expectedTotalItems / params.itemsPerPage)
      : 1;

  const targetTotalPages = Math.min(
    Math.max(1, params.discoveredMaxPage, computedPagesFromTotal),
    maxCap
  );

  const itemShortfall =
    typeof params.expectedTotalItems === 'number' && params.expectedTotalItems > 0
      ? Math.max(0, params.expectedTotalItems - params.actualUniqueItems)
      : 0;

  const missingPages: number[] = [];

  for (let pageNum = 1; pageNum <= targetTotalPages; pageNum++) {
    const countOnPage = params.pageItemCounts.get(pageNum) ?? 0;

    // 1. Page was never fetched or yielded 0 items
    if (countOnPage === 0) {
      missingPages.push(pageNum);
      continue;
    }

    // 2. If overall collection has a shortfall vs expectedTotalItems, inspect interior and tail pages for partial truncation
    if (itemShortfall > 0) {
      if (pageNum < targetTotalPages && countOnPage < params.itemsPerPage) {
        missingPages.push(pageNum);
      } else if (
        pageNum === targetTotalPages &&
        typeof params.expectedTotalItems === 'number'
      ) {
        const expectedOnLastPage =
          params.expectedTotalItems - (targetTotalPages - 1) * params.itemsPerPage;
        if (expectedOnLastPage > 0 && countOnPage < expectedOnLastPage) {
          missingPages.push(pageNum);
        }
      }
    }
  }

  const missingRanges = groupPagesIntoRanges(missingPages);
  const missingRangesLabel = formatPageRangesCompact(missingPages);

  return {
    targetTotalPages,
    missingPages,
    missingRanges,
    missingRangesLabel,
    itemShortfall,
  };
}

export interface ScrapeUtilityResult {
  targetType: LetterboxdTargetType;
  sourceUrl: string;
  strategyUsed: ScraperStrategyUsed;
  liveReachable: boolean;
  title: string;
  subtitle: string;
  notice: string;
  films: FilmEntry[];
  list?: ScrapedListPayload;
  lists?: ScrapedListPayload[];
  profile?: {
    username: string;
    displayName: string;
    profileUrl: string;
    bio: string;
  };
  paginationSummary?: {
    filmPagesCrawled: number;
    totalFilmPages: number;
    expectedTotalFilms?: number;
    listPagesCrawled: number;
    totalListPages: number;
    expectedTotalLists?: number;
    gapAnalysis?: {
      films: CrawlGapAnalysisSummary;
      lists?: CrawlGapAnalysisSummary;
    };
  };
}

export interface DetectedLetterboxdTarget {
  type: LetterboxdTargetType;
  normalizedUrl: string;
  username?: string;
  filmSlug?: string;
  yearHint?: number;
  listSlug?: string;
}

export interface PaginationMetadata {
  maxPage: number;
  expectedTotalFilms?: number;
  expectedTotalLists?: number;
  displayName?: string;
}

/**
 * Decodes HTML & XML entities in scraped strings.
 */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Converts a URL slug like "in-the-mood-for-love-2000" or "Official-Top-250"
 * into a human-readable title and optional release year.
 */
export function humanizeLetterboxdSlug(slug: string): {
  title: string;
  yearHint?: number;
} {
  const clean = decodeURIComponent(slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const yearSuffixMatch = clean.match(/^(.*?)-((?:18|19|20)\d{2})$/);
  const baseSlug = yearSuffixMatch ? yearSuffixMatch[1] : clean;
  const yearHint = yearSuffixMatch ? parseInt(yearSuffixMatch[2], 10) : undefined;

  const catalogMatch = FILM_CATALOG.find(
    (f) =>
      f.slug.toLowerCase() === clean.toLowerCase() ||
      f.slug.toLowerCase() === baseSlug.toLowerCase()
  );
  if (catalogMatch) {
    return { title: catalogMatch.title, yearHint: catalogMatch.year };
  }

  const minorWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'but',
    'or',
    'for',
    'nor',
    'on',
    'at',
    'to',
    'from',
    'by',
    'of',
    'in',
  ]);
  const words = baseSlug.split(/[-_]+/).filter(Boolean);
  const humanized = words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && idx < words.length - 1 && minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

  return {
    title: humanized || 'Untitled Film',
    yearHint,
  };
}

/**
 * Detects whether a user input string is a Letterboxd Film URL/slug,
 * a Letterboxd List URL, or a Letterboxd User Profile / Diary / Watchlist / Lists index.
 */
export function detectLetterboxdUrlType(rawInput: string): DetectedLetterboxdTarget {
  const trimmed = rawInput.trim();
  const withoutProtocol = trimmed
    .replace(/^https?:\/\/(www\.)?letterboxd\.com\//i, '')
    .replace(/^letterboxd\.com\//i, '')
    .replace(/^@/, '')
    .replace(/^\/+|\/+$/g, '');

  const parts = withoutProtocol.split('/').filter(Boolean);

  // Case 1: /film/<film-slug>
  if (parts[0]?.toLowerCase() === 'film' && parts[1]) {
    const filmSlug = parts[1];
    const { yearHint } = humanizeLetterboxdSlug(filmSlug);
    return {
      type: 'film',
      normalizedUrl: `https://letterboxd.com/film/${filmSlug}/`,
      filmSlug,
      yearHint,
    };
  }

  // Case 2: /<username>/film/<film-slug> (User review page for a specific film)
  if (parts.length >= 3 && parts[1]?.toLowerCase() === 'film' && parts[2]) {
    const username = parts[0];
    const filmSlug = parts[2];
    const { yearHint } = humanizeLetterboxdSlug(filmSlug);
    return {
      type: 'film',
      normalizedUrl: `https://letterboxd.com/${username}/film/${filmSlug}/`,
      username,
      filmSlug,
      yearHint,
    };
  }

  // Case 3: /<username>/list/<list-slug> (Public Letterboxd List)
  if (parts.length >= 3 && parts[1]?.toLowerCase() === 'list' && parts[2]) {
    const username = parts[0];
    const listSlug = parts[2];
    return {
      type: 'list',
      normalizedUrl: `https://letterboxd.com/${username}/list/${listSlug}/`,
      username,
      listSlug,
    };
  }

  // Case 4: /list/<list-slug> shorthand
  if (parts[0]?.toLowerCase() === 'list' && parts[1]) {
    const listSlug = parts[1];
    return {
      type: 'list',
      normalizedUrl: `https://letterboxd.com/dave/list/${listSlug}/`,
      username: 'letterboxd',
      listSlug,
    };
  }

  // Case 5: Profile URL or username (e.g., "dave", "dave/films", "dave/lists", "dave/watchlist")
  const username = parts[0] || 'dave';
  return {
    type: 'profile',
    normalizedUrl: `https://letterboxd.com/${username}/`,
    username,
  };
}

/**
 * Extracts pagination bounds (.paginate-pages) and profile header statistics
 * (e.g., "6,024 films", "181 lists") from any Letterboxd HTML page.
 */
export function extractPaginationMetadata(rawContent: string): PaginationMetadata {
  let maxPage = 1;

  // 1. Check .paginate-pages block first
  const paginateBlockMatch = rawContent.match(
    /<div[^>]*class=["'][^"']*paginate-pages[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const paginationSearchScope = paginateBlockMatch ? paginateBlockMatch[1] : rawContent;

  const pageLinkRegex = /\/page\/(\d+)\/?["']/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pageLinkRegex.exec(paginationSearchScope)) !== null) {
    const num = parseInt(pm[1], 10);
    if (!Number.isNaN(num) && num > maxPage && num <= 2500) {
      maxPage = num;
    }
  }

  // Also check <li class="paginate-page"><a>84</a></li> text numbers
  if (paginateBlockMatch) {
    const pageNumTextRegex = /<li[^>]*class=["'][^"']*paginate-page[^"']*["'][^>]*>\s*<a[^>]*>(\d[\d,]*)<\/a>/gi;
    let ptm: RegExpExecArray | null;
    while ((ptm = pageNumTextRegex.exec(paginateBlockMatch[1])) !== null) {
      const num = parseInt(ptm[1].replace(/,/g, ''), 10);
      if (!Number.isNaN(num) && num > maxPage && num <= 2500) {
        maxPage = num;
      }
    }
  }

  // 2. Extract expected total films if present on profile header, meta description, list header, or films page header
  let expectedTotalFilms: number | undefined;
  const profileFilmsStatMatch =
    rawContent.match(
      /href=["']\/[^/"']+\/films\/["'][^>]*>\s*<span[^>]*class=["'][^"']*value[^"']*["'][^>]*>([\d,]+)<\/span>\s*<span[^>]*class=["'][^"']*definition[^"']*["'][^>]*>Films<\/span>/i
    ) ||
    rawContent.match(/([\d,]+)(?:\s|&nbsp;)+films?\s+watched/i) ||
    rawContent.match(/there\s+are\s+([\d,]+)(?:\s|&nbsp;)+films?/i) ||
    rawContent.match(/A\s+list\s+of\s+([\d,]+)(?:\s|&nbsp;)+films?/i) ||
    rawContent.match(/class=["'][^"']*ui-block-heading[^"']*["'][^>]*>[^<]*?([\d,]+)(?:\s|&nbsp;)+films?/i) ||
    rawContent.match(/title=["']([\d,]+)(?:\s|&nbsp;)+films?["']/i);

  if (profileFilmsStatMatch?.[1]) {
    const parsed = parseInt(profileFilmsStatMatch[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      expectedTotalFilms = parsed;
    }
  }

  // 3. Extract expected total lists if present on profile header or lists page
  let expectedTotalLists: number | undefined;
  const profileListsStatMatch =
    rawContent.match(
      /href=["']\/[^/"']+\/lists\/["'][^>]*>\s*<span[^>]*class=["'][^"']*value[^"']*["'][^>]*>([\d,]+)<\/span>\s*<span[^>]*class=["'][^"']*definition[^"']*["'][^>]*>Lists<\/span>/i
    ) ||
    rawContent.match(/You\s+have\s+([\d,]+)(?:\s|&nbsp;)+lists?/i) ||
    rawContent.match(/([\d,]+)(?:\s|&nbsp;)+lists?\s+published/i) ||
    rawContent.match(/title=["']([\d,]+)(?:\s|&nbsp;)+lists?["']/i);

  if (profileListsStatMatch?.[1]) {
    const parsed = parseInt(profileListsStatMatch[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      expectedTotalLists = parsed;
    }
  }

  // 4. Extract display name if present
  const ogTitleMatch = rawContent.match(
    /property=["']og:title["']\s+content=["']([^"']+?)(?:’s|'s)\s+(?:profile|films|lists)/i
  );
  const displayName = ogTitleMatch?.[1]?.trim()
    ? decodeHtmlEntities(ogTitleMatch[1].trim())
    : undefined;

  return {
    maxPage,
    expectedTotalFilms,
    expectedTotalLists,
    displayName,
  };
}

/**
 * Parses Letterboxd's `/<username>/lists/` and `/<username>/lists/page/N/` index HTML
 * where 12 list summary cards are displayed per page.
 */
export function parseLetterboxdListsIndexHtml(
  rawContent: string,
  defaultUsername = 'dave'
): ScrapedListPayload[] {
  const discovered: ScrapedListPayload[] = [];
  const seenListUrls = new Set<string>();

  const parsePreviewFilmsFromBlock = (blockHtml: string, listName: string): FilmEntry[] => {
    const previewFilms: FilmEntry[] = [];
    const seenSlugs = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);

    // Match poster nodes inside the list card
    const posterTagRegex = /<(?:div|li)[^>]+(?:data-film-slug|data-item-slug|data-film-name|data-item-name)[^>]*>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = posterTagRegex.exec(blockHtml)) !== null) {
      const tag = pm[0];
      const slugAttr =
        tag.match(/data-(?:item|film)-slug=["']([^"']+)["']/i)?.[1] ||
        tag.match(/data-(?:item|target)-link=["']\/film\/([^/"']+)\/?["']/i)?.[1];
      const rawNameAttr =
        tag.match(/data-item-full-display-name=["']([^"']+)["']/i)?.[1] ||
        tag.match(/data-item-name=["']([^"']+)["']/i)?.[1] ||
        tag.match(/data-film-name=["']([^"']+)["']/i)?.[1];
      const yearAttr = tag.match(/data-film-release-year=["'](\d{4})["']/i)?.[1];

      if (!slugAttr && !rawNameAttr) continue;

      let title = rawNameAttr ? decodeHtmlEntities(rawNameAttr.trim()) : '';
      let year = yearAttr ? parseInt(yearAttr, 10) : undefined;

      const parenMatch = title.match(/^(.*?)\s*\((\d{4})\)$/);
      if (parenMatch) {
        title = parenMatch[1].trim();
        year = parseInt(parenMatch[2], 10);
      }

      if (slugAttr) {
        const humanized = humanizeLetterboxdSlug(slugAttr);
        if (!title) title = humanized.title;
        if (!year && humanized.yearHint) year = humanized.yearHint;
      }

      if (!title) continue;
      const resolvedYear = year && year >= 1888 && year <= 2035 ? year : 2024;
      const resolvedSlug = slugAttr || slugifyTitle(title, resolvedYear);
      if (seenSlugs.has(resolvedSlug.toLowerCase())) continue;
      seenSlugs.add(resolvedSlug.toLowerCase());

      const meta = resolveFilmMetadata(title, resolvedYear, resolvedSlug);
      previewFilms.push({
        id: `list-preview-${resolvedSlug}-${previewFilms.length + 1}`,
        title: meta.title,
        year: resolvedYear,
        slug: resolvedSlug,
        director: meta.director,
        genres: meta.genres,
        rating: 4.0,
        liked: true,
        rewatch: false,
        watchlist: false,
        watchedDate: today,
        loggedDate: today,
        tags: ['html-scrape'],
        tier: inferTierFromRating(4.0),
        customRank: previewFilms.length + 1,
        notes: `Included in curated list: ${listName}`,
        letterboxdUri: `https://letterboxd.com/film/${resolvedSlug}/`,
        runtimeMinutes: meta.runtimeMinutes,
        country: meta.country,
      });
    }

    return previewFilms;
  };

  // Pass 1: Match <section class="list ..."> or <article class="list-summary ..."> blocks
  const sectionRegex =
    /<(?:section|article)[^>]*class=["'][^"']*\b(?:list|list-summary)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|article)>/gi;
  let secMatch: RegExpExecArray | null;
  while ((secMatch = sectionRegex.exec(rawContent)) !== null) {
    const block = secMatch[1];
    const titleLinkMatch =
      block.match(
        /<h[1234][^>]*>\s*<a[^>]+href=["']([^"']*\/list\/[^/"']+\/?)["'][^>]*>([\s\S]*?)<\/a>/i
      ) ||
      block.match(
        /<a[^>]+href=["']([^"']*\/list\/[^/"']+\/?)["'][^>]*class=["'][^"']*list-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
      );

    if (!titleLinkMatch) continue;
    const rawHref = titleLinkMatch[1].trim();
    const rawName = decodeHtmlEntities(titleLinkMatch[2].replace(/<[^>]+>/g, '').trim());
    if (!rawName) continue;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : `https://letterboxd.com/${rawHref.replace(/^\/+/, '')}`;
    const normUrl = fullUrl.endsWith('/') ? fullUrl : `${fullUrl}/`;
    if (seenListUrls.has(normUrl.toLowerCase())) continue;
    seenListUrls.add(normUrl.toLowerCase());

    const countMatch =
      block.match(
        /<(?:small|span)[^>]*class=["'][^"']*value[^"']*["'][^>]*>\s*([\d,]+)(?:\s|&nbsp;|&#160;)*films?/i
      ) || block.match(/\b([\d,]+)(?:\s|&nbsp;|&#160;)+films?\b/i);
    const expectedFilmCount = countMatch?.[1]
      ? parseInt(countMatch[1].replace(/,/g, ''), 10)
      : undefined;

    const descMatch = block.match(
      /<div[^>]*class=["'][^"']*(?:body-text|list-notes)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const cleanDesc = descMatch?.[1]
      ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      : '';

    const previewFilms = parsePreviewFilmsFromBlock(block, rawName);
    const slugMatch = normUrl.match(/\/list\/([^/]+)\//i);
    const listSlug = slugMatch?.[1] || slugifyTitle(rawName, 2026);

    discovered.push({
      id: `list-idx-${listSlug}`,
      name: rawName,
      description:
        cleanDesc ||
        `Curated Letterboxd list (${expectedFilmCount ?? previewFilms.length} films).`,
      letterboxdUrl: normUrl,
      isRanked: /numbered|ranked|<ol\b/i.test(block),
      creatorUsername: defaultUsername,
      expectedFilmCount,
      films: previewFilms,
    });
  }

  // Pass 2: Fallback heading link scan for any <h2/h3><a href="/<user>/list/<slug>/">Title</a></h2/h3> not inside <section>
  const headingLinkRegex =
    /<h[1234][^>]*>\s*<a[^>]+href=["']((?:https?:\/\/letterboxd\.com)?\/([^/"']+)\/list\/([^/"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1234]>/gi;
  let hlMatch: RegExpExecArray | null;
  while ((hlMatch = headingLinkRegex.exec(rawContent)) !== null) {
    const rawHref = hlMatch[1].trim();
    const userPart = hlMatch[2];
    const listSlug = hlMatch[3];
    const rawName = decodeHtmlEntities(hlMatch[4].replace(/<[^>]+>/g, '').trim());
    if (!rawName) continue;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : `https://letterboxd.com/${rawHref.replace(/^\/+/, '')}`;
    const normUrl = fullUrl.endsWith('/') ? fullUrl : `${fullUrl}/`;
    if (seenListUrls.has(normUrl.toLowerCase())) continue;
    seenListUrls.add(normUrl.toLowerCase());

    discovered.push({
      id: `list-idx-${listSlug}`,
      name: rawName,
      description: `Curated Letterboxd list by @${userPart}.`,
      letterboxdUrl: normUrl,
      isRanked: false,
      creatorUsername: userPart || defaultUsername,
      films: [],
    });
  }

  return discovered;
}

/**
 * Parses raw HTML or RSS XML from any Letterboxd Film page, List page, Lists Index page,
 * or Profile/Diary/Films/Watchlist page directly in the browser or server.
 */
export function parseLetterboxdHtmlOrRssToResult(
  rawContent: string,
  sourceInput = 'https://letterboxd.com/',
  strategyUsed: ScraperStrategyUsed = 'raw_html'
): ScrapeUtilityResult {
  const detected = detectLetterboxdUrlType(sourceInput);
  const films: FilmEntry[] = [];
  const filmsByKey = new Map<string, FilmEntry>();
  const discoveredLists: ScrapedListPayload[] = [];
  const seenListUrls = new Set<string>();

  const isWatchlistPage =
    /<title>[^<]*watchlist/i.test(rawContent) ||
    /content=["']https?:\/\/letterboxd\.com\/[^/]+\/watchlist\//i.test(rawContent);

  const isListPage =
    detected.type === 'list' ||
    /property=["']og:type["']\s+content=["']letterboxd:list["']/i.test(rawContent) ||
    /class=["'][^"']*list-detailed-entries[^"']*["']/i.test(rawContent);

  let rankCounter = 1;

  const pushFilmEntry = (opts: {
    title: string;
    releaseYear: number;
    filmSlug?: string;
    rating: number | null;
    liked: boolean;
    rewatch: boolean;
    watchlist: boolean;
    watchedDate: string | null;
    notes: string;
    director?: string;
    genres?: string[];
    runtimeMinutes?: number;
    country?: string;
    letterboxdUri?: string;
    posterUrl?: string;
    sourceTag: 'rss-sync' | 'html-scrape';
  }): FilmEntry | null => {
    let cleanTitle = decodeHtmlEntities(opts.title || '').trim();
    let explicitSlug = opts.filmSlug?.trim().replace(/^\/+|\/+$/g, '');

    if (!explicitSlug && opts.letterboxdUri) {
      const uriSlugMatch = opts.letterboxdUri.match(/\/film\/([^/"'?#]+)/i);
      if (uriSlugMatch?.[1]) {
        explicitSlug = uriSlugMatch[1];
      }
    }

    let resolvedYear = opts.releaseYear;
    if (explicitSlug) {
      const slugInfo = humanizeLetterboxdSlug(explicitSlug);
      if (!cleanTitle) cleanTitle = slugInfo.title;
      if ((!resolvedYear || resolvedYear === 2024) && slugInfo.yearHint) {
        resolvedYear = slugInfo.yearHint;
      }
    }

    if (!cleanTitle) return null;
    const year = resolvedYear >= 1888 && resolvedYear <= 2035 ? resolvedYear : 2024;
    const canonicalSlug = explicitSlug || slugifyTitle(cleanTitle, year);

    // Key by explicit Letterboxd slug when available so identically titled films never collide
    const dedupKey = explicitSlug
      ? `slug::${explicitSlug.toLowerCase()}`
      : `${cleanTitle.toLowerCase()}::${year}`;
    const fallbackTitleYearKey = `${cleanTitle.toLowerCase()}::${year}`;

    const existing = explicitSlug
      ? filmsByKey.get(dedupKey)
      : filmsByKey.get(dedupKey) || filmsByKey.get(fallbackTitleYearKey);
    if (existing) {
      // Upgrade existing entry if the new observation has richer metadata (e.g. rating, review, poster)
      if (existing.rating === null && opts.rating !== null) {
        existing.rating = opts.rating;
        existing.tier = inferTierFromRating(opts.rating);
      }
      if (!existing.liked && opts.liked) {
        existing.liked = true;
      }
      if (!existing.posterUrl && opts.posterUrl) {
        existing.posterUrl = opts.posterUrl;
      }
      if (
        opts.notes &&
        opts.notes !== 'Logged via external profile view.' &&
        !opts.notes.startsWith('Included in curated list:') &&
        (existing.notes === 'Logged via external profile view.' ||
          existing.notes.startsWith('Included in curated list:'))
      ) {
        existing.notes = opts.notes;
      }
      return existing;
    }

    const meta = resolveFilmMetadata(cleanTitle, year, canonicalSlug);
    const today = new Date().toISOString().slice(0, 10);

    const entry: FilmEntry = {
      id: `scrape-${opts.sourceTag}-${rankCounter}-${Date.now()}`,
      title: meta.title,
      year,
      slug: canonicalSlug,
      director:
        opts.director && opts.director !== 'Archive Filmmaker'
          ? opts.director
          : meta.director,
      genres: opts.genres && opts.genres.length > 0 ? opts.genres : meta.genres,
      rating: opts.rating,
      liked: opts.liked,
      rewatch: opts.rewatch,
      watchlist: opts.watchlist,
      watchedDate: opts.watchlist ? null : opts.watchedDate || today,
      loggedDate: opts.watchedDate || today,
      tags: opts.watchlist ? [opts.sourceTag, 'letterboxd-watchlist'] : [opts.sourceTag],
      tier: opts.watchlist ? 'Unranked' : inferTierFromRating(opts.rating),
      customRank: opts.watchlist ? null : rankCounter++,
      notes: opts.notes || 'Logged via external profile view.',
      letterboxdUri: opts.letterboxdUri || `https://letterboxd.com/film/${canonicalSlug}/`,
      runtimeMinutes: opts.runtimeMinutes || meta.runtimeMinutes,
      country: opts.country || meta.country,
      posterUrl: opts.posterUrl,
    };

    films.push(entry);
    filmsByKey.set(dedupKey, entry);
    filmsByKey.set(fallbackTitleYearKey, entry);
    return entry;
  };

  // 1. Check for Single Film JSON-LD (<script type="application/ld+json">) on a Letterboxd /film/ page
  const jsonLdMatch = rawContent.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (jsonLdMatch?.[1]) {
    try {
      const cleanedJson = jsonLdMatch[1]
        .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, '')
        .replace(/\/\*\s*\]\]>\s*\*\//g, '')
        .trim();
      const ld = JSON.parse(cleanedJson);
      if (ld && (ld['@type'] === 'Movie' || ld.name)) {
        const rawTitle = String(ld.name || '').trim();
        const releaseYearMatch = String(
          ld.releasedEvent?.[0]?.startDate || ld.dateCreated || ''
        ).match(/(\d{4})/);
        const releaseYear = releaseYearMatch
          ? parseInt(releaseYearMatch[1], 10)
          : detected.yearHint || 2024;
        const directorName = Array.isArray(ld.director)
          ? ld.director.map((d: any) => d?.name).filter(Boolean).join(', ')
          : ld.director?.name;
        const avgRating = ld.aggregateRating?.ratingValue
          ? Number(Number(ld.aggregateRating.ratingValue).toFixed(1))
          : 4.0;
        const genres = Array.isArray(ld.genre) ? ld.genre : undefined;
        const posterUrl = typeof ld.image === 'string' ? ld.image : undefined;
        const country = Array.isArray(ld.countryOfOrigin)
          ? ld.countryOfOrigin[0]?.name
          : undefined;

        const synopsisMatch = rawContent.match(
          /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
        );

        pushFilmEntry({
          title: rawTitle,
          releaseYear,
          filmSlug: detected.filmSlug,
          rating: avgRating,
          liked: avgRating >= 4.0,
          rewatch: false,
          watchlist: false,
          watchedDate: new Date().toISOString().slice(0, 10),
          notes: synopsisMatch?.[1]
            ? decodeHtmlEntities(synopsisMatch[1])
            : 'Scraped from public Letterboxd film page.',
          director: directorName,
          genres,
          country,
          posterUrl,
          letterboxdUri: ld.url || detected.normalizedUrl,
          sourceTag: 'html-scrape',
        });
      }
    } catch {
      // Continue with standard RSS / HTML parsing
    }
  }

  // 2. Parse RSS <item> blocks (handles both Film Watches/Reviews AND Letterboxd Lists in RSS!)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(rawContent)) !== null) {
    const block = itemMatch[1];
    const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const guid = guidMatch ? guidMatch[1].trim() : '';
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const itemLink = linkMatch ? linkMatch[1].trim() : '';
    const descMatch =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
      block.match(/<description>([\s\S]*?)<\/description>/i);
    const descHtml = descMatch?.[1] || '';

    // 2a. Check if this RSS <item> is a Letterboxd List (guid starts with letterboxd-list-)
    if (guid.startsWith('letterboxd-list-') || /\/list\//i.test(itemLink)) {
      const listTitleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const listName = listTitleMatch
        ? decodeHtmlEntities(listTitleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim())
        : 'Scraped Letterboxd List';
      const listFilms: FilmEntry[] = [];
      const listLinkRegex =
        /<li[^>]*>\s*<a[^>]+href=["']([^"']*\/film\/([^/"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let lfMatch: RegExpExecArray | null;
      while ((lfMatch = listLinkRegex.exec(descHtml)) !== null) {
        const filmUrl = lfMatch[1];
        const filmSlug = lfMatch[2];
        const linkTitle = decodeHtmlEntities(lfMatch[3].replace(/<[^>]+>/g, '').trim());
        const { yearHint } = humanizeLetterboxdSlug(filmSlug);
        const created = pushFilmEntry({
          title: linkTitle,
          releaseYear: yearHint || 2024,
          filmSlug,
          rating: null,
          liked: false,
          rewatch: false,
          watchlist: false,
          watchedDate: new Date().toISOString().slice(0, 10),
          notes: `Included in curated list: ${listName}`,
          letterboxdUri: filmUrl,
          sourceTag: 'rss-sync',
        });
        if (created) listFilms.push(created);
      }

      // Check if RSS description mentions "...plus X more"
      const plusMoreMatch = descHtml.match(/plus\s+([\d,]+)\s+more/i);
      const plusMoreCount = plusMoreMatch?.[1]
        ? parseInt(plusMoreMatch[1].replace(/,/g, ''), 10)
        : 0;

      const normListUrl = (itemLink || detected.normalizedUrl).replace(/\/?$/, '/');
      if (!seenListUrls.has(normListUrl.toLowerCase())) {
        seenListUrls.add(normListUrl.toLowerCase());
        const isOrdered = /<ol/i.test(descHtml);
        discoveredLists.push({
          id: `list-rss-${Date.now()}-${discoveredLists.length}`,
          name: listName,
          description: `Scraped from public Letterboxd list (${
            listFilms.length + plusMoreCount
          } films).`,
          letterboxdUrl: normListUrl,
          isRanked: isOrdered,
          creatorUsername: detected.username,
          expectedFilmCount: listFilms.length + plusMoreCount,
          films: listFilms,
        });
      }
      continue;
    }

    // 2b. Standard Film Watch / Review RSS <item>
    const filmTitleMatch = block.match(/<letterboxd:filmTitle>([\s\S]*?)<\/letterboxd:filmTitle>/i);
    const filmYearMatch = block.match(/<letterboxd:filmYear>(\d{4})<\/letterboxd:filmYear>/i);
    const ratingMatch = block.match(/<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/i);
    const likeMatch = block.match(/<letterboxd:memberLike>(Yes|No)<\/letterboxd:memberLike>/i);
    const watchedDateMatch = block.match(/<letterboxd:watchedDate>(\d{4}-\d{2}-\d{2})<\/letterboxd:watchedDate>/i);
    const rewatchMatch = block.match(/<letterboxd:rewatch>(Yes|No)<\/letterboxd:rewatch>/i);

    let title = filmTitleMatch ? filmTitleMatch[1].trim() : '';
    let releaseYear = filmYearMatch ? parseInt(filmYearMatch[1], 10) : 2024;
    let starFallbackRating: number | null = null;

    if (!title) {
      const plainTitleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      if (plainTitleMatch) {
        const rawTitle = plainTitleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const parsedHeader = rawTitle.match(/^(.*?),\s*(\d{4})(?:\s*-\s*([★½]+))?$/);
        if (parsedHeader) {
          title = parsedHeader[1].trim();
          releaseYear = parseInt(parsedHeader[2], 10);
          if (parsedHeader[3]) {
            const fullStars = (parsedHeader[3].match(/★/g) || []).length;
            const halfStars = (parsedHeader[3].match(/½/g) || []).length * 0.5;
            starFallbackRating = fullStars + halfStars;
          }
        }
      }
    }

    if (!title) continue;
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : starFallbackRating;
    const watchedDate = watchedDateMatch
      ? watchedDateMatch[1]
      : new Date().toISOString().slice(0, 10);
    const rewatch = rewatchMatch ? rewatchMatch[1].toLowerCase() === 'yes' : false;
    const liked = likeMatch
      ? likeMatch[1].toLowerCase() === 'yes'
      : rating !== null && rating >= 4.0;

    let cleanNotes = '';
    let rssPosterUrl: string | undefined;
    if (descHtml) {
      const imgMatch = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch?.[1]) {
        rssPosterUrl = imgMatch[1];
      }
      cleanNotes = decodeHtmlEntities(
        descHtml
          .replace(/<img[^>]*>/gi, '')
          .replace(/<p>\s*Watched on[^<]*<\/p>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }

    pushFilmEntry({
      title,
      releaseYear,
      rating,
      liked,
      rewatch,
      watchlist: false,
      watchedDate,
      notes: cleanNotes,
      letterboxdUri: itemLink,
      posterUrl: rssPosterUrl,
      sourceTag: 'rss-sync',
    });
  }

  // 2c. Also check if this HTML page is a `/lists/` index page containing multiple list summary cards
  const htmlIndexLists = parseLetterboxdListsIndexHtml(rawContent, detected.username);
  for (const idxList of htmlIndexLists) {
    const normUrl = idxList.letterboxdUrl.toLowerCase();
    if (!seenListUrls.has(normUrl)) {
      seenListUrls.add(normUrl);
      discoveredLists.push(idxList);
      for (const pf of idxList.films) {
        pushFilmEntry({
          title: pf.title,
          releaseYear: pf.year,
          filmSlug: pf.slug,
          rating: pf.rating,
          liked: pf.liked,
          rewatch: pf.rewatch,
          watchlist: pf.watchlist,
          watchedDate: pf.watchedDate,
          notes: pf.notes,
          letterboxdUri: pf.letterboxdUri,
          sourceTag: 'html-scrape',
        });
      }
    }
  }

  // 3. Parse HTML Diary Table Rows (<tr class="diary-entry-row ...">)
  const diaryRowRegex =
    /<tr[^>]*class=["'][^"']*diary-entry-row[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let diaryMatch: RegExpExecArray | null;
  while ((diaryMatch = diaryRowRegex.exec(rawContent)) !== null) {
    const rowHtml = diaryMatch[1];
    const filmSlug =
      rowHtml.match(/data-(?:item|film)-slug=["']([^"']+)["']/i)?.[1] ||
      rowHtml.match(/href=["']\/film\/([^/"']+)\/?["']/i)?.[1];
    const nameAttr =
      rowHtml.match(/data-item-full-display-name=["']([^"']+)["']/i)?.[1] ||
      rowHtml.match(/data-item-name=["']([^"']+)["']/i)?.[1] ||
      rowHtml.match(/data-film-name=["']([^"']+)["']/i)?.[1] ||
      rowHtml.match(
        /<h[23][^>]*class=["'][^"']*name[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i
      )?.[1];
    if (!nameAttr && !filmSlug) continue;

    let title = nameAttr ? decodeHtmlEntities(nameAttr.replace(/<[^>]+>/g, '').trim()) : '';
    let releaseYear = 2024;
    const parenYear = title.match(/^(.*?)\s*\((\d{4})\)$/);
    if (parenYear) {
      title = parenYear[1].trim();
      releaseYear = parseInt(parenYear[2], 10);
    } else {
      const yearAttr =
        rowHtml.match(/data-film-release-year=["'](\d{4})["']/i)?.[1] ||
        rowHtml.match(
          /class=["'][^"']*td-released[^"']*["'][^>]*>\s*(?:<span[^>]*>)?(\d{4})/i
        )?.[1];
      if (yearAttr) releaseYear = parseInt(yearAttr, 10);
    }

    const ratedClassMatch = rowHtml.match(/rated-(\d{1,2})\b/i);
    const rating = ratedClassMatch ? parseInt(ratedClassMatch[1], 10) / 2 : null;
    const dateHrefMatch = rowHtml.match(/\/films\/diary\/for\/(\d{4})\/(\d{2})\/(\d{2})\//i);
    const watchedDate = dateHrefMatch
      ? `${dateHrefMatch[1]}-${dateHrefMatch[2]}-${dateHrefMatch[3]}`
      : new Date().toISOString().slice(0, 10);
    const liked = /icon-liked/i.test(rowHtml);
    const rewatch =
      /icon-rewatch/i.test(rowHtml) && !/td-rewatch[^>]*icon-status-off/i.test(rowHtml);

    pushFilmEntry({
      title,
      releaseYear,
      filmSlug,
      rating,
      liked: liked || (rating !== null && rating >= 4.0),
      rewatch,
      watchlist: false,
      watchedDate,
      notes: 'Logged via external profile view.',
      sourceTag: 'html-scrape',
    });
  }

  // 4. Parse Full <li class="poster-container|griditem|posteritem"> blocks on /films/page/N/ and /list/<slug>/page/N/
  const liPosterBlockRegex =
    /<li[^>]*class=["'][^"']*(?:poster-container|griditem|posteritem|film-detail)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liPosterBlockRegex.exec(rawContent)) !== null) {
    const fullLiTag = liMatch[0];
    const liInner = liMatch[1];

    const filmSlug =
      fullLiTag.match(/data-(?:item|film)-slug=["']([^"']+)["']/i)?.[1] ||
      fullLiTag.match(/data-(?:item|target)-link=["']\/film\/([^/"']+)\/?["']/i)?.[1] ||
      fullLiTag.match(/href=["']\/film\/([^/"']+)\/?["']/i)?.[1];

    const rawName =
      fullLiTag.match(/data-item-full-display-name=["']([^"']+)["']/i)?.[1] ||
      fullLiTag.match(/data-item-name=["']([^"']+)["']/i)?.[1] ||
      fullLiTag.match(/data-film-name=["']([^"']+)["']/i)?.[1] ||
      liInner.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1];

    if (!filmSlug && !rawName) continue;

    let title = rawName ? decodeHtmlEntities(rawName.trim()) : '';
    let releaseYear = 2024;
    const parenMatch = title.match(/^(.*?)\s*\((\d{4})\)$/);
    if (parenMatch) {
      title = parenMatch[1].trim();
      releaseYear = parseInt(parenMatch[2], 10);
    } else {
      const explicitYear = fullLiTag.match(/data-film-release-year=["'](\d{4})["']/i)?.[1];
      if (explicitYear) {
        releaseYear = parseInt(explicitYear, 10);
      }
    }

    const ownerRatingMatch = fullLiTag.match(/data-owner-rating=["'](\d{1,2})["']/i);
    const ratedClassMatch = fullLiTag.match(/rated-(\d{1,2})\b/i);
    const ratingVal = ownerRatingMatch
      ? parseInt(ownerRatingMatch[1], 10)
      : ratedClassMatch
      ? parseInt(ratedClassMatch[1], 10)
      : 0;
    const rating =
      ratingVal > 0 ? ratingVal / 2 : isWatchlistPage ? null : null;

    const liked =
      /icon-liked|liked-micro/i.test(fullLiTag) || (rating !== null && rating >= 4.5);

    const imgMatch = liInner.match(/<img[^>]+src=["'](https:\/\/a\.ltrbxd\.com\/[^"']+)["']/i);
    const posterUrl =
      imgMatch?.[1] && !/empty-poster/i.test(imgMatch[1]) ? imgMatch[1] : undefined;

    pushFilmEntry({
      title,
      releaseYear,
      filmSlug,
      rating,
      liked,
      rewatch: false,
      watchlist: isWatchlistPage,
      watchedDate: isWatchlistPage ? null : new Date().toISOString().slice(0, 10),
      notes: 'Logged via external profile view.',
      posterUrl,
      sourceTag: 'html-scrape',
    });
  }

  // 5. Fallback scan for standalone Poster Containers only if no <li> grid items were matched above
  if (films.length === 0) {
    const standalonePosterRegex =
      /<div[^>]+(?:data-item-(?:full-display-)?name|data-film-name|data-item-slug|data-film-slug)=[^>]+>([\s\S]{0,500}?)(?=<div[^>]+data-|<\/li>|$)/gi;
    let spMatch: RegExpExecArray | null;
    while ((spMatch = standalonePosterRegex.exec(rawContent)) !== null) {
      const chunk = spMatch[0];
      const filmSlug =
        chunk.match(/data-(?:item|film)-slug=["']([^"']+)["']/i)?.[1] ||
        chunk.match(/data-(?:item|target)-link=["']\/film\/([^/"']+)\/?["']/i)?.[1];
      const rawName =
        chunk.match(/data-item-full-display-name=["']([^"']+)["']/i)?.[1] ||
        chunk.match(/data-item-name=["']([^"']+)["']/i)?.[1] ||
        chunk.match(/data-film-name=["']([^"']+)["']/i)?.[1];

      if (!filmSlug && !rawName) continue;

      let title = rawName ? decodeHtmlEntities(rawName.trim()) : '';
      let releaseYear = 2024;
      const parenMatch = title.match(/^(.*?)\s*\((\d{4})\)$/);
      if (parenMatch) {
        title = parenMatch[1].trim();
        releaseYear = parseInt(parenMatch[2], 10);
      } else {
        const explicitYear = chunk.match(/data-film-release-year=["'](\d{4})["']/i)?.[1];
        if (explicitYear) {
          releaseYear = parseInt(explicitYear, 10);
        }
      }

      const ratedClassMatch = chunk.match(/rated-(\d{1,2})\b/i);
      const rating = ratedClassMatch
        ? parseInt(ratedClassMatch[1], 10) / 2
        : isWatchlistPage
        ? null
        : null;
      const liked = /icon-liked/i.test(chunk) || (rating !== null && rating >= 4.5);

      pushFilmEntry({
        title,
        releaseYear,
        filmSlug,
        rating,
        liked,
        rewatch: false,
        watchlist: isWatchlistPage,
        watchedDate: isWatchlistPage ? null : new Date().toISOString().slice(0, 10),
        notes: 'Logged via external profile view.',
        sourceTag: 'html-scrape',
      });
    }
  }

  // 6. Parse OpenGraph <meta property="og:title" content="Parasite (2019)"/> if on a single film page
  if (films.length === 0) {
    const ogTitleMatch = rawContent.match(
      /property=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    if (ogTitleMatch?.[1]) {
      const ogTitle = decodeHtmlEntities(ogTitleMatch[1].trim());
      const filmParen = ogTitle.match(/^(.*?)\s*\((\d{4})\)$/);
      if (filmParen) {
        const title = filmParen[1].trim();
        const releaseYear = parseInt(filmParen[2], 10);
        const ogImage = rawContent.match(
          /property=["']og:image["']\s+content=["']([^"']+)["']/i
        )?.[1];
        const directorMeta = rawContent.match(
          /name=["']twitter:data1["']\s+content=["']([^"']+)["']/i
        )?.[1];
        const ratingMeta = rawContent.match(
          /name=["']twitter:data2["']\s+content=["']([\d.]+)/i
        )?.[1];
        const avgRating = ratingMeta ? Number(parseFloat(ratingMeta).toFixed(1)) : 4.0;

        pushFilmEntry({
          title,
          releaseYear,
          filmSlug: detected.filmSlug,
          rating: avgRating,
          liked: avgRating >= 4.0,
          rewatch: false,
          watchlist: false,
          watchedDate: new Date().toISOString().slice(0, 10),
          notes: 'Scraped from public Letterboxd film page.',
          director: directorMeta ? decodeHtmlEntities(directorMeta) : undefined,
          posterUrl: ogImage,
          letterboxdUri: detected.normalizedUrl,
          sourceTag: 'html-scrape',
        });
      }
    }
  }

  // If this was a List page (or user specified a list URL) and we extracted films, build the ScrapedListPayload
  let primaryList: ScrapedListPayload | undefined = discoveredLists[0];
  if (isListPage && films.length > 0 && detected.type === 'list') {
    const ogTitleMatch = rawContent.match(
      /property=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    const h1TitleMatch = rawContent.match(
      /<h1[^>]*class=["'][^"']*title-1[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i
    );
    const ogDescMatch = rawContent.match(
      /property=["']og:description["']\s+content=["']([^"']+)["']/i
    );
    const rawListName =
      h1TitleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ||
      ogTitleMatch?.[1]?.replace(/\s*•\s*a list of.*$/i, '').trim() ||
      (detected.listSlug
        ? humanizeLetterboxdSlug(detected.listSlug).title
        : 'Scraped Letterboxd List');

    primaryList = {
      id: `list-scrape-${detected.listSlug || Date.now()}`,
      name: decodeHtmlEntities(rawListName),
      description: ogDescMatch?.[1]
        ? decodeHtmlEntities(ogDescMatch[1].trim())
        : `Scraped from ${detected.normalizedUrl} (${films.length} films).`,
      letterboxdUrl: detected.normalizedUrl,
      isRanked: /list-detailed-entries|<ol\b|poster-list-numbered/i.test(rawContent),
      creatorUsername: detected.username,
      expectedFilmCount: films.length,
      films: [...films],
    };
  }

  const creatorMatch =
    rawContent.match(/<dc:creator><!\[CDATA\[([\s\S]*?)\]\]><\/dc:creator>/i) ||
    rawContent.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i) ||
    rawContent.match(/<channel>[\s\S]*?<title>\s*Letterboxd\s*-\s*([^<]+)<\/title>/i);
  const displayName = creatorMatch?.[1]?.trim()
    ? decodeHtmlEntities(creatorMatch[1].trim())
    : detected.username
    ? `@${detected.username}`
    : 'Letterboxd Import';

  const resolvedType: LetterboxdTargetType =
    detected.type === 'list' && primaryList
      ? 'list'
      : detected.type === 'film' && films.length === 1
      ? 'film'
      : detected.type;

  return {
    targetType: resolvedType,
    sourceUrl: detected.normalizedUrl,
    strategyUsed,
    liveReachable: films.length > 0 || discoveredLists.length > 0,
    title:
      resolvedType === 'list' && primaryList
        ? primaryList.name
        : resolvedType === 'film' && films[0]
        ? `${films[0].title} (${films[0].year})`
        : displayName,
    subtitle:
      resolvedType === 'list' && primaryList
        ? `Curated List · ${primaryList.films.length} films`
        : resolvedType === 'film' && films[0]
        ? `Directed by ${films[0].director} · ${films[0].rating ?? 4.0} ★`
        : `Public Profile · ${films.length.toLocaleString()} films${
            discoveredLists.length > 0 ? ` · ${discoveredLists.length} lists` : ''
          }`,
    notice:
      resolvedType === 'list' && primaryList
        ? `Scraped "${primaryList.name}" (${primaryList.films.length} films) and added to Curated Lists & Poster Catalog.`
        : resolvedType === 'film' && films[0]
        ? `Scraped "${films[0].title}" (${films[0].year}) directly into Poster Catalog & FrameSheet.`
        : `Scraped ${films.length.toLocaleString()} film entries${
            discoveredLists.length > 0 ? ` and ${discoveredLists.length} curated list(s)` : ''
          } for ${displayName}.`,
    films,
    list: primaryList,
    lists:
      discoveredLists.length > 0
        ? discoveredLists
        : primaryList
        ? [primaryList]
        : undefined,
    profile:
      resolvedType === 'profile'
        ? {
            username: detected.username || 'letterboxd_user',
            displayName,
            profileUrl: detected.normalizedUrl,
            bio: `Scraped via ${strategyUsed} (${films.length.toLocaleString()} films${
              discoveredLists.length > 0 ? `, ${discoveredLists.length} lists` : ''
            }).`,
          }
        : undefined,
  };
}

/**
 * Executes a `fetch` request with an explicit per-attempt timeout combined with an optional caller `AbortSignal`.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_SCRAPER_RETRY_CONFIG.requestTimeoutMs,
  callerAbortSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);
  const onCallerAbort = () => controller.abort(new Error('Aborted by user'));
  callerAbortSignal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    callerAbortSignal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Browser-side fetch fallback using multiple public CORS proxies (both JSON-wrapped and raw)
 * with per-request timeout and HTTP 429 rate-limit detection.
 */
export async function fetchLetterboxdViaBrowserProxy(
  targetUrl: string,
  options?: {
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }
): Promise<{ html: string | null; statusCode?: number; retryAfterMs?: number | null }> {
  const timeoutMs = options?.timeoutMs ?? 7000;
  let lastStatus: number | undefined;
  let maxRetryAfterMs: number | null = null;

  const isValidBody = (text: string) =>
    Boolean(
      text &&
        text.length > 200 &&
        !/Just a moment\.\.\.|cf-mitigated|<title>Access denied|^Rate limit exceeded/i.test(text)
    );

  // 1. Try JSON-wrapped allorigins (/get) first because it never suffers from upstream header stripping
  try {
    if (options?.abortSignal?.aborted) return { html: null };
    const jsonRelay = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetchWithTimeout(jsonRelay, {}, timeoutMs, options?.abortSignal);
    lastStatus = res.status;
    if (res.status === 429) {
      maxRetryAfterMs = parseRetryAfterHeaderMs(res.headers.get('Retry-After')) ?? 1500;
    }
    if (res.ok) {
      const data = await res.json();
      const httpCode = Number(data?.status?.http_code || 200);
      if (httpCode === 429) {
        lastStatus = 429;
      }
      const contents = typeof data?.contents === 'string' ? data.contents : '';
      if (isValidBody(contents)) {
        return { html: contents, statusCode: 200 };
      }
    }
  } catch {
    // Continue to raw relays
  }

  const relays = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
  ];

  for (const relayUrl of relays) {
    if (options?.abortSignal?.aborted) break;
    try {
      const res = await fetchWithTimeout(relayUrl, {}, timeoutMs, options?.abortSignal);
      lastStatus = res.status;
      if (res.status === 429) {
        const parsedRa = parseRetryAfterHeaderMs(res.headers.get('Retry-After'));
        if (parsedRa !== null) maxRetryAfterMs = Math.max(maxRetryAfterMs ?? 0, parsedRa);
      }
      if (res.ok) {
        const text = await res.text();
        if (isValidBody(text)) {
          return { html: text, statusCode: 200 };
        }
        if (/Rate limit exceeded/i.test(text)) {
          lastStatus = 429;
        }
      }
    } catch {
      // Continue to next relay
    }
  }
  return { html: null, statusCode: lastStatus, retryAfterMs: maxRetryAfterMs };
}

/**
 * Fetches a single Letterboxd URL using the hybrid Server Relay + Browser Proxy pool,
 * equipped with exponential backoff + full jitter and `Retry-After` support for transient
 * HTTP 429 (Too Many Requests), 5xx gateway errors, and network timeouts.
 */
export async function fetchLetterboxdPageHybrid(
  targetUrl: string,
  preferBrowserFetch = false,
  retryOptions?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    requestTimeoutMs?: number;
    abortSignal?: AbortSignal;
    onRetry?: (info: {
      attempt: number;
      maxRetries: number;
      delayMs: number;
      reason: string;
      url: string;
    }) => void;
  }
): Promise<string | null> {
  const maxRetries = retryOptions?.maxRetries ?? DEFAULT_SCRAPER_RETRY_CONFIG.maxRetries;
  const baseDelayMs = retryOptions?.baseDelayMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.baseDelayMs;
  const maxDelayMs = retryOptions?.maxDelayMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.maxDelayMs;
  const requestTimeoutMs =
    retryOptions?.requestTimeoutMs ?? DEFAULT_SCRAPER_RETRY_CONFIG.requestTimeoutMs;
  const abortSignal = retryOptions?.abortSignal;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) return null;

    let observedStatus: number | undefined;
    let observedRetryAfterMs: number | null = null;
    let failureReason = 'Transient network timeout';

    if (preferBrowserFetch) {
      const browserRes = await fetchLetterboxdViaBrowserProxy(targetUrl, {
        timeoutMs: requestTimeoutMs,
        abortSignal,
      });
      if (browserRes.html) return browserRes.html;
      if (browserRes.statusCode) observedStatus = browserRes.statusCode;
      if (browserRes.retryAfterMs) observedRetryAfterMs = browserRes.retryAfterMs;
    }

    try {
      const res = await fetchWithTimeout(
        '/api/letterboxd/scrape-page',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        },
        requestTimeoutMs,
        abortSignal
      );

      observedStatus = res.status;
      const headerRetryAfter = parseRetryAfterHeaderMs(res.headers.get('Retry-After'));
      if (headerRetryAfter !== null) {
        observedRetryAfterMs = headerRetryAfter;
      }

      if (res.ok) {
        const data = (await res.json()) as {
          liveReachable?: boolean;
          html?: string;
          statusCode?: number;
          retryAfterMs?: number | null;
        };
        if (
          data?.liveReachable &&
          data.html &&
          data.html.length > 200 &&
          !/Just a moment\.\.\.|cf-mitigated/i.test(data.html)
        ) {
          return data.html;
        }
        if (data?.statusCode) {
          observedStatus = data.statusCode;
        }
        if (typeof data?.retryAfterMs === 'number') {
          observedRetryAfterMs = data.retryAfterMs;
        }
      }

      if (observedStatus === 429) {
        failureReason = 'HTTP 429 Too Many Requests';
      } else if (observedStatus && isRetryableHttpStatus(observedStatus)) {
        failureReason = `HTTP ${observedStatus} gateway response`;
      }
    } catch (err: any) {
      if (abortSignal?.aborted) return null;
      failureReason =
        err?.name === 'AbortError' || /timeout/i.test(String(err?.message || ''))
          ? `Request timed out after ${requestTimeoutMs}ms`
          : 'Network error during page fetch';
    }

    if (!preferBrowserFetch && !abortSignal?.aborted) {
      const browserRes = await fetchLetterboxdViaBrowserProxy(targetUrl, {
        timeoutMs: requestTimeoutMs,
        abortSignal,
      });
      if (browserRes.html) return browserRes.html;
      if (browserRes.statusCode === 429) {
        observedStatus = 429;
        failureReason = 'HTTP 429 Too Many Requests';
      }
      if (browserRes.retryAfterMs) {
        observedRetryAfterMs = Math.max(observedRetryAfterMs ?? 0, browserRes.retryAfterMs);
      }
    }

    // Do not retry permanent 404 Not Found
    if (observedStatus === 404) {
      return null;
    }

    if (attempt < maxRetries && !abortSignal?.aborted) {
      const delayMs = computeExponentialBackoffMs(
        attempt,
        { baseDelayMs, maxDelayMs },
        observedRetryAfterMs
      );
      retryOptions?.onRetry?.({
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        reason: failureReason,
        url: targetUrl,
      });
      await sleepWithAbort(delayMs, abortSignal);
    }
  }

  return null;
}

/**
 * Crawls all paginated pages of a public Letterboxd Curated List
 * (e.g., `/<username>/list/<slug>/page/1..M/`, 100 films per page).
 */
export async function crawlPaginatedLetterboxdList(
  listUrl: string,
  options?: {
    preferBrowserFetch?: boolean;
    onProgress?: (progress: ScraperProgressUpdate) => void;
    abortSignal?: AbortSignal;
  }
): Promise<ScrapeUtilityResult | null> {
  const startedAtMs = Date.now();
  const detected = detectLetterboxdUrlType(listUrl);
  const baseUrl = detected.normalizedUrl.replace(/\/page\/\d+\/?$/i, '/');
  let totalRetriesCount = 0;
  let lastBackoffDelayMs: number | undefined;

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'discovering',
      phaseLabel: 'Discovering Curated List Pages',
      message: `Inspecting pagination bounds for ${baseUrl}...`,
      filmsScraped: 0,
      currentFilmPage: 0,
      totalFilmPages: 1,
      listsScraped: 0,
      currentListPage: 0,
      totalListPages: 1,
      startedAtMs,
      retryCount: 0,
    })
  );

  const page1Html = await fetchLetterboxdPageHybrid(baseUrl, options?.preferBrowserFetch, {
    abortSignal: options?.abortSignal,
    onRetry: (info) => {
      totalRetriesCount++;
      lastBackoffDelayMs = info.delayMs;
    },
  });
  if (!page1Html) return null;

  const page1Parsed = parseLetterboxdHtmlOrRssToResult(
    page1Html,
    baseUrl,
    'paginated_crawl'
  );
  const pageMeta = extractPaginationMetadata(page1Html);
  let expectedListFilms =
    pageMeta.expectedTotalFilms || page1Parsed.list?.expectedFilmCount;
  const computedPagesFromCount = expectedListFilms
    ? Math.ceil(expectedListFilms / 100)
    : 1;
  let totalPages = Math.min(
    Math.max(1, pageMeta.maxPage, computedPagesFromCount),
    100
  );

  const allFilmsMap = new Map<string, FilmEntry>();
  const listPageItemCounts = new Map<number, number>();
  listPageItemCounts.set(1, page1Parsed.films.length);

  for (const f of page1Parsed.films) {
    allFilmsMap.set(`slug::${f.slug.toLowerCase()}`, f);
  }

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'lists_expand',
      phaseLabel: 'Crawling Curated List Pages',
      message: `Scraped List Page 1 of ${totalPages} (${allFilmsMap.size.toLocaleString()} films discovered)...`,
      filmsScraped: allFilmsMap.size,
      expectedTotalFilms: expectedListFilms,
      currentFilmPage: 1,
      totalFilmPages: totalPages,
      listsScraped: 1,
      expectedTotalLists: 1,
      currentListPage: 1,
      totalListPages: totalPages,
      startedAtMs,
      retryCount: totalRetriesCount,
      lastBackoffDelayMs,
    })
  );

  let pagesCompleted = 1;

  if (totalPages > 1) {
    let nextPageCursor = 2;
    const BATCH_SIZE = 4;

    while (nextPageCursor <= totalPages) {
      if (options?.abortSignal?.aborted) break;
      const batch: number[] = [];
      for (
        let p = nextPageCursor;
        p < nextPageCursor + BATCH_SIZE && p <= totalPages;
        p++
      ) {
        batch.push(p);
      }
      nextPageCursor += batch.length;

      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${baseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch,
            {
              abortSignal: options?.abortSignal,
              onRetry: (info) => {
                totalRetriesCount++;
                lastBackoffDelayMs = info.delayMs;
                options?.onProgress?.(
                  buildScraperProgress({
                    phase: 'lists_expand',
                    phaseLabel: 'Exponential Backoff Retry',
                    message: `${info.reason} on list page ${pageNum} — retry ${info.attempt}/${info.maxRetries} in ${(info.delayMs / 1000).toFixed(1)}s...`,
                    filmsScraped: allFilmsMap.size,
                    expectedTotalFilms: expectedListFilms,
                    currentFilmPage: pagesCompleted,
                    totalFilmPages: totalPages,
                    listsScraped: 1,
                    expectedTotalLists: 1,
                    currentListPage: pagesCompleted,
                    totalListPages: totalPages,
                    startedAtMs,
                    retryCount: totalRetriesCount,
                    lastBackoffDelayMs: info.delayMs,
                  })
                );
              },
            }
          )
        )
      );

      for (let idx = 0; idx < batchHtmls.length; idx++) {
        const html = batchHtmls[idx];
        const pageNum = batch[idx];
        if (!html) continue;
        pagesCompleted++;

        const subMeta = extractPaginationMetadata(html);
        if (subMeta.expectedTotalFilms && !expectedListFilms) {
          expectedListFilms = subMeta.expectedTotalFilms;
        }
        const newTargetMax = Math.max(
          subMeta.maxPage,
          expectedListFilms ? Math.ceil(expectedListFilms / 100) : 1
        );
        if (newTargetMax > totalPages && newTargetMax <= 100) {
          totalPages = newTargetMax;
        }

        const parsedPage = parseLetterboxdHtmlOrRssToResult(
          html,
          baseUrl,
          'paginated_crawl'
        );
        listPageItemCounts.set(pageNum, parsedPage.films.length);
        for (const f of parsedPage.films) {
          const key = `slug::${f.slug.toLowerCase()}`;
          if (!allFilmsMap.has(key)) {
            f.customRank = allFilmsMap.size + 1;
            allFilmsMap.set(key, f);
          }
        }
      }

      const highestDone = batch[batch.length - 1];
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'lists_expand',
          phaseLabel: 'Crawling Curated List Pages',
          message: `Scraped List Page ${highestDone} of ${totalPages} (${allFilmsMap.size.toLocaleString()} films discovered)...`,
          filmsScraped: allFilmsMap.size,
          expectedTotalFilms: expectedListFilms,
          currentFilmPage: highestDone,
          totalFilmPages: totalPages,
          listsScraped: 1,
          expectedTotalLists: 1,
          currentListPage: highestDone,
          totalListPages: totalPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
        })
      );
    }
  }

  // Post-Crawl Gap Analysis & Targeted Missing-Page Queue for Curated Lists
  const initialListGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalPages,
    expectedTotalItems: expectedListFilms,
    itemsPerPage: 100,
    maxAllowedPages: 100,
    actualUniqueItems: allFilmsMap.size,
    pageItemCounts: listPageItemCounts,
  });
  totalPages = initialListGap.targetTotalPages;
  const recoveredListPages: number[] = [];

  if (initialListGap.missingPages.length > 0 && !options?.abortSignal?.aborted) {
    let pagesToRecover = [...initialListGap.missingPages];
    for (let pass = 1; pass <= 2 && pagesToRecover.length > 0; pass++) {
      if (options?.abortSignal?.aborted) break;
      const rangesStr = formatPageRangesCompact(pagesToRecover);
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'gap_analysis',
          phaseLabel: `Gap-Analysis Recovery (Pass ${pass})`,
          message: `Detected ${pagesToRecover.length} missing list page(s) [${rangesStr}]. Queuing targeted page recovery...`,
          filmsScraped: allFilmsMap.size,
          expectedTotalFilms: expectedListFilms,
          currentFilmPage: pagesCompleted,
          totalFilmPages: totalPages,
          listsScraped: 1,
          expectedTotalLists: 1,
          currentListPage: pagesCompleted,
          totalListPages: totalPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
          gapAnalysisActive: true,
          missingPagesQueued: pagesToRecover.length,
          missingRangesLabel: rangesStr,
          gapPagesRecovered: recoveredListPages.length,
        })
      );

      const RECOVERY_BATCH = 3;
      for (let i = 0; i < pagesToRecover.length; i += RECOVERY_BATCH) {
        if (options?.abortSignal?.aborted) break;
        const batch = pagesToRecover.slice(i, i + RECOVERY_BATCH);
        const batchHtmls = await Promise.all(
          batch.map((pageNum) =>
            fetchLetterboxdPageHybrid(
              pageNum === 1 ? baseUrl : `${baseUrl}page/${pageNum}/`,
              options?.preferBrowserFetch,
              {
                maxRetries: 5,
                abortSignal: options?.abortSignal,
                onRetry: (info) => {
                  totalRetriesCount++;
                  lastBackoffDelayMs = info.delayMs;
                },
              }
            )
          )
        );
        for (let idx = 0; idx < batchHtmls.length; idx++) {
          const html = batchHtmls[idx];
          const pageNum = batch[idx];
          if (!html) continue;
          const parsedPage = parseLetterboxdHtmlOrRssToResult(
            html,
            baseUrl,
            'paginated_crawl'
          );
          if (parsedPage.films.length > 0) {
            if ((listPageItemCounts.get(pageNum) ?? 0) === 0) {
              pagesCompleted++;
            }
            listPageItemCounts.set(pageNum, parsedPage.films.length);
            if (!recoveredListPages.includes(pageNum)) {
              recoveredListPages.push(pageNum);
            }
            for (const f of parsedPage.films) {
              const key = `slug::${f.slug.toLowerCase()}`;
              if (!allFilmsMap.has(key)) {
                f.customRank = allFilmsMap.size + 1;
                allFilmsMap.set(key, f);
              }
            }
          }
        }
      }

      const recheckGap = analyzeCrawlPageGaps({
        discoveredMaxPage: totalPages,
        expectedTotalItems: expectedListFilms,
        itemsPerPage: 100,
        maxAllowedPages: 100,
        actualUniqueItems: allFilmsMap.size,
        pageItemCounts: listPageItemCounts,
      });
      pagesToRecover = recheckGap.missingPages;
    }
  }

  const finalListGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalPages,
    expectedTotalItems: expectedListFilms,
    itemsPerPage: 100,
    maxAllowedPages: 100,
    actualUniqueItems: allFilmsMap.size,
    pageItemCounts: listPageItemCounts,
  });

  const combinedFilms = Array.from(allFilmsMap.values());
  if (page1Parsed.list) {
    page1Parsed.list.films = combinedFilms;
    page1Parsed.list.description = `Scraped across ${totalPages} page(s) from ${baseUrl} (${combinedFilms.length} films).`;
    page1Parsed.lists = [page1Parsed.list];
  }

  page1Parsed.films = combinedFilms;
  page1Parsed.subtitle = `Curated List · ${combinedFilms.length} films (${totalPages} page${
    totalPages === 1 ? '' : 's'
  })`;
  page1Parsed.notice = `Scraped "${
    page1Parsed.list?.name || page1Parsed.title
  }" (${combinedFilms.length} films across ${totalPages} page${
    totalPages === 1 ? '' : 's'
  }${
    recoveredListPages.length > 0
      ? ` · Gap-analysis recovered ${recoveredListPages.length} page(s)`
      : ' · Gap-analysis verified 0 missing pages'
  }) and added to Curated Lists & Poster Catalog.`;

  page1Parsed.paginationSummary = {
    filmPagesCrawled: pagesCompleted,
    totalFilmPages: totalPages,
    expectedTotalFilms: expectedListFilms ?? combinedFilms.length,
    listPagesCrawled: pagesCompleted,
    totalListPages: totalPages,
    expectedTotalLists: 1,
    gapAnalysis: {
      films: {
        targetTotalPages: totalPages,
        expectedTotalItems: expectedListFilms,
        actualUniqueItems: combinedFilms.length,
        itemShortfall: finalListGap.itemShortfall,
        initialMissingPages: initialListGap.missingPages,
        initialMissingRanges: initialListGap.missingRanges,
        initialMissingRangesLabel: initialListGap.missingRangesLabel,
        recoveredPages: recoveredListPages,
        remainingMissingPages: finalListGap.missingPages,
        remainingMissingRangesLabel: finalListGap.missingRangesLabel,
        verifiedComplete: finalListGap.missingPages.length === 0,
      },
    },
  };

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'complete',
      phaseLabel: 'Collection Crawl Complete',
      message: `Completed list crawl: ${combinedFilms.length.toLocaleString()} films across ${pagesCompleted} page(s) (${
        finalListGap.missingPages.length === 0
          ? '0 page gaps'
          : `${finalListGap.missingPages.length} unresolved page(s)`
      }).`,
      filmsScraped: combinedFilms.length,
      expectedTotalFilms: expectedListFilms ?? combinedFilms.length,
      currentFilmPage: pagesCompleted,
      totalFilmPages: totalPages,
      listsScraped: 1,
      expectedTotalLists: 1,
      currentListPage: pagesCompleted,
      totalListPages: totalPages,
      startedAtMs,
      retryCount: totalRetriesCount,
      lastBackoffDelayMs,
      gapAnalysisActive: false,
      missingPagesQueued: finalListGap.missingPages.length,
      missingRangesLabel: finalListGap.missingRangesLabel,
      gapPagesRecovered: recoveredListPages.length,
    })
  );

  return page1Parsed;
}

/**
 * Full-Archive Paginated Profile Crawler:
 * Solves the 50-list and ~494-film RSS ceiling by crawling:
 * 1. `/<username>/` & `/<username>/rss/` (for display name, exact totals, and full-text recent reviews)
 * 2. `/<username>/films/page/1..N/` (72 films per page — e.g. 84 pages for 6,024 films)
 * 3. `/<username>/lists/page/1..M/` (12 lists per page — e.g. 16 pages for 181 lists)
 * 4. `/<username>/list/<slug>/page/1..K/` (expands full film lists beyond RSS/index previews)
 */
export async function crawlPaginatedLetterboxdProfile(
  username: string,
  options?: {
    preferBrowserFetch?: boolean;
    expandAllListContents?: boolean;
    onProgress?: (progress: ScraperProgressUpdate) => void;
    abortSignal?: AbortSignal;
  }
): Promise<ScrapeUtilityResult | null> {
  const startedAtMs = Date.now();
  const cleanUser = username.trim().replace(/^@/, '') || 'dave';
  const profileUrl = `https://letterboxd.com/${encodeURIComponent(cleanUser)}/`;
  const filmsBaseUrl = `${profileUrl}films/`;
  const listsBaseUrl = `${profileUrl}lists/`;
  const rssUrl = `${profileUrl}rss/`;

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'discovering',
      phaseLabel: 'Discovering Collection Totals',
      message: `Inspecting @${cleanUser}'s profile header, /films/ pagination, and /lists/ index...`,
      filmsScraped: 0,
      currentFilmPage: 0,
      totalFilmPages: 1,
      listsScraped: 0,
      currentListPage: 0,
      totalListPages: 1,
      startedAtMs,
    })
  );

  let totalRetriesCount = 0;
  let lastBackoffDelayMs: number | undefined;

  // Step 1: Parallel Discovery of Profile Root, RSS Feed, Watched Films Page 1 (/films/page/1/), and Lists Index Page 1 (/lists/page/1/)
  const discoveryRetryOpts = {
    abortSignal: options?.abortSignal,
    onRetry: (info: {
      attempt: number;
      maxRetries: number;
      delayMs: number;
      reason: string;
      url: string;
    }) => {
      totalRetriesCount++;
      lastBackoffDelayMs = info.delayMs;
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'discovering',
          phaseLabel: 'Exponential Backoff Retry',
          message: `${info.reason} during profile discovery — retry ${info.attempt}/${info.maxRetries} in ${(info.delayMs / 1000).toFixed(1)}s...`,
          filmsScraped: 0,
          currentFilmPage: 0,
          totalFilmPages: 1,
          listsScraped: 0,
          currentListPage: 0,
          totalListPages: 1,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs: info.delayMs,
        })
      );
    },
  };

  const [profileRootHtml, rssXml, filmsPage1Html, listsPage1Html] = await Promise.all([
    fetchLetterboxdPageHybrid(profileUrl, options?.preferBrowserFetch, discoveryRetryOpts),
    fetchLetterboxdPageHybrid(rssUrl, options?.preferBrowserFetch, discoveryRetryOpts),
    fetchLetterboxdPageHybrid(`${filmsBaseUrl}page/1/`, options?.preferBrowserFetch, discoveryRetryOpts),
    fetchLetterboxdPageHybrid(`${listsBaseUrl}page/1/`, options?.preferBrowserFetch, discoveryRetryOpts),
  ]);

  const masterFilmsBySlug = new Map<string, FilmEntry>();
  const masterFilmsByTitleYear = new Map<string, FilmEntry>();
  const masterListsByUrl = new Map<string, ScrapedListPayload>();

  const mergeFilmIntoMaster = (entry: FilmEntry) => {
    const slugKey = `slug::${entry.slug.toLowerCase()}`;
    const titleKey = `${entry.title.toLowerCase()}::${entry.year}`;
    // Key primarily by explicit Letterboxd slug so two distinct films sharing a title & year never overwrite each other
    const existing = masterFilmsBySlug.get(slugKey);

    if (existing) {
      if (existing.rating === null && entry.rating !== null) {
        existing.rating = entry.rating;
        existing.tier = inferTierFromRating(entry.rating);
      }
      if (!existing.liked && entry.liked) {
        existing.liked = true;
      }
      if (!existing.posterUrl && entry.posterUrl) {
        existing.posterUrl = entry.posterUrl;
      }
      if (
        entry.notes &&
        entry.notes !== 'Logged via external profile view.' &&
        !entry.notes.startsWith('Included in curated list:') &&
        (existing.notes === 'Logged via external profile view.' ||
          existing.notes.startsWith('Included in curated list:'))
      ) {
        existing.notes = entry.notes;
        existing.watchedDate = entry.watchedDate || existing.watchedDate;
      }
      return;
    }

    entry.customRank = masterFilmsBySlug.size + 1;
    masterFilmsBySlug.set(slugKey, entry);
    if (!masterFilmsByTitleYear.has(titleKey)) {
      masterFilmsByTitleYear.set(titleKey, entry);
    }
  };

  const mergeListIntoMaster = (listPayload: ScrapedListPayload) => {
    const normUrl = listPayload.letterboxdUrl.toLowerCase().replace(/\/?$/, '/');
    const existing = masterListsByUrl.get(normUrl);
    if (existing) {
      if (listPayload.films.length > existing.films.length) {
        existing.films = listPayload.films;
      }
      if (listPayload.expectedFilmCount && !existing.expectedFilmCount) {
        existing.expectedFilmCount = listPayload.expectedFilmCount;
      }
      if (
        listPayload.description &&
        listPayload.description.length > existing.description.length
      ) {
        existing.description = listPayload.description;
      }
      return;
    }
    masterListsByUrl.set(normUrl, {
      ...listPayload,
      letterboxdUrl: listPayload.letterboxdUrl.replace(/\/?$/, '/'),
    });
  };

  let displayName = `@${cleanUser}`;
  let expectedTotalFilms: number | undefined;
  let expectedTotalLists: number | undefined;

  if (profileRootHtml) {
    const rootMeta = extractPaginationMetadata(profileRootHtml);
    if (rootMeta.displayName) displayName = rootMeta.displayName;
    if (rootMeta.expectedTotalFilms) expectedTotalFilms = rootMeta.expectedTotalFilms;
    if (rootMeta.expectedTotalLists) expectedTotalLists = rootMeta.expectedTotalLists;
  }

  // Per-page item counters for intelligent post-crawl gap analysis
  const filmPageItemCounts = new Map<number, number>();
  const listPageItemCounts = new Map<number, number>();

  // Parse Page 1 of /films/page/1/ first so watched films establish the primary catalog order
  let totalFilmPages = 1;
  let filmPagesCrawled = 0;
  if (filmsPage1Html) {
    filmPagesCrawled = 1;
    const fMeta = extractPaginationMetadata(filmsPage1Html);
    if (fMeta.expectedTotalFilms && !expectedTotalFilms) {
      expectedTotalFilms = fMeta.expectedTotalFilms;
    }
    if (fMeta.displayName && displayName.startsWith('@')) {
      displayName = fMeta.displayName;
    }
    const computedFromTotal = expectedTotalFilms
      ? Math.ceil(expectedTotalFilms / 72)
      : 1;
    totalFilmPages = Math.min(
      Math.max(fMeta.maxPage, computedFromTotal, 1),
      2000
    );

    const parsedF1 = parseLetterboxdHtmlOrRssToResult(
      filmsPage1Html,
      `${filmsBaseUrl}page/1/`,
      'paginated_crawl'
    );
    filmPageItemCounts.set(1, parsedF1.films.length);
    for (const f of parsedF1.films) {
      mergeFilmIntoMaster(f);
    }
  } else if (expectedTotalFilms) {
    totalFilmPages = Math.min(Math.ceil(expectedTotalFilms / 72), 2000);
  }

  // Parse Page 1 of /lists/page/1/ index (12 lists per page)
  let totalListPages = 1;
  let listPagesCrawled = 0;
  if (listsPage1Html) {
    listPagesCrawled = 1;
    const lMeta = extractPaginationMetadata(listsPage1Html);
    if (lMeta.expectedTotalLists && !expectedTotalLists) {
      expectedTotalLists = lMeta.expectedTotalLists;
    }
    const computedListPages = expectedTotalLists
      ? Math.ceil(expectedTotalLists / 12)
      : 1;
    totalListPages = Math.min(
      Math.max(lMeta.maxPage, computedListPages, 1),
      500
    );

    const page1Lists = parseLetterboxdListsIndexHtml(listsPage1Html, cleanUser);
    listPageItemCounts.set(1, page1Lists.length);
    for (const l of page1Lists) {
      mergeListIntoMaster(l);
    }
  } else if (expectedTotalLists) {
    totalListPages = Math.min(Math.ceil(expectedTotalLists / 12), 500);
  }

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'films',
      phaseLabel: 'Crawling Watched Films Grid',
      message: `Discovered ${
        expectedTotalFilms ? `${expectedTotalFilms.toLocaleString()} films` : `${totalFilmPages} film pages`
      } & ${
        expectedTotalLists ? `${expectedTotalLists.toLocaleString()} lists` : `${totalListPages} list pages`
      }. Iteratively crawling /films/page/1..${totalFilmPages}...`,
      filmsScraped: masterFilmsBySlug.size,
      expectedTotalFilms,
      currentFilmPage: filmPagesCrawled,
      totalFilmPages,
      listsScraped: masterListsByUrl.size,
      expectedTotalLists,
      currentListPage: listPagesCrawled,
      totalListPages,
      startedAtMs,
    })
  );

  // Step 2: Iteratively crawl all Watched Film pages (/films/page/2, /films/page/3 ... /films/page/totalFilmPages)
  if (totalFilmPages > 1 || !filmsPage1Html) {
    let nextPageCursor = filmsPage1Html ? 2 : 1;
    const FILM_BATCH_CONCURRENCY = 8;
    let consecutiveEmptyBatches = 0;

    while (nextPageCursor <= totalFilmPages) {
      if (options?.abortSignal?.aborted) break;
      const batch: number[] = [];
      for (
        let p = nextPageCursor;
        p < nextPageCursor + FILM_BATCH_CONCURRENCY && p <= totalFilmPages;
        p++
      ) {
        batch.push(p);
      }
      nextPageCursor += batch.length;

      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${filmsBaseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch,
            {
              abortSignal: options?.abortSignal,
              onRetry: (info) => {
                totalRetriesCount++;
                lastBackoffDelayMs = info.delayMs;
                options?.onProgress?.(
                  buildScraperProgress({
                    phase: 'films',
                    phaseLabel: 'Exponential Backoff Retry',
                    message: `${info.reason} on /films/page/${pageNum}/ — retry ${info.attempt}/${info.maxRetries} in ${(info.delayMs / 1000).toFixed(1)}s...`,
                    filmsScraped: masterFilmsBySlug.size,
                    expectedTotalFilms,
                    currentFilmPage: pageNum,
                    totalFilmPages,
                    listsScraped: masterListsByUrl.size,
                    expectedTotalLists,
                    currentListPage: listPagesCrawled,
                    totalListPages,
                    startedAtMs,
                    retryCount: totalRetriesCount,
                    lastBackoffDelayMs: info.delayMs,
                  })
                );
              },
            }
          )
        )
      );

      let addedInBatch = 0;
      for (let idx = 0; idx < batchHtmls.length; idx++) {
        const html = batchHtmls[idx];
        const pageNum = batch[idx];
        if (!html) continue;
        filmPagesCrawled++;

        // Dynamically update expectedTotalFilms & totalFilmPages if pagination metadata on this page reveals higher counts
        const pageMeta = extractPaginationMetadata(html);
        if (pageMeta.expectedTotalFilms && (!expectedTotalFilms || pageMeta.expectedTotalFilms > expectedTotalFilms)) {
          expectedTotalFilms = pageMeta.expectedTotalFilms;
        }
        const computedMax = Math.max(
          pageMeta.maxPage,
          expectedTotalFilms ? Math.ceil(expectedTotalFilms / 72) : 1
        );
        if (computedMax > totalFilmPages && computedMax <= 2000) {
          totalFilmPages = computedMax;
        }

        const parsedPage = parseLetterboxdHtmlOrRssToResult(
          html,
          `${filmsBaseUrl}page/${pageNum}/`,
          'paginated_crawl'
        );
        filmPageItemCounts.set(pageNum, parsedPage.films.length);
        for (const f of parsedPage.films) {
          const prevSize = masterFilmsBySlug.size;
          mergeFilmIntoMaster(f);
          if (masterFilmsBySlug.size > prevSize) addedInBatch++;
        }
      }

      const currentMaxPage = batch[batch.length - 1];
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'films',
          phaseLabel: 'Crawling Watched Films Grid',
          message: `Crawled /films/page/${currentMaxPage}/ of ${totalFilmPages} (${masterFilmsBySlug.size.toLocaleString()}${
            expectedTotalFilms ? ` / ${expectedTotalFilms.toLocaleString()}` : ''
          } films captured)...`,
          filmsScraped: masterFilmsBySlug.size,
          expectedTotalFilms,
          currentFilmPage: currentMaxPage,
          totalFilmPages,
          listsScraped: masterListsByUrl.size,
          expectedTotalLists,
          currentListPage: listPagesCrawled,
          totalListPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
        })
      );

      if (addedInBatch === 0 && batchHtmls.every((h) => !h)) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 3) break;
      } else {
        consecutiveEmptyBatches = 0;
      }
    }
  }

  // Step 2B: Intelligent Post-Crawl Total Detection & Gap-Analysis Queue for Watched Films
  const initialFilmGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalFilmPages,
    expectedTotalItems: expectedTotalFilms,
    itemsPerPage: 72,
    maxAllowedPages: 2000,
    actualUniqueItems: masterFilmsBySlug.size,
    pageItemCounts: filmPageItemCounts,
  });
  totalFilmPages = initialFilmGap.targetTotalPages;
  const recoveredFilmPages: number[] = [];

  if (initialFilmGap.missingPages.length > 0 && !options?.abortSignal?.aborted) {
    let missingQueue = [...initialFilmGap.missingPages];
    const MAX_GAP_RECOVERY_PASSES = 2;

    for (
      let pass = 1;
      pass <= MAX_GAP_RECOVERY_PASSES && missingQueue.length > 0;
      pass++
    ) {
      if (options?.abortSignal?.aborted) break;
      const missingRangesStr = formatPageRangesCompact(missingQueue);

      options?.onProgress?.(
        buildScraperProgress({
          phase: 'gap_analysis',
          phaseLabel: `Gap-Analysis Queue (Pass ${pass}/${MAX_GAP_RECOVERY_PASSES})`,
          message: `Gap-analysis detected ${missingQueue.length} missing film page(s) [${missingRangesStr}] (${masterFilmsBySlug.size.toLocaleString()}${
            expectedTotalFilms ? ` / ${expectedTotalFilms.toLocaleString()}` : ''
          } films). Queuing only missing ranges...`,
          filmsScraped: masterFilmsBySlug.size,
          expectedTotalFilms,
          currentFilmPage: filmPagesCrawled,
          totalFilmPages,
          listsScraped: masterListsByUrl.size,
          expectedTotalLists,
          currentListPage: listPagesCrawled,
          totalListPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
          gapAnalysisActive: true,
          missingPagesQueued: missingQueue.length,
          missingRangesLabel: missingRangesStr,
          gapPagesRecovered: recoveredFilmPages.length,
        })
      );

      const GAP_BATCH_CONCURRENCY = 4;
      for (let i = 0; i < missingQueue.length; i += GAP_BATCH_CONCURRENCY) {
        if (options?.abortSignal?.aborted) break;
        const batch = missingQueue.slice(i, i + GAP_BATCH_CONCURRENCY);

        const batchHtmls = await Promise.all(
          batch.map((pageNum) =>
            fetchLetterboxdPageHybrid(
              `${filmsBaseUrl}page/${pageNum}/`,
              options?.preferBrowserFetch,
              {
                maxRetries: 5,
                baseDelayMs: 600,
                abortSignal: options?.abortSignal,
                onRetry: (info) => {
                  totalRetriesCount++;
                  lastBackoffDelayMs = info.delayMs;
                  options?.onProgress?.(
                    buildScraperProgress({
                      phase: 'gap_analysis',
                      phaseLabel: 'Gap-Recovery Backoff Retry',
                      message: `${info.reason} recovering /films/page/${pageNum}/ — retry ${info.attempt}/${info.maxRetries} in ${(info.delayMs / 1000).toFixed(1)}s...`,
                      filmsScraped: masterFilmsBySlug.size,
                      expectedTotalFilms,
                      currentFilmPage: pageNum,
                      totalFilmPages,
                      listsScraped: masterListsByUrl.size,
                      expectedTotalLists,
                      currentListPage: listPagesCrawled,
                      totalListPages,
                      startedAtMs,
                      retryCount: totalRetriesCount,
                      lastBackoffDelayMs: info.delayMs,
                      gapAnalysisActive: true,
                      missingPagesQueued: missingQueue.length - i,
                      missingRangesLabel: missingRangesStr,
                      gapPagesRecovered: recoveredFilmPages.length,
                    })
                  );
                },
              }
            )
          )
        );

        for (let idx = 0; idx < batchHtmls.length; idx++) {
          const html = batchHtmls[idx];
          const pageNum = batch[idx];
          if (!html) continue;

          const parsedPage = parseLetterboxdHtmlOrRssToResult(
            html,
            `${filmsBaseUrl}page/${pageNum}/`,
            'paginated_crawl'
          );
          if (parsedPage.films.length > 0) {
            if ((filmPageItemCounts.get(pageNum) ?? 0) === 0) {
              filmPagesCrawled++;
            }
            filmPageItemCounts.set(pageNum, parsedPage.films.length);
            if (!recoveredFilmPages.includes(pageNum)) {
              recoveredFilmPages.push(pageNum);
            }
            for (const f of parsedPage.films) {
              mergeFilmIntoMaster(f);
            }
          }
        }

        options?.onProgress?.(
          buildScraperProgress({
            phase: 'gap_analysis',
            phaseLabel: `Recovering Missing Film Pages`,
            message: `Recovered ${recoveredFilmPages.length} missing film page(s) (${masterFilmsBySlug.size.toLocaleString()}${
              expectedTotalFilms ? ` / ${expectedTotalFilms.toLocaleString()}` : ''
            } films captured)...`,
            filmsScraped: masterFilmsBySlug.size,
            expectedTotalFilms,
            currentFilmPage: filmPagesCrawled,
            totalFilmPages,
            listsScraped: masterListsByUrl.size,
            expectedTotalLists,
            currentListPage: listPagesCrawled,
            totalListPages,
            startedAtMs,
            retryCount: totalRetriesCount,
            lastBackoffDelayMs,
            gapAnalysisActive: true,
            missingPagesQueued: Math.max(0, missingQueue.length - (i + batch.length)),
            missingRangesLabel: missingRangesStr,
            gapPagesRecovered: recoveredFilmPages.length,
          })
        );
      }

      const recheckFilmGap = analyzeCrawlPageGaps({
        discoveredMaxPage: totalFilmPages,
        expectedTotalItems: expectedTotalFilms,
        itemsPerPage: 72,
        maxAllowedPages: 2000,
        actualUniqueItems: masterFilmsBySlug.size,
        pageItemCounts: filmPageItemCounts,
      });
      missingQueue = recheckFilmGap.missingPages;
    }
  }

  // Step 3: Iteratively crawl all Curated Lists Index pages (/lists/page/2, /lists/page/3 ... /lists/page/totalListPages)
  if (totalListPages > 1 || !listsPage1Html) {
    let nextListPageCursor = listsPage1Html ? 2 : 1;
    const LIST_BATCH_CONCURRENCY = 6;
    let consecutiveEmptyBatches = 0;

    while (nextListPageCursor <= totalListPages) {
      if (options?.abortSignal?.aborted) break;
      const batch: number[] = [];
      for (
        let p = nextListPageCursor;
        p < nextListPageCursor + LIST_BATCH_CONCURRENCY && p <= totalListPages;
        p++
      ) {
        batch.push(p);
      }
      nextListPageCursor += batch.length;

      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${listsBaseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch,
            {
              abortSignal: options?.abortSignal,
              onRetry: (info) => {
                totalRetriesCount++;
                lastBackoffDelayMs = info.delayMs;
                options?.onProgress?.(
                  buildScraperProgress({
                    phase: 'lists_index',
                    phaseLabel: 'Exponential Backoff Retry',
                    message: `${info.reason} on /lists/page/${pageNum}/ — retry ${info.attempt}/${info.maxRetries} in ${(info.delayMs / 1000).toFixed(1)}s...`,
                    filmsScraped: masterFilmsBySlug.size,
                    expectedTotalFilms,
                    currentFilmPage: totalFilmPages,
                    totalFilmPages,
                    listsScraped: masterListsByUrl.size,
                    expectedTotalLists,
                    currentListPage: pageNum,
                    totalListPages,
                    startedAtMs,
                    retryCount: totalRetriesCount,
                    lastBackoffDelayMs: info.delayMs,
                    gapPagesRecovered: recoveredFilmPages.length,
                  })
                );
              },
            }
          )
        )
      );

      let listsFoundInBatch = 0;
      for (let idx = 0; idx < batchHtmls.length; idx++) {
        const html = batchHtmls[idx];
        const pageNum = batch[idx];
        if (!html) continue;
        listPagesCrawled++;

        const lPageMeta = extractPaginationMetadata(html);
        if (lPageMeta.expectedTotalLists && (!expectedTotalLists || lPageMeta.expectedTotalLists > expectedTotalLists)) {
          expectedTotalLists = lPageMeta.expectedTotalLists;
        }
        const computedListMax = Math.max(
          lPageMeta.maxPage,
          expectedTotalLists ? Math.ceil(expectedTotalLists / 12) : 1
        );
        if (computedListMax > totalListPages && computedListMax <= 500) {
          totalListPages = computedListMax;
        }

        const pageLists = parseLetterboxdListsIndexHtml(html, cleanUser);
        listPageItemCounts.set(pageNum, pageLists.length);
        for (const l of pageLists) {
          const prevSize = masterListsByUrl.size;
          mergeListIntoMaster(l);
          if (masterListsByUrl.size > prevSize) listsFoundInBatch++;
        }
      }

      const currentMaxListPage = batch[batch.length - 1];
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'lists_index',
          phaseLabel: 'Crawling Curated Lists Index',
          message: `Crawled /lists/page/${currentMaxListPage}/ of ${totalListPages} (${masterListsByUrl.size.toLocaleString()}${
            expectedTotalLists ? ` / ${expectedTotalLists.toLocaleString()}` : ''
          } lists captured)...`,
          filmsScraped: masterFilmsBySlug.size,
          expectedTotalFilms,
          currentFilmPage: totalFilmPages,
          totalFilmPages,
          listsScraped: masterListsByUrl.size,
          expectedTotalLists,
          currentListPage: currentMaxListPage,
          totalListPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
          gapPagesRecovered: recoveredFilmPages.length,
        })
      );

      if (listsFoundInBatch === 0 && batchHtmls.every((h) => !h)) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 3) break;
      } else {
        consecutiveEmptyBatches = 0;
      }
    }
  }

  // Step 3B: Intelligent Post-Crawl Gap-Analysis Queue for Curated Lists Index
  const initialListIndexGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalListPages,
    expectedTotalItems: expectedTotalLists,
    itemsPerPage: 12,
    maxAllowedPages: 500,
    actualUniqueItems: masterListsByUrl.size,
    pageItemCounts: listPageItemCounts,
  });
  totalListPages = initialListIndexGap.targetTotalPages;
  const recoveredListIndexPages: number[] = [];

  if (initialListIndexGap.missingPages.length > 0 && !options?.abortSignal?.aborted) {
    let missingListQueue = [...initialListIndexGap.missingPages];
    for (let pass = 1; pass <= 2 && missingListQueue.length > 0; pass++) {
      if (options?.abortSignal?.aborted) break;
      const listRangesStr = formatPageRangesCompact(missingListQueue);

      options?.onProgress?.(
        buildScraperProgress({
          phase: 'gap_analysis',
          phaseLabel: `List Gap-Analysis Queue (Pass ${pass})`,
          message: `Gap-analysis detected ${missingListQueue.length} missing list index page(s) [${listRangesStr}]. Queuing targeted recovery...`,
          filmsScraped: masterFilmsBySlug.size,
          expectedTotalFilms,
          currentFilmPage: totalFilmPages,
          totalFilmPages,
          listsScraped: masterListsByUrl.size,
          expectedTotalLists,
          currentListPage: listPagesCrawled,
          totalListPages,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
          gapAnalysisActive: true,
          missingPagesQueued: missingListQueue.length,
          missingRangesLabel: listRangesStr,
          gapPagesRecovered: recoveredFilmPages.length + recoveredListIndexPages.length,
        })
      );

      const GAP_LIST_BATCH = 4;
      for (let i = 0; i < missingListQueue.length; i += GAP_LIST_BATCH) {
        if (options?.abortSignal?.aborted) break;
        const batch = missingListQueue.slice(i, i + GAP_LIST_BATCH);
        const batchHtmls = await Promise.all(
          batch.map((pageNum) =>
            fetchLetterboxdPageHybrid(
              `${listsBaseUrl}page/${pageNum}/`,
              options?.preferBrowserFetch,
              {
                maxRetries: 5,
                abortSignal: options?.abortSignal,
                onRetry: (info) => {
                  totalRetriesCount++;
                  lastBackoffDelayMs = info.delayMs;
                },
              }
            )
          )
        );

        for (let idx = 0; idx < batchHtmls.length; idx++) {
          const html = batchHtmls[idx];
          const pageNum = batch[idx];
          if (!html) continue;
          const pageLists = parseLetterboxdListsIndexHtml(html, cleanUser);
          if (pageLists.length > 0) {
            if ((listPageItemCounts.get(pageNum) ?? 0) === 0) {
              listPagesCrawled++;
            }
            listPageItemCounts.set(pageNum, pageLists.length);
            if (!recoveredListIndexPages.includes(pageNum)) {
              recoveredListIndexPages.push(pageNum);
            }
            for (const l of pageLists) {
              mergeListIntoMaster(l);
            }
          }
        }
      }

      const recheckListGap = analyzeCrawlPageGaps({
        discoveredMaxPage: totalListPages,
        expectedTotalItems: expectedTotalLists,
        itemsPerPage: 12,
        maxAllowedPages: 500,
        actualUniqueItems: masterListsByUrl.size,
        pageItemCounts: listPageItemCounts,
      });
      missingListQueue = recheckListGap.missingPages;
    }
  }

  // Step 4: Overlay RSS feed metadata (full-text reviews, exact watchedDates, posters, and any recent lists)
  if (rssXml) {
    const rssParsed = parseLetterboxdHtmlOrRssToResult(rssXml, rssUrl, 'rss_feed');
    if (rssParsed.profile?.displayName && displayName.startsWith('@')) {
      displayName = rssParsed.profile.displayName;
    }
    for (const f of rssParsed.films) {
      const slugKey = `slug::${f.slug.toLowerCase()}`;
      const titleKey = `${f.title.toLowerCase()}::${f.year}`;
      const existingWatched =
        masterFilmsBySlug.get(slugKey) || masterFilmsByTitleYear.get(titleKey);
      if (existingWatched) {
        if (!existingWatched.posterUrl && f.posterUrl) {
          existingWatched.posterUrl = f.posterUrl;
        }
        if (
          f.notes &&
          f.notes !== 'Logged via external profile view.' &&
          !f.notes.startsWith('Included in curated list:')
        ) {
          existingWatched.notes = f.notes;
        }
        if (f.watchedDate) {
          existingWatched.watchedDate = f.watchedDate;
        }
      } else if (filmPagesCrawled === 0) {
        // Only add RSS films directly if HTML film pagination was unreachable
        mergeFilmIntoMaster(f);
      }
    }
    if (rssParsed.lists) {
      for (const l of rssParsed.lists) {
        mergeListIntoMaster(l);
      }
    }
  }

  // Step 5: Optional full list roster expansion (only when explicitly requested for lists missing preview entries)
  let listsExpandedCount = 0;
  let totalListsToExpand = 0;
  if (options?.expandAllListContents === true && masterListsByUrl.size > 0) {
    const listsNeedingExpansion = Array.from(masterListsByUrl.values()).filter(
      (l) => l.films.length === 0
    );
    totalListsToExpand = listsNeedingExpansion.length;

    const EXPAND_BATCH = 6;
    for (let i = 0; i < listsNeedingExpansion.length; i += EXPAND_BATCH) {
      if (options?.abortSignal?.aborted) break;
      const batch = listsNeedingExpansion.slice(i, i + EXPAND_BATCH);
      listsExpandedCount = Math.min(i + EXPAND_BATCH, listsNeedingExpansion.length);

      options?.onProgress?.(
        buildScraperProgress({
          phase: 'lists_expand',
          phaseLabel: 'Expanding Full List Rosters',
          message: `Expanding film rosters for Curated Lists (${listsExpandedCount} of ${totalListsToExpand})...`,
          filmsScraped: masterFilmsBySlug.size,
          expectedTotalFilms,
          currentFilmPage: totalFilmPages,
          totalFilmPages,
          listsScraped: masterListsByUrl.size,
          expectedTotalLists,
          currentListPage: totalListPages,
          totalListPages,
          listsExpandedCount,
          totalListsToExpand,
          startedAtMs,
          retryCount: totalRetriesCount,
          lastBackoffDelayMs,
          gapPagesRecovered: recoveredFilmPages.length + recoveredListIndexPages.length,
        })
      );

      const expandedBatch = await Promise.all(
        batch.map(async (listItem) => {
          const html = await fetchLetterboxdPageHybrid(
            listItem.letterboxdUrl,
            options?.preferBrowserFetch,
            {
              abortSignal: options?.abortSignal,
              onRetry: (info) => {
                totalRetriesCount++;
                lastBackoffDelayMs = info.delayMs;
              },
            }
          );
          if (!html) return null;
          const parsed = parseLetterboxdHtmlOrRssToResult(
            html,
            listItem.letterboxdUrl,
            'paginated_crawl'
          );
          return { listItem, parsed };
        })
      );

      for (const res of expandedBatch) {
        if (!res || res.parsed.films.length === 0) continue;
        res.listItem.films = res.parsed.films;
      }
    }
  }

  const finalFilms = Array.from(masterFilmsBySlug.values());
  const finalLists = Array.from(masterListsByUrl.values());

  if (finalFilms.length === 0 && finalLists.length === 0) {
    return null;
  }

  const finalFilmGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalFilmPages,
    expectedTotalItems: expectedTotalFilms,
    itemsPerPage: 72,
    maxAllowedPages: 2000,
    actualUniqueItems: finalFilms.length,
    pageItemCounts: filmPageItemCounts,
  });

  const finalListGap = analyzeCrawlPageGaps({
    discoveredMaxPage: totalListPages,
    expectedTotalItems: expectedTotalLists,
    itemsPerPage: 12,
    maxAllowedPages: 500,
    actualUniqueItems: finalLists.length,
    pageItemCounts: listPageItemCounts,
  });

  const totalRecoveredPagesCount =
    recoveredFilmPages.length + recoveredListIndexPages.length;
  const totalRemainingGapsCount =
    finalFilmGap.missingPages.length + finalListGap.missingPages.length;

  const gapStatusNote =
    totalRecoveredPagesCount > 0
      ? `Gap-analysis recovered ${totalRecoveredPagesCount} missing page(s) (${
          totalRemainingGapsCount === 0
            ? '0 gaps remaining'
            : `${totalRemainingGapsCount} unresolved page(s)`
        }).`
      : totalRemainingGapsCount === 0
      ? 'Gap-analysis verified 100% page coverage (0 missing page ranges).'
      : `Gap-analysis identified ${totalRemainingGapsCount} unreachable page(s) [${finalFilmGap.missingRangesLabel}].`;

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'complete',
      phaseLabel: 'Collection Crawl & Gap-Analysis Complete',
      message: `Completed Full Paginated Scrape: ${finalFilms.length.toLocaleString()} films & ${finalLists.length.toLocaleString()} lists synced. ${gapStatusNote}`,
      filmsScraped: finalFilms.length,
      expectedTotalFilms,
      currentFilmPage: filmPagesCrawled,
      totalFilmPages,
      listsScraped: finalLists.length,
      expectedTotalLists,
      currentListPage: listPagesCrawled,
      totalListPages,
      listsExpandedCount,
      totalListsToExpand,
      startedAtMs,
      retryCount: totalRetriesCount,
      lastBackoffDelayMs,
      gapAnalysisActive: false,
      missingPagesQueued: totalRemainingGapsCount,
      missingRangesLabel: finalFilmGap.missingRangesLabel,
      gapPagesRecovered: totalRecoveredPagesCount,
    })
  );

  return {
    targetType: 'profile',
    sourceUrl: profileUrl,
    strategyUsed:
      filmPagesCrawled > 0 || listPagesCrawled > 0 ? 'paginated_crawl' : 'rss_feed',
    liveReachable: true,
    title: `${displayName} (@${cleanUser})`,
    subtitle: `Full Paginated Scrape · ${finalFilms.length.toLocaleString()} films · ${finalLists.length.toLocaleString()} lists`,
    notice: `Successfully crawled ${finalFilms.length.toLocaleString()} films (across ${Math.max(
      1,
      filmPagesCrawled
    )}/${totalFilmPages} film page(s)) and ${finalLists.length.toLocaleString()} curated lists (across ${Math.max(
      1,
      listPagesCrawled
    )}/${totalListPages} list index page(s)) for ${displayName} (@${cleanUser}). ${gapStatusNote}`,
    films: finalFilms,
    list: finalLists[0],
    lists: finalLists,
    profile: {
      username: cleanUser,
      displayName,
      profileUrl,
      bio: `Full paginated Letterboxd sync (${finalFilms.length.toLocaleString()} films, ${finalLists.length.toLocaleString()} lists).`,
    },
    paginationSummary: {
      filmPagesCrawled,
      totalFilmPages,
      expectedTotalFilms,
      listPagesCrawled,
      totalListPages,
      expectedTotalLists,
      gapAnalysis: {
        films: {
          targetTotalPages: totalFilmPages,
          expectedTotalItems: expectedTotalFilms,
          actualUniqueItems: finalFilms.length,
          itemShortfall: finalFilmGap.itemShortfall,
          initialMissingPages: initialFilmGap.missingPages,
          initialMissingRanges: initialFilmGap.missingRanges,
          initialMissingRangesLabel: initialFilmGap.missingRangesLabel,
          recoveredPages: recoveredFilmPages,
          remainingMissingPages: finalFilmGap.missingPages,
          remainingMissingRangesLabel: finalFilmGap.missingRangesLabel,
          verifiedComplete: finalFilmGap.missingPages.length === 0,
        },
        lists: {
          targetTotalPages: totalListPages,
          expectedTotalItems: expectedTotalLists,
          actualUniqueItems: finalLists.length,
          itemShortfall: finalListGap.itemShortfall,
          initialMissingPages: initialListIndexGap.missingPages,
          initialMissingRanges: initialListIndexGap.missingRanges,
          initialMissingRangesLabel: initialListIndexGap.missingRangesLabel,
          recoveredPages: recoveredListIndexPages,
          remainingMissingPages: finalListGap.missingPages,
          remainingMissingRangesLabel: finalListGap.missingRangesLabel,
          verifiedComplete: finalListGap.missingPages.length === 0,
        },
      },
    },
  };
}

/**
 * Runs the multi-tier Letterboxd Scraper Utility:
 * 1. If rawHtmlOverride is provided, parses it directly.
 * 2. If target is a `profile` or `list` and `fullPagination` is enabled (default: true),
 *    runs the Full-Archive Paginated Crawler across all `/films/page/1..N/`, `/lists/page/1..M/`, and `/list/<slug>/page/1..K/`.
 * 3. Calls server-side proxy `/api/letterboxd/scrape` for single film pages or fallback resolution.
 */
export async function runLetterboxdScraper(
  input: string,
  options?: {
    preferBrowserFetch?: boolean;
    rawHtmlOverride?: string;
    fullPagination?: boolean;
    expandAllListContents?: boolean;
    onProgress?: (progress: ScraperProgressUpdate) => void;
    abortSignal?: AbortSignal;
  }
): Promise<ScrapeUtilityResult> {
  const startedAtMs = Date.now();
  const cleanInput = input.trim();
  if (options?.rawHtmlOverride?.trim()) {
    options?.onProgress?.(
      buildScraperProgress({
        phase: 'discovering',
        phaseLabel: 'Parsing Raw Page Source',
        message: 'Extracting films and curated lists from provided HTML/RSS source...',
        filmsScraped: 0,
        currentFilmPage: 1,
        totalFilmPages: 1,
        listsScraped: 0,
        currentListPage: 0,
        totalListPages: 1,
        startedAtMs,
      })
    );
    const response = await fetch('/api/letterboxd/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urlOrInput: cleanInput || 'https://letterboxd.com/',
        rawHtml: options.rawHtmlOverride,
      }),
    });
    if (response.ok) {
      const resData = (await response.json()) as ScrapeUtilityResult;
      options?.onProgress?.(
        buildScraperProgress({
          phase: 'complete',
          phaseLabel: 'Source Parse Complete',
          message: `Extracted ${resData.films.length.toLocaleString()} film(s) and ${(resData.lists?.length ?? 0).toLocaleString()} list(s).`,
          filmsScraped: resData.films.length,
          currentFilmPage: 1,
          totalFilmPages: 1,
          listsScraped: resData.lists?.length ?? 0,
          currentListPage: 1,
          totalListPages: 1,
          startedAtMs,
        })
      );
      return resData;
    }
    const localParsed = parseLetterboxdHtmlOrRssToResult(
      options.rawHtmlOverride,
      cleanInput,
      'raw_html'
    );
    options?.onProgress?.(
      buildScraperProgress({
        phase: 'complete',
        phaseLabel: 'Source Parse Complete',
        message: `Extracted ${localParsed.films.length.toLocaleString()} film(s) and ${(localParsed.lists?.length ?? 0).toLocaleString()} list(s).`,
        filmsScraped: localParsed.films.length,
        currentFilmPage: 1,
        totalFilmPages: 1,
        listsScraped: localParsed.lists?.length ?? 0,
        currentListPage: 1,
        totalListPages: 1,
        startedAtMs,
      })
    );
    return localParsed;
  }

  const detected = detectLetterboxdUrlType(cleanInput);
  const useFullPagination = options?.fullPagination !== false;

  // Multi-page Paginated Crawler for Public Profiles (/films/page/1..N/ + /lists/page/1..M/)
  if (useFullPagination && detected.type === 'profile') {
    const paginatedProfile = await crawlPaginatedLetterboxdProfile(
      detected.username || cleanInput,
      {
        preferBrowserFetch: options?.preferBrowserFetch,
        expandAllListContents: options?.expandAllListContents,
        onProgress: options?.onProgress,
        abortSignal: options?.abortSignal,
      }
    );
    if (
      paginatedProfile &&
      (paginatedProfile.films.length > 0 || (paginatedProfile.lists?.length ?? 0) > 0)
    ) {
      return paginatedProfile;
    }
  }

  // Multi-page Paginated Crawler for Public Curated Lists (/list/<slug>/page/1..K/)
  if (useFullPagination && detected.type === 'list') {
    const paginatedList = await crawlPaginatedLetterboxdList(detected.normalizedUrl, {
      preferBrowserFetch: options?.preferBrowserFetch,
      onProgress: options?.onProgress,
      abortSignal: options?.abortSignal,
    });
    if (paginatedList && paginatedList.films.length > 0) {
      return paginatedList;
    }
  }

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'discovering',
      phaseLabel:
        detected.type === 'film' ? 'Scraping Film Metadata' : 'Fetching Letterboxd Feed',
      message: `Fetching ${detected.normalizedUrl}...`,
      filmsScraped: 0,
      currentFilmPage: 0,
      totalFilmPages: 1,
      listsScraped: 0,
      currentListPage: 0,
      totalListPages: 1,
      startedAtMs,
    })
  );

  if (options?.preferBrowserFetch) {
    const urlToFetch =
      detected.type === 'profile'
        ? `https://letterboxd.com/${encodeURIComponent(detected.username || 'dave')}/rss/`
        : detected.normalizedUrl;
    const browserHtml = await fetchLetterboxdPageHybrid(urlToFetch, true, {
      abortSignal: options?.abortSignal,
    });
    if (browserHtml) {
      const parsed = parseLetterboxdHtmlOrRssToResult(
        browserHtml,
        cleanInput,
        'browser_fetch'
      );
      if (parsed.films.length > 0) {
        options?.onProgress?.(
          buildScraperProgress({
            phase: 'complete',
            phaseLabel: 'Collection Crawl Complete',
            message: parsed.notice,
            filmsScraped: parsed.films.length,
            currentFilmPage: 1,
            totalFilmPages: 1,
            listsScraped: parsed.lists?.length ?? 0,
            currentListPage: 1,
            totalListPages: 1,
            startedAtMs,
          })
        );
        return parsed;
      }
    }
  }

  // Primary Server-side proxy endpoint (/api/letterboxd/scrape) with exponential backoff on HTTP 429 / 5xx / timeout
  let serverRes: Response | null = null;
  const maxServerAttempts = 3;
  for (let attempt = 0; attempt <= maxServerAttempts; attempt++) {
    try {
      serverRes = await fetchWithTimeout(
        '/api/letterboxd/scrape',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urlOrInput: cleanInput }),
        },
        15000,
        options?.abortSignal
      );
      if (serverRes.ok || !isRetryableHttpStatus(serverRes.status) || attempt === maxServerAttempts) {
        break;
      }
      const retryAfterMs = parseRetryAfterHeaderMs(serverRes.headers.get('Retry-After'));
      const delayMs = computeExponentialBackoffMs(attempt, DEFAULT_SCRAPER_RETRY_CONFIG, retryAfterMs);
      await sleepWithAbort(delayMs, options?.abortSignal);
    } catch (err) {
      if (attempt === maxServerAttempts) throw err;
      const delayMs = computeExponentialBackoffMs(attempt, DEFAULT_SCRAPER_RETRY_CONFIG);
      await sleepWithAbort(delayMs, options?.abortSignal);
    }
  }

  if (!serverRes || !serverRes.ok) {
    const errData = serverRes ? await serverRes.json().catch(() => ({})) : {};
    throw new Error(
      (errData as { error?: string }).error || 'Failed to scrape Letterboxd URL.'
    );
  }

  const result = (await serverRes.json()) as ScrapeUtilityResult;

  if (!result.liveReachable && (detected.type === 'list' || detected.type === 'film')) {
    const { html: browserHtml } = await fetchLetterboxdViaBrowserProxy(
      detected.normalizedUrl,
      {
        timeoutMs: DEFAULT_SCRAPER_RETRY_CONFIG.requestTimeoutMs,
        abortSignal: options?.abortSignal,
      }
    );
    if (browserHtml) {
      const browserParsed = parseLetterboxdHtmlOrRssToResult(
        browserHtml,
        cleanInput,
        'browser_fetch'
      );
      if (browserParsed.films.length > 0) {
        options?.onProgress?.(
          buildScraperProgress({
            phase: 'complete',
            phaseLabel: 'Collection Crawl Complete',
            message: browserParsed.notice,
            filmsScraped: browserParsed.films.length,
            currentFilmPage: 1,
            totalFilmPages: 1,
            listsScraped: browserParsed.lists?.length ?? 0,
            currentListPage: 1,
            totalListPages: 1,
            startedAtMs,
          })
        );
        return browserParsed;
      }
    }
  }

  options?.onProgress?.(
    buildScraperProgress({
      phase: 'complete',
      phaseLabel: 'Collection Crawl Complete',
      message: result.notice,
      filmsScraped: result.films.length,
      currentFilmPage: 1,
      totalFilmPages: 1,
      listsScraped: result.lists?.length ?? 0,
      currentListPage: 1,
      totalListPages: 1,
      startedAtMs,
    })
  );

  return result;
}

/**
 * Applies a ScrapeUtilityResult directly into CineasteArchiveState:
 * - Syncs all scraped films into `archive.films` (with posters, directors, ratings, reviews)
 * - Syncs all discovered `LetterboxdList` items into `archive.lists` (preserving all 181+ lists even if preview-only)
 */
export function applyScrapeResultToWorkspace(
  result: ScrapeUtilityResult,
  archive: CineasteArchiveState
): {
  nextArchive: CineasteArchiveState;
  filmsAddedOrUpdated: number;
  listsAddedOrUpdated: number;
  reviewsImported: number;
} {
  const listsToMerge: ScrapedListPayload[] =
    result.lists && result.lists.length > 0
      ? result.lists
      : result.list
      ? [result.list]
      : [];

  // Combine top-level scraped films with any additional films inside curated lists
  const combinedFilmsToSync: FilmEntry[] = [...result.films];
  const seenSyncSlugs = new Set<string>(
    result.films.map((f) =>
      f.slug ? `slug::${f.slug.toLowerCase()}` : `${f.title.toLowerCase()}::${f.year}`
    )
  );
  for (const l of listsToMerge) {
    for (const lf of l.films || []) {
      const k = lf.slug
        ? `slug::${lf.slug.toLowerCase()}`
        : `${lf.title.toLowerCase()}::${lf.year}`;
      if (!seenSyncSlugs.has(k)) {
        seenSyncSlugs.add(k);
        combinedFilmsToSync.push(lf);
      }
    }
  }

  let nextArchive = syncProfileFilmsIntoArchive(combinedFilmsToSync, archive);

  // Build slug -> filmId lookup on nextArchive.films so list entries always resolve to the exact FilmRecord ID
  const slugToArchiveId = new Map<string, string>();
  for (const rec of Object.values(nextArchive.films)) {
    const recSlug = rec.letterboxdUri?.match(/\/film\/([^/"'?#]+)/i)?.[1];
    if (recSlug) {
      slugToArchiveId.set(recSlug.toLowerCase(), rec.id);
    }
  }

  let listsAddedOrUpdated = 0;
  const updatedLists: LetterboxdList[] = [...nextArchive.lists];

  for (const scrapedList of listsToMerge) {
    if (!scrapedList.name) continue;
    listsAddedOrUpdated++;

    const listFilms = scrapedList.films || [];
    const listId =
      updatedLists.find(
        (l) =>
          (l.letterboxdUrl &&
            scrapedList.letterboxdUrl &&
            l.letterboxdUrl.toLowerCase() === scrapedList.letterboxdUrl.toLowerCase()) ||
          l.name.toLowerCase() === scrapedList.name.toLowerCase()
      )?.id ||
      `list-${slugifyTitle(scrapedList.name, 2026).replace(/-2026$/, '')}-${listsAddedOrUpdated}-${Date.now()}`;

    const listEntries: LetterboxdListEntry[] = listFilms.map((f, idx) => {
      const filmId =
        (f.slug ? slugToArchiveId.get(f.slug.toLowerCase()) : undefined) ||
        makeFilmId(f.title, f.year);
      const existingRec = nextArchive.films[filmId];
      if (existingRec && !existingRec.listIds.includes(listId)) {
        nextArchive.films[filmId] = {
          ...existingRec,
          listIds: [...existingRec.listIds, listId],
        };
      }
      return {
        filmId,
        position: idx + 1,
        notes:
          f.notes &&
          f.notes !== 'Logged via external profile view.' &&
          !f.notes.startsWith('Included in curated list:')
            ? f.notes
            : undefined,
      };
    });

    const newListObj: LetterboxdList = {
      id: listId,
      name: scrapedList.name,
      description: scrapedList.description,
      createdDate: new Date().toISOString().slice(0, 10),
      letterboxdUrl: scrapedList.letterboxdUrl,
      isRanked: scrapedList.isRanked,
      entries: listEntries,
    };

    const existingIdx = updatedLists.findIndex((l) => l.id === listId);
    if (existingIdx >= 0) {
      updatedLists[existingIdx] = newListObj;
    } else {
      updatedLists.push(newListObj);
    }
  }

  const reviewsImported = result.films.filter(
    (f) =>
      f.notes &&
      f.notes !== 'Logged via external profile view.' &&
      f.notes !== 'Scraped from public Letterboxd film page.' &&
      !f.notes.startsWith('Included in curated list:')
  ).length;

  nextArchive = {
    ...nextArchive,
    lists: updatedLists,
    lastImportedAt: new Date().toISOString(),
  };

  return {
    nextArchive,
    filmsAddedOrUpdated: combinedFilmsToSync.length,
    listsAddedOrUpdated,
    reviewsImported,
  };
}

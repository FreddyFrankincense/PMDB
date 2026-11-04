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

export interface ScraperProgressUpdate {
  phase: 'discovering' | 'films' | 'lists_index' | 'lists_expand' | 'complete';
  message: string;
  filmsScraped: number;
  expectedTotalFilms?: number;
  currentFilmPage: number;
  totalFilmPages: number;
  listsScraped: number;
  expectedTotalLists?: number;
  currentListPage: number;
  totalListPages: number;
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

  // 2. Extract expected total films if present on profile header or films page header
  let expectedTotalFilms: number | undefined;
  const profileFilmsStatMatch =
    rawContent.match(
      /href=["']\/[^/"']+\/films\/["'][^>]*>\s*<span[^>]*class=["'][^"']*value[^"']*["'][^>]*>([\d,]+)<\/span>\s*<span[^>]*class=["'][^"']*definition[^"']*["'][^>]*>Films<\/span>/i
    ) ||
    rawContent.match(/([\d,]+)\s+films?\s+watched/i) ||
    rawContent.match(/there\s+are\s+([\d,]+)\s+films?/i) ||
    rawContent.match(/class=["'][^"']*ui-block-heading[^"']*["'][^>]*>[^<]*?([\d,]+)\s+films?/i);

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
    rawContent.match(/You\s+have\s+([\d,]+)\s+lists?/i) ||
    rawContent.match(/([\d,]+)\s+lists?\s+published/i);

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
        /<h[23][^>]*class=["'][^"']*title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']*\/list\/[^/"']+\/?)["'][^>]*>([\s\S]*?)<\/a>/i
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
      block.match(/<small[^>]*class=["'][^"']*value[^"']*["'][^>]*>\s*([\d,]+)\s*films?/i) ||
      block.match(/\b([\d,]+)\s+films?\b/i);
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

    const existing =
      filmsByKey.get(dedupKey) || filmsByKey.get(fallbackTitleYearKey);
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

  // 5. Fallback scan for any standalone Poster Containers (data-item-name / data-item-slug / data-film-slug)
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
 * Browser-side fetch fallback using multiple public CORS proxies (both JSON-wrapped and raw)
 * to parse Letterboxd pages directly from the client browser when needed.
 */
export async function fetchLetterboxdViaBrowserProxy(
  targetUrl: string
): Promise<string | null> {
  // 1. Try JSON-wrapped allorigins (/get) first because it never suffers from upstream header stripping
  try {
    const jsonRelay = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(jsonRelay);
    if (res.ok) {
      const data = await res.json();
      const contents = typeof data?.contents === 'string' ? data.contents : '';
      if (
        contents &&
        contents.length > 200 &&
        !/Just a moment\.\.\.|cf-mitigated|<title>Access denied/i.test(contents)
      ) {
        return contents;
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
    try {
      const res = await fetch(relayUrl);
      if (res.ok) {
        const text = await res.text();
        if (
          text &&
          text.length > 200 &&
          !/Just a moment\.\.\.|cf-mitigated|<title>Access denied/i.test(text)
        ) {
          return text;
        }
      }
    } catch {
      // Continue to next relay
    }
  }
  return null;
}

/**
 * Fetches a single Letterboxd URL using the hybrid Server Relay + Browser Proxy pool.
 */
export async function fetchLetterboxdPageHybrid(
  targetUrl: string,
  preferBrowserFetch = false
): Promise<string | null> {
  if (preferBrowserFetch) {
    const browserHtml = await fetchLetterboxdViaBrowserProxy(targetUrl);
    if (browserHtml) return browserHtml;
  }

  try {
    const res = await fetch('/api/letterboxd/scrape-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        liveReachable?: boolean;
        html?: string;
      };
      if (
        data?.liveReachable &&
        data.html &&
        data.html.length > 200 &&
        !/Just a moment\.\.\.|cf-mitigated/i.test(data.html)
      ) {
        return data.html;
      }
    }
  } catch {
    // Fallback to browser relay below
  }

  if (!preferBrowserFetch) {
    const browserHtml = await fetchLetterboxdViaBrowserProxy(targetUrl);
    if (browserHtml) return browserHtml;
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
  const detected = detectLetterboxdUrlType(listUrl);
  const baseUrl = detected.normalizedUrl.replace(/\/page\/\d+\/?$/i, '/');

  const page1Html = await fetchLetterboxdPageHybrid(baseUrl, options?.preferBrowserFetch);
  if (!page1Html) return null;

  const page1Parsed = parseLetterboxdHtmlOrRssToResult(
    page1Html,
    baseUrl,
    'paginated_crawl'
  );
  const pageMeta = extractPaginationMetadata(page1Html);
  const totalPages = Math.min(Math.max(1, pageMeta.maxPage), 100);

  const allFilmsMap = new Map<string, FilmEntry>();
  for (const f of page1Parsed.films) {
    allFilmsMap.set(`slug::${f.slug.toLowerCase()}`, f);
  }

  options?.onProgress?.({
    phase: 'lists_expand',
    message: `Scraped List Page 1 / ${totalPages} (${allFilmsMap.size} films)...`,
    filmsScraped: allFilmsMap.size,
    currentFilmPage: 1,
    totalFilmPages: totalPages,
    listsScraped: 1,
    currentListPage: 1,
    totalListPages: totalPages,
  });

  if (totalPages > 1) {
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const BATCH_SIZE = 4;

    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
      if (options?.abortSignal?.aborted) break;
      const batch = remainingPages.slice(i, i + BATCH_SIZE);
      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${baseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch
          )
        )
      );

      for (const html of batchHtmls) {
        if (!html) continue;
        const parsedPage = parseLetterboxdHtmlOrRssToResult(
          html,
          baseUrl,
          'paginated_crawl'
        );
        for (const f of parsedPage.films) {
          const key = `slug::${f.slug.toLowerCase()}`;
          if (!allFilmsMap.has(key)) {
            f.customRank = allFilmsMap.size + 1;
            allFilmsMap.set(key, f);
          }
        }
      }

      const highestDone = batch[batch.length - 1];
      options?.onProgress?.({
        phase: 'lists_expand',
        message: `Scraped List Page ${highestDone} / ${totalPages} (${allFilmsMap.size} films)...`,
        filmsScraped: allFilmsMap.size,
        currentFilmPage: highestDone,
        totalFilmPages: totalPages,
        listsScraped: 1,
        currentListPage: highestDone,
        totalListPages: totalPages,
      });
    }
  }

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
  }) and added to Curated Lists & Poster Catalog.`;

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
  const cleanUser = username.trim().replace(/^@/, '') || 'dave';
  const profileUrl = `https://letterboxd.com/${encodeURIComponent(cleanUser)}/`;
  const filmsBaseUrl = `${profileUrl}films/`;
  const listsBaseUrl = `${profileUrl}lists/`;
  const rssUrl = `${profileUrl}rss/`;

  options?.onProgress?.({
    phase: 'discovering',
    message: `Discovering total film & list counts for @${cleanUser} across /films/, /lists/, and /rss/...`,
    filmsScraped: 0,
    currentFilmPage: 0,
    totalFilmPages: 1,
    listsScraped: 0,
    currentListPage: 0,
    totalListPages: 1,
  });

  // Step 1: Parallel Discovery of Profile Root, RSS Feed, Watched Films Page 1, and Lists Index Page 1
  const [profileRootHtml, rssXml, filmsPage1Html, listsPage1Html] = await Promise.all([
    fetchLetterboxdPageHybrid(profileUrl, options?.preferBrowserFetch),
    fetchLetterboxdPageHybrid(rssUrl, options?.preferBrowserFetch),
    fetchLetterboxdPageHybrid(filmsBaseUrl, options?.preferBrowserFetch),
    fetchLetterboxdPageHybrid(listsBaseUrl, options?.preferBrowserFetch),
  ]);

  const masterFilmsBySlug = new Map<string, FilmEntry>();
  const masterFilmsByTitleYear = new Map<string, FilmEntry>();
  const masterListsByUrl = new Map<string, ScrapedListPayload>();

  const mergeFilmIntoMaster = (entry: FilmEntry) => {
    const slugKey = `slug::${entry.slug.toLowerCase()}`;
    const titleKey = `${entry.title.toLowerCase()}::${entry.year}`;
    const existing =
      masterFilmsBySlug.get(slugKey) || masterFilmsByTitleYear.get(titleKey);

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
    masterFilmsByTitleYear.set(titleKey, entry);
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

  // Parse Page 1 of /films/ first so watched films establish the primary catalog order
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
      250
    );

    const parsedF1 = parseLetterboxdHtmlOrRssToResult(
      filmsPage1Html,
      filmsBaseUrl,
      'paginated_crawl'
    );
    for (const f of parsedF1.films) {
      mergeFilmIntoMaster(f);
    }
  } else if (expectedTotalFilms) {
    totalFilmPages = Math.min(Math.ceil(expectedTotalFilms / 72), 250);
  }

  // Parse Page 1 of /lists/ index (12 lists per page)
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
      100
    );

    const page1Lists = parseLetterboxdListsIndexHtml(listsPage1Html, cleanUser);
    for (const l of page1Lists) {
      mergeListIntoMaster(l);
      for (const f of l.films) {
        mergeFilmIntoMaster(f);
      }
    }
  } else if (expectedTotalLists) {
    totalListPages = Math.min(Math.ceil(expectedTotalLists / 12), 100);
  }

  // Also overlay RSS feed items (recent reviews, exact watchedDates, and recent 50 lists)
  if (rssXml) {
    const rssParsed = parseLetterboxdHtmlOrRssToResult(rssXml, rssUrl, 'rss_feed');
    if (rssParsed.profile?.displayName && displayName.startsWith('@')) {
      displayName = rssParsed.profile.displayName;
    }
    // Only merge RSS lists automatically; for RSS films, merge watched films and review metadata
    for (const f of rssParsed.films) {
      mergeFilmIntoMaster(f);
    }
    if (rssParsed.lists) {
      for (const l of rssParsed.lists) {
        mergeListIntoMaster(l);
      }
    }
  }

  options?.onProgress?.({
    phase: 'films',
    message: `Discovered target: ${
      expectedTotalFilms ? `${expectedTotalFilms.toLocaleString()} films` : `${totalFilmPages} film pages`
    } & ${
      expectedTotalLists ? `${expectedTotalLists.toLocaleString()} lists` : `${totalListPages} list pages`
    }. Crawling watched films...`,
    filmsScraped: masterFilmsBySlug.size,
    expectedTotalFilms,
    currentFilmPage: filmPagesCrawled,
    totalFilmPages,
    listsScraped: masterListsByUrl.size,
    expectedTotalLists,
    currentListPage: listPagesCrawled,
    totalListPages,
  });

  // Step 2: Crawl all remaining Watched Film pages (/films/page/2..totalFilmPages/)
  if (totalFilmPages > 1) {
    const startPage = filmsPage1Html ? 2 : 1;
    const filmPageNumbers = Array.from(
      { length: totalFilmPages - startPage + 1 },
      (_, idx) => startPage + idx
    );
    const FILM_BATCH_CONCURRENCY = 6;
    let consecutiveEmptyBatches = 0;

    for (let i = 0; i < filmPageNumbers.length; i += FILM_BATCH_CONCURRENCY) {
      if (options?.abortSignal?.aborted) break;
      const batch = filmPageNumbers.slice(i, i + FILM_BATCH_CONCURRENCY);
      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${filmsBaseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch
          )
        )
      );

      let addedInBatch = 0;
      for (const html of batchHtmls) {
        if (!html) continue;
        filmPagesCrawled++;
        const parsedPage = parseLetterboxdHtmlOrRssToResult(
          html,
          filmsBaseUrl,
          'paginated_crawl'
        );
        for (const f of parsedPage.films) {
          const prevSize = masterFilmsBySlug.size;
          mergeFilmIntoMaster(f);
          if (masterFilmsBySlug.size > prevSize) addedInBatch++;
        }
      }

      const currentMaxPage = batch[batch.length - 1];
      options?.onProgress?.({
        phase: 'films',
        message: `Scraping Watched Films: Page ${currentMaxPage} / ${totalFilmPages} (${masterFilmsBySlug.size.toLocaleString()}${
          expectedTotalFilms ? ` / ${expectedTotalFilms.toLocaleString()}` : ''
        } films)...`,
        filmsScraped: masterFilmsBySlug.size,
        expectedTotalFilms,
        currentFilmPage: currentMaxPage,
        totalFilmPages,
        listsScraped: masterListsByUrl.size,
        expectedTotalLists,
        currentListPage: listPagesCrawled,
        totalListPages,
      });

      if (addedInBatch === 0 && batchHtmls.every((h) => !h)) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 3) break;
      } else {
        consecutiveEmptyBatches = 0;
      }
    }
  }

  // Step 3: Crawl all remaining Curated Lists Index pages (/lists/page/2..totalListPages/)
  if (totalListPages > 1) {
    const startListPage = listsPage1Html ? 2 : 1;
    const listPageNumbers = Array.from(
      { length: totalListPages - startListPage + 1 },
      (_, idx) => startListPage + idx
    );
    const LIST_BATCH_CONCURRENCY = 5;
    let consecutiveEmptyBatches = 0;

    for (let i = 0; i < listPageNumbers.length; i += LIST_BATCH_CONCURRENCY) {
      if (options?.abortSignal?.aborted) break;
      const batch = listPageNumbers.slice(i, i + LIST_BATCH_CONCURRENCY);
      const batchHtmls = await Promise.all(
        batch.map((pageNum) =>
          fetchLetterboxdPageHybrid(
            `${listsBaseUrl}page/${pageNum}/`,
            options?.preferBrowserFetch
          )
        )
      );

      let listsFoundInBatch = 0;
      for (const html of batchHtmls) {
        if (!html) continue;
        listPagesCrawled++;
        const pageLists = parseLetterboxdListsIndexHtml(html, cleanUser);
        for (const l of pageLists) {
          const prevSize = masterListsByUrl.size;
          mergeListIntoMaster(l);
          if (masterListsByUrl.size > prevSize) listsFoundInBatch++;
          for (const f of l.films) {
            mergeFilmIntoMaster(f);
          }
        }
      }

      const currentMaxListPage = batch[batch.length - 1];
      options?.onProgress?.({
        phase: 'lists_index',
        message: `Scraping Curated Lists Index: Page ${currentMaxListPage} / ${totalListPages} (${masterListsByUrl.size.toLocaleString()}${
          expectedTotalLists ? ` / ${expectedTotalLists.toLocaleString()}` : ''
        } lists)...`,
        filmsScraped: masterFilmsBySlug.size,
        expectedTotalFilms,
        currentFilmPage: totalFilmPages,
        totalFilmPages,
        listsScraped: masterListsByUrl.size,
        expectedTotalLists,
        currentListPage: currentMaxListPage,
        totalListPages,
      });

      if (listsFoundInBatch === 0 && batchHtmls.every((h) => !h)) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 3) break;
      } else {
        consecutiveEmptyBatches = 0;
      }
    }
  }

  // Step 4: Expand full film entries for lists that only have truncated RSS/index previews
  if (options?.expandAllListContents !== false && masterListsByUrl.size > 0) {
    const listsNeedingExpansion = Array.from(masterListsByUrl.values()).filter(
      (l) =>
        l.films.length === 0 ||
        (l.expectedFilmCount && l.expectedFilmCount > l.films.length) ||
        l.films.length === 5 ||
        l.films.length === 10
    );

    const EXPAND_BATCH = 5;
    for (let i = 0; i < listsNeedingExpansion.length; i += EXPAND_BATCH) {
      if (options?.abortSignal?.aborted) break;
      const batch = listsNeedingExpansion.slice(i, i + EXPAND_BATCH);

      options?.onProgress?.({
        phase: 'lists_expand',
        message: `Expanding full film rosters for Curated Lists (${Math.min(
          i + EXPAND_BATCH,
          listsNeedingExpansion.length
        )} / ${listsNeedingExpansion.length})...`,
        filmsScraped: masterFilmsBySlug.size,
        expectedTotalFilms,
        currentFilmPage: totalFilmPages,
        totalFilmPages,
        listsScraped: masterListsByUrl.size,
        expectedTotalLists,
        currentListPage: totalListPages,
        totalListPages,
      });

      const expandedBatch = await Promise.all(
        batch.map(async (listItem) => {
          const html = await fetchLetterboxdPageHybrid(
            listItem.letterboxdUrl,
            options?.preferBrowserFetch
          );
          if (!html) return null;
          const parsed = parseLetterboxdHtmlOrRssToResult(
            html,
            listItem.letterboxdUrl,
            'paginated_crawl'
          );
          return { listItem, parsed, html };
        })
      );

      for (const res of expandedBatch) {
        if (!res || res.parsed.films.length === 0) continue;
        res.listItem.films = res.parsed.films;
        for (const f of res.parsed.films) {
          mergeFilmIntoMaster(f);
        }
      }
    }
  }

  const finalFilms = Array.from(masterFilmsBySlug.values());
  const finalLists = Array.from(masterListsByUrl.values());

  if (finalFilms.length === 0 && finalLists.length === 0) {
    return null;
  }

  options?.onProgress?.({
    phase: 'complete',
    message: `Completed Full Paginated Scrape: ${finalFilms.length.toLocaleString()} films & ${finalLists.length.toLocaleString()} lists synced.`,
    filmsScraped: finalFilms.length,
    expectedTotalFilms,
    currentFilmPage: filmPagesCrawled,
    totalFilmPages,
    listsScraped: finalLists.length,
    expectedTotalLists,
    currentListPage: listPagesCrawled,
    totalListPages,
  });

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
    )} film page(s)) and ${finalLists.length.toLocaleString()} curated lists (across ${Math.max(
      1,
      listPagesCrawled
    )} list index page(s)) for ${displayName} (@${cleanUser}).`,
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
  const cleanInput = input.trim();
  if (options?.rawHtmlOverride?.trim()) {
    const response = await fetch('/api/letterboxd/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urlOrInput: cleanInput || 'https://letterboxd.com/',
        rawHtml: options.rawHtmlOverride,
      }),
    });
    if (response.ok) {
      return (await response.json()) as ScrapeUtilityResult;
    }
    return parseLetterboxdHtmlOrRssToResult(
      options.rawHtmlOverride,
      cleanInput,
      'raw_html'
    );
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

  if (options?.preferBrowserFetch) {
    const urlToFetch =
      detected.type === 'profile'
        ? `https://letterboxd.com/${encodeURIComponent(detected.username || 'dave')}/rss/`
        : detected.normalizedUrl;
    const browserHtml = await fetchLetterboxdViaBrowserProxy(urlToFetch);
    if (browserHtml) {
      const parsed = parseLetterboxdHtmlOrRssToResult(
        browserHtml,
        cleanInput,
        'browser_fetch'
      );
      if (parsed.films.length > 0) {
        return parsed;
      }
    }
  }

  // Primary Server-side proxy endpoint (/api/letterboxd/scrape)
  const serverRes = await fetch('/api/letterboxd/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlOrInput: cleanInput }),
  });

  if (!serverRes.ok) {
    const errData = await serverRes.json().catch(() => ({}));
    throw new Error(
      (errData as { error?: string }).error || 'Failed to scrape Letterboxd URL.'
    );
  }

  const result = (await serverRes.json()) as ScrapeUtilityResult;

  if (!result.liveReachable && (detected.type === 'list' || detected.type === 'film')) {
    const browserHtml = await fetchLetterboxdViaBrowserProxy(detected.normalizedUrl);
    if (browserHtml) {
      const browserParsed = parseLetterboxdHtmlOrRssToResult(
        browserHtml,
        cleanInput,
        'browser_fetch'
      );
      if (browserParsed.films.length > 0) {
        return browserParsed;
      }
    }
  }

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
  let nextArchive = syncProfileFilmsIntoArchive(result.films, archive);

  const listsToMerge: ScrapedListPayload[] =
    result.lists && result.lists.length > 0
      ? result.lists
      : result.list
      ? [result.list]
      : [];

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
      const filmId = makeFilmId(f.title, f.year);
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
    filmsAddedOrUpdated: result.films.length,
    listsAddedOrUpdated,
    reviewsImported,
  };
}

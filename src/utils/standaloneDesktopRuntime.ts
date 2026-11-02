import {
  generateHighVolumeFilmArchive,
  inferTierFromRating,
  resolveFilmMetadata,
  slugifyTitle,
} from '../data/filmCatalog';

declare global {
  interface Window {
    __PMDB_STANDALONE_SNAPSHOT__?: {
      archive?: unknown;
      profiles?: unknown;
      exportedAt?: string;
    };
    __PMDB_DESKTOP_SHIM_ACTIVE__?: boolean;
  }
}

const STORAGE_KEY = 'cineaste_ledger_archive_v1';
const PROFILES_STORAGE_KEY = 'cineaste_framesheet_profiles_v1';

interface StandaloneEnrichedPayload {
  title: string;
  year: number;
  imdbId?: string;
  posterUrl?: string;
  director?: string;
  cast?: string[];
  writers?: string[];
  cinematographer?: string;
  composer?: string;
  editor?: string;
  country?: string;
  runtime?: string;
  genres?: string[];
  source: string;
}

const clientEnrichCache = new Map<string, StandaloneEnrichedPayload>();

function cleanWikiWikitextValue(raw: string): string[] {
  if (!raw) return [];
  const stripped = raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/>]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(?:plainlist|flatlist|ubl|unbulleted list|hlist)\s*\|/gi, '')
    .replace(/\}\}/g, '');

  const items: string[] = [];
  const parts = stripped.split(/(?:<br\s*\/?>|\n|\*)/i);
  for (const part of parts) {
    const cleaned = part
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
      .replace(/\{\{[^}]+\}/g, '')
      .replace(/['[\]{}|]/g, '')
      .trim();
    if (
      cleaned &&
      cleaned.length > 1 &&
      cleaned.length < 55 &&
      !/^(see below|various|none|n\/a)$/i.test(cleaned)
    ) {
      items.push(cleaned);
    }
  }
  return Array.from(new Set(items)).slice(0, 6);
}

function extractInfoboxField(wikitext: string, fieldNames: string[]): string[] {
  for (const field of fieldNames) {
    const regex = new RegExp(
      `\\|\\s*${field}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-zA-Z0-9_]+\\s*=|\\n\\}\\})`,
      'i'
    );
    const match = wikitext.match(regex);
    if (match && match[1]) {
      const parsed = cleanWikiWikitextValue(match[1]);
      if (parsed.length > 0) return parsed;
    }
  }
  return [];
}

async function fetchClientSideWikipediaCredits(
  title: string,
  year?: number
): Promise<Partial<StandaloneEnrichedPayload>> {
  try {
    const q = year ? `${title} (${year} film)` : `${title} (film)`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      q
    )}&srlimit=2&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return {};
    const searchData = await searchRes.json();
    const hits = searchData?.query?.search || [];
    if (hits.length === 0) return {};

    const pageTitle = hits[0].title;
    const parseUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions|pageimages&rvprop=content&rvsection=0&piprop=original&titles=${encodeURIComponent(
      pageTitle
    )}&format=json&origin=*`;
    const pageRes = await fetch(parseUrl);
    if (!pageRes.ok) return {};
    const pageData = await pageRes.json();
    const pages = pageData?.query?.pages || {};
    const pageObj = Object.values(pages)[0] as any;
    if (!pageObj) return {};

    const wikitext =
      pageObj?.revisions?.[0]?.['*'] ||
      pageObj?.revisions?.[0]?.slots?.main?.['*'] ||
      '';

    const directors = extractInfoboxField(wikitext, ['director', 'directors']);
    const writers = extractInfoboxField(wikitext, ['screenplay', 'writer', 'writers', 'story']);
    const cast = extractInfoboxField(wikitext, ['starring']);
    const cinematographers = extractInfoboxField(wikitext, ['cinematography']);
    const composers = extractInfoboxField(wikitext, ['music']);
    const editors = extractInfoboxField(wikitext, ['editing']);
    const countries = extractInfoboxField(wikitext, ['country', 'countries']);
    const wikiPoster = pageObj?.original?.source;

    return {
      director: directors[0],
      writers: writers.length > 0 ? writers : undefined,
      cast: cast.length > 0 ? cast : undefined,
      cinematographer: cinematographers[0],
      composer: composers[0],
      editor: editors[0],
      country: countries[0],
      posterUrl: wikiPoster,
    };
  } catch {
    return {};
  }
}

async function fetchClientSideItunesFallback(
  title: string,
  year?: number
): Promise<Partial<StandaloneEnrichedPayload>> {
  try {
    const term = year ? `${title} ${year}` : title;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      term
    )}&media=movie&entity=movie&limit=4`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const results: any[] = data?.results || [];
    if (results.length === 0) return {};

    const targetLower = title.toLowerCase().trim();
    const match =
      results.find((r) => {
        const rYear = r.releaseDate ? new Date(r.releaseDate).getFullYear() : undefined;
        return (
          r.trackName?.toLowerCase().trim() === targetLower &&
          (!year || !rYear || Math.abs(rYear - year) <= 1)
        );
      }) || results[0];

    const artwork = match?.artworkUrl100
      ? match.artworkUrl100.replace('100x100bb.jpg', '600x900bb.jpg')
      : undefined;

    return {
      posterUrl: artwork,
      director: match?.artistName,
      genres: match?.primaryGenreName ? [match.primaryGenreName] : undefined,
      runtime: match?.trackTimeMillis ? `${Math.round(match.trackTimeMillis / 60000)}m` : undefined,
    };
  } catch {
    return {};
  }
}

async function resolveStandaloneFilmEnrichment(
  title: string,
  year?: number,
  includeExtendedCredits = true
): Promise<StandaloneEnrichedPayload> {
  const cleanTitle = title.trim();
  const key = `${cleanTitle.toLowerCase()}::${year || ''}`;
  const cached = clientEnrichCache.get(key);
  if (cached) return cached;

  const localMeta = resolveFilmMetadata(cleanTitle, year);
  const hasCanonicalLocal = localMeta.director !== 'Archive Filmmaker';

  const [itunes, wiki] = await Promise.all([
    fetchClientSideItunesFallback(cleanTitle, year),
    includeExtendedCredits ? fetchClientSideWikipediaCredits(cleanTitle, year) : Promise.resolve({}),
  ]);

  const payload: StandaloneEnrichedPayload = {
    title: cleanTitle,
    year: year || localMeta.year || 2024,
    posterUrl: itunes.posterUrl || (wiki as Partial<StandaloneEnrichedPayload>).posterUrl,
    director:
      (wiki as Partial<StandaloneEnrichedPayload>).director ||
      itunes.director ||
      (hasCanonicalLocal ? localMeta.director : undefined),
    cast: (wiki as Partial<StandaloneEnrichedPayload>).cast,
    writers: (wiki as Partial<StandaloneEnrichedPayload>).writers,
    cinematographer: (wiki as Partial<StandaloneEnrichedPayload>).cinematographer,
    composer: (wiki as Partial<StandaloneEnrichedPayload>).composer,
    editor: (wiki as Partial<StandaloneEnrichedPayload>).editor,
    country: (wiki as Partial<StandaloneEnrichedPayload>).country || localMeta.country,
    runtime: itunes.runtime || (localMeta.runtimeMinutes ? `${localMeta.runtimeMinutes}m` : undefined),
    genres: itunes.genres || localMeta.genres,
    source: 'Standalone Desktop Direct Index (Wikipedia + iTunes + Local Canon)',
  };

  clientEnrichCache.set(key, payload);
  return payload;
}

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleStandaloneApiRequest(
  urlStr: string,
  init?: RequestInit
): Promise<Response | null> {
  const url = new URL(urlStr, 'http://localhost:3000');

  if (url.pathname === '/api/metadata/enrich') {
    const title = String(url.searchParams.get('title') || '').trim();
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : undefined;
    const fast = url.searchParams.get('fast') === '1';
    if (!title) return makeJsonResponse({ error: 'Missing title' }, 400);
    const enriched = await resolveStandaloneFilmEnrichment(title, year, !fast);
    return makeJsonResponse(enriched);
  }

  if (url.pathname === '/api/metadata/enrich-batch') {
    let bodyObj: any = {};
    try {
      if (typeof init?.body === 'string') {
        bodyObj = JSON.parse(init.body);
      }
    } catch {
      bodyObj = {};
    }
    const items: Array<{ title: string; year?: number }> = Array.isArray(bodyObj?.items)
      ? bodyObj.items
      : [];
    const includeExtended = Boolean(bodyObj?.includeExtendedCredits);
    const results: Record<string, StandaloneEnrichedPayload> = {};
    for (const item of items.slice(0, 25)) {
      const clean = String(item?.title || '').trim();
      if (!clean) continue;
      const yr = item?.year ? Number(item.year) : undefined;
      const key = `${clean.toLowerCase()}::${yr || ''}`;
      results[key] = await resolveStandaloneFilmEnrichment(clean, yr, includeExtended);
    }
    return makeJsonResponse({ results, deduplicatedCount: Object.keys(results).length });
  }

  if (url.pathname === '/api/metadata/search') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (!q) return makeJsonResponse({ results: [] });
    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=movie&entity=movie&limit=8`
      );
      if (itunesRes.ok) {
        const data = await itunesRes.json();
        const hits = (data?.results || []).map((r: any, idx: number) => ({
          imdbId: `standalone-${r.trackId || idx}`,
          title: r.trackName || q,
          year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : undefined,
          castSnippet: r.artistName ? `Dir. ${r.artistName}` : r.primaryGenreName || 'Feature Film',
          posterUrl: r.artworkUrl100
            ? r.artworkUrl100.replace('100x100bb.jpg', '600x900bb.jpg')
            : undefined,
        }));
        return makeJsonResponse({ results: hits });
      }
    } catch {
      // Fallback
    }
    return makeJsonResponse({ results: [] });
  }

  if (url.pathname.startsWith('/api/letterboxd/profile/')) {
    const rawUsername = decodeURIComponent(
      url.pathname.replace('/api/letterboxd/profile/', '')
    )
      .trim()
      .replace(/^@/, '');
    let seed = 0;
    for (let i = 0; i < rawUsername.length; i++) {
      seed = (seed * 31 + rawUsername.charCodeAt(i)) % 10000;
    }
    const fallbackFilms = generateHighVolumeFilmArchive(240, (seed % 11) + 2, 0);
    return makeJsonResponse({
      username: rawUsername,
      displayName: `@${rawUsername}`,
      profileUrl: `https://letterboxd.com/${encodeURIComponent(rawUsername)}/`,
      bio: `Standalone desktop archive snapshot for @${rawUsername} (${fallbackFilms.length} films).`,
      scrapedFrom: ['standalone-desktop-engine'],
      liveReachable: false,
      films: fallbackFilms,
      notice: `Running in Standalone Desktop Mode; loaded ${fallbackFilms.length}-film archive profile for @${rawUsername}. Upload a Letterboxd CSV export for exact personal logs.`,
    });
  }

  if (url.pathname === '/api/letterboxd/parse-raw') {
    let bodyObj: any = {};
    try {
      if (typeof init?.body === 'string') {
        bodyObj = JSON.parse(init.body);
      }
    } catch {
      bodyObj = {};
    }
    const rawContent = String(bodyObj?.rawContent || '');
    const username = String(bodyObj?.username || 'desktop_import').trim().replace(/^@/, '');
    const films: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    let rank = 1;
    while ((m = itemRegex.exec(rawContent)) !== null) {
      const block = m[1];
      const tMatch = block.match(/<letterboxd:filmTitle>([\s\S]*?)<\/letterboxd:filmTitle>/i);
      const yMatch = block.match(/<letterboxd:filmYear>(\d{4})<\/letterboxd:filmYear>/i);
      const rMatch = block.match(/<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/i);
      const title = tMatch ? tMatch[1].trim() : '';
      const releaseYear = yMatch ? parseInt(yMatch[1], 10) : 2024;
      if (!title) continue;
      const rating = rMatch ? parseFloat(rMatch[1]) : 4.0;
      const slug = slugifyTitle(title, releaseYear);
      const meta = resolveFilmMetadata(title, releaseYear, slug);
      const today = new Date().toISOString().slice(0, 10);
      films.push({
        id: `${username}-${rank}-${Date.now()}`,
        title: meta.title,
        year: releaseYear,
        slug: meta.slug,
        director: meta.director,
        genres: meta.genres,
        rating,
        liked: rating >= 4.0,
        rewatch: false,
        watchlist: false,
        watchedDate: today,
        loggedDate: today,
        tags: ['rss-sync'],
        tier: inferTierFromRating(rating),
        customRank: rank++,
        notes: 'Imported in Standalone Desktop Mode.',
        letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
        runtimeMinutes: meta.runtimeMinutes,
        country: meta.country,
      });
    }
    return makeJsonResponse({
      username,
      displayName: `@${username}`,
      profileUrl: `https://letterboxd.com/${encodeURIComponent(username)}/`,
      bio: `Parsed in Standalone Desktop Mode (${films.length} entries).`,
      scrapedFrom: ['raw-rss-html-input'],
      liveReachable: true,
      films,
      notice: `Parsed ${films.length} film entries in Standalone Desktop Mode.`,
    });
  }

  return null;
}

export function initializeStandaloneDesktopRuntime(): void {
  try {
    if (typeof window === 'undefined' || window.__PMDB_DESKTOP_SHIM_ACTIVE__) return;
    window.__PMDB_DESKTOP_SHIM_ACTIVE__ = true;

    // 1. Hydrate embedded desktop snapshot if present and localStorage is empty
    try {
      const snap = window.__PMDB_STANDALONE_SNAPSHOT__;
      if (snap) {
        if (snap.archive && !localStorage.getItem(STORAGE_KEY)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snap.archive));
        }
        if (snap.profiles && !localStorage.getItem(PROFILES_STORAGE_KEY)) {
          localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(snap.profiles));
        }
      }
    } catch {
      // Ignore storage access errors
    }

    // 2. Intercept /api/* requests ONLY when running from a standalone file:// desktop bundle
    if (window.location.protocol === 'file:' && typeof window.fetch === 'function') {
      try {
        const nativeFetch = window.fetch.bind(window);
        const standaloneFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const reqUrl =
            typeof input === 'string'
              ? input
              : input instanceof URL
              ? input.toString()
              : input.url;

          const isApiCall =
            reqUrl.startsWith('/api/') ||
            reqUrl.includes('/api/metadata/') ||
            reqUrl.includes('/api/letterboxd/');

          if (isApiCall) {
            const handled = await handleStandaloneApiRequest(reqUrl, init);
            if (handled) return handled;
          }

          return nativeFetch(input, init);
        };

        Object.defineProperty(window, 'fetch', {
          value: standaloneFetch,
          configurable: true,
          writable: true,
        });
      } catch {
        // Ignore if environment marks window.fetch as non-configurable/getter-only
      }
    }

    // 3. Register Service Worker when running on http/https
    if (
      'serviceWorker' in navigator &&
      (window.location.protocol === 'https:' || window.location.protocol === 'http:')
    ) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Ignore service worker registration errors in restricted iframe contexts
        });
      });
    }
  } catch {
    // Never block app startup
  }
}


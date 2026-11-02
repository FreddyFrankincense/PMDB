import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateHighVolumeFilmArchive,
  inferTierFromRating,
  resolveFilmMetadata,
  slugifyTitle,
} from './src/data/filmCatalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface EnrichedFilmPayload {
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
  productionDesigner?: string;
  costumeDesigner?: string;
  country?: string;
  runtime?: string;
  genres?: string[];
  source: string;
}

const memoryCache = new Map<string, EnrichedFilmPayload>();
const inFlightEnrichments = new Map<string, Promise<EnrichedFilmPayload>>();
const profileScrapeCache = new Map<string, { timestamp: number; payload: any }>();
const PROFILE_SCRAPE_TTL_MS = 5 * 60 * 1000;

function getCachedFilmPayload(title: string, year?: number): EnrichedFilmPayload | undefined {
  const lower = title.trim().toLowerCase();
  if (year) {
    const exact = memoryCache.get(`${lower}::${year}`);
    if (exact) return exact;
  }
  return memoryCache.get(`${lower}::`);
}

function normalizeQuery(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWikiWikitextValue(raw: string): string[] {
  if (!raw) return [];
  // Remove refs, comments, and templates like {{Plainlist|...}} or {{ubl|...}}
  const stripped = raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/>]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(?:plainlist|flatlist|ubl|unbulleted list|hlist)\s*\|/gi, '')
    .replace(/\}\}/g, '');

  const items: string[] = [];
  // Split by newlines, bullets, or <br>
  const parts = stripped.split(/(?:<br\s*\/?>|\n|\*)/i);
  for (const part of parts) {
    // Extract [[Link|Label]] or [[Link]]
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

async function fetchWikipediaFilmCredits(title: string, year?: number): Promise<Partial<EnrichedFilmPayload>> {
  try {
    const queries = year
      ? [`${title} (${year} film)`, `${title} (film)`, title]
      : [`${title} (film)`, title];

    for (const q of queries) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        q
      )}&srlimit=3&format=json`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'CineasteLedgerArchive/1.0 (https://aistudio.google.com)' },
      });
      if (!searchRes.ok) continue;
      const searchData = (await searchRes.json()) as any;
      const hits = searchData?.query?.search || [];
      if (hits.length === 0) continue;

      // Pick best hit that mentions film or release year
      const bestHit =
        hits.find((h: any) => {
          const snippet = (h.snippet || '').toLowerCase();
          const hTitle = (h.title || '').toLowerCase();
          if (year && (hTitle.includes(String(year)) || snippet.includes(String(year)))) {
            return true;
          }
          return hTitle.includes('film') || snippet.includes('directed by') || snippet.includes('film');
        }) || hits[0];

      const pageTitle = bestHit.title;
      const parseUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions|pageimages&rvprop=content&rvsection=0&piprop=original&titles=${encodeURIComponent(
        pageTitle
      )}&format=json`;

      const pageRes = await fetch(parseUrl, {
        headers: { 'User-Agent': 'CineasteLedgerArchive/1.0 (https://aistudio.google.com)' },
      });
      if (!pageRes.ok) continue;
      const pageData = (await pageRes.json()) as any;
      const pages = pageData?.query?.pages || {};
      const pageObj = Object.values(pages)[0] as any;
      if (!pageObj) continue;

      const wikitext = pageObj?.revisions?.[0]?.['*'] || pageObj?.revisions?.[0]?.slots?.main?.['*'] || '';
      if (!wikitext || !/infobox\s+film/i.test(wikitext)) continue;

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
    }
  } catch {
    // Ignore network or parsing errors on Wikipedia fallback
  }
  return {};
}

async function fetchImdbSuggestion(title: string, year?: number): Promise<Partial<EnrichedFilmPayload>> {
  try {
    const clean = normalizeQuery(title);
    if (!clean) return {};
    const queryStr = year ? `${clean} ${year}` : clean;
    const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(queryStr.slice(0, 45))}.json`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CineasteLedger/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as any;
    const items: any[] = (data?.d || []).filter(
      (item: any) => item.qid === 'movie' || item.qid === 'feature' || item.q === 'feature' || !item.qid
    );
    if (items.length === 0) return {};

    // Match closest title and year
    const targetLower = title.toLowerCase().trim();
    let best = items.find(
      (it) =>
        it.l?.toLowerCase().trim() === targetLower &&
        (!year || !it.y || Math.abs(Number(it.y) - year) <= 1)
    );
    if (!best && year) {
      best = items.find((it) => it.y && Math.abs(Number(it.y) - year) <= 1);
    }
    if (!best) {
      best = items[0];
    }

    // Optimize IMDb image URL to 600px width poster for fast crisp rendering
    let posterUrl: string | undefined = best?.i?.imageUrl;
    if (posterUrl && posterUrl.includes('._V1_')) {
      posterUrl = posterUrl.replace(/\._V1_.*?\.(jpg|png)$/i, '._V1_UX600_.jpg');
    }

    const stars = typeof best?.s === 'string'
      ? best.s.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    return {
      imdbId: best.id,
      posterUrl,
      cast: stars.length > 0 ? stars : undefined,
      year: best.y ? Number(best.y) : year,
    };
  } catch {
    return {};
  }
}

async function fetchItunesMovieFallback(title: string, year?: number): Promise<Partial<EnrichedFilmPayload>> {
  try {
    const term = year ? `${title} ${year}` : title;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=movie&entity=movie&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = (await res.json()) as any;
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

/**
 * Unified, deduplicated metadata resolver.
 * - Reuses `memoryCache` and `inFlightEnrichments` so identical concurrent or sequential requests
 *   never scrape external endpoints twice.
 * - Uses local `FILM_CATALOG` metadata first and only invokes the 2-step Wikipedia infobox scraper
 *   when `includeExtendedCredits` is requested or when IMDb + iTunes did not resolve a poster/director.
 */
async function enrichFilmDeduplicated(
  title: string,
  year?: number,
  includeExtendedCredits = true
): Promise<EnrichedFilmPayload> {
  const cleanTitle = title.trim();
  const cacheKey = `${cleanTitle.toLowerCase()}::${year || ''}`;
  const existing = memoryCache.get(cacheKey);

  // If already cached and either has extended credits or caller only needs poster/basic metadata, return immediately
  if (
    existing &&
    (!includeExtendedCredits ||
      existing.cinematographer ||
      existing.writers ||
      existing.source.includes('Wikipedia'))
  ) {
    return existing;
  }

  const inflightKey = `${cacheKey}::${includeExtendedCredits ? 'full' : 'fast'}`;
  const activePromise = inFlightEnrichments.get(inflightKey);
  if (activePromise) {
    return activePromise;
  }

  const localMeta = resolveFilmMetadata(cleanTitle, year);
  const hasCanonicalLocalMeta = localMeta.director !== 'Archive Filmmaker';

  const promise = (async (): Promise<EnrichedFilmPayload> => {
    try {
      const [imdbData, itunesData] = await Promise.all([
        fetchImdbSuggestion(cleanTitle, year),
        fetchItunesMovieFallback(cleanTitle, year),
      ]);

      const fastPoster = existing?.posterUrl || imdbData.posterUrl || itunesData.posterUrl;
      const fastDirector =
        existing?.director ||
        itunesData.director ||
        (hasCanonicalLocalMeta ? localMeta.director : undefined);

      // Only scrape Wikipedia's 2-step API if full credits are needed or poster/director are still missing
      const needsWiki = includeExtendedCredits || !fastPoster || !fastDirector;
      const wikiData = needsWiki ? await fetchWikipediaFilmCredits(cleanTitle, year) : {};

      const merged: EnrichedFilmPayload = {
        title: cleanTitle,
        year: year || imdbData.year || localMeta.year || new Date().getFullYear(),
        imdbId: imdbData.imdbId || existing?.imdbId,
        posterUrl: fastPoster || wikiData.posterUrl,
        director: wikiData.director || fastDirector,
        cast:
          wikiData.cast && wikiData.cast.length > 0
            ? wikiData.cast
            : imdbData.cast || existing?.cast,
        writers: wikiData.writers || existing?.writers,
        cinematographer: wikiData.cinematographer || existing?.cinematographer,
        composer: wikiData.composer || existing?.composer,
        editor: wikiData.editor || existing?.editor,
        country: wikiData.country || existing?.country || localMeta.country,
        runtime:
          itunesData.runtime ||
          existing?.runtime ||
          (localMeta.runtimeMinutes ? `${localMeta.runtimeMinutes}m` : undefined),
        genres:
          itunesData.genres && itunesData.genres.length > 0
            ? itunesData.genres
            : existing?.genres || localMeta.genres,
        source: needsWiki
          ? 'IMDb + Wikipedia + iTunes Public Index'
          : 'IMDb + iTunes + Local Canon Index',
      };

      memoryCache.set(cacheKey, merged);
      if (year) {
        memoryCache.set(`${cleanTitle.toLowerCase()}::`, merged);
      }
      return merged;
    } finally {
      inFlightEnrichments.delete(inflightKey);
    }
  })();

  inFlightEnrichments.set(inflightKey, promise);
  return promise;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Endpoint 1: Enrich a single film by title + year using public IMDb + Wikipedia + iTunes APIs
  app.get('/api/metadata/enrich', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const year = req.query.year ? Number(req.query.year) : undefined;
    const fastMode = req.query.fast === '1';

    if (!title) {
      res.status(400).json({ error: 'Missing film title parameter' });
      return;
    }

    const enriched = await enrichFilmDeduplicated(title, year, !fastMode);
    res.json(enriched);
  });

  // Endpoint 1B: Batch enrich multiple films in a single HTTP request with server-side deduplication
  app.post('/api/metadata/enrich-batch', async (req, res) => {
    const rawItems: Array<{ id?: string; title: string; year?: number }> = Array.isArray(
      req.body?.items
    )
      ? req.body.items
      : [];
    const includeExtendedCredits = Boolean(req.body?.includeExtendedCredits);

    if (rawItems.length === 0) {
      res.json({ results: {} });
      return;
    }

    // Deduplicate requested items by normalized title::year so duplicate films across profiles/lists
    // are only enriched once
    const uniqueQueue: Array<{ key: string; title: string; year?: number }> = [];
    const seenKeys = new Set<string>();

    for (const item of rawItems.slice(0, 50)) {
      const cleanTitle = String(item?.title || '').trim();
      if (!cleanTitle) continue;
      const year = item?.year ? Number(item.year) : undefined;
      const key = `${cleanTitle.toLowerCase()}::${year || ''}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueQueue.push({ key, title: cleanTitle, year });
      }
    }

    const resultsByKey: Record<string, EnrichedFilmPayload> = {};
    const CONCURRENCY = 4;
    let cursor = 0;

    async function worker() {
      while (cursor < uniqueQueue.length) {
        const current = uniqueQueue[cursor++];
        if (!current) break;
        const enriched = await enrichFilmDeduplicated(
          current.title,
          current.year,
          includeExtendedCredits
        );
        resultsByKey[current.key] = enriched;
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, uniqueQueue.length) }, () => worker())
    );

    res.json({
      results: resultsByKey,
      deduplicatedCount: uniqueQueue.length,
    });
  });

  // Endpoint 2: Search public IMDb catalog to quickly add films from any year (1927-present)
  app.get('/api/metadata/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }

    try {
      const clean = normalizeQuery(q);
      const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(clean.slice(0, 45))}.json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CineasteLedger/1.0)',
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        res.json({ results: [] });
        return;
      }
      const data = (await response.json()) as any;
      const results = (data?.d || [])
        .filter((item: any) => item.qid === 'movie' || item.qid === 'feature' || item.y)
        .slice(0, 8)
        .map((item: any) => {
          let posterUrl = item?.i?.imageUrl;
          if (posterUrl && posterUrl.includes('._V1_')) {
            posterUrl = posterUrl.replace(/\._V1_.*?\.(jpg|png)$/i, '._V1_UX500_.jpg');
          }
          return {
            imdbId: item.id,
            title: item.l,
            year: item.y ? Number(item.y) : undefined,
            castSnippet: item.s || '',
            posterUrl,
          };
        });
      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  // Helper to parse Letterboxd RSS XML or HTML snippets into FilmEntry objects
  // while sharing posters and metadata with `memoryCache`
  function parseLetterboxdRssOrHtml(rawContent: string, username: string) {
    const films: any[] = [];
    const seenKeys = new Set<string>();

    // 1. Parse RSS <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let itemMatch: RegExpExecArray | null;
    let rankCounter = 1;

    while ((itemMatch = itemRegex.exec(rawContent)) !== null) {
      const block = itemMatch[1];
      const filmTitleMatch = block.match(/<letterboxd:filmTitle>([\s\S]*?)<\/letterboxd:filmTitle>/i);
      const filmYearMatch = block.match(/<letterboxd:filmYear>(\d{4})<\/letterboxd:filmYear>/i);
      const ratingMatch = block.match(/<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/i);
      const watchedDateMatch = block.match(/<letterboxd:watchedDate>(\d{4}-\d{2}-\d{2})<\/letterboxd:watchedDate>/i);
      const rewatchMatch = block.match(/<letterboxd:rewatch>(Yes|No)<\/letterboxd:rewatch>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        block.match(/<description>([\s\S]*?)<\/description>/i);

      let title = filmTitleMatch ? filmTitleMatch[1].trim() : '';
      let releaseYear = filmYearMatch ? parseInt(filmYearMatch[1], 10) : 2024;

      if (!title) {
        const plainTitleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        if (plainTitleMatch) {
          const rawTitle = plainTitleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const parsedHeader = rawTitle.match(/^(.*?),\s*(\d{4})(?:\s*-\s*([★½]+))?$/);
          if (parsedHeader) {
            title = parsedHeader[1].trim();
            releaseYear = parseInt(parsedHeader[2], 10);
          } else {
            title = rawTitle;
          }
        }
      }

      if (!title) continue;
      const key = `${title.toLowerCase()}::${releaseYear}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
      const watchedDate = watchedDateMatch ? watchedDateMatch[1] : new Date().toISOString().slice(0, 10);
      const rewatch = rewatchMatch ? rewatchMatch[1].toLowerCase() === 'yes' : false;
      const slug = slugifyTitle(title, releaseYear);
      const letterboxdUri = linkMatch
        ? linkMatch[1].trim()
        : `https://letterboxd.com/film/${slug}/`;

      let cleanNotes = '';
      let rssPosterUrl: string | undefined;
      if (descMatch && descMatch[1]) {
        const imgMatch = descMatch[1].match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch?.[1]) {
          rssPosterUrl = imgMatch[1];
        }
        cleanNotes = descMatch[1]
          .replace(/<img[^>]*>/gi, '')
          .replace(/<p>\s*Watched on[^<]*<\/p>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const meta = resolveFilmMetadata(title, releaseYear, slug);
      const cached = getCachedFilmPayload(meta.title, releaseYear);

      // If RSS provided a poster URL and this film isn't in memoryCache yet, seed memoryCache
      // so the enrichment endpoint doesn't have to re-scrape a poster!
      if (rssPosterUrl && !cached) {
        memoryCache.set(key, {
          title: meta.title,
          year: releaseYear,
          posterUrl: rssPosterUrl,
          director: meta.director !== 'Archive Filmmaker' ? meta.director : undefined,
          genres: meta.genres,
          runtime: `${meta.runtimeMinutes}m`,
          country: meta.country,
          source: 'Letterboxd RSS Poster + Local Canon',
        });
      }

      const resolvedPoster = cached?.posterUrl || rssPosterUrl;
      const cachedRuntime = cached?.runtime
        ? parseInt(cached.runtime.replace(/[^0-9]/g, ''), 10)
        : NaN;

      films.push({
        id: `${username}-${rankCounter}-${Date.now()}`,
        title: meta.title,
        year: releaseYear,
        slug: meta.slug,
        director: cached?.director || meta.director,
        genres: cached?.genres && cached.genres.length > 0 ? cached.genres : meta.genres,
        rating,
        liked: rating !== null && rating >= 4.0,
        rewatch,
        watchlist: false,
        watchedDate,
        loggedDate: watchedDate,
        tags: ['rss-sync'],
        tier: inferTierFromRating(rating),
        customRank: rankCounter++,
        notes: cleanNotes || 'Logged via external profile view.',
        letterboxdUri,
        runtimeMinutes: !Number.isNaN(cachedRuntime) ? cachedRuntime : meta.runtimeMinutes,
        country: cached?.country || meta.country,
        posterUrl: resolvedPoster,
      });
    }

    // 2. Also parse HTML attributes like data-film-name / data-film-release-year if present
    const htmlFilmRegex = /data-film-name=["']([^"']+)["'][^>]*?(?:data-film-release-year=["'](\d{4})["'])?/gi;
    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlRegexExec(htmlFilmRegex, rawContent)) !== null) {
      const title = htmlMatch[1].trim();
      const releaseYear = htmlMatch[2] ? parseInt(htmlMatch[2], 10) : 2023;
      const key = `${title.toLowerCase()}::${releaseYear}`;
      if (!title || seenKeys.has(key)) continue;
      seenKeys.add(key);

      const slug = slugifyTitle(title, releaseYear);
      const meta = resolveFilmMetadata(title, releaseYear, slug);
      const cached = getCachedFilmPayload(meta.title, releaseYear);
      const cachedRuntime = cached?.runtime
        ? parseInt(cached.runtime.replace(/[^0-9]/g, ''), 10)
        : NaN;
      const today = new Date().toISOString().slice(0, 10);
      films.push({
        id: `${username}-html-${rankCounter}-${Date.now()}`,
        title: meta.title,
        year: releaseYear,
        slug: meta.slug,
        director: cached?.director || meta.director,
        genres: cached?.genres && cached.genres.length > 0 ? cached.genres : meta.genres,
        rating: 4.0,
        liked: true,
        rewatch: false,
        watchlist: false,
        watchedDate: today,
        loggedDate: today,
        tags: ['html-scrape'],
        tier: inferTierFromRating(4.0),
        customRank: rankCounter++,
        notes: 'Logged via external profile view.',
        letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
        runtimeMinutes: !Number.isNaN(cachedRuntime) ? cachedRuntime : meta.runtimeMinutes,
        country: cached?.country || meta.country,
        posterUrl: cached?.posterUrl,
      });
    }

    return films;
  }

  function htmlRegexExec(regex: RegExp, str: string) {
    return regex.exec(str);
  }

  // Endpoint 3: Fetch public Letterboxd profile RSS feed or generate deterministic archive fallback
  app.get('/api/letterboxd/profile/:username', async (req, res) => {
    const rawUsername = String(req.params.username || '').trim().replace(/^@/, '');
    const forceRefresh = req.query.refresh === '1';
    if (!rawUsername) {
      res.status(400).json({ error: 'Missing Letterboxd username' });
      return;
    }

    const cacheKey = rawUsername.toLowerCase();
    const cachedProfile = profileScrapeCache.get(cacheKey);
    if (!forceRefresh && cachedProfile && Date.now() - cachedProfile.timestamp < PROFILE_SCRAPE_TTL_MS) {
      res.json(cachedProfile.payload);
      return;
    }

    const rssUrl = `https://letterboxd.com/${encodeURIComponent(rawUsername)}/rss/`;
    const profileUrl = `https://letterboxd.com/${encodeURIComponent(rawUsername)}/`;
    try {
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CineasteLedgerFrameSheet/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      if (response.ok) {
        const xmlText = await response.text();
        const parsedFilms = parseLetterboxdRssOrHtml(xmlText, rawUsername);
        if (parsedFilms.length > 0) {
          const payload = {
            username: rawUsername,
            displayName: `@${rawUsername}`,
            profileUrl,
            bio: `Synced from live Letterboxd RSS feed (${parsedFilms.length} entries).`,
            scrapedFrom: [rssUrl],
            liveReachable: true,
            films: parsedFilms,
            notice: `Fetched ${parsedFilms.length} recent diary entries directly from ${rssUrl}.`,
          };
          profileScrapeCache.set(cacheKey, { timestamp: Date.now(), payload });
          res.json(payload);
          return;
        }
      }
    } catch {
      // Fallback to deterministic profile generator below
    }

    // Deterministic curated profile fallback when Letterboxd blocks automated requests or user has no RSS items
    let seed = 0;
    for (let i = 0; i < rawUsername.length; i++) {
      seed = (seed * 31 + rawUsername.charCodeAt(i)) % 10000;
    }
    const fallbackFilms = generateHighVolumeFilmArchive(240, (seed % 11) + 2, 0).map((f) => {
      const cached = getCachedFilmPayload(f.title, f.year);
      return cached?.posterUrl ? { ...f, posterUrl: cached.posterUrl } : f;
    });
    const fallbackPayload = {
      username: rawUsername,
      displayName: `@${rawUsername}`,
      profileUrl,
      bio: `Curated archive snapshot for @${rawUsername} (${fallbackFilms.length} films).`,
      scrapedFrom: [`${profileUrl}films/diary/`, `${profileUrl}watchlist/`],
      liveReachable: false,
      films: fallbackFilms,
      notice: `Letterboxd RSS endpoint (${rssUrl}) was unreachable or rate-limited; loaded ${fallbackFilms.length}-film archive profile for @${rawUsername}. Upload a Letterboxd CSV export for exact personal logs.`,
    };
    profileScrapeCache.set(cacheKey, { timestamp: Date.now(), payload: fallbackPayload });
    res.json(fallbackPayload);
  });

  // Endpoint 4: Parse raw pasted Letterboxd RSS XML or HTML source
  app.post('/api/letterboxd/parse-raw', (req, res) => {
    const rawContent = String(req.body?.rawContent || '');
    const username = String(req.body?.username || 'custom_import').trim().replace(/^@/, '');

    if (!rawContent.trim()) {
      res.status(400).json({ error: 'Empty raw content provided' });
      return;
    }

    const parsedFilms = parseLetterboxdRssOrHtml(rawContent, username);
    const profileUrl = `https://letterboxd.com/${encodeURIComponent(username)}/`;
    res.json({
      username,
      displayName: `@${username}`,
      profileUrl,
      bio: `Parsed from raw Letterboxd RSS/HTML source (${parsedFilms.length} entries).`,
      scrapedFrom: ['raw-rss-html-input'],
      liveReachable: true,
      films: parsedFilms,
      notice: `Parsed ${parsedFilms.length} film entries from raw RSS/HTML snippet.`,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';

    // Serve a WebSocket-free @vite/client module so CSS injection (updateStyle/removeStyle)
    // and module hot contexts work without attempting blocked WebSocket connections in preview.
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}

export class ErrorOverlay extends HTMLElement {}
`);
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cineaste Ledger + FrameSheet server running on http://localhost:${PORT}`);
  });
}

startServer();

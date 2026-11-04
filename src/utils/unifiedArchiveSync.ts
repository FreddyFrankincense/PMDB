import {
  FILM_CATALOG,
  inferTierFromRating,
  resolveFilmMetadata,
  slugifyTitle,
} from '../data/filmCatalog';
import { CineasteArchiveState, FilmRecord } from '../types/cinema';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import { makeFilmId } from './letterboxdCsvParser';

const CANONICAL_TITLES_SET = new Set(
  FILM_CATALOG.map((f) => f.title.toLowerCase())
);

/**
 * Detects whether a title is one of the synthetic high-volume filler titles
 * (e.g. "The Silent Harbor 2") vs. a real canonical, imported, or user-added film.
 */
export function isSyntheticHighVolumeTitle(title: string): boolean {
  const lower = title.trim().toLowerCase();
  if (CANONICAL_TITLES_SET.has(lower)) return false;
  return /^the\s+[a-z]+\s+[a-z]+(\s+\d+)?$/i.test(title.trim());
}

export function filmRecordToFilmEntry(
  record: FilmRecord,
  existing?: FilmEntry,
  fallbackRank?: number
): FilmEntry {
  const meta = resolveFilmMetadata(record.title, record.year);
  const runtimeParsed = record.metadata?.runtime
    ? parseInt(record.metadata.runtime.replace(/[^0-9]/g, ''), 10)
    : NaN;
  const runtimeMinutes = !Number.isNaN(runtimeParsed)
    ? runtimeParsed
    : existing?.runtimeMinutes || meta.runtimeMinutes;

  const rating =
    'rating' in record ? (record.rating ?? null) : existing?.rating ?? null;
  const isWatchlist =
    record.tags?.includes('letterboxd-watchlist') ??
    existing?.watchlist ??
    false;

  const recordSlug = record.letterboxdUri?.match(/\/film\/([^/"'?#]+)/i)?.[1];

  return {
    id: existing?.id || record.id,
    title: record.title,
    year: record.year,
    letterboxdUri:
      record.letterboxdUri ||
      existing?.letterboxdUri ||
      `https://letterboxd.com/film/${slugifyTitle(record.title, record.year)}/`,
    slug: existing?.slug || recordSlug || slugifyTitle(record.title, record.year),
    rating,
    watchedDate: isWatchlist
      ? null
      : record.watchedDate || existing?.watchedDate || '2026-02-15',
    loggedDate:
      record.ratedDate ||
      record.watchedDate ||
      existing?.loggedDate ||
      '2026-02-15',
    rewatch: record.rewatch ?? existing?.rewatch ?? false,
    liked:
      record.liked ??
      existing?.liked ??
      (rating !== null && rating >= 4.5),
    watchlist: isWatchlist,
    tags: record.tags || existing?.tags || [],
    genres:
      record.metadata?.genres && record.metadata.genres.length > 0
        ? record.metadata.genres
        : existing?.genres || meta.genres,
    director:
      record.metadata?.director || existing?.director || meta.director,
    runtimeMinutes,
    country: record.metadata?.country || existing?.country || meta.country,
    customRank: isWatchlist
      ? null
      : existing?.customRank ?? fallbackRank ?? null,
    tier: isWatchlist ? 'Unranked' : existing?.tier || inferTierFromRating(rating),
    notes:
      record.review !== undefined ? record.review : existing?.notes || '',
    posterUrl: record.metadata?.posterUrl || existing?.posterUrl,
  };
}

export function filmEntryToFilmRecord(
  entry: FilmEntry,
  existing?: FilmRecord
): FilmRecord {
  const id = existing?.id || makeFilmId(entry.title, entry.year);
  const baseTags = (entry.tags || []).filter((t) => t !== 'letterboxd-watchlist');
  const syncedTags = entry.watchlist
    ? ['letterboxd-watchlist', ...baseTags]
    : baseTags;

  const isPlaceholderNote =
    !entry.notes ||
    entry.notes === 'Logged via external profile view.' ||
    entry.notes === 'Scraped from public Letterboxd profile.' ||
    entry.notes === 'Imported in Standalone Desktop Mode.';

  const resolvedReview = !isPlaceholderNote
    ? entry.notes
    : existing?.review;

  return {
    id,
    title: entry.title,
    year: entry.year,
    letterboxdUri: entry.letterboxdUri || existing?.letterboxdUri,
    rating: entry.rating !== null ? entry.rating : existing?.rating,
    liked: entry.liked ?? existing?.liked,
    rewatch: entry.rewatch ?? existing?.rewatch,
    watchedDate: entry.watchlist ? undefined : entry.watchedDate || existing?.watchedDate,
    ratedDate: entry.loggedDate || existing?.ratedDate,
    review: resolvedReview,
    tags: syncedTags,
    listIds: existing?.listIds || [],
    metadata: {
      ...(existing?.metadata || {}),
      posterUrl: entry.posterUrl || existing?.metadata?.posterUrl,
      director:
        entry.director && entry.director !== 'Archive Filmmaker'
          ? entry.director
          : existing?.metadata?.director || entry.director,
      genres:
        entry.genres && entry.genres.length > 0
          ? entry.genres
          : existing?.metadata?.genres,
      country: entry.country || existing?.metadata?.country,
      runtime: entry.runtimeMinutes
        ? `${entry.runtimeMinutes}m`
        : existing?.metadata?.runtime,
    },
  };
}

export function normalizeFilmMatchKey(title: string, year: number): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleanTitle}::${year}`;
}

/**
 * Syncs Cineaste Ledger's FilmRecord dictionary into a FrameSheet ProfileAccount
 * so any film added/edited in Catalog, Rankings, or Oscar Ballots appears in FrameSheet.
 */
export function syncArchiveIntoProfile(
  archive: CineasteArchiveState,
  profile: ProfileAccount
): ProfileAccount {
  const existingById = new Map<string, number>();
  const existingBySlug = new Map<string, number>();
  const existingByKey = new Map<string, number>();
  const updatedFilms = [...profile.films];

  updatedFilms.forEach((f, idx) => {
    existingById.set(f.id, idx);
    if (f.slug) {
      existingBySlug.set(`slug::${f.slug.toLowerCase()}`, idx);
    }
    const key = normalizeFilmMatchKey(f.title, f.year);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, idx);
    }
  });

  const claimedIndices = new Set<number>();
  const newEntries: FilmEntry[] = [];

  for (const record of Object.values(archive.films)) {
    const recSlug = record.letterboxdUri?.match(/\/film\/([^/"'?#]+)/i)?.[1];
    const slugKey = recSlug ? `slug::${recSlug.toLowerCase()}` : undefined;
    const key = normalizeFilmMatchKey(record.title, record.year);

    let matchIdx =
      existingById.get(record.id) ??
      (slugKey ? existingBySlug.get(slugKey) : undefined);

    if (matchIdx === undefined) {
      const candidateIdx = existingByKey.get(key);
      if (candidateIdx !== undefined && !claimedIndices.has(candidateIdx)) {
        const candidateEntry = updatedFilms[candidateIdx];
        const candidateSlug = candidateEntry?.slug?.toLowerCase();
        if (!recSlug || !candidateSlug || recSlug.toLowerCase() === candidateSlug) {
          matchIdx = candidateIdx;
        }
      }
    }

    if (matchIdx !== undefined && !claimedIndices.has(matchIdx)) {
      claimedIndices.add(matchIdx);
      updatedFilms[matchIdx] = filmRecordToFilmEntry(
        record,
        updatedFilms[matchIdx]
      );
    } else {
      newEntries.push(
        filmRecordToFilmEntry(record, undefined, updatedFilms.length + newEntries.length + 1)
      );
    }
  }

  return {
    ...profile,
    films: [...newEntries, ...updatedFilms],
  };
}

/**
 * Propagates enriched poster URLs and production credits from `archive.films`
 * into ALL loaded `ProfileAccount` entries so no film is ever scraped twice across profiles.
 */
export function propagateMetadataAcrossAllProfiles(
  archive: CineasteArchiveState,
  profiles: ProfileAccount[]
): ProfileAccount[] {
  const metaByKey = new Map<string, FilmRecord>();
  for (const rec of Object.values(archive.films)) {
    if (rec.metadata?.posterUrl || rec.metadata?.director) {
      metaByKey.set(normalizeFilmMatchKey(rec.title, rec.year), rec);
    }
  }

  if (metaByKey.size === 0) return profiles;

  return profiles.map((prof) => {
    let changed = false;
    const nextFilms = prof.films.map((f) => {
      const rec = metaByKey.get(normalizeFilmMatchKey(f.title, f.year));
      if (!rec || !rec.metadata) return f;

      const nextPoster = rec.metadata.posterUrl || f.posterUrl;
      const nextDirector =
        rec.metadata.director &&
        (f.director === 'Archive Filmmaker' || !f.director)
          ? rec.metadata.director
          : f.director;
      const nextCountry =
        rec.metadata.country && (!f.country || f.country === 'International')
          ? rec.metadata.country
          : f.country;

      if (
        nextPoster !== f.posterUrl ||
        nextDirector !== f.director ||
        nextCountry !== f.country
      ) {
        changed = true;
        return {
          ...f,
          posterUrl: nextPoster,
          director: nextDirector,
          country: nextCountry,
        };
      }
      return f;
    });

    return changed ? { ...prof, films: nextFilms } : prof;
  });
}

/**
 * Syncs edits, additions, and deletions from a FrameSheet ProfileAccount back into CineasteArchiveState.
 */
export function syncProfileFilmsIntoArchive(
  profileFilms: FilmEntry[],
  archive: CineasteArchiveState,
  pruneDeleted = false
): CineasteArchiveState {
  const nextFilms: Record<string, FilmRecord> = { ...archive.films };

  // Build lookup by slug and normalized title::year for existing archive records
  const archiveKeyToId = new Map<string, string>();
  for (const rec of Object.values(nextFilms)) {
    const recSlug = rec.letterboxdUri?.match(/\/film\/([^/"'?#]+)/i)?.[1];
    if (recSlug) {
      archiveKeyToId.set(`slug::${recSlug.toLowerCase()}`, rec.id);
    }
    const titleKey = normalizeFilmMatchKey(rec.title, rec.year);
    if (!archiveKeyToId.has(titleKey)) {
      archiveKeyToId.set(titleKey, rec.id);
    }
  }

  const seenArchiveIds = new Set<string>();

  for (const entry of profileFilms) {
    const key = normalizeFilmMatchKey(entry.title, entry.year);
    const slugKey = entry.slug ? `slug::${entry.slug.toLowerCase()}` : key;
    let existingId =
      archiveKeyToId.get(slugKey) ||
      archiveKeyToId.get(key) ||
      makeFilmId(entry.title, entry.year);

    // If another distinct film in the same profile crawl already claimed this title::year ID, disambiguate by slug
    if (seenArchiveIds.has(existingId) && entry.slug) {
      const existingRec = nextFilms[existingId];
      const existingSlugMatch = existingRec?.letterboxdUri?.match(/\/film\/([^/"'?#]+)/i)?.[1];
      if (
        existingSlugMatch &&
        existingSlugMatch.toLowerCase() !== entry.slug.toLowerCase()
      ) {
        existingId = makeFilmId(entry.slug, entry.year);
      }
    }

    const existingRecord = nextFilms[existingId];

    // Sync if it already exists in archive, OR is a canonical film, OR is a user-added/imported/scraped film
    const shouldIncludeInCatalog =
      Boolean(existingRecord) ||
      !isSyntheticHighVolumeTitle(entry.title) ||
      entry.tags.includes('manual-entry') ||
      entry.tags.includes('rss-sync') ||
      entry.tags.includes('html-scrape') ||
      entry.tags.includes('framesheet-recommended');

    if (shouldIncludeInCatalog) {
      nextFilms[existingId] = filmEntryToFilmRecord(entry, existingRecord);
      archiveKeyToId.set(slugKey, existingId);
      if (!archiveKeyToId.has(key)) {
        archiveKeyToId.set(key, existingId);
      }
      seenArchiveIds.add(existingId);
    }
  }

  if (pruneDeleted) {
    // Preserve any film still referenced by Yearly Rankings, Oscar Ballots, or Curated Lists
    const protectedIds = new Set<string>();
    for (const yr of Object.values(archive.yearlyRankings)) {
      for (const e of yr.entries) protectedIds.add(e.filmId);
    }
    for (const ballot of Object.values(archive.oscarBallots)) {
      for (const cat of Object.values(ballot.categories || {})) {
        for (const nom of cat.nominees) protectedIds.add(nom.filmId);
      }
    }
    for (const list of archive.lists) {
      for (const e of list.entries) protectedIds.add(e.filmId);
    }

    for (const id of Object.keys(nextFilms)) {
      if (!seenArchiveIds.has(id) && !protectedIds.has(id)) {
        delete nextFilms[id];
      }
    }
  }

  return {
    ...archive,
    films: nextFilms,
  };
}

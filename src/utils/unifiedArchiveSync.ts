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
    record.rating !== undefined ? record.rating : existing?.rating ?? null;
  const isWatchlist =
    existing?.watchlist ??
    (record.tags?.includes('letterboxd-watchlist') || false);

  return {
    id: existing?.id || record.id,
    title: record.title,
    year: record.year,
    letterboxdUri:
      record.letterboxdUri ||
      existing?.letterboxdUri ||
      `https://letterboxd.com/film/${slugifyTitle(record.title, record.year)}/`,
    slug: existing?.slug || slugifyTitle(record.title, record.year),
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
  return {
    id,
    title: entry.title,
    year: entry.year,
    letterboxdUri: entry.letterboxdUri || existing?.letterboxdUri,
    rating: entry.rating,
    liked: entry.liked,
    rewatch: entry.rewatch,
    watchedDate: entry.watchedDate || existing?.watchedDate,
    ratedDate: entry.loggedDate || existing?.ratedDate,
    review: entry.notes || existing?.review,
    tags: entry.tags,
    listIds: existing?.listIds || [],
    metadata: {
      ...(existing?.metadata || {}),
      posterUrl: entry.posterUrl || existing?.metadata?.posterUrl,
      director: entry.director || existing?.metadata?.director,
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

/**
 * Syncs Cineaste Ledger's FilmRecord dictionary into a FrameSheet ProfileAccount
 * so any film added/edited in Catalog, Rankings, or Oscar Ballots appears in FrameSheet.
 */
export function syncArchiveIntoProfile(
  archive: CineasteArchiveState,
  profile: ProfileAccount
): ProfileAccount {
  const existingByKey = new Map<string, number>();
  const updatedFilms = [...profile.films];

  updatedFilms.forEach((f, idx) => {
    existingByKey.set(`${f.title.trim().toLowerCase()}::${f.year}`, idx);
  });

  const newEntries: FilmEntry[] = [];

  for (const record of Object.values(archive.films)) {
    const key = `${record.title.trim().toLowerCase()}::${record.year}`;
    const matchIdx = existingByKey.get(key);
    if (matchIdx !== undefined) {
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
 * Syncs edits and additions from a FrameSheet ProfileAccount back into CineasteArchiveState.
 */
export function syncProfileFilmsIntoArchive(
  profileFilms: FilmEntry[],
  archive: CineasteArchiveState
): CineasteArchiveState {
  const nextFilms: Record<string, FilmRecord> = { ...archive.films };

  // Build lookup by title::year for existing archive records
  const archiveKeyToId = new Map<string, string>();
  for (const rec of Object.values(nextFilms)) {
    archiveKeyToId.set(`${rec.title.trim().toLowerCase()}::${rec.year}`, rec.id);
  }

  for (const entry of profileFilms) {
    const key = `${entry.title.trim().toLowerCase()}::${entry.year}`;
    const existingId = archiveKeyToId.get(key) || makeFilmId(entry.title, entry.year);
    const existingRecord = nextFilms[existingId];

    // Sync if it already exists in archive, OR is a canonical film, OR is a user-added/imported film
    const shouldIncludeInCatalog =
      Boolean(existingRecord) ||
      !isSyntheticHighVolumeTitle(entry.title) ||
      entry.tags.includes('manual-entry') ||
      entry.tags.includes('framesheet-recommended');

    if (shouldIncludeInCatalog) {
      nextFilms[existingId] = filmEntryToFilmRecord(entry, existingRecord);
    }
  }

  return {
    ...archive,
    films: nextFilms,
  };
}

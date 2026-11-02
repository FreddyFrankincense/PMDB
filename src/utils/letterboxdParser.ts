import { inferTierFromRating, resolveFilmMetadata } from '../data/filmCatalog';
import {
  FilmEntry,
  ImportedCsvStructure,
  LetterboxdCsvPreset,
} from '../types/letterboxd';
import { parseCsvRows } from './letterboxdCsvParser';

export const LETTERBOXD_CSV_HEADERS: Record<
  Exclude<LetterboxdCsvPreset, 'custom'>,
  string[]
> = {
  diary: [
    'Date',
    'Name',
    'Year',
    'Letterboxd URI',
    'Rating',
    'Rewatch',
    'Tags',
    'Watched Date',
  ],
  reviews: [
    'Date',
    'Name',
    'Year',
    'Letterboxd URI',
    'Rating',
    'Rewatch',
    'Review',
    'Tags',
    'Watched Date',
  ],
  ratings: ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'],
  watched: ['Date', 'Name', 'Year', 'Letterboxd URI'],
  watchlist: ['Date', 'Name', 'Year', 'Letterboxd URI'],
};

export function extractImportedCsvStructure(
  files: { filename: string; content: string }[]
): ImportedCsvStructure {
  const primary = files[0];
  if (!primary) {
    return {
      preset: 'diary',
      headers: LETTERBOXD_CSV_HEADERS.diary,
      filename: 'diary.csv',
      dateOrder: 'desc',
      useFixedOneDecimalRating: false,
    };
  }

  const rows = parseCsvRows(primary.content);
  const rawHeaders = rows[0] || LETTERBOXD_CSV_HEADERS.diary;
  const lowerFilename = primary.filename.toLowerCase();
  const lowerHeaders = rawHeaders.map((h) => h.toLowerCase().trim());

  let preset: LetterboxdCsvPreset = 'diary';
  if (lowerFilename.includes('watchlist')) {
    preset = 'watchlist';
  } else if (lowerFilename.includes('review') || lowerHeaders.includes('review')) {
    preset = 'reviews';
  } else if (lowerFilename.includes('rating') && !lowerHeaders.includes('watched date')) {
    preset = 'ratings';
  } else if (lowerFilename.includes('watched') && !lowerHeaders.includes('rating')) {
    preset = 'watched';
  } else if (lowerHeaders.includes('watched date')) {
    preset = 'diary';
  } else {
    preset = 'custom';
  }

  return {
    preset,
    headers: rawHeaders,
    filename: primary.filename || `${preset}.csv`,
    dateOrder: 'desc',
    useFixedOneDecimalRating: false,
  };
}

export function parseLetterboxdCsvFiles(
  files: { filename: string; content: string }[]
): FilmEntry[] {
  const filmMap = new Map<string, FilmEntry>();

  for (const file of files) {
    const rows = parseCsvRows(file.content);
    if (rows.length < 2) continue;

    const isWatchlistFile = file.filename.toLowerCase().includes('watchlist');
    const headers = rows[0].map((h) => h.toLowerCase().trim());

    const nameIdx = headers.findIndex(
      (h) => h === 'name' || h === 'title' || h === 'film'
    );
    const yearIdx = headers.findIndex(
      (h) => h === 'year' || h === 'release year'
    );
    const uriIdx = headers.findIndex(
      (h) => h === 'letterboxd uri' || h === 'uri' || h === 'url'
    );
    const ratingIdx = headers.findIndex((h) => h === 'rating');
    const rewatchIdx = headers.findIndex((h) => h === 'rewatch');
    const tagsIdx = headers.findIndex((h) => h === 'tags');
    const watchedDateIdx = headers.findIndex((h) => h === 'watched date');
    const dateIdx = headers.findIndex((h) => h === 'date');
    const reviewIdx = headers.findIndex((h) => h === 'review' || h === 'notes');
    const likedIdx = headers.findIndex((h) => h === 'liked');

    if (nameIdx === -1) continue;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawTitle = row[nameIdx]?.trim();
      if (!rawTitle) continue;

      const parsedYear = yearIdx !== -1 ? parseInt(row[yearIdx], 10) : NaN;
      const meta = resolveFilmMetadata(
        rawTitle,
        !Number.isNaN(parsedYear) ? parsedYear : undefined
      );

      const key = `${meta.title.toLowerCase()}::${meta.year}`;
      const existing = filmMap.get(key);

      const rawRating =
        ratingIdx !== -1 && row[ratingIdx] ? parseFloat(row[ratingIdx]) : NaN;
      const validRating =
        !Number.isNaN(rawRating) && rawRating >= 0.5 && rawRating <= 5.0
          ? rawRating
          : null;

      const loggedDate =
        dateIdx !== -1 && row[dateIdx]
          ? row[dateIdx].slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      const watchedDate = isWatchlistFile
        ? null
        : watchedDateIdx !== -1 && row[watchedDateIdx]
        ? row[watchedDateIdx].slice(0, 10)
        : loggedDate;

      const rewatch =
        rewatchIdx !== -1 &&
        /^(yes|true|1)$/i.test((row[rewatchIdx] || '').trim());

      const tags =
        tagsIdx !== -1 && row[tagsIdx]
          ? row[tagsIdx]
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

      if (isWatchlistFile && !tags.includes('letterboxd-watchlist')) {
        tags.push('letterboxd-watchlist');
      }

      const reviewText =
        reviewIdx !== -1 && row[reviewIdx] ? row[reviewIdx].trim() : '';

      const liked =
        likedIdx !== -1
          ? /^(yes|true|1)$/i.test((row[likedIdx] || '').trim())
          : validRating !== null && validRating >= 4.5;

      const uri =
        uriIdx !== -1 && row[uriIdx]
          ? row[uriIdx]
          : `https://letterboxd.com/film/${meta.slug}/`;

      if (existing) {
        const mergedRating = validRating ?? existing.rating;
        const mergedWatchlist = isWatchlistFile
          ? existing.rating === null && !existing.watchedDate
          : false;
        filmMap.set(key, {
          ...existing,
          letterboxdUri: uri || existing.letterboxdUri,
          rating: mergedRating,
          watchedDate: watchedDate || existing.watchedDate,
          loggedDate: loggedDate || existing.loggedDate,
          rewatch: rewatch || existing.rewatch,
          liked: liked || existing.liked,
          watchlist: mergedWatchlist,
          tags: Array.from(new Set([...existing.tags, ...tags])),
          tier: mergedWatchlist ? 'Unranked' : inferTierFromRating(mergedRating),
          notes: reviewText || existing.notes,
        });
      } else {
        filmMap.set(key, {
          id: `${meta.slug}-${r}-${Date.now().toString().slice(-4)}`,
          title: meta.title,
          year: meta.year,
          letterboxdUri: uri,
          slug: meta.slug,
          rating: isWatchlistFile ? null : validRating,
          watchedDate,
          loggedDate,
          rewatch,
          liked,
          watchlist: isWatchlistFile,
          tags,
          genres: meta.genres,
          director: meta.director,
          runtimeMinutes: meta.runtimeMinutes,
          country: meta.country,
          customRank: isWatchlistFile ? null : filmMap.size + 1,
          tier: isWatchlistFile ? 'Unranked' : inferTierFromRating(validRating),
          notes:
            reviewText ||
            (isWatchlistFile
              ? `Synced from Letterboxd Watchlist (added ${loggedDate}).`
              : ''),
        });
      }
    }
  }

  // Assign customRank to logged films sorted by rating desc
  const allEntries = Array.from(filmMap.values());
  const logged = allEntries
    .filter((f) => !f.watchlist)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const rankLookup = new Map<string, number>();
  logged.forEach((f, idx) => rankLookup.set(f.id, idx + 1));

  return allEntries.map((f) => ({
    ...f,
    customRank: f.watchlist ? null : rankLookup.get(f.id) ?? null,
  }));
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function getLetterboxdExportFilename(
  preset: LetterboxdCsvPreset | 'match_imported',
  importedStructure?: ImportedCsvStructure,
  allFilteredAreWatchlist?: boolean
): string {
  if (allFilteredAreWatchlist || preset === 'watchlist') {
    return 'watchlist.csv';
  }
  if (preset === 'match_imported') {
    return importedStructure?.filename || 'diary.csv';
  }
  if (preset === 'custom') {
    return importedStructure?.filename || 'letterboxd-export.csv';
  }
  return `${preset}.csv`;
}

export function exportFilmsToCsv(
  films: FilmEntry[],
  options?: {
    preset?: LetterboxdCsvPreset | 'match_imported';
    importedStructure?: ImportedCsvStructure;
    preserveCurrentOrder?: boolean;
  }
): string {
  const preset = options?.preset ?? 'match_imported';
  const imported = options?.importedStructure;
  const allWatchlist = films.length > 0 && films.every((f) => f.watchlist);

  let headers: string[];
  if (preset === 'match_imported') {
    if (allWatchlist) {
      headers = LETTERBOXD_CSV_HEADERS.watchlist;
    } else if (imported?.headers?.length) {
      headers = imported.headers;
    } else {
      headers = LETTERBOXD_CSV_HEADERS.diary;
    }
  } else if (preset === 'custom' && imported?.headers?.length) {
    headers = imported.headers;
  } else if (preset !== 'custom') {
    headers = LETTERBOXD_CSV_HEADERS[preset];
  } else {
    headers = LETTERBOXD_CSV_HEADERS.diary;
  }

  let rowsToExport = [...films];
  if (preset === 'ratings') {
    rowsToExport = rowsToExport.filter((f) => f.rating !== null && !f.watchlist);
  } else if (preset === 'watchlist') {
    rowsToExport = rowsToExport.filter((f) => f.watchlist);
  } else if (preset === 'diary' || preset === 'watched' || preset === 'reviews') {
    rowsToExport = rowsToExport.filter((f) => !f.watchlist);
  }

  if (!options?.preserveCurrentOrder) {
    rowsToExport.sort((a, b) => {
      const dA = a.watchedDate || a.loggedDate || '';
      const dB = b.watchedDate || b.loggedDate || '';
      return dB.localeCompare(dA);
    });
  }

  const csvLines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const film of rowsToExport) {
    const rowCells = headers.map((h) => {
      const lower = h.toLowerCase().trim();
      if (lower === 'date') {
        return escapeCsvCell(
          film.loggedDate || film.watchedDate || new Date().toISOString().slice(0, 10)
        );
      }
      if (lower === 'name' || lower === 'title') {
        return escapeCsvCell(film.title);
      }
      if (lower === 'year') {
        return escapeCsvCell(film.year);
      }
      if (lower === 'letterboxd uri' || lower === 'uri' || lower === 'url') {
        return escapeCsvCell(film.letterboxdUri);
      }
      if (lower === 'rating') {
        if (film.rating === null) return '';
        const str =
          imported?.useFixedOneDecimalRating || film.rating % 1 !== 0
            ? String(film.rating)
            : String(film.rating);
        return escapeCsvCell(str);
      }
      if (lower === 'rewatch') {
        return escapeCsvCell(film.rewatch ? 'Yes' : '');
      }
      if (lower === 'tags') {
        return escapeCsvCell(film.tags.join(', '));
      }
      if (lower === 'watched date') {
        return escapeCsvCell(film.watchedDate || '');
      }
      if (lower === 'review' || lower === 'notes') {
        return escapeCsvCell(film.notes || '');
      }
      return '';
    });
    csvLines.push(rowCells.join(','));
  }

  return csvLines.join('\n');
}

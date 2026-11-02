import { FilmEntry } from '../types/letterboxd';

export type EditableFilmField =
  | 'rating'
  | 'watchedDate'
  | 'watchlist'
  | 'liked'
  | 'rewatch'
  | 'customRank'
  | 'tier'
  | 'genres'
  | 'tags'
  | 'notes';

export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

export interface FieldDeviation {
  field: EditableFilmField;
  label: string;
  baselineDisplay: string;
  currentDisplay: string;
  wordDiff?: WordDiffSegment[];
}

export interface FilmDeviationRecord {
  filmId: string;
  title: string;
  year: number;
  status: 'modified' | 'added_in_app' | 'removed_in_app';
  baselineFilm?: FilmEntry;
  currentFilm?: FilmEntry;
  fieldDeviations: FieldDeviation[];
}

export interface ProfileDeviationSummary {
  records: FilmDeviationRecord[];
  byFilmId: Map<string, FilmDeviationRecord>;
  totalDeviationCount: number;
  modifiedFilmsCount: number;
  addedFilmsCount: number;
  removedFilmsCount: number;
  reviewEditsCount: number;
  ratingEditsCount: number;
  watchlistEditsCount: number;
}

export function cloneFilmsArray(films: FilmEntry[]): FilmEntry[] {
  return films.map((f) => ({
    ...f,
    tags: [...(f.tags || [])],
    genres: [...(f.genres || [])],
  }));
}

/**
 * Word-level LCS diff algorithm to highlight exact inserted/deleted phrases
 * when comparing FrameSheet's review against the original Letterboxd baseline.
 */
export function computeWordDiff(
  baselineText: string,
  currentText: string
): WordDiffSegment[] {
  const baseTokens = (baselineText || '').split(/(\s+)/).filter((t) => t.length > 0);
  const currTokens = (currentText || '').split(/(\s+)/).filter((t) => t.length > 0);

  if (baseTokens.length === 0 && currTokens.length === 0) {
    return [];
  }
  if (baseTokens.length === 0) {
    return [{ type: 'added', text: currentText }];
  }
  if (currTokens.length === 0) {
    return [{ type: 'removed', text: baselineText }];
  }

  const m = baseTokens.length;
  const n = currTokens.length;

  // Guard for very long essays: fallback to prefix/suffix + middle diff if token count is huge
  if (m * n > 90000) {
    return [
      { type: 'removed', text: baselineText },
      { type: 'unchanged', text: ' ' },
      { type: 'added', text: currentText },
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (baseTokens[i] === currTokens[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawSegments: WordDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (baseTokens[i] === currTokens[j]) {
      rawSegments.push({ type: 'unchanged', text: baseTokens[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawSegments.push({ type: 'removed', text: baseTokens[i] });
      i++;
    } else {
      rawSegments.push({ type: 'added', text: currTokens[j] });
      j++;
    }
  }
  while (i < m) {
    rawSegments.push({ type: 'removed', text: baseTokens[i++] });
  }
  while (j < n) {
    rawSegments.push({ type: 'added', text: currTokens[j++] });
  }

  // Merge adjacent segments of the same type
  const merged: WordDiffSegment[] = [];
  for (const seg of rawSegments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

function formatFieldDisplay(field: EditableFilmField, film: FilmEntry): string {
  switch (field) {
    case 'rating':
      return film.rating !== null ? `${film.rating.toFixed(1)} ★` : 'Unrated';
    case 'watchedDate':
      return film.watchedDate || 'Undated';
    case 'watchlist':
      return film.watchlist ? 'On Watchlist' : 'Logged';
    case 'liked':
      return film.liked ? 'Liked ♥' : 'Not Liked';
    case 'rewatch':
      return film.rewatch ? 'Rewatch ↻' : 'First Watch';
    case 'customRank':
      return film.customRank !== null ? `#${film.customRank}` : 'Unranked';
    case 'tier':
      return `Tier ${film.tier}`;
    case 'genres':
      return film.genres.length > 0 ? film.genres.join(' · ') : 'None';
    case 'tags':
      return film.tags.length > 0 ? film.tags.join(', ') : 'None';
    case 'notes':
      return (film.notes || '').trim() || '(Empty Review)';
    default:
      return '';
  }
}

export function computeProfileDeviations(
  baselineFilms: FilmEntry[] | undefined,
  currentFilms: FilmEntry[]
): ProfileDeviationSummary {
  const byFilmId = new Map<string, FilmDeviationRecord>();
  const records: FilmDeviationRecord[] = [];

  if (!baselineFilms || baselineFilms.length === 0) {
    return {
      records,
      byFilmId,
      totalDeviationCount: 0,
      modifiedFilmsCount: 0,
      addedFilmsCount: 0,
      removedFilmsCount: 0,
      reviewEditsCount: 0,
      ratingEditsCount: 0,
      watchlistEditsCount: 0,
    };
  }

  const baseMap = new Map<string, FilmEntry>();
  baselineFilms.forEach((f) => baseMap.set(f.id, f));

  const currMap = new Map<string, FilmEntry>();
  currentFilms.forEach((f) => currMap.set(f.id, f));

  let totalDeviationCount = 0;
  let modifiedFilmsCount = 0;
  let addedFilmsCount = 0;
  let removedFilmsCount = 0;
  let reviewEditsCount = 0;
  let ratingEditsCount = 0;
  let watchlistEditsCount = 0;

  // 1. Check current films against baseline
  for (const curr of currentFilms) {
    const base = baseMap.get(curr.id);
    if (!base) {
      const rec: FilmDeviationRecord = {
        filmId: curr.id,
        title: curr.title,
        year: curr.year,
        status: 'added_in_app',
        currentFilm: curr,
        fieldDeviations: [],
      };
      records.push(rec);
      byFilmId.set(curr.id, rec);
      addedFilmsCount += 1;
      totalDeviationCount += 1;
      continue;
    }

    const fieldDeviations: FieldDeviation[] = [];

    if ((base.rating ?? null) !== (curr.rating ?? null)) {
      fieldDeviations.push({
        field: 'rating',
        label: 'Star Rating',
        baselineDisplay: formatFieldDisplay('rating', base),
        currentDisplay: formatFieldDisplay('rating', curr),
      });
      ratingEditsCount += 1;
    }

    if (Boolean(base.watchlist) !== Boolean(curr.watchlist)) {
      fieldDeviations.push({
        field: 'watchlist',
        label: 'Watchlist Status',
        baselineDisplay: formatFieldDisplay('watchlist', base),
        currentDisplay: formatFieldDisplay('watchlist', curr),
      });
      watchlistEditsCount += 1;
    }

    if ((base.watchedDate || null) !== (curr.watchedDate || null)) {
      fieldDeviations.push({
        field: 'watchedDate',
        label: 'Watched Date',
        baselineDisplay: formatFieldDisplay('watchedDate', base),
        currentDisplay: formatFieldDisplay('watchedDate', curr),
      });
    }

    if (Boolean(base.liked) !== Boolean(curr.liked)) {
      fieldDeviations.push({
        field: 'liked',
        label: 'Liked Flag',
        baselineDisplay: formatFieldDisplay('liked', base),
        currentDisplay: formatFieldDisplay('liked', curr),
      });
    }

    if (Boolean(base.rewatch) !== Boolean(curr.rewatch)) {
      fieldDeviations.push({
        field: 'rewatch',
        label: 'Rewatch Flag',
        baselineDisplay: formatFieldDisplay('rewatch', base),
        currentDisplay: formatFieldDisplay('rewatch', curr),
      });
    }

    if (base.tier !== curr.tier) {
      fieldDeviations.push({
        field: 'tier',
        label: 'Tier Grade',
        baselineDisplay: formatFieldDisplay('tier', base),
        currentDisplay: formatFieldDisplay('tier', curr),
      });
    }

    if ((base.customRank ?? null) !== (curr.customRank ?? null)) {
      fieldDeviations.push({
        field: 'customRank',
        label: 'Custom Rank',
        baselineDisplay: formatFieldDisplay('customRank', base),
        currentDisplay: formatFieldDisplay('customRank', curr),
      });
    }

    if ((base.genres || []).join('|') !== (curr.genres || []).join('|')) {
      fieldDeviations.push({
        field: 'genres',
        label: 'Genres',
        baselineDisplay: formatFieldDisplay('genres', base),
        currentDisplay: formatFieldDisplay('genres', curr),
      });
    }

    if ((base.tags || []).join('|') !== (curr.tags || []).join('|')) {
      fieldDeviations.push({
        field: 'tags',
        label: 'Tags',
        baselineDisplay: formatFieldDisplay('tags', base),
        currentDisplay: formatFieldDisplay('tags', curr),
      });
    }

    if ((base.notes || '').trim() !== (curr.notes || '').trim()) {
      fieldDeviations.push({
        field: 'notes',
        label: 'Review / Notes',
        baselineDisplay: formatFieldDisplay('notes', base),
        currentDisplay: formatFieldDisplay('notes', curr),
        wordDiff: computeWordDiff(
          (base.notes || '').trim(),
          (curr.notes || '').trim()
        ),
      });
      reviewEditsCount += 1;
    }

    if (fieldDeviations.length > 0) {
      const rec: FilmDeviationRecord = {
        filmId: curr.id,
        title: curr.title,
        year: curr.year,
        status: 'modified',
        baselineFilm: base,
        currentFilm: curr,
        fieldDeviations,
      };
      records.push(rec);
      byFilmId.set(curr.id, rec);
      modifiedFilmsCount += 1;
      totalDeviationCount += fieldDeviations.length;
    }
  }

  // 2. Check for baseline films that were deleted in app
  for (const base of baselineFilms) {
    if (!currMap.has(base.id)) {
      const rec: FilmDeviationRecord = {
        filmId: base.id,
        title: base.title,
        year: base.year,
        status: 'removed_in_app',
        baselineFilm: base,
        fieldDeviations: [],
      };
      records.push(rec);
      byFilmId.set(base.id, rec);
      removedFilmsCount += 1;
      totalDeviationCount += 1;
    }
  }

  return {
    records,
    byFilmId,
    totalDeviationCount,
    modifiedFilmsCount,
    addedFilmsCount,
    removedFilmsCount,
    reviewEditsCount,
    ratingEditsCount,
    watchlistEditsCount,
  };
}

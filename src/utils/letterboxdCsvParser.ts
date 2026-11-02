import {
  CineasteArchiveState,
  FilmRecord,
  LetterboxdList,
  LetterboxdListEntry,
} from '../types/cinema';

export function makeFilmId(title: string, year: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-${year || 0}`;
}

/**
 * RFC-4180 compliant multi-line CSV parser to handle Letterboxd reviews and list descriptions
 * that contain embedded commas, quotes, and line breaks.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface CsvImportSummary {
  filesProcessed: number;
  filmsAddedOrUpdated: number;
  reviewsImported: number;
  listsImported: number;
  yearsTouched: number[];
}

export function ingestLetterboxdCsvFiles(
  files: { fileName: string; content: string }[],
  existingState: CineasteArchiveState
): { nextState: CineasteArchiveState; summary: CsvImportSummary } {
  const filmsMap: Record<string, FilmRecord> = { ...existingState.films };
  const listsArr: LetterboxdList[] = [...existingState.lists];
  const yearsSet = new Set<number>();

  let filmsTouched = 0;
  let reviewsCount = 0;
  let listsCount = 0;

  const upsertFilm = (
    name: string,
    yearStr: string,
    patch: Partial<FilmRecord>
  ): FilmRecord | null => {
    const cleanTitle = name.trim();
    const parsedYear = parseInt(yearStr, 10);
    if (!cleanTitle || isNaN(parsedYear) || parsedYear < 1888 || parsedYear > 2035) {
      return null;
    }

    const id = makeFilmId(cleanTitle, parsedYear);
    yearsSet.add(parsedYear);

    const existing = filmsMap[id];
    const merged: FilmRecord = existing
      ? {
          ...existing,
          ...patch,
          rating: patch.rating !== undefined && patch.rating !== null ? patch.rating : existing.rating,
          review: patch.review ? patch.review : existing.review,
          watchedDate: patch.watchedDate || existing.watchedDate,
          ratedDate: patch.ratedDate || existing.ratedDate,
          letterboxdUri: patch.letterboxdUri || existing.letterboxdUri,
          tags:
            patch.tags && patch.tags.length > 0
              ? Array.from(new Set([...(existing.tags || []), ...patch.tags]))
              : existing.tags,
          listIds:
            patch.listIds && patch.listIds.length > 0
              ? Array.from(new Set([...existing.listIds, ...patch.listIds]))
              : existing.listIds,
          metadata: {
            ...existing.metadata,
            ...(patch.metadata || {}),
          },
        }
      : {
          id,
          title: cleanTitle,
          year: parsedYear,
          rating: patch.rating ?? null,
          liked: patch.liked ?? (patch.rating ? patch.rating >= 4.5 : false),
          rewatch: patch.rewatch ?? false,
          watchedDate: patch.watchedDate,
          ratedDate: patch.ratedDate,
          review: patch.review,
          tags: patch.tags || [],
          letterboxdUri: patch.letterboxdUri,
          listIds: patch.listIds || [],
          metadata: patch.metadata || {},
        };

    filmsMap[id] = merged;
    filmsTouched++;
    return merged;
  };

  for (const file of files) {
    const rows = parseCsvRows(file.content);
    if (rows.length === 0) continue;

    // Check if this is a Letterboxd List CSV (either starts with "Letterboxd list export" or has "Position,Name,Year")
    const firstRowJoined = rows[0].join(',').toLowerCase();
    const listHeaderRowIndex = rows.findIndex((r) => {
      const lower = r.map((c) => c.toLowerCase());
      return lower.includes('position') && lower.includes('name') && lower.includes('year');
    });

    if (firstRowJoined.includes('letterboxd list export') || listHeaderRowIndex !== -1) {
      let listTitle = file.fileName.replace(/\.csv$/i, '').replace(/[-_]/g, ' ');
      let listDesc = '';
      let listUrl = '';
      let listDate = '';

      // Extract metadata block if present before listHeaderRowIndex
      if (listHeaderRowIndex > 1) {
        const metaHeaders = rows[1]?.map((c) => c.toLowerCase()) || [];
        const metaValues = rows[2] || [];
        const nameIdx = metaHeaders.indexOf('name');
        const descIdx = metaHeaders.indexOf('description');
        const urlIdx = metaHeaders.indexOf('url');
        const dateIdx = metaHeaders.indexOf('date');

        if (nameIdx !== -1 && metaValues[nameIdx]) listTitle = metaValues[nameIdx];
        if (descIdx !== -1 && metaValues[descIdx]) listDesc = metaValues[descIdx];
        if (urlIdx !== -1 && metaValues[urlIdx]) listUrl = metaValues[urlIdx];
        if (dateIdx !== -1 && metaValues[dateIdx]) listDate = metaValues[dateIdx];
      }

      const headerRow = rows[listHeaderRowIndex >= 0 ? listHeaderRowIndex : 0].map((h) =>
        h.toLowerCase()
      );
      const posIdx = headerRow.indexOf('position');
      const nameIdx = headerRow.indexOf('name');
      const yearIdx = headerRow.indexOf('year');
      const urlIdx = headerRow.indexOf('url');
      const descIdx = headerRow.indexOf('description');

      const listId = `list-${listTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
      const entries: LetterboxdListEntry[] = [];

      const startIdx = (listHeaderRowIndex >= 0 ? listHeaderRowIndex : 0) + 1;
      for (let r = startIdx; r < rows.length; r++) {
        const row = rows[r];
        const fName = nameIdx !== -1 ? row[nameIdx] : '';
        const fYear = yearIdx !== -1 ? row[yearIdx] : '';
        if (!fName || !fYear) continue;

        const film = upsertFilm(fName, fYear, {
          letterboxdUri: urlIdx !== -1 ? row[urlIdx] : undefined,
          listIds: [listId],
        });
        if (film) {
          entries.push({
            filmId: film.id,
            position: posIdx !== -1 && row[posIdx] ? parseInt(row[posIdx], 10) || entries.length + 1 : entries.length + 1,
            notes: descIdx !== -1 ? row[descIdx] : undefined,
          });
        }
      }

      if (entries.length > 0) {
        const existingListIdx = listsArr.findIndex(
          (l) => l.name.toLowerCase() === listTitle.toLowerCase()
        );
        const newList: LetterboxdList = {
          id: existingListIdx >= 0 ? listsArr[existingListIdx].id : listId,
          name: listTitle,
          description: listDesc || `Imported from ${file.fileName}`,
          createdDate: listDate || new Date().toISOString().slice(0, 10),
          letterboxdUrl: listUrl,
          isRanked: true,
          entries,
        };
        if (existingListIdx >= 0) {
          listsArr[existingListIdx] = newList;
        } else {
          listsArr.push(newList);
        }
        listsCount++;
      }
      continue;
    }

    // Standard Letterboxd CSV: ratings.csv, reviews.csv, diary.csv, watched.csv, or custom
    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'title' || h === 'film');
    const yearIdx = headers.findIndex((h) => h === 'year' || h === 'release year');
    const ratingIdx = headers.findIndex((h) => h === 'rating');
    const reviewIdx = headers.findIndex((h) => h === 'review');
    const uriIdx = headers.findIndex((h) => h === 'letterboxd uri' || h === 'uri' || h === 'url');
    const dateIdx = headers.findIndex((h) => h === 'date');
    const watchedDateIdx = headers.findIndex((h) => h === 'watched date');
    const rewatchIdx = headers.findIndex((h) => h === 'rewatch');
    const tagsIdx = headers.findIndex((h) => h === 'tags');
    const directorIdx = headers.findIndex((h) => h === 'director');

    if (nameIdx === -1 || yearIdx === -1) continue;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const title = row[nameIdx];
      const yearStr = row[yearIdx];
      if (!title || !yearStr) continue;

      const rawRating = ratingIdx !== -1 && row[ratingIdx] ? parseFloat(row[ratingIdx]) : undefined;
      const validRating =
        rawRating !== undefined && !isNaN(rawRating) && rawRating >= 0.5 && rawRating <= 5
          ? rawRating
          : undefined;

      const reviewText = reviewIdx !== -1 && row[reviewIdx] ? row[reviewIdx] : undefined;
      if (reviewText) reviewsCount++;

      const tags =
        tagsIdx !== -1 && row[tagsIdx]
          ? row[tagsIdx]
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;

      const director = directorIdx !== -1 && row[directorIdx] ? row[directorIdx] : undefined;

      upsertFilm(title, yearStr, {
        rating: validRating,
        review: reviewText,
        letterboxdUri: uriIdx !== -1 ? row[uriIdx] : undefined,
        ratedDate: dateIdx !== -1 ? row[dateIdx] : undefined,
        watchedDate: watchedDateIdx !== -1 && row[watchedDateIdx] ? row[watchedDateIdx] : dateIdx !== -1 ? row[dateIdx] : undefined,
        rewatch: rewatchIdx !== -1 ? row[rewatchIdx]?.toLowerCase() === 'yes' : undefined,
        tags,
        metadata: director ? { director } : undefined,
      });
    }
  }

  return {
    nextState: {
      ...existingState,
      films: filmsMap,
      lists: listsArr,
      lastImportedAt: new Date().toISOString(),
    },
    summary: {
      filesProcessed: files.length,
      filmsAddedOrUpdated: filmsTouched,
      reviewsImported: reviewsCount,
      listsImported: listsCount,
      yearsTouched: Array.from(yearsSet).sort((a, b) => b - a),
    },
  };
}

export function generateSampleLetterboxdCsvBundle(): { fileName: string; content: string }[] {
  const ratingsCsv = `Date,Name,Year,Letterboxd URI,Rating
2026-01-12,Sunrise: A Song of Two Humans,1927,https://boxd.it/2aa0,5.0
2026-01-14,Metropolis,1927,https://boxd.it/2b5e,5.0
2026-01-15,Wings,1927,https://boxd.it/29ce,4.0
2026-01-16,The General,1927,https://boxd.it/2a9m,4.5
2026-02-01,Barry Lyndon,1975,https://boxd.it/29c0,5.0
2026-02-03,Jeanne Dielman 23 quai du Commerce 1080 Bruxelles,1975,https://boxd.it/1Ylu,5.0
2026-02-04,Dog Day Afternoon,1975,https://boxd.it/29b8,4.5
2026-02-06,Nashville,1975,https://boxd.it/29aE,4.5
2026-02-09,One Flew Over the Cuckoo's Nest,1975,https://boxd.it/29bw,4.5
2026-02-12,Mirror,1975,https://boxd.it/28Q2,5.0
2026-03-01,Oppenheimer,2023,https://boxd.it/vHca,5.0
2026-03-02,Anatomy of a Fall,2023,https://boxd.it/zTbe,5.0
2026-03-04,The Zone of Interest,2023,https://boxd.it/mKda,4.5
2026-03-06,Past Lives,2023,https://boxd.it/oSea,4.5
2026-03-07,Poor Things,2023,https://boxd.it/vFda,4.5`;

  return [{ fileName: 'ratings.csv', content: ratingsCsv }];
}

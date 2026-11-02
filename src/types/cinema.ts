export interface FilmMetadata {
  posterUrl?: string;
  imdbId?: string;
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
  enriched?: boolean;
}

export interface FilmRecord {
  id: string;
  title: string;
  year: number;
  letterboxdUri?: string;
  rating?: number | null; // 0.5 to 5.0
  liked?: boolean;
  rewatch?: boolean;
  watchedDate?: string; // YYYY-MM-DD
  ratedDate?: string;
  review?: string;
  tags?: string[];
  listIds: string[];
  metadata: FilmMetadata;
}

export type RankingTier = 'Masterpiece' | 'Essential' | 'Notable';

export interface YearlyRankingEntry {
  filmId: string;
  rank: number;
  tier: RankingTier;
  curatorNote?: string;
}

export interface YearlyRanking {
  year: number;
  summaryEssay?: string;
  entries: YearlyRankingEntry[];
}

export type OscarDivision =
  | 'Above the Line'
  | 'Writing'
  | 'Craft & Technical'
  | 'Special & Era-Specific';

export type CreditFieldKey =
  | 'film'
  | 'director'
  | 'cast'
  | 'writers'
  | 'cinematographer'
  | 'composer'
  | 'editor'
  | 'productionDesigner'
  | 'costumeDesigner'
  | 'country';

export interface HistoricalCategorySpec {
  id: string;
  name: string;
  historicalNames?: { startYear: number; endYear: number; title: string }[];
  division: OscarDivision;
  startYear: number; // Release year eligibility start (1927 = 1st Academy Awards)
  endYear?: number; // If discontinued (e.g. Title Writing 1927, Dance Direction 1937, Best Story 1956)
  maxNominees: number;
  creditField: CreditFieldKey;
  recipientPrompt: string;
  eraNote?: string;
}

export interface OscarNomineeEntry {
  id: string;
  filmId: string;
  recipientName: string; // e.g., Director name, Actor name, Producer/Studio, or Song Title
  roleOrDetail?: string; // e.g., Character name or technical detail
  citationNote?: string;
}

export interface CategoryBallotState {
  categoryId: string;
  customCategoryName?: string;
  nominees: OscarNomineeEntry[];
  winnerNomineeId?: string | null;
}

export interface YearlyOscarBallot {
  year: number;
  useModernCategoriesOverride?: boolean;
  ceremonyNotes?: string;
  categories: Record<string, CategoryBallotState>;
  customCategories?: HistoricalCategorySpec[];
}

export interface LetterboxdListEntry {
  filmId: string;
  position: number;
  notes?: string;
}

export interface LetterboxdList {
  id: string;
  name: string;
  description?: string;
  createdDate?: string;
  letterboxdUrl?: string;
  isRanked: boolean;
  entries: LetterboxdListEntry[];
}

export interface CineasteArchiveState {
  films: Record<string, FilmRecord>;
  yearlyRankings: Record<number, YearlyRanking>;
  oscarBallots: Record<number, YearlyOscarBallot>;
  lists: LetterboxdList[];
  lastImportedAt?: string;
}

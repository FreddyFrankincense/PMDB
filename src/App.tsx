import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  LayoutGrid,
  Table2,
  Sun,
  Moon,
  Plus,
  Award,
  ListOrdered,
  Upload,
  RefreshCw,
  BarChart2,
  Sparkles,
  GitCompare,
  Trophy,
  Database,
  History,
  BookOpen,
  UserCheck,
  TableProperties,
  Monitor,
  Download,
} from 'lucide-react';
import {
  CineasteArchiveState,
  FilmRecord,
  LetterboxdList,
  YearlyOscarBallot,
  YearlyRanking,
} from './types/cinema';
import {
  FilmEntry,
  ProfileAccount,
  TierGrade,
} from './types/letterboxd';
import { createInitialSeedArchive } from './data/seedArchive';
import { INITIAL_PROFILES } from './data/filmCatalog';
import { getCategoriesForYear } from './data/oscarHistoryEngine';
import { ingestLetterboxdCsvFiles, makeFilmId } from './utils/letterboxdCsvParser';
import { computeProfileDeviations } from './utils/baselineDiff';
import {
  filmEntryToFilmRecord,
  normalizeFilmMatchKey,
  propagateMetadataAcrossAllProfiles,
  syncArchiveIntoProfile,
  syncProfileFilmsIntoArchive,
} from './utils/unifiedArchiveSync';
import { PosterVisual } from './components/PosterVisual';
import { formatStarString } from './components/StarRatingDisplay';
import { FilmDetailModal } from './components/FilmDetailModal';
import { CsvImportModal } from './components/CsvImportModal';
import { YearlyRankingsView } from './components/YearlyRankingsView';
import { OscarBallotView } from './components/OscarBallotView';
import { ListsAndReviewsView } from './components/ListsAndReviewsView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { AnalyticsView } from './components/AnalyticsView';
import { RecommendationsView } from './components/RecommendationsView';
import { ComparisonView } from './components/ComparisonView';
import { DataSourcesView } from './components/DataSourcesView';
import { ChangesSummaryView } from './components/ChangesSummaryView';
import { FilmGroupCohort } from './components/GroupHistogramPanel';
import { DesktopExecutableModal } from './components/DesktopExecutableModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { usePWAInstall, useOnlineStatus } from './hooks/usePWAInstall';

export type UnifiedNavTab =
  | 'catalog'
  | 'spreadsheet'
  | 'rankings'
  | 'ballots'
  | 'analytics'
  | 'recommendations'
  | 'compare'
  | 'lists'
  | 'sources'
  | 'changes';

const STORAGE_KEY = 'cineaste_ledger_archive_v1';
const PROFILES_STORAGE_KEY = 'cineaste_framesheet_profiles_v1';
const HERO_ARCHIVE_IMG = '/src/assets/images/cinema_archive_hero_1793538459096.jpg';

export default function App() {
  // Theme state (Dark Cinema Editorial vs Clean Archival Print)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('cineaste_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('cineaste_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('cineaste_theme', 'light');
    }
  }, [darkMode]);

  // 1. Cineaste Ledger Archive State (Catalog, Yearly Rankings 1927-2026, Oscar Ballots 1927-2026, Curated Lists)
  const [archive, setArchive] = useState<CineasteArchiveState>(() => {
    const seed = createInitialSeedArchive();
    const seededWithProfile = INITIAL_PROFILES[0]
      ? syncProfileFilmsIntoArchive(INITIAL_PROFILES[0].films, seed)
      : seed;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CineasteArchiveState;
        if (parsed && parsed.films && Object.keys(parsed.films).length > 0) {
          const mergedArchive: CineasteArchiveState = {
            ...seededWithProfile,
            ...parsed,
            films: {
              ...seededWithProfile.films,
              ...parsed.films,
            },
            yearlyRankings: {
              ...seededWithProfile.yearlyRankings,
              ...(parsed.yearlyRankings || {}),
            },
            oscarBallots: {
              ...seededWithProfile.oscarBallots,
              ...(parsed.oscarBallots || {}),
            },
          };
          return mergedArchive;
        }
      }
    } catch {
      // Fallback to seed archive
    }
    return seededWithProfile;
  });

  // 2. FrameSheet Multi-Profile State (Synchronized with Cineaste Ledger Archive)
  const [profiles, setProfiles] = useState<ProfileAccount[]>(() => {
    try {
      const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileAccount[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return propagateMetadataAcrossAllProfiles(
            archive,
            parsed.map((p, idx) => (idx === 0 ? syncArchiveIntoProfile(archive, p) : p))
          );
        }
      }
    } catch {
      // Fallback to initial profiles synced with archive
    }
    return propagateMetadataAcrossAllProfiles(
      archive,
      INITIAL_PROFILES.map((p, idx) => (idx === 0 ? syncArchiveIntoProfile(archive, p) : p))
    );
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => profiles[0]?.id || 'user-main');
  const [compareSecondaryId, setCompareSecondaryId] = useState<string>(
    () => profiles[1]?.id || profiles[0]?.id || 'user-friend'
  );

  // Saved Custom Cohorts for Analytics & Histograms
  const [savedCohorts, setSavedCohorts] = useState<FilmGroupCohort[]>([]);
  const [analyticsTargetCohort, setAnalyticsTargetCohort] = useState<FilmGroupCohort | null>(null);
  const [spreadsheetInspectedFilmId, setSpreadsheetInspectedFilmId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
    } catch {
      // Ignore storage quota errors
    }
  }, [archive]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // Ignore storage quota errors
    }
  }, [profiles]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  // Unified setter: when Cineaste Archive updates, sync into active Profile and propagate enriched posters/credits across all profiles
  const updateUnifiedArchive = useCallback(
    (updater: CineasteArchiveState | ((prev: CineasteArchiveState) => CineasteArchiveState)) => {
      setArchive((prev) => {
        const nextArchive = typeof updater === 'function' ? updater(prev) : updater;
        setProfiles((prevProfiles) =>
          propagateMetadataAcrossAllProfiles(
            nextArchive,
            prevProfiles.map((p) =>
              p.id === activeProfileId ? syncArchiveIntoProfile(nextArchive, p) : p
            )
          )
        );
        return nextArchive;
      });
    },
    [activeProfileId]
  );

  // Unified setter: when FrameSheet Profile films update (e.g. Spreadsheet edits, Recommendations, External Lists, Revert), sync into Cineaste Archive
  const handleUpdateActiveProfileFilms = useCallback(
    (nextFilms: FilmEntry[]) => {
      setProfiles((prevProfiles) =>
        prevProfiles.map((p) => (p.id === activeProfile.id ? { ...p, films: nextFilms } : p))
      );
      setArchive((prevArchive) => syncProfileFilmsIntoArchive(nextFilms, prevArchive, true));
    },
    [activeProfile.id]
  );

  // When switching active profile, also sync its non-synthetic films into the Cineaste Archive so Rankings & Ballots reflect that profile
  const handleSelectActiveProfile = useCallback(
    (profileId: string) => {
      setActiveProfileId(profileId);
      const target = profiles.find((p) => p.id === profileId);
      if (target) {
        setArchive((prev) => syncProfileFilmsIntoArchive(target.films, prev));
      }
    },
    [profiles]
  );

  // Active Navigation View & Selected Year Context
  const [activeTab, setActiveTab] = useState<UnifiedNavTab>('catalog');
  const [selectedYear, setSelectedYear] = useState<number>(1975);

  // Catalog Filters (combining Cineaste Ledger + FrameSheet Tier & Watchlist filters)
  const [catalogViewMode, setCatalogViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [decadeFilter, setDecadeFilter] = useState<string>('all');
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [oscarFilter, setOscarFilter] = useState<'all' | 'nominated' | 'winner'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | TierGrade>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'logged' | 'watchlist' | 'modified'>('all');
  const [listFilter, setListFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'year-desc' | 'year-asc' | 'rating-desc' | 'title-asc' | 'sheet-rank'>(
    'rating-desc'
  );

  // Modals & Cross-Module Global Search Navigation State
  const [selectedFilmIdForModal, setSelectedFilmIdForModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDesktopExecutableModal, setShowDesktopExecutableModal] = useState(false);
  const [showGlobalSearchModal, setShowGlobalSearchModal] = useState(false);
  const [listsTargetListId, setListsTargetListId] = useState<string | null>(null);
  const [listsTargetSubTab, setListsTargetSubTab] = useState<'lists' | 'reviews' | null>(null);
  const [listsTargetReviewQuery, setListsTargetReviewQuery] = useState<string>('');

  // Global Keyboard Shortcut: Cmd/Ctrl + K (or '/' when not typing in an input)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowGlobalSearchModal((prev) => !prev);
        return;
      }
      if (
        e.key === '/' &&
        !showGlobalSearchModal &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (
          tag !== 'input' &&
          tag !== 'textarea' &&
          tag !== 'select' &&
          !target?.isContentEditable
        ) {
          e.preventDefault();
          setShowGlobalSearchModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showGlobalSearchModal]);

  // PWA & Standalone Desktop Status
  const { isInstallable, isInstalled, install: triggerPwaInstall } = usePWAInstall();
  const isOnline = useOnlineStatus();

  // Quick Add Film Bar in Catalog
  const [showQuickAddDrawer, setShowQuickAddDrawer] = useState(false);
  const [imdbSearchInput, setImdbSearchInput] = useState('');
  const [imdbSearchResults, setImdbSearchResults] = useState<
    Array<{ imdbId: string; title: string; year?: number; castSnippet: string; posterUrl?: string }>
  >([]);
  const [isSearchingImdb, setIsSearchingImdb] = useState(false);

  // Background Enrichment Progress
  const [enrichmentProgress, setEnrichmentProgress] = useState<{
    active: boolean;
    done: number;
    total: number;
  }>({ active: false, done: 0, total: 0 });

  // Single Film Enrichment via Express Proxy (/api/metadata/enrich?extended=true)
  const enrichSingleFilm = useCallback(
    async (filmId: string) => {
      const targetFilm = archive.films[filmId];
      if (!targetFilm) return;

      try {
        const res = await fetch(
          `/api/metadata/enrich?title=${encodeURIComponent(targetFilm.title)}&year=${targetFilm.year}&extended=true`
        );
        if (!res.ok) return;
        const data = await res.json();

        updateUnifiedArchive((prev) => {
          const current = prev.films[filmId];
          if (!current) return prev;
          return {
            ...prev,
            films: {
              ...prev.films,
              [filmId]: {
                ...current,
                metadata: {
                  ...current.metadata,
                  posterUrl: current.metadata?.posterUrl || data.posterUrl,
                  imdbId: current.metadata?.imdbId || data.imdbId,
                  director: current.metadata?.director || data.director,
                  cast:
                    current.metadata?.cast && current.metadata.cast.length > 0
                      ? current.metadata.cast
                      : data.cast,
                  writers:
                    current.metadata?.writers && current.metadata.writers.length > 0
                      ? current.metadata.writers
                      : data.writers,
                  cinematographer: current.metadata?.cinematographer || data.cinematographer,
                  composer: current.metadata?.composer || data.composer,
                  editor: current.metadata?.editor || data.editor,
                  country: current.metadata?.country || data.country,
                  runtime: current.metadata?.runtime || data.runtime,
                  genres:
                    current.metadata?.genres && current.metadata.genres.length > 0
                      ? current.metadata.genres
                      : data.genres,
                  enriched: true,
                },
              },
            },
          };
        });
      } catch {
        // Ignore network error
      }
    },
    [archive.films, updateUnifiedArchive]
  );

  // Deduplicated Batch Enrichment via POST /api/metadata/enrich-batch
  const triggerBatchEnrich = useCallback(
    async (onlyMissingPosters: boolean) => {
      const allFilms = Object.values(archive.films) as FilmRecord[];
      const queue = onlyMissingPosters
        ? allFilms.filter((f) => !f.metadata?.posterUrl)
        : allFilms;

      if (queue.length === 0) return;

      setEnrichmentProgress({ active: true, done: 0, total: queue.length });

      const CHUNK_SIZE = 12;
      let processedCount = 0;

      for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
        const chunk = queue.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch('/api/metadata/enrich-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: chunk.map((f) => ({ id: f.id, title: f.title, year: f.year })),
              includeExtendedCredits: !onlyMissingPosters,
            }),
          });
          if (res.ok) {
            const payload = await res.json();
            const resultsMap: Record<string, any> = payload?.results || {};

            updateUnifiedArchive((prev) => {
              const nextFilms = { ...prev.films };
              for (const film of chunk) {
                const curr = nextFilms[film.id];
                const data = resultsMap[film.id];
                if (!curr || !data) continue;
                nextFilms[film.id] = {
                  ...curr,
                  metadata: {
                    ...curr.metadata,
                    posterUrl: data.posterUrl || curr.metadata?.posterUrl,
                    imdbId: data.imdbId || curr.metadata?.imdbId,
                    director: curr.metadata?.director || data.director,
                    cast:
                      curr.metadata?.cast && curr.metadata.cast.length > 0
                        ? curr.metadata.cast
                        : data.cast,
                    writers:
                      curr.metadata?.writers && curr.metadata.writers.length > 0
                        ? curr.metadata.writers
                        : data.writers,
                    cinematographer: curr.metadata?.cinematographer || data.cinematographer,
                    composer: curr.metadata?.composer || data.composer,
                    editor: curr.metadata?.editor || data.editor,
                    country: curr.metadata?.country || data.country,
                    runtime: curr.metadata?.runtime || data.runtime,
                    genres:
                      curr.metadata?.genres && curr.metadata.genres.length > 0
                        ? curr.metadata.genres
                        : data.genres,
                    enriched: true,
                  },
                };
              }
              return { ...prev, films: nextFilms };
            });
          }
        } catch {
          // Continue with next batch chunk
        }
        processedCount = Math.min(queue.length, i + chunk.length);
        setEnrichmentProgress({ active: true, done: processedCount, total: queue.length });
      }

      setEnrichmentProgress((prev) => ({ ...prev, active: false }));
    },
    [archive.films, updateUnifiedArchive]
  );

  // Auto-enrich missing posters on initial mount
  useEffect(() => {
    const missing = (Object.values(archive.films) as FilmRecord[]).filter(
      (f) => !f.metadata?.posterUrl
    );
    if (missing.length > 0 && !enrichmentProgress.active) {
      triggerBatchEnrich(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-compute Oscar Nomination & Win lookup per filmId across all ballots
  const oscarStatsByFilmId = useMemo(() => {
    const map: Record<string, { nominations: string[]; wins: string[] }> = {};

    for (const ballot of Object.values(archive.oscarBallots) as YearlyOscarBallot[]) {
      const catSpecs = getCategoriesForYear(
        ballot.year,
        Boolean(ballot.useModernCategoriesOverride),
        ballot.customCategories || []
      );
      const specNameMap = new Map<string, string>();
      catSpecs.forEach((s) => specNameMap.set(s.id, s.name));

      for (const [catId, catState] of Object.entries(ballot.categories)) {
        const catName = specNameMap.get(catId) || catId;
        for (const nom of catState.nominees) {
          if (!map[nom.filmId]) {
            map[nom.filmId] = { nominations: [], wins: [] };
          }
          if (!map[nom.filmId].nominations.includes(catName)) {
            map[nom.filmId].nominations.push(catName);
          }
          if (catState.winnerNomineeId === nom.id && !map[nom.filmId].wins.includes(catName)) {
            map[nom.filmId].wins.push(catName);
          }
        }
      }
    }

    return map;
  }, [archive.oscarBallots]);

  // Pre-compute Yearly Rank lookup per filmId
  const yearRankByFilmId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const yr of Object.values(archive.yearlyRankings) as YearlyRanking[]) {
      for (const entry of yr.entries) {
        map[entry.filmId] = entry.rank;
      }
    }
    return map;
  }, [archive.yearlyRankings]);

  // Unified Title::Year Lookups for SpreadsheetView, YearlyRankingsView, and ListsAndReviewsView
  const yearRankByTitleYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const [filmId, rank] of Object.entries(yearRankByFilmId) as Array<[string, number]>) {
      map.set(filmId, rank);
      const film = archive.films[filmId];
      if (film) {
        map.set(normalizeFilmMatchKey(film.title, film.year), rank);
      }
    }
    return map;
  }, [yearRankByFilmId, archive.films]);

  const personalOscarByTitleYear = useMemo(() => {
    const map = new Map<string, { nominations: string[]; wins: string[] }>();
    for (const [filmId, stats] of Object.entries(oscarStatsByFilmId) as Array<
      [string, { nominations: string[]; wins: string[] }]
    >) {
      map.set(filmId, stats);
      const film = archive.films[filmId];
      if (film) {
        map.set(normalizeFilmMatchKey(film.title, film.year), stats);
      }
    }
    return map;
  }, [oscarStatsByFilmId, archive.films]);

  // Active Profile FrameSheet Entry Lookups (Tier, Global Rank, Watchlist, Baseline Diff)
  const profileEntryByKey = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const entry of activeProfile.films) {
      map.set(entry.id, entry);
      map.set(normalizeFilmMatchKey(entry.title, entry.year), entry);
    }
    return map;
  }, [activeProfile.films]);

  const baselineEntryByKey = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const entry of activeProfile.baselineFilms || []) {
      map.set(entry.id, entry);
      map.set(normalizeFilmMatchKey(entry.title, entry.year), entry);
    }
    return map;
  }, [activeProfile.baselineFilms]);

  const deviationsSummary = useMemo(
    () => computeProfileDeviations(activeProfile.baselineFilms, activeProfile.films),
    [activeProfile.baselineFilms, activeProfile.films]
  );

  // Filtered & Sorted Films for Catalog View
  const filteredFilms = useMemo(() => {
    const all = Object.values(archive.films) as FilmRecord[];
    const q = searchQuery.toLowerCase().trim();

    return all
      .filter((film) => {
        const pfEntry =
          profileEntryByKey.get(film.id) ||
          profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));

        if (q) {
          const matchTitle = film.title.toLowerCase().includes(q);
          const matchDir =
            film.metadata?.director?.toLowerCase().includes(q) ||
            pfEntry?.director?.toLowerCase().includes(q);
          const matchCast = film.metadata?.cast?.some((c) => c.toLowerCase().includes(q));
          const matchWriters = film.metadata?.writers?.some((w) => w.toLowerCase().includes(q));
          const matchCrew =
            film.metadata?.cinematographer?.toLowerCase().includes(q) ||
            film.metadata?.composer?.toLowerCase().includes(q) ||
            film.metadata?.editor?.toLowerCase().includes(q);
          const matchGenre = (pfEntry?.genres || film.metadata?.genres || []).some((g) =>
            g.toLowerCase().includes(q)
          );
          const matchTags = (pfEntry?.tags || film.tags || []).some((t) =>
            t.toLowerCase().includes(q)
          );
          const matchYear = String(film.year).includes(q);
          if (
            !matchTitle &&
            !matchDir &&
            !matchCast &&
            !matchWriters &&
            !matchCrew &&
            !matchGenre &&
            !matchTags &&
            !matchYear
          ) {
            return false;
          }
        }

        if (decadeFilter !== 'all') {
          const dec = parseInt(decadeFilter, 10);
          if (Math.floor(film.year / 10) * 10 !== dec) return false;
        }

        if (minRatingFilter > 0) {
          if ((film.rating || 0) < minRatingFilter) return false;
        }

        if (tierFilter !== 'all') {
          if (pfEntry?.tier !== tierFilter) return false;
        }

        if (statusFilter !== 'all') {
          if (statusFilter === 'watchlist' && !pfEntry?.watchlist) return false;
          if (statusFilter === 'logged' && pfEntry?.watchlist) return false;
          if (statusFilter === 'modified') {
            const isMod = pfEntry ? deviationsSummary.byFilmId.has(pfEntry.id) : false;
            if (!isMod) return false;
          }
        }

        if (oscarFilter !== 'all') {
          const stats =
            oscarStatsByFilmId[film.id] ||
            personalOscarByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));
          if (oscarFilter === 'nominated' && (!stats || stats.nominations.length === 0)) {
            return false;
          }
          if (oscarFilter === 'winner' && (!stats || stats.wins.length === 0)) {
            return false;
          }
        }

        if (listFilter !== 'all') {
          const targetList = archive.lists.find((l) => l.id === listFilter);
          if (!targetList || !targetList.entries.some((e) => e.filmId === film.id)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'sheet-rank') {
          const rA =
            profileEntryByKey.get(a.id)?.customRank ??
            profileEntryByKey.get(normalizeFilmMatchKey(a.title, a.year))?.customRank ??
            99999;
          const rB =
            profileEntryByKey.get(b.id)?.customRank ??
            profileEntryByKey.get(normalizeFilmMatchKey(b.title, b.year))?.customRank ??
            99999;
          return rA - rB || (b.rating || 0) - (a.rating || 0);
        }
        if (sortBy === 'year-desc') return b.year - a.year || (b.rating || 0) - (a.rating || 0);
        if (sortBy === 'year-asc') return a.year - b.year || (b.rating || 0) - (a.rating || 0);
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        return (b.rating || 0) - (a.rating || 0) || b.year - a.year;
      });
  }, [
    archive.films,
    archive.lists,
    decadeFilter,
    deviationsSummary.byFilmId,
    listFilter,
    minRatingFilter,
    oscarFilter,
    oscarStatsByFilmId,
    personalOscarByTitleYear,
    profileEntryByKey,
    searchQuery,
    sortBy,
    statusFilter,
    tierFilter,
  ]);

  const handleQuickAddFilmFromImdb = async (
    title: string,
    year: number,
    posterUrl?: string,
    castSnippet?: string
  ): Promise<string> => {
    const id = makeFilmId(title, year);
    const castArr = castSnippet
      ? castSnippet
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    updateUnifiedArchive((prev) => {
      if (prev.films[id]) return prev;
      return {
        ...prev,
        films: {
          ...prev.films,
          [id]: {
            id,
            title,
            year,
            rating: 4.5,
            liked: true,
            watchedDate: new Date().toISOString().slice(0, 10),
            listIds: [],
            metadata: {
              posterUrl,
              cast: castArr,
            },
          },
        },
      };
    });

    setTimeout(() => {
      enrichSingleFilm(id);
    }, 80);

    return id;
  };

  const handleCatalogImdbSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imdbSearchInput.trim()) return;
    setIsSearchingImdb(true);
    try {
      const res = await fetch(
        `/api/metadata/search?q=${encodeURIComponent(imdbSearchInput.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setImdbSearchResults(data.results || []);
      }
    } finally {
      setIsSearchingImdb(false);
    }
  };

  // FrameSheet Profile & Cohort Handlers
  const handleSaveCohort = useCallback(
    (name: string, films: FilmEntry[]) => {
      const newCohort: FilmGroupCohort = {
        id: `saved-group-${Date.now()}`,
        label: name,
        description: `${films.length.toLocaleString()} films saved from @${activeProfile?.username || 'profile'}`,
        sourceType: 'saved_group',
        films,
      };
      setSavedCohorts((prev) => [newCohort, ...prev]);
    },
    [activeProfile?.username]
  );

  const handleDeleteSavedCohort = useCallback((id: string) => {
    setSavedCohorts((prev) => prev.filter((c) => c.id !== id));
    setAnalyticsTargetCohort((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleUpdateDismissedRecommendations = useCallback(
    (dismissedSlugs: string[]) => {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === activeProfile.id
            ? {
                ...p,
                dismissedRecommendations: dismissedSlugs,
              }
            : p
        )
      );
    },
    [activeProfile.id]
  );

  const handleAddOrUpdateProfile = useCallback(
    (newProfile: ProfileAccount, setAsActive: boolean) => {
      setProfiles((prev) => {
        const exists = prev.some((p) => p.id === newProfile.id);
        const updatedList = exists
          ? prev.map((p) => (p.id === newProfile.id ? newProfile : p))
          : [newProfile, ...prev];
        return propagateMetadataAcrossAllProfiles(archive, updatedList);
      });
      if (setAsActive) {
        setActiveProfileId(newProfile.id);
        setArchive((prev) => syncProfileFilmsIntoArchive(newProfile.films, prev));
        setActiveTab((prevTab) => (prevTab === 'sources' ? 'spreadsheet' : prevTab));
      }
    },
    [archive]
  );

  const handleDeleteProfile = useCallback(
    (id: string) => {
      setProfiles((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((p) => p.id !== id);
        if (activeProfileId === id && filtered[0]) {
          setActiveProfileId(filtered[0].id);
          setArchive((prevArch) => syncProfileFilmsIntoArchive(filtered[0].films, prevArch));
        }
        if (compareSecondaryId === id && filtered[0]) {
          setCompareSecondaryId(filtered[1]?.id || filtered[0].id);
        }
        return filtered;
      });
    },
    [activeProfileId, compareSecondaryId]
  );

  const handleOpenFilmCreditsModalFromEntry = useCallback(
    (entry: FilmEntry) => {
      const canonicalId = makeFilmId(entry.title, entry.year);
      const existing = archive.films[entry.id] || archive.films[canonicalId];
      if (existing) {
        setSelectedFilmIdForModal(existing.id);
      } else {
        const createdRecord = filmEntryToFilmRecord(entry);
        updateUnifiedArchive((prev) => ({
          ...prev,
          films: {
            ...prev.films,
            [createdRecord.id]: createdRecord,
          },
        }));
        setSelectedFilmIdForModal(createdRecord.id);
      }
    },
    [archive.films, updateUnifiedArchive]
  );

  const totalFilmsCount = Object.keys(archive.films).length;
  const totalRankedYearsCount = Object.values(archive.yearlyRankings).filter(
    (y: YearlyRanking) => y.entries.length > 0
  ).length;
  const totalBallotsCount = Object.values(archive.oscarBallots).filter(
    (b: YearlyOscarBallot) => Object.keys(b.categories || {}).length > 0
  ).length;

  const activeModalFilm = selectedFilmIdForModal ? archive.films[selectedFilmIdForModal] : null;
  const activeModalProfileEntry = useMemo(() => {
    if (!activeModalFilm) return undefined;
    return (
      profileEntryByKey.get(activeModalFilm.id) ||
      profileEntryByKey.get(normalizeFilmMatchKey(activeModalFilm.title, activeModalFilm.year))
    );
  }, [activeModalFilm, profileEntryByKey]);

  const activeModalBaselineEntry = useMemo(() => {
    if (!activeModalFilm) return undefined;
    return (
      baselineEntryByKey.get(activeModalFilm.id) ||
      baselineEntryByKey.get(normalizeFilmMatchKey(activeModalFilm.title, activeModalFilm.year))
    );
  }, [activeModalFilm, baselineEntryByKey]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-[#0C0C0E] text-[#181615] dark:text-[#F4F1EA] transition-colors">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 px-6 lg:px-10 py-3.5 bg-[#FBF9F5]/95 dark:bg-[#0C0C0E]/95 backdrop-blur border-b border-[#DED9CE] dark:border-[#262830]">
        {/* Zone 1: Brand Wordmark (Single Text Element) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('catalog');
          }}
          className="text-xl sm:text-2xl font-editorial font-semibold tracking-tight text-[#181615] dark:text-[#F4F1EA] whitespace-nowrap shrink-0"
        >
          PMDB <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-normal">·</span>{' '}
          <span className="text-sm sm:text-base font-normal text-[#6E6A63] dark:text-[#9A9891]">
            The Personal Movie Database
          </span>
        </a>

        {/* Zone 2: 5 Primary Single-Line Navigation Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-1.5 text-xs sm:text-sm font-medium text-[#6E6A63] dark:text-[#9A9891]">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'catalog'
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            Poster Catalog
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spreadsheet')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'spreadsheet'
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            FrameSheet Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rankings')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'rankings'
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            Yearly Rankings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ballots')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'ballots'
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            Oscars & Industry Awards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              ['analytics', 'recommendations', 'compare', 'lists', 'sources', 'changes'].includes(activeTab)
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            Analytics & Taste Lab
          </button>
        </nav>

        {/* Zone 3: Global Search Trigger + Primary Action Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowGlobalSearchModal(true)}
            title="Global PMDB Search (Cmd/Ctrl + K)"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#141519] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
            <span>Global Search</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono-tabular bg-[#FBF9F5] dark:bg-[#0C0C0E] border border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891]">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Sync Letterboxd & CSV</span>
          </button>
        </div>
      </header>

      {/* Main Content Container (1440px Desktop Presence) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-6 space-y-6">
        {/* Unified Workspace & Profile Switcher Bar (All 11 Modules Accessible in One Click) */}
        <div className="p-3.5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-3">
          {/* Top Row: Active Letterboxd Account Switcher + Live Metrics + Utility Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#DED9CE] dark:border-[#262830] text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Profile Selector */}
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Active Account:
                </span>
                <select
                  value={activeProfile.id}
                  onChange={(e) => handleSelectActiveProfile(e.target.value)}
                  aria-label="Select Active Letterboxd Profile"
                  className="px-2.5 py-1 text-xs font-medium bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} (@{p.username} · {p.films.length} entries)
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-[#DED9CE] dark:text-[#262830]" aria-hidden="true">|</span>

              <div className="flex flex-wrap items-center gap-2 text-[#6E6A63] dark:text-[#9A9891] font-mono-tabular">
                <span>{totalFilmsCount} Catalog Films</span>
                <span aria-hidden="true">·</span>
                <span>{activeProfile.films.length} Ledger Rows</span>
                <span aria-hidden="true">·</span>
                <span>{totalRankedYearsCount} Ranked Years</span>
                <span aria-hidden="true">·</span>
                <span>{totalBallotsCount} Oscar Ceremonies</span>
                {enrichmentProgress.active && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 text-[#9A7B1C] dark:text-[#D4AF37]">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>
                        Syncing IMDb Posters ({enrichmentProgress.done}/{enrichmentProgress.total})
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={triggerPwaInstall}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install Desktop App</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDesktopExecutableModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#9A7B1C]/60 dark:border-[#D4AF37]/60 bg-[#FBF9F5] dark:bg-[#18191E] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop Executable</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQuickAddDrawer(!showQuickAddDrawer)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span>Log Film from IMDb</span>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {darkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Light Print</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#9A7B1C]" />
                    <span>Dark Screening</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bottom Row: Full Unified Studio Module Switcher (Wrapped so no horizontal scrollbar is needed) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] pr-1.5 whitespace-nowrap shrink-0">
              Workspaces:
            </span>

            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'catalog'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Poster Catalog</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('spreadsheet')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'spreadsheet'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Spreadsheet & Review Search</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rankings')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'rankings'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Yearly Rankings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ballots')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'ballots'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Oscars & Industry Awards</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'analytics'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Analytics & Heatmap</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recommendations')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'recommendations'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Taste Recommendations</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'compare'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare Profiles</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lists')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'lists'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Curated Lists & Reviews</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'sources'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Scraper & CSV Sources</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('changes')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'changes'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>
                Diff Audit
                {deviationsSummary.totalDeviationCount > 0
                  ? ` (${deviationsSummary.totalDeviationCount})`
                  : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Live IMDb Search & Quick-Add Drawer */}
        {showQuickAddDrawer && (
          <div className="p-5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  Log Any Film from Public IMDb & Wikipedia Index (1927–2026)
                </h3>
                <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                  Automatically fetches theatrical poster, director, cast, screenwriters, cinematographer, and composer — and syncs across your entire PMDB workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddDrawer(false)}
                className="text-xs text-[#6E6A63] dark:text-[#9A9891] hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCatalogImdbSearch} className="flex gap-2 max-w-xl">
              <input
                type="text"
                value={imdbSearchInput}
                onChange={(e) => setImdbSearchInput(e.target.value)}
                placeholder="Search film title & year (e.g. Chinatown 1974, Citizen Kane 1941, Sinners 2025)..."
                className="flex-1 px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              />
              <button
                type="submit"
                disabled={isSearchingImdb}
                className="px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer whitespace-nowrap shrink-0"
              >
                {isSearchingImdb ? 'Searching...' : 'Search Public Index'}
              </button>
            </form>

            {imdbSearchResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {imdbSearchResults.map((hit) => (
                  <div
                    key={hit.imdbId}
                    className="p-3 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#181615] dark:text-[#F4F1EA] truncate">
                        {hit.title} ({hit.year || 'Film'})
                      </p>
                      <p className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] truncate">
                        {hit.castSnippet}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const newId = await handleQuickAddFilmFromImdb(
                          hit.title,
                          hit.year || 2024,
                          hit.posterUrl,
                          hit.castSnippet
                        );
                        setSelectedFilmIdForModal(newId);
                      }}
                      className="px-2.5 py-1 text-xs font-medium bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + Log
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 1: CINEASTE POSTER CATALOG & ARCHIVAL TABLE */}
        {activeTab === 'catalog' && (
          <div className="space-y-8">
            {/* Editorial Marquee Hero */}
            <section className="border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#141519] overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                  <div className="space-y-3">
                    <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#9A7B1C] dark:text-[#D4AF37]">
                      PMDB · The Personal Movie Database
                    </p>
                    <h1
                      className="text-3xl sm:text-5xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] leading-[1.1]"
                      style={{ textWrap: 'balance' }}
                    >
                      Every Film You’ve Screened, Analysed in Depth & Crowned by Era.
                    </h1>
                    <p className="text-sm text-[#6E6A63] dark:text-[#9A9891] max-w-xl leading-relaxed">
                      Switch seamlessly between your enriched theatrical poster catalog, high-density spreadsheet & review phrase search, viewing heatmaps, two-profile taste comparisons, annual rankings, and personal Academy Awards ballots (1927–2026).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('spreadsheet')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <TableProperties className="w-4 h-4 text-[#D4AF37] dark:text-[#9A7B1C]" />
                      <span>Open FrameSheet Spreadsheet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('rankings')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ListOrdered className="w-4 h-4 text-[#9A7B1C] dark:text-[#D4AF37]" />
                      <span>Yearly Rankings Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ballots')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Award className="w-4 h-4" />
                      <span>Personal Oscar Ballots (1927–2026)</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative min-h-[220px] border-t lg:border-t-0 lg:border-l border-[#DED9CE] dark:border-[#262830]">
                  <img
                    src={HERO_ARCHIVE_IMG}
                    alt="35mm Film Projection Booth and Archival Reels"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-5">
                    <div className="text-xs text-[#F4F1EA] space-y-1">
                      <p className="font-mono-tabular uppercase tracking-widest text-[#D4AF37]">
                        Quick Era Jump
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {[1927, 1954, 1975, 2023].map((yr) => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => {
                              setSelectedYear(yr);
                              setActiveTab('ballots');
                            }}
                            className="px-2.5 py-1 text-xs font-mono-tabular bg-black/70 border border-white/20 hover:border-[#D4AF37] text-[#F4F1EA] cursor-pointer"
                          >
                            {yr} Ceremony →
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Filter & Search Bar */}
            <section className="p-4 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] flex flex-wrap items-center justify-between gap-2.5">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-[#6E6A63] dark:text-[#9A9891] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, director, actor, genre, or release year..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
                />
              </div>

              {/* Decade Filter */}
              <select
                value={decadeFilter}
                onChange={(e) => setDecadeFilter(e.target.value)}
                aria-label="Filter by Decade"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Decades</option>
                <option value="2020">2020s</option>
                <option value="2010">2010s</option>
                <option value="2000">2000s</option>
                <option value="1990">1990s</option>
                <option value="1980">1980s</option>
                <option value="1970">1970s</option>
                <option value="1960">1960s</option>
                <option value="1950">1950s</option>
                <option value="1940">1940s</option>
                <option value="1930">1930s</option>
                <option value="1920">1920s</option>
              </select>

              {/* Minimum Rating Filter */}
              <select
                value={minRatingFilter}
                onChange={(e) => setMinRatingFilter(Number(e.target.value))}
                aria-label="Filter by Rating"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value={0}>Any Rating</option>
                <option value={5}>★★★★★ (5.0)</option>
                <option value={4.5}>★★★★½+ (4.5+)</option>
                <option value={4}>★★★★+ (4.0+)</option>
                <option value={3.5}>★★★½+ (3.5+)</option>
              </select>

              {/* FrameSheet Tier Filter */}
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as any)}
                aria-label="Filter by FrameSheet Tier"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Tiers (S–D)</option>
                <option value="S">Tier S Only</option>
                <option value="A">Tier A Only</option>
                <option value="B">Tier B Only</option>
                <option value="C">Tier C Only</option>
                <option value="D">Tier D Only</option>
              </select>

              {/* FrameSheet Watchlist & Diff Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                aria-label="Filter by Status"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Entries</option>
                <option value="logged">Logged / Watched</option>
                <option value="watchlist">Watchlist Queue</option>
                <option value="modified">Modified vs. Letterboxd</option>
              </select>

              {/* Personal Oscar Status Filter */}
              <select
                value={oscarFilter}
                onChange={(e) => setOscarFilter(e.target.value as any)}
                aria-label="Filter by Personal Oscar Status"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Oscar Statuses</option>
                <option value="nominated">Personal Oscar Nominees</option>
                <option value="winner">Personal Oscar Winners</option>
              </select>

              {/* List Membership Filter */}
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                aria-label="Filter by List"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Curated Lists</option>
                {archive.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    List: {l.name}
                  </option>
                ))}
              </select>

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort Films"
                className="px-2.5 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="rating-desc">Sort: Highest Rated</option>
                <option value="sheet-rank">Sort: FrameSheet Global Rank</option>
                <option value="year-desc">Sort: Year (Newest)</option>
                <option value="year-asc">Sort: Year (1927 First)</option>
                <option value="title-asc">Sort: Title (A–Z)</option>
              </select>

              {/* Grid vs Table Toggle */}
              <div className="flex items-center gap-1 p-1 bg-[#EBE6DF] dark:bg-[#1C1E24]">
                <button
                  type="button"
                  onClick={() => setCatalogViewMode('grid')}
                  title="Poster Grid View"
                  className={`p-1.5 transition-colors cursor-pointer ${
                    catalogViewMode === 'grid'
                      ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA]'
                      : 'text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogViewMode('table')}
                  title="Archival Ledger Table View"
                  className={`p-1.5 transition-colors cursor-pointer ${
                    catalogViewMode === 'table'
                      ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA]'
                      : 'text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  <Table2 className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* Film Catalog Results */}
            {filteredFilms.length === 0 ? (
              <div className="p-12 text-center border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9]/40 dark:bg-[#141519]/40 space-y-3">
                <p className="text-lg font-editorial text-[#181615] dark:text-[#F4F1EA]">
                  No films match your current filter criteria.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDecadeFilter('all');
                    setMinRatingFilter(0);
                    setTierFilter('all');
                    setStatusFilter('all');
                    setOscarFilter('all');
                    setListFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-medium bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : catalogViewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredFilms.map((film) => {
                  const oscarStats =
                    oscarStatsByFilmId[film.id] ||
                    personalOscarByTitleYear.get(normalizeFilmMatchKey(film.title, film.year)) || {
                      nominations: [],
                      wins: [],
                    };
                  const yrRank =
                    yearRankByFilmId[film.id] ??
                    yearRankByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));
                  const pfEntry =
                    profileEntryByKey.get(film.id) ||
                    profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
                  const isMod = pfEntry ? deviationsSummary.byFilmId.has(pfEntry.id) : false;
                  const isOscarWinner = oscarStats.wins.length > 0;
                  const isOscarNominee = oscarStats.nominations.length > 0;

                  return (
                    <article
                      key={film.id}
                      onClick={() => setSelectedFilmIdForModal(film.id)}
                      className="group cursor-pointer flex flex-col justify-between space-y-2.5"
                    >
                      <PosterVisual film={film} className="w-full aspect-[2/3]" />

                      <div className="space-y-1.5">
                        {/* Metadata Line with Middots & Personal Oscar Summary Pill */}
                        <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                          <span>{film.year}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-semibold">
                            {formatStarString(film.rating)}
                          </span>
                          {pfEntry?.tier && pfEntry.tier !== 'Unranked' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#181615] dark:text-[#F4F1EA] font-semibold">
                                Tier {pfEntry.tier}
                              </span>
                            </>
                          )}
                          {yrRank && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#181615] dark:text-[#F4F1EA] font-medium">
                                #{yrRank} in {film.year}
                              </span>
                            </>
                          )}
                          {pfEntry?.watchlist && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#9A7B1C] dark:text-[#D4AF37]">Watchlist</span>
                            </>
                          )}
                          {isMod && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-600 dark:text-amber-400">Modified</span>
                            </>
                          )}
                          {isOscarNominee && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedYear(film.year);
                                setActiveTab('ballots');
                              }}
                              title={
                                isOscarWinner
                                  ? `Personal Oscar Winner (${oscarStats.wins.join(', ')}) · ${oscarStats.nominations.length} Total Nominations (${oscarStats.nominations.join(', ')}) — Click to open ${film.year} Ballot`
                                  : `Personal Oscar Nominee (${oscarStats.nominations.join(', ')}) — Click to open ${film.year} Ballot`
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono-tabular leading-tight shrink-0 border transition-colors cursor-pointer ${
                                isOscarWinner
                                  ? 'bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37] border-[#9A7B1C]/40 dark:border-[#D4AF37]/40 hover:bg-[#9A7B1C]/25 dark:hover:bg-[#D4AF37]/25 font-semibold'
                                  : 'bg-[#EBE6DF] dark:bg-[#1C1E24] text-[#6E6A63] dark:text-[#C8C4B8] border-[#DED9CE] dark:border-[#2A2D36] hover:border-[#9A7B1C]/50 dark:hover:border-[#D4AF37]/50 font-medium'
                              }`}
                            >
                              {isOscarWinner ? (
                                <>
                                  <Trophy className="w-2.5 h-2.5 shrink-0" />
                                  <span>
                                    Oscar Winner · {oscarStats.wins.length}W/{oscarStats.nominations.length}N
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Award className="w-2.5 h-2.5 text-[#9A7B1C] dark:text-[#D4AF37] shrink-0" />
                                  <span>Oscar Nominee · {oscarStats.nominations.length}N</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <h3 className="text-lg font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] group-hover:text-[#9A7B1C] dark:group-hover:text-[#D4AF37] transition-colors leading-snug line-clamp-1">
                          {film.title}
                        </h3>

                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {film.metadata?.director ? `Dir. ${film.metadata.director}` : 'Feature Film'}
                          {pfEntry?.customRank !== null && pfEntry?.customRank !== undefined && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono-tabular">Sheet #{pfEntry.customRank}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* Swiss Archival Ledger Table View (Combining Cineaste + FrameSheet Columns) */
              <div className="border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#16171C] text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                      <th className="py-3 px-4">Year</th>
                      <th className="py-3 px-4">Film Title</th>
                      <th className="py-3 px-4">Director</th>
                      <th className="py-3 px-4">Rating</th>
                      <th className="py-3 px-4 text-center">Tier</th>
                      <th className="py-3 px-4 text-right">Sheet Rank</th>
                      <th className="py-3 px-4 text-right">Year Rank</th>
                      <th className="py-3 px-4 text-right">Personal Oscars</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DED9CE] dark:divide-[#262830] text-sm">
                    {filteredFilms.map((film) => {
                      const oscarStats =
                        oscarStatsByFilmId[film.id] ||
                        personalOscarByTitleYear.get(
                          normalizeFilmMatchKey(film.title, film.year)
                        ) || {
                          nominations: [],
                          wins: [],
                        };
                      const yrRank =
                        yearRankByFilmId[film.id] ??
                        yearRankByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));
                      const pfEntry =
                        profileEntryByKey.get(film.id) ||
                        profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
                      const isMod = pfEntry ? deviationsSummary.byFilmId.has(pfEntry.id) : false;
                      const isOscarWinner = oscarStats.wins.length > 0;
                      const isOscarNominee = oscarStats.nominations.length > 0;

                      return (
                        <tr
                          key={film.id}
                          onClick={() => setSelectedFilmIdForModal(film.id)}
                          className="hover:bg-[#F2EFE9]/60 dark:hover:bg-[#18191E]/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-mono-tabular text-xs text-[#6E6A63] dark:text-[#9A9891] tabular-nums">
                            {film.year}
                          </td>
                          <td className="py-3 px-4 font-editorial font-semibold text-base text-[#181615] dark:text-[#F4F1EA]">
                            <div className="flex items-center gap-2">
                              <span>{film.title}</span>
                              {pfEntry?.watchlist && (
                                <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#9A7B1C] dark:text-[#D4AF37]">
                                  Watchlist
                                </span>
                              )}
                              {isMod && (
                                <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                  Modified
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[#6E6A63] dark:text-[#9A9891]">
                            {film.metadata?.director || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-[#9A7B1C] dark:text-[#D4AF37]">
                            {formatStarString(film.rating)}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-center text-[#181615] dark:text-[#F4F1EA]">
                            {pfEntry?.tier && pfEntry.tier !== 'Unranked' ? pfEntry.tier : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-right text-[#6E6A63] dark:text-[#9A9891] tabular-nums">
                            {pfEntry?.customRank !== null && pfEntry?.customRank !== undefined
                              ? `#${pfEntry.customRank}`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-right text-[#181615] dark:text-[#F4F1EA] tabular-nums">
                            {yrRank ? `#${String(yrRank).padStart(2, '0')}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-right tabular-nums">
                            {isOscarNominee ? (
                              <span
                                title={
                                  isOscarWinner
                                    ? `Personal Oscar Winner (${oscarStats.wins.join(', ')}) · ${oscarStats.nominations.length} Nominations`
                                    : `Personal Oscar Nominee (${oscarStats.nominations.join(', ')})`
                                }
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono-tabular border ${
                                  isOscarWinner
                                    ? 'bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37] border-[#9A7B1C]/40 dark:border-[#D4AF37]/40 font-semibold'
                                    : 'bg-[#EBE6DF] dark:bg-[#1C1E24] text-[#6E6A63] dark:text-[#C8C4B8] border-[#DED9CE] dark:border-[#2A2D36] font-medium'
                                }`}
                              >
                                {isOscarWinner ? (
                                  <>
                                    <Trophy className="w-2.5 h-2.5 shrink-0" />
                                    <span>
                                      Winner · {oscarStats.wins.length}W/{oscarStats.nominations.length}N
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Award className="w-2.5 h-2.5 text-[#9A7B1C] dark:text-[#D4AF37] shrink-0" />
                                    <span>Nominee · {oscarStats.nominations.length}N</span>
                                  </>
                                )}
                              </span>
                            ) : (
                              <span className="text-[#6E6A63] dark:text-[#9A9891]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: FRAMESHEET SPREADSHEET LEDGER & REVIEW PHRASE SEARCH */}
        {activeTab === 'spreadsheet' && (
          <SpreadsheetView
            profile={activeProfile}
            onUpdateFilms={handleUpdateActiveProfileFilms}
            onOpenImport={() => setActiveTab('sources')}
            onOpenChangesSummary={() => setActiveTab('changes')}
            onOpenCohortInAnalytics={(cohort) => {
              setAnalyticsTargetCohort(cohort);
              setActiveTab('analytics');
            }}
            onSaveCohort={handleSaveCohort}
            initialInspectedFilmId={spreadsheetInspectedFilmId}
            onClearInitialInspectedFilm={() => setSpreadsheetInspectedFilmId(null)}
            onOpenFilmCreditsModal={handleOpenFilmCreditsModalFromEntry}
            yearRankByTitleYear={yearRankByTitleYear}
            personalOscarByTitleYear={personalOscarByTitleYear}
            onNavigateToYearRanking={(year) => {
              setSelectedYear(year);
              setActiveTab('rankings');
            }}
            onNavigateToYearBallot={(year) => {
              setSelectedYear(year);
              setActiveTab('ballots');
            }}
          />
        )}

        {/* VIEW 3: YEARLY RANKINGS STUDIO */}
        {activeTab === 'rankings' && (
          <YearlyRankingsView
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            films={archive.films}
            yearlyRankings={archive.yearlyRankings}
            onUpdateYearlyRanking={(year, nextRanking) =>
              updateUnifiedArchive((prev) => ({
                ...prev,
                yearlyRankings: {
                  ...prev.yearlyRankings,
                  [year]: nextRanking,
                },
              }))
            }
            onSelectFilmForModal={(film) => setSelectedFilmIdForModal(film.id)}
            onNavigateToYearBallot={(year) => {
              setSelectedYear(year);
              setActiveTab('ballots');
            }}
            onQuickAddFilmFromImdb={handleQuickAddFilmFromImdb}
            profileFilms={activeProfile.films}
            personalOscarByTitleYear={personalOscarByTitleYear}
            onOpenCohortInAnalytics={(cohort) => {
              setAnalyticsTargetCohort(cohort);
              setActiveTab('analytics');
            }}
          />
        )}

        {/* VIEW 4: UNIFIED PERSONAL OSCARS & INDUSTRY AWARDS / CRITICS POLLS STUDIO */}
        {activeTab === 'ballots' && (
          <OscarBallotView
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            films={archive.films}
            yearlyRankings={archive.yearlyRankings}
            oscarBallots={archive.oscarBallots}
            onUpdateYearBallot={(year, nextBallot) =>
              updateUnifiedArchive((prev) => ({
                ...prev,
                oscarBallots: {
                  ...prev.oscarBallots,
                  [year]: nextBallot,
                },
              }))
            }
            onSelectFilmForModal={(film) => setSelectedFilmIdForModal(film.id)}
            onNavigateToYearRanking={(year) => {
              setSelectedYear(year);
              setActiveTab('rankings');
            }}
            onEnrichSingleFilm={enrichSingleFilm}
            profile={activeProfile}
            onUpdateProfileFilms={handleUpdateActiveProfileFilms}
            onQuickAddFilmToArchive={(title, year, director) =>
              handleQuickAddFilmFromImdb(title, year, undefined, director)
            }
            onOpenCohortInAnalytics={(cohort) => {
              setAnalyticsTargetCohort(cohort);
              setActiveTab('analytics');
            }}
          />
        )}

        {/* VIEW 5: ANALYTICS & CALENDAR HEATMAP */}
        {activeTab === 'analytics' && (
          <AnalyticsView
            profile={activeProfile}
            activeCohort={analyticsTargetCohort}
            savedCohorts={savedCohorts}
            onSelectCohort={setAnalyticsTargetCohort}
            onSaveCohort={handleSaveCohort}
            onDeleteSavedCohort={handleDeleteSavedCohort}
            onInspectFilm={handleOpenFilmCreditsModalFromEntry}
            onInspectExternalFilm={async (title, year, director) => {
              const existingId = makeFilmId(title, year);
              if (archive.films[existingId]) {
                setSelectedFilmIdForModal(existingId);
              } else {
                const newId = await handleQuickAddFilmFromImdb(title, year, undefined, director);
                setSelectedFilmIdForModal(newId);
              }
            }}
          />
        )}

        {/* VIEW 6: PERSONAL TASTE FINGERPRINT & RECOMMENDATIONS */}
        {activeTab === 'recommendations' && (
          <RecommendationsView
            profile={activeProfile}
            onUpdateFilms={handleUpdateActiveProfileFilms}
            onUpdateDismissedRecommendations={handleUpdateDismissedRecommendations}
            onInspectFilm={async (title, year, director) => {
              const existingId = makeFilmId(title, year);
              if (archive.films[existingId]) {
                setSelectedFilmIdForModal(existingId);
              } else {
                const newId = await handleQuickAddFilmFromImdb(title, year, undefined, director);
                setSelectedFilmIdForModal(newId);
              }
            }}
          />
        )}

        {/* VIEW 7: TWO-PROFILE COMPARISON & TASTE OVERLAP */}
        {activeTab === 'compare' && (
          <ComparisonView
            profiles={profiles}
            primaryProfileId={activeProfile.id}
            secondaryProfileId={compareSecondaryId}
            onSelectPrimary={handleSelectActiveProfile}
            onSelectSecondary={setCompareSecondaryId}
            onOpenImport={() => setActiveTab('sources')}
            onInspectFilm={handleOpenFilmCreditsModalFromEntry}
            onOpenCohortInAnalytics={(cohort) => {
              setAnalyticsTargetCohort(cohort);
              setActiveTab('analytics');
            }}
            personalOscarByTitleYear={personalOscarByTitleYear}
            personalYearRankByTitleYear={yearRankByTitleYear}
          />
        )}

        {/* VIEW 9: CURATED LISTS & CRITICAL REVIEWS */}
        {activeTab === 'lists' && (
          <ListsAndReviewsView
            films={archive.films}
            lists={archive.lists}
            onUpdateLists={(nextLists: LetterboxdList[]) =>
              updateUnifiedArchive((prev) => ({
                ...prev,
                lists: nextLists,
              }))
            }
            onSelectFilmForModal={(film) => setSelectedFilmIdForModal(film.id)}
            profileFilms={activeProfile.films}
            baselineFilms={activeProfile.baselineFilms}
            yearRankByTitleYear={yearRankByTitleYear}
            personalOscarByTitleYear={personalOscarByTitleYear}
            externalSelectedListId={listsTargetListId}
            externalSubTab={listsTargetSubTab}
            externalReviewQuery={listsTargetReviewQuery}
            onOpenCohortInAnalytics={(cohort) => {
              setAnalyticsTargetCohort(cohort);
              setActiveTab('analytics');
            }}
          />
        )}

        {/* VIEW 10: DATA SOURCES (LETTERBOXD SCRAPER & CSV IMPORT/EXPORT) */}
        {activeTab === 'sources' && (
          <DataSourcesView
            profiles={profiles}
            activeProfileId={activeProfile.id}
            onAddOrUpdateProfile={handleAddOrUpdateProfile}
            onDeleteProfile={handleDeleteProfile}
            onSelectActiveProfile={(id) => {
              handleSelectActiveProfile(id);
              setActiveTab('spreadsheet');
            }}
            archive={archive}
            onImportCsvToArchive={(files) => {
              const { nextState, summary } = ingestLetterboxdCsvFiles(files, archive);
              updateUnifiedArchive(nextState);
              return {
                listsImported: summary.listsImported,
                reviewsImported: summary.reviewsImported,
              };
            }}
            onRestoreUnifiedWorkspace={({ archive: restoredArchive, profiles: restoredProfiles }) => {
              if (restoredArchive) {
                setArchive(restoredArchive);
                if (restoredProfiles && restoredProfiles.length > 0) {
                  setProfiles(propagateMetadataAcrossAllProfiles(restoredArchive, restoredProfiles));
                  setActiveProfileId(restoredProfiles[0].id);
                } else {
                  setProfiles((prev) =>
                    propagateMetadataAcrossAllProfiles(
                      restoredArchive,
                      prev.map((p, idx) =>
                        idx === 0 ? syncArchiveIntoProfile(restoredArchive, p) : p
                      )
                    )
                  );
                }
              } else if (restoredProfiles && restoredProfiles.length > 0) {
                setProfiles(propagateMetadataAcrossAllProfiles(archive, restoredProfiles));
                setActiveProfileId(restoredProfiles[0].id);
              }
            }}
            isBatchEnriching={enrichmentProgress.active}
            enrichProgress={enrichmentProgress}
            onTriggerBatchEnrich={() => triggerBatchEnrich(true)}
          />
        )}

        {/* VIEW 11: SUMMARY OF CHANGES VS. LETTERBOXD SOURCE OF TRUTH */}
        {activeTab === 'changes' && (
          <ChangesSummaryView
            profile={activeProfile}
            onUpdateFilms={handleUpdateActiveProfileFilms}
            onOpenInSpreadsheet={(filmId?: string) => {
              if (filmId) {
                setSpreadsheetInspectedFilmId(filmId);
              }
              setActiveTab('spreadsheet');
            }}
            onInspectFilmModal={handleOpenFilmCreditsModalFromEntry}
          />
        )}
      </main>

      {/* Quiet Archival Footer */}
      <footer className="mt-16 border-t border-[#DED9CE] dark:border-[#262830] py-6 px-6 lg:px-10 text-xs text-[#6E6A63] dark:text-[#9A9891] flex flex-wrap items-center justify-between gap-4 max-w-[1440px] w-full mx-auto">
        <span>
          PMDB, The Personal Movie Database · Unified Letterboxd Analytics, Spreadsheet, Rankings & Academy Awards Ballot (1927–2026)
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className="hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            Letterboxd Scraper & CSV Center
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            Import CSV & JSON Backup
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setShowDesktopExecutableModal(true)}
            className="hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer font-medium text-[#9A7B1C] dark:text-[#D4AF37]"
          >
            Standalone Desktop Executable
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => triggerBatchEnrich(true)}
            className="hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            Sync Public Poster Index
          </button>
        </div>
      </footer>

      {/* Film Accession & Credits Modal */}
      {activeModalFilm && (
        <FilmDetailModal
          film={activeModalFilm}
          lists={archive.lists}
          oscarStats={
            oscarStatsByFilmId[activeModalFilm.id] ||
            personalOscarByTitleYear.get(
              normalizeFilmMatchKey(activeModalFilm.title, activeModalFilm.year)
            ) || { nominations: [], wins: [] }
          }
          yearRank={
            yearRankByFilmId[activeModalFilm.id] ??
            yearRankByTitleYear.get(
              normalizeFilmMatchKey(activeModalFilm.title, activeModalFilm.year)
            )
          }
          profileEntry={activeModalProfileEntry}
          baselineEntry={activeModalBaselineEntry}
          onClose={() => setSelectedFilmIdForModal(null)}
          onSaveFilm={(updated, frameSheetPatch) => {
            updateUnifiedArchive((prev) => ({
              ...prev,
              films: {
                ...prev.films,
                [updated.id]: updated,
              },
            }));
            if (frameSheetPatch && activeModalProfileEntry) {
              setProfiles((prevProfiles) =>
                prevProfiles.map((p) => {
                  if (p.id !== activeProfile.id) return p;
                  return {
                    ...p,
                    films: p.films.map((entry): FilmEntry =>
                      entry.id === activeModalProfileEntry.id ||
                      normalizeFilmMatchKey(entry.title, entry.year) ===
                        normalizeFilmMatchKey(updated.title, updated.year)
                        ? {
                            ...entry,
                            ...frameSheetPatch,
                            rating: updated.rating ?? null,
                            liked: Boolean(updated.liked),
                            watchedDate: updated.watchedDate ?? entry.watchedDate,
                            notes: updated.review || '',
                            tags: updated.tags || entry.tags,
                            director: updated.metadata?.director || entry.director,
                            posterUrl: updated.metadata?.posterUrl || entry.posterUrl,
                            genres: updated.metadata?.genres || frameSheetPatch.genres || entry.genres,
                          }
                        : entry
                    ),
                  };
                })
              );
            }
          }}
          onEnrichSingleFilm={enrichSingleFilm}
          onNavigateToYearBallot={(year) => {
            setSelectedYear(year);
            setActiveTab('ballots');
          }}
          onNavigateToYearRanking={(year) => {
            setSelectedYear(year);
            setActiveTab('rankings');
          }}
          onOpenInSpreadsheet={(filmTitle, filmYear) => {
            const matchedEntry =
              activeModalProfileEntry ||
              profileEntryByKey.get(normalizeFilmMatchKey(filmTitle, filmYear));
            setSpreadsheetInspectedFilmId(matchedEntry?.id || activeModalFilm.id);
            setActiveTab('spreadsheet');
          }}
        />
      )}

      {/* CSV Import & JSON Archive Backup Modal */}
      {showImportModal && (
        <CsvImportModal
          archive={archive}
          enrichmentProgress={enrichmentProgress}
          onClose={() => setShowImportModal(false)}
          onUpdateArchive={(nextArchive) => {
            updateUnifiedArchive(nextArchive);
          }}
          onAddOrUpdateProfile={handleAddOrUpdateProfile}
          onTriggerBatchEnrich={triggerBatchEnrich}
          onResetToSeedArchive={() => {
            const seed = createInitialSeedArchive();
            updateUnifiedArchive(seed);
          }}
        />
      )}

      {/* Standalone Desktop Executable & System Diagnostics Studio Modal */}
      {showDesktopExecutableModal && (
        <DesktopExecutableModal
          archive={archive}
          profiles={profiles}
          onClose={() => setShowDesktopExecutableModal(false)}
        />
      )}

      {/* Global Search Command Palette (Cmd/Ctrl + K) */}
      <GlobalSearchModal
        isOpen={showGlobalSearchModal}
        onClose={() => setShowGlobalSearchModal(false)}
        archive={archive}
        activeProfile={activeProfile}
        oscarStatsByFilmId={oscarStatsByFilmId}
        personalOscarByTitleYear={personalOscarByTitleYear}
        yearRankByFilmId={yearRankByFilmId}
        yearRankByTitleYear={yearRankByTitleYear}
        onSelectFilmModal={(filmId) => setSelectedFilmIdForModal(filmId)}
        onOpenInSpreadsheet={(filmId) => {
          setSpreadsheetInspectedFilmId(filmId);
          setActiveTab('spreadsheet');
        }}
        onFilterCatalogByQuery={(q) => {
          setSearchQuery(q);
          setDecadeFilter('all');
          setMinRatingFilter(0);
          setOscarFilter('all');
          setTierFilter('all');
          setStatusFilter('all');
          setListFilter('all');
          setActiveTab('catalog');
        }}
        onFilterCatalogByList={(listId) => {
          setSearchQuery('');
          setDecadeFilter('all');
          setMinRatingFilter(0);
          setOscarFilter('all');
          setTierFilter('all');
          setStatusFilter('all');
          setListFilter(listId);
          setActiveTab('catalog');
        }}
        onOpenListInView={(listId) => {
          setListsTargetListId(listId);
          setListsTargetSubTab('lists');
          setActiveTab('lists');
        }}
        onOpenReviewSearchInView={(revQuery) => {
          setListsTargetReviewQuery(revQuery);
          setListsTargetSubTab('reviews');
          setActiveTab('lists');
        }}
        onNavigateToYearRanking={(year) => {
          setSelectedYear(year);
          setActiveTab('rankings');
        }}
        onNavigateToYearBallot={(year) => {
          setSelectedYear(year);
          setActiveTab('ballots');
        }}
        onOpenCohortInAnalytics={(cohort) => {
          setAnalyticsTargetCohort(cohort);
          setActiveTab('analytics');
        }}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onQuickAddFromImdb={handleQuickAddFilmFromImdb}
      />

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 border border-amber-500/40 bg-[#141519]/95 px-3.5 py-2 text-xs font-mono-tabular text-amber-300 shadow-lg">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Offline Desktop Mode — Local archive &amp; cached assets active</span>
        </div>
      )}
    </div>
  );
}

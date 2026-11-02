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
} from './types/letterboxd';
import { createInitialSeedArchive } from './data/seedArchive';
import { INITIAL_PROFILES } from './data/filmCatalog';
import { getCategoriesForYear } from './data/oscarHistoryEngine';
import { makeFilmId } from './utils/letterboxdCsvParser';
import { computeProfileDeviations } from './utils/baselineDiff';
import {
  filmEntryToFilmRecord,
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
import { ExternalListsView } from './components/ExternalListsView';
import { DataSourcesView } from './components/DataSourcesView';
import { ChangesSummaryView } from './components/ChangesSummaryView';
import { FilmGroupCohort } from './components/GroupHistogramPanel';

export type UnifiedNavTab =
  | 'catalog'
  | 'spreadsheet'
  | 'rankings'
  | 'ballots'
  | 'analytics'
  | 'recommendations'
  | 'compare'
  | 'awards_lists'
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CineasteArchiveState;
        if (parsed && parsed.films && Object.keys(parsed.films).length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to seed archive
    }
    return createInitialSeedArchive();
  });

  // 2. FrameSheet Multi-Profile State (Synchronized with Cineaste Ledger Archive)
  const [profiles, setProfiles] = useState<ProfileAccount[]>(() => {
    try {
      const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileAccount[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p, idx) =>
            idx === 0 ? syncArchiveIntoProfile(archive, p) : p
          );
        }
      }
    } catch {
      // Fallback to initial profiles synced with archive
    }
    return INITIAL_PROFILES.map((p, idx) =>
      idx === 0 ? syncArchiveIntoProfile(archive, p) : p
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

  // Unified setter: when Cineaste Archive updates (e.g. Catalog, Rankings, Ballots, CSV modal), sync into active Profile
  const updateUnifiedArchive = useCallback(
    (updater: CineasteArchiveState | ((prev: CineasteArchiveState) => CineasteArchiveState)) => {
      setArchive((prev) => {
        const nextArchive = typeof updater === 'function' ? updater(prev) : updater;
        setProfiles((prevProfiles) =>
          prevProfiles.map((p) =>
            p.id === activeProfileId ? syncArchiveIntoProfile(nextArchive, p) : p
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
      setArchive((prevArchive) => syncProfileFilmsIntoArchive(nextFilms, prevArchive));
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

  // Catalog Filters
  const [catalogViewMode, setCatalogViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [decadeFilter, setDecadeFilter] = useState<string>('all');
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [oscarFilter, setOscarFilter] = useState<'all' | 'nominated' | 'winner'>('all');
  const [listFilter, setListFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'year-desc' | 'year-asc' | 'rating-desc' | 'title-asc'>(
    'rating-desc'
  );

  // Modals
  const [selectedFilmIdForModal, setSelectedFilmIdForModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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

  // Single Film Enrichment via Express Proxy (/api/metadata/enrich)
  const enrichSingleFilm = useCallback(
    async (filmId: string) => {
      const targetFilm = archive.films[filmId];
      if (!targetFilm) return;

      try {
        const res = await fetch(
          `/api/metadata/enrich?title=${encodeURIComponent(targetFilm.title)}&year=${targetFilm.year}`
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

  // Batch Enrichment for Missing Posters
  const triggerBatchEnrich = useCallback(
    async (onlyMissingPosters: boolean) => {
      const allFilms = Object.values(archive.films) as FilmRecord[];
      const queue = onlyMissingPosters
        ? allFilms.filter((f) => !f.metadata?.posterUrl)
        : allFilms;

      if (queue.length === 0) return;

      setEnrichmentProgress({ active: true, done: 0, total: queue.length });

      for (let i = 0; i < queue.length; i++) {
        const film = queue[i];
        try {
          const res = await fetch(
            `/api/metadata/enrich?title=${encodeURIComponent(film.title)}&year=${film.year}`
          );
          if (res.ok) {
            const data = await res.json();
            updateUnifiedArchive((prev) => {
              const curr = prev.films[film.id];
              if (!curr) return prev;
              return {
                ...prev,
                films: {
                  ...prev.films,
                  [film.id]: {
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
                      enriched: true,
                    },
                  },
                },
              };
            });
          }
        } catch {
          // Continue with next film
        }
        setEnrichmentProgress({ active: true, done: i + 1, total: queue.length });
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

  // Filtered & Sorted Films for Catalog View
  const filteredFilms = useMemo(() => {
    const all = Object.values(archive.films) as FilmRecord[];
    const q = searchQuery.toLowerCase().trim();

    return all
      .filter((film) => {
        if (q) {
          const matchTitle = film.title.toLowerCase().includes(q);
          const matchDir = film.metadata?.director?.toLowerCase().includes(q);
          const matchCast = film.metadata?.cast?.some((c) => c.toLowerCase().includes(q));
          const matchYear = String(film.year).includes(q);
          if (!matchTitle && !matchDir && !matchCast && !matchYear) return false;
        }

        if (decadeFilter !== 'all') {
          const dec = parseInt(decadeFilter, 10);
          if (Math.floor(film.year / 10) * 10 !== dec) return false;
        }

        if (minRatingFilter > 0) {
          if ((film.rating || 0) < minRatingFilter) return false;
        }

        if (oscarFilter !== 'all') {
          const stats = oscarStatsByFilmId[film.id];
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
        if (sortBy === 'year-desc') return b.year - a.year || (b.rating || 0) - (a.rating || 0);
        if (sortBy === 'year-asc') return a.year - b.year || (b.rating || 0) - (a.rating || 0);
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        return (b.rating || 0) - (a.rating || 0) || b.year - a.year;
      });
  }, [
    archive.films,
    archive.lists,
    decadeFilter,
    listFilter,
    minRatingFilter,
    oscarFilter,
    oscarStatsByFilmId,
    searchQuery,
    sortBy,
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
        if (exists) {
          return prev.map((p) => (p.id === newProfile.id ? newProfile : p));
        }
        return [newProfile, ...prev];
      });
      if (setAsActive) {
        setActiveProfileId(newProfile.id);
        setArchive((prev) => syncProfileFilmsIntoArchive(newProfile.films, prev));
        setActiveTab('spreadsheet');
      }
    },
    []
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

  const deviationsSummary = useMemo(
    () => computeProfileDeviations(activeProfile.baselineFilms, activeProfile.films),
    [activeProfile.baselineFilms, activeProfile.films]
  );

  const activeModalFilm = selectedFilmIdForModal ? archive.films[selectedFilmIdForModal] : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-[#0C0C0E] text-[#181615] dark:text-[#F4F1EA] transition-colors">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-[#FBF9F5]/95 dark:bg-[#0C0C0E]/95 backdrop-blur border-b border-[#DED9CE] dark:border-[#262830]">
        {/* Zone 1: Brand Wordmark (Single Text Element) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('catalog');
          }}
          className="text-xl sm:text-2xl font-editorial font-semibold tracking-tight text-[#181615] dark:text-[#F4F1EA] whitespace-nowrap shrink-0"
        >
          Cineaste Ledger <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-normal">×</span> FrameSheet
        </a>

        {/* Zone 2: 5 Primary Single-Line Navigation Links */}
        <nav className="flex items-center gap-5 sm:gap-7 text-xs sm:text-sm font-medium text-[#6E6A63] dark:text-[#9A9891] overflow-x-auto">
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
            Academy Ballots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`py-1 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              ['analytics', 'recommendations', 'compare', 'awards_lists', 'lists', 'sources', 'changes'].includes(activeTab)
                ? 'border-[#9A7B1C] dark:border-[#D4AF37] text-[#181615] dark:text-[#F4F1EA] font-semibold'
                : 'border-transparent hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            Analytics & Taste Lab
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV & Backup</span>
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

            <div className="flex items-center gap-2.5">
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

          {/* Bottom Row: Full Unified Studio Module Switcher (Cineaste Ledger + FrameSheet) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] pr-2 whitespace-nowrap shrink-0">
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
              <Award className="w-3.5 h-3.5" />
              <span>Personal Oscars (1927–2026)</span>
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
              onClick={() => setActiveTab('awards_lists')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'awards_lists'
                  ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                  : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:bg-[#EBE6DF] dark:hover:bg-[#1C1E24]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Industry Awards & Polls</span>
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
                  Automatically fetches theatrical poster, director, cast, screenwriters, cinematographer, and composer — and syncs across both Cineaste Ledger and FrameSheet.
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
                      Unified Cinema Suite · Cineaste Ledger × FrameSheet
                    </p>
                    <h1
                      className="text-3xl sm:text-5xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] leading-[1.1]"
                      style={{ textWrap: 'balance' }}
                    >
                      Every Film You’ve Screened, Analysed in Depth & Crowned by Era.
                    </h1>
                    <p className="text-sm text-[#6E6A63] dark:text-[#9A9891] max-w-xl leading-relaxed">
                      Switch seamlessly between your enriched theatrical poster catalog, the high-density FrameSheet spreadsheet & review phrase search, viewing heatmaps, two-profile taste comparisons, annual rankings, and personal Academy Awards ballots (1927–2026).
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
            <section className="p-4 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] flex flex-wrap items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[#6E6A63] dark:text-[#9A9891] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, director, actor, or release year..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
                />
              </div>

              {/* Decade Filter */}
              <select
                value={decadeFilter}
                onChange={(e) => setDecadeFilter(e.target.value)}
                aria-label="Filter by Decade"
                className="px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="all">All Decades (1920s–2020s)</option>
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
                className="px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value={0}>Any Rating</option>
                <option value={5}>★★★★★ Only (5.0)</option>
                <option value={4.5}>★★★★½ & Above (4.5+)</option>
                <option value={4}>★★★★ & Above (4.0+)</option>
                <option value={3.5}>★★★½ & Above (3.5+)</option>
              </select>

              {/* Personal Oscar Status Filter */}
              <select
                value={oscarFilter}
                onChange={(e) => setOscarFilter(e.target.value as any)}
                aria-label="Filter by Personal Oscar Status"
                className="px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
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
                className="px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
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
                className="px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              >
                <option value="rating-desc">Sort: Highest Rated</option>
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
                  const oscarStats = oscarStatsByFilmId[film.id] || {
                    nominations: [],
                    wins: [],
                  };
                  const yrRank = yearRankByFilmId[film.id];

                  return (
                    <article
                      key={film.id}
                      onClick={() => setSelectedFilmIdForModal(film.id)}
                      className="group cursor-pointer flex flex-col justify-between space-y-2.5"
                    >
                      <PosterVisual film={film} className="w-full aspect-[2/3]" />

                      <div className="space-y-1">
                        {/* Zero-Pill Unboxed Metadata with Middots */}
                        <div className="flex items-center flex-wrap gap-1 text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                          <span>{film.year}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-semibold">
                            {formatStarString(film.rating)}
                          </span>
                          {yrRank && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#181615] dark:text-[#F4F1EA] font-medium">
                                #{yrRank} in {film.year}
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="text-lg font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] group-hover:text-[#9A7B1C] dark:group-hover:text-[#D4AF37] transition-colors leading-snug line-clamp-1">
                          {film.title}
                        </h3>

                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {film.metadata?.director ? `Dir. ${film.metadata.director}` : 'Feature Film'}
                          {oscarStats.nominations.length > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-mono-tabular">
                                {oscarStats.wins.length > 0
                                  ? `★ ${oscarStats.wins.length} Win / ${oscarStats.nominations.length} Nom`
                                  : `${oscarStats.nominations.length} Nom`}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* Swiss Archival Ledger Table View */
              <div className="border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#16171C] text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                      <th className="py-3 px-4">Year</th>
                      <th className="py-3 px-4">Film Title</th>
                      <th className="py-3 px-4">Director</th>
                      <th className="py-3 px-4">Rating</th>
                      <th className="py-3 px-4 text-right">Year Rank</th>
                      <th className="py-3 px-4 text-right">Personal Oscars</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DED9CE] dark:divide-[#262830] text-sm">
                    {filteredFilms.map((film) => {
                      const oscarStats = oscarStatsByFilmId[film.id] || {
                        nominations: [],
                        wins: [],
                      };
                      const yrRank = yearRankByFilmId[film.id];

                      return (
                        <tr
                          key={film.id}
                          onClick={() => setSelectedFilmIdForModal(film.id)}
                          className="hover:bg-[#F2EFE9]/60 dark:hover:bg-[#18191E]/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-mono-tabular text-xs text-[#6E6A63] dark:text-[#9A9891]">
                            {film.year}
                          </td>
                          <td className="py-3 px-4 font-editorial font-semibold text-base text-[#181615] dark:text-[#F4F1EA]">
                            {film.title}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#6E6A63] dark:text-[#9A9891]">
                            {film.metadata?.director || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-[#9A7B1C] dark:text-[#D4AF37]">
                            {formatStarString(film.rating)}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-right text-[#181615] dark:text-[#F4F1EA]">
                            {yrRank ? `#${String(yrRank).padStart(2, '0')}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-right text-[#9A7B1C] dark:text-[#D4AF37]">
                            {oscarStats.nominations.length > 0
                              ? `${oscarStats.wins.length}W / ${oscarStats.nominations.length}N`
                              : '—'}
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
          />
        )}

        {/* VIEW 4: PERSONAL ACADEMY AWARDS BALLOTS (1927-PRESENT) */}
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
          />
        )}

        {/* VIEW 6: PERSONAL TASTE FINGERPRINT & RECOMMENDATIONS */}
        {activeTab === 'recommendations' && (
          <RecommendationsView
            profile={activeProfile}
            onUpdateFilms={handleUpdateActiveProfileFilms}
            onUpdateDismissedRecommendations={handleUpdateDismissedRecommendations}
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
          />
        )}

        {/* VIEW 8: INDUSTRY AWARDS, CRITICS POLLS & PERIODICALS */}
        {activeTab === 'awards_lists' && (
          <ExternalListsView
            profile={activeProfile}
            onUpdateFilms={handleUpdateActiveProfileFilms}
            onNavigateToPersonalOscarBallots={(year) => {
              if (year) setSelectedYear(year);
              setActiveTab('ballots');
            }}
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
          />
        )}
      </main>

      {/* Quiet Archival Footer */}
      <footer className="mt-16 border-t border-[#DED9CE] dark:border-[#262830] py-6 px-6 lg:px-10 text-xs text-[#6E6A63] dark:text-[#9A9891] flex flex-wrap items-center justify-between gap-4 max-w-[1440px] w-full mx-auto">
        <span>
          Cineaste Ledger × FrameSheet · Unified Letterboxd Analytics, Spreadsheet, Rankings & Academy Awards Ballot (1927–2026)
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
            oscarStatsByFilmId[activeModalFilm.id] || { nominations: [], wins: [] }
          }
          yearRank={yearRankByFilmId[activeModalFilm.id]}
          onClose={() => setSelectedFilmIdForModal(null)}
          onSaveFilm={(updated) =>
            updateUnifiedArchive((prev) => ({
              ...prev,
              films: {
                ...prev.films,
                [updated.id]: updated,
              },
            }))
          }
          onEnrichSingleFilm={enrichSingleFilm}
          onNavigateToYearBallot={(year) => {
            setSelectedYear(year);
            setActiveTab('ballots');
          }}
          onNavigateToYearRanking={(year) => {
            setSelectedYear(year);
            setActiveTab('rankings');
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
          onTriggerBatchEnrich={triggerBatchEnrich}
          onResetToSeedArchive={() => {
            const seed = createInitialSeedArchive();
            updateUnifiedArchive(seed);
          }}
        />
      )}
    </div>
  );
}

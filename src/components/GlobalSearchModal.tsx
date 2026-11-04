import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  User,
  Users,
  BookOpen,
  Trophy,
  ListOrdered,
  BarChart2,
  ArrowRight,
  CornerDownLeft,
  Sparkles,
  Award,
  Layers,
  Plus,
} from 'lucide-react';
import {
  CineasteArchiveState,
  FilmRecord,
  LetterboxdList,
  YearlyOscarBallot,
  YearlyRanking,
} from '../types/cinema';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import { normalizeFilmMatchKey } from '../utils/unifiedArchiveSync';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';
import { FilmGroupCohort } from './GroupHistogramPanel';
import { UnifiedNavTab } from '../App';

export type GlobalSearchCategory =
  | 'all'
  | 'films'
  | 'directors'
  | 'actors'
  | 'lists'
  | 'awards';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  archive: CineasteArchiveState;
  activeProfile: ProfileAccount;
  oscarStatsByFilmId: Record<string, { nominations: string[]; wins: string[] }>;
  personalOscarByTitleYear: Map<string, { nominations: string[]; wins: string[] }>;
  yearRankByFilmId: Record<string, number>;
  yearRankByTitleYear: Map<string, number>;
  onSelectFilmModal: (filmId: string) => void;
  onOpenInSpreadsheet: (filmId: string) => void;
  onFilterCatalogByQuery: (query: string) => void;
  onFilterCatalogByList: (listId: string) => void;
  onOpenListInView: (listId: string) => void;
  onOpenReviewSearchInView: (reviewQuery: string) => void;
  onNavigateToYearRanking: (year: number) => void;
  onNavigateToYearBallot: (year: number) => void;
  onOpenCohortInAnalytics: (cohort: FilmGroupCohort) => void;
  onNavigateTab: (tab: UnifiedNavTab) => void;
  onQuickAddFromImdb: (
    title: string,
    year: number,
    posterUrl?: string,
    castSnippet?: string
  ) => Promise<string>;
}

interface DirectorSearchItem {
  name: string;
  films: FilmRecord[];
  profileEntries: FilmEntry[];
  avgRating: number | null;
  oscarWins: number;
  oscarNoms: number;
}

interface ActorCrewSearchItem {
  name: string;
  roles: Set<string>;
  films: FilmRecord[];
  profileEntries: FilmEntry[];
  avgRating: number | null;
  oscarBallotYears: number[];
  oscarWinsCount: number;
}

interface UnifiedResultRow {
  uid: string;
  category: Exclude<GlobalSearchCategory, 'all'>;
  title: string;
  subtitle: string;
  badge?: string;
  onTriggerPrimary: () => void;
  film?: FilmRecord;
  director?: DirectorSearchItem;
  actor?: ActorCrewSearchItem;
  list?: LetterboxdList;
  awardYear?: {
    year: number;
    type: 'ballot' | 'ranking';
    headline: string;
    detail: string;
  };
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  archive,
  activeProfile,
  oscarStatsByFilmId,
  personalOscarByTitleYear,
  yearRankByFilmId,
  yearRankByTitleYear,
  onSelectFilmModal,
  onOpenInSpreadsheet,
  onFilterCatalogByQuery,
  onFilterCatalogByList,
  onOpenListInView,
  onOpenReviewSearchInView,
  onNavigateToYearRanking,
  onNavigateToYearBallot,
  onOpenCohortInAnalytics,
  onNavigateTab,
  onQuickAddFromImdb,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<GlobalSearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveImdbHits, setLiveImdbHits] = useState<
    Array<{ imdbId: string; title: string; year?: number; castSnippet: string; posterUrl?: string }>
  >([]);
  const [isSearchingImdb, setIsSearchingImdb] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    } else {
      setLiveImdbHits([]);
    }
  }, [isOpen]);

  // Map profile entries by normalized title+year and id
  const profileEntryByKey = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const entry of activeProfile.films) {
      map.set(entry.id, entry);
      map.set(normalizeFilmMatchKey(entry.title, entry.year), entry);
    }
    return map;
  }, [activeProfile.films]);

  const allFilms = useMemo(() => Object.values(archive.films) as FilmRecord[], [archive.films]);

  // Build aggregated Directors index across Archive & Active Profile
  const directorsIndex = useMemo<DirectorSearchItem[]>(() => {
    const byName = new Map<
      string,
      {
        displayName: string;
        films: FilmRecord[];
        profileEntries: FilmEntry[];
        ratings: number[];
        oscarWins: number;
        oscarNoms: number;
      }
    >();

    for (const film of allFilms) {
      const pf =
        profileEntryByKey.get(film.id) ||
        profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
      const rawDirector = (film.metadata?.director || pf?.director || '').trim();
      if (!rawDirector || rawDirector === 'Unknown Director') continue;

      const names = rawDirector
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

      const oscar =
        oscarStatsByFilmId[film.id] ||
        personalOscarByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));

      for (const name of names) {
        const key = name.toLowerCase();
        const existing = byName.get(key) || {
          displayName: name,
          films: [],
          profileEntries: [],
          ratings: [],
          oscarWins: 0,
          oscarNoms: 0,
        };
        existing.films.push(film);
        if (pf) existing.profileEntries.push(pf);
        const effRating = film.rating ?? pf?.rating ?? null;
        if (typeof effRating === 'number' && effRating > 0) {
          existing.ratings.push(effRating);
        }
        if (oscar) {
          existing.oscarWins += oscar.wins.length;
          existing.oscarNoms += oscar.nominations.length;
        }
        byName.set(key, existing);
      }
    }

    return Array.from(byName.values())
      .map((item) => ({
        name: item.displayName,
        films: item.films.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.year - a.year),
        profileEntries: item.profileEntries,
        avgRating:
          item.ratings.length > 0
            ? item.ratings.reduce((acc, r) => acc + r, 0) / item.ratings.length
            : null,
        oscarWins: item.oscarWins,
        oscarNoms: item.oscarNoms,
      }))
      .sort((a, b) => b.films.length - a.films.length || (b.avgRating || 0) - (a.avgRating || 0));
  }, [allFilms, profileEntryByKey, oscarStatsByFilmId, personalOscarByTitleYear]);

  // Build aggregated Actors, Writers, Cinematographers, Composers & Oscar Recipients index
  const actorsAndCrewIndex = useMemo<ActorCrewSearchItem[]>(() => {
    const byName = new Map<
      string,
      {
        displayName: string;
        roles: Set<string>;
        filmsMap: Map<string, FilmRecord>;
        profileEntriesMap: Map<string, FilmEntry>;
        ratings: number[];
        oscarBallotYears: Set<number>;
        oscarWinsCount: number;
      }
    >();

    const ensurePerson = (rawName: string) => {
      const cleaned = rawName.trim();
      const key = cleaned.toLowerCase();
      let entry = byName.get(key);
      if (!entry) {
        entry = {
          displayName: cleaned,
          roles: new Set<string>(),
          filmsMap: new Map<string, FilmRecord>(),
          profileEntriesMap: new Map<string, FilmEntry>(),
          ratings: [],
          oscarBallotYears: new Set<number>(),
          oscarWinsCount: 0,
        };
        byName.set(key, entry);
      }
      return entry;
    };

    const addCredit = (rawName: string, role: string, film: FilmRecord, pf?: FilmEntry) => {
      const cleaned = rawName.trim();
      if (!cleaned || cleaned.length < 2) return;
      const person = ensurePerson(cleaned);
      person.roles.add(role);
      if (!person.filmsMap.has(film.id)) {
        person.filmsMap.set(film.id, film);
        const r = film.rating ?? pf?.rating ?? null;
        if (typeof r === 'number' && r > 0) {
          person.ratings.push(r);
        }
      }
      if (pf && !person.profileEntriesMap.has(pf.id)) {
        person.profileEntriesMap.set(pf.id, pf);
      }
    };

    for (const film of allFilms) {
      const pf =
        profileEntryByKey.get(film.id) ||
        profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));

      for (const actor of film.metadata?.cast || []) {
        addCredit(actor, 'Actor', film, pf);
      }
      for (const writer of film.metadata?.writers || []) {
        addCredit(writer, 'Screenwriter', film, pf);
      }
      if (film.metadata?.cinematographer) {
        for (const dp of film.metadata.cinematographer.split(',')) {
          addCredit(dp, 'Cinematographer', film, pf);
        }
      }
      if (film.metadata?.composer) {
        for (const comp of film.metadata.composer.split(',')) {
          addCredit(comp, 'Composer', film, pf);
        }
      }
      if (film.metadata?.editor) {
        for (const ed of film.metadata.editor.split(',')) {
          addCredit(ed, 'Editor', film, pf);
        }
      }
    }

    // Also index all Personal Oscar Ballot recipients (actors, craft nominees, etc.)
    for (const ballot of Object.values(archive.oscarBallots) as YearlyOscarBallot[]) {
      for (const catState of Object.values(ballot.categories || {})) {
        for (const nom of catState.nominees || []) {
          const film = archive.films[nom.filmId];
          const recipient = (nom.recipientName || '').trim();
          if (!recipient || !film || recipient.toLowerCase() === film.title.toLowerCase()) {
            continue;
          }
          const pf =
            profileEntryByKey.get(film.id) ||
            profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));

          for (const part of recipient.split(',')) {
            const trimmed = part.trim();
            if (!trimmed || trimmed.length < 2) continue;
            addCredit(trimmed, 'Oscar Nominee', film, pf);
            const person = ensurePerson(trimmed);
            person.oscarBallotYears.add(ballot.year);
            if (catState.winnerNomineeId === nom.id) {
              person.oscarWinsCount += 1;
              person.roles.add('Oscar Winner');
            }
          }
        }
      }
    }

    return Array.from(byName.values())
      .map((item) => {
        const filmsList = Array.from(item.filmsMap.values()).sort(
          (a, b) => (b.rating || 0) - (a.rating || 0) || b.year - a.year
        );
        return {
          name: item.displayName,
          roles: item.roles,
          films: filmsList,
          profileEntries: Array.from(item.profileEntriesMap.values()),
          avgRating:
            item.ratings.length > 0
              ? item.ratings.reduce((acc, r) => acc + r, 0) / item.ratings.length
              : null,
          oscarBallotYears: Array.from(item.oscarBallotYears).sort((a, b) => b - a),
          oscarWinsCount: item.oscarWinsCount,
        };
      })
      .sort(
        (a, b) =>
          b.films.length - a.films.length ||
          b.oscarWinsCount - a.oscarWinsCount ||
          (b.avgRating || 0) - (a.avgRating || 0)
      );
  }, [allFilms, archive.films, archive.oscarBallots, profileEntryByKey]);

  const normalizedQuery = query.trim().toLowerCase();

  // Compute filtered results per category
  const matchedFilms = useMemo(() => {
    if (!normalizedQuery) {
      return [...allFilms]
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.year - a.year)
        .slice(0, 8);
    }

    return allFilms
      .map((film) => {
        const pf =
          profileEntryByKey.get(film.id) ||
          profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
        const titleLower = film.title.toLowerCase();
        const dirLower = (film.metadata?.director || pf?.director || '').toLowerCase();
        const castMatch = (film.metadata?.cast || []).some((c) =>
          c.toLowerCase().includes(normalizedQuery)
        );
        const writerMatch = (film.metadata?.writers || []).some((w) =>
          w.toLowerCase().includes(normalizedQuery)
        );
        const yearStr = String(film.year);
        const genreMatch = (film.metadata?.genres || pf?.genres || []).some((g) =>
          g.toLowerCase().includes(normalizedQuery)
        );
        const tagMatch = (film.tags || pf?.tags || []).some((t) =>
          t.toLowerCase().includes(normalizedQuery)
        );
        const reviewMatch = (film.review || pf?.notes || '')
          .toLowerCase()
          .includes(normalizedQuery);

        let score = 0;
        if (titleLower === normalizedQuery) score += 100;
        else if (titleLower.startsWith(normalizedQuery)) score += 70;
        else if (titleLower.includes(normalizedQuery)) score += 50;
        if (yearStr === normalizedQuery) score += 45;
        if (dirLower.includes(normalizedQuery)) score += 35;
        if (castMatch) score += 30;
        if (writerMatch) score += 20;
        if (genreMatch || tagMatch) score += 15;
        if (reviewMatch) score += 10;

        return { film, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.film.rating || 0) - (a.film.rating || 0) ||
          b.film.year - a.film.year
      )
      .map((item) => item.film)
      .slice(0, activeCategory === 'films' ? 30 : 8);
  }, [allFilms, normalizedQuery, profileEntryByKey, activeCategory]);

  const matchedDirectors = useMemo(() => {
    if (!normalizedQuery) {
      return directorsIndex.slice(0, 6);
    }
    return directorsIndex
      .filter(
        (d) =>
          d.name.toLowerCase().includes(normalizedQuery) ||
          d.films.some((f) => f.title.toLowerCase().includes(normalizedQuery))
      )
      .sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(normalizedQuery) ? 1 : 0;
        const bNameMatch = b.name.toLowerCase().includes(normalizedQuery) ? 1 : 0;
        if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch;
        return b.films.length - a.films.length;
      })
      .slice(0, activeCategory === 'directors' ? 25 : 5);
  }, [directorsIndex, normalizedQuery, activeCategory]);

  const matchedActors = useMemo(() => {
    if (!normalizedQuery) {
      return actorsAndCrewIndex.slice(0, 6);
    }
    return actorsAndCrewIndex
      .filter(
        (a) =>
          a.name.toLowerCase().includes(normalizedQuery) ||
          Array.from(a.roles).some((r) => r.toLowerCase().includes(normalizedQuery)) ||
          a.films.some((f) => f.title.toLowerCase().includes(normalizedQuery))
      )
      .sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(normalizedQuery) ? 1 : 0;
        const bNameMatch = b.name.toLowerCase().includes(normalizedQuery) ? 1 : 0;
        if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch;
        return b.films.length - a.films.length;
      })
      .slice(0, activeCategory === 'actors' ? 25 : 6);
  }, [actorsAndCrewIndex, normalizedQuery, activeCategory]);

  const matchedLists = useMemo(() => {
    if (!normalizedQuery) {
      return archive.lists.slice(0, 5);
    }
    return archive.lists
      .filter((list) => {
        const nameMatch = list.name.toLowerCase().includes(normalizedQuery);
        const descMatch = (list.description || '').toLowerCase().includes(normalizedQuery);
        const entryMatch = list.entries.some((ent) => {
          const film = archive.films[ent.filmId];
          return (
            film?.title.toLowerCase().includes(normalizedQuery) ||
            (ent.notes || '').toLowerCase().includes(normalizedQuery)
          );
        });
        return nameMatch || descMatch || entryMatch;
      })
      .slice(0, activeCategory === 'lists' ? 20 : 5);
  }, [archive.lists, archive.films, normalizedQuery, activeCategory]);

  const matchedAwardsAndYears = useMemo(() => {
    const items: Array<{
      year: number;
      type: 'ballot' | 'ranking';
      headline: string;
      detail: string;
    }> = [];

    const ballots = Object.values(archive.oscarBallots) as YearlyOscarBallot[];
    const rankings = Object.values(archive.yearlyRankings) as YearlyRanking[];

    for (const b of ballots) {
      const catStates = Object.values(b.categories || {});
      if (catStates.length === 0) continue;
      const yearMatches = !normalizedQuery || String(b.year).includes(normalizedQuery);
      const matchingNoms: string[] = [];

      for (const cs of catStates) {
        for (const nom of cs.nominees || []) {
          const film = archive.films[nom.filmId];
          const text = `${nom.recipientName} ${film?.title || ''} ${nom.roleOrDetail || ''}`.toLowerCase();
          if (normalizedQuery && text.includes(normalizedQuery)) {
            matchingNoms.push(`${nom.recipientName} (${film?.title || b.year})`);
          }
        }
      }

      if (yearMatches || matchingNoms.length > 0) {
        items.push({
          year: b.year,
          type: 'ballot',
          headline: `${b.year} Personal Academy Awards Ballot`,
          detail:
            matchingNoms.length > 0
              ? `Matches: ${matchingNoms.slice(0, 3).join(' · ')}`
              : `${catStates.length} categories curated`,
        });
      }
    }

    for (const r of rankings) {
      if (!r.entries || r.entries.length === 0) continue;
      const yearMatches = !normalizedQuery || String(r.year).includes(normalizedQuery);
      const topFilm = archive.films[r.entries[0]?.filmId];
      const matchingRanked = r.entries
        .map((e) => archive.films[e.filmId]?.title)
        .filter((t): t is string => Boolean(t && normalizedQuery && t.toLowerCase().includes(normalizedQuery)));

      if (yearMatches || matchingRanked.length > 0) {
        items.push({
          year: r.year,
          type: 'ranking',
          headline: `${r.year} Yearly Ranking (${r.entries.length} Films)`,
          detail:
            matchingRanked.length > 0
              ? `Includes: ${matchingRanked.slice(0, 3).join(', ')}`
              : topFilm
              ? `#1 Ranked: ${topFilm.title}`
              : `${r.entries.length} ranked entries`,
        });
      }
    }

    return items
      .sort((a, b) => b.year - a.year)
      .slice(0, activeCategory === 'awards' ? 20 : 4);
  }, [archive.oscarBallots, archive.yearlyRankings, archive.films, normalizedQuery, activeCategory]);

  // Build unified flat list for keyboard navigation
  const unifiedRows = useMemo<UnifiedResultRow[]>(() => {
    const rows: UnifiedResultRow[] = [];

    if (activeCategory === 'all' || activeCategory === 'films') {
      for (const film of matchedFilms) {
        const pf =
          profileEntryByKey.get(film.id) ||
          profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
        const dir = film.metadata?.director || pf?.director || 'Director TBD';
        const rating = film.rating ?? pf?.rating ?? null;
        rows.push({
          uid: `film-${film.id}`,
          category: 'films',
          title: `${film.title} (${film.year})`,
          subtitle: dir,
          badge: rating ? formatStarString(rating) : pf?.watchlist ? 'Watchlist' : undefined,
          film,
          onTriggerPrimary: () => {
            onSelectFilmModal(film.id);
            onClose();
          },
        });
      }
    }

    if (activeCategory === 'all' || activeCategory === 'directors') {
      for (const dir of matchedDirectors) {
        rows.push({
          uid: `director-${dir.name}`,
          category: 'directors',
          title: dir.name,
          subtitle: `${dir.films.length} ${dir.films.length === 1 ? 'film' : 'films'} · ${dir.films
            .slice(0, 3)
            .map((f) => `${f.title} (${f.year})`)
            .join(', ')}`,
          badge: dir.avgRating ? `Avg ★ ${dir.avgRating.toFixed(2)}` : undefined,
          director: dir,
          onTriggerPrimary: () => {
            onFilterCatalogByQuery(dir.name);
            onClose();
          },
        });
      }
    }

    if (activeCategory === 'all' || activeCategory === 'actors') {
      for (const actor of matchedActors) {
        const roleLabels = Array.from(actor.roles).join(' · ');
        rows.push({
          uid: `actor-${actor.name}`,
          category: 'actors',
          title: actor.name,
          subtitle: `${roleLabels} · ${actor.films
            .slice(0, 3)
            .map((f) => `${f.title} (${f.year})`)
            .join(', ')}`,
          badge:
            actor.oscarWinsCount > 0
              ? `★ ${actor.oscarWinsCount} Oscar Win${actor.oscarWinsCount > 1 ? 's' : ''}`
              : `${actor.films.length} ${actor.films.length === 1 ? 'film' : 'films'}`,
          actor,
          onTriggerPrimary: () => {
            onFilterCatalogByQuery(actor.name);
            onClose();
          },
        });
      }
    }

    if (activeCategory === 'all' || activeCategory === 'lists') {
      for (const list of matchedLists) {
        rows.push({
          uid: `list-${list.id}`,
          category: 'lists',
          title: list.name,
          subtitle: list.description || `${list.entries.length} films curated`,
          badge: `${list.entries.length} films`,
          list,
          onTriggerPrimary: () => {
            onOpenListInView(list.id);
            onClose();
          },
        });
      }
    }

    if (activeCategory === 'all' || activeCategory === 'awards') {
      for (const item of matchedAwardsAndYears) {
        rows.push({
          uid: `award-${item.type}-${item.year}`,
          category: 'awards',
          title: item.headline,
          subtitle: item.detail,
          badge: item.type === 'ballot' ? 'Oscar Ballot' : 'Yearly Ranking',
          awardYear: item,
          onTriggerPrimary: () => {
            if (item.type === 'ballot') {
              onNavigateToYearBallot(item.year);
            } else {
              onNavigateToYearRanking(item.year);
            }
            onClose();
          },
        });
      }
    }

    return rows;
  }, [
    activeCategory,
    matchedFilms,
    matchedDirectors,
    matchedActors,
    matchedLists,
    matchedAwardsAndYears,
    profileEntryByKey,
    onSelectFilmModal,
    onFilterCatalogByQuery,
    onOpenListInView,
    onNavigateToYearBallot,
    onNavigateToYearRanking,
    onClose,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          unifiedRows.length > 0 ? (prev + 1) % unifiedRows.length : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          unifiedRows.length > 0 ? (prev - 1 + unifiedRows.length) % unifiedRows.length : 0
        );
        return;
      }
      if (e.key === 'Enter' && unifiedRows[selectedIndex]) {
        e.preventDefault();
        unifiedRows[selectedIndex].onTriggerPrimary();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, unifiedRows, selectedIndex, onClose]);

  const handleSearchLiveImdb = async () => {
    if (!query.trim()) return;
    setIsSearchingImdb(true);
    try {
      const res = await fetch(`/api/metadata/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setLiveImdbHits(data.results || []);
      }
    } finally {
      setIsSearchingImdb(false);
    }
  };

  if (!isOpen) return null;

  const buildCohortForPerson = (
    label: string,
    description: string,
    films: FilmRecord[],
    entries: FilmEntry[]
  ): FilmGroupCohort => {
    const entryMap = new Map<string, FilmEntry>();
    for (const e of entries) {
      entryMap.set(e.id, e);
    }
    for (const f of films) {
      const pf =
        profileEntryByKey.get(f.id) ||
        profileEntryByKey.get(normalizeFilmMatchKey(f.title, f.year));
      if (pf && !entryMap.has(pf.id)) {
        entryMap.set(pf.id, pf);
      }
    }
    return {
      id: `search-cohort-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      description,
      sourceType: 'saved_group',
      films: Array.from(entryMap.values()),
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm p-4 sm:pt-14 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global PMDB Search"
        className="w-full max-w-4xl bg-[#FBF9F5] dark:bg-[#121317] border border-[#DED9CE] dark:border-[#2A2D37] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Top Command Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#16181E]">
          <Search className="w-4 h-4 text-[#9A7B1C] dark:text-[#D4AF37] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search films, directors, actors, screenwriters, curated lists, Oscar ballots, or years..."
            className="flex-1 bg-transparent text-sm text-[#181615] dark:text-[#F4F1EA] placeholder-[#6E6A63] dark:placeholder-[#888680] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setLiveImdbHits([]);
                inputRef.current?.focus();
              }}
              className="px-2 py-0.5 text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
            >
              Clear
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891] border border-[#DED9CE] dark:border-[#262830] px-2 py-0.5 bg-[#FBF9F5] dark:bg-[#121317]">
            <span>ESC</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close global search"
            className="p-1 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121317] text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Modules', count: unifiedRows.length },
                { id: 'films', label: 'Films', count: matchedFilms.length },
                { id: 'directors', label: 'Directors', count: matchedDirectors.length },
                { id: 'actors', label: 'Actors & Crew', count: matchedActors.length },
                { id: 'lists', label: 'Curated Lists', count: matchedLists.length },
                { id: 'awards', label: 'Oscars & Rankings', count: matchedAwardsAndYears.length },
              ] as Array<{ id: GlobalSearchCategory; label: string; count: number }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  activeCategory === tab.id
                    ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                    : 'bg-[#F2EFE9] dark:bg-[#18191E] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono-tabular opacity-80">({tab.count})</span>
              </button>
            ))}
          </div>

          {query.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => {
                onOpenReviewSearchInView(query.trim());
                onClose();
              }}
              className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer"
            >
              <span>Search phrase in Reviews &amp; Notes</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Results Body */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto divide-y divide-[#DED9CE]/70 dark:divide-[#262830]/70">
          {unifiedRows.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <p className="text-sm text-[#6E6A63] dark:text-[#9A9891]">
                No local matches found for <strong className="text-[#181615] dark:text-[#F4F1EA]">"{query}"</strong> in your current PMDB archive.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleSearchLiveImdb}
                  disabled={isSearchingImdb}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSearchingImdb ? 'Searching IMDb Index...' : `Search Public IMDb Index for "${query}"`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenReviewSearchInView(query.trim());
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>Search Full Review Text</span>
                </button>
              </div>
            </div>
          ) : (
            unifiedRows.map((row, idx) => {
              const isSelected = idx === selectedIndex;

              if (row.film) {
                const film = row.film;
                const pf =
                  profileEntryByKey.get(film.id) ||
                  profileEntryByKey.get(normalizeFilmMatchKey(film.title, film.year));
                const oscar =
                  oscarStatsByFilmId[film.id] ||
                  personalOscarByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));
                const yearRank =
                  yearRankByFilmId[film.id] ??
                  yearRankByTitleYear.get(normalizeFilmMatchKey(film.title, film.year));

                return (
                  <div
                    key={row.uid}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                      isSelected
                        ? 'bg-[#EBE6DF] dark:bg-[#1C1E26]'
                        : 'hover:bg-[#F2EFE9]/70 dark:hover:bg-[#16181F]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={row.onTriggerPrimary}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-13 shrink-0 overflow-hidden">
                        <PosterVisual
                          film={film}
                          compact
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono-tabular uppercase tracking-wider px-1.5 py-0.5 bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37]">
                            Film
                          </span>
                          <span className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA] truncate">
                            {film.title}
                          </span>
                          <span className="text-xs font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                            ({film.year})
                          </span>
                          {row.badge && (
                            <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              {row.badge}
                            </span>
                          )}
                          {pf?.tier && pf.tier !== 'Unranked' && (
                            <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]">
                              {pf.tier}-Tier
                            </span>
                          )}
                          {typeof yearRank === 'number' && (
                            <span className="text-[10px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                              #{yearRank} of {film.year}
                            </span>
                          )}
                          {oscar && oscar.wins.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              <Award className="w-3 h-3" />
                              {oscar.wins.length}W
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          Dir. {film.metadata?.director || pf?.director || 'TBD'}
                          {film.metadata?.cast && film.metadata.cast.length > 0
                            ? ` · Cast: ${film.metadata.cast.slice(0, 4).join(', ')}`
                            : ''}
                        </p>
                      </div>
                    </button>

                    {/* Cross-Module Quick Jumps for Film */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenInSpreadsheet(pf?.id || film.id);
                          onClose();
                        }}
                        title="Inspect in FrameSheet Spreadsheet"
                        className="px-2 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateToYearRanking(film.year);
                          onClose();
                        }}
                        title={`Open ${film.year} Yearly Ranking`}
                        className="px-2 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        {film.year} Rank
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateToYearBallot(film.year);
                          onClose();
                        }}
                        title={`Open ${film.year} Personal Oscar Ballot`}
                        className="px-2 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        Ballot
                      </button>
                    </div>
                  </div>
                );
              }

              if (row.director) {
                const dir = row.director;
                return (
                  <div
                    key={row.uid}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-[#EBE6DF] dark:bg-[#1C1E26]'
                        : 'hover:bg-[#F2EFE9]/70 dark:hover:bg-[#16181F]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={row.onTriggerPrimary}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37] border border-[#9A7B1C]/30 dark:border-[#D4AF37]/30 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono-tabular uppercase tracking-wider px-1.5 py-0.5 bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37]">
                            Director
                          </span>
                          <span className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                            {dir.name}
                          </span>
                          {row.badge && (
                            <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              {row.badge}
                            </span>
                          )}
                          {dir.oscarWins > 0 && (
                            <span className="text-[10px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                              {dir.oscarWins} Personal Oscar Wins
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {row.subtitle}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onFilterCatalogByQuery(dir.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        Filter Catalog ({dir.films.length})
                      </button>
                      {dir.profileEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const cohort = buildCohortForPerson(
                              `Director: ${dir.name}`,
                              `${dir.profileEntries.length} films directed by ${dir.name}`,
                              dir.films,
                              dir.profileEntries
                            );
                            onOpenCohortInAnalytics(cohort);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono-tabular border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer"
                        >
                          <BarChart2 className="w-3 h-3" />
                          <span>Taste Histogram</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              if (row.actor) {
                const actor = row.actor;
                return (
                  <div
                    key={row.uid}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-[#EBE6DF] dark:bg-[#1C1E26]'
                        : 'hover:bg-[#F2EFE9]/70 dark:hover:bg-[#16181F]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={row.onTriggerPrimary}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center bg-[#F2EFE9] dark:bg-[#1C1E24] text-[#9A7B1C] dark:text-[#D4AF37] border border-[#DED9CE] dark:border-[#262830] shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono-tabular uppercase tracking-wider px-1.5 py-0.5 bg-[#F2EFE9] dark:bg-[#1F222A] text-[#6E6A63] dark:text-[#9A9891]">
                            {Array.from(actor.roles)[0] || 'Cast & Crew'}
                          </span>
                          <span className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                            {actor.name}
                          </span>
                          {row.badge && (
                            <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              {row.badge}
                            </span>
                          )}
                          {actor.avgRating && (
                            <span className="text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                              Avg ★ {actor.avgRating.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {row.subtitle}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onFilterCatalogByQuery(actor.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        Catalog ({actor.films.length})
                      </button>
                      {actor.oscarBallotYears.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateToYearBallot(actor.oscarBallotYears[0]);
                            onClose();
                          }}
                          className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer"
                        >
                          {actor.oscarBallotYears[0]} Ballot
                        </button>
                      )}
                      {actor.profileEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const cohort = buildCohortForPerson(
                              `Credits: ${actor.name}`,
                              `${actor.profileEntries.length} films featuring ${actor.name}`,
                              actor.films,
                              actor.profileEntries
                            );
                            onOpenCohortInAnalytics(cohort);
                            onClose();
                          }}
                          title="Open Filmography Distribution in Analytics"
                          className="px-2 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
                        >
                          Histogram
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              if (row.list) {
                const list = row.list;
                return (
                  <div
                    key={row.uid}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-[#EBE6DF] dark:bg-[#1C1E26]'
                        : 'hover:bg-[#F2EFE9]/70 dark:hover:bg-[#16181F]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={row.onTriggerPrimary}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37] border border-[#9A7B1C]/30 dark:border-[#D4AF37]/30 shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono-tabular uppercase tracking-wider px-1.5 py-0.5 bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37]">
                            Curated List
                          </span>
                          <span className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                            {list.name}
                          </span>
                          <span className="text-xs font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                            ({list.entries.length} films · {list.isRanked ? 'Ranked' : 'Unranked'})
                          </span>
                        </div>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {row.subtitle}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenListInView(list.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer"
                      >
                        Open List Studio
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onFilterCatalogByList(list.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#141519] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                      >
                        Filter Catalog
                      </button>
                    </div>
                  </div>
                );
              }

              if (row.awardYear) {
                const aw = row.awardYear;
                return (
                  <div
                    key={row.uid}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-[#EBE6DF] dark:bg-[#1C1E26]'
                        : 'hover:bg-[#F2EFE9]/70 dark:hover:bg-[#16181F]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={row.onTriggerPrimary}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 flex items-center justify-center bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37] border border-[#9A7B1C]/30 dark:border-[#D4AF37]/30 shrink-0">
                        {aw.type === 'ballot' ? (
                          <Trophy className="w-4 h-4" />
                        ) : (
                          <ListOrdered className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono-tabular uppercase tracking-wider px-1.5 py-0.5 bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#9A7B1C] dark:text-[#D4AF37]">
                            {row.badge}
                          </span>
                          <span className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                            {aw.headline}
                          </span>
                        </div>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {aw.detail}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={row.onTriggerPrimary}
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer"
                      >
                        Open {aw.year}
                      </button>
                    </div>
                  </div>
                );
              }

              return null;
            })
          )}

          {/* Optional Live Public IMDb Lookup Section when searching */}
          {query.trim().length >= 2 && (
            <div className="p-4 bg-[#F2EFE9]/60 dark:bg-[#15171D] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Not in your local catalog yet? Search Public IMDb Index (1927–2026)
                </span>
                <button
                  type="button"
                  onClick={handleSearchLiveImdb}
                  disabled={isSearchingImdb}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSearchingImdb ? 'Searching IMDb...' : `Find "${query.trim()}" on IMDb`}</span>
                </button>
              </div>

              {liveImdbHits.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {liveImdbHits.map((hit) => (
                    <div
                      key={hit.imdbId}
                      className="p-2.5 bg-[#FBF9F5] dark:bg-[#121317] border border-[#DED9CE] dark:border-[#262830] flex items-center justify-between gap-3"
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
                          const newId = await onQuickAddFromImdb(
                            hit.title,
                            hit.year || 2024,
                            hit.posterUrl,
                            hit.castSnippet
                          );
                          onSelectFilmModal(newId);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer shrink-0"
                      >
                        + Log &amp; Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Keyboard Legend & Quick Module Switcher */}
        <div className="px-4 py-2.5 border-t border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#16181E] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#FBF9F5] dark:bg-[#121317] border border-[#DED9CE] dark:border-[#262830]">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#FBF9F5] dark:bg-[#121317] border border-[#DED9CE] dark:border-[#262830] inline-flex items-center">
                <CornerDownLeft className="w-3 h-3" />
              </kbd>
              <span>Open Selection</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#FBF9F5] dark:bg-[#121317] border border-[#DED9CE] dark:border-[#262830]">
                ⌘K / Ctrl+K
              </kbd>
              <span>Toggle Anywhere</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span>Jump to:</span>
            <button
              type="button"
              onClick={() => {
                onNavigateTab('spreadsheet');
                onClose();
              }}
              className="hover:text-[#181615] dark:hover:text-[#F4F1EA] underline cursor-pointer"
            >
              FrameSheet
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => {
                onNavigateTab('analytics');
                onClose();
              }}
              className="hover:text-[#181615] dark:hover:text-[#F4F1EA] underline cursor-pointer"
            >
              Taste Lab
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => {
                onNavigateTab('ballots');
                onClose();
              }}
              className="hover:text-[#181615] dark:hover:text-[#F4F1EA] underline cursor-pointer"
            >
              Oscars
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

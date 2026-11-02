import React, { useMemo, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Sparkles,
  Award,
  Search,
  BarChart2,
  Landmark,
} from 'lucide-react';
import {
  FilmRecord,
  RankingTier,
  YearlyRanking,
  YearlyRankingEntry,
} from '../types/cinema';
import { FilmEntry } from '../types/letterboxd';
import { INDUSTRY_AND_CRITIC_LISTS } from '../data/industryLists';
import { FilmGroupCohort } from './GroupHistogramPanel';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';

interface YearlyRankingsViewProps {
  selectedYear: number;
  onSelectYear: (year: number) => void;
  films: Record<string, FilmRecord>;
  yearlyRankings: Record<number, YearlyRanking>;
  onUpdateYearlyRanking: (year: number, nextRanking: YearlyRanking) => void;
  onSelectFilmForModal: (film: FilmRecord) => void;
  onNavigateToYearBallot: (year: number) => void;
  onQuickAddFilmFromImdb: (title: string, year: number, posterUrl?: string, castSnippet?: string) => Promise<string>;
  profileFilms?: FilmEntry[];
  personalOscarByTitleYear?: Map<string, { nominations: string[]; wins: string[] }>;
  onOpenCohortInAnalytics?: (cohort: FilmGroupCohort) => void;
}

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940, 1930, 1920];

export const YearlyRankingsView: React.FC<YearlyRankingsViewProps> = ({
  selectedYear,
  onSelectYear,
  films,
  yearlyRankings,
  onUpdateYearlyRanking,
  onSelectFilmForModal,
  onNavigateToYearBallot,
  onQuickAddFilmFromImdb,
  profileFilms = [],
  personalOscarByTitleYear,
  onOpenCohortInAnalytics,
}) => {
  const activeDecade = Math.floor(selectedYear / 10) * 10;
  const [selectedDecade, setSelectedDecade] = useState<number>(
    Math.max(1920, Math.min(2020, activeDecade))
  );

  // Quick IMDb add search for the active year
  const [imdbQuery, setImdbQuery] = useState('');
  const [imdbResults, setImdbResults] = useState<
    Array<{ imdbId: string; title: string; year?: number; castSnippet: string; posterUrl?: string }>
  >([]);
  const [isSearchingImdb, setIsSearchingImdb] = useState(false);

  const yearsInDecade = React.useMemo(() => {
    const start = selectedDecade === 1920 ? 1927 : selectedDecade;
    const end = selectedDecade === 2020 ? 2026 : selectedDecade + 9;
    const arr: number[] = [];
    for (let y = end; y >= start; y--) {
      arr.push(y);
    }
    return arr;
  }, [selectedDecade]);

  const filmsForYear = React.useMemo(() => {
    return (Object.values(films) as FilmRecord[])
      .filter((f) => f.year === selectedYear)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [films, selectedYear]);

  const currentRanking: YearlyRanking = yearlyRankings[selectedYear] || {
    year: selectedYear,
    summaryEssay: '',
    entries: [],
  };

  const rankedFilmIds = new Set(currentRanking.entries.map((e) => e.filmId));
  const unrankedPool = filmsForYear.filter((f) => !rankedFilmIds.has(f.id));

  // FrameSheet Year-Level Statistics & Genre Breakdown
  const yearAnalytics = useMemo(() => {
    const rated = filmsForYear.filter((f) => f.rating !== null && f.rating !== undefined);
    const meanRating =
      rated.length > 0
        ? rated.reduce((sum, f) => sum + (f.rating || 0), 0) / rated.length
        : 0;
    const masterworkCount = rated.filter((f) => (f.rating || 0) >= 4.5).length;
    const genreCounts = new Map<string, number>();
    for (const f of filmsForYear) {
      for (const g of f.metadata?.genres || []) {
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      }
    }
    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g, count]) => `${g} (${count})`);

    const yearProfileFilms = profileFilms.filter((pf) => pf.year === selectedYear);

    return {
      totalLogged: filmsForYear.length,
      ratedCount: rated.length,
      meanRating,
      masterworkCount,
      topGenres,
      yearProfileFilms,
    };
  }, [filmsForYear, profileFilms, selectedYear]);

  // Official Industry & Critics Consensus for {selectedYear}
  const industryConsensusForYear = useMemo(() => {
    const mapByTitle = new Map<
      string,
      {
        title: string;
        year: number;
        director: string;
        consensusRating: number;
        citations: Array<{ shortName: string; status: string; rank: number; detail: string }>;
      }
    >();

    for (const list of INDUSTRY_AND_CRITIC_LISTS) {
      for (const entry of list.entries) {
        if (entry.year !== selectedYear) continue;
        const key = entry.title.toLowerCase();
        const existing = mapByTitle.get(key);
        const citation = {
          shortName: list.shortName,
          status: entry.status,
          rank: entry.rank,
          detail: entry.accoladeDetail,
        };
        if (existing) {
          existing.citations.push(citation);
        } else {
          mapByTitle.set(key, {
            title: entry.title,
            year: entry.year,
            director: entry.director,
            consensusRating: entry.consensusRating,
            citations: [citation],
          });
        }
      }
    }

    return Array.from(mapByTitle.values());
  }, [selectedYear]);

  const normalizeRanks = (entries: YearlyRankingEntry[]): YearlyRankingEntry[] =>
    entries.map((item, idx) => ({ ...item, rank: idx + 1 }));

  const handleAddFilmToRanking = (film: FilmRecord) => {
    if (rankedFilmIds.has(film.id)) return;
    const defaultTier: RankingTier =
      (film.rating || 0) >= 5.0
        ? 'Masterpiece'
        : (film.rating || 0) >= 4.0
        ? 'Essential'
        : 'Notable';
    const nextEntries = normalizeRanks([
      ...currentRanking.entries,
      {
        filmId: film.id,
        rank: currentRanking.entries.length + 1,
        tier: defaultTier,
        curatorNote: '',
      },
    ]);
    onUpdateYearlyRanking(selectedYear, {
      ...currentRanking,
      entries: nextEntries,
    });
  };

  const handleAutoSeedFromRatings = () => {
    const existingIds = new Set(currentRanking.entries.map((e) => e.filmId));
    const additions: YearlyRankingEntry[] = filmsForYear
      .filter((f) => !existingIds.has(f.id))
      .map((f, idx) => ({
        filmId: f.id,
        rank: currentRanking.entries.length + idx + 1,
        tier:
          (f.rating || 0) >= 5.0
            ? 'Masterpiece'
            : (f.rating || 0) >= 4.0
            ? 'Essential'
            : 'Notable',
        curatorNote: f.review ? f.review.slice(0, 110) + (f.review.length > 110 ? '...' : '') : '',
      }));

    onUpdateYearlyRanking(selectedYear, {
      ...currentRanking,
      entries: normalizeRanks([...currentRanking.entries, ...additions]),
    });
  };

  const handleMoveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= currentRanking.entries.length) return;
    const copy = [...currentRanking.entries];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    onUpdateYearlyRanking(selectedYear, {
      ...currentRanking,
      entries: normalizeRanks(copy),
    });
  };

  const handleRemoveEntry = (filmId: string) => {
    const filtered = currentRanking.entries.filter((e) => e.filmId !== filmId);
    onUpdateYearlyRanking(selectedYear, {
      ...currentRanking,
      entries: normalizeRanks(filtered),
    });
  };

  const handleUpdateEntryField = (
    filmId: string,
    patch: Partial<Pick<YearlyRankingEntry, 'tier' | 'curatorNote'>>
  ) => {
    const updated = currentRanking.entries.map((entry) =>
      entry.filmId === filmId ? { ...entry, ...patch } : entry
    );
    onUpdateYearlyRanking(selectedYear, {
      ...currentRanking,
      entries: updated,
    });
  };

  const handleSearchImdbForYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imdbQuery.trim()) return;
    setIsSearchingImdb(true);
    try {
      const res = await fetch(
        `/api/metadata/search?q=${encodeURIComponent(`${imdbQuery.trim()} ${selectedYear}`)}`
      );
      if (res.ok) {
        const data = await res.json();
        setImdbResults(data.results || []);
      }
    } finally {
      setIsSearchingImdb(false);
    }
  };

  const yearsWithRankingsCount = Object.values(yearlyRankings).filter(
    (yr: YearlyRanking) => yr.entries.length > 0
  ).length;

  return (
    <div className="space-y-8">
      {/* Decade & Year Scrubber Rail */}
      <div className="bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DED9CE] dark:border-[#262830] pb-3">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
              Chronological Ranking Studio · {yearsWithRankingsCount} Curated Release Years
            </p>
            <h2 className="text-2xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
              Personal Ranked Movies by Release Year (1927–2026)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenCohortInAnalytics && yearAnalytics.yearProfileFilms.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onOpenCohortInAnalytics({
                    id: `year-cohort-${selectedYear}`,
                    label: `Release Year ${selectedYear} (${yearAnalytics.yearProfileFilms.length} Films)`,
                    description: `All logged & ranked films from ${selectedYear}`,
                    sourceType: 'group_section',
                    films: yearAnalytics.yearProfileFilms,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#2A2D37] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <BarChart2 className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span>Analyze {selectedYear} Cohort in Analytics</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigateToYearBallot(selectedYear)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-[#9A7B1C]/50 dark:border-[#D4AF37]/50 text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Open {selectedYear} Oscars &amp; Industry Awards →</span>
            </button>
          </div>
        </div>

        {/* Decades */}
        <div className="flex flex-wrap items-center gap-1.5">
          {DECADES.map((dec) => {
            const active = selectedDecade === dec;
            return (
              <button
                key={dec}
                type="button"
                onClick={() => {
                  setSelectedDecade(dec);
                  const defaultYr = dec === 1920 ? 1927 : dec;
                  if (Math.floor(selectedYear / 10) * 10 !== dec) {
                    onSelectYear(defaultYr);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-mono-tabular transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#0C0C0E] font-semibold'
                    : 'bg-[#EBE6DF] dark:bg-[#1C1E24] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                }`}
              >
                {dec}s
              </button>
            );
          })}
        </div>

        {/* Years within Selected Decade */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {yearsInDecade.map((yr) => {
            const isSelected = yr === selectedYear;
            const yearFilmCount = (Object.values(films) as FilmRecord[]).filter(
              (f) => f.year === yr
            ).length;
            const rankedCount = yearlyRankings[yr]?.entries?.length || 0;

            return (
              <button
                key={yr}
                type="button"
                onClick={() => onSelectYear(yr)}
                className={`px-3.5 py-2 text-xs font-mono-tabular border transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? 'border-[#9A7B1C] dark:border-[#D4AF37] bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#181615] dark:text-[#F4F1EA] font-semibold'
                    : 'border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                }`}
              >
                <span>{yr}</span>
                {(rankedCount > 0 || yearFilmCount > 0) && (
                  <span className="text-[10px] text-[#9A7B1C] dark:text-[#D4AF37]">
                    {rankedCount > 0 ? `#${rankedCount}` : `${yearFilmCount}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Year-at-a-Glance FrameSheet Telemetry Strip */}
        <div className="pt-2 border-t border-[#DED9CE] dark:border-[#262830] flex flex-wrap items-center justify-between gap-4 text-xs font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              {selectedYear} Logged:{' '}
              <strong className="text-[#181615] dark:text-[#F4F1EA]">
                {yearAnalytics.totalLogged}
              </strong>
            </span>
            <span>·</span>
            <span>
              Ranked:{' '}
              <strong className="text-[#9A7B1C] dark:text-[#D4AF37]">
                {currentRanking.entries.length}
              </strong>
            </span>
            <span>·</span>
            <span>
              Mean Rating:{' '}
              <strong className="text-[#9A7B1C] dark:text-[#D4AF37]">
                {yearAnalytics.ratedCount > 0 ? `${yearAnalytics.meanRating.toFixed(2)} ★` : '—'}
              </strong>
            </span>
            <span>·</span>
            <span>
              Tier S (4.5★+):{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {yearAnalytics.masterworkCount}
              </strong>
            </span>
          </div>
          {yearAnalytics.topGenres.length > 0 && (
            <div>
              Dominant {selectedYear} Genres:{' '}
              <span className="text-[#181615] dark:text-[#F4F1EA]">
                {yearAnalytics.topGenres.join(' · ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Two-Column Ranking Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Ordered Yearly Ranked List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DED9CE] dark:border-[#262830] pb-4">
            <div>
              <h3 className="text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                {selectedYear} Official Ranked Canon
              </h3>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-0.5">
                {currentRanking.entries.length} films ranked ·{' '}
                {filmsForYear.length} total films logged from {selectedYear}
              </p>
            </div>

            {unrankedPool.length > 0 && (
              <button
                type="button"
                onClick={handleAutoSeedFromRatings}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Rank {unrankedPool.length} Logged Film(s) by ★ Rating</span>
              </button>
            )}
          </div>

          {/* Year Summary Reflection */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-1.5">
              {selectedYear} Year-in-Review Curatorial Essay / Thesis
            </label>
            <textarea
              rows={2}
              value={currentRanking.summaryEssay || ''}
              onChange={(e) =>
                onUpdateYearlyRanking(selectedYear, {
                  ...currentRanking,
                  summaryEssay: e.target.value,
                })
              }
              placeholder={`Write your reflection on the cinema of ${selectedYear}...`}
              className="w-full p-3 text-sm font-editorial italic bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
            />
          </div>

          {/* Ranked Entries List */}
          {currentRanking.entries.length === 0 ? (
            <div className="p-10 border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9]/50 dark:bg-[#141519]/50 text-center space-y-3">
              <p className="text-lg font-editorial text-[#181615] dark:text-[#F4F1EA]">
                No films ranked for {selectedYear} yet.
              </p>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] max-w-md mx-auto">
                Add films from your {selectedYear} watched pool on the right, or seed directly from Official {selectedYear} Industry &amp; Critics Consensus below.
              </p>
              {unrankedPool.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoSeedFromRatings}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Seed Ranking from {unrankedPool.length} Watched Film(s)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316]">
              {currentRanking.entries.map((entry, idx) => {
                const film = films[entry.filmId];
                if (!film) return null;

                const oscarStat = personalOscarByTitleYear?.get(
                  `${film.title.trim().toLowerCase()}::${film.year}`
                );
                const industryMatch = industryConsensusForYear.find(
                  (c) => c.title.toLowerCase() === film.title.trim().toLowerCase()
                );

                return (
                  <div
                    key={entry.filmId}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4 hover:bg-[#F2EFE9]/60 dark:hover:bg-[#18191E]/60 transition-colors"
                  >
                    {/* Rank Number + Reorder Controls */}
                    <div className="flex sm:flex-col items-center gap-2 shrink-0">
                      <span
                        className={`text-2xl sm:text-3xl font-mono-tabular font-semibold w-10 text-center ${
                          idx === 0
                            ? 'text-[#9A7B1C] dark:text-[#D4AF37]'
                            : 'text-[#181615] dark:text-[#F4F1EA]'
                        }`}
                      >
                        {String(entry.rank).padStart(2, '0')}
                      </span>
                      <div className="flex sm:flex-col gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveEntry(idx, -1)}
                          title="Move Up"
                          className="p-1 border border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === currentRanking.entries.length - 1}
                          onClick={() => handleMoveEntry(idx, 1)}
                          title="Move Down"
                          className="p-1 border border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Poster Thumbnail */}
                    <div
                      onClick={() => onSelectFilmForModal(film)}
                      className="w-20 sm:w-24 shrink-0 cursor-pointer group"
                    >
                      <PosterVisual film={film} compact className="w-full aspect-[2/3]" />
                    </div>

                    {/* Details & Curator Note */}
                    <div className="flex-1 min-w-0 space-y-2.5 w-full">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <button
                            type="button"
                            onClick={() => onSelectFilmForModal(film)}
                            className="text-xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] hover:text-[#9A7B1C] dark:hover:text-[#D4AF37] text-left cursor-pointer"
                          >
                            {film.title}
                          </button>
                          <div className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>{film.year}</span>
                            {film.metadata?.director && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Dir. {film.metadata.director}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              {formatStarString(film.rating)}
                            </span>
                            {oscarStat && oscarStat.nominations.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37] font-medium">
                                  Personal Oscars: {oscarStat.wins.length}W / {oscarStat.nominations.length}N
                                </span>
                              </>
                            )}
                            {industryMatch && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400">
                                  {industryMatch.citations
                                    .map((c) =>
                                      c.status === 'Ranked'
                                        ? `${c.shortName} #${c.rank}`
                                        : `${c.shortName} ${c.status}`
                                    )
                                    .join(', ')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Tier Selector + Remove */}
                        <div className="flex items-center gap-2">
                          <select
                            value={entry.tier}
                            onChange={(e) =>
                              handleUpdateEntryField(entry.filmId, {
                                tier: e.target.value as RankingTier,
                              })
                            }
                            aria-label="Ranking Tier"
                            className="px-2.5 py-1 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                          >
                            <option value="Masterpiece">Tier: Masterpiece</option>
                            <option value="Essential">Tier: Essential</option>
                            <option value="Notable">Tier: Notable</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.filmId)}
                            title="Remove from ranking"
                            className="p-1.5 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#DC2626] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={entry.curatorNote || ''}
                        onChange={(e) =>
                          handleUpdateEntryField(entry.filmId, { curatorNote: e.target.value })
                        }
                        placeholder="Add a brief ranking rationale or standout craft citation..."
                        className="w-full px-3 py-1.5 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                      />

                      {film.review && (
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] line-clamp-2 italic">
                          “{film.review}”
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 4 Columns: Unranked Pool + Official Industry Consensus + Live IMDb Add */}
        <div className="lg:col-span-4 space-y-6">
          {/* Unranked Watched Pool */}
          <div className="p-5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                Unranked {selectedYear} Library Pool ({unrankedPool.length})
              </h4>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-0.5">
                Films from {selectedYear} in your Letterboxd library not yet placed in your ranked list.
              </p>
            </div>

            {unrankedPool.length === 0 ? (
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] py-3 border-t border-[#DED9CE] dark:border-[#262830]">
                All logged films from {selectedYear} have been ranked.
              </p>
            ) : (
              <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border-t border-[#DED9CE] dark:border-[#262830]">
                {unrankedPool.map((film) => (
                  <div
                    key={film.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectFilmForModal(film)}
                        className="text-sm font-medium text-[#181615] dark:text-[#F4F1EA] hover:underline truncate block text-left cursor-pointer"
                      >
                        {film.title}
                      </button>
                      <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] font-mono-tabular">
                        {formatStarString(film.rating)}
                        {film.metadata?.director ? ` · ${film.metadata.director}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFilmToRanking(film)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#0C0C0E] hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Rank</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Official Industry & Critics Consensus for {selectedYear} */}
          {industryConsensusForYear.length > 0 && (
            <div className="p-5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <h4 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  {selectedYear} Industry &amp; Critics Consensus ({industryConsensusForYear.length})
                </h4>
              </div>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Compare your {selectedYear} ranking against Academy Awards, BAFTAs, Sight &amp; Sound, Empire, &amp; EW.
              </p>

              <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border-t border-[#DED9CE] dark:border-[#262830] max-h-80 overflow-y-auto">
                {industryConsensusForYear.map((item) => {
                  const matchedFilm = filmsForYear.find(
                    (f) => f.title.trim().toLowerCase() === item.title.toLowerCase()
                  );
                  const rankedEntry = matchedFilm
                    ? currentRanking.entries.find((e) => e.filmId === matchedFilm.id)
                    : undefined;

                  return (
                    <div key={item.title} className="py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#181615] dark:text-[#F4F1EA] truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                            Dir. {item.director} · Consensus {item.consensusRating.toFixed(1)} ★
                          </div>
                        </div>

                        {rankedEntry ? (
                          <span className="text-[11px] font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            Ranked #{rankedEntry.rank}
                          </span>
                        ) : matchedFilm ? (
                          <button
                            type="button"
                            onClick={() => handleAddFilmToRanking(matchedFilm)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono-tabular bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#0C0C0E] cursor-pointer shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Rank</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              const newId = await onQuickAddFilmFromImdb(
                                item.title,
                                item.year,
                                undefined,
                                item.director
                              );
                              if (films[newId]) {
                                handleAddFilmToRanking(films[newId]);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono-tabular border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 cursor-pointer shrink-0"
                          >
                            <span>+ Log &amp; Rank</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                        {item.citations
                          .map((c) =>
                            c.status === 'Ranked'
                              ? `${c.shortName} #${c.rank}`
                              : `${c.shortName} (${c.status})`
                          )
                          .join(' · ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Add Film from Public IMDb Catalog for Selected Year */}
          <div className="p-5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                Discover &amp; Add {selectedYear} Films (IMDb Public Index)
              </h4>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-0.5">
                Missing a film from {selectedYear}? Search to fetch its poster and credits directly into your {selectedYear} canon.
              </p>
            </div>

            <form onSubmit={handleSearchImdbForYear} className="flex gap-2">
              <input
                type="text"
                value={imdbQuery}
                onChange={(e) => setImdbQuery(e.target.value)}
                placeholder={`Search ${selectedYear} film title...`}
                className="flex-1 px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
              />
              <button
                type="submit"
                disabled={isSearchingImdb}
                className="px-3 py-1.5 text-xs font-medium bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>

            {imdbResults.length > 0 && (
              <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border-t border-[#DED9CE] dark:border-[#262830] max-h-64 overflow-y-auto">
                {imdbResults.map((hit) => (
                  <div
                    key={hit.imdbId}
                    className="py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#181615] dark:text-[#F4F1EA] truncate">
                        {hit.title} ({hit.year || selectedYear})
                      </p>
                      {hit.castSnippet && (
                        <p className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] truncate">
                          {hit.castSnippet}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const targetYr = hit.year || selectedYear;
                        const newId = await onQuickAddFilmFromImdb(
                          hit.title,
                          targetYr,
                          hit.posterUrl,
                          hit.castSnippet
                        );
                        if (targetYr === selectedYear && films[newId]) {
                          handleAddFilmToRanking(films[newId]);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-medium border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + Log Film
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

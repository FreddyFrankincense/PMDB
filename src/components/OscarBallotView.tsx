import React, { useState } from 'react';
import {
  Award,
  Plus,
  Trash2,
  Sparkles,
  Check,
  X,
  ListOrdered,
} from 'lucide-react';
import {
  CategoryBallotState,
  FilmRecord,
  HistoricalCategorySpec,
  OscarDivision,
  OscarNomineeEntry,
  YearlyOscarBallot,
  YearlyRanking,
} from '../types/cinema';
import {
  getCategoriesForYear,
  getCeremonyMeta,
  getSuggestedRecipientsForCategory,
} from '../data/oscarHistoryEngine';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';

interface OscarBallotViewProps {
  selectedYear: number;
  onSelectYear: (year: number) => void;
  films: Record<string, FilmRecord>;
  yearlyRankings: Record<number, YearlyRanking>;
  oscarBallots: Record<number, YearlyOscarBallot>;
  onUpdateYearBallot: (year: number, nextBallot: YearlyOscarBallot) => void;
  onSelectFilmForModal: (film: FilmRecord) => void;
  onNavigateToYearRanking: (year: number) => void;
  onEnrichSingleFilm: (filmId: string) => Promise<void>;
}

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940, 1930, 1920];
const DIVISIONS: Array<'All' | OscarDivision> = [
  'All',
  'Above the Line',
  'Writing',
  'Craft & Technical',
  'Special & Era-Specific',
];

const CEREMONY_HEADER_IMG = '/src/assets/images/academy_ceremony_ledger_1793538461008.jpg';

export const OscarBallotView: React.FC<OscarBallotViewProps> = ({
  selectedYear,
  onSelectYear,
  films,
  yearlyRankings,
  oscarBallots,
  onUpdateYearBallot,
  onSelectFilmForModal,
  onNavigateToYearRanking,
  onEnrichSingleFilm,
}) => {
  const activeDecade = Math.floor(selectedYear / 10) * 10;
  const [selectedDecade, setSelectedDecade] = useState<number>(
    Math.max(1920, Math.min(2020, activeDecade))
  );
  const [activeDivision, setActiveDivision] = useState<'All' | OscarDivision>('All');

  // Active Category Nominee Picker Modal State
  const [nominatingCat, setNominatingCat] = useState<HistoricalCategorySpec | null>(null);
  const [selectedFilmId, setSelectedFilmId] = useState<string>('');
  const [recipientInput, setRecipientInput] = useState<string>('');
  const [roleOrDetailInput, setRoleOrDetailInput] = useState<string>('');

  // Custom Category Modal State
  const [showCustomCatForm, setShowCustomCatForm] = useState(false);
  const [customCatName, setCustomCatName] = useState('');

  const ceremonyMeta = getCeremonyMeta(selectedYear);
  const currentBallot: YearlyOscarBallot = oscarBallots[selectedYear] || {
    year: selectedYear,
    useModernCategoriesOverride: false,
    categories: {},
    customCategories: [],
  };

  const categoriesForYear = getCategoriesForYear(
    selectedYear,
    Boolean(currentBallot.useModernCategoriesOverride),
    currentBallot.customCategories || []
  );

  const visibleCategories =
    activeDivision === 'All'
      ? categoriesForYear
      : categoriesForYear.filter((c) => c.division === activeDivision);

  const yearsInDecade = React.useMemo(() => {
    const start = selectedDecade === 1920 ? 1927 : selectedDecade;
    const end = selectedDecade === 2020 ? 2026 : selectedDecade + 9;
    const arr: number[] = [];
    for (let y = end; y >= start; y--) {
      arr.push(y);
    }
    return arr;
  }, [selectedDecade]);

  // Eligible films from the selected release year, sorted by personal yearly rank first, then Letterboxd rating
  const eligibleFilmsForYear = React.useMemo(() => {
    const rankingForYear = yearlyRankings[selectedYear]?.entries || [];
    const rankMap = new Map<string, number>();
    rankingForYear.forEach((e) => rankMap.set(e.filmId, e.rank));

    return (Object.values(films) as FilmRecord[])
      .filter((f) => f.year === selectedYear)
      .sort((a, b) => {
        const rA = rankMap.get(a.id) ?? 999;
        const rB = rankMap.get(b.id) ?? 999;
        if (rA !== rB) return rA - rB;
        return (b.rating || 0) - (a.rating || 0);
      });
  }, [films, selectedYear, yearlyRankings]);

  // Compute Tally Board for the selected year (Nominations & Wins per film)
  const ceremonyTally = React.useMemo(() => {
    const map = new Map<
      string,
      { film: FilmRecord; nominations: number; wins: number; wonCategories: string[] }
    >();

    for (const catSpec of categoriesForYear) {
      const catState = currentBallot.categories[catSpec.id];
      if (!catState) continue;

      for (const nom of catState.nominees) {
        const film = films[nom.filmId];
        if (!film) continue;
        const current = map.get(film.id) || {
          film,
          nominations: 0,
          wins: 0,
          wonCategories: [],
        };
        current.nominations += 1;
        if (catState.winnerNomineeId === nom.id) {
          current.wins += 1;
          current.wonCategories.push(catSpec.name);
        }
        map.set(film.id, current);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.nominations - a.nominations;
    });
  }, [categoriesForYear, currentBallot.categories, films]);

  const handleOpenNomineePicker = (cat: HistoricalCategorySpec) => {
    setNominatingCat(cat);
    const defaultFilm = eligibleFilmsForYear[0];
    if (defaultFilm) {
      setSelectedFilmId(defaultFilm.id);
      const suggestions = getSuggestedRecipientsForCategory(defaultFilm, cat.creditField);
      setRecipientInput(suggestions[0] || '');
    } else {
      setSelectedFilmId('');
      setRecipientInput('');
    }
    setRoleOrDetailInput('');
  };

  const handleSelectFilmInModal = async (filmId: string, cat: HistoricalCategorySpec) => {
    setSelectedFilmId(filmId);
    const film = films[filmId];
    if (!film) return;

    const suggestions = getSuggestedRecipientsForCategory(film, cat.creditField);
    setRecipientInput(suggestions[0] || '');

    // If film has no credits yet, trigger enrichment automatically
    if (!film.metadata?.director && (!film.metadata?.cast || film.metadata.cast.length === 0)) {
      await onEnrichSingleFilm(filmId);
    }
  };

  const handleAddNomineeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nominatingCat || !selectedFilmId) return;

    const existingCatState: CategoryBallotState = currentBallot.categories[nominatingCat.id] || {
      categoryId: nominatingCat.id,
      nominees: [],
      winnerNomineeId: null,
    };

    const newNominee: OscarNomineeEntry = {
      id: `nom-${selectedYear}-${nominatingCat.id}-${Date.now().toString().slice(-5)}`,
      filmId: selectedFilmId,
      recipientName: recipientInput.trim() || films[selectedFilmId]?.title || 'Nominee',
      roleOrDetail: roleOrDetailInput.trim() || undefined,
    };

    const nextNominees = [...existingCatState.nominees, newNominee];
    const nextWinner = existingCatState.winnerNomineeId || newNominee.id;

    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      categories: {
        ...currentBallot.categories,
        [nominatingCat.id]: {
          ...existingCatState,
          nominees: nextNominees,
          winnerNomineeId: nextWinner,
        },
      },
    });

    setNominatingCat(null);
  };

  const handleSetWinner = (categoryId: string, nomineeId: string) => {
    const existing = currentBallot.categories[categoryId];
    if (!existing) return;
    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      categories: {
        ...currentBallot.categories,
        [categoryId]: {
          ...existing,
          winnerNomineeId: existing.winnerNomineeId === nomineeId ? null : nomineeId,
        },
      },
    });
  };

  const handleRemoveNominee = (categoryId: string, nomineeId: string) => {
    const existing = currentBallot.categories[categoryId];
    if (!existing) return;
    const filtered = existing.nominees.filter((n) => n.id !== nomineeId);
    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      categories: {
        ...currentBallot.categories,
        [categoryId]: {
          ...existing,
          nominees: filtered,
          winnerNomineeId:
            existing.winnerNomineeId === nomineeId
              ? filtered[0]?.id || null
              : existing.winnerNomineeId,
        },
      },
    });
  };

  const handleAutoSeedMajorCategories = () => {
    if (eligibleFilmsForYear.length === 0) return;
    const topFilms = eligibleFilmsForYear.slice(0, 5);
    const nextCategories = { ...currentBallot.categories };

    const seedCat = (catId: string, getRecipient: (f: FilmRecord) => string) => {
      const catSpec = categoriesForYear.find((c) => c.id === catId);
      if (!catSpec) return;
      const existing = nextCategories[catId];
      if (existing && existing.nominees.length > 0) return;

      const nominees: OscarNomineeEntry[] = topFilms.map((f, idx) => ({
        id: `seed-${selectedYear}-${catId}-${idx}`,
        filmId: f.id,
        recipientName: getRecipient(f),
      }));

      nextCategories[catId] = {
        categoryId: catId,
        nominees,
        winnerNomineeId: nominees[0]?.id || null,
      };
    };

    seedCat('best-picture', (f) =>
      f.metadata?.director ? `Produced by / Dir. ${f.metadata.director}` : 'Official Feature Entry'
    );
    seedCat('best-director', (f) => f.metadata?.director || f.title);
    seedCat('best-actor', (f) => f.metadata?.cast?.[0] || 'Lead Performance');
    seedCat('best-actress', (f) => f.metadata?.cast?.[1] || f.metadata?.cast?.[0] || 'Lead Performance');
    seedCat('best-cinematography', (f) => f.metadata?.cinematographer || f.metadata?.director || f.title);
    seedCat(
      'best-original-screenplay',
      (f) => f.metadata?.writers?.join(' & ') || f.metadata?.director || f.title
    );
    seedCat(
      'best-adapted-screenplay',
      (f) => f.metadata?.writers?.join(' & ') || f.metadata?.director || f.title
    );

    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      categories: nextCategories,
    });
  };

  const handleAddCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCatName.trim()) return;
    const newSpec: HistoricalCategorySpec = {
      id: `custom-${Date.now()}`,
      name: customCatName.trim(),
      division: 'Special & Era-Specific',
      startYear: selectedYear,
      maxNominees: 5,
      creditField: 'film',
      recipientPrompt: 'Recipient / Craft Citation',
      eraNote: `Custom personal category created for the ${selectedYear} ballot.`,
    };
    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      customCategories: [...(currentBallot.customCategories || []), newSpec],
    });
    setCustomCatName('');
    setShowCustomCatForm(false);
  };

  return (
    <div className="space-y-8">
      {/* Ceremony Era Banner + Timeline Rail */}
      <div className="border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#141519] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-8 p-6 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular uppercase tracking-widest text-[#9A7B1C] dark:text-[#D4AF37]">
                <span>{ceremonyMeta.ceremonyLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{ceremonyMeta.eraTitle}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                Personal Academy Awards Ledger — {selectedYear}
              </h2>
              <p className="text-xs sm:text-sm text-[#6E6A63] dark:text-[#9A9891] max-w-2xl leading-relaxed">
                {ceremonyMeta.historicalContext}
              </p>
            </div>

            <div className="pt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onUpdateYearBallot(selectedYear, {
                    ...currentBallot,
                    useModernCategoriesOverride: !currentBallot.useModernCategoriesOverride,
                  })
                }
                className={`px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  currentBallot.useModernCategoriesOverride
                    ? 'border-[#9A7B1C] dark:border-[#D4AF37] bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#181615] dark:text-[#F4F1EA]'
                    : 'border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                {currentBallot.useModernCategoriesOverride
                  ? 'Mode: All Modern + Era Categories Unlocked'
                  : `Mode: Historically Accurate ${selectedYear} Categories (${categoriesForYear.length})`}
              </button>

              {eligibleFilmsForYear.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoSeedMajorCategories}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Seed Ballot from {selectedYear} Top Films</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCustomCatForm(!showCustomCatForm)}
                className="px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer whitespace-nowrap shrink-0"
              >
                + Add Custom Category
              </button>

              <button
                type="button"
                onClick={() => onNavigateToYearRanking(selectedYear)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer whitespace-nowrap shrink-0"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>View {selectedYear} Ranked List →</span>
              </button>
            </div>

            {showCustomCatForm && (
              <form onSubmit={handleAddCustomCategory} className="pt-2 flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={customCatName}
                  onChange={(e) => setCustomCatName(e.target.value)}
                  placeholder="e.g. Best Ensemble Performance or Best Stunt Choreography"
                  className="flex-1 px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Create
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-4 relative min-h-[180px] border-t lg:border-t-0 lg:border-l border-[#DED9CE] dark:border-[#262830]">
            <img
              src={CEREMONY_HEADER_IMG}
              alt="Academy Ceremony Statuette and Ballot Ledger"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
              <div className="text-xs text-[#F4F1EA] font-mono-tabular">
                <p className="text-[#D4AF37] uppercase tracking-wider">Ceremony Ledger</p>
                <p>
                  {ceremonyMeta.ceremonyOrdinal} Annual Ceremony · {categoriesForYear.length}{' '}
                  Active Categories
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Decade & Year Scrubber */}
        <div className="p-4 border-t border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
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
                  className={`px-3 py-1 text-xs font-mono-tabular transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#0C0C0E] font-semibold'
                      : 'bg-[#EBE6DF] dark:bg-[#1C1E24] text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  {dec}s
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {yearsInDecade.map((yr) => {
              const isSelected = yr === selectedYear;
              const catCount = Object.keys(oscarBallots[yr]?.categories || {}).length;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => onSelectYear(yr)}
                  className={`px-3 py-1.5 text-xs font-mono-tabular border transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'border-[#9A7B1C] dark:border-[#D4AF37] bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#181615] dark:text-[#F4F1EA] font-semibold'
                      : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                  }`}
                >
                  <span>{yr}</span>
                  {catCount > 0 && (
                    <span className="text-[10px] text-[#9A7B1C] dark:text-[#D4AF37]">
                      ★{catCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ceremony Tally Board (If any nominations exist for this year) */}
      {ceremonyTally.length > 0 && (
        <div className="p-5 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
              {ceremonyMeta.ceremonyOrdinal} Academy Awards — Personal Ceremony Tally Board
            </h3>
            <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
              Sorted by Wins & Nominations
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ceremonyTally.slice(0, 8).map((item) => (
              <div
                key={item.film.id}
                onClick={() => onSelectFilmForModal(item.film)}
                className="p-3 border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9]/50 dark:bg-[#18191E]/60 flex items-center justify-between gap-3 cursor-pointer hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] truncate">
                    {item.film.title}
                  </p>
                  <p className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] truncate">
                    {item.wonCategories.length > 0
                      ? `Won: ${item.wonCategories.join(', ')}`
                      : `Dir. ${item.film.metadata?.director || 'Feature'}`}
                  </p>
                </div>
                <div className="text-right font-mono-tabular shrink-0">
                  <span className="text-xs font-semibold text-[#9A7B1C] dark:text-[#D4AF37] block">
                    {item.wins} {item.wins === 1 ? 'Win' : 'Wins'}
                  </span>
                  <span className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                    {item.nominations} {item.nominations === 1 ? 'Nom' : 'Noms'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Division Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#DED9CE] dark:border-[#262830] pb-3">
        <div className="flex items-center gap-1 p-1 bg-[#EBE6DF] dark:bg-[#18191E] overflow-x-auto">
          {DIVISIONS.map((div) => {
            const active = activeDivision === div;
            return (
              <button
                key={div}
                type="button"
                onClick={() => setActiveDivision(div)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                    : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                }`}
              >
                {div}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-[#6E6A63] dark:text-[#9A9891] font-mono-tabular">
          Showing {visibleCategories.length} of {categoriesForYear.length} Categories for {selectedYear}
        </span>
      </div>

      {/* Category Ballot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleCategories.map((cat) => {
          const catBallot = currentBallot.categories[cat.id];
          const nominees = catBallot?.nominees || [];
          const winnerId = catBallot?.winnerNomineeId;

          return (
            <div
              key={cat.id}
              className="border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] flex flex-col justify-between"
            >
              {/* Category Header */}
              <div className="p-5 border-b border-[#DED9CE] dark:border-[#262830] flex items-start justify-between gap-4 bg-[#F2EFE9]/50 dark:bg-[#16171C]">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                    <span>{cat.division}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {nominees.length}/{cat.maxNominees} Nominees
                    </span>
                  </div>
                  <h3 className="text-xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] mt-0.5">
                    {cat.name}
                  </h3>
                  {cat.eraNote && (
                    <p className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] mt-1 leading-relaxed">
                      {cat.eraNote}
                    </p>
                  )}
                </div>

                {nominees.length < cat.maxNominees && (
                  <button
                    type="button"
                    onClick={() => handleOpenNomineePicker(cat)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nominate</span>
                  </button>
                )}
              </div>

              {/* Nominees List */}
              <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] flex-1">
                {nominees.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                      No nominees recorded for {cat.name} ({selectedYear}).
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenNomineePicker(cat)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add First {selectedYear} Nominee</span>
                    </button>
                  </div>
                ) : (
                  nominees.map((nom) => {
                    const film = films[nom.filmId];
                    const isWinner = winnerId === nom.id;

                    return (
                      <div
                        key={nom.id}
                        className={`p-4 flex items-center gap-3.5 transition-colors ${
                          isWinner
                            ? 'bg-[#9A7B1C]/10 dark:bg-[#D4AF37]/12'
                            : 'hover:bg-[#F2EFE9]/50 dark:hover:bg-[#18191E]/50'
                        }`}
                      >
                        {film && (
                          <div
                            onClick={() => onSelectFilmForModal(film)}
                            className="w-11 shrink-0 cursor-pointer"
                          >
                            <PosterVisual film={film} compact className="w-full aspect-[2/3]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isWinner && (
                              <span className="text-xs font-mono-tabular uppercase tracking-wider font-semibold text-[#9A7B1C] dark:text-[#D4AF37]">
                                ★ Winner
                              </span>
                            )}
                            <p className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA] truncate">
                              {nom.recipientName}
                            </p>
                          </div>

                          <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] truncate mt-0.5">
                            <span className="font-editorial italic text-sm text-[#181615] dark:text-[#F4F1EA]">
                              {film ? film.title : 'Film'}
                            </span>
                            {nom.roleOrDetail ? ` · ${nom.roleOrDetail}` : ''}
                            {film?.rating ? ` · ${formatStarString(film.rating)}` : ''}
                          </p>
                        </div>

                        {/* Crown Winner & Remove Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSetWinner(cat.id, nom.id)}
                            title={isWinner ? 'Current Winner' : 'Crown as Category Winner'}
                            className={`px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                              isWinner
                                ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] border-[#9A7B1C] dark:border-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                                : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                            }`}
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>{isWinner ? 'Winner' : 'Crown'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveNominee(cat.id, nom.id)}
                            title="Remove Nominee"
                            className="p-1.5 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#DC2626] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nominee & Credit Picker Modal */}
      {nominatingCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#DED9CE] dark:border-[#262830]">
              <div>
                <p className="text-xs font-mono-tabular uppercase tracking-wider text-[#9A7B1C] dark:text-[#D4AF37]">
                  {ceremonyMeta.ceremonyOrdinal} Academy Awards · {selectedYear}
                </p>
                <h3 className="text-xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  Add Nominee — {nominatingCat.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNominatingCat(null)}
                className="p-1.5 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNomineeSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-2">
                  1. Select Eligible Film ({selectedYear})
                </label>
                {eligibleFilmsForYear.length === 0 ? (
                  <p className="text-xs text-[#DC2626]">
                    You have no logged films for {selectedYear} yet. Log a film in the Yearly Rankings or Catalog view first.
                  </p>
                ) : (
                  <select
                    value={selectedFilmId}
                    onChange={(e) => handleSelectFilmInModal(e.target.value, nominatingCat)}
                    className="w-full px-3 py-2.5 text-sm bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  >
                    {eligibleFilmsForYear.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title} ({f.year}) — {formatStarString(f.rating)}
                        {f.metadata?.director ? ` · Dir. ${f.metadata.director}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quick Credit Suggestions from Film Metadata */}
              {selectedFilmId && films[selectedFilmId] && (
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                    2. {nominatingCat.recipientPrompt} (Auto-Suggested from Credits)
                  </label>

                  {getSuggestedRecipientsForCategory(
                    films[selectedFilmId],
                    nominatingCat.creditField
                  ).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {getSuggestedRecipientsForCategory(
                        films[selectedFilmId],
                        nominatingCat.creditField
                      ).map((cand) => (
                        <button
                          key={cand}
                          type="button"
                          onClick={() => setRecipientInput(cand)}
                          className={`px-2.5 py-1 text-xs border transition-colors cursor-pointer ${
                            recipientInput === cand
                              ? 'border-[#9A7B1C] dark:border-[#D4AF37] bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#181615] dark:text-[#F4F1EA] font-medium'
                              : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891]'
                          }`}
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    required
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    placeholder={`Enter ${nominatingCat.recipientPrompt}...`}
                    className="w-full px-3 py-2 text-sm bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-1">
                  3. Character Role / Song Title / Craft Citation (Optional)
                </label>
                <input
                  type="text"
                  value={roleOrDetailInput}
                  onChange={(e) => setRoleOrDetailInput(e.target.value)}
                  placeholder="e.g. as Sandra Voyter, or 'I'm Easy'"
                  className="w-full px-3 py-2 text-sm bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
              </div>

              <div className="pt-3 border-t border-[#DED9CE] dark:border-[#262830] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNominatingCat(null)}
                  className="px-4 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFilmId}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Nomination</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

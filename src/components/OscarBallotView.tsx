import React, { useMemo, useState } from 'react';
import {
  Award,
  Plus,
  Trash2,
  Sparkles,
  Check,
  X,
  ListOrdered,
  Trophy,
  Scale,
  CheckCircle2,
  ArrowRightLeft,
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
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import {
  getCategoriesForYear,
  getCeremonyMeta,
  getSuggestedRecipientsForCategory,
} from '../data/oscarHistoryEngine';
import {
  ExternalListEntry,
  INDUSTRY_AND_CRITIC_LISTS,
} from '../data/industryLists';
import { makeFilmId } from '../utils/letterboxdCsvParser';
import { normalizeFilmMatchKey } from '../utils/unifiedArchiveSync';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';
import { ExternalListsView } from './ExternalListsView';
import { FilmGroupCohort } from './GroupHistogramPanel';

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
  profile: ProfileAccount;
  onUpdateProfileFilms: (films: FilmEntry[]) => void;
  onQuickAddFilmToArchive?: (
    title: string,
    year: number,
    director?: string
  ) => Promise<string>;
  onOpenCohortInAnalytics?: (cohort: FilmGroupCohort) => void;
}

type AwardsStudioMode = 'personal_ballot' | 'head_to_head' | 'industry_polls';

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
  profile,
  onUpdateProfileFilms,
  onQuickAddFilmToArchive,
  onOpenCohortInAnalytics,
}) => {
  const [studioMode, setStudioMode] = useState<AwardsStudioMode>('personal_ballot');

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

  const yearsInDecade = useMemo(() => {
    const start = selectedDecade === 1920 ? 1927 : selectedDecade;
    const end = selectedDecade === 2020 ? 2026 : selectedDecade + 9;
    const arr: number[] = [];
    for (let y = end; y >= start; y--) {
      arr.push(y);
    }
    return arr;
  }, [selectedDecade]);

  // Build lookup of Official Academy Awards & Major Industry Awards by year and by normalized title::year
  const officialAwardsIndex = useMemo(() => {
    const oscarsList = INDUSTRY_AND_CRITIC_LISTS.find(
      (l) => l.id === 'academy-awards-oscars'
    );
    const baftaList = INDUSTRY_AND_CRITIC_LISTS.find((l) => l.id === 'bafta-film-awards');
    const globesList = INDUSTRY_AND_CRITIC_LISTS.find((l) => l.id === 'golden-globes');
    const guildsList = INDUSTRY_AND_CRITIC_LISTS.find(
      (l) => l.id === 'guild-awards-pga-dga-sag'
    );

    const oscarsByYear = new Map<number, ExternalListEntry[]>();
    const allAwardsByTitleYear = new Map<
      string,
      Array<{ org: string; status: string; detail: string; ceremony: string }>
    >();

    const registerList = (orgLabel: string, entries: ExternalListEntry[] = []) => {
      entries.forEach((e) => {
        const key = `${e.title.trim().toLowerCase()}::${e.year}`;
        const existing = allAwardsByTitleYear.get(key) || [];
        existing.push({
          org: orgLabel,
          status: e.status,
          detail: e.accoladeDetail,
          ceremony: e.ceremonyOrIssue,
        });
        allAwardsByTitleYear.set(key, existing);

        if (orgLabel === 'Academy Awards') {
          const yrArr = oscarsByYear.get(e.year) || [];
          yrArr.push(e);
          oscarsByYear.set(e.year, yrArr);
        }
      });
    };

    registerList('Academy Awards', oscarsList?.entries);
    registerList('BAFTA', baftaList?.entries);
    registerList('Golden Globes', globesList?.entries);
    registerList('PGA/DGA/SAG', guildsList?.entries);

    return { oscarsByYear, allAwardsByTitleYear };
  }, []);

  // Build Personal Oscar & Yearly Rank lookup by normalized title::year so ExternalListsView & Head-to-Head can compare
  const { personalOscarByTitleYear, personalYearRankByTitleYear } = useMemo(() => {
    const oscarMap: Record<
      string,
      { nominations: string[]; wins: string[]; isBestPictureWinner: boolean }
    > = {};
    const rankMap: Record<string, number> = {};

    (Object.values(yearlyRankings) as YearlyRanking[]).forEach((yr) => {
      yr.entries.forEach((entry) => {
        const film = films[entry.filmId];
        if (film) {
          rankMap[`${film.title.trim().toLowerCase()}::${film.year}`] = entry.rank;
          rankMap[normalizeFilmMatchKey(film.title, film.year)] = entry.rank;
        }
      });
    });

    (Object.values(oscarBallots) as YearlyOscarBallot[]).forEach((ballot) => {
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
          const film = films[nom.filmId];
          if (!film) continue;
          const keys = [
            `${film.title.trim().toLowerCase()}::${film.year}`,
            normalizeFilmMatchKey(film.title, film.year),
          ];
          for (const key of keys) {
            if (!oscarMap[key]) {
              oscarMap[key] = {
                nominations: [],
                wins: [],
                isBestPictureWinner: false,
              };
            }
            if (!oscarMap[key].nominations.includes(catName)) {
              oscarMap[key].nominations.push(catName);
            }
            if (catState.winnerNomineeId === nom.id) {
              if (!oscarMap[key].wins.includes(catName)) {
                oscarMap[key].wins.push(catName);
              }
              if (catId === 'best-picture') {
                oscarMap[key].isBestPictureWinner = true;
              }
            }
          }
        }
      }
    });

    return { personalOscarByTitleYear: oscarMap, personalYearRankByTitleYear: rankMap };
  }, [films, oscarBallots, yearlyRankings]);

  // Eligible films from the selected release year, sorted by personal yearly rank first, then Letterboxd rating
  const eligibleFilmsForYear = useMemo(() => {
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
  const ceremonyTally = useMemo(() => {
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

  // Selected Year Comparison: Official Academy Results vs. Your Personal Choices
  const selectedYearComparison = useMemo(() => {
    const officialOscarEntries = officialAwardsIndex.oscarsByYear.get(selectedYear) || [];
    const officialWinner = officialOscarEntries.find((e) => e.status === 'Winner') || null;
    const officialNominees = officialOscarEntries.filter((e) => e.status === 'Nominee');

    const bpCat = currentBallot.categories['best-picture'];
    const personalBpWinnerNom = bpCat?.nominees.find(
      (n) => n.id === bpCat.winnerNomineeId
    );
    const personalBpWinnerFilm = personalBpWinnerNom
      ? films[personalBpWinnerNom.filmId] || null
      : null;

    const topRankedEntry = yearlyRankings[selectedYear]?.entries.find((e) => e.rank === 1);
    const personalTopRankedFilm = topRankedEntry ? films[topRankedEntry.filmId] || null : null;

    let alignmentVerdict: 'exact_match' | 'shared_nominee' | 'personal_overrule' | 'pending' =
      'pending';

    if (personalBpWinnerFilm && officialWinner) {
      if (
        personalBpWinnerFilm.title.trim().toLowerCase() ===
        officialWinner.title.trim().toLowerCase()
      ) {
        alignmentVerdict = 'exact_match';
      } else {
        const isOfficialContender = officialOscarEntries.some(
          (e) =>
            e.title.trim().toLowerCase() ===
            personalBpWinnerFilm.title.trim().toLowerCase()
        );
        alignmentVerdict = isOfficialContender ? 'shared_nominee' : 'personal_overrule';
      }
    } else if (personalBpWinnerFilm) {
      alignmentVerdict = 'personal_overrule';
    }

    return {
      officialOscarEntries,
      officialWinner,
      officialNominees,
      personalBpWinnerFilm,
      personalTopRankedFilm,
      alignmentVerdict,
    };
  }, [currentBallot.categories, films, officialAwardsIndex.oscarsByYear, selectedYear, yearlyRankings]);

  // All-Years Head-to-Head Comparison Matrix (across all years with Official Oscars or Personal Ballots/Rankings)
  const headToHeadRows = useMemo(() => {
    const yearsSet = new Set<number>();
    officialAwardsIndex.oscarsByYear.forEach((_, yr) => yearsSet.add(yr));
    Object.keys(oscarBallots).forEach((yrStr) => {
      const yr = Number(yrStr);
      if (Object.keys(oscarBallots[yr]?.categories || {}).length > 0) {
        yearsSet.add(yr);
      }
    });
    Object.keys(yearlyRankings).forEach((yrStr) => {
      const yr = Number(yrStr);
      if ((yearlyRankings[yr]?.entries || []).length > 0) {
        yearsSet.add(yr);
      }
    });

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

    return sortedYears.map((yr) => {
      const meta = getCeremonyMeta(yr);
      const officialEntries = officialAwardsIndex.oscarsByYear.get(yr) || [];
      const officialWinners = officialEntries.filter((e) => e.status === 'Winner');
      const officialNominees = officialEntries.filter((e) => e.status === 'Nominee');

      const ballot = oscarBallots[yr];
      const bpState = ballot?.categories?.['best-picture'];
      const bpWinnerNom = bpState?.nominees.find((n) => n.id === bpState.winnerNomineeId);
      const personalWinnerFilm = bpWinnerNom ? films[bpWinnerNom.filmId] || null : null;

      const dirState = ballot?.categories?.['best-director'];
      const dirWinnerNom = dirState?.nominees.find((n) => n.id === dirState.winnerNomineeId);
      const personalDirectorWinner = dirWinnerNom
        ? `${dirWinnerNom.recipientName} (${films[dirWinnerNom.filmId]?.title || ''})`
        : null;

      const rank1Entry = yearlyRankings[yr]?.entries.find((e) => e.rank === 1);
      const rank1Film = rank1Entry ? films[rank1Entry.filmId] || null : null;

      const totalBallotedCategories = Object.values(ballot?.categories || {}).filter(
        (c) => c.nominees.length > 0
      ).length;

      let status: 'match' | 'alternate_contender' | 'overrule' | 'unballoted' = 'unballoted';
      if (personalWinnerFilm) {
        const matchesWinner = officialWinners.some(
          (w) =>
            w.title.trim().toLowerCase() ===
            personalWinnerFilm.title.trim().toLowerCase()
        );
        const matchesNominee = officialEntries.some(
          (e) =>
            e.title.trim().toLowerCase() ===
            personalWinnerFilm.title.trim().toLowerCase()
        );
        if (matchesWinner) {
          status = 'match';
        } else if (matchesNominee) {
          status = 'alternate_contender';
        } else {
          status = 'overrule';
        }
      }

      // Check how user rated the official Best Picture winner
      const primaryOfficialWinner = officialWinners[0] || null;
      const officialWinnerFilmInArchive = primaryOfficialWinner
        ? (Object.values(films) as FilmRecord[]).find(
            (f) =>
              f.title.trim().toLowerCase() ===
                primaryOfficialWinner.title.trim().toLowerCase() && f.year === yr
          ) || null
        : null;

      return {
        year: yr,
        ceremonyLabel: meta.ceremonyLabel,
        officialWinners,
        officialNominees,
        officialWinnerFilmInArchive,
        personalWinnerFilm,
        personalDirectorWinner,
        rank1Film,
        totalBallotedCategories,
        status,
      };
    });
  }, [films, officialAwardsIndex.oscarsByYear, oscarBallots, yearlyRankings]);

  // Nominate an official contender directly into the current year's Best Picture ballot
  const handleQuickNominateOfficialEntry = async (
    entry: ExternalListEntry,
    makeWinner: boolean
  ) => {
    let filmId = makeFilmId(entry.title, entry.year);
    const existingFilm =
      films[filmId] ||
      (Object.values(films) as FilmRecord[]).find(
        (f) =>
          f.title.trim().toLowerCase() === entry.title.trim().toLowerCase() &&
          f.year === entry.year
      );

    if (existingFilm) {
      filmId = existingFilm.id;
    } else if (onQuickAddFilmToArchive) {
      filmId = await onQuickAddFilmToArchive(entry.title, entry.year, entry.director);
    }

    const bpSpec = categoriesForYear.find((c) => c.id === 'best-picture');
    if (!bpSpec) return;

    const existingCat: CategoryBallotState = currentBallot.categories['best-picture'] || {
      categoryId: 'best-picture',
      nominees: [],
      winnerNomineeId: null,
    };

    const alreadyNominee = existingCat.nominees.find((n) => n.filmId === filmId);
    if (alreadyNominee) {
      if (makeWinner) {
        onUpdateYearBallot(selectedYear, {
          ...currentBallot,
          categories: {
            ...currentBallot.categories,
            'best-picture': {
              ...existingCat,
              winnerNomineeId: alreadyNominee.id,
            },
          },
        });
      }
      return;
    }

    const newNom: OscarNomineeEntry = {
      id: `nom-${selectedYear}-bp-${Date.now().toString().slice(-5)}`,
      filmId,
      recipientName: entry.director ? `Dir. ${entry.director}` : entry.title,
      roleOrDetail: entry.accoladeDetail,
    };

    const nextNominees = [...existingCat.nominees, newNom];
    onUpdateYearBallot(selectedYear, {
      ...currentBallot,
      categories: {
        ...currentBallot.categories,
        'best-picture': {
          ...existingCat,
          nominees: nextNominees,
          winnerNomineeId: makeWinner
            ? newNom.id
            : existingCat.winnerNomineeId || newNom.id,
        },
      },
    });
  };

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
    <div className="space-y-6">
      {/* Unified Awards & Polls Mode Switcher Bar */}
      <div className="p-4 border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#141519] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-[#9A7B1C] dark:text-[#D4AF37]">
            Unified Awards & Consensus Studio (1927–2026)
          </div>
          <h2 className="text-xl sm:text-2xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
            Personal Academy Ballots vs. Official Industry Awards & Critics Polls
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#EBE6DF] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830]">
          <button
            type="button"
            onClick={() => setStudioMode('personal_ballot')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              studioMode === 'personal_ballot'
                ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>1. Personal Oscars Ballot ({selectedYear})</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioMode('head_to_head')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              studioMode === 'head_to_head'
                ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>2. Personal vs. Academy Comparison</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioMode('industry_polls')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              studioMode === 'industry_polls'
                ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                : 'text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>3. Industry Awards, BAFTA, Globes & Critics Polls</span>
          </button>
        </div>
      </div>

      {/* MODE 3: INDUSTRY AWARDS, BAFTA, GOLDEN GLOBES, GUILDS & CRITICS POLLS */}
      {studioMode === 'industry_polls' && (
        <ExternalListsView
          profile={profile}
          onUpdateFilms={onUpdateProfileFilms}
          personalOscarByTitleYear={personalOscarByTitleYear}
          personalYearRankByTitleYear={personalYearRankByTitleYear}
          onNavigateToPersonalOscarBallots={(year) => {
            if (year) {
              onSelectYear(year);
              setSelectedDecade(Math.max(1920, Math.min(2020, Math.floor(year / 10) * 10)));
            }
            setStudioMode('personal_ballot');
          }}
          onInspectFilm={async (title, year, director) => {
            const existing = (Object.values(films) as FilmRecord[]).find(
              (f) => normalizeFilmMatchKey(f.title, f.year) === normalizeFilmMatchKey(title, year)
            );
            if (existing) {
              onSelectFilmForModal(existing);
            } else if (onQuickAddFilmToArchive) {
              const newId = await onQuickAddFilmToArchive(title, year, director);
              const created = films[newId] || {
                id: newId,
                title,
                year,
                rating: 4.5,
                liked: true,
                listIds: [],
                metadata: { director },
              };
              onSelectFilmForModal(created);
            }
          }}
          onOpenCohortInAnalytics={onOpenCohortInAnalytics}
        />
      )}

      {/* MODE 2: ALL-YEARS HEAD-TO-HEAD (YOUR PERSONAL BALLOTS VS. OFFICIAL ACADEMY RESULTS) */}
      {studioMode === 'head_to_head' && (
        <div className="space-y-6">
          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
              <div className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Ceremonies Compared
              </div>
              <div className="text-2xl font-editorial font-bold font-mono-tabular text-[#181615] dark:text-[#F4F1EA] mt-1">
                {headToHeadRows.length} Years
              </div>
              <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] mt-1 font-mono-tabular">
                1st Oscars (1927/28) to Present
              </div>
            </div>

            <div className="p-4 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
              <div className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Exact Best Picture Agreement
              </div>
              <div className="text-2xl font-editorial font-bold font-mono-tabular text-emerald-600 dark:text-emerald-400 mt-1">
                {headToHeadRows.filter((r) => r.status === 'match').length} Ceremonies
              </div>
              <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] mt-1 font-mono-tabular">
                Where your personal winner matches AMPAS
              </div>
            </div>

            <div className="p-4 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
              <div className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Personal Overrules & Alternate Winners
              </div>
              <div className="text-2xl font-editorial font-bold font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37] mt-1">
                {
                  headToHeadRows.filter(
                    (r) => r.status === 'overrule' || r.status === 'alternate_contender'
                  ).length
                }{' '}
                Ceremonies
              </div>
              <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] mt-1 font-mono-tabular">
                Where you crowned a different Best Picture
              </div>
            </div>

            <div className="p-4 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
              <div className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Unballoted Landmark Ceremonies
              </div>
              <div className="text-2xl font-editorial font-bold font-mono-tabular text-[#181615] dark:text-[#F4F1EA] mt-1">
                {headToHeadRows.filter((r) => r.status === 'unballoted').length} Years
              </div>
              <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] mt-1 font-mono-tabular">
                Click any row to open & curate that year’s ballot
              </div>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#16171C] text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  <th className="py-3 px-4">Year / Ceremony</th>
                  <th className="py-3 px-4">Official Academy Winner & Contenders</th>
                  <th className="py-3 px-4">Your Rating of Academy Winner</th>
                  <th className="py-3 px-4 text-[#9A7B1C] dark:text-[#D4AF37]">
                    Your Personal Best Picture Winner
                  </th>
                  <th className="py-3 px-4">Your #1 Ranked Film of Year</th>
                  <th className="py-3 px-4">Alignment Verdict</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DED9CE] dark:divide-[#262830]">
                {headToHeadRows.map((row) => (
                  <tr
                    key={row.year}
                    className="hover:bg-[#F2EFE9]/60 dark:hover:bg-[#18191E]/60 transition-colors"
                  >
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono-tabular font-semibold text-sm text-[#181615] dark:text-[#F4F1EA]">
                        {row.year}
                      </div>
                      <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                        {row.ceremonyLabel}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-xs">
                      {row.officialWinners.length > 0 ? (
                        <div className="space-y-1">
                          {row.officialWinners.map((w) => (
                            <div key={w.title} className="font-medium text-[#181615] dark:text-[#F4F1EA]">
                              <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-mono-tabular mr-1">
                                ★ AMPAS Winner:
                              </span>
                              <span className="font-editorial text-sm font-semibold">
                                {w.title}
                              </span>
                              <span className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] block">
                                {w.accoladeDetail}
                              </span>
                            </div>
                          ))}
                          {row.officialNominees.length > 0 && (
                            <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] pt-0.5">
                              Nominees: {row.officialNominees.map((n) => n.title).join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#6E6A63] dark:text-[#9A9891]">
                          Historical Ceremony ({row.year})
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top font-mono-tabular">
                      {row.officialWinnerFilmInArchive ? (
                        <div>
                          <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-semibold">
                            {formatStarString(row.officialWinnerFilmInArchive.rating)}
                          </span>
                          <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">
                            Logged in Archive
                          </span>
                        </div>
                      ) : row.officialWinners[0] ? (
                        <span className="text-[#6E6A63] dark:text-[#9A9891]">
                          Unlogged (Consensus {row.officialWinners[0].consensusRating.toFixed(1)}★)
                        </span>
                      ) : (
                        <span className="text-[#6E6A63] dark:text-[#9A9891]">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      {row.personalWinnerFilm ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => onSelectFilmForModal(row.personalWinnerFilm!)}
                            className="font-editorial text-sm font-semibold text-[#181615] dark:text-[#F4F1EA] hover:text-[#9A7B1C] dark:hover:text-[#D4AF37] cursor-pointer text-left"
                          >
                            ★ {row.personalWinnerFilm.title}
                          </button>
                          <div className="text-[11px] font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                            {formatStarString(row.personalWinnerFilm.rating)} ·{' '}
                            {row.totalBallotedCategories} Categories Balloted
                          </div>
                          {row.personalDirectorWinner && (
                            <div className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                              Personal Best Director: {row.personalDirectorWinner}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#6E6A63] dark:text-[#9A9891] italic">
                          No Personal Best Picture Crowned
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      {row.rank1Film ? (
                        <div>
                          <span className="font-editorial text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                            #1 {row.rank1Film.title}
                          </span>
                          <span className="block text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                            {formatStarString(row.rank1Film.rating)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#6E6A63] dark:text-[#9A9891]">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top font-mono-tabular">
                      {row.status === 'match' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓ Matches Academy Winner
                        </span>
                      )}
                      {row.status === 'alternate_contender' && (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          ⇄ Crowned Official Nominee
                        </span>
                      )}
                      {row.status === 'overrule' && (
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">
                          ★ Personal Overrule Pick
                        </span>
                      )}
                      {row.status === 'unballoted' && (
                        <span className="text-[#6E6A63] dark:text-[#9A9891]">
                          Ballot Open
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectYear(row.year);
                          setSelectedDecade(
                            Math.max(1920, Math.min(2020, Math.floor(row.year / 10) * 10))
                          );
                          setStudioMode('personal_ballot');
                        }}
                        className="px-2.5 py-1 text-xs font-medium border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer whitespace-nowrap"
                      >
                        Open {row.year} Ballot →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODE 1: PERSONAL OSCAR BALLOT EDITOR + OFFICIAL ACADEMY RESULTS COMPARISON BANNER */}
      {studioMode === 'personal_ballot' && (
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
                  <form
                    onSubmit={handleAddCustomCategory}
                    className="pt-2 flex items-center gap-2 max-w-md"
                  >
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

              <div className="flex flex-wrap items-center gap-2">
                {yearsInDecade.map((yr) => {
                  const isSelected = yr === selectedYear;
                  const catCount = Object.keys(oscarBallots[yr]?.categories || {}).length;
                  const hasOfficial = officialAwardsIndex.oscarsByYear.has(yr);
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
                      {hasOfficial && catCount === 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-400/70"
                          title="Official Academy results indexed for this year"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* PERSONAL CHOICE VS. ACTUAL ACADEMY AWARDS COMPARISON PANEL FOR SELECTED YEAR */}
          <div className="p-5 bg-[#FBF9F5] dark:bg-[#121316] border border-[#9A7B1C]/40 dark:border-[#D4AF37]/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DED9CE] dark:border-[#262830] pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <h3 className="text-sm font-mono-tabular uppercase tracking-wider text-[#181615] dark:text-[#F4F1EA] font-semibold">
                  {selectedYear} Comparison: Your Personal Ballot vs. Official Academy & Industry Results
                </h3>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono-tabular">
                {selectedYearComparison.alignmentVerdict === 'exact_match' && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✓ Your Best Picture Winner Matches the Academy
                  </span>
                )}
                {selectedYearComparison.alignmentVerdict === 'shared_nominee' && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    ⇄ You Crowned an Official Academy Nominee Over the Winner
                  </span>
                )}
                {selectedYearComparison.alignmentVerdict === 'personal_overrule' && (
                  <span className="text-sky-600 dark:text-sky-400 font-semibold">
                    ★ Personal Overrule: You Crowned an Independent Choice
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setStudioMode('head_to_head')}
                  className="text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer"
                >
                  Compare All Years →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column 1: Your Personal Best Picture & #1 Ranked Film */}
              <div className="p-4 bg-[#F2EFE9]/60 dark:bg-[#16171C] border border-[#DED9CE] dark:border-[#262830] space-y-2">
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#9A7B1C] dark:text-[#D4AF37]">
                  Your {selectedYear} Personal Crown
                </div>
                {selectedYearComparison.personalBpWinnerFilm ? (
                  <div>
                    <p className="text-lg font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                      ★ {selectedYearComparison.personalBpWinnerFilm.title}
                    </p>
                    <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] font-mono-tabular">
                      Your Rating:{' '}
                      <strong className="text-[#9A7B1C] dark:text-[#D4AF37]">
                        {formatStarString(selectedYearComparison.personalBpWinnerFilm.rating)}
                      </strong>
                      {selectedYearComparison.personalBpWinnerFilm.metadata?.director
                        ? ` · Dir. ${selectedYearComparison.personalBpWinnerFilm.metadata.director}`
                        : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] italic">
                    No Personal Best Picture winner crowned for {selectedYear} yet.
                  </p>
                )}

                {selectedYearComparison.personalTopRankedFilm && (
                  <div className="pt-2 border-t border-[#DED9CE] dark:border-[#262830] text-xs text-[#6E6A63] dark:text-[#9A9891]">
                    Your #1 Ranked Film of {selectedYear}:{' '}
                    <strong className="text-[#181615] dark:text-[#F4F1EA]">
                      {selectedYearComparison.personalTopRankedFilm.title}
                    </strong>{' '}
                    ({formatStarString(selectedYearComparison.personalTopRankedFilm.rating)})
                  </div>
                )}
              </div>

              {/* Column 2: Official Academy Best Picture Winner */}
              <div className="p-4 bg-[#F2EFE9]/60 dark:bg-[#16171C] border border-[#DED9CE] dark:border-[#262830] space-y-2">
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Official Academy Best Picture Winner
                </div>
                {selectedYearComparison.officialWinner ? (
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                          {selectedYearComparison.officialWinner.title}
                        </p>
                        <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                          {selectedYearComparison.officialWinner.accoladeDetail}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickNominateOfficialEntry(
                            selectedYearComparison.officialWinner!,
                            true
                          )
                        }
                        className="px-2.5 py-1 text-[11px] font-mono-tabular border border-[#9A7B1C] dark:border-[#D4AF37] text-[#9A7B1C] dark:text-[#D4AF37] hover:bg-[#9A7B1C]/10 dark:hover:bg-[#D4AF37]/10 cursor-pointer shrink-0"
                      >
                        Crown on My Ballot
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                    {ceremonyMeta.historicalContext}
                  </p>
                )}
              </div>

              {/* Column 3: Official Academy & Industry Nominees for Selected Year */}
              <div className="p-4 bg-[#F2EFE9]/60 dark:bg-[#16171C] border border-[#DED9CE] dark:border-[#262830] space-y-2">
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Official {selectedYear} Contenders (1-Click Nominate)
                </div>
                {selectedYearComparison.officialOscarEntries.length > 0 ? (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {selectedYearComparison.officialOscarEntries.map((entry) => {
                      const bpNoms = currentBallot.categories['best-picture']?.nominees || [];
                      const isOnPersonalBallot = bpNoms.some((n) => {
                        const f = films[n.filmId];
                        return (
                          f &&
                          f.title.trim().toLowerCase() === entry.title.trim().toLowerCase()
                        );
                      });

                      return (
                        <div
                          key={entry.title}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="truncate">
                            <span className="font-medium text-[#181615] dark:text-[#F4F1EA]">
                              {entry.title}
                            </span>{' '}
                            <span className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                              ({entry.status})
                            </span>
                          </div>
                          {isOnPersonalBallot ? (
                            <span className="text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400 shrink-0 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              On Ballot
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleQuickNominateOfficialEntry(entry, false)}
                              className="text-[11px] font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer shrink-0"
                            >
                              + Nominate
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                    Use Auto-Seed or "+ Nominate" on any category card below to build your {selectedYear} ballot from your logged films.
                  </p>
                )}
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
                  Sorted by Personal Wins & Nominations
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {ceremonyTally.slice(0, 8).map((item) => {
                  const officialBadges =
                    officialAwardsIndex.allAwardsByTitleYear.get(
                      `${item.film.title.trim().toLowerCase()}::${item.film.year}`
                    ) || [];

                  return (
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
                            ? `Personal Wins: ${item.wonCategories.join(', ')}`
                            : `Dir. ${item.film.metadata?.director || 'Feature'}`}
                        </p>
                        {officialBadges.length > 0 && (
                          <p className="text-[10px] font-mono-tabular text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                            Official: {officialBadges.map((b) => `${b.org} ${b.status}`).join(' · ')}
                          </p>
                        )}
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
                  );
                })}
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
              Showing {visibleCategories.length} of {categoriesForYear.length} Categories for{' '}
              {selectedYear}
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
                        const officialRecognition = film
                          ? officialAwardsIndex.allAwardsByTitleYear.get(
                              `${film.title.trim().toLowerCase()}::${film.year}`
                            ) || []
                          : [];

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
                                <PosterVisual
                                  film={film}
                                  compact
                                  className="w-full aspect-[2/3]"
                                />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {isWinner && (
                                  <span className="text-xs font-mono-tabular uppercase tracking-wider font-semibold text-[#9A7B1C] dark:text-[#D4AF37]">
                                    ★ Personal Winner
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

                              {officialRecognition.length > 0 && (
                                <p className="text-[10px] font-mono-tabular text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                                  Official Awards:{' '}
                                  {officialRecognition
                                    .map((r) => `${r.org} ${r.status}`)
                                    .join(' · ')}
                                </p>
                              )}
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
        </div>
      )}

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

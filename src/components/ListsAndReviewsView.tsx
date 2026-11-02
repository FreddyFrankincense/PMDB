import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  BookOpen,
  Layers,
  BarChart2,
  Download,
  Search,
  GitCompare,
  Award,
  ListOrdered,
  X,
} from 'lucide-react';
import { FilmRecord, LetterboxdList } from '../types/cinema';
import { FilmEntry } from '../types/letterboxd';
import { inferTierFromRating } from '../data/filmCatalog';
import { computeWordDiff } from '../utils/baselineDiff';
import { FilmGroupCohort } from './GroupHistogramPanel';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';

interface ListsAndReviewsViewProps {
  films: Record<string, FilmRecord>;
  lists: LetterboxdList[];
  onUpdateLists: (nextLists: LetterboxdList[]) => void;
  onSelectFilmForModal: (film: FilmRecord) => void;
  profileFilms?: FilmEntry[];
  baselineFilms?: FilmEntry[];
  yearRankByTitleYear?: Map<string, number>;
  personalOscarByTitleYear?: Map<string, { nominations: string[]; wins: string[] }>;
  onOpenCohortInAnalytics?: (cohort: FilmGroupCohort) => void;
}

type ReviewMatchMode = 'phrase' | 'whole_word' | 'all_words' | 'any_word';

const SUGGESTED_REVIEW_PHRASES = [
  'action-packed',
  'slow-burn',
  'practical effects',
  'haunting score',
  'career-best performance',
  'visceral cinematography',
  'third act',
  'bleak atmosphere',
  'rewatchable',
  'chiaroscuro',
  '35mm',
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evaluateReviewSearch(
  reviewText: string,
  rawQuery: string,
  mode: ReviewMatchMode
): { matches: boolean; highlightTerms: string[] } {
  const cleaned = rawQuery
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  if (!cleaned) {
    return { matches: true, highlightTerms: [] };
  }
  const lowerReview = reviewText.toLowerCase();
  const lowerQuery = cleaned.toLowerCase();

  if (mode === 'phrase') {
    const matches = lowerReview.includes(lowerQuery);
    return { matches, highlightTerms: matches ? [cleaned] : [] };
  }
  if (mode === 'whole_word') {
    const pattern = new RegExp(
      `(?:^|[^a-zA-Z0-9])(${escapeRegExp(cleaned)})(?=$|[^a-zA-Z0-9])`,
      'i'
    );
    const matches = pattern.test(reviewText);
    return { matches, highlightTerms: matches ? [cleaned] : [] };
  }
  const words = cleaned
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return { matches: true, highlightTerms: [] };

  if (mode === 'all_words') {
    const matches = words.every((w) => lowerReview.includes(w.toLowerCase()));
    return { matches, highlightTerms: matches ? words : [] };
  }
  const matchedWords = words.filter((w) => lowerReview.includes(w.toLowerCase()));
  return {
    matches: matchedWords.length > 0,
    highlightTerms: matchedWords,
  };
}

function renderHighlightedReviewText(
  text: string,
  highlightTerms: string[]
): React.ReactNode {
  const validTerms = Array.from(
    new Set(highlightTerms.map((t) => t.trim()).filter(Boolean))
  ).sort((a, b) => b.length - a.length);
  if (validTerms.length === 0) return text;

  const regex = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    const isMatch = validTerms.some(
      (term) => term.toLowerCase() === part.toLowerCase()
    );
    return isMatch ? (
      <mark
        key={idx}
        className="bg-amber-500/30 text-amber-800 dark:text-amber-200 px-1 py-0.5 rounded font-medium"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    );
  });
}

export const ListsAndReviewsView: React.FC<ListsAndReviewsViewProps> = ({
  films,
  lists,
  onUpdateLists,
  onSelectFilmForModal,
  profileFilms = [],
  baselineFilms = [],
  yearRankByTitleYear,
  personalOscarByTitleYear,
  onOpenCohortInAnalytics,
}) => {
  const [subTab, setSubTab] = useState<'lists' | 'reviews'>('lists');
  const [selectedListId, setSelectedListId] = useState<string>(lists[0]?.id || '');

  // New List Creator State
  const [showNewListForm, setShowNewListForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');

  // Add Film to List State
  const [filmToAddId, setFilmToAddId] = useState('');
  const [entryNote, setEntryNote] = useState('');

  // FrameSheet Review Phrase Search & Deviation Filter State
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewMatchMode, setReviewMatchMode] = useState<ReviewMatchMode>('phrase');
  const [onlyModifiedReviews, setOnlyModifiedReviews] = useState(false);

  const activeList = lists.find((l) => l.id === selectedListId) || lists[0];

  // Lookup map for baseline reviews by title::year
  const baselineByTitleYear = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const bf of baselineFilms) {
      map.set(`${bf.title.trim().toLowerCase()}::${bf.year}`, bf);
    }
    return map;
  }, [baselineFilms]);

  const profileByTitleYear = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const pf of profileFilms) {
      map.set(`${pf.title.trim().toLowerCase()}::${pf.year}`, pf);
    }
    return map;
  }, [profileFilms]);

  const reviewedFilms = React.useMemo(() => {
    return (Object.values(films) as FilmRecord[])
      .filter((f) => Boolean(f.review && f.review.trim().length > 0))
      .sort((a, b) => (b.watchedDate || '').localeCompare(a.watchedDate || ''));
  }, [films]);

  const filteredReviewedFilms = useMemo(() => {
    return reviewedFilms.filter((f) => {
      const reviewText = f.review || '';
      const evalRes = evaluateReviewSearch(reviewText, reviewQuery, reviewMatchMode);
      if (!evalRes.matches) return false;

      if (onlyModifiedReviews) {
        const key = `${f.title.trim().toLowerCase()}::${f.year}`;
        const base = baselineByTitleYear.get(key);
        if (!base) return true;
        return (base.notes || '').trim() !== reviewText.trim();
      }
      return true;
    });
  }, [reviewedFilms, reviewQuery, reviewMatchMode, onlyModifiedReviews, baselineByTitleYear]);

  const allFilmsSorted = React.useMemo(() => {
    return (Object.values(films) as FilmRecord[]).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [films]);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const created: LetterboxdList = {
      id: `list-custom-${Date.now()}`,
      name: newListName.trim(),
      description: newListDesc.trim() || 'Curated personal film collection.',
      createdDate: new Date().toISOString().slice(0, 10),
      isRanked: true,
      entries: [],
    };
    const next = [created, ...lists];
    onUpdateLists(next);
    setSelectedListId(created.id);
    setNewListName('');
    setNewListDesc('');
    setShowNewListForm(false);
  };

  const handleAddFilmToActiveList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList || !filmToAddId) return;
    if (activeList.entries.some((ent) => ent.filmId === filmToAddId)) return;

    const updatedList: LetterboxdList = {
      ...activeList,
      entries: [
        ...activeList.entries,
        {
          filmId: filmToAddId,
          position: activeList.entries.length + 1,
          notes: entryNote.trim() || undefined,
        },
      ],
    };

    onUpdateLists(lists.map((l) => (l.id === activeList.id ? updatedList : l)));
    setEntryNote('');
  };

  const handleRemoveFilmFromList = (listId: string, filmId: string) => {
    const target = lists.find((l) => l.id === listId);
    if (!target) return;
    const filtered = target.entries
      .filter((e) => e.filmId !== filmId)
      .map((e, idx) => ({ ...e, position: idx + 1 }));
    onUpdateLists(
      lists.map((l) => (l.id === listId ? { ...l, entries: filtered } : l))
    );
  };

  const handleExportListToCsv = (list: LetterboxdList) => {
    const escapeCell = (v: string | number | undefined) => {
      const s = v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines: string[] = [
      'Letterboxd list export v7',
      'Date,Name,Tags,URL,Description',
      `${escapeCell(list.createdDate || new Date().toISOString().slice(0, 10))},${escapeCell(
        list.name
      )},,${escapeCell(list.letterboxdUrl || '')},${escapeCell(list.description || '')}`,
      '',
      'Position,Name,Year,URL,Description',
    ];
    list.entries.forEach((ent, idx) => {
      const f = films[ent.filmId];
      if (!f) return;
      lines.push(
        [
          escapeCell(ent.position || idx + 1),
          escapeCell(f.title),
          escapeCell(f.year),
          escapeCell(f.letterboxdUri || ''),
          escapeCell(ent.notes || ''),
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Active list FrameSheet cohort & stats
  const activeListStats = useMemo(() => {
    if (!activeList) return null;
    const listRecords = activeList.entries
      .map((e) => films[e.filmId])
      .filter((f): f is FilmRecord => Boolean(f));
    const rated = listRecords.filter((f) => f.rating !== null && f.rating !== undefined);
    const meanRating =
      rated.length > 0
        ? rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length
        : 0;
    const sTierCount = rated.filter((f) => (f.rating || 0) >= 4.5).length;

    const cohortFilms: FilmEntry[] = listRecords
      .map((f) => profileByTitleYear.get(`${f.title.trim().toLowerCase()}::${f.year}`))
      .filter((pf): pf is FilmEntry => Boolean(pf));

    return {
      total: listRecords.length,
      meanRating,
      sTierCount,
      cohortFilms,
    };
  }, [activeList, films, profileByTitleYear]);

  return (
    <div className="space-y-8">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DED9CE] dark:border-[#262830] pb-4">
        <div>
          <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
            Curatorial Monographs, Phrase Lexicon &amp; Collections
          </p>
          <h2 className="text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
            Letterboxd Lists &amp; Critical Reviews Anthology
          </h2>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EBE6DF] dark:bg-[#18191E]">
          <button
            type="button"
            onClick={() => setSubTab('lists')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'lists'
                ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                : 'text-[#6E6A63] dark:text-[#9A9891]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Curated Lists ({lists.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reviews')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              subTab === 'reviews'
                ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                : 'text-[#6E6A63] dark:text-[#9A9891]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Critical Reviews Anthology ({reviewedFilms.length})</span>
          </button>
        </div>
      </div>

      {subTab === 'lists' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 4 cols: Lists Directory */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA]">
                Your Imported &amp; Curated Lists
              </h3>
              <button
                type="button"
                onClick={() => setShowNewListForm(!showNewListForm)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New List</span>
              </button>
            </div>

            {showNewListForm && (
              <form
                onSubmit={handleCreateList}
                className="p-4 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-3"
              >
                <input
                  type="text"
                  required
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="List Title (e.g. 70mm Restorations)"
                  className="w-full px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
                <textarea
                  rows={2}
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="Curatorial description..."
                  className="w-full p-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] cursor-pointer"
                >
                  Create List
                </button>
              </form>
            )}

            <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316]">
              {lists.map((list) => {
                const isSelected = activeList?.id === list.id;
                const ratedListFilms = list.entries
                  .map((e) => films[e.filmId]?.rating)
                  .filter((r): r is number => r !== null && r !== undefined);
                const listAvg =
                  ratedListFilms.length > 0
                    ? ratedListFilms.reduce((a, b) => a + b, 0) / ratedListFilms.length
                    : 0;

                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setSelectedListId(list.id)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#9A7B1C]/12 dark:bg-[#D4AF37]/12'
                        : 'hover:bg-[#F2EFE9]/60 dark:hover:bg-[#18191E]/60'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-editorial font-semibold text-lg text-[#181615] dark:text-[#F4F1EA]">
                        {list.name}
                      </p>
                      <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37] shrink-0">
                        {list.entries.length} films
                        {listAvg > 0 ? ` · ${listAvg.toFixed(2)}★` : ''}
                      </span>
                    </div>
                    {list.description && (
                      <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-1 line-clamp-2">
                        {list.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 8 cols: Active List Contents */}
          <div className="lg:col-span-8 space-y-6">
            {activeList ? (
              <>
                <div className="p-6 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                        {activeList.name}
                      </h3>
                      <div className="text-xs font-mono-tabular text-[#6E6A63] dark:text-[#9A9891] mt-0.5">
                        {activeList.entries.length} Curated Entries · Mean{' '}
                        <span className="text-[#9A7B1C] dark:text-[#D4AF37] font-semibold">
                          {activeListStats && activeListStats.meanRating > 0
                            ? `${activeListStats.meanRating.toFixed(2)} ★`
                            : '—'}
                        </span>{' '}
                        · Tier S (4.5★+): {activeListStats?.sTierCount ?? 0}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {onOpenCohortInAnalytics &&
                        activeListStats &&
                        activeListStats.cohortFilms.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCohortInAnalytics({
                                id: `list-cohort-${activeList.id}`,
                                label: `${activeList.name} (${activeListStats.cohortFilms.length} Films)`,
                                description: activeList.description || 'Curated List Cohort',
                                sourceType: 'group_section',
                                films: activeListStats.cohortFilms,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#2A2D37] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <BarChart2 className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                            <span>Analyze List in Analytics</span>
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => handleExportListToCsv(activeList)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-tabular border border-[#DED9CE] dark:border-[#2A2D37] bg-[#FBF9F5] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                        <span>Export Letterboxd List CSV</span>
                      </button>
                    </div>
                  </div>
                  {activeList.description && (
                    <p className="text-sm text-[#6E6A63] dark:text-[#9A9891] max-w-2xl leading-relaxed">
                      {activeList.description}
                    </p>
                  )}

                  {/* Add Film to List Control */}
                  <form
                    onSubmit={handleAddFilmToActiveList}
                    className="pt-3 border-t border-[#DED9CE] dark:border-[#262830] flex flex-wrap items-center gap-2"
                  >
                    <select
                      value={filmToAddId}
                      onChange={(e) => setFilmToAddId(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                    >
                      <option value="">Select film from library to append...</option>
                      {allFilmsSorted.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.year})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      placeholder="Optional list note / spine #..."
                      className="flex-1 min-w-[180px] px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                    />
                    <button
                      type="submit"
                      disabled={!filmToAddId}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + Append to List
                    </button>
                  </form>
                </div>

                {/* List Entries Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {activeList.entries.map((entry, idx) => {
                    const film = films[entry.filmId];
                    if (!film) return null;

                    const key = `${film.title.trim().toLowerCase()}::${film.year}`;
                    const yearRank = yearRankByTitleYear?.get(key);
                    const oscarStat = personalOscarByTitleYear?.get(key);
                    const pf = profileByTitleYear.get(key);
                    const tier = pf?.tier || inferTierFromRating(film.rating ?? null);

                    return (
                      <div
                        key={entry.filmId}
                        className="border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316] flex flex-col justify-between group"
                      >
                        <div
                          onClick={() => onSelectFilmForModal(film)}
                          className="cursor-pointer"
                        >
                          <PosterVisual film={film} className="w-full aspect-[2/3]" />
                        </div>

                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                              <span>
                                No. {String(entry.position || idx + 1).padStart(2, '0')} · Tier{' '}
                                {tier}
                              </span>
                              <span>{formatStarString(film.rating)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onSelectFilmForModal(film)}
                              className="text-lg font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] hover:underline text-left mt-0.5 cursor-pointer"
                            >
                              {film.title}
                            </button>
                            <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                              {film.year}
                              {film.metadata?.director ? ` · Dir. ${film.metadata.director}` : ''}
                              {yearRank ? ` · #${yearRank} in ${film.year}` : ''}
                              {oscarStat && oscarStat.nominations.length > 0
                                ? ` · ★ ${oscarStat.wins.length}W/${oscarStat.nominations.length}N`
                                : ''}
                            </p>
                            {entry.notes && (
                              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] italic mt-2 pt-2 border-t border-[#DED9CE] dark:border-[#262830]">
                                {entry.notes}
                              </p>
                            )}
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveFilmFromList(activeList.id, entry.filmId)
                              }
                              className="text-[11px] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#DC2626] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#6E6A63] dark:text-[#9A9891]">
                No lists available. Import a Letterboxd list CSV or create a new list on the left.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Editorial Reviews Anthology View + FrameSheet Phrase Lexicon & Word Diff */
        <div className="space-y-6">
          {/* FrameSheet Review Phrase Search & Source-of-Truth Diff Controls */}
          <div className="p-5 bg-[#F2EFE9] dark:bg-[#141519] border border-[#DED9CE] dark:border-[#262830] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[260px] relative">
                <Search className="w-4 h-4 text-[#6E6A63] dark:text-[#9A9891] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={reviewQuery}
                  onChange={(e) => setReviewQuery(e.target.value)}
                  placeholder="Search written reviews by exact phrase, motif, or vocabulary..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
                {reviewQuery && (
                  <button
                    type="button"
                    onClick={() => setReviewQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={reviewMatchMode}
                  onChange={(e) => setReviewMatchMode(e.target.value as ReviewMatchMode)}
                  className="px-3 py-2 text-xs font-mono-tabular bg-[#FBF9F5] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                >
                  <option value="phrase">Match: Exact Phrase</option>
                  <option value="whole_word">Match: Whole Word</option>
                  <option value="all_words">Match: All Words (AND)</option>
                  <option value="any_word">Match: Any Word (OR)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setOnlyModifiedReviews((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono-tabular border transition-colors cursor-pointer ${
                    onlyModifiedReviews
                      ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                      : 'border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Edited vs. Letterboxd Only</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-[#6E6A63] dark:text-[#9A9891] font-mono-tabular mr-1">
                Quick Lexicon:
              </span>
              {SUGGESTED_REVIEW_PHRASES.map((phrase) => {
                const active = reviewQuery.toLowerCase() === phrase.toLowerCase();
                return (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => setReviewQuery(active ? '' : phrase)}
                    className={`px-2 py-0.5 font-mono-tabular border transition-colors cursor-pointer ${
                      active
                        ? 'border-[#9A7B1C] dark:border-[#D4AF37] bg-[#9A7B1C]/15 dark:bg-[#D4AF37]/15 text-[#181615] dark:text-[#F4F1EA]'
                        : 'border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#18191E] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
                    }`}
                  >
                    “{phrase}”
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316]">
            {filteredReviewedFilms.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6E6A63] dark:text-[#9A9891]">
                No critical reviews match the active phrase filter.
              </div>
            ) : (
              filteredReviewedFilms.map((film) => {
                const key = `${film.title.trim().toLowerCase()}::${film.year}`;
                const yearRank = yearRankByTitleYear?.get(key);
                const oscarStat = personalOscarByTitleYear?.get(key);
                const pf = profileByTitleYear.get(key);
                const base = baselineByTitleYear.get(key);
                const tier = pf?.tier || inferTierFromRating(film.rating ?? null);

                const reviewText = film.review || '';
                const evalRes = evaluateReviewSearch(
                  reviewText,
                  reviewQuery,
                  reviewMatchMode
                );
                const isEditedVsBaseline =
                  base && (base.notes || '').trim() !== reviewText.trim();
                const wordDiff = isEditedVsBaseline
                  ? computeWordDiff((base.notes || '').trim(), reviewText.trim())
                  : null;

                return (
                  <article
                    key={film.id}
                    className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start"
                  >
                    {/* Left 3 cols: Poster & Marginalia */}
                    <div className="md:col-span-3 flex sm:flex-row md:flex-col gap-4">
                      <div
                        onClick={() => onSelectFilmForModal(film)}
                        className="w-28 md:w-36 shrink-0 cursor-pointer"
                      >
                        <PosterVisual film={film} className="w-full aspect-[2/3]" />
                      </div>
                      <div className="text-xs text-[#6E6A63] dark:text-[#9A9891] space-y-1 font-mono-tabular">
                        <p className="text-[#9A7B1C] dark:text-[#D4AF37] font-semibold">
                          {formatStarString(film.rating)} · Tier {tier}
                        </p>
                        {yearRank && (
                          <p className="inline-flex items-center gap-1 text-[#181615] dark:text-[#F4F1EA]">
                            <ListOrdered className="w-3 h-3 text-[#9A7B1C] dark:text-[#D4AF37]" />
                            <span>
                              Ranked #{yearRank} in {film.year}
                            </span>
                          </p>
                        )}
                        {oscarStat && oscarStat.nominations.length > 0 && (
                          <p className="inline-flex items-center gap-1 text-[#9A7B1C] dark:text-[#D4AF37]">
                            <Award className="w-3 h-3" />
                            <span>
                              {oscarStat.wins.length}W / {oscarStat.nominations.length}N Oscars
                            </span>
                          </p>
                        )}
                        {film.watchedDate && <p>Screened {film.watchedDate}</p>}
                        {film.metadata?.cinematographer && (
                          <p className="font-sans">DP: {film.metadata.cinematographer}</p>
                        )}
                      </div>
                    </div>

                    {/* Right 9 cols: 65ch Reading Column with Drop Cap & Word Diff */}
                    <div className="md:col-span-9 space-y-3 max-w-2xl">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
                        <div>
                          <span>Release Year {film.year}</span>
                          {film.metadata?.director && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>Directed by {film.metadata.director}</span>
                            </>
                          )}
                        </div>
                        {isEditedVsBaseline && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-300 inline-flex items-center gap-1">
                            <GitCompare className="w-3 h-3" />
                            <span>Edited vs. Letterboxd Baseline</span>
                          </span>
                        )}
                      </div>

                      <h3
                        onClick={() => onSelectFilmForModal(film)}
                        className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] hover:text-[#9A7B1C] dark:hover:text-[#D4AF37] cursor-pointer"
                      >
                        {film.title}
                      </h3>

                      <p className="text-base leading-relaxed text-[#181615] dark:text-[#E6E2D8] first-letter:text-4xl first-letter:font-editorial first-letter:font-bold first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-[#9A7B1C] dark:first-letter:text-[#D4AF37]">
                        {renderHighlightedReviewText(reviewText, evalRes.highlightTerms)}
                      </p>

                      {wordDiff && (
                        <div className="mt-3 p-3 bg-amber-950/15 border border-amber-500/30 text-xs space-y-1">
                          <div className="text-[11px] font-mono-tabular text-amber-600 dark:text-amber-300">
                            Word Diff vs. Original Letterboxd Review:
                          </div>
                          <div className="leading-relaxed text-[#181615] dark:text-[#E6E2D8]">
                            {wordDiff.map((seg, i) => {
                              if (seg.type === 'added') {
                                return (
                                  <ins
                                    key={i}
                                    className="bg-amber-500/25 text-amber-700 dark:text-amber-200 border-b border-amber-400 no-underline px-1 rounded font-medium"
                                  >
                                    {seg.text}
                                  </ins>
                                );
                              }
                              if (seg.type === 'removed') {
                                return (
                                  <del
                                    key={i}
                                    className="bg-rose-500/20 text-rose-600 dark:text-rose-300 line-through px-1 rounded opacity-80"
                                  >
                                    {seg.text}
                                  </del>
                                );
                              }
                              return <span key={i}>{seg.text}</span>;
                            })}
                          </div>
                        </div>
                      )}

                      {film.tags && film.tags.length > 0 && (
                        <p className="pt-2 text-xs text-[#6E6A63] dark:text-[#9A9891]">
                          Index Tags: {film.tags.join(' · ')}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

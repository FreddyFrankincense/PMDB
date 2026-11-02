import React, { useMemo, useState } from 'react';
import {
  X,
  RefreshCw,
  ExternalLink,
  Award,
  ListOrdered,
  Check,
  Bookmark,
  Heart,
  RotateCcw,
  GitCompare,
  Table2,
  Landmark,
} from 'lucide-react';
import { FilmRecord, LetterboxdList } from '../types/cinema';
import { FilmEntry, TierGrade } from '../types/letterboxd';
import { inferTierFromRating } from '../data/filmCatalog';
import { INDUSTRY_AND_CRITIC_LISTS } from '../data/industryLists';
import { computeWordDiff } from '../utils/baselineDiff';
import { PosterVisual } from './PosterVisual';
import { StarRatingInteractive, formatStarString } from './StarRatingDisplay';

interface FilmDetailModalProps {
  film: FilmRecord;
  lists: LetterboxdList[];
  oscarStats: { nominations: string[]; wins: string[] };
  yearRank?: number;
  profileEntry?: FilmEntry;
  baselineEntry?: FilmEntry;
  onClose: () => void;
  onSaveFilm: (
    updated: FilmRecord,
    frameSheetPatch?: {
      tier?: TierGrade;
      customRank?: number | null;
      watchlist?: boolean;
      genres?: string[];
    }
  ) => void;
  onEnrichSingleFilm: (filmId: string) => Promise<void>;
  onNavigateToYearBallot: (year: number) => void;
  onNavigateToYearRanking: (year: number) => void;
  onOpenInSpreadsheet?: (filmTitle: string, year: number) => void;
}

export const FilmDetailModal: React.FC<FilmDetailModalProps> = ({
  film,
  lists,
  oscarStats,
  yearRank,
  profileEntry,
  baselineEntry,
  onClose,
  onSaveFilm,
  onEnrichSingleFilm,
  onNavigateToYearBallot,
  onNavigateToYearRanking,
  onOpenInSpreadsheet,
}) => {
  const [rating, setRating] = useState<number | null>(film.rating ?? null);
  const [liked, setLiked] = useState<boolean>(
    film.liked ?? profileEntry?.liked ?? (film.rating !== null && film.rating !== undefined && film.rating >= 4.5)
  );
  const [rewatch, setRewatch] = useState<boolean>(
    film.rewatch ?? profileEntry?.rewatch ?? false
  );
  const [watchlist, setWatchlist] = useState<boolean>(
    profileEntry?.watchlist ?? (film.tags?.includes('letterboxd-watchlist') || false)
  );
  const [tier, setTier] = useState<TierGrade>(
    profileEntry?.tier || inferTierFromRating(film.rating ?? null)
  );
  const [customRank, setCustomRank] = useState<string>(
    profileEntry?.customRank !== null && profileEntry?.customRank !== undefined
      ? String(profileEntry.customRank)
      : ''
  );
  const [genresStr, setGenresStr] = useState<string>(
    (film.metadata?.genres && film.metadata.genres.length > 0
      ? film.metadata.genres
      : profileEntry?.genres || []
    ).join(', ')
  );
  const [tagsStr, setTagsStr] = useState<string>((film.tags || []).join(', '));
  const [review, setReview] = useState(film.review || profileEntry?.notes || '');
  const [watchedDate, setWatchedDate] = useState(film.watchedDate || '');
  const [director, setDirector] = useState(film.metadata?.director || profileEntry?.director || '');
  const [castStr, setCastStr] = useState((film.metadata?.cast || []).join(', '));
  const [writersStr, setWritersStr] = useState((film.metadata?.writers || []).join(', '));
  const [cinematographer, setCinematographer] = useState(film.metadata?.cinematographer || '');
  const [composer, setComposer] = useState(film.metadata?.composer || '');
  const [editor, setEditor] = useState(film.metadata?.editor || '');
  const [productionDesigner, setProductionDesigner] = useState(
    film.metadata?.productionDesigner || ''
  );
  const [costumeDesigner, setCostumeDesigner] = useState(film.metadata?.costumeDesigner || '');
  const [country, setCountry] = useState(film.metadata?.country || profileEntry?.country || '');
  const [posterUrl, setPosterUrl] = useState(film.metadata?.posterUrl || profileEntry?.posterUrl || '');
  const [isEnriching, setIsEnriching] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleEnrichClick = async () => {
    setIsEnriching(true);
    try {
      await onEnrichSingleFilm(film.id);
    } finally {
      setIsEnriching(false);
    }
  };

  // Sync local state if parent film metadata gets enriched
  React.useEffect(() => {
    setDirector(film.metadata?.director || profileEntry?.director || '');
    setCastStr((film.metadata?.cast || []).join(', '));
    setWritersStr((film.metadata?.writers || []).join(', '));
    setCinematographer(film.metadata?.cinematographer || '');
    setComposer(film.metadata?.composer || '');
    setEditor(film.metadata?.editor || '');
    setProductionDesigner(film.metadata?.productionDesigner || '');
    setCostumeDesigner(film.metadata?.costumeDesigner || '');
    setCountry(film.metadata?.country || profileEntry?.country || '');
    setPosterUrl(film.metadata?.posterUrl || profileEntry?.posterUrl || '');
    if (film.metadata?.genres && film.metadata.genres.length > 0) {
      setGenresStr(film.metadata.genres.join(', '));
    }
  }, [film.metadata, profileEntry]);

  // Cross-reference against Official Industry & Critics Polls
  const officialIndustryRecognition = useMemo(() => {
    const normalizedTitle = film.title.trim().toLowerCase();
    const matches: Array<{
      listTitle: string;
      shortName: string;
      category: string;
      rank: number;
      status: string;
      ceremonyOrIssue: string;
      accoladeDetail: string;
      consensusRating: number;
    }> = [];

    for (const list of INDUSTRY_AND_CRITIC_LISTS) {
      const entry = list.entries.find(
        (e) => e.title.toLowerCase() === normalizedTitle && Math.abs(e.year - film.year) <= 1
      );
      if (entry) {
        matches.push({
          listTitle: list.title,
          shortName: list.shortName,
          category: list.category,
          rank: entry.rank,
          status: entry.status,
          ceremonyOrIssue: entry.ceremonyOrIssue,
          accoladeDetail: entry.accoladeDetail,
          consensusRating: entry.consensusRating,
        });
      }
    }
    return matches;
  }, [film.title, film.year]);

  // Compute Letterboxd Source-of-Truth Word Diff if baselineEntry exists
  const reviewWordDiff = useMemo(() => {
    if (!baselineEntry) return null;
    const baseText = (baselineEntry.notes || '').trim();
    const currText = review.trim();
    if (baseText === currText) return null;
    return computeWordDiff(baseText, currText);
  }, [baselineEntry, review]);

  const hasBaselineDeviation = useMemo(() => {
    if (!baselineEntry) return false;
    return (
      baselineEntry.rating !== rating ||
      (baselineEntry.watchedDate || '') !== watchedDate ||
      baselineEntry.watchlist !== watchlist ||
      baselineEntry.tier !== tier ||
      (baselineEntry.notes || '').trim() !== review.trim()
    );
  }, [baselineEntry, rating, watchedDate, watchlist, tier, review]);

  const handleRevertToBaseline = () => {
    if (!baselineEntry) return;
    setRating(baselineEntry.rating);
    setWatchedDate(baselineEntry.watchedDate || '');
    setWatchlist(baselineEntry.watchlist);
    setLiked(baselineEntry.liked);
    setRewatch(baselineEntry.rewatch);
    setTier(baselineEntry.tier);
    setCustomRank(
      baselineEntry.customRank !== null ? String(baselineEntry.customRank) : ''
    );
    setReview(baselineEntry.notes || '');
    setGenresStr(baselineEntry.genres.join(', '));
    setTagsStr(baselineEntry.tags.join(', '));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedGenres = genresStr
      .split(/[,·|/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedTags = tagsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (watchlist && !parsedTags.includes('letterboxd-watchlist')) {
      parsedTags.push('letterboxd-watchlist');
    } else if (!watchlist) {
      const wlIdx = parsedTags.indexOf('letterboxd-watchlist');
      if (wlIdx >= 0) parsedTags.splice(wlIdx, 1);
    }

    const parsedRankNum = customRank.trim() ? parseInt(customRank.trim(), 10) : null;

    const updated: FilmRecord = {
      ...film,
      rating: watchlist ? null : rating,
      liked,
      rewatch,
      review: review.trim() || undefined,
      watchedDate: watchlist ? undefined : watchedDate || undefined,
      tags: parsedTags,
      metadata: {
        ...film.metadata,
        director: director.trim() || undefined,
        genres: parsedGenres.length > 0 ? parsedGenres : film.metadata?.genres,
        cast: castStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        writers: writersStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        cinematographer: cinematographer.trim() || undefined,
        composer: composer.trim() || undefined,
        editor: editor.trim() || undefined,
        productionDesigner: productionDesigner.trim() || undefined,
        costumeDesigner: costumeDesigner.trim() || undefined,
        country: country.trim() || undefined,
        posterUrl: posterUrl.trim() || undefined,
      },
    };
    onSaveFilm(updated, {
      tier: watchlist ? 'Unranked' : tier,
      customRank: watchlist || Number.isNaN(parsedRankNum) ? null : parsedRankNum,
      watchlist,
      genres: parsedGenres,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  const memberLists = lists.filter((l) =>
    l.entries.some((entry) => entry.filmId === film.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[#FBF9F5]/95 dark:bg-[#121316]/95 backdrop-blur border-b border-[#DED9CE] dark:border-[#262830]">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
              Unified Film Dossier · Release Year {film.year} · Tier {watchlist ? 'Watchlist' : tier}
              {customRank ? ` · Sheet Rank #${customRank}` : ''}
            </p>
            <h2 className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
              {film.title}
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            {onOpenInSpreadsheet && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInSpreadsheet(film.title, film.year);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#2A2D37] bg-[#F2EFE9] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Table2 className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span>Inspect in Spreadsheet</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleEnrichClick}
              disabled={isEnriching}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-[#DED9CE] dark:border-[#2A2D37] bg-[#F2EFE9] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEnriching ? 'animate-spin' : ''}`} />
              <span>{isEnriching ? 'Querying IMDb & Wiki...' : 'Fetch IMDb / Wiki Credits'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Left Column: Poster + Unified Standing Across Both Apps */}
          <div className="md:col-span-4 space-y-5">
            <PosterVisual
              film={{
                ...film,
                metadata: { ...film.metadata, posterUrl: posterUrl || film.metadata.posterUrl },
              }}
              className="w-full aspect-[2/3]"
            />

            <div className="space-y-3 pt-2 border-t border-[#DED9CE] dark:border-[#262830] text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#6E6A63] dark:text-[#9A9891]">Letterboxd Rating</span>
                <span className="font-mono-tabular font-semibold text-[#9A7B1C] dark:text-[#D4AF37]">
                  {watchlist ? 'On Watchlist' : formatStarString(rating)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#6E6A63] dark:text-[#9A9891]">FrameSheet Standing</span>
                <span className="font-mono-tabular font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  {watchlist
                    ? 'Want to Watch'
                    : `Tier ${tier}${customRank ? ` · #${customRank}` : ''}`}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#6E6A63] dark:text-[#9A9891]">{film.year} Yearly Rank</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToYearRanking(film.year);
                  }}
                  className="inline-flex items-center gap-1 font-mono-tabular text-[#181615] dark:text-[#F4F1EA] hover:underline cursor-pointer"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>{yearRank ? `Ranked #${yearRank} in ${film.year}` : `Rank in ${film.year} →`}</span>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#6E6A63] dark:text-[#9A9891]">Personal Oscar Tally</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToYearBallot(film.year);
                  }}
                  className="inline-flex items-center gap-1 font-mono-tabular text-[#181615] dark:text-[#F4F1EA] hover:underline cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>
                    {oscarStats.nominations.length} Nom · {oscarStats.wins.length} Win
                  </span>
                </button>
              </div>

              {oscarStats.nominations.length > 0 && (
                <div className="pt-2 border-t border-[#DED9CE] dark:border-[#262830] text-[11px] text-[#6E6A63] dark:text-[#9A9891] space-y-1">
                  <p className="uppercase tracking-wider font-medium text-[#181615] dark:text-[#F4F1EA]">
                    Personal Academy Ballot Citations:
                  </p>
                  <p className="leading-relaxed">
                    {oscarStats.nominations.map((catName, i) => {
                      const isWin = oscarStats.wins.includes(catName);
                      return (
                        <React.Fragment key={catName}>
                          {i > 0 && ' · '}
                          <span
                            className={
                              isWin ? 'text-[#9A7B1C] dark:text-[#D4AF37] font-semibold' : ''
                            }
                          >
                            {isWin ? `★ ${catName} (Winner)` : catName}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </p>
                </div>
              )}

              {/* Official Industry & Critics Poll Recognition */}
              {officialIndustryRecognition.length > 0 && (
                <div className="pt-2.5 border-t border-[#DED9CE] dark:border-[#262830] space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-[#9A7B1C] dark:text-[#D4AF37]">
                    <Landmark className="w-3.5 h-3.5 shrink-0" />
                    <span>Official Industry &amp; Critics Recognition</span>
                  </div>
                  <div className="space-y-1.5">
                    {officialIndustryRecognition.map((rec, idx) => {
                      const delta =
                        rating !== null ? rating - rec.consensusRating : null;
                      return (
                        <div
                          key={`${rec.shortName}-${idx}`}
                          className="p-2 bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2 font-mono-tabular">
                            <span className="font-semibold text-[#181615] dark:text-[#F4F1EA]">
                              {rec.shortName}
                            </span>
                            <span
                              className={
                                rec.status === 'Winner'
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : 'text-[#9A7B1C] dark:text-[#D4AF37]'
                              }
                            >
                              {rec.status === 'Ranked'
                                ? `Ranked #${rec.rank}`
                                : `${rec.status} · ${rec.ceremonyOrIssue}`}
                            </span>
                          </div>
                          <p className="text-[#6E6A63] dark:text-[#9A9891] mt-0.5 leading-snug">
                            {rec.accoladeDetail}
                          </p>
                          <div className="mt-1 flex items-center justify-between font-mono-tabular text-[10px] text-[#6E6A63] dark:text-[#9A9891]">
                            <span>Consensus: {rec.consensusRating.toFixed(1)} ★</span>
                            {delta !== null && (
                              <span
                                className={
                                  delta > 0.05
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : delta < -0.05
                                    ? 'text-rose-500 dark:text-rose-400'
                                    : ''
                                }
                              >
                                Your Delta: {delta >= 0 ? '+' : ''}
                                {delta.toFixed(1)} ★
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {memberLists.length > 0 && (
                <div className="pt-2 border-t border-[#DED9CE] dark:border-[#262830] text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                  <p className="uppercase tracking-wider font-medium text-[#181615] dark:text-[#F4F1EA] mb-1">
                    Featured in Curated Lists:
                  </p>
                  <p>{memberLists.map((l) => l.name).join(' · ')}</p>
                </div>
              )}

              {film.letterboxdUri && (
                <div className="pt-2">
                  <a
                    href={film.letterboxdUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#9A7B1C] dark:text-[#D4AF37] hover:underline"
                  >
                    <span>View on Letterboxd</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Unified FrameSheet + Cineaste Ledger Editor */}
          <div className="md:col-span-8 space-y-6">
            {/* Source-of-Truth Baseline Deviation Banner */}
            {hasBaselineDeviation && baselineEntry && (
              <div className="p-3 bg-amber-950/20 border border-amber-500/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                  <GitCompare className="w-4 h-4 shrink-0" />
                  <span>
                    Modified in workspace vs. Letterboxd Source-of-Truth baseline
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRevertToBaseline}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono-tabular font-medium bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Revert to Letterboxd</span>
                </button>
              </div>
            )}

            {/* Rating + Watchlist / Liked / Rewatch + Tier / Global Rank */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-5">
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-2">
                  Your Letterboxd Star Rating
                </label>
                <StarRatingInteractive
                  value={rating}
                  onChange={(nextVal) => {
                    setRating(nextVal);
                    if (nextVal !== null) {
                      setWatchlist(false);
                      setTier(inferTierFromRating(nextVal));
                    }
                  }}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-1">
                  Tier Classification
                </label>
                <select
                  value={watchlist ? 'Unranked' : tier}
                  disabled={watchlist}
                  onChange={(e) => setTier(e.target.value as TierGrade)}
                  className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] disabled:opacity-50"
                >
                  <option value="S">Tier S (Masterwork)</option>
                  <option value="A">Tier A (Essential)</option>
                  <option value="B">Tier B (Strong)</option>
                  <option value="C">Tier C (Mixed)</option>
                  <option value="D">Tier D (Minor)</option>
                  <option value="Unranked">Unranked</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-1">
                  Global Sheet Rank #
                </label>
                <input
                  type="number"
                  min={1}
                  disabled={watchlist}
                  value={customRank}
                  onChange={(e) => setCustomRank(e.target.value)}
                  placeholder="Unranked"
                  className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] disabled:opacity-50"
                />
              </div>
            </div>

            {/* Status Flags & Genres / Tags */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLiked((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                  liked
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-500 dark:text-rose-400'
                    : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                <Heart className="w-3.5 h-3.5" fill={liked ? 'currentColor' : 'none'} />
                <span>{liked ? 'Loved (♥)' : 'Mark Loved'}</span>
              </button>

              <button
                type="button"
                onClick={() => setRewatch((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                  rewatch
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{rewatch ? 'Rewatched (↺)' : 'First Watch'}</span>
              </button>

              <button
                type="button"
                onClick={() => setWatchlist((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                  watchlist
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-600 dark:text-sky-300'
                    : 'border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" fill={watchlist ? 'currentColor' : 'none'} />
                <span>{watchlist ? 'On Watchlist (Want to Watch)' : 'Logged in Diary'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                  Genres (comma-separated)
                </label>
                <input
                  type="text"
                  value={genresStr}
                  onChange={(e) => setGenresStr(e.target.value)}
                  placeholder="Drama, Thriller, Mystery"
                  className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                  Diary Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="35mm, criterion, festival..."
                  className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Personal Review &amp; Critical Notes
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                    Watched Date:
                  </span>
                  <input
                    type="date"
                    disabled={watchlist}
                    value={watchedDate}
                    onChange={(e) => setWatchedDate(e.target.value)}
                    className="px-2 py-1 text-xs font-mono-tabular bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Word Diff Callout if review was edited vs Letterboxd baseline */}
              {reviewWordDiff && (
                <div className="mb-2.5 p-3 bg-amber-950/20 border border-amber-500/40 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-amber-600 dark:text-amber-300">
                    <span>Review Word Diff vs. Letterboxd Source of Truth</span>
                    <span>Live Comparison</span>
                  </div>
                  <div className="p-2 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] leading-relaxed">
                    {reviewWordDiff.map((seg, idx) => {
                      if (seg.type === 'added') {
                        return (
                          <ins
                            key={idx}
                            className="bg-amber-500/25 text-amber-700 dark:text-amber-200 border-b border-amber-400 no-underline px-1 rounded font-medium"
                          >
                            {seg.text}
                          </ins>
                        );
                      }
                      if (seg.type === 'removed') {
                        return (
                          <del
                            key={idx}
                            className="bg-rose-500/20 text-rose-600 dark:text-rose-300 line-through px-1 rounded opacity-80"
                          >
                            {seg.text}
                          </del>
                        );
                      }
                      return <span key={idx}>{seg.text}</span>;
                    })}
                  </div>
                </div>
              )}

              <textarea
                rows={4}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Record your critical reflection, screening notes, or pull quote..."
                className="w-full p-3 text-sm leading-relaxed bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
              />
            </div>

            {/* Credits Matrix for Oscar Nominations */}
            <div className="pt-4 border-t border-[#DED9CE] dark:border-[#262830]">
              <h3 className="text-sm font-semibold text-[#181615] dark:text-[#F4F1EA] mb-1">
                Above &amp; Below-the-Line Credits (Auto-Populates Oscar Ballot)
              </h3>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mb-4">
                Used to automatically pre-fill candidate names when nominating this film for Acting, Directing, Writing, or Craft categories.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Director
                  </label>
                  <input
                    type="text"
                    value={director}
                    onChange={(e) => setDirector(e.target.value)}
                    placeholder="e.g. Stanley Kubrick"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Screenwriter(s) (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={writersStr}
                    onChange={(e) => setWritersStr(e.target.value)}
                    placeholder="e.g. Justine Triet, Arthur Harari"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Principal Cast (comma-separated for Acting nominations)
                  </label>
                  <input
                    type="text"
                    value={castStr}
                    onChange={(e) => setCastStr(e.target.value)}
                    placeholder="e.g. Sandra Hüller, Swann Arlaud, Milo Machado-Graner"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Cinematographer (Director of Photography)
                  </label>
                  <input
                    type="text"
                    value={cinematographer}
                    onChange={(e) => setCinematographer(e.target.value)}
                    placeholder="e.g. John Alcott"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Original Score Composer
                  </label>
                  <input
                    type="text"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="e.g. Ludwig Göransson"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Film Editor(s)
                  </label>
                  <input
                    type="text"
                    value={editor}
                    onChange={(e) => setEditor(e.target.value)}
                    placeholder="e.g. Dede Allen"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Production Designer / Art Direction
                  </label>
                  <input
                    type="text"
                    value={productionDesigner}
                    onChange={(e) => setProductionDesigner(e.target.value)}
                    placeholder="e.g. Ken Adam"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Costume Designer
                  </label>
                  <input
                    type="text"
                    value={costumeDesigner}
                    onChange={(e) => setCostumeDesigner(e.target.value)}
                    placeholder="e.g. Milena Canonero"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Country of Origin
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. France / Japan"
                    className="w-full px-3 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#6E6A63] dark:text-[#9A9891] mb-1">
                    Theatrical Poster Image URL (IMDb / TMDB / Custom)
                  </label>
                  <input
                    type="url"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#DED9CE] dark:border-[#262830] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 transition-opacity cursor-pointer"
              >
                {savedToast ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved to Unified Archive</span>
                  </>
                ) : (
                  <span>Save Film Record</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

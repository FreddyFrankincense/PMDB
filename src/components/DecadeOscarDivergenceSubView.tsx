import React, { useMemo, useState } from 'react';
import {
  Award,
  ArrowUpRight,
  Scale,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import {
  ExternalListEntry,
  INDUSTRY_AND_CRITIC_LISTS,
} from '../data/industryLists';
import { normalizeFilmMatchKey } from '../utils/unifiedArchiveSync';

interface DecadeOscarDivergenceSubViewProps {
  profile: ProfileAccount;
  effectiveFilms: FilmEntry[];
  cohortLabel: string;
  isSubsetActive: boolean;
  onInspectFilm?: (film: FilmEntry) => void;
  onInspectExternalFilm?: (title: string, year: number, director?: string) => void;
  onSelectDecadeInOverview?: (decadeNum: number, decadeLabel: string) => void;
}

type OscarBenchmarkScope = 'winners_and_nominees' | 'winners_only';
type OscarRatingSource = 'ampas_consensus' | 'user_logged_oscar' | 'blended';

interface MatchedOscarFilm {
  entry: ExternalListEntry;
  userFilm: FilmEntry | null;
  userRating: number | null;
  effectiveBenchmarkRating: number;
  filmDelta: number | null;
}

interface DecadeDivergenceRow {
  decadeNum: number;
  decadeLabel: string;
  userTotalCount: number;
  userRatedCount: number;
  userDecadeAvg: number | null;
  oscarEntriesCount: number;
  oscarWinnersCount: number;
  oscarSeenCount: number;
  ampasConsensusAvg: number | null;
  userOnOscarAvg: number | null;
  blendedOscarAvg: number | null;
  activeOscarAvg: number | null;
  divergenceDelta: number | null; // userDecadeAvg - activeOscarAvg
  internalOscarVsDecadeDelta: number | null; // userOnOscarAvg - userDecadeAvg
  outperformerCount: number; // user films in decade rated > activeOscarAvg
  nonOscarOutperformers: FilmEntry[];
  topUserFilms: FilmEntry[];
  oscarFilms: MatchedOscarFilm[];
  verdictLabel: string;
  verdictTone: 'positive' | 'negative' | 'aligned' | 'skeptical_of_winners';
}

const ALL_DECADES = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export const DecadeOscarDivergenceSubView: React.FC<DecadeOscarDivergenceSubViewProps> = ({
  profile,
  effectiveFilms,
  cohortLabel,
  isSubsetActive,
  onInspectFilm,
  onInspectExternalFilm,
  onSelectDecadeInOverview,
}) => {
  const [benchmarkScope, setBenchmarkScope] = useState<OscarBenchmarkScope>('winners_and_nominees');
  const [ratingSource, setRatingSource] = useState<OscarRatingSource>('ampas_consensus');
  const [chartScale, setChartScale] = useState<'dynamic' | 'full'>('dynamic');
  const [selectedDecadeNum, setSelectedDecadeNum] = useState<number>(1970);
  const [hoveredDecadeNum, setHoveredDecadeNum] = useState<number | null>(null);

  // Build fast lookup map of user's logged films by normalized title::year
  const userFilmByNormalizedKey = useMemo(() => {
    const map = new Map<string, FilmEntry>();
    for (const film of effectiveFilms) {
      if (film.watchlist) continue;
      map.set(normalizeFilmMatchKey(film.title, film.year), film);
      map.set(`${film.title.trim().toLowerCase()}::${film.year}`, film);
    }
    return map;
  }, [effectiveFilms]);

  // Extract official Academy Awards Best Picture entries from INDUSTRY_AND_CRITIC_LISTS
  const oscarCanonicalList = useMemo(() => {
    const found = INDUSTRY_AND_CRITIC_LISTS.find((l) => l.id === 'academy-awards-oscars');
    return found ? found.entries : [];
  }, []);

  // Compute decade-by-decade comparison between User's Decade Average Rating and Academy Best Picture Average Rating
  const decadeRows = useMemo<DecadeDivergenceRow[]>(() => {
    const loggedFilms = effectiveFilms.filter((f) => !f.watchlist);

    return ALL_DECADES.map((decadeNum) => {
      const decadeLabel = `${decadeNum}s`;
      const userFilmsInDecade = loggedFilms.filter(
        (f) => f.year >= decadeNum && f.year <= decadeNum + 9
      );
      const userRatedFilms = userFilmsInDecade.filter((f) => f.rating !== null);
      const userDecadeAvg =
        userRatedFilms.length > 0
          ? userRatedFilms.reduce((acc, f) => acc + (f.rating ?? 0), 0) / userRatedFilms.length
          : null;

      const rawOscarEntries = oscarCanonicalList.filter(
        (e) =>
          e.year >= decadeNum &&
          e.year <= decadeNum + 9 &&
          (benchmarkScope === 'winners_and_nominees' || e.status === 'Winner')
      );

      const oscarKeySet = new Set<string>();
      const matchedOscarFilms: MatchedOscarFilm[] = rawOscarEntries.map((entry) => {
        const normKey = normalizeFilmMatchKey(entry.title, entry.year);
        const rawKey = `${entry.title.trim().toLowerCase()}::${entry.year}`;
        oscarKeySet.add(normKey);
        oscarKeySet.add(rawKey);

        const userFilm =
          userFilmByNormalizedKey.get(normKey) ||
          userFilmByNormalizedKey.get(rawKey) ||
          null;
        const userRating = userFilm?.rating ?? null;
        const effectiveBenchmarkRating =
          ratingSource === 'user_logged_oscar'
            ? userRating ?? entry.consensusRating
            : ratingSource === 'blended'
            ? userRating ?? entry.consensusRating
            : entry.consensusRating;

        return {
          entry,
          userFilm,
          userRating,
          effectiveBenchmarkRating,
          filmDelta: userRating !== null ? userRating - entry.consensusRating : null,
        };
      });

      const ampasConsensusAvg =
        matchedOscarFilms.length > 0
          ? matchedOscarFilms.reduce((acc, item) => acc + item.entry.consensusRating, 0) /
            matchedOscarFilms.length
          : null;

      const ratedOscarFilms = matchedOscarFilms.filter((item) => item.userRating !== null);
      const userOnOscarAvg =
        ratedOscarFilms.length > 0
          ? ratedOscarFilms.reduce((acc, item) => acc + (item.userRating ?? 0), 0) /
            ratedOscarFilms.length
          : null;

      const blendedOscarAvg =
        matchedOscarFilms.length > 0
          ? matchedOscarFilms.reduce(
              (acc, item) => acc + (item.userRating ?? item.entry.consensusRating),
              0
            ) / matchedOscarFilms.length
          : null;

      let activeOscarAvg: number | null = ampasConsensusAvg;
      if (ratingSource === 'user_logged_oscar') {
        activeOscarAvg = userOnOscarAvg ?? ampasConsensusAvg;
      } else if (ratingSource === 'blended') {
        activeOscarAvg = blendedOscarAvg;
      }

      const divergenceDelta =
        userDecadeAvg !== null && activeOscarAvg !== null
          ? userDecadeAvg - activeOscarAvg
          : null;

      const internalOscarVsDecadeDelta =
        userOnOscarAvg !== null && userDecadeAvg !== null
          ? userOnOscarAvg - userDecadeAvg
          : null;

      const sortedUserRated = [...userRatedFilms].sort((a, b) => {
        const diff = (b.rating ?? 0) - (a.rating ?? 0);
        if (diff !== 0) return diff;
        if (a.liked !== b.liked) return a.liked ? -1 : 1;
        return a.title.localeCompare(b.title);
      });

      const threshold = activeOscarAvg ?? 4.3;
      const outperformers = sortedUserRated.filter((f) => (f.rating ?? 0) > threshold);
      const nonOscarOutperformers = outperformers.filter(
        (f) =>
          !oscarKeySet.has(normalizeFilmMatchKey(f.title, f.year)) &&
          !oscarKeySet.has(`${f.title.trim().toLowerCase()}::${f.year}`)
      );

      let verdictLabel = 'Insufficient Data';
      let verdictTone: DecadeDivergenceRow['verdictTone'] = 'aligned';

      if (divergenceDelta !== null) {
        if (divergenceDelta >= 0.1) {
          verdictLabel = 'Era Enthusiast (Exceeds AMPAS)';
          verdictTone = 'positive';
        } else if (divergenceDelta >= -0.25) {
          verdictLabel = 'Close Consensus Alignment';
          verdictTone = 'aligned';
        } else if (
          nonOscarOutperformers.length >= 2 &&
          (userOnOscarAvg === null || userOnOscarAvg < (ampasConsensusAvg ?? 4.3))
        ) {
          verdictLabel = 'Auteur Canon Divergence';
          verdictTone = 'skeptical_of_winners';
        } else {
          verdictLabel = 'Strict Era Grader vs. AMPAS';
          verdictTone = 'negative';
        }
      }

      return {
        decadeNum,
        decadeLabel,
        userTotalCount: userFilmsInDecade.length,
        userRatedCount: userRatedFilms.length,
        userDecadeAvg,
        oscarEntriesCount: matchedOscarFilms.length,
        oscarWinnersCount: matchedOscarFilms.filter((m) => m.entry.status === 'Winner').length,
        oscarSeenCount: matchedOscarFilms.filter((m) => m.userFilm !== null).length,
        ampasConsensusAvg,
        userOnOscarAvg,
        blendedOscarAvg,
        activeOscarAvg,
        divergenceDelta,
        internalOscarVsDecadeDelta,
        outperformerCount: outperformers.length,
        nonOscarOutperformers,
        topUserFilms: sortedUserRated.slice(0, 8),
        oscarFilms: matchedOscarFilms,
        verdictLabel,
        verdictTone,
      };
    }).filter((row) => row.userRatedCount > 0 || row.oscarEntriesCount > 0);
  }, [effectiveFilms, oscarCanonicalList, benchmarkScope, ratingSource, userFilmByNormalizedKey]);

  // Summary Telemetry across all active decades with both user and Academy ratings
  const summaryStats = useMemo(() => {
    const comparable = decadeRows.filter(
      (r) => r.userDecadeAvg !== null && r.activeOscarAvg !== null && r.divergenceDelta !== null
    );

    const meanAbsDivergence =
      comparable.length > 0
        ? comparable.reduce((acc, r) => acc + Math.abs(r.divergenceDelta ?? 0), 0) /
          comparable.length
        : 0;

    const meanSignedDivergence =
      comparable.length > 0
        ? comparable.reduce((acc, r) => acc + (r.divergenceDelta ?? 0), 0) / comparable.length
        : 0;

    const sortedBySignedDelta = [...comparable].sort(
      (a, b) => (b.divergenceDelta ?? 0) - (a.divergenceDelta ?? 0)
    );

    const highestRelativeDecade = sortedBySignedDelta[0] || null;
    const widestNegativeDecade = sortedBySignedDelta[sortedBySignedDelta.length - 1] || null;

    const totalOscarEntries = decadeRows.reduce((acc, r) => acc + r.oscarEntriesCount, 0);
    const totalOscarSeen = decadeRows.reduce((acc, r) => acc + r.oscarSeenCount, 0);
    const totalNonOscarOutperformers = decadeRows.reduce(
      (acc, r) => acc + r.nonOscarOutperformers.length,
      0
    );

    const maxAbsDelta = Math.max(
      0.25,
      ...comparable.map((r) => Math.abs(r.divergenceDelta ?? 0))
    );

    return {
      comparableCount: comparable.length,
      meanAbsDivergence,
      meanSignedDivergence,
      highestRelativeDecade,
      widestNegativeDecade,
      totalOscarEntries,
      totalOscarSeen,
      totalNonOscarOutperformers,
      maxAbsDelta,
    };
  }, [decadeRows]);

  // Dual-Line SVG Chart Geometry
  const chartGeometry = useMemo(() => {
    const plotRows = decadeRows.filter(
      (r) => r.userDecadeAvg !== null || r.activeOscarAvg !== null
    );
    const width = 920;
    const height = 300;
    const padLeft = 52;
    const padRight = 32;
    const padTop = 28;
    const padBottom = 50;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    if (plotRows.length === 0) {
      return null;
    }

    const allValues: number[] = [];
    for (const r of plotRows) {
      if (r.userDecadeAvg !== null) allValues.push(r.userDecadeAvg);
      if (r.activeOscarAvg !== null) allValues.push(r.activeOscarAvg);
    }

    let minRating = 0.5;
    let maxRating = 5.0;

    if (chartScale === 'dynamic' && allValues.length > 0) {
      const rawMin = Math.min(...allValues);
      const rawMax = Math.max(...allValues);
      minRating = Math.max(0.5, Math.floor((rawMin - 0.3) * 4) / 4);
      maxRating = Math.min(5.0, Math.ceil((rawMax + 0.25) * 4) / 4);
      if (maxRating - minRating < 1.0) {
        const mid = (maxRating + minRating) / 2;
        minRating = Math.max(0.5, Number((mid - 0.5).toFixed(2)));
        maxRating = Math.min(5.0, Number((mid + 0.5).toFixed(2)));
      }
    }

    const toY = (val: number) => {
      const clamped = Math.max(minRating, Math.min(maxRating, val));
      const ratio = (clamped - minRating) / Math.max(0.01, maxRating - minRating);
      return padTop + plotHeight - ratio * plotHeight;
    };

    const nodes = plotRows.map((row, idx) => {
      const x =
        plotRows.length === 1
          ? padLeft + plotWidth / 2
          : padLeft + (idx / (plotRows.length - 1)) * plotWidth;
      const userY = row.userDecadeAvg !== null ? toY(row.userDecadeAvg) : null;
      const oscarY = row.activeOscarAvg !== null ? toY(row.activeOscarAvg) : null;
      return {
        ...row,
        x,
        userY,
        oscarY,
      };
    });

    const userCoords = nodes.filter((n) => n.userY !== null);
    const oscarCoords = nodes.filter((n) => n.oscarY !== null);

    const userLinePath = userCoords
      .map((n, idx) => `${idx === 0 ? 'M' : 'L'} ${n.x.toFixed(1)} ${n.userY!.toFixed(1)}`)
      .join(' ');

    const oscarLinePath = oscarCoords
      .map((n, idx) => `${idx === 0 ? 'M' : 'L'} ${n.x.toFixed(1)} ${n.oscarY!.toFixed(1)}`)
      .join(' ');

    const yTicks = [
      maxRating,
      minRating + (maxRating - minRating) * 0.75,
      minRating + (maxRating - minRating) * 0.5,
      minRating + (maxRating - minRating) * 0.25,
      minRating,
    ].map((v) => Number(v.toFixed(2)));

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotWidth,
      plotHeight,
      minRating,
      maxRating,
      nodes,
      userLinePath,
      oscarLinePath,
      yTicks,
    };
  }, [decadeRows, chartScale]);

  const activeInspectedRow = useMemo(() => {
    const targetNum = hoveredDecadeNum ?? selectedDecadeNum;
    return (
      decadeRows.find((r) => r.decadeNum === targetNum) ||
      decadeRows.find((r) => r.decadeNum === selectedDecadeNum) ||
      decadeRows[decadeRows.length - 1] ||
      null
    );
  }, [decadeRows, hoveredDecadeNum, selectedDecadeNum]);

  const selectedDetailRow = useMemo(() => {
    return (
      decadeRows.find((r) => r.decadeNum === selectedDecadeNum) ||
      decadeRows[decadeRows.length - 1] ||
      null
    );
  }, [decadeRows, selectedDecadeNum]);

  return (
    <div className="space-y-6">
      {/* Sub-View Header & Benchmark Configuration Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-amber-400">
              <Scale className="w-4 h-4 shrink-0" />
              <span>Decade Taste Divergence Analyzer (1920s–2020s)</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">
                Active Scope: {cohortLabel}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-display font-semibold text-slate-100">
              Your Decade Average Rating vs. Academy Awards Best Picture Average Rating
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Compares @{profile.username}&apos;s mean star rating for every film release decade against the Academy Awards Best Picture Average Rating for that same decade, pinpointing eras where your personal canon aligns with or diverges from AMPAS taste.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Benchmark Scope Toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setBenchmarkScope('winners_and_nominees')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  benchmarkScope === 'winners_and_nominees'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                BP Winners &amp; Nominees
              </button>
              <button
                type="button"
                onClick={() => setBenchmarkScope('winners_only')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  benchmarkScope === 'winners_only'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                BP Winners Only
              </button>
            </div>

            {/* Rating Basis Toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setRatingSource('ampas_consensus')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  ratingSource === 'ampas_consensus'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Compare your Decade Avg against the official Academy Best Picture benchmark average"
              >
                AMPAS Benchmark ★
              </button>
              <button
                type="button"
                onClick={() => setRatingSource('user_logged_oscar')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  ratingSource === 'user_logged_oscar'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Compare your overall Decade Avg against how YOU rated the Academy Best Picture films in that decade"
              >
                Your Ratings on BP Films ★
              </button>
              <button
                type="button"
                onClick={() => setRatingSource('blended')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  ratingSource === 'blended'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Use your personal rating for Best Picture films you have logged, and the Academy benchmark for unseen entries"
              >
                Blended BP Avg ★
              </button>
            </div>

            {/* Y-Axis Scale Toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setChartScale('dynamic')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  chartScale === 'dynamic'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Zoom Shift
              </button>
              <button
                type="button"
                onClick={() => setChartScale('full')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  chartScale === 'full'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                0.5★–5.0★ Scale
              </button>
            </div>
          </div>
        </div>

        {/* 4-Card Divergence Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-md">
            <div className="text-[11px] text-slate-400">
              Mean Decade Divergence (|Δ|)
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <span className="text-lg font-bold text-slate-100">
                ±{summaryStats.meanAbsDivergence.toFixed(2)}★
              </span>
              <span
                className={`text-xs font-semibold ${
                  summaryStats.meanSignedDivergence >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                Net {summaryStats.meanSignedDivergence >= 0 ? '+' : ''}
                {summaryStats.meanSignedDivergence.toFixed(2)}★
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
              Across {summaryStats.comparableCount} comparable release decades
            </div>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-md">
            <div className="text-[11px] text-slate-400">
              Closest / Highest Relative Era vs. AMPAS
            </div>
            {summaryStats.highestRelativeDecade ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-lg font-bold text-emerald-400">
                    {summaryStats.highestRelativeDecade.decadeLabel}
                  </span>
                  <span className="text-xs font-semibold text-slate-200">
                    {summaryStats.highestRelativeDecade.userDecadeAvg?.toFixed(2)}★ vs.{' '}
                    {summaryStats.highestRelativeDecade.activeOscarAvg?.toFixed(2)}★
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                  Gap:{' '}
                  {(summaryStats.highestRelativeDecade.divergenceDelta ?? 0) >= 0 ? '+' : ''}
                  {(summaryStats.highestRelativeDecade.divergenceDelta ?? 0).toFixed(2)}★ ·{' '}
                  {summaryStats.highestRelativeDecade.userRatedCount} rated films
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-2">No comparable decades</div>
            )}
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-md">
            <div className="text-[11px] text-slate-400">
              Strongest Divergence Below AMPAS
            </div>
            {summaryStats.widestNegativeDecade ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-lg font-bold text-rose-400">
                    {summaryStats.widestNegativeDecade.decadeLabel}
                  </span>
                  <span className="text-xs font-semibold text-slate-200">
                    {summaryStats.widestNegativeDecade.userDecadeAvg?.toFixed(2)}★ vs.{' '}
                    {summaryStats.widestNegativeDecade.activeOscarAvg?.toFixed(2)}★
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                  Gap:{' '}
                  {(summaryStats.widestNegativeDecade.divergenceDelta ?? 0) >= 0 ? '+' : ''}
                  {(summaryStats.widestNegativeDecade.divergenceDelta ?? 0).toFixed(2)}★ ·{' '}
                  {summaryStats.widestNegativeDecade.nonOscarOutperformers.length} non-BP films beat AMPAS
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-2">No comparable decades</div>
            )}
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-md">
            <div className="text-[11px] text-slate-400">
              Non-Oscar Films Beating Decade BP Avg
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <span className="text-lg font-bold text-amber-400">
                {summaryStats.totalNonOscarOutperformers.toLocaleString()} Films
              </span>
              <span className="text-xs text-sky-400">
                {summaryStats.totalOscarSeen}/{summaryStats.totalOscarEntries} BP Seen
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Personal favorites rated higher than their decade&apos;s Best Picture average
            </div>
          </div>
        </div>
      </div>

      {/* Dual-Line SVG Comparison Chart + Live Hover/Selected Decade Telemetry */}
      {chartGeometry && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-display font-semibold text-slate-100">
                  Decade Average Rating vs. Academy Best Picture Average Rating (Dual-Line &amp; Divergence Gap)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Vertical connector bars highlight the exact star rating divergence (Δ) in each decade. Click any decade node to inspect the underlying films below.
              </p>
            </div>

            {activeInspectedRow && (
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-xs font-mono tabular-nums flex flex-wrap items-center gap-3">
                <span className="text-amber-300 font-bold">
                  {activeInspectedRow.decadeLabel}
                </span>
                <span className="text-slate-300">
                  Your Avg:{' '}
                  <strong className="text-amber-400">
                    {activeInspectedRow.userDecadeAvg !== null
                      ? `${activeInspectedRow.userDecadeAvg.toFixed(2)}★`
                      : '—'}
                  </strong>
                </span>
                <span className="text-slate-300">
                  Academy BP Avg:{' '}
                  <strong className="text-sky-400">
                    {activeInspectedRow.activeOscarAvg !== null
                      ? `${activeInspectedRow.activeOscarAvg.toFixed(2)}★`
                      : '—'}
                  </strong>
                </span>
                {activeInspectedRow.divergenceDelta !== null && (
                  <span
                    className={`font-semibold ${
                      activeInspectedRow.divergenceDelta >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    Δ {activeInspectedRow.divergenceDelta >= 0 ? '+' : ''}
                    {activeInspectedRow.divergenceDelta.toFixed(2)}★
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-4">
            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 mb-3 font-mono tabular-nums">
              <div className="flex flex-wrap items-center gap-5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-amber-400 inline-block" />
                  <span className="text-slate-200">
                    Your Decade Average Rating (@{profile.username})
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-sky-400 inline-block" />
                  <span className="text-slate-200">
                    Academy Awards Best Picture Average Rating (
                    {benchmarkScope === 'winners_only' ? 'Winners Only' : 'Winners & Nominees'})
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-500/40 border border-rose-400 inline-block rounded-xs" />
                  <span>Divergence Gap (Δ)</span>
                </span>
              </div>
              <span className="text-slate-500">
                Click any decade column to inspect its Best Picture winners vs. your top films
              </span>
            </div>

            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="w-full h-auto select-none overflow-visible"
              role="img"
              aria-label="Dual-line chart comparing User Decade Average Rating against Academy Awards Best Picture Average Rating by decade"
            >
              {/* Horizontal Y-Axis Grid Lines */}
              {chartGeometry.yTicks.map((tick, idx) => {
                const ratio =
                  (tick - chartGeometry.minRating) /
                  Math.max(0.01, chartGeometry.maxRating - chartGeometry.minRating);
                const y =
                  chartGeometry.padTop +
                  chartGeometry.plotHeight -
                  ratio * chartGeometry.plotHeight;
                return (
                  <g key={idx}>
                    <line
                      x1={chartGeometry.padLeft}
                      y1={y}
                      x2={chartGeometry.width - chartGeometry.padRight}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray={idx === chartGeometry.yTicks.length - 1 ? undefined : '3 3'}
                      strokeWidth="1"
                    />
                    <text
                      x={chartGeometry.padLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {tick.toFixed(2)}★
                    </text>
                  </g>
                );
              })}

              {/* Vertical Divergence Connector Bars between User Decade Avg and Academy Best Picture Avg */}
              {chartGeometry.nodes.map((node) => {
                if (node.userY === null || node.oscarY === null) return null;
                const topY = Math.min(node.userY, node.oscarY);
                const barHeight = Math.max(2, Math.abs(node.userY - node.oscarY));
                const isPositive = (node.divergenceDelta ?? 0) >= 0;
                const isSelected = selectedDecadeNum === node.decadeNum;

                return (
                  <g key={`gap-${node.decadeNum}`}>
                    <rect
                      x={node.x - (isSelected ? 7 : 5)}
                      y={topY}
                      width={isSelected ? 14 : 10}
                      height={barHeight}
                      rx={2}
                      className={
                        isPositive
                          ? 'fill-emerald-500/25 stroke-emerald-400/60'
                          : 'fill-rose-500/25 stroke-rose-400/60'
                      }
                      strokeWidth={isSelected ? 1.5 : 1}
                    />
                  </g>
                );
              })}

              {/* Academy Best Picture Average Trend Line */}
              {chartGeometry.oscarLinePath && (
                <path
                  d={chartGeometry.oscarLinePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* User Decade Average Trend Line */}
              {chartGeometry.userLinePath && (
                <path
                  d={chartGeometry.userLinePath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Decade Nodes & Labels */}
              {chartGeometry.nodes.map((node) => {
                const isSelected = selectedDecadeNum === node.decadeNum;
                const isHovered = hoveredDecadeNum === node.decadeNum;

                return (
                  <g
                    key={node.decadeNum}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredDecadeNum(node.decadeNum)}
                    onMouseLeave={() => setHoveredDecadeNum(null)}
                    onClick={() => setSelectedDecadeNum(node.decadeNum)}
                  >
                    {/* Invisible Full-Column Hit Target */}
                    <rect
                      x={node.x - 28}
                      y={chartGeometry.padTop}
                      width={56}
                      height={chartGeometry.plotHeight + 40}
                      fill="transparent"
                    />

                    {/* Selection Vertical Guide */}
                    {(isSelected || isHovered) && (
                      <line
                        x1={node.x}
                        y1={chartGeometry.padTop}
                        x2={node.x}
                        y2={chartGeometry.padTop + chartGeometry.plotHeight}
                        stroke="#f59e0b"
                        strokeOpacity="0.35"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                      />
                    )}

                    {/* Academy Best Picture Node */}
                    {node.oscarY !== null && (
                      <>
                        <circle
                          cx={node.x}
                          cy={node.oscarY}
                          r={isSelected || isHovered ? 5.5 : 4.2}
                          className="fill-sky-400 stroke-slate-950"
                          strokeWidth="1.5"
                        />
                        <text
                          x={node.x}
                          y={
                            node.userY !== null && node.oscarY > node.userY
                              ? node.oscarY + 14
                              : Math.max(12, node.oscarY - 9)
                          }
                          textAnchor="middle"
                          className={`text-[9.5px] font-mono tabular-nums ${
                            isSelected || isHovered
                              ? 'fill-sky-300 font-bold'
                              : 'fill-sky-400/90'
                          }`}
                        >
                          {node.activeOscarAvg?.toFixed(2)}★
                        </text>
                      </>
                    )}

                    {/* User Decade Average Node */}
                    {node.userY !== null && (
                      <>
                        <circle
                          cx={node.x}
                          cy={node.userY}
                          r={isSelected || isHovered ? 6 : 4.5}
                          className="fill-amber-400 stroke-slate-950"
                          strokeWidth="1.5"
                        />
                        <text
                          x={node.x}
                          y={
                            node.oscarY !== null && node.userY >= node.oscarY
                              ? Math.min(
                                  chartGeometry.padTop + chartGeometry.plotHeight - 2,
                                  node.userY + 14
                                )
                              : Math.max(12, node.userY - 9)
                          }
                          textAnchor="middle"
                          className={`text-[10px] font-mono tabular-nums ${
                            isSelected || isHovered
                              ? 'fill-amber-300 font-bold'
                              : 'fill-amber-400'
                          }`}
                        >
                          {node.userDecadeAvg?.toFixed(2)}★
                        </text>
                      </>
                    )}

                    {/* X-Axis Decade Label */}
                    <text
                      x={node.x}
                      y={chartGeometry.padTop + chartGeometry.plotHeight + 18}
                      textAnchor="middle"
                      className={`text-[10.5px] font-mono tabular-nums ${
                        isSelected
                          ? 'fill-amber-400 font-bold'
                          : isHovered
                          ? 'fill-slate-100 font-semibold'
                          : 'fill-slate-300'
                      }`}
                    >
                      {node.decadeLabel}
                    </text>

                    {/* Delta Sub-Label under Decade */}
                    {node.divergenceDelta !== null && (
                      <text
                        x={node.x}
                        y={chartGeometry.padTop + chartGeometry.plotHeight + 32}
                        textAnchor="middle"
                        className={`text-[9.5px] font-mono tabular-nums ${
                          node.divergenceDelta >= 0
                            ? 'fill-emerald-400'
                            : 'fill-rose-400'
                        }`}
                      >
                        {node.divergenceDelta >= 0 ? '+' : ''}
                        {node.divergenceDelta.toFixed(2)}★
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Decade-by-Decade Taste Divergence Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Decade-by-Decade Taste Divergence Ledger
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Compares your Decade Average Rating against the Academy Awards Best Picture Average Rating, alongside how you rated the Academy&apos;s Best Picture picks you&apos;ve seen. Click any row to inspect that decade&apos;s films below.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Selected Era: <strong className="text-amber-400">{selectedDecadeNum}s</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2.5 pr-3">Release Decade</th>
                <th className="py-2.5 px-3 text-right text-amber-400">
                  Your Decade Avg ★
                </th>
                <th className="py-2.5 px-3 text-right text-sky-400">
                  Academy BP Avg ★
                </th>
                <th className="py-2.5 px-3 text-right">
                  Your Avg on Seen BP
                </th>
                <th className="py-2.5 px-3 text-right">
                  Divergence (Δ)
                </th>
                <th className="py-2.5 px-3 w-44">
                  Divergence Magnitude
                </th>
                <th className="py-2.5 pl-3">
                  Taste Divergence Verdict &amp; Top Outperformer
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {decadeRows.map((row) => {
                const isSelected = selectedDecadeNum === row.decadeNum;
                const delta = row.divergenceDelta ?? 0;
                const barPct =
                  row.divergenceDelta !== null
                    ? Math.min(
                        100,
                        Math.max(8, Math.round((Math.abs(delta) / summaryStats.maxAbsDelta) * 100))
                      )
                    : 0;
                const topOutperformer =
                  row.nonOscarOutperformers[0] || row.topUserFilms[0] || null;

                return (
                  <tr
                    key={row.decadeNum}
                    onClick={() => setSelectedDecadeNum(row.decadeNum)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-mono tabular-nums">
                      <div className="font-semibold text-slate-100">
                        {row.decadeLabel}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.userRatedCount} rated · {row.oscarEntriesCount} BP entries
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {row.userDecadeAvg !== null ? (
                        <span className="font-semibold text-amber-400">
                          {row.userDecadeAvg.toFixed(2)} ★
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {row.activeOscarAvg !== null ? (
                        <div>
                          <span className="font-semibold text-sky-400">
                            {row.activeOscarAvg.toFixed(2)} ★
                          </span>
                          <div className="text-[10px] text-slate-500">
                            {row.oscarWinnersCount}W / {row.oscarEntriesCount} total
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {row.userOnOscarAvg !== null ? (
                        <div>
                          <span className="text-slate-200 font-medium">
                            {row.userOnOscarAvg.toFixed(2)} ★
                          </span>
                          <div className="text-[10px] text-slate-500">
                            {row.oscarSeenCount}/{row.oscarEntriesCount} seen
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">Unlogged</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                      {row.divergenceDelta !== null ? (
                        <span
                          className={
                            row.divergenceDelta >= 0.05
                              ? 'text-emerald-400'
                              : row.divergenceDelta <= -0.05
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }
                        >
                          {row.divergenceDelta >= 0 ? '+' : ''}
                          {row.divergenceDelta.toFixed(2)} ★
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      {row.divergenceDelta !== null ? (
                        <div className="w-full h-2 bg-slate-950 rounded overflow-hidden flex items-center">
                          <div
                            style={{ width: `${barPct}%` }}
                            className={`h-full rounded ${
                              row.divergenceDelta >= 0
                                ? 'bg-emerald-500/80'
                                : 'bg-rose-500/80'
                            }`}
                          />
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="py-2.5 pl-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={`font-medium ${
                            row.verdictTone === 'positive'
                              ? 'text-emerald-400'
                              : row.verdictTone === 'aligned'
                              ? 'text-amber-300'
                              : row.verdictTone === 'skeptical_of_winners'
                              ? 'text-sky-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {row.verdictLabel}
                        </span>
                        {topOutperformer && (
                          <>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="text-slate-400">
                              Top Pick: <strong className="text-slate-200">{topOutperformer.title}</strong> (
                              {topOutperformer.rating?.toFixed(1)}★)
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Decade Film-Level Divergence Inspector */}
      {selectedDetailRow && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-amber-400">
                <Award className="w-4 h-4 shrink-0" />
                <span>{selectedDetailRow.decadeLabel} Era Film-Level Divergence Breakdown</span>
                <span aria-hidden="true">·</span>
                <span>
                  Your {selectedDetailRow.decadeLabel} Avg:{' '}
                  {selectedDetailRow.userDecadeAvg !== null
                    ? `${selectedDetailRow.userDecadeAvg.toFixed(2)}★`
                    : '—'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-sky-400">
                  Academy BP Avg:{' '}
                  {selectedDetailRow.activeOscarAvg !== null
                    ? `${selectedDetailRow.activeOscarAvg.toFixed(2)}★`
                    : '—'}
                </span>
              </div>
              <h4 className="text-sm font-display font-semibold text-slate-100 mt-1">
                {selectedDetailRow.decadeLabel} Academy Best Picture Honorees vs. Your Highest-Rated {selectedDetailRow.decadeLabel} Releases
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Quick Decade Pill Switcher */}
              <div className="flex flex-wrap items-center gap-1">
                {decadeRows.map((r) => (
                  <button
                    key={r.decadeNum}
                    type="button"
                    onClick={() => setSelectedDecadeNum(r.decadeNum)}
                    className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                      selectedDecadeNum === r.decadeNum
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {r.decadeLabel}
                  </button>
                ))}
              </div>

              {onSelectDecadeInOverview && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectDecadeInOverview(
                      selectedDetailRow.decadeNum,
                      selectedDetailRow.decadeLabel
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Inspect {selectedDetailRow.decadeLabel} in Overview</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Column: Official Academy Best Picture Winners & Nominees in Decade */}
            <div className="bg-slate-950 border border-slate-800 rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <h5 className="text-xs font-display font-semibold text-sky-300">
                    Academy Awards Best Picture Honorees ({selectedDetailRow.decadeLabel})
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Official AMPAS Best Picture winners &amp; nominees with your logged rating and divergence
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-sky-400 font-semibold">
                  Avg {selectedDetailRow.activeOscarAvg?.toFixed(2) ?? '—'}★
                </span>
              </div>

              {selectedDetailRow.oscarFilms.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No Academy Best Picture entries matched the current filter for the {selectedDetailRow.decadeLabel}.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/70">
                  {selectedDetailRow.oscarFilms.map((item) => (
                    <div
                      key={`${item.entry.title}-${item.entry.year}`}
                      className="py-2.5 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.userFilm && onInspectFilm) {
                                onInspectFilm(item.userFilm);
                              } else if (onInspectExternalFilm) {
                                onInspectExternalFilm(
                                  item.entry.title,
                                  item.entry.year,
                                  item.entry.director
                                );
                              }
                            }}
                            className="font-medium text-slate-100 hover:text-amber-300 text-left transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>{item.entry.title}</span>
                            <ArrowUpRight className="w-3 h-3 text-slate-500" />
                          </button>
                          <span className="font-mono tabular-nums text-slate-500">
                            ({item.entry.year})
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              item.entry.status === 'Winner'
                                ? 'text-amber-400 font-semibold'
                                : 'text-slate-400'
                            }`}
                          >
                            · {item.entry.status === 'Winner' ? '★ Best Picture Winner' : 'Nominee'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          Dir. {item.entry.director} · {item.entry.ceremonyOrIssue}
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-sky-400">
                          AMPAS {item.entry.consensusRating.toFixed(1)}★
                        </div>
                        {item.userRating !== null ? (
                          <div className="text-[11px] mt-0.5">
                            <span className="text-amber-300 font-semibold">
                              You: {item.userRating.toFixed(1)}★
                            </span>{' '}
                            {item.filmDelta !== null && (
                              <span
                                className={
                                  item.filmDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                ({item.filmDelta >= 0 ? '+' : ''}
                                {item.filmDelta.toFixed(1)}★)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 mt-0.5">Unlogged</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: User's Highest-Rated Films of the Decade & Non-Oscar Outperformers */}
            <div className="bg-slate-950 border border-slate-800 rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <h5 className="text-xs font-display font-semibold text-amber-300">
                    Your Highest-Rated {selectedDetailRow.decadeLabel} Films &amp; Non-Oscar Outperformers
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {selectedDetailRow.nonOscarOutperformers.length} non-Best-Picture films in your archive beat the {selectedDetailRow.decadeLabel} Academy BP Average ({selectedDetailRow.activeOscarAvg?.toFixed(2) ?? '—'}★)
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-amber-400 font-semibold">
                  Decade Avg {selectedDetailRow.userDecadeAvg?.toFixed(2) ?? '—'}★
                </span>
              </div>

              {selectedDetailRow.topUserFilms.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No rated films logged in your archive for the {selectedDetailRow.decadeLabel}.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/70">
                  {selectedDetailRow.topUserFilms.map((film) => {
                    const beatsOscarAvg =
                      film.rating !== null &&
                      selectedDetailRow.activeOscarAvg !== null &&
                      film.rating > selectedDetailRow.activeOscarAvg;
                    const vsOscarAvg =
                      film.rating !== null && selectedDetailRow.activeOscarAvg !== null
                        ? film.rating - selectedDetailRow.activeOscarAvg
                        : null;

                    return (
                      <div
                        key={film.id}
                        className="py-2.5 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onInspectFilm && onInspectFilm(film)}
                              className="font-medium text-slate-100 hover:text-amber-300 text-left transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>{film.title}</span>
                              <ArrowUpRight className="w-3 h-3 text-slate-500" />
                            </button>
                            <span className="font-mono tabular-nums text-slate-500">
                              ({film.year})
                            </span>
                            {beatsOscarAvg && (
                              <span className="text-[11px] font-mono text-emerald-400">
                                · Beats Decade BP Avg
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Dir. {film.director} · {film.genres.join(', ')}
                          </div>
                        </div>

                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <div className="text-amber-400 font-semibold">
                            {film.rating !== null ? `${film.rating.toFixed(1)}★` : '—'}
                          </div>
                          {vsOscarAvg !== null && (
                            <div
                              className={`text-[11px] mt-0.5 ${
                                vsOscarAvg >= 0 ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {vsOscarAvg >= 0 ? '+' : ''}
                              {vsOscarAvg.toFixed(2)}★ vs. BP Avg
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

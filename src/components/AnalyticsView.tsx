import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Filter,
  Layers,
  RotateCcw,
  Scale,
  Search,
  Star,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import { ViewingCalendarHeatmap } from './ViewingCalendarHeatmap';
import { FilmGroupCohort, GroupHistogramPanel } from './GroupHistogramPanel';
import { DecadeOscarDivergenceSubView } from './DecadeOscarDivergenceSubView';

interface AnalyticsViewProps {
  profile: ProfileAccount;
  activeCohort?: FilmGroupCohort | null;
  savedCohorts?: FilmGroupCohort[];
  onSelectCohort?: (cohort: FilmGroupCohort | null) => void;
  onSaveCohort?: (name: string, films: FilmEntry[]) => void;
  onDeleteSavedCohort?: (id: string) => void;
  onInspectFilm?: (film: FilmEntry) => void;
  onInspectExternalFilm?: (title: string, year: number, director?: string) => void;
}

type AnalyticsLabSubView = 'overview' | 'oscar_decade_divergence';

const RATING_BUCKETS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

function formatStarGlyphs(rating: number): string {
  const full = Math.floor(rating);
  const half = rating % 1 !== 0;
  return '★'.repeat(full) + (half ? '½' : '');
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  profile,
  activeCohort = null,
  savedCohorts = [],
  onSelectCohort,
  onSaveCohort,
  onDeleteSavedCohort,
  onInspectFilm,
  onInspectExternalFilm,
}) => {
  const [analyticsSubView, setAnalyticsSubView] = useState<AnalyticsLabSubView>('overview');
  const [selectedRatingBucket, setSelectedRatingBucket] = useState<number | null>(null);
  const [selectedPeriodBucket, setSelectedPeriodBucket] = useState<string | null>(null);
  const [selectedReleaseEraBucket, setSelectedReleaseEraBucket] = useState<{
    type: 'decade' | 'year';
    label: string;
    value: number;
  } | null>(null);
  const [chartOrientation, setChartOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [timelineGranularity, setTimelineGranularity] = useState<'yearly' | 'monthly'>('yearly');

  // Release Era Evolution Trend Chart controls
  const [releaseTrendResolution, setReleaseTrendResolution] = useState<'decade' | 'year'>('decade');
  const [releaseTrendScale, setReleaseTrendScale] = useState<'dynamic' | 'full'>('dynamic');
  const [releaseYearMinFilms, setReleaseYearMinFilms] = useState<number>(1);
  const [hoveredTrendKey, setHoveredTrendKey] = useState<string | null>(null);

  const [inlineReviewPhrase, setInlineReviewPhrase] = useState<string>('');
  const [inlineMetadataQuery, setInlineMetadataQuery] = useState<string>('');

  const [trayPage, setTrayPage] = useState<number>(1);
  const [traySearch, setTraySearch] = useState<string>('');
  const TRAY_PAGE_SIZE = 12;

  const presetCohorts = useMemo<FilmGroupCohort[]>(() => {
    const all = profile.films;
    const actionPacked = all.filter(
      (f) => f.notes && f.notes.toLowerCase().includes('action-packed')
    );
    const slowBurn = all.filter(
      (f) => f.notes && f.notes.toLowerCase().includes('slow-burn')
    );
    const tierS = all.filter((f) => f.tier === 'S' || (f.rating !== null && f.rating >= 4.5));
    const rewatched = all.filter((f) => f.rewatch);
    const watchlist = all.filter((f) => f.watchlist);

    const presets: FilmGroupCohort[] = [];
    if (actionPacked.length > 0) {
      presets.push({
        id: 'preset-phrase-action-packed',
        label: 'Review Phrase: "action-packed"',
        description: `${actionPacked.length} films containing "action-packed" in review text`,
        sourceType: 'search_results',
        films: actionPacked,
      });
    }
    if (slowBurn.length > 0) {
      presets.push({
        id: 'preset-phrase-slow-burn',
        label: 'Review Phrase: "slow-burn"',
        description: `${slowBurn.length} films containing "slow-burn" in review text`,
        sourceType: 'search_results',
        films: slowBurn,
      });
    }
    if (tierS.length > 0) {
      presets.push({
        id: 'preset-tier-s',
        label: 'Tier S Masterpieces (≥4.5★)',
        description: `${tierS.length} highest-rated films in @${profile.username}`,
        sourceType: 'group_section',
        films: tierS,
      });
    }
    if (rewatched.length > 0) {
      presets.push({
        id: 'preset-rewatched',
        label: 'Rewatched Favorites',
        description: `${rewatched.length} films logged as a rewatch`,
        sourceType: 'group_section',
        films: rewatched,
      });
    }
    if (watchlist.length > 0) {
      presets.push({
        id: 'preset-watchlist',
        label: 'Watchlist Queue',
        description: `${watchlist.length} unlogged watchlist targets`,
        sourceType: 'group_section',
        films: watchlist,
      });
    }
    return presets;
  }, [profile.films, profile.username]);

  const resolvedCohort = useMemo<FilmGroupCohort>(() => {
    let baseFilms = activeCohort ? activeCohort.films : profile.films;
    const rPhrase = inlineReviewPhrase.trim().toLowerCase();
    const mQuery = inlineMetadataQuery.trim().toLowerCase();

    if (rPhrase) {
      baseFilms = baseFilms.filter(
        (f) => f.notes && f.notes.toLowerCase().includes(rPhrase)
      );
    }
    if (mQuery) {
      baseFilms = baseFilms.filter(
        (f) =>
          f.title.toLowerCase().includes(mQuery) ||
          f.director.toLowerCase().includes(mQuery) ||
          String(f.year).includes(mQuery) ||
          f.genres.some((g) => g.toLowerCase().includes(mQuery)) ||
          f.tags.some((t) => t.toLowerCase().includes(mQuery))
      );
    }

    if (rPhrase || mQuery) {
      const parts: string[] = [];
      if (activeCohort) parts.push(activeCohort.label);
      if (rPhrase) parts.push(`Review Phrase: "${inlineReviewPhrase.trim()}"`);
      if (mQuery) parts.push(`Query: "${inlineMetadataQuery.trim()}"`);
      return {
        id: `inline-${rPhrase}-${mQuery}`,
        label: parts.join(' + '),
        description: `${baseFilms.length.toLocaleString()} matching films from @${profile.username}`,
        sourceType: 'search_results',
        films: baseFilms,
      };
    }

    if (activeCohort) {
      return activeCohort;
    }

    return {
      id: `full-account-${profile.id}`,
      label: `All Profile Films (@${profile.username})`,
      description: `Complete catalog (${profile.films.length.toLocaleString()} entries)`,
      sourceType: 'group_section',
      films: profile.films,
    };
  }, [activeCohort, inlineReviewPhrase, inlineMetadataQuery, profile]);

  const isSubsetActive =
    activeCohort !== null ||
    inlineReviewPhrase.trim().length > 0 ||
    inlineMetadataQuery.trim().length > 0;

  const effectiveProfile = useMemo<ProfileAccount>(
    () => ({
      ...profile,
      films: resolvedCohort.films,
    }),
    [profile, resolvedCohort.films]
  );

  useEffect(() => {
    setTrayPage(1);
    setTraySearch('');
    setSelectedRatingBucket(null);
    setSelectedPeriodBucket(null);
    setSelectedReleaseEraBucket(null);
  }, [profile.id, resolvedCohort.id]);

  const accountBaselineMean = useMemo(() => {
    const rated = profile.films.filter((f) => f.rating !== null);
    if (rated.length === 0) return 0;
    return rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length;
  }, [profile.films]);

  const stats = useMemo(() => {
    const films = resolvedCohort.films;
    const ratedFilms = films.filter((f) => f.rating !== null);
    const totalCount = films.length;
    const ratedCount = ratedFilms.length;

    const sumRatings = ratedFilms.reduce((acc, f) => acc + (f.rating ?? 0), 0);
    const meanRating = ratedCount > 0 ? sumRatings / ratedCount : 0;

    const variance =
      ratedCount > 0
        ? ratedFilms.reduce((acc, f) => acc + Math.pow((f.rating ?? 0) - meanRating, 2), 0) /
          ratedCount
        : 0;
    const stdDev = Math.sqrt(variance);

    const sortedRatings = ratedFilms
      .map((f) => f.rating as number)
      .sort((a, b) => a - b);
    const medianRating =
      sortedRatings.length > 0
        ? sortedRatings[Math.floor(sortedRatings.length / 2)]
        : 0;

    const totalMinutes = films.reduce((acc, f) => acc + (f.runtimeMinutes || 0), 0);
    const totalHours = Math.round(totalMinutes / 60);
    const rewatches = films.filter((f) => f.rewatch).length;
    const likedCount = films.filter((f) => f.liked).length;
    const fiveStarCount = ratedFilms.filter((f) => f.rating === 5.0).length;

    let runningCount = 0;
    const ratingDist = RATING_BUCKETS.map((bucket) => {
      const matching = ratedFilms.filter((f) => f.rating === bucket);
      runningCount += matching.length;
      return {
        bucket,
        glyph: formatStarGlyphs(bucket),
        count: matching.length,
        share: ratedCount > 0 ? (matching.length / ratedCount) * 100 : 0,
        cumulativePct: ratedCount > 0 ? (runningCount / ratedCount) * 100 : 0,
      };
    });
    const maxBucketCount = Math.max(1, ...ratingDist.map((d) => d.count));

    const modalBucket = [...ratingDist].sort((a, b) => b.count - a.count)[0];

    const yAxisMax = Math.max(4, Math.ceil(maxBucketCount / 5) * 5);
    const yAxisTicks = [
      yAxisMax,
      Math.round(yAxisMax * 0.75),
      Math.round(yAxisMax * 0.5),
      Math.round(yAxisMax * 0.25),
      0,
    ];

    const periodMap = new Map<
      string,
      { period: string; firstWatch: number; rewatch: number; total: number; ratingSum: number; ratedTotal: number }
    >();

    films.forEach((f) => {
      if (!f.watchedDate) return;
      const key =
        timelineGranularity === 'yearly'
          ? f.watchedDate.slice(0, 4)
          : f.watchedDate.slice(0, 7);
      if (!key) return;
      const cur = periodMap.get(key) || {
        period: key,
        firstWatch: 0,
        rewatch: 0,
        total: 0,
        ratingSum: 0,
        ratedTotal: 0,
      };
      cur.total += 1;
      if (f.rewatch) cur.rewatch += 1;
      else cur.firstWatch += 1;
      if (f.rating !== null) {
        cur.ratingSum += f.rating;
        cur.ratedTotal += 1;
      }
      periodMap.set(key, cur);
    });

    const timeline = Array.from(periodMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);
    const maxPeriodTotal = Math.max(1, ...timeline.map((t) => t.total));

    const genreMap = new Map<
      string,
      { genre: string; count: number; ratingSum: number; ratedCount: number; rewatches: number }
    >();
    films.forEach((f) => {
      f.genres.forEach((g) => {
        const cur = genreMap.get(g) || {
          genre: g,
          count: 0,
          ratingSum: 0,
          ratedCount: 0,
          rewatches: 0,
        };
        cur.count += 1;
        if (f.rewatch) cur.rewatches += 1;
        if (f.rating !== null) {
          cur.ratingSum += f.rating;
          cur.ratedCount += 1;
        }
        genreMap.set(g, cur);
      });
    });

    const genreBreakdown = Array.from(genreMap.values())
      .map((g) => {
        const avg = g.ratedCount > 0 ? g.ratingSum / g.ratedCount : meanRating;
        return {
          ...g,
          avgRating: avg,
          bias: avg - meanRating,
          share: totalCount > 0 ? (g.count / totalCount) * 100 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Baseline account decade map for reference when subset is active
    const baselineDecadeMap = new Map<number, { sum: number; count: number }>();
    profile.films.forEach((f) => {
      if (!f.year || f.rating === null) return;
      const decNum = Math.floor(f.year / 10) * 10;
      const cur = baselineDecadeMap.get(decNum) || { sum: 0, count: 0 };
      cur.sum += f.rating;
      cur.count += 1;
      baselineDecadeMap.set(decNum, cur);
    });

    const decadeMap = new Map<
      number,
      {
        decadeNum: number;
        decade: string;
        count: number;
        ratingSum: number;
        ratedCount: number;
        fiveStarCount: number;
        topFilm: FilmEntry | null;
      }
    >();
    films.forEach((f) => {
      if (!f.year) return;
      const decNum = Math.floor(f.year / 10) * 10;
      const dec = `${decNum}s`;
      const cur = decadeMap.get(decNum) || {
        decadeNum: decNum,
        decade: dec,
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        fiveStarCount: 0,
        topFilm: null,
      };
      cur.count += 1;
      if (f.rating !== null) {
        cur.ratingSum += f.rating;
        cur.ratedCount += 1;
        if (f.rating >= 4.5) cur.fiveStarCount += 1;
        if (
          !cur.topFilm ||
          (cur.topFilm.rating ?? 0) < f.rating ||
          ((cur.topFilm.rating ?? 0) === f.rating && (f.liked && !cur.topFilm.liked))
        ) {
          cur.topFilm = f;
        }
      } else if (!cur.topFilm) {
        cur.topFilm = f;
      }
      decadeMap.set(decNum, cur);
    });

    const decades = Array.from(decadeMap.values())
      .map((d) => {
        const avgRating = d.ratedCount > 0 ? d.ratingSum / d.ratedCount : 0;
        const baseDec = baselineDecadeMap.get(d.decadeNum);
        const baselineAvg = baseDec && baseDec.count > 0 ? baseDec.sum / baseDec.count : null;
        return {
          ...d,
          avgRating,
          biasVsMean: d.ratedCount > 0 ? avgRating - meanRating : 0,
          baselineAvg,
        };
      })
      .sort((a, b) => a.decadeNum - b.decadeNum);
    const maxDecadeCount = Math.max(1, ...decades.map((d) => d.count));

    // Year-of-Release evolution series
    const releaseYearMap = new Map<
      number,
      {
        year: number;
        count: number;
        ratingSum: number;
        ratedCount: number;
        fiveStarCount: number;
        topFilm: FilmEntry | null;
      }
    >();
    films.forEach((f) => {
      if (!f.year) return;
      const cur = releaseYearMap.get(f.year) || {
        year: f.year,
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        fiveStarCount: 0,
        topFilm: null,
      };
      cur.count += 1;
      if (f.rating !== null) {
        cur.ratingSum += f.rating;
        cur.ratedCount += 1;
        if (f.rating >= 4.5) cur.fiveStarCount += 1;
        if (!cur.topFilm || (cur.topFilm.rating ?? 0) < f.rating) {
          cur.topFilm = f;
        }
      } else if (!cur.topFilm) {
        cur.topFilm = f;
      }
      releaseYearMap.set(f.year, cur);
    });

    const rawReleaseYears = Array.from(releaseYearMap.values())
      .filter((y) => y.ratedCount > 0)
      .map((y) => ({
        ...y,
        avgRating: y.ratingSum / y.ratedCount,
        biasVsMean: y.ratingSum / y.ratedCount - meanRating,
      }))
      .sort((a, b) => a.year - b.year);

    // Compute 5-item centered rolling average across release years
    const releaseYearsWithRolling = rawReleaseYears.map((item, idx, arr) => {
      const windowSlice = arr.slice(Math.max(0, idx - 2), Math.min(arr.length, idx + 3));
      const weightedSum = windowSlice.reduce((s, w) => s + w.ratingSum, 0);
      const weightedCount = windowSlice.reduce((s, w) => s + w.ratedCount, 0);
      const rollingAvg = weightedCount > 0 ? weightedSum / weightedCount : item.avgRating;
      return {
        ...item,
        rollingAvg,
      };
    });

    // Classic (<2000) vs Modern (>=2000) taste evolution summary
    const classicRated = ratedFilms.filter((f) => f.year < 2000);
    const modernRated = ratedFilms.filter((f) => f.year >= 2000);
    const classicMean =
      classicRated.length > 0
        ? classicRated.reduce((s, f) => s + (f.rating ?? 0), 0) / classicRated.length
        : 0;
    const modernMean =
      modernRated.length > 0
        ? modernRated.reduce((s, f) => s + (f.rating ?? 0), 0) / modernRated.length
        : 0;

    const ratedDecades = decades.filter((d) => d.ratedCount > 0);
    const highestRatedDecade =
      ratedDecades.length > 0
        ? [...ratedDecades].sort((a, b) => b.avgRating - a.avgRating || b.ratedCount - a.ratedCount)[0]
        : null;
    const lowestRatedDecade =
      ratedDecades.length > 0
        ? [...ratedDecades].sort((a, b) => a.avgRating - b.avgRating || b.ratedCount - a.ratedCount)[0]
        : null;

    const directorMap = new Map<string, { director: string; count: number; ratingSum: number }>();
    films.forEach((f) => {
      if (!f.director || f.director === 'Catalog Enriched') return;
      const cur = directorMap.get(f.director) || {
        director: f.director,
        count: 0,
        ratingSum: 0,
      };
      cur.count += 1;
      cur.ratingSum += f.rating ?? meanRating;
      directorMap.set(f.director, cur);
    });
    const topDirectors = Array.from(directorMap.values())
      .map((d) => ({
        ...d,
        avgRating: d.ratingSum / d.count,
      }))
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating)
      .slice(0, 8);

    return {
      totalCount,
      ratedCount,
      meanRating,
      medianRating,
      stdDev,
      totalHours,
      rewatches,
      likedCount,
      fiveStarCount,
      ratingDist,
      maxBucketCount,
      modalBucket,
      yAxisMax,
      yAxisTicks,
      timeline,
      maxPeriodTotal,
      genreBreakdown,
      decades,
      ratedDecades,
      maxDecadeCount,
      releaseYears: releaseYearsWithRolling,
      classicMean,
      classicRatedCount: classicRated.length,
      modernMean,
      modernRatedCount: modernRated.length,
      highestRatedDecade,
      lowestRatedDecade,
      topDirectors,
    };
  }, [resolvedCohort.films, profile.films, timelineGranularity]);

  const bucketFilteredFilms = useMemo(() => {
    let base = resolvedCohort.films;
    if (selectedRatingBucket !== null) {
      base = base.filter((f) => f.rating === selectedRatingBucket);
    } else if (selectedPeriodBucket !== null) {
      base = base.filter(
        (f) => f.watchedDate && f.watchedDate.startsWith(selectedPeriodBucket)
      );
    } else if (selectedReleaseEraBucket !== null) {
      if (selectedReleaseEraBucket.type === 'decade') {
        base = base.filter(
          (f) => Math.floor(f.year / 10) * 10 === selectedReleaseEraBucket.value
        );
      } else {
        base = base.filter((f) => f.year === selectedReleaseEraBucket.value);
      }
    } else {
      return [];
    }

    const q = traySearch.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.director.toLowerCase().includes(q) ||
          f.genres.some((g) => g.toLowerCase().includes(q))
      );
    }
    return base;
  }, [
    resolvedCohort.films,
    selectedRatingBucket,
    selectedPeriodBucket,
    selectedReleaseEraBucket,
    traySearch,
  ]);

  const trayTotalPages = Math.max(1, Math.ceil(bucketFilteredFilms.length / TRAY_PAGE_SIZE));
  const safeTrayPage = Math.min(trayPage, trayTotalPages);
  const paginatedTrayFilms = bucketFilteredFilms.slice(
    (safeTrayPage - 1) * TRAY_PAGE_SIZE,
    safeTrayPage * TRAY_PAGE_SIZE
  );

  const meanAxisPositionPct = useMemo(() => {
    if (stats.ratedCount === 0) return 50;
    return Math.max(0, Math.min(100, ((stats.meanRating - 0.25) / 5.0) * 100));
  }, [stats.meanRating, stats.ratedCount]);

  // Build SVG geometry for the Release Decade / Release Year Taste Evolution Trend Line Chart
  const releaseTrendData = useMemo(() => {
    if (releaseTrendResolution === 'decade') {
      return stats.ratedDecades.map((d) => ({
        key: d.decade,
        label: d.decade,
        numericValue: d.decadeNum,
        type: 'decade' as const,
        avgRating: d.avgRating,
        rollingAvg: d.avgRating,
        baselineAvg: d.baselineAvg,
        ratedCount: d.ratedCount,
        totalCount: d.count,
        fiveStarCount: d.fiveStarCount,
        biasVsMean: d.biasVsMean,
        topFilm: d.topFilm,
      }));
    }
    return stats.releaseYears
      .filter((y) => y.ratedCount >= releaseYearMinFilms)
      .map((y) => ({
        key: String(y.year),
        label: String(y.year),
        numericValue: y.year,
        type: 'year' as const,
        avgRating: y.avgRating,
        rollingAvg: y.rollingAvg,
        baselineAvg: null as number | null,
        ratedCount: y.ratedCount,
        totalCount: y.count,
        fiveStarCount: y.fiveStarCount,
        biasVsMean: y.biasVsMean,
        topFilm: y.topFilm,
      }));
  }, [releaseTrendResolution, stats.ratedDecades, stats.releaseYears, releaseYearMinFilms]);

  const trendChartGeometry = useMemo(() => {
    const width = 920;
    const height = 290;
    const padLeft = 48;
    const padRight = 28;
    const padTop = 26;
    const padBottom = 42;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    if (releaseTrendData.length === 0) {
      return null;
    }

    const allRatings = releaseTrendData.flatMap((d) =>
      d.baselineAvg !== null ? [d.avgRating, d.rollingAvg, d.baselineAvg] : [d.avgRating, d.rollingAvg]
    );
    if (stats.meanRating > 0) allRatings.push(stats.meanRating);

    let minRating = 0.5;
    let maxRating = 5.0;
    if (releaseTrendScale === 'dynamic' && allRatings.length > 0) {
      const rawMin = Math.min(...allRatings);
      const rawMax = Math.max(...allRatings);
      minRating = Math.max(0.5, Math.floor((rawMin - 0.25) * 4) / 4);
      maxRating = Math.min(5.0, Math.ceil((rawMax + 0.25) * 4) / 4);
      if (maxRating - minRating < 1.0) {
        minRating = Math.max(0.5, minRating - 0.5);
        maxRating = Math.min(5.0, maxRating + 0.5);
      }
    }

    const maxVolume = Math.max(1, ...releaseTrendData.map((d) => d.ratedCount));

    const getX = (idx: number) => {
      if (releaseTrendData.length === 1) return padLeft + plotWidth / 2;
      return padLeft + (idx / (releaseTrendData.length - 1)) * plotWidth;
    };

    const getY = (rating: number) => {
      const clamped = Math.max(minRating, Math.min(maxRating, rating));
      const ratio = (clamped - minRating) / Math.max(0.01, maxRating - minRating);
      return padTop + plotHeight - ratio * plotHeight;
    };

    const points = releaseTrendData.map((d, idx) => ({
      ...d,
      x: getX(idx),
      y: getY(d.avgRating),
      rollingY: getY(d.rollingAvg),
      baselineY: d.baselineAvg !== null ? getY(d.baselineAvg) : null,
      volumeBarHeight: Math.max(3, (d.ratedCount / maxVolume) * (plotHeight * 0.28)),
    }));

    const linePath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    const rollingPath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.rollingY.toFixed(1)}`)
      .join(' ');

    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotHeight).toFixed(
            1
          )} L ${points[0].x.toFixed(1)} ${(padTop + plotHeight).toFixed(1)} Z`
        : '';

    const baselinePoints = points.filter((p) => p.baselineY !== null);
    const baselinePath =
      baselinePoints.length > 1
        ? baselinePoints
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${(p.baselineY as number).toFixed(1)}`)
            .join(' ')
        : '';

    const yTicks = [
      maxRating,
      minRating + (maxRating - minRating) * 0.75,
      minRating + (maxRating - minRating) * 0.5,
      minRating + (maxRating - minRating) * 0.25,
      minRating,
    ];

    const meanY = stats.meanRating > 0 ? getY(stats.meanRating) : null;

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
      points,
      linePath,
      rollingPath,
      areaPath,
      baselinePath,
      yTicks,
      meanY,
    };
  }, [releaseTrendData, releaseTrendScale, stats.meanRating]);

  const inspectedTrendPoint = useMemo(() => {
    if (releaseTrendData.length === 0) return null;
    if (hoveredTrendKey) {
      const match = releaseTrendData.find((p) => p.key === hoveredTrendKey);
      if (match) return match;
    }
    if (selectedReleaseEraBucket) {
      const match = releaseTrendData.find(
        (p) =>
          p.type === selectedReleaseEraBucket.type &&
          p.numericValue === selectedReleaseEraBucket.value
      );
      if (match) return match;
    }
    return releaseTrendData[releaseTrendData.length - 1];
  }, [releaseTrendData, hoveredTrendKey, selectedReleaseEraBucket]);

  return (
    <div className="space-y-6">
      {/* Analytics & Taste Lab Sub-View Switcher Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-[11px] font-mono tabular-nums uppercase tracking-widest text-amber-400">
            Analytics &amp; Taste Lab (@{profile.username})
          </div>
          <h2 className="text-base sm:text-lg font-display font-semibold text-slate-100">
            {analyticsSubView === 'overview'
              ? 'Rating Distributions, Viewing Heatmap & Release Era Evolution'
              : 'Decade Average Rating vs. Academy Awards Best Picture Average Rating'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setAnalyticsSubView('overview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              analyticsSubView === 'overview'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>1. Distribution, Timeline &amp; Taste Evolution</span>
          </button>

          <button
            type="button"
            onClick={() => setAnalyticsSubView('oscar_decade_divergence')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              analyticsSubView === 'oscar_decade_divergence'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>2. Decade Avg vs. Academy Best Picture Divergence</span>
          </button>
        </div>
      </div>

      {/* Target Film Group / Cohort Scope Selector & Live Search Builder */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-slate-300">
                  Analytics Target Group Scope
                </h2>
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                    isSubsetActive
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {resolvedCohort.label} ({resolvedCohort.films.length.toLocaleString()} of{' '}
                  {profile.films.length.toLocaleString()} films)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Every histogram, distribution chart, calendar heatmap, and genre table on this page dynamically adapts to the active group of films.
              </p>
            </div>
          </div>

          {isSubsetActive && (
            <button
              type="button"
              onClick={() => {
                onSelectCohort?.(null);
                setInlineReviewPhrase('');
                setInlineMetadataQuery('');
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-md inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Full Account ({profile.films.length.toLocaleString()})</span>
            </button>
          )}
        </div>

        {/* Saved Groups & Quick Preset Cohort Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-400 mr-1">Target Cohort:</span>
          <button
            type="button"
            onClick={() => {
              onSelectCohort?.(null);
              setInlineReviewPhrase('');
              setInlineMetadataQuery('');
            }}
            className={`px-2.5 py-1 text-xs rounded border transition-colors font-mono tabular-nums ${
              !isSubsetActive
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            Full Account ({profile.films.length.toLocaleString()})
          </button>

          {activeCohort &&
            !savedCohorts.some((c) => c.id === activeCohort.id) &&
            !presetCohorts.some((c) => c.id === activeCohort.id) && (
              <div className="inline-flex items-center rounded border bg-amber-500/20 border-amber-500/50 text-amber-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setInlineReviewPhrase('');
                    setInlineMetadataQuery('');
                  }}
                  className="px-2.5 py-1 font-medium"
                >
                  {activeCohort.label} ({activeCohort.films.length})
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCohort?.(null)}
                  className="px-1.5 py-1 hover:text-white border-l border-amber-500/30"
                  title="Clear active cohort"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

          {savedCohorts.map((cohort) => {
            const isSelected = activeCohort?.id === cohort.id && !inlineReviewPhrase && !inlineMetadataQuery;
            return (
              <div
                key={cohort.id}
                className={`inline-flex items-center rounded border text-xs transition-colors ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                    : 'bg-slate-950 text-sky-300 border-sky-500/30 hover:border-sky-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectCohort?.(cohort);
                    setInlineReviewPhrase('');
                    setInlineMetadataQuery('');
                  }}
                  className="px-2.5 py-1 inline-flex items-center gap-1"
                >
                  <Bookmark className="w-3 h-3" />
                  <span>{cohort.label}</span>
                  <span className="font-mono tabular-nums opacity-80">
                    ({cohort.films.length})
                  </span>
                </button>
                {onDeleteSavedCohort && (
                  <button
                    type="button"
                    onClick={() => onDeleteSavedCohort(cohort.id)}
                    className="px-1.5 py-1 hover:text-rose-400 border-l border-slate-800/50"
                    title="Delete saved group"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {presetCohorts.map((preset) => {
            const isSelected = activeCohort?.id === preset.id && !inlineReviewPhrase && !inlineMetadataQuery;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onSelectCohort?.(preset);
                  setInlineReviewPhrase('');
                  setInlineMetadataQuery('');
                }}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-amber-300'
                }`}
              >
                {preset.label}{' '}
                <span className="font-mono tabular-nums opacity-75">
                  ({preset.films.length})
                </span>
              </button>
            );
          })}
        </div>

        {/* Inline Live Group Builder */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <div className="relative">
            <FileText className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inlineReviewPhrase}
              onChange={(e) => setInlineReviewPhrase(e.target.value)}
              placeholder='Plot group by review phrase (e.g., "action-packed", "masterpiece")...'
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            {inlineReviewPhrase && (
              <button
                type="button"
                onClick={() => setInlineReviewPhrase('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inlineMetadataQuery}
              onChange={(e) => setInlineMetadataQuery(e.target.value)}
              placeholder="Filter group by director, genre, title, or tag (e.g., Sci-Fi, Denis Villeneuve)..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            {inlineMetadataQuery && (
              <button
                type="button"
                onClick={() => setInlineMetadataQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {analyticsSubView === 'oscar_decade_divergence' ? (
        <DecadeOscarDivergenceSubView
          profile={profile}
          effectiveFilms={resolvedCohort.films}
          cohortLabel={resolvedCohort.label}
          isSubsetActive={isSubsetActive}
          onInspectFilm={onInspectFilm}
          onInspectExternalFilm={onInspectExternalFilm}
          onSelectDecadeInOverview={(decadeNum, decadeLabel) => {
            setAnalyticsSubView('overview');
            setSelectedRatingBucket(null);
            setSelectedPeriodBucket(null);
            setSelectedReleaseEraBucket({
              type: 'decade',
              label: decadeLabel,
              value: decadeNum,
            });
          }}
        />
      ) : (
        <>
          {/* Multi-Dimension Group Histograms */}
          <GroupHistogramPanel
            cohort={resolvedCohort}
            baselineAllFilms={profile.films}
            onSaveCohort={onSaveCohort}
          />

          {/* Top Metric Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">
            {isSubsetActive ? 'Group Films' : 'Total Logged Films'}
          </div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.totalCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.ratedCount.toLocaleString()} rated · {stats.likedCount.toLocaleString()} liked
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Mean Rating</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-amber-400">
            {stats.meanRating.toFixed(2)} ★
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {isSubsetActive && stats.ratedCount > 0 ? (
              <span>
                {stats.meanRating - accountBaselineMean >= 0 ? '+' : ''}
                {(stats.meanRating - accountBaselineMean).toFixed(2)}★ vs. account ({accountBaselineMean.toFixed(2)}★)
              </span>
            ) : (
              <span>
                Median {stats.medianRating.toFixed(1)} ★ · σ {stats.stdDev.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Viewing Runtime</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.totalHours.toLocaleString()}h
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {(stats.totalHours / 24).toFixed(1)} continuous days
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Rewatch Cadence</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-400">
            {stats.totalCount > 0
              ? `${Math.round((stats.rewatches / stats.totalCount) * 100)}%`
              : '0%'}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.rewatches.toLocaleString()} rewatched entries
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">5.0★ Masterpiece Rate</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.ratedCount > 0
              ? `${((stats.fiveStarCount / stats.ratedCount) * 100).toFixed(1)}%`
              : '0.0%'}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.fiveStarCount.toLocaleString()} films at 5.0 ★
          </div>
        </div>
      </div>

      {/* Primary Two-Column Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-display font-semibold text-slate-100">
                  Star Rating Frequency Distribution (0.5★ – 5.0★)
                </h3>
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setChartOrientation('vertical')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    chartOrientation === 'vertical'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Columns
                </button>
                <button
                  type="button"
                  onClick={() => setChartOrientation('horizontal')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    chartOrientation === 'horizontal'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Horizontal Bars
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-5 font-mono tabular-nums">
              <span>Mean: {stats.meanRating.toFixed(2)}★</span>
              <span aria-hidden="true">·</span>
              <span>Median: {stats.medianRating.toFixed(1)}★</span>
              <span aria-hidden="true">·</span>
              <span>
                Mode:{' '}
                {stats.modalBucket
                  ? `${stats.modalBucket.bucket.toFixed(1)}★ (${stats.modalBucket.count.toLocaleString()})`
                  : '—'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-slate-500">Click bar to inspect</span>
            </div>
          </div>

          {chartOrientation === 'vertical' ? (
            <div>
              <div className="relative flex h-56 pt-4">
                <div className="w-10 pr-2 flex flex-col justify-between text-right text-[10px] font-mono tabular-nums text-slate-500 pb-6 select-none">
                  {stats.yAxisTicks.map((tick, idx) => (
                    <span key={idx} className="leading-none">
                      {tick.toLocaleString()}
                    </span>
                  ))}
                </div>

                <div className="relative flex-1 flex flex-col">
                  <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                    {stats.yAxisTicks.map((_, idx) => (
                      <div
                        key={idx}
                        className="w-full border-b border-slate-800/70 border-dashed last:border-solid last:border-slate-700"
                      />
                    ))}
                  </div>

                  {stats.ratedCount > 0 && (
                    <div
                      style={{ left: `${meanAxisPositionPct}%` }}
                      className="absolute top-0 bottom-6 border-l border-amber-400/60 border-dashed z-10 pointer-events-none"
                      title={`Mean Rating: ${stats.meanRating.toFixed(2)}★`}
                    >
                      <span className="absolute -top-3.5 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-mono tabular-nums bg-slate-950 border border-amber-500/40 rounded text-amber-300 whitespace-nowrap">
                        Avg {stats.meanRating.toFixed(2)}★
                      </span>
                    </div>
                  )}

                  <div className="relative z-10 flex-1 flex items-end gap-2 pb-6 px-1">
                    {stats.ratingDist.map((item) => {
                      const heightPct =
                        item.count > 0
                          ? Math.max(6, Math.round((item.count / stats.yAxisMax) * 100))
                          : 2;
                      const isSelected = selectedRatingBucket === item.bucket;

                      return (
                        <button
                          key={item.bucket}
                          type="button"
                          onClick={() => {
                            setSelectedPeriodBucket(null);
                            setSelectedReleaseEraBucket(null);
                            setSelectedRatingBucket((prev) =>
                              prev === item.bucket ? null : item.bucket
                            );
                          }}
                          title={`${item.bucket.toFixed(1)}★ (${item.glyph}): ${item.count.toLocaleString()} films (${item.share.toFixed(1)}%)`}
                          className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none"
                        >
                          <span
                            className={`text-[10px] font-mono tabular-nums mb-1 transition-colors ${
                              isSelected
                                ? 'text-amber-300 font-bold'
                                : item.count > 0
                                ? 'text-slate-300 group-hover:text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            {item.count.toLocaleString()}
                          </span>
                          <div className="w-full flex-1 flex items-end justify-center">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t transition-all ${
                                isSelected
                                  ? 'bg-amber-400 ring-2 ring-amber-300/60'
                                  : item.count === 0
                                  ? 'bg-slate-800/50'
                                  : item.bucket >= 4.5
                                  ? 'bg-amber-500/90 group-hover:bg-amber-400'
                                  : item.bucket >= 3.5
                                  ? 'bg-emerald-500/80 group-hover:bg-emerald-400'
                                  : item.bucket >= 2.5
                                  ? 'bg-sky-500/75 group-hover:bg-sky-400'
                                  : 'bg-rose-500/75 group-hover:bg-rose-400'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="h-6 flex items-center gap-2 px-1">
                    {stats.ratingDist.map((item) => {
                      const isSelected = selectedRatingBucket === item.bucket;
                      return (
                        <div
                          key={item.bucket}
                          className={`flex-1 text-center font-mono tabular-nums leading-tight ${
                            isSelected ? 'text-amber-400 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          <div className="text-[11px]">{item.bucket.toFixed(1)}★</div>
                          <div className="text-[9px] text-slate-500">
                            {item.share > 0 ? `${Math.round(item.share)}%` : '0%'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              {[...stats.ratingDist].reverse().map((item) => {
                const widthPct =
                  item.count > 0
                    ? Math.max(4, Math.round((item.count / stats.maxBucketCount) * 100))
                    : 0;
                const isSelected = selectedRatingBucket === item.bucket;

                return (
                  <button
                    key={item.bucket}
                    type="button"
                    onClick={() => {
                      setSelectedPeriodBucket(null);
                      setSelectedReleaseEraBucket(null);
                      setSelectedRatingBucket((prev) =>
                        prev === item.bucket ? null : item.bucket
                      );
                    }}
                    className={`w-full flex items-center gap-3 py-1 px-2 rounded transition-colors text-left ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="w-12 font-mono tabular-nums text-xs text-slate-200 flex items-center gap-1 shrink-0">
                      <span>{item.bucket.toFixed(1)}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </div>
                    <div className="w-16 text-xs text-amber-400/90 font-mono shrink-0">
                      {item.glyph}
                    </div>
                    <div className="flex-1 h-3 bg-slate-950 rounded overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full rounded transition-all ${
                          isSelected
                            ? 'bg-amber-400'
                            : item.bucket >= 4.5
                            ? 'bg-amber-500'
                            : item.bucket >= 3.5
                            ? 'bg-emerald-500'
                            : item.bucket >= 2.5
                            ? 'bg-sky-500'
                            : 'bg-rose-500'
                        }`}
                      />
                    </div>
                    <div className="w-24 text-right font-mono tabular-nums text-xs text-slate-300 shrink-0">
                      {item.count.toLocaleString()}{' '}
                      <span className="text-slate-500">({item.share.toFixed(0)}%)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Viewing History Timeline */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-display font-semibold text-slate-100">
                Viewing Diary Volume Over Time
              </h3>
              <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setTimelineGranularity('yearly');
                    setSelectedPeriodBucket(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    timelineGranularity === 'yearly'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By Year
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimelineGranularity('monthly');
                    setSelectedPeriodBucket(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    timelineGranularity === 'monthly'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Recent 12 Months
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              First-time watches (blue) vs. rewatches (green) across {timelineGranularity === 'yearly' ? 'calendar years' : 'recent months'}.
            </p>
          </div>

          <div className="h-52 flex items-end gap-2.5 pt-6 pb-2 border-b border-slate-800">
            {stats.timeline.map((m) => {
              const totalPct = Math.max(
                m.total > 0 ? 10 : 2,
                Math.round((m.total / stats.maxPeriodTotal) * 100)
              );
              const rewatchShare = m.total > 0 ? (m.rewatch / m.total) * 100 : 0;
              const isSelected = selectedPeriodBucket === m.period;

              return (
                <button
                  key={m.period}
                  type="button"
                  onClick={() => {
                    setSelectedRatingBucket(null);
                    setSelectedReleaseEraBucket(null);
                    setSelectedPeriodBucket((prev) =>
                      prev === m.period ? null : m.period
                    );
                  }}
                  className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none"
                >
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 mb-1.5 group-hover:text-slate-100">
                    {m.total.toLocaleString()}
                  </span>
                  <div className="w-full h-36 flex items-end justify-center">
                    <div
                      style={{ height: `${totalPct}%` }}
                      className={`w-full rounded-t overflow-hidden flex flex-col justify-end transition-all ${
                        isSelected ? 'ring-2 ring-amber-400' : ''
                      }`}
                    >
                      {m.rewatch > 0 && (
                        <div
                          style={{ height: `${rewatchShare}%` }}
                          className="w-full bg-emerald-400"
                          title={`${m.rewatch.toLocaleString()} rewatches`}
                        />
                      )}
                      <div
                        style={{ height: `${100 - rewatchShare}%` }}
                        className="w-full bg-sky-500/80 group-hover:bg-sky-400"
                        title={`${m.firstWatch.toLocaleString()} first-time watches`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            {stats.timeline.map((m) => (
              <div
                key={m.period}
                className="flex-1 text-center text-[10px] font-mono tabular-nums text-slate-400 truncate"
              >
                {timelineGranularity === 'yearly' ? m.period : m.period.slice(2)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Taste Evolution by Film Release Decade & Release Year (Trend Line Chart) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm font-display font-semibold text-slate-100">
                Taste Evolution by Film Release Era (Average Rating Trend Line)
              </h3>
              <span className="px-2 py-0.5 text-[11px] font-mono tabular-nums rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {releaseTrendResolution === 'decade'
                  ? `${stats.ratedDecades.length} Decades Plotted`
                  : `${releaseTrendData.length} Release Years Plotted`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Visualizes how @{profile.username}&apos;s mean star rating shifts across cinematic history by film release {releaseTrendResolution === 'decade' ? 'decade' : 'year'}. Click any node on the trend line to drill into the films of that era.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Resolution Switcher: By Release Decade vs. By Release Year */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => {
                  setReleaseTrendResolution('decade');
                  setHoveredTrendKey(null);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  releaseTrendResolution === 'decade'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                By Release Decade
              </button>
              <button
                type="button"
                onClick={() => {
                  setReleaseTrendResolution('year');
                  setHoveredTrendKey(null);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  releaseTrendResolution === 'year'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                By Release Year + 5-Yr Rolling Avg
              </button>
            </div>

            {/* Min Rated Films filter when in Release Year mode */}
            {releaseTrendResolution === 'year' && (
              <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                {[
                  { min: 1, label: 'All Years' },
                  { min: 2, label: '≥2 Rated' },
                  { min: 3, label: '≥3 Rated' },
                ].map((opt) => (
                  <button
                    key={opt.min}
                    type="button"
                    onClick={() => setReleaseYearMinFilms(opt.min)}
                    className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded transition-colors whitespace-nowrap ${
                      releaseYearMinFilms === opt.min
                        ? 'bg-slate-800 text-amber-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Y-Axis Scale Toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setReleaseTrendScale('dynamic')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  releaseTrendScale === 'dynamic'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Zoom Y-axis to highlight subtle rating shifts across decades"
              >
                Zoom Shift
              </button>
              <button
                type="button"
                onClick={() => setReleaseTrendScale('full')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  releaseTrendScale === 'full'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Show full 0.5★ – 5.0★ scale"
              >
                0.5★–5.0★ Scale
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAnalyticsSubView('oscar_decade_divergence')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Compare vs. Academy Best Picture by Decade →</span>
            </button>
          </div>
        </div>

        {/* Era Evolution Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-950/90 border border-slate-800/90 rounded-md p-3">
            <div className="text-[11px] text-slate-400">Peak Acclaim Era (Golden Decade)</div>
            {stats.highestRatedDecade ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-base font-display font-bold text-amber-400">
                    {stats.highestRatedDecade.decade}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">
                    {stats.highestRatedDecade.avgRating.toFixed(2)} ★
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                  {stats.highestRatedDecade.ratedCount} rated ·{' '}
                  <span className="text-emerald-400">
                    +{Math.max(0, stats.highestRatedDecade.biasVsMean).toFixed(2)}★ vs. mean
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-1">No rated decades</div>
            )}
          </div>

          <div className="bg-slate-950/90 border border-slate-800/90 rounded-md p-3">
            <div className="text-[11px] text-slate-400">Most Critical Era (Lowest Avg)</div>
            {stats.lowestRatedDecade ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-base font-display font-bold text-slate-200">
                    {stats.lowestRatedDecade.decade}
                  </span>
                  <span className="text-sm font-semibold text-slate-300">
                    {stats.lowestRatedDecade.avgRating.toFixed(2)} ★
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                  {stats.lowestRatedDecade.ratedCount} rated ·{' '}
                  <span className="text-rose-400">
                    {stats.lowestRatedDecade.biasVsMean >= 0 ? '+' : ''}
                    {stats.lowestRatedDecade.biasVsMean.toFixed(2)}★ vs. mean
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-1">No rated decades</div>
            )}
          </div>

          <div className="bg-slate-950/90 border border-slate-800/90 rounded-md p-3">
            <div className="text-[11px] text-slate-400">20th Century vs. 21st Century Shift</div>
            {stats.classicRatedCount > 0 && stats.modernRatedCount > 0 ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-xs text-slate-300">
                    Pre-2000: <strong className="text-amber-300">{stats.classicMean.toFixed(2)}★</strong>
                  </span>
                  <span className="text-xs text-slate-300">
                    2000+: <strong className="text-sky-300">{stats.modernMean.toFixed(2)}★</strong>
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                  {stats.classicMean >= stats.modernMean ? (
                    <span className="text-amber-300">
                      +{(stats.classicMean - stats.modernMean).toFixed(2)}★ Classic Cinema Tilt
                    </span>
                  ) : (
                    <span className="text-sky-300">
                      +{(stats.modernMean - stats.classicMean).toFixed(2)}★ Contemporary Cinema Tilt
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                {stats.classicRatedCount > 0
                  ? `Pre-2000 Mean: ${stats.classicMean.toFixed(2)}★`
                  : stats.modernRatedCount > 0
                  ? `2000+ Mean: ${stats.modernMean.toFixed(2)}★`
                  : 'Insufficient era spread'}
              </div>
            )}
          </div>

          {/* Active Hovered / Selected Node Inspector Card */}
          <div className="bg-slate-950/90 border border-amber-500/30 rounded-md p-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-amber-300/90">
              <span className="inline-flex items-center gap-1 font-medium">
                <Compass className="w-3 h-3" />
                <span>
                  {inspectedTrendPoint
                    ? `Inspected ${inspectedTrendPoint.type === 'decade' ? 'Decade' : 'Release Year'}: ${inspectedTrendPoint.label}`
                    : 'Era Inspector'}
                </span>
              </span>
              {inspectedTrendPoint && (
                <span className="font-mono tabular-nums text-amber-400 font-bold">
                  {inspectedTrendPoint.avgRating.toFixed(2)} ★
                </span>
              )}
            </div>
            {inspectedTrendPoint ? (
              <>
                <div className="text-[11px] text-slate-300 font-mono tabular-nums mt-1">
                  {inspectedTrendPoint.ratedCount} rated ({inspectedTrendPoint.fiveStarCount} ≥4.5★) ·{' '}
                  <span
                    className={
                      inspectedTrendPoint.biasVsMean >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    {inspectedTrendPoint.biasVsMean >= 0 ? '+' : ''}
                    {inspectedTrendPoint.biasVsMean.toFixed(2)}★ vs. mean
                  </span>
                </div>
                {inspectedTrendPoint.topFilm && (
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    Top: <span className="text-slate-200">{inspectedTrendPoint.topFilm.title}</span>{' '}
                    {inspectedTrendPoint.topFilm.rating !== null && (
                      <span className="font-mono text-amber-400">
                        ({inspectedTrendPoint.topFilm.rating.toFixed(1)}★)
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-1">Hover or click any point on chart</div>
            )}
          </div>
        </div>

        {/* SVG Trend Line Visualization */}
        {!trendChartGeometry ? (
          <div className="h-60 flex items-center justify-center bg-slate-950/60 border border-slate-800/80 rounded-md text-xs text-slate-400">
            No rated films match the current filter criteria to plot a release-era rating trend line.
          </div>
        ) : (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-md p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 mb-2 px-1">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />
                  <span className="text-slate-200 font-medium">
                    {releaseTrendResolution === 'decade'
                      ? 'Decade Mean Star Rating'
                      : '5-Year Rolling Mean Trajectory'}
                  </span>
                </span>
                {releaseTrendResolution === 'year' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400/80 inline-block" />
                    <span>Annual Release Year Mean</span>
                  </span>
                )}
                {isSubsetActive && releaseTrendResolution === 'decade' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-b border-dashed border-sky-400 inline-block" />
                    <span className="text-sky-300">Full Account Baseline</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-b border-dashed border-emerald-400/80 inline-block" />
                  <span className="text-emerald-300/90 font-mono tabular-nums">
                    Overall Mean ({stats.meanRating.toFixed(2)}★)
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-slate-800 border border-slate-700 inline-block rounded-xs" />
                  <span>Rated Volume (Background Bars)</span>
                </span>
              </div>
              <span className="text-slate-500">
                Click any {releaseTrendResolution === 'decade' ? 'decade' : 'year'} node to inspect films below
              </span>
            </div>

            <svg
              viewBox={`0 0 ${trendChartGeometry.width} ${trendChartGeometry.height}`}
              className="w-full h-auto select-none overflow-visible"
              role="img"
              aria-label="Trend line chart showing shift in average ratings over film release decades and years"
            >
              <defs>
                <linearGradient id="tasteEvolutionAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.28" />
                  <stop offset="85%" stopColor="#f59e0b" stopOpacity="0.03" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Y-Axis Grid Lines & Star Labels */}
              {trendChartGeometry.yTicks.map((tick, idx) => {
                const ratio =
                  (tick - trendChartGeometry.minRating) /
                  Math.max(0.01, trendChartGeometry.maxRating - trendChartGeometry.minRating);
                const y =
                  trendChartGeometry.padTop +
                  trendChartGeometry.plotHeight -
                  ratio * trendChartGeometry.plotHeight;
                return (
                  <g key={idx}>
                    <line
                      x1={trendChartGeometry.padLeft}
                      y1={y}
                      x2={trendChartGeometry.width - trendChartGeometry.padRight}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray={idx === trendChartGeometry.yTicks.length - 1 ? undefined : '3 3'}
                      strokeWidth="1"
                    />
                    <text
                      x={trendChartGeometry.padLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {tick.toFixed(2)}★
                    </text>
                  </g>
                );
              })}

              {/* Background Rated Film Volume Bars along bottom of plot */}
              {trendChartGeometry.points.map((pt) => {
                const barWidth =
                  releaseTrendResolution === 'decade'
                    ? Math.min(34, Math.max(12, trendChartGeometry.plotWidth / Math.max(2, trendChartGeometry.points.length) * 0.45))
                    : Math.min(10, Math.max(3, trendChartGeometry.plotWidth / Math.max(10, trendChartGeometry.points.length) * 0.6));
                const bottomY = trendChartGeometry.padTop + trendChartGeometry.plotHeight;
                const isSelected =
                  selectedReleaseEraBucket?.type === pt.type &&
                  selectedReleaseEraBucket?.value === pt.numericValue;
                return (
                  <rect
                    key={`vol-${pt.key}`}
                    x={pt.x - barWidth / 2}
                    y={bottomY - pt.volumeBarHeight}
                    width={barWidth}
                    height={pt.volumeBarHeight}
                    rx={1.5}
                    className={
                      isSelected
                        ? 'fill-amber-500/35 stroke-amber-400/50'
                        : 'fill-slate-800/65 hover:fill-slate-700/70'
                    }
                  />
                );
              })}

              {/* Overall Profile Mean Horizontal Reference Line */}
              {trendChartGeometry.meanY !== null && (
                <g>
                  <line
                    x1={trendChartGeometry.padLeft}
                    y1={trendChartGeometry.meanY}
                    x2={trendChartGeometry.width - trendChartGeometry.padRight}
                    y2={trendChartGeometry.meanY}
                    stroke="#10b981"
                    strokeOpacity="0.65"
                    strokeDasharray="5 4"
                    strokeWidth="1.25"
                  />
                  <rect
                    x={trendChartGeometry.width - trendChartGeometry.padRight - 92}
                    y={trendChartGeometry.meanY - 17}
                    width="88"
                    height="15"
                    rx="3"
                    fill="#020617"
                    stroke="#10b981"
                    strokeOpacity="0.4"
                  />
                  <text
                    x={trendChartGeometry.width - trendChartGeometry.padRight - 48}
                    y={trendChartGeometry.meanY - 6.5}
                    textAnchor="middle"
                    className="fill-emerald-300 text-[9.5px] font-mono tabular-nums"
                  >
                    Mean {stats.meanRating.toFixed(2)}★
                  </text>
                </g>
              )}

              {/* Shaded Area under Primary Trend Line */}
              {trendChartGeometry.areaPath && (
                <path d={trendChartGeometry.areaPath} fill="url(#tasteEvolutionAreaGrad)" />
              )}

              {/* Full Account Baseline Reference Path when Subset Cohort is Active */}
              {isSubsetActive &&
                releaseTrendResolution === 'decade' &&
                trendChartGeometry.baselinePath && (
                  <path
                    d={trendChartGeometry.baselinePath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.75"
                    strokeDasharray="4 4"
                    strokeOpacity="0.8"
                  />
                )}

              {/* In Year mode: subtle raw year-to-year line + bold 5-year rolling average line */}
              {releaseTrendResolution === 'year' ? (
                <>
                  <path
                    d={trendChartGeometry.linePath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                    strokeOpacity="0.45"
                  />
                  <path
                    d={trendChartGeometry.rollingPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              ) : (
                <path
                  d={trendChartGeometry.linePath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Data Nodes & X-Axis Labels */}
              {trendChartGeometry.points.map((pt, idx) => {
                const isSelected =
                  selectedReleaseEraBucket?.type === pt.type &&
                  selectedReleaseEraBucket?.value === pt.numericValue;
                const isHovered = hoveredTrendKey === pt.key;
                const showXLabel =
                  releaseTrendResolution === 'decade' ||
                  trendChartGeometry.points.length <= 18 ||
                  idx === 0 ||
                  idx === trendChartGeometry.points.length - 1 ||
                  pt.numericValue % 10 === 0 ||
                  idx % Math.ceil(trendChartGeometry.points.length / 12) === 0;

                return (
                  <g
                    key={pt.key}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredTrendKey(pt.key)}
                    onMouseLeave={() => setHoveredTrendKey(null)}
                    onClick={() => {
                      setSelectedRatingBucket(null);
                      setSelectedPeriodBucket(null);
                      setSelectedReleaseEraBucket((prev) =>
                        prev && prev.type === pt.type && prev.value === pt.numericValue
                          ? null
                          : {
                              type: pt.type,
                              label: pt.label,
                              value: pt.numericValue,
                            }
                      );
                    }}
                  >
                    {/* Vertical hover/selection guide */}
                    {(isHovered || isSelected) && (
                      <line
                        x1={pt.x}
                        y1={trendChartGeometry.padTop}
                        x2={pt.x}
                        y2={trendChartGeometry.padTop + trendChartGeometry.plotHeight}
                        stroke="#f59e0b"
                        strokeOpacity="0.4"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                      />
                    )}

                    {/* Invisible larger hit target for easy clicking/hovering */}
                    <circle cx={pt.x} cy={pt.y} r={12} fill="transparent" />

                    {/* Visible Point Circle */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={
                        isSelected || isHovered
                          ? 6
                          : releaseTrendResolution === 'decade'
                          ? 4.5
                          : 3
                      }
                      className={
                        isSelected
                          ? 'fill-amber-300 stroke-slate-950'
                          : isHovered
                          ? 'fill-amber-400 stroke-slate-950'
                          : releaseTrendResolution === 'decade'
                          ? 'fill-amber-400 stroke-slate-950'
                          : 'fill-sky-400 stroke-slate-950'
                      }
                      strokeWidth="1.5"
                    />

                    {/* Value Badge above node in Decade mode or when Hovered/Selected */}
                    {(releaseTrendResolution === 'decade' || isHovered || isSelected) && (
                      <text
                        x={pt.x}
                        y={Math.max(12, pt.y - 10)}
                        textAnchor="middle"
                        className={`text-[10px] font-mono tabular-nums ${
                          isSelected || isHovered
                            ? 'fill-amber-300 font-bold'
                            : 'fill-slate-200 font-medium'
                        }`}
                      >
                        {pt.avgRating.toFixed(2)}★
                      </text>
                    )}

                    {/* X-Axis Era / Year Label */}
                    {showXLabel && (
                      <text
                        x={pt.x}
                        y={trendChartGeometry.padTop + trendChartGeometry.plotHeight + 18}
                        textAnchor="middle"
                        className={`text-[10px] font-mono tabular-nums ${
                          isSelected || isHovered
                            ? 'fill-amber-400 font-bold'
                            : 'fill-slate-400'
                        }`}
                      >
                        {pt.label}
                      </text>
                    )}

                    {/* Sub-label for rated film count in Decade mode */}
                    {releaseTrendResolution === 'decade' && (
                      <text
                        x={pt.x}
                        y={trendChartGeometry.padTop + trendChartGeometry.plotHeight + 31}
                        textAnchor="middle"
                        className="fill-slate-500 text-[9px] font-mono tabular-nums"
                      >
                        n={pt.ratedCount}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Paginated Drilldown Tray */}
      {(selectedRatingBucket !== null ||
        selectedPeriodBucket !== null ||
        selectedReleaseEraBucket !== null) && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-display font-semibold text-amber-300">
                {selectedRatingBucket !== null
                  ? `Films Rated ${selectedRatingBucket.toFixed(1)} ★ (${formatStarGlyphs(
                      selectedRatingBucket
                    )}) — ${bucketFilteredFilms.length.toLocaleString()} matching entries`
                  : selectedPeriodBucket !== null
                  ? `Films Logged in ${selectedPeriodBucket} — ${bucketFilteredFilms.length.toLocaleString()} matching entries`
                  : `Films Released in ${selectedReleaseEraBucket?.label} — ${bucketFilteredFilms.length.toLocaleString()} matching entries`}
              </h4>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={traySearch}
                  onChange={(e) => {
                    setTraySearch(e.target.value);
                    setTrayPage(1);
                  }}
                  placeholder="Filter within bucket..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedRatingBucket(null);
                  setSelectedPeriodBucket(null);
                  setSelectedReleaseEraBucket(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
              >
                Close inspection
              </button>
            </div>
          </div>

          {paginatedTrayFilms.length === 0 ? (
            <p className="text-xs text-slate-400">
              No films match the current filter in this bucket.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {paginatedTrayFilms.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onInspectFilm && onInspectFilm(f)}
                    className="p-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded flex items-center justify-between gap-2 text-xs text-left transition-colors cursor-pointer group"
                    title="Click to open unified Film Dossier, Credits & Oscar Ballot history"
                  >
                    <div className="truncate">
                      <div className="font-medium text-slate-100 group-hover:text-amber-300 truncate transition-colors">
                        {f.title}
                      </div>
                      <div className="text-slate-500 font-mono tabular-nums truncate">
                        {f.year} · {f.director}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-amber-400 shrink-0">
                      {f.rating !== null ? `${f.rating.toFixed(1)}★` : '—'}
                    </div>
                  </button>
                ))}
              </div>

              {trayTotalPages > 1 && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                  <span>
                    Showing {(safeTrayPage - 1) * TRAY_PAGE_SIZE + 1}–
                    {Math.min(safeTrayPage * TRAY_PAGE_SIZE, bucketFilteredFilms.length)} of{' '}
                    {bucketFilteredFilms.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeTrayPage <= 1}
                      onClick={() => setTrayPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      Page {safeTrayPage} / {trayTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeTrayPage >= trayTotalPages}
                      onClick={() => setTrayPage((p) => Math.min(trayTotalPages, p + 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Calendar-Style Viewing & Rating Intensity Heatmap */}
      <ViewingCalendarHeatmap profile={effectiveProfile} />

      {/* Secondary Two-Column Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Genre Volume & Personal Rating Bias
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Baseline Mean: {stats.meanRating.toFixed(2)} ★
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Frequency of genres logged alongside how much higher or lower you rate each genre relative to your overall average.
          </p>

          <div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="py-2 pr-3">Genre</th>
                  <th className="py-2 px-3 text-right">Films</th>
                  <th className="py-2 px-3 w-36">Volume Share</th>
                  <th className="py-2 px-3 text-right">Mean Rating</th>
                  <th className="py-2 pl-3 text-right">Bias vs. Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.genreBreakdown.map((g) => (
                  <tr key={g.genre} className="h-9 hover:bg-slate-800/30">
                    <td className="py-1.5 pr-3 font-medium text-slate-200">{g.genre}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {g.count.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="w-full h-2 bg-slate-950 rounded overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, g.share)}%` }}
                          className="h-full bg-amber-500/80 rounded"
                        />
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-amber-400">
                      {g.avgRating.toFixed(2)} ★
                    </td>
                    <td
                      className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                        g.bias >= 0.05
                          ? 'text-emerald-400'
                          : g.bias <= -0.05
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {g.bias >= 0 ? `+${g.bias.toFixed(2)}` : g.bias.toFixed(2)} ★
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
              Viewing by Release Decade
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Film count and average star rating across cinematic eras. Click any decade to inspect its films.
            </p>
            <div className="space-y-2">
              {stats.decades.map((d) => {
                const widthPct = Math.round((d.count / stats.maxDecadeCount) * 100);
                const isSelected =
                  selectedReleaseEraBucket?.type === 'decade' &&
                  selectedReleaseEraBucket?.value === d.decadeNum;
                return (
                  <button
                    key={d.decade}
                    type="button"
                    onClick={() => {
                      setSelectedRatingBucket(null);
                      setSelectedPeriodBucket(null);
                      setSelectedReleaseEraBucket((prev) =>
                        prev && prev.type === 'decade' && prev.value === d.decadeNum
                          ? null
                          : { type: 'decade', label: d.decade, value: d.decadeNum }
                      );
                    }}
                    className={`w-full text-left p-1.5 rounded transition-colors space-y-1 ${
                      isSelected ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200 font-medium">{d.decade}</span>
                      <span className="text-slate-400">
                        {d.count.toLocaleString()} films ·{' '}
                        <strong className="text-amber-400">{d.avgRating.toFixed(2)} ★</strong>
                        {d.ratedCount > 0 && (
                          <span
                            className={`ml-1.5 text-[11px] ${
                              d.biasVsMean >= 0.05
                                ? 'text-emerald-400'
                                : d.biasVsMean <= -0.05
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }`}
                          >
                            ({d.biasVsMean >= 0 ? '+' : ''}
                            {d.biasVsMean.toFixed(2)}★)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full rounded ${
                          isSelected ? 'bg-amber-400' : 'bg-sky-500/80'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
              Most-Logged Directors
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Auteurs with the highest diary frequency in this profile.
            </p>
            <div className="divide-y divide-slate-800/60 text-xs">
              {stats.topDirectors.map((dir) => (
                <div
                  key={dir.director}
                  className="py-2 flex items-center justify-between font-mono tabular-nums"
                >
                  <span className="font-sans font-medium text-slate-200">
                    {dir.director}
                  </span>
                  <span className="text-slate-400">
                    {dir.count.toLocaleString()} films ·{' '}
                    <strong className="text-amber-400">{dir.avgRating.toFixed(2)} ★</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Film,
  Globe,
  ListChecks,
  Loader2,
  PlusCircle,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { CineasteArchiveState } from '../types/cinema';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import { cloneFilmsArray } from '../utils/baselineDiff';
import { makeFilmId } from '../utils/letterboxdCsvParser';
import {
  exportFilmsToCsv,
  extractImportedCsvStructure,
  getLetterboxdExportFilename,
  parseLetterboxdCsvFiles,
} from '../utils/letterboxdParser';
import {
  applyScrapeResultToWorkspace,
  detectLetterboxdUrlType,
  runLetterboxdScraper,
  ScraperProgressUpdate,
} from '../utils/letterboxdScraper';

interface DataSourcesViewProps {
  profiles: ProfileAccount[];
  activeProfileId: string;
  onAddOrUpdateProfile: (profile: ProfileAccount, setAsActive: boolean) => void;
  onDeleteProfile: (id: string) => void;
  onSelectActiveProfile: (id: string) => void;
  archive?: CineasteArchiveState;
  onImportCsvToArchive?: (files: { fileName: string; content: string }[]) => {
    listsImported: number;
    reviewsImported: number;
  };
  onRestoreUnifiedWorkspace?: (payload: {
    archive?: CineasteArchiveState;
    profiles?: ProfileAccount[];
  }) => void;
  isBatchEnriching?: boolean;
  enrichProgress?: { done: number; total: number };
  onTriggerBatchEnrich?: () => void;
}

const SAMPLE_LETTERBOXD_CSV = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-10-25,Parasite,2019,https://boxd.it/hTha,5,Yes,"35mm, criterion",2026-10-25
2026-10-18,Anatomy of a Fall,2023,https://boxd.it/zSub,4.5,,"cannes, courtroom",2026-10-18
2026-10-11,Challengers,2024,https://boxd.it/zCha,4.5,Yes,"imax, score",2026-10-11
2026-10-02,Dune: Part Two,2024,https://boxd.it/zDun,4.5,,"70mm, sci-fi",2026-10-02
2026-09-21,The Substance,2024,https://boxd.it/zSub2,4,,"midnight, horror",2026-09-21
2026-09-14,In the Mood for Love,2000,https://boxd.it/29tA,5,Yes,"wong-kar-wai, romance",2026-09-14
2026-08-30,Zodiac,2007,https://boxd.it/29zO,4.5,Yes,"fincher, procedural",2026-08-30
2026-08-19,Poor Things,2023,https://boxd.it/zPoo,3.5,,"arthouse",2026-08-19
2026-08-05,The Thing,1982,https://boxd.it/29tH,5,Yes,"carpenter, horror",2026-08-05
2026-07-22,Mulholland Drive,2001,https://boxd.it/29mD,5,Yes,"lynch, mystery",2026-07-22`;

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  profiles,
  activeProfileId,
  onAddOrUpdateProfile,
  onDeleteProfile,
  onSelectActiveProfile,
  archive,
  onImportCsvToArchive,
  onRestoreUnifiedWorkspace,
  isBatchEnriching = false,
  enrichProgress = { done: 0, total: 0 },
  onTriggerBatchEnrich,
}) => {
  const [ingestionMode, setIngestionMode] = useState<'url_scraping' | 'csv_import'>('url_scraping');

  // Dedicated Single Film URL Scraper state
  const [filmUrlInput, setFilmUrlInput] = useState('');
  const [filmScrapeLoading, setFilmScrapeLoading] = useState(false);
  const [filmScrapeResult, setFilmScrapeResult] = useState<{
    entry: FilmEntry;
    wasNewlyAdded: boolean;
    message: string;
  } | null>(null);
  const [filmScrapeError, setFilmScrapeError] = useState<string | null>(null);

  const [scrapeInput, setScrapeInput] = useState('');
  const [preferBrowserFetch, setPreferBrowserFetch] = useState(false);
  const [fullPagination, setFullPagination] = useState(true);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScraperProgressUpdate | null>(null);
  const scrapeAbortRef = useRef<AbortController | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const [csvUsername, setCsvUsername] = useState('');
  const [csvDisplayName, setCsvDisplayName] = useState('');
  const [csvTargetMode, setCsvTargetMode] = useState<'merge' | 'new'>('merge');
  const [uploadedFiles, setUploadedFiles] = useState<{ filename: string; content: string }[]>([]);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  const [rawPasteUsername, setRawPasteUsername] = useState('');
  const [rawPasteContent, setRawPasteContent] = useState('');
  const [rawPasteLoading, setRawPasteLoading] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  const normalizeFilmUrlForScraper = (raw: string): string => {
    const trimmed = raw.trim();
    if (/\/film\/[^/]+/i.test(trimmed)) {
      return trimmed;
    }
    const cleanSlug = trimmed
      .replace(/^https?:\/\/(www\.)?letterboxd\.com\//i, '')
      .replace(/^letterboxd\.com\//i, '')
      .replace(/^\/+|\/+$/g, '')
      .split('/')[0];
    return `https://letterboxd.com/film/${cleanSlug}/`;
  };

  const executeDirectFilmScrape = async (rawUrlOrSlug: string) => {
    const clean = rawUrlOrSlug.trim();
    if (!clean) return;

    setFilmScrapeLoading(true);
    setFilmScrapeError(null);
    setFilmScrapeResult(null);

    try {
      const normalizedFilmUrl = normalizeFilmUrlForScraper(clean);
      const result = await runLetterboxdScraper(normalizedFilmUrl, {
        preferBrowserFetch,
      });

      const scrapedFilm = result.films[0];
      if (!scrapedFilm) {
        throw new Error('Could not parse a film record from that Letterboxd URL.');
      }

      const canonicalId = makeFilmId(scrapedFilm.title, scrapedFilm.year);
      const alreadyExistedInArchive = Boolean(
        archive?.films[canonicalId] ||
          Object.values(archive?.films || {}).some(
            (f) =>
              f.title.toLowerCase() === scrapedFilm.title.toLowerCase() &&
              f.year === scrapedFilm.year
          )
      );

      if (archive && onRestoreUnifiedWorkspace) {
        const { nextArchive } = applyScrapeResultToWorkspace(result, archive);
        onRestoreUnifiedWorkspace({ archive: nextArchive });
      }

      const activeProf = profiles.find((p) => p.id === activeProfileId);
      if (activeProf) {
        const existingMap = new Map(
          activeProf.films.map((f) => [`${f.title.toLowerCase()}::${f.year}`, f])
        );
        existingMap.set(
          `${scrapedFilm.title.toLowerCase()}::${scrapedFilm.year}`,
          scrapedFilm
        );
        onAddOrUpdateProfile(
          {
            ...activeProf,
            lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
            films: cloneFilmsArray(Array.from(existingMap.values())),
          },
          false
        );
      }

      setFilmScrapeResult({
        entry: scrapedFilm,
        wasNewlyAdded: !alreadyExistedInArchive,
        message: !alreadyExistedInArchive
          ? `Auto-added "${scrapedFilm.title}" (${scrapedFilm.year}) to your archive and active profile.`
          : `"${scrapedFilm.title}" (${scrapedFilm.year}) was already in your archive — synced latest poster & credits.`,
      });
    } catch (err) {
      setFilmScrapeError(
        err instanceof Error ? err.message : 'Failed to scrape Letterboxd film URL.'
      );
    } finally {
      setFilmScrapeLoading(false);
    }
  };

  const handleDirectFilmScrapeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filmUrlInput.trim()) return;
    await executeDirectFilmScrape(filmUrlInput.trim());
    setFilmUrlInput('');
  };

  const executeUnifiedScrape = async (targetInput: string, rawHtmlOverride?: string) => {
    setScrapeLoading(true);
    setScrapeStatus(null);
    setScrapeProgress(null);

    const abortController = new AbortController();
    scrapeAbortRef.current = abortController;

    try {
      const result = await runLetterboxdScraper(targetInput, {
        preferBrowserFetch,
        rawHtmlOverride,
        fullPagination,
        expandAllListContents: true,
        onProgress: (progress) => setScrapeProgress(progress),
        abortSignal: abortController.signal,
      });

      if (archive && onRestoreUnifiedWorkspace) {
        const { nextArchive } = applyScrapeResultToWorkspace(result, archive);
        onRestoreUnifiedWorkspace({ archive: nextArchive });
      }

      if (result.profile) {
        const newProfile: ProfileAccount = {
          id: `profile-${result.profile.username}-${Date.now()}`,
          username: result.profile.username,
          displayName: result.profile.displayName || result.profile.username,
          sourceType: 'external_scrape',
          lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          profileUrl: result.profile.profileUrl,
          bio: result.profile.bio,
          films: cloneFilmsArray(result.films),
          baselineFilms: cloneFilmsArray(result.films),
        };
        onAddOrUpdateProfile(newProfile, true);
      } else if (result.films.length > 0) {
        const activeProf = profiles.find((p) => p.id === activeProfileId);
        if (activeProf) {
          const existingMap = new Map(
            activeProf.films.map((f) => [`${f.title.toLowerCase()}::${f.year}`, f])
          );
          result.films.forEach((f) => {
            existingMap.set(`${f.title.toLowerCase()}::${f.year}`, f);
          });
          const merged = Array.from(existingMap.values());
          onAddOrUpdateProfile(
            {
              ...activeProf,
              lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
              films: cloneFilmsArray(merged),
            },
            false
          );
        }
      }

      setScrapeStatus({
        type: result.liveReachable ? 'success' : 'info',
        message: result.notice,
      });
    } catch (err) {
      setScrapeStatus({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to scrape public Letterboxd film, list, or profile.',
      });
    } finally {
      setScrapeLoading(false);
      scrapeAbortRef.current = null;
    }
  };

  const handleExternalFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeInput.trim()) return;
    await executeUnifiedScrape(scrapeInput.trim());
    setScrapeInput('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const loaded: { filename: string; content: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      loaded.push({ filename: file.name, content: text });
    }
    setUploadedFiles((prev) => [...prev, ...loaded]);
  };

  const handleCsvImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadedFiles.length === 0) return;

    const parsedFilms = parseLetterboxdCsvFiles(uploadedFiles);
    const detectedStructure = extractImportedCsvStructure(uploadedFiles);

    // Also ingest into CineasteArchiveState so any lists/*.csv or reviews.csv populate Curated Lists & Archive
    const archiveSummary = onImportCsvToArchive
      ? onImportCsvToArchive(
          uploadedFiles.map((f) => ({ fileName: f.filename, content: f.content }))
        )
      : { listsImported: 0, reviewsImported: 0 };

    const extraSummary =
      archiveSummary.listsImported > 0 || archiveSummary.reviewsImported > 0
        ? ` · ${archiveSummary.listsImported} curated list(s) & ${archiveSummary.reviewsImported} review(s) synced`
        : '';

    if (csvTargetMode === 'merge') {
      const target = profiles.find((p) => p.id === activeProfileId);
      if (target) {
        const existingMap = new Map(
          target.films.map((f) => [`${f.title.toLowerCase()}::${f.year}`, f])
        );
        parsedFilms.forEach((f) => {
          existingMap.set(`${f.title.toLowerCase()}::${f.year}`, f);
        });
        const combined = Array.from(existingMap.values());
        onAddOrUpdateProfile(
          {
            ...target,
            lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
            films: cloneFilmsArray(combined),
            baselineFilms: cloneFilmsArray(combined),
            importedCsvStructure:
              detectedStructure.preset !== 'watchlist'
                ? detectedStructure
                : target.importedCsvStructure || detectedStructure,
          },
          true
        );
        setCsvStatus(
          `Merged ${parsedFilms.length} CSV entries into @${target.username} (${combined.length} total films${extraSummary}). Schema preserved: ${detectedStructure.headers.join(', ')}`
        );
        setUploadedFiles([]);
        return;
      }
    }

    const cleanUser =
      csvUsername
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_') || `csv_user_${profiles.length + 1}`;
    const display = csvDisplayName.trim() || cleanUser;

    const newProfile: ProfileAccount = {
      id: `profile-csv-${cleanUser}-${Date.now()}`,
      username: cleanUser,
      displayName: display,
      sourceType: 'csv_import',
      lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      profileUrl: `https://letterboxd.com/${cleanUser}/`,
      bio: `Imported from ${uploadedFiles.map((f) => f.filename).join(', ')} (${parsedFilms.length} films).`,
      films: cloneFilmsArray(parsedFilms),
      baselineFilms: cloneFilmsArray(parsedFilms),
      importedCsvStructure: detectedStructure,
    };

    onAddOrUpdateProfile(newProfile, true);
    setCsvStatus(
      `Imported ${parsedFilms.length} films into new profile @${cleanUser}${extraSummary} (Matched export headers: ${detectedStructure.headers.join(', ')}).`
    );
    setUploadedFiles([]);
    setCsvUsername('');
    setCsvDisplayName('');
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_LETTERBOXD_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportProfileCsv = (
    prof: ProfileAccount,
    mode: 'logged' | 'watchlist'
  ) => {
    const csv = exportFilmsToCsv(prof.films, {
      preset: mode === 'watchlist' ? 'watchlist' : 'match_imported',
      importedStructure: prof.importedCsvStructure,
    });
    const filename =
      mode === 'watchlist'
        ? 'watchlist.csv'
        : getLetterboxdExportFilename('match_imported', prof.importedCsvStructure, false);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRawPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPasteContent.trim()) return;

    setRawPasteLoading(true);
    try {
      await executeUnifiedScrape(
        rawPasteUsername.trim() || 'https://letterboxd.com/',
        rawPasteContent
      );
      setRawPasteContent('');
    } finally {
      setRawPasteLoading(false);
    }
  };

  const handleExportUnifiedBackupJson = () => {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      archive,
      profiles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pmdb-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNotice('Exported complete PMDB workspace JSON backup (Catalog, Rankings, Oscar Ballots, Lists & Profiles).');
  };

  const handleRestoreBackupJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onRestoreUnifiedWorkspace) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.archive || parsed.profiles) {
        onRestoreUnifiedWorkspace({
          archive: parsed.archive,
          profiles: parsed.profiles,
        });
        setBackupNotice('Restored PMDB unified workspace backup successfully.');
      } else if (parsed.films && parsed.oscarBallots) {
        onRestoreUnifiedWorkspace({ archive: parsed });
        setBackupNotice('Restored PMDB archive backup successfully.');
      }
    } catch {
      setBackupNotice('Invalid JSON backup file.');
    }
  };

  const archiveFilmsList = archive ? Object.values(archive.films) : [];
  const enrichedPosterCount = archiveFilmsList.filter((f) => Boolean(f.metadata?.posterUrl)).length;
  const unenrichedCount = Math.max(0, archiveFilmsList.length - enrichedPosterCount);

  return (
    <div className="space-y-6">
      {/* Loaded Profiles Registry */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
          Loaded Letterboxd Profiles in Workspace
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Switch active profiles for the Poster Catalog, Spreadsheet, Rankings, &amp; Ballots, or manage accounts available for side-by-side comparison.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const rated = p.films.filter((f) => f.rating !== null);
            const avg =
              rated.length > 0
                ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
                : 0;

            return (
              <div
                key={p.id}
                className={`p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-950 border-amber-500/60'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-display font-semibold text-sm text-slate-100 truncate">
                      {p.displayName}
                    </span>
                    <a
                      href={p.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-amber-400 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      @{p.username}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums mb-2">
                    {p.films.length.toLocaleString()} films · Mean {avg.toFixed(2)} ★ ·{' '}
                    {p.sourceType === 'csv_import' ? 'CSV Export' : 'External Profile'}
                  </div>
                  {p.bio && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.bio}</p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectActiveProfile(p.id)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        isActive
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isActive ? 'Active Profile' : 'Make Active'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExportProfileCsv(p, 'logged')}
                        title="Export logged films in exact Letterboxd CSV format (diary.csv)"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-amber-300 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        {p.importedCsvStructure?.filename || 'diary.csv'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportProfileCsv(p, 'watchlist')}
                        title="Export watchlist films in exact Letterboxd watchlist.csv format"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        watchlist.csv
                      </button>
                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProfile(p.id)}
                          title="Remove profile from workspace"
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mode Toggle Header: URL Scraping vs. CSV Import */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
              Data Ingestion Mode
            </p>
            <h3 className="text-base font-display font-semibold text-slate-100">
              Toggle Between Direct Letterboxd URL Scraping &amp; CSV File Import
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Populate your archive directly by scraping Letterboxd film URLs, curated lists, or profiles — or switch to batch CSV import.
            </p>
          </div>

          {/* Segmented Mode Toggle */}
          <div
            role="tablist"
            aria-label="Data Ingestion Mode"
            className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={ingestionMode === 'url_scraping'}
              onClick={() => setIngestionMode('url_scraping')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                ingestionMode === 'url_scraping'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>URL Scraping</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ingestionMode === 'csv_import'}
              onClick={() => setIngestionMode('csv_import')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                ingestionMode === 'csv_import'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV Import</span>
            </button>
          </div>
        </div>

        {/* MODE 1: URL SCRAPING (Direct Film URL Auto-Add + Lists & Profiles Scraper) */}
        {ingestionMode === 'url_scraping' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Card: Direct Letterboxd Film URL Scraper (Auto-Add to Archive) */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-display font-semibold text-slate-100">
                      1A. Scrape Letterboxd Film URL (Auto-Add to Archive)
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
                    Auto-Adds Missing Films
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Paste any public Letterboxd film URL (e.g.{' '}
                  <code className="font-mono text-slate-300">
                    https://letterboxd.com/film/parasite-2019/
                  </code>{' '}
                  or a user review URL{' '}
                  <code className="font-mono text-slate-300">
                    letterboxd.com/&lt;user&gt;/film/&lt;slug&gt;/
                  </code>
                  ). Triggers the scraper utility directly for that film and automatically adds it to your archive with enriched poster &amp; credits if it doesn&apos;t exist.
                </p>

                <form onSubmit={handleDirectFilmScrapeSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Letterboxd Film Page URL or Film Slug
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        required
                        value={filmUrlInput}
                        onChange={(e) => setFilmUrlInput(e.target.value)}
                        placeholder="https://letterboxd.com/film/parasite-2019/ or /dave/film/wildwood-2026/"
                        className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={filmScrapeLoading}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {filmScrapeLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Scraping Film...</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Scrape Film &amp; Auto-Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quick-Test Film URLs */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400">Try Film URL:</span>
                    {[
                      {
                        label: 'Wildwood (2026)',
                        url: 'https://letterboxd.com/dave/film/wildwood-2026/',
                      },
                      {
                        label: 'All of a Sudden (2026)',
                        url: 'https://letterboxd.com/dave/film/all-of-a-sudden-2026/',
                      },
                      {
                        label: 'Parasite (2019)',
                        url: 'https://letterboxd.com/film/parasite-2019/',
                      },
                      {
                        label: 'Anatomy of a Fall (2023)',
                        url: 'https://letterboxd.com/film/anatomy-of-a-fall/',
                      },
                    ].map((sample) => (
                      <button
                        key={sample.url}
                        type="button"
                        disabled={filmScrapeLoading}
                        onClick={() => {
                          setFilmUrlInput(sample.url);
                          executeDirectFilmScrape(sample.url);
                        }}
                        className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </form>

                {filmScrapeError && (
                  <div className="mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                    {filmScrapeError}
                  </div>
                )}

                {filmScrapeResult && (
                  <div className="mt-4 p-3.5 rounded-lg bg-slate-900 border border-emerald-500/40 flex items-start gap-3.5">
                    {filmScrapeResult.entry.posterUrl ? (
                      <img
                        src={filmScrapeResult.entry.posterUrl}
                        alt={filmScrapeResult.entry.title}
                        className="w-14 h-20 object-cover rounded border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-20 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-mono text-slate-400 shrink-0">
                        {filmScrapeResult.entry.year}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded ${
                            filmScrapeResult.wasNewlyAdded
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {filmScrapeResult.wasNewlyAdded
                            ? 'Newly Added to Archive'
                            : 'Synced in Archive'}
                        </span>
                        <span className="text-xs font-mono text-amber-400">
                          {filmScrapeResult.entry.rating ?? 4.5} ★
                        </span>
                      </div>
                      <h5 className="text-sm font-display font-semibold text-slate-100 truncate">
                        {filmScrapeResult.entry.title} ({filmScrapeResult.entry.year})
                      </h5>
                      <p className="text-xs text-slate-400">
                        Directed by {filmScrapeResult.entry.director} ·{' '}
                        {filmScrapeResult.entry.country} ·{' '}
                        {filmScrapeResult.entry.runtimeMinutes}m
                      </p>
                      <p className="text-[11px] text-emerald-300 mt-1.5">
                        {filmScrapeResult.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Scraper Transport Mode:</span>
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() => setPreferBrowserFetch(false)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      !preferBrowserFetch
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Server Proxy + RSS Engine
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferBrowserFetch(true)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      preferBrowserFetch
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Browser-Based Fetch
                  </button>
                </div>
              </div>
            </div>

            {/* Right Card: Public Letterboxd Lists, Profiles & Browser Source Parser */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-display font-semibold text-slate-100">
                      1B. Scrape Public Letterboxd Lists &amp; User Profiles
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={scrapeLoading}
                      onClick={() =>
                        executeUnifiedScrape(
                          'https://letterboxd.com/dave/list/oscars-2027-priority-watchlist/'
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 cursor-pointer"
                    >
                      <ListChecks className="w-3 h-3 text-amber-400" />
                      Live List
                    </button>
                    <button
                      type="button"
                      disabled={scrapeLoading}
                      onClick={() => executeUnifiedScrape('https://letterboxd.com/dave/')}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 cursor-pointer"
                    >
                      <UserCheck className="w-3 h-3 text-amber-400" />
                      @dave Profile
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Paste any public Letterboxd curated list URL (
                  <code className="font-mono text-amber-300">
                    letterboxd.com/&lt;user&gt;/list/&lt;slug&gt;/
                  </code>
                  ) or public username (<code className="font-mono text-slate-300">@username</code>) to crawl all paginated{' '}
                  <code className="font-mono text-slate-300">/films/page/1..N/</code> (72/page) and{' '}
                  <code className="font-mono text-slate-300">/lists/page/1..M/</code> (12/page) into your catalog and Curated Lists.
                </p>

                {/* Full Paginated Crawl Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 mb-3 bg-slate-900/90 border border-slate-800 rounded-md text-xs">
                  <div>
                    <span className="font-medium text-slate-200">
                      Full Multi-Page Pagination Crawler
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Crawls all /films/page/1..N/ &amp; /lists/page/1..M/ (bypasses 50-list &amp; ~494-film RSS cap)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFullPagination((prev) => !prev)}
                    className={`px-3 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      fullPagination
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {fullPagination ? 'Full Paginated Crawl: ON' : 'RSS Fast-Sync Only'}
                  </button>
                </div>

                <form onSubmit={handleExternalFetch} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={scrapeInput}
                      onChange={(e) => setScrapeInput(e.target.value)}
                      placeholder="e.g. https://letterboxd.com/dave/list/top-250/ or @username"
                      className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={scrapeLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {scrapeLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Crawling Pages...
                        </>
                      ) : (
                        'Scrape All Pages'
                      )}
                    </button>
                  </div>
                  {scrapeInput.trim() && (
                    <p className="text-[11px] font-mono text-slate-400">
                      Target:{' '}
                      <span className="text-amber-400 uppercase">
                        {detectLetterboxdUrlType(scrapeInput.trim()).type}
                      </span>{' '}
                      → {detectLetterboxdUrlType(scrapeInput.trim()).normalizedUrl}
                    </p>
                  )}
                </form>

                {/* Live Multi-Page Crawler Progress Telemetry */}
                {scrapeProgress && (scrapeLoading || scrapeProgress.phase === 'complete') && (
                  <div className="mt-4 p-3.5 rounded-lg bg-slate-900 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-amber-300 flex items-center gap-1.5">
                        {scrapeLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        {scrapeProgress.message}
                      </span>
                      {scrapeLoading && scrapeAbortRef.current && (
                        <button
                          type="button"
                          onClick={() => scrapeAbortRef.current?.abort()}
                          className="px-2.5 py-1 text-[11px] font-mono bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded cursor-pointer shrink-0"
                        >
                          Stop &amp; Save Progress
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                      <div className="p-2 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-400 block">Watched Films Crawled</span>
                        <span className="text-slate-100 font-semibold">
                          {scrapeProgress.filmsScraped.toLocaleString()}
                          {scrapeProgress.expectedTotalFilms
                            ? ` / ${scrapeProgress.expectedTotalFilms.toLocaleString()}`
                            : ''}
                        </span>
                        <span className="text-slate-500 ml-1.5">
                          (Page {scrapeProgress.currentFilmPage}/{scrapeProgress.totalFilmPages})
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-400 block">Curated Lists Crawled</span>
                        <span className="text-amber-300 font-semibold">
                          {scrapeProgress.listsScraped.toLocaleString()}
                          {scrapeProgress.expectedTotalLists
                            ? ` / ${scrapeProgress.expectedTotalLists.toLocaleString()}`
                            : ''}
                        </span>
                        <span className="text-slate-500 ml-1.5">
                          (Page {scrapeProgress.currentListPage}/{scrapeProgress.totalListPages})
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {scrapeStatus && (
                  <div
                    className={`mt-4 p-3 rounded-md border text-xs ${
                      scrapeStatus.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : scrapeStatus.type === 'info'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {scrapeStatus.message}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <Code2 className="w-4 h-4 text-sky-400" />
                  <h4 className="text-xs font-display font-semibold text-slate-200">
                    Direct Browser Page Source / DOM Parser (Lists, Film Pages &amp; Diary)
                  </h4>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Copy the page source (<code className="font-mono text-slate-300">Cmd/Ctrl+U</code>) from{' '}
                  <code className="font-mono text-slate-300">
                    letterboxd.com/&lt;user&gt;/list/&lt;slug&gt;/
                  </code>
                  , <code className="font-mono text-slate-300">/film/&lt;slug&gt;/</code>, or{' '}
                  <code className="font-mono text-slate-300">/films/diary/</code> and paste it here.
                </p>
                <form onSubmit={handleRawPasteSubmit} className="space-y-2.5">
                  <input
                    type="text"
                    value={rawPasteUsername}
                    onChange={(e) => setRawPasteUsername(e.target.value)}
                    placeholder="Optional Source URL or List Name (e.g. https://letterboxd.com/dave/list/top-100/)"
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-100"
                  />
                  <textarea
                    rows={3}
                    value={rawPasteContent}
                    onChange={(e) => setRawPasteContent(e.target.value)}
                    placeholder="Paste raw HTML (<li class='poster-container'>, <script type='application/ld+json'>, <tr class='diary-entry-row'>) or RSS XML here"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={rawPasteLoading || !rawPasteContent.trim()}
                    className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-100 rounded-md hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Parse &amp; Populate from Browser Source
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* MODE 2: CSV IMPORT (Letterboxd CSV Export & List Files Importer) */
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-display font-semibold text-slate-100">
                  Import Letterboxd CSV Export &amp; List Files
                </h4>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Sample CSV
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Upload <code className="font-mono text-slate-300">diary.csv</code>,{' '}
              <code className="font-mono text-slate-300">ratings.csv</code>,{' '}
              <code className="font-mono text-slate-300">watched.csv</code>,{' '}
              <code className="font-mono text-slate-300">reviews.csv</code>,{' '}
              <code className="font-mono text-sky-300">watchlist.csv</code>, or{' '}
              <code className="font-mono text-amber-300">lists/*.csv</code> exported from Letterboxd. Simultaneously populates your Poster Catalog, FrameSheet Spreadsheet, Reviews Anthology, and Curated Lists.
            </p>

            <form onSubmit={handleCsvImportSubmit} className="space-y-3">
              <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setCsvTargetMode('merge')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    csvTargetMode === 'merge'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Merge into Active Profile
                </button>
                <button
                  type="button"
                  onClick={() => setCsvTargetMode('new')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    csvTargetMode === 'new'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create New Profile
                </button>
              </div>

              {csvTargetMode === 'new' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Account Handle
                    </label>
                    <input
                      type="text"
                      value={csvUsername}
                      onChange={(e) => setCsvUsername(e.target.value)}
                      placeholder="e.g. alex_film"
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={csvDisplayName}
                      onChange={(e) => setCsvDisplayName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-100"
                    />
                  </div>
                </div>
              )}

              <label className="flex flex-col items-center justify-center border border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-900/60 rounded-lg p-6 cursor-pointer transition-colors text-center">
                <Upload className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-medium text-slate-200">
                  Click to select Letterboxd CSV files (or Lists CSVs)
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Supports diary.csv, ratings.csv, watched.csv, reviews.csv, watchlist.csv, lists/*.csv
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              {uploadedFiles.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Staged CSV Files ({uploadedFiles.length}):
                  </div>
                  {uploadedFiles.map((f, i) => (
                    <div
                      key={`${f.filename}-${i}`}
                      className="flex items-center justify-between text-xs font-mono text-slate-300"
                    >
                      <span>{f.filename}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-slate-500 hover:text-rose-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={uploadedFiles.length === 0}
                className="w-full py-2 text-xs font-medium bg-emerald-500 text-slate-950 rounded-md hover:bg-emerald-400 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Import &amp; Sync CSV Data Across Workspace
              </button>
            </form>

            {csvStatus && (
              <div className="mt-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{csvStatus}</span>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500">
              Supported Letterboxd CSV columns:{' '}
              <span className="font-mono text-slate-400">
                Date · Name · Year · Letterboxd URI · Rating · Rewatch · Review · Tags · Watched Date · Position
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Deduplicated Public Metadata Enrichment & Full Workspace JSON Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw
                className={`w-4 h-4 text-amber-400 ${isBatchEnriching ? 'animate-spin' : ''}`}
              />
              <h3 className="text-sm font-display font-semibold text-slate-100">
                3. Deduplicated Public Poster &amp; Credits Engine (IMDb · Wikipedia · iTunes)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Fetches theatrical posters and above/below-the-line credits (Director, Screenplay, Cast, Cinematographer, Composer, Editor) using a unified server cache so no film is ever scraped twice across profiles.
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-md flex items-center justify-between text-xs font-mono tabular-nums text-slate-300 mb-4">
              <span>
                Enriched Posters &amp; Credits: <strong className="text-emerald-400">{enrichedPosterCount}</strong> / {archiveFilmsList.length} catalog films
              </span>
              <span className="text-amber-300">
                {unenrichedCount} remaining
              </span>
            </div>
          </div>

          {onTriggerBatchEnrich && (
            <button
              type="button"
              onClick={onTriggerBatchEnrich}
              disabled={isBatchEnriching || unenrichedCount === 0}
              className="w-full py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBatchEnriching ? 'animate-spin' : ''}`} />
              <span>
                {isBatchEnriching
                  ? `Batch Enriching (${enrichProgress.done}/${enrichProgress.total})...`
                  : unenrichedCount === 0
                  ? 'All Catalog Films Enriched with Posters ✓'
                  : `Batch Enrich Next ${Math.min(30, unenrichedCount)} Films in Single Request`}
              </span>
            </button>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-display font-semibold text-slate-100">
                4. Full Unified Workspace JSON Backup &amp; Restore
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Save or restore your entire combined workspace — including all loaded Letterboxd profiles, Source-of-Truth baselines, Annual Ranked Lists (1927–2026), Personal Oscar Ballots, and Curated Lists — in a single JSON file.
            </p>
            {backupNotice && (
              <div className="p-2.5 mb-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {backupNotice}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportUnifiedBackupJson}
              className="flex-1 py-2 px-3 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export Full Workspace (.json)</span>
            </button>

            <label className="flex-1 py-2 px-3 text-xs font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Restore Backup (.json)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreBackupJson}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

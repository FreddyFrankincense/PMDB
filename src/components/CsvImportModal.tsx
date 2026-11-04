import React, { useRef, useState } from 'react';
import {
  X,
  Upload,
  Download,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  Trash2,
  Globe,
  Code2,
  Loader2,
  Film,
  ListChecks,
  UserCheck,
} from 'lucide-react';
import { CineasteArchiveState } from '../types/cinema';
import { ProfileAccount } from '../types/letterboxd';
import { cloneFilmsArray } from '../utils/baselineDiff';
import {
  CsvImportSummary,
  ingestLetterboxdCsvFiles,
} from '../utils/letterboxdCsvParser';
import {
  applyScrapeResultToWorkspace,
  detectLetterboxdUrlType,
  runLetterboxdScraper,
  ScraperProgressUpdate,
  ScrapeUtilityResult,
} from '../utils/letterboxdScraper';

interface CsvImportModalProps {
  archive: CineasteArchiveState;
  enrichmentProgress: { active: boolean; done: number; total: number };
  onClose: () => void;
  onUpdateArchive: (nextArchive: CineasteArchiveState) => void;
  onAddOrUpdateProfile?: (profile: ProfileAccount, setAsActive: boolean) => void;
  onTriggerBatchEnrich: (onlyMissingPosters: boolean) => void;
  onResetToSeedArchive: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  archive,
  enrichmentProgress,
  onClose,
  onUpdateArchive,
  onAddOrUpdateProfile,
  onTriggerBatchEnrich,
  onResetToSeedArchive,
}) => {
  // Universal Letterboxd Scraper state
  const [scrapeInput, setScrapeInput] = useState('');
  const [preferBrowserFetch, setPreferBrowserFetch] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScraperProgressUpdate | null>(null);
  const scrapeAbortRef = useRef<AbortController | null>(null);
  const [lastScrapeResult, setLastScrapeResult] = useState<ScrapeUtilityResult | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [showRawHtmlPaste, setShowRawHtmlPaste] = useState(false);
  const [rawPasteUrlHint, setRawPasteUrlHint] = useState('');
  const [rawPasteContent, setRawPasteContent] = useState('');
  const [rawPasteLoading, setRawPasteLoading] = useState(false);

  // CSV Import state
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<string | null>(null);

  const executeScrapeAndPopulate = async (
    targetInput: string,
    rawHtmlOverride?: string
  ) => {
    setScrapeLoading(true);
    setScrapeStatus(null);
    setScrapeProgress(null);

    const abortController = new AbortController();
    scrapeAbortRef.current = abortController;

    try {
      const result = await runLetterboxdScraper(targetInput, {
        preferBrowserFetch,
        rawHtmlOverride,
        fullPagination: true,
        expandAllListContents: true,
        onProgress: (p) => setScrapeProgress(p),
        abortSignal: abortController.signal,
      });

      const { nextArchive, filmsAddedOrUpdated, listsAddedOrUpdated } =
        applyScrapeResultToWorkspace(result, archive);
      onUpdateArchive(nextArchive);

      if (result.profile && onAddOrUpdateProfile) {
        const newProfile: ProfileAccount = {
          id: `profile-${result.profile.username}-${Date.now()}`,
          username: result.profile.username,
          displayName: result.profile.displayName || `@${result.profile.username}`,
          sourceType: 'external_scrape',
          lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          profileUrl: result.profile.profileUrl,
          bio: result.profile.bio,
          films: cloneFilmsArray(result.films),
          baselineFilms: cloneFilmsArray(result.films),
        };
        onAddOrUpdateProfile(newProfile, true);
      }

      setLastScrapeResult(result);
      setScrapeStatus({
        type: result.liveReachable ? 'success' : 'info',
        message:
          result.notice ||
          `Populated ${filmsAddedOrUpdated.toLocaleString()} film(s)${
            listsAddedOrUpdated > 0 ? ` and ${listsAddedOrUpdated.toLocaleString()} curated list(s)` : ''
          } into your workspace.`,
      });
    } catch (err) {
      setScrapeStatus({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to scrape Letterboxd page or list.',
      });
    } finally {
      setScrapeLoading(false);
      scrapeAbortRef.current = null;
    }
  };

  const handlePublicProfileScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeInput.trim()) return;
    await executeScrapeAndPopulate(scrapeInput.trim());
    setScrapeInput('');
  };

  const handleRawHtmlPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPasteContent.trim()) return;

    setRawPasteLoading(true);
    try {
      await executeScrapeAndPopulate(
        rawPasteUrlHint.trim() || 'https://letterboxd.com/',
        rawPasteContent
      );
      setRawPasteContent('');
    } finally {
      setRawPasteLoading(false);
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const loadedFiles: { fileName: string; content: string }[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const text = await f.text();
      loadedFiles.push({ fileName: f.name, content: text });
    }

    const baseState: CineasteArchiveState =
      importMode === 'replace'
        ? {
            films: {},
            yearlyRankings: {},
            oscarBallots: {},
            lists: [],
          }
        : archive;

    const { nextState, summary: importSummary } = ingestLetterboxdCsvFiles(
      loadedFiles,
      baseState
    );
    onUpdateArchive(nextState);
    setSummary(importSummary);
    e.target.value = '';
  };

  const handleExportFullJson = () => {
    const blob = new Blob([JSON.stringify(archive, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pmdb-archive-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFullJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonError(null);
    setJsonSuccess(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as CineasteArchiveState;
      if (!parsed || typeof parsed.films !== 'object') {
        throw new Error('Invalid PMDB JSON backup structure');
      }
      onUpdateArchive({
        films: parsed.films || {},
        yearlyRankings: parsed.yearlyRankings || {},
        oscarBallots: parsed.oscarBallots || {},
        lists: Array.isArray(parsed.lists) ? parsed.lists : [],
        lastImportedAt: new Date().toISOString(),
      });
      setJsonSuccess(
        `Restored ${Object.keys(parsed.films).length} films, ${
          Object.keys(parsed.yearlyRankings || {}).length
        } annual rankings, and ${Object.keys(parsed.oscarBallots || {}).length} Oscar ballots.`
      );
    } catch (err: any) {
      setJsonError(err?.message || 'Failed to parse JSON backup file.');
    }
    e.target.value = '';
  };

  const handleDownloadSampleCsv = () => {
    const sampleContent = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2026-01-10,Singin' in the Rain,1952,https://boxd.it/29c4,5.0,Yes,"Stanley Donen and Gene Kelly's Technicolor jubilee of Hollywood's transition from silent film to sound.",musical,2026-01-10
2026-01-15,The Apartment,1960,https://boxd.it/29b6,5.0,No,"Billy Wilder and I.A.L. Diamond balance biting corporate satire with deeply earned romance.",wilder,2026-01-15
2026-01-18,In the Mood for Love,2000,https://boxd.it/298W,5.0,Yes,"Christopher Doyle's emerald and crimson framing turns every corridor glance into an ache.",wong-kar-wai,2026-01-18
2026-01-22,Parasite,2019,https://boxd.it/hTha,5.0,Yes,"Bong Joon-ho's architectural staircase metaphor executed with clockwork precision.",palme-dor,2026-01-22
2026-01-25,Portrait of a Lady on Fire,2019,https://boxd.it/jkPq,5.0,No,"Céline Sciamma and Claire Mathon paint each frame with living brushstroke intimacy.",french,2026-01-25`;

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'letterboxd-reviews-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFilms = Object.keys(archive.films).length;
  const missingPostersCount = Object.values(archive.films).filter(
    (f) => !f.metadata?.posterUrl
  ).length;
  const detectedPreview = scrapeInput.trim()
    ? detectLetterboxdUrlType(scrapeInput.trim())
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DED9CE] dark:border-[#262830]">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
              Data Ingestion & Portability
            </p>
            <h2 className="text-2xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
              Letterboxd Scraper Utility (Films, Lists & Profiles) & CSV Import
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Section 1: Universal Letterboxd Scraper Utility (Film Pages, Curated Lists & Profiles) */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>1. Universal Letterboxd Scraper Utility (Film Pages, Lists & Profiles)</span>
                </h3>
                <p className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-0.5">
                  Directly populate films, ratings, posters, and curated lists without a CSV file. Paste any public{' '}
                  <span className="font-mono-tabular">letterboxd.com/film/&lt;slug&gt;/</span> page,{' '}
                  <span className="font-mono-tabular">/&lt;user&gt;/list/&lt;slug&gt;/</span> curated list, or{' '}
                  <span className="font-mono-tabular">@username</span> profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRawHtmlPaste((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>
                  {showRawHtmlPaste
                    ? 'Hide Raw HTML / DOM Source Parser'
                    : 'Paste Raw HTML / List / Diary Source'}
                </span>
              </button>
            </div>

            {/* Fetch Transport Mode Selector + Quick-Test Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 p-1 bg-[#EBE6DF] dark:bg-[#18191E]">
                <button
                  type="button"
                  onClick={() => setPreferBrowserFetch(false)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    !preferBrowserFetch
                      ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                      : 'text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  Server-Side Proxy + RSS Engine
                </button>
                <button
                  type="button"
                  onClick={() => setPreferBrowserFetch(true)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    preferBrowserFetch
                      ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                      : 'text-[#6E6A63] dark:text-[#9A9891]'
                  }`}
                >
                  Browser-Based CORS Fetch
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#6E6A63] dark:text-[#9A9891]">Quick Test:</span>
                <button
                  type="button"
                  disabled={scrapeLoading}
                  onClick={() =>
                    executeScrapeAndPopulate('https://letterboxd.com/dave/film/wildwood-2026/')
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#18191E] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                >
                  <Film className="w-3 h-3 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>Film Page</span>
                </button>
                <button
                  type="button"
                  disabled={scrapeLoading}
                  onClick={() =>
                    executeScrapeAndPopulate(
                      'https://letterboxd.com/dave/list/official-top-250-narrative-feature-films/'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#18191E] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                >
                  <ListChecks className="w-3 h-3 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>Curated List</span>
                </button>
                <button
                  type="button"
                  disabled={scrapeLoading}
                  onClick={() => executeScrapeAndPopulate('https://letterboxd.com/dave/')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#18191E] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer"
                >
                  <UserCheck className="w-3 h-3 text-[#9A7B1C] dark:text-[#D4AF37]" />
                  <span>@dave Profile</span>
                </button>
              </div>
            </div>

            <form onSubmit={handlePublicProfileScrape} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  required
                  value={scrapeInput}
                  onChange={(e) => setScrapeInput(e.target.value)}
                  placeholder="Paste Letterboxd Film URL (/film/parasite-2019/), List URL (/user/list/slug/), or @username..."
                  className="flex-1 min-w-[240px] px-3.5 py-2 text-xs bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] placeholder:text-[#6E6A63] dark:placeholder:text-[#9A9891] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
                />
                <button
                  type="submit"
                  disabled={scrapeLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                >
                  {scrapeLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Scraping Letterboxd...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Scrape & Populate</span>
                    </>
                  )}
                </button>
              </div>
              {detectedPreview && (
                <p className="text-[11px] font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                  Detected Target:{' '}
                  <strong className="text-[#9A7B1C] dark:text-[#D4AF37] uppercase">
                    {detectedPreview.type === 'film'
                      ? 'Letterboxd Film Page'
                      : detectedPreview.type === 'list'
                      ? 'Letterboxd Curated List'
                      : 'Public Letterboxd Profile'}
                  </strong>{' '}
                  → {detectedPreview.normalizedUrl}
                </p>
              )}
            </form>

            {showRawHtmlPaste && (
              <form
                onSubmit={handleRawHtmlPasteSubmit}
                className="p-4 bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] space-y-3"
              >
                <div className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                  <strong className="text-[#181615] dark:text-[#F4F1EA]">
                    Direct DOM / HTML Source Parser (Lists, Film Pages, Diary & Watchlist):
                  </strong>{' '}
                  Paste the HTML source (<span className="font-mono-tabular">Cmd/Ctrl+U</span>) from any public{' '}
                  <span className="font-mono-tabular">letterboxd.com/&lt;user&gt;/list/&lt;slug&gt;/</span>,{' '}
                  <span className="font-mono-tabular">/film/&lt;slug&gt;/</span>,{' '}
                  <span className="font-mono-tabular">/films/diary/</span>, or{' '}
                  <span className="font-mono-tabular">/watchlist/</span> page to parse JSON-LD movie metadata, poster grids, ratings, and numbered lists.
                </div>
                <input
                  type="text"
                  value={rawPasteUrlHint}
                  onChange={(e) => setRawPasteUrlHint(e.target.value)}
                  placeholder="Optional source URL or list label (e.g. https://letterboxd.com/dave/list/top-100/)"
                  className="w-full px-3 py-1.5 text-xs bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
                <textarea
                  rows={4}
                  value={rawPasteContent}
                  onChange={(e) => setRawPasteContent(e.target.value)}
                  placeholder="Paste raw HTML source or RSS XML from any Letterboxd film page, list, or profile..."
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] focus:outline-none focus:border-[#9A7B1C] dark:focus:border-[#D4AF37]"
                />
                <button
                  type="submit"
                  disabled={rawPasteLoading || !rawPasteContent.trim()}
                  className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-[#181615] dark:bg-[#F4F1EA] text-[#FBF9F5] dark:text-[#121316] hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{rawPasteLoading ? 'Parsing HTML Source...' : 'Parse & Populate from HTML / RSS'}</span>
                </button>
              </form>
            )}

            {scrapeProgress && (scrapeLoading || scrapeProgress.phase === 'complete') && (
              <div className="p-3.5 bg-[#F2EFE9] dark:bg-[#18191E] border border-[#9A7B1C]/40 dark:border-[#D4AF37]/40 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#9A7B1C] dark:text-[#D4AF37] flex items-center gap-1.5">
                    {scrapeLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {scrapeProgress.message}
                  </span>
                  {scrapeLoading && scrapeAbortRef.current && (
                    <button
                      type="button"
                      onClick={() => scrapeAbortRef.current?.abort()}
                      className="px-2.5 py-1 text-[11px] font-mono-tabular bg-[#DC2626]/20 text-[#DC2626] dark:text-[#F87171] border border-[#DC2626]/40 cursor-pointer shrink-0"
                    >
                      Stop &amp; Save Progress
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono-tabular">
                  <div className="p-2 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
                    <span className="text-[#6E6A63] dark:text-[#9A9891] block">
                      Watched Films Crawled
                    </span>
                    <span className="font-semibold text-[#181615] dark:text-[#F4F1EA]">
                      {scrapeProgress.filmsScraped.toLocaleString()}
                      {scrapeProgress.expectedTotalFilms
                        ? ` / ${scrapeProgress.expectedTotalFilms.toLocaleString()}`
                        : ''}
                    </span>{' '}
                    <span className="opacity-70">
                      (Page {scrapeProgress.currentFilmPage}/{scrapeProgress.totalFilmPages})
                    </span>
                  </div>
                  <div className="p-2 bg-[#FBF9F5] dark:bg-[#121316] border border-[#DED9CE] dark:border-[#262830]">
                    <span className="text-[#6E6A63] dark:text-[#9A9891] block">
                      Curated Lists Crawled
                    </span>
                    <span className="font-semibold text-[#9A7B1C] dark:text-[#D4AF37]">
                      {scrapeProgress.listsScraped.toLocaleString()}
                      {scrapeProgress.expectedTotalLists
                        ? ` / ${scrapeProgress.expectedTotalLists.toLocaleString()}`
                        : ''}
                    </span>{' '}
                    <span className="opacity-70">
                      (Page {scrapeProgress.currentListPage}/{scrapeProgress.totalListPages})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {scrapeStatus && (
              <div
                className={`p-3.5 border text-xs space-y-2 ${
                  scrapeStatus.type === 'success'
                    ? 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#15803D] dark:text-[#4ADE80]'
                    : scrapeStatus.type === 'info'
                    ? 'bg-[#9A7B1C]/10 border-[#9A7B1C]/30 text-[#9A7B1C] dark:text-[#D4AF37]'
                    : 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626] dark:text-[#F87171]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{scrapeStatus.message}</p>
                    {lastScrapeResult && (
                      <p className="text-[11px] font-mono-tabular opacity-85 mt-1">
                        Target: {lastScrapeResult.targetType.toUpperCase()} · Strategy:{' '}
                        {lastScrapeResult.strategyUsed} · {lastScrapeResult.films.length.toLocaleString()} film(s)
                        {lastScrapeResult.lists && lastScrapeResult.lists.length > 0
                          ? ` · ${lastScrapeResult.lists.length.toLocaleString()} list(s) synced`
                          : lastScrapeResult.list
                          ? ` · Added List "${lastScrapeResult.list.name}"`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Letterboxd CSV Upload */}
          <div className="pt-6 border-t border-[#DED9CE] dark:border-[#262830] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  2. Import Letterboxd CSV Export Files
                </h3>
                <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                  Select one or multiple files from your full Letterboxd data export:{' '}
                  <span className="font-mono-tabular">
                    ratings.csv, reviews.csv, diary.csv, watched.csv, watchlist.csv
                  </span>{' '}
                  or any files from your <span className="font-mono-tabular">lists/</span> folder.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="text-xs text-[#9A7B1C] dark:text-[#D4AF37] hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Download Sample Letterboxd CSV
              </button>
            </div>

            {/* Merge vs Replace Mode */}
            <div className="flex items-center gap-2 p-1 bg-[#EBE6DF] dark:bg-[#18191E] w-fit">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  importMode === 'merge'
                    ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                    : 'text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                Merge with Current Library ({totalFilms} films)
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  importMode === 'replace'
                    ? 'bg-[#FBF9F5] dark:bg-[#262830] text-[#181615] dark:text-[#F4F1EA] shadow-sm'
                    : 'text-[#6E6A63] dark:text-[#9A9891]'
                }`}
              >
                Replace Current Library
              </button>
            </div>

            <label className="flex flex-col items-center justify-center p-8 border border-dashed border-[#9A7B1C]/60 dark:border-[#D4AF37]/50 bg-[#F2EFE9]/60 dark:bg-[#18191E]/60 hover:bg-[#F2EFE9] dark:hover:bg-[#18191E] transition-colors cursor-pointer">
              <FileSpreadsheet className="w-8 h-8 text-[#9A7B1C] dark:text-[#D4AF37] mb-2" />
              <span className="text-sm font-medium text-[#181615] dark:text-[#F4F1EA]">
                Click to select Letterboxd CSV files (supports multi-file selection)
              </span>
              <span className="text-xs text-[#6E6A63] dark:text-[#9A9891] mt-1">
                Automatically deduplicates films by title & release year and merges ratings, reviews & lists
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={handleCsvFileSelect}
                className="hidden"
              />
            </label>

            {summary && (
              <div className="p-4 bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-[#181615] dark:text-[#F4F1EA]">
                    Processed {summary.filesProcessed} CSV file(s) — {summary.filmsAddedOrUpdated}{' '}
                    film entries merged
                  </p>
                  <p className="text-[#6E6A63] dark:text-[#9A9891]">
                    Imported {summary.reviewsImported} reviews and {summary.listsImported} curated
                    lists across {summary.yearsTouched.length} cinema years.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Public Database Metadata & Poster Enrichment */}
          <div className="pt-6 border-t border-[#DED9CE] dark:border-[#262830] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  3. Public Poster & Credits Enrichment (IMDb / Wikipedia / iTunes)
                </h3>
                <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                  Automatically fetches theatrical posters, directors, cast, writers, cinematographers, and composers for imported films.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={enrichmentProgress.active}
                  onClick={() => onTriggerBatchEnrich(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${enrichmentProgress.active ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {enrichmentProgress.active
                      ? `Enriching (${enrichmentProgress.done}/${enrichmentProgress.total})...`
                      : `Enrich Missing Posters (${missingPostersCount})`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={enrichmentProgress.active}
                  onClick={() => onTriggerBatchEnrich(false)}
                  className="px-3 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Re-Sync All ({totalFilms})
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Full JSON Backup Export & Restore */}
          <div className="pt-6 border-t border-[#DED9CE] dark:border-[#262830] space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                4. Full JSON Archive Backup (Rankings + Oscar Ballots + Library)
              </h3>
              <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                Your data is automatically saved in local browser storage. Export a portable JSON snapshot at any time or restore from a backup file.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportFullJson}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span>Export Full Archive (.json)</span>
              </button>

              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-[#DED9CE] dark:border-[#262830] bg-[#F2EFE9] dark:bg-[#18191E] text-[#181615] dark:text-[#F4F1EA] hover:border-[#9A7B1C] dark:hover:border-[#D4AF37] cursor-pointer whitespace-nowrap shrink-0">
                <Upload className="w-3.5 h-3.5 text-[#9A7B1C] dark:text-[#D4AF37]" />
                <span>Restore Archive from JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFullJson}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={onResetToSeedArchive}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-[#6E6A63] dark:text-[#9A9891] hover:text-[#DC2626] dark:hover:text-[#F87171] ml-auto cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset to Demo Archive</span>
              </button>
            </div>

            {jsonSuccess && (
              <p className="text-xs text-[#16A34A] flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>{jsonSuccess}</span>
              </p>
            )}
            {jsonError && <p className="text-xs text-[#DC2626]">{jsonError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};


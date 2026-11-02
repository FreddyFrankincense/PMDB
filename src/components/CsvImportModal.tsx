import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  Trash2,
} from 'lucide-react';
import { CineasteArchiveState } from '../types/cinema';
import {
  CsvImportSummary,
  ingestLetterboxdCsvFiles,
} from '../utils/letterboxdCsvParser';

interface CsvImportModalProps {
  archive: CineasteArchiveState;
  enrichmentProgress: { active: boolean; done: number; total: number };
  onClose: () => void;
  onUpdateArchive: (nextArchive: CineasteArchiveState) => void;
  onTriggerBatchEnrich: (onlyMissingPosters: boolean) => void;
  onResetToSeedArchive: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  archive,
  enrichmentProgress,
  onClose,
  onUpdateArchive,
  onTriggerBatchEnrich,
  onResetToSeedArchive,
}) => {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<string | null>(null);

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
    a.download = `cineaste-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        throw new Error('Invalid Cineaste Ledger JSON structure');
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
              Letterboxd CSV Import & JSON Archive Backup
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
          {/* Section 1: Letterboxd CSV Upload */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  1. Import Letterboxd CSV Files
                </h3>
                <p className="text-xs text-[#6E6A63] dark:text-[#9A9891]">
                  Select one or multiple files from your Letterboxd data export:{' '}
                  <span className="font-mono-tabular">
                    ratings.csv, reviews.csv, diary.csv, watched.csv
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

          {/* Section 2: Public Database Metadata & Poster Enrichment */}
          <div className="pt-6 border-t border-[#DED9CE] dark:border-[#262830] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                  2. Public Poster & Credits Enrichment (IMDb / Wikipedia / iTunes)
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

          {/* Section 3: Full JSON Backup Export & Restore */}
          <div className="pt-6 border-t border-[#DED9CE] dark:border-[#262830] space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#181615] dark:text-[#F4F1EA]">
                3. Full JSON Archive Backup (Rankings + Oscar Ballots + Library)
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

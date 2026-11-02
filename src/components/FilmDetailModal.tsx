import React, { useState } from 'react';
import { X, RefreshCw, ExternalLink, Award, ListOrdered, Check } from 'lucide-react';
import { FilmRecord, LetterboxdList } from '../types/cinema';
import { PosterVisual } from './PosterVisual';
import { StarRatingInteractive, formatStarString } from './StarRatingDisplay';

interface FilmDetailModalProps {
  film: FilmRecord;
  lists: LetterboxdList[];
  oscarStats: { nominations: string[]; wins: string[] };
  yearRank?: number;
  onClose: () => void;
  onSaveFilm: (updated: FilmRecord) => void;
  onEnrichSingleFilm: (filmId: string) => Promise<void>;
  onNavigateToYearBallot: (year: number) => void;
  onNavigateToYearRanking: (year: number) => void;
}

export const FilmDetailModal: React.FC<FilmDetailModalProps> = ({
  film,
  lists,
  oscarStats,
  yearRank,
  onClose,
  onSaveFilm,
  onEnrichSingleFilm,
  onNavigateToYearBallot,
  onNavigateToYearRanking,
}) => {
  const [rating, setRating] = useState<number | null>(film.rating ?? null);
  const [review, setReview] = useState(film.review || '');
  const [watchedDate, setWatchedDate] = useState(film.watchedDate || '');
  const [director, setDirector] = useState(film.metadata?.director || '');
  const [castStr, setCastStr] = useState((film.metadata?.cast || []).join(', '));
  const [writersStr, setWritersStr] = useState((film.metadata?.writers || []).join(', '));
  const [cinematographer, setCinematographer] = useState(film.metadata?.cinematographer || '');
  const [composer, setComposer] = useState(film.metadata?.composer || '');
  const [editor, setEditor] = useState(film.metadata?.editor || '');
  const [productionDesigner, setProductionDesigner] = useState(
    film.metadata?.productionDesigner || ''
  );
  const [costumeDesigner, setCostumeDesigner] = useState(film.metadata?.costumeDesigner || '');
  const [country, setCountry] = useState(film.metadata?.country || '');
  const [posterUrl, setPosterUrl] = useState(film.metadata?.posterUrl || '');
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
    setDirector(film.metadata?.director || '');
    setCastStr((film.metadata?.cast || []).join(', '));
    setWritersStr((film.metadata?.writers || []).join(', '));
    setCinematographer(film.metadata?.cinematographer || '');
    setComposer(film.metadata?.composer || '');
    setEditor(film.metadata?.editor || '');
    setProductionDesigner(film.metadata?.productionDesigner || '');
    setCostumeDesigner(film.metadata?.costumeDesigner || '');
    setCountry(film.metadata?.country || '');
    setPosterUrl(film.metadata?.posterUrl || '');
  }, [film.metadata]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: FilmRecord = {
      ...film,
      rating,
      review: review.trim() || undefined,
      watchedDate: watchedDate || undefined,
      metadata: {
        ...film.metadata,
        director: director.trim() || undefined,
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
    onSaveFilm(updated);
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
              Accession Record · Release Year {film.year}
            </p>
            <h2 className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
              {film.title}
            </h2>
          </div>
          <div className="flex items-center gap-3">
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
          {/* Left Column: Poster + Quick Standing */}
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
                  {formatStarString(rating)}
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
                    Academy Ledger Citations:
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

              {memberLists.length > 0 && (
                <div className="pt-2 border-t border-[#DED9CE] dark:border-[#262830] text-[11px] text-[#6E6A63] dark:text-[#9A9891]">
                  <p className="uppercase tracking-wider font-medium text-[#181615] dark:text-[#F4F1EA] mb-1">
                    Featured in Lists:
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

          {/* Right Column: Review & Full Credits Editor */}
          <div className="md:col-span-8 space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891] mb-2">
                Your Letterboxd Star Rating
              </label>
              <StarRatingInteractive value={rating} onChange={setRating} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs uppercase tracking-wider text-[#6E6A63] dark:text-[#9A9891]">
                  Personal Review & Critical Notes
                </label>
                <input
                  type="date"
                  value={watchedDate}
                  onChange={(e) => setWatchedDate(e.target.value)}
                  className="px-2 py-1 text-xs font-mono-tabular bg-[#F2EFE9] dark:bg-[#18191E] border border-[#DED9CE] dark:border-[#262830] text-[#181615] dark:text-[#F4F1EA]"
                />
              </div>
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
                Above & Below-the-Line Credits (Auto-Populates Oscar Ballot)
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
                    <span>Saved to Archive</span>
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

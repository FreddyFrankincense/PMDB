import React, { useState } from 'react';
import { Plus, Trash2, BookOpen, Layers } from 'lucide-react';
import { FilmRecord, LetterboxdList } from '../types/cinema';
import { PosterVisual } from './PosterVisual';
import { formatStarString } from './StarRatingDisplay';

interface ListsAndReviewsViewProps {
  films: Record<string, FilmRecord>;
  lists: LetterboxdList[];
  onUpdateLists: (nextLists: LetterboxdList[]) => void;
  onSelectFilmForModal: (film: FilmRecord) => void;
}

export const ListsAndReviewsView: React.FC<ListsAndReviewsViewProps> = ({
  films,
  lists,
  onUpdateLists,
  onSelectFilmForModal,
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

  const activeList = lists.find((l) => l.id === selectedListId) || lists[0];

  const reviewedFilms = React.useMemo(() => {
    return (Object.values(films) as FilmRecord[])
      .filter((f) => Boolean(f.review && f.review.trim().length > 0))
      .sort((a, b) => (b.watchedDate || '').localeCompare(a.watchedDate || ''));
  }, [films]);

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

  return (
    <div className="space-y-8">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DED9CE] dark:border-[#262830] pb-4">
        <div>
          <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
            Curatorial Monographs & Collections
          </p>
          <h2 className="text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
            Letterboxd Lists & Critical Reviews
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
                Your Imported & Curated Lists
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
                      <span className="text-xs font-mono-tabular text-[#9A7B1C] dark:text-[#D4AF37]">
                        {list.entries.length} films
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
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA]">
                      {activeList.name}
                    </h3>
                    <span className="text-xs font-mono-tabular text-[#6E6A63] dark:text-[#9A9891]">
                      {activeList.entries.length} Curated Entries · Created{' '}
                      {activeList.createdDate || 'Archive'}
                    </span>
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
                              <span>No. {String(entry.position || idx + 1).padStart(2, '0')}</span>
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
        /* Editorial Reviews Anthology View (Pattern D Asymmetric Reading Canvas) */
        <div className="divide-y divide-[#DED9CE] dark:divide-[#262830] border border-[#DED9CE] dark:border-[#262830] bg-[#FBF9F5] dark:bg-[#121316]">
          {reviewedFilms.map((film) => (
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
                    {formatStarString(film.rating)}
                  </p>
                  {film.watchedDate && <p>Screened {film.watchedDate}</p>}
                  {film.metadata?.cinematographer && (
                    <p className="font-sans">DP: {film.metadata.cinematographer}</p>
                  )}
                </div>
              </div>

              {/* Right 9 cols: 65ch Reading Column with Drop Cap */}
              <div className="md:col-span-9 space-y-3 max-w-2xl">
                <div className="text-xs font-mono-tabular uppercase tracking-widest text-[#6E6A63] dark:text-[#9A9891]">
                  <span>Release Year {film.year}</span>
                  {film.metadata?.director && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span>Directed by {film.metadata.director}</span>
                    </>
                  )}
                </div>

                <h3
                  onClick={() => onSelectFilmForModal(film)}
                  className="text-2xl sm:text-3xl font-editorial font-semibold text-[#181615] dark:text-[#F4F1EA] hover:text-[#9A7B1C] dark:hover:text-[#D4AF37] cursor-pointer"
                >
                  {film.title}
                </h3>

                <p className="text-base leading-relaxed text-[#181615] dark:text-[#E6E2D8] first-letter:text-4xl first-letter:font-editorial first-letter:font-bold first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-[#9A7B1C] dark:first-letter:text-[#D4AF37]">
                  {film.review}
                </p>

                {film.tags && film.tags.length > 0 && (
                  <p className="pt-2 text-xs text-[#6E6A63] dark:text-[#9A9891]">
                    Index Tags: {film.tags.join(' · ')}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

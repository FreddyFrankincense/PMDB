import { slugifyTitle } from '../data/filmCatalog';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';

export type RecommendationPathway =
  | 'all'
  | 'director_affinity'
  | 'writer_frequency'
  | 'subgenre_popular'
  | 'decade_sweet_spot';

export interface SupportingFilmCitation {
  title: string;
  year: number;
  rating: number | null;
  rewatch: boolean;
}

export interface RecommendationReason {
  type: Exclude<RecommendationPathway, 'all'>;
  headline: string;
  detail: string;
  weightScore: number;
  supportingFilms: SupportingFilmCitation[];
}

export interface RecommendedFilmItem {
  slug: string;
  title: string;
  year: number;
  director: string;
  writers: string[];
  genres: string[];
  subgenres: string[];
  runtimeMinutes: number;
  country: string;
  letterboxdUri: string;
  communityAvgRating: number;
  matchScore: number;
  predictedRating: number;
  isOnWatchlist: boolean;
  acclaimNote: string;
  reasons: RecommendationReason[];
}

export interface AffinityFacetItem {
  name: string;
  count: number;
  avgRating: number;
  deltaVsMean: number;
}

export interface ProfileTasteFingerprint {
  loggedCount: number;
  baselineMean: number;
  topDirectors: AffinityFacetItem[];
  topWriters: AffinityFacetItem[];
  topSubgenres: AffinityFacetItem[];
  topDecades: AffinityFacetItem[];
}

interface CandidateFilmSpec {
  title: string;
  year: number;
  director: string;
  writers: string[];
  genres: string[];
  subgenres: string[];
  runtimeMinutes: number;
  country: string;
  communityAvgRating: number;
  acclaimNote: string;
}

const RECOMMENDATION_CANDIDATE_POOL: CandidateFilmSpec[] = [
  {
    title: 'High and Low',
    year: 1963,
    director: 'Akira Kurosawa',
    writers: ['Akira Kurosawa', 'Hideo Oguni', 'Ryuzo Kikushima', 'Eijiro Hisaita'],
    genres: ['Crime', 'Drama', 'Mystery'],
    subgenres: ['Procedural Thriller', 'Social Realism', 'Neo-Noir'],
    runtimeMinutes: 143,
    country: 'Japan',
    communityAvgRating: 4.6,
    acclaimNote: 'Letterboxd Top 10 All-Time Narrative Feature · Toho Scope Masterwork',
  },
  {
    title: 'Ikiru',
    year: 1952,
    director: 'Akira Kurosawa',
    writers: ['Akira Kurosawa', 'Shinobu Hashimoto', 'Hideo Oguni'],
    genres: ['Drama'],
    subgenres: ['Humanist Drama', 'Existential Study'],
    runtimeMinutes: 143,
    country: 'Japan',
    communityAvgRating: 4.5,
    acclaimNote: 'Criterion Essential · Golden Bear Special Prize',
  },
  {
    title: 'Mother',
    year: 2009,
    director: 'Bong Joon-ho',
    writers: ['Bong Joon-ho', 'Park Eun-kyo'],
    genres: ['Crime', 'Drama', 'Mystery'],
    subgenres: ['Procedural Thriller', 'Psychological Mystery'],
    runtimeMinutes: 129,
    country: 'South Korea',
    communityAvgRating: 4.2,
    acclaimNote: 'Cannes Un Certain Regard Selection · Asian Film Award Best Picture',
  },
  {
    title: 'Sympathy for Mr. Vengeance',
    year: 2002,
    director: 'Park Chan-wook',
    writers: ['Park Chan-wook', 'Lee Jae-soon', 'Lee Mu-yeong'],
    genres: ['Crime', 'Thriller', 'Drama'],
    subgenres: ['Neo-Noir', 'Revenge Thriller'],
    runtimeMinutes: 129,
    country: 'South Korea',
    communityAvgRating: 4.0,
    acclaimNote: 'Inaugural Installment of Park Chan-wook’s Vengeance Trilogy',
  },
  {
    title: 'Joint Security Area',
    year: 2000,
    director: 'Park Chan-wook',
    writers: ['Park Chan-wook', 'Kim Hyun-seok', 'Jeong Seong-san'],
    genres: ['Mystery', 'Thriller', 'Drama'],
    subgenres: ['Forensic Mystery', 'Political Thriller'],
    runtimeMinutes: 110,
    country: 'South Korea',
    communityAvgRating: 4.2,
    acclaimNote: 'Blue Dragon Best Film & Best Director Winner',
  },
  {
    title: 'Paths of Glory',
    year: 1957,
    director: 'Stanley Kubrick',
    writers: ['Stanley Kubrick', 'Calder Willingham', 'Jim Thompson'],
    genres: ['Drama', 'History'],
    subgenres: ['Anti-War Chamber Drama', 'Courtroom Procedural'],
    runtimeMinutes: 88,
    country: 'USA',
    communityAvgRating: 4.4,
    acclaimNote: 'National Film Registry · Criterion Collection Restoration',
  },
  {
    title: 'The Killing',
    year: 1956,
    director: 'Stanley Kubrick',
    writers: ['Stanley Kubrick', 'Jim Thompson'],
    genres: ['Crime', 'Thriller'],
    subgenres: ['Heist Noir', 'Non-Linear Crime'],
    runtimeMinutes: 85,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'BAFTA Best Film Nominee · Classic Non-Linear Heist Blueprint',
  },
  {
    title: 'Incendies',
    year: 2010,
    director: 'Denis Villeneuve',
    writers: ['Denis Villeneuve', 'Wajdi Mouawad'],
    genres: ['Drama', 'Mystery', 'History'],
    subgenres: ['Forensic Mystery', 'Historical Tragedy'],
    runtimeMinutes: 131,
    country: 'Canada',
    communityAvgRating: 4.4,
    acclaimNote: 'Academy Award Nominee for Best International Feature Film',
  },
  {
    title: 'Prisoners',
    year: 2013,
    director: 'Denis Villeneuve',
    writers: ['Aaron Guzikowski'],
    genres: ['Crime', 'Thriller', 'Mystery'],
    subgenres: ['Procedural Thriller', 'Neo-Noir'],
    runtimeMinutes: 153,
    country: 'USA',
    communityAvgRating: 4.2,
    acclaimNote: 'Academy Award Nominee for Best Cinematography (Roger Deakins)',
  },
  {
    title: 'Sicario',
    year: 2015,
    director: 'Denis Villeneuve',
    writers: ['Taylor Sheridan'],
    genres: ['Action', 'Crime', 'Thriller'],
    subgenres: ['Procedural Thriller', 'Border Noir'],
    runtimeMinutes: 121,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Cannes Palme d’Or Competition · 3 Academy Award Nominations',
  },
  {
    title: 'Punch-Drunk Love',
    year: 2002,
    director: 'Paul Thomas Anderson',
    writers: ['Paul Thomas Anderson'],
    genres: ['Comedy', 'Romance', 'Drama'],
    subgenres: ['Auteur Romance', 'Character Study'],
    runtimeMinutes: 95,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Cannes Film Festival Best Director Winner (Paul Thomas Anderson)',
  },
  {
    title: 'Boogie Nights',
    year: 1997,
    director: 'Paul Thomas Anderson',
    writers: ['Paul Thomas Anderson'],
    genres: ['Drama', 'Comedy'],
    subgenres: ['Ensemble Mosaic', 'Period Character Study'],
    runtimeMinutes: 155,
    country: 'USA',
    communityAvgRating: 4.3,
    acclaimNote: '3 Academy Award Nominations incl. Best Original Screenplay',
  },
  {
    title: 'Magnolia',
    year: 1999,
    director: 'Paul Thomas Anderson',
    writers: ['Paul Thomas Anderson'],
    genres: ['Drama'],
    subgenres: ['Ensemble Mosaic', 'Operatic Melodrama'],
    runtimeMinutes: 188,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Berlin Golden Bear Winner · 3 Academy Award Nominations',
  },
  {
    title: 'Happy Together',
    year: 1997,
    director: 'Wong Kar-wai',
    writers: ['Wong Kar-wai'],
    genres: ['Drama', 'Romance'],
    subgenres: ['Auteur Romance', 'Poetic Melancholy'],
    runtimeMinutes: 96,
    country: 'Hong Kong',
    communityAvgRating: 4.3,
    acclaimNote: 'Cannes Film Festival Best Director Winner (Wong Kar-wai)',
  },
  {
    title: 'Fallen Angels',
    year: 1995,
    director: 'Wong Kar-wai',
    writers: ['Wong Kar-wai'],
    genres: ['Crime', 'Romance', 'Comedy'],
    subgenres: ['Neon Nocturne', 'Auteur Romance'],
    runtimeMinutes: 99,
    country: 'Hong Kong',
    communityAvgRating: 4.3,
    acclaimNote: 'Criterion Wong Kar-wai Box Set Essential · Christopher Doyle Cinematography',
  },
  {
    title: '2046',
    year: 2004,
    director: 'Wong Kar-wai',
    writers: ['Wong Kar-wai'],
    genres: ['Drama', 'Romance', 'Sci-Fi'],
    subgenres: ['Auteur Romance', 'Memory Chamber Piece'],
    runtimeMinutes: 129,
    country: 'Hong Kong',
    communityAvgRating: 4.0,
    acclaimNote: 'Spiritual Sequel to In the Mood for Love · European Film Award Winner',
  },
  {
    title: 'Lost Highway',
    year: 1997,
    director: 'David Lynch',
    writers: ['David Lynch', 'Barry Gifford'],
    genres: ['Mystery', 'Thriller', 'Horror'],
    subgenres: ['Surrealist Noir', 'Psychological Mystery'],
    runtimeMinutes: 134,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: '4K Criterion Restoration · Psychogenic Fugue Noir',
  },
  {
    title: 'Twin Peaks: Fire Walk with Me',
    year: 1992,
    director: 'David Lynch',
    writers: ['David Lynch', 'Robert Engels'],
    genres: ['Horror', 'Mystery', 'Drama'],
    subgenres: ['Surrealist Noir', 'Psychological Horror'],
    runtimeMinutes: 135,
    country: 'USA',
    communityAvgRating: 4.3,
    acclaimNote: 'Sight & Sound Critics Poll Top 100 Selection',
  },
  {
    title: 'The Prestige',
    year: 2006,
    director: 'Christopher Nolan',
    writers: ['Christopher Nolan', 'Jonathan Nolan'],
    genres: ['Mystery', 'Thriller', 'Sci-Fi'],
    subgenres: ['Obsessional Rivalry', 'Non-Linear Puzzle'],
    runtimeMinutes: 130,
    country: 'UK',
    communityAvgRating: 4.3,
    acclaimNote: '2 Academy Award Nominations (Cinematography & Art Direction)',
  },
  {
    title: 'Memento',
    year: 2000,
    director: 'Christopher Nolan',
    writers: ['Christopher Nolan', 'Jonathan Nolan'],
    genres: ['Mystery', 'Thriller'],
    subgenres: ['Non-Linear Puzzle', 'Neo-Noir'],
    runtimeMinutes: 113,
    country: 'USA',
    communityAvgRating: 4.2,
    acclaimNote: 'Academy Award Nominee for Best Original Screenplay & Best Film Editing',
  },
  {
    title: 'Se7en',
    year: 1995,
    director: 'David Fincher',
    writers: ['Andrew Kevin Walker'],
    genres: ['Crime', 'Mystery', 'Thriller'],
    subgenres: ['Procedural Thriller', 'Neo-Noir'],
    runtimeMinutes: 127,
    country: 'USA',
    communityAvgRating: 4.4,
    acclaimNote: 'Landmark 1990s Neo-Noir Procedural · Darius Khondji Silver-Retention 35mm',
  },
  {
    title: 'Gone Girl',
    year: 2014,
    director: 'David Fincher',
    writers: ['Gillian Flynn'],
    genres: ['Mystery', 'Thriller', 'Drama'],
    subgenres: ['Psychological Mystery', 'Domestic Noir'],
    runtimeMinutes: 149,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Academy Award & Golden Globe Nominee',
  },
  {
    title: 'Barton Fink',
    year: 1991,
    director: 'Joel & Ethan Coen',
    writers: ['Joel Coen', 'Ethan Coen'],
    genres: ['Comedy', 'Drama', 'Thriller'],
    subgenres: ['Surrealist Satire', 'Character Study'],
    runtimeMinutes: 116,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Cannes Palme d’Or, Best Director & Best Actor Triple Winner',
  },
  {
    title: 'Inside Llewyn Davis',
    year: 2013,
    director: 'Joel & Ethan Coen',
    writers: ['Joel Coen', 'Ethan Coen'],
    genres: ['Drama', 'Music'],
    subgenres: ['Character Study', 'Period Music Odyssey'],
    runtimeMinutes: 105,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Cannes Grand Prix Winner · Criterion Spine #794',
  },
  {
    title: 'A Brighter Summer Day',
    year: 1991,
    director: 'Edward Yang',
    writers: ['Edward Yang', 'Hung Hung', 'Lai Ming-tang', 'Alex Yang'],
    genres: ['Drama', 'Crime', 'Romance'],
    subgenres: ['Historical Tragedy', 'Social Realism'],
    runtimeMinutes: 237,
    country: 'Taiwan',
    communityAvgRating: 4.7,
    acclaimNote: 'World Cinema Project 4K Restoration · Sight & Sound Top 50',
  },
  {
    title: 'Andrei Rublev',
    year: 1966,
    director: 'Andrei Tarkovsky',
    writers: ['Andrei Tarkovsky', 'Andrei Konchalovsky'],
    genres: ['Drama', 'History'],
    subgenres: ['Existential Study', 'Historical Epic'],
    runtimeMinutes: 205,
    country: 'USSR',
    communityAvgRating: 4.5,
    acclaimNote: 'Cannes FIPRESCI Prize · Sight & Sound Critics & Directors Poll Canon',
  },
  {
    title: 'Solaris',
    year: 1972,
    director: 'Andrei Tarkovsky',
    writers: ['Andrei Tarkovsky', 'Fridrikh Gorenshtein'],
    genres: ['Sci-Fi', 'Drama', 'Mystery'],
    subgenres: ['Philosophical Sci-Fi', 'Memory Chamber Piece'],
    runtimeMinutes: 167,
    country: 'USSR',
    communityAvgRating: 4.3,
    acclaimNote: 'Cannes Grand Prix Spécial du Jury Winner',
  },
  {
    title: 'The Conversation',
    year: 1974,
    director: 'Francis Ford Coppola',
    writers: ['Francis Ford Coppola'],
    genres: ['Mystery', 'Thriller', 'Drama'],
    subgenres: ['Paranoid Thriller', 'Character Study'],
    runtimeMinutes: 113,
    country: 'USA',
    communityAvgRating: 4.3,
    acclaimNote: 'Cannes Palme d’Or Winner · 3 Academy Award Nominations',
  },
  {
    title: 'After Hours',
    year: 1985,
    director: 'Martin Scorsese',
    writers: ['Joseph Minion'],
    genres: ['Comedy', 'Thriller', 'Crime'],
    subgenres: ['Neon Nocturne', 'Surrealist Satire'],
    runtimeMinutes: 97,
    country: 'USA',
    communityAvgRating: 4.1,
    acclaimNote: 'Cannes Film Festival Best Director Winner (Martin Scorsese)',
  },
  {
    title: 'The King of Comedy',
    year: 1982,
    director: 'Martin Scorsese',
    writers: ['Paul D. Zimmerman'],
    genres: ['Drama', 'Comedy', 'Crime'],
    subgenres: ['Character Study', 'Dark Satire'],
    runtimeMinutes: 109,
    country: 'USA',
    communityAvgRating: 4.2,
    acclaimNote: 'BAFTA Winner for Best Original Screenplay',
  },
  {
    title: 'Tangerine',
    year: 2015,
    director: 'Sean Baker',
    writers: ['Sean Baker', 'Chris Bergoch'],
    genres: ['Comedy', 'Drama'],
    subgenres: ['Social Realism', 'Kinetic Street Odyssey'],
    runtimeMinutes: 88,
    country: 'USA',
    communityAvgRating: 3.9,
    acclaimNote: 'Sundance Breakout · Independent Spirit Award Winner',
  },
  {
    title: 'The Florida Project',
    year: 2017,
    director: 'Sean Baker',
    writers: ['Sean Baker', 'Chris Bergoch'],
    genres: ['Drama'],
    subgenres: ['Social Realism', 'Humanist Drama'],
    runtimeMinutes: 111,
    country: 'USA',
    communityAvgRating: 4.2,
    acclaimNote: 'Cannes Directors’ Fortnight · Academy Award Nominee (Willem Dafoe)',
  },
];

// Map known directors to their screenwriters so logged films enrich the writer frequency fingerprint
const DIRECTOR_WRITER_MAP: Record<string, string[]> = {
  'Bong Joon-ho': ['Bong Joon-ho', 'Han Jin-won'],
  'Park Chan-wook': ['Park Chan-wook', 'Jeong Seo-kyeong'],
  'Christopher Nolan': ['Christopher Nolan', 'Jonathan Nolan'],
  'Denis Villeneuve': ['Denis Villeneuve', 'Eric Roth', 'Jon Spaihts'],
  'Paul Thomas Anderson': ['Paul Thomas Anderson'],
  'Stanley Kubrick': ['Stanley Kubrick', 'Calder Willingham'],
  'Wong Kar-wai': ['Wong Kar-wai'],
  'David Lynch': ['David Lynch'],
  'David Fincher': ['Aaron Sorkin', 'James Vanderbilt', 'Andrew Kevin Walker'],
  'Joel & Ethan Coen': ['Joel Coen', 'Ethan Coen'],
  'Akira Kurosawa': ['Akira Kurosawa', 'Shinobu Hashimoto', 'Hideo Oguni'],
  'Andrei Tarkovsky': ['Andrei Tarkovsky'],
  'Martin Scorsese': ['Paul Schrader', 'Nicholas Pileggi'],
  'Sean Baker': ['Sean Baker', 'Chris Bergoch'],
  'Justine Triet': ['Justine Triet', 'Arthur Harari'],
  'Céline Sciamma': ['Céline Sciamma'],
};

const GENRE_SUBGENRE_MAP: Record<string, string[]> = {
  Crime: ['Procedural Thriller', 'Neo-Noir'],
  Mystery: ['Forensic Mystery', 'Psychological Mystery'],
  Thriller: ['Procedural Thriller', 'Paranoid Thriller'],
  'Sci-Fi': ['Philosophical Sci-Fi', 'Speculative Worldbuilding'],
  Drama: ['Character Study', 'Humanist Drama'],
  Romance: ['Auteur Romance', 'Poetic Melancholy'],
  Horror: ['Psychological Horror', 'Surrealist Noir'],
  History: ['Historical Tragedy', 'Period Character Study'],
  Comedy: ['Surrealist Satire', 'Dark Satire'],
};

export function computeProfileRecommendations(profile: ProfileAccount): {
  fingerprint: ProfileTasteFingerprint;
  recommendations: RecommendedFilmItem[];
  dismissedItems: RecommendedFilmItem[];
} {
  const loggedFilms = profile.films.filter((f) => !f.watchlist);
  const watchlistFilms = profile.films.filter((f) => f.watchlist);
  const ratedFilms = loggedFilms.filter((f) => f.rating !== null);

  const baselineMean =
    ratedFilms.length > 0
      ? ratedFilms.reduce((s, f) => s + (f.rating ?? 0), 0) / ratedFilms.length
      : 3.6;

  // Build lookup of already logged films
  const loggedKeys = new Set<string>();
  const loggedSlugs = new Set<string>();
  loggedFilms.forEach((f) => {
    loggedKeys.add(`${f.title.trim().toLowerCase()}::${f.year}`);
    if (f.slug) loggedSlugs.add(f.slug.toLowerCase());
  });

  const watchlistKeys = new Set<string>();
  const watchlistSlugs = new Set<string>();
  watchlistFilms.forEach((f) => {
    watchlistKeys.add(`${f.title.trim().toLowerCase()}::${f.year}`);
    if (f.slug) watchlistSlugs.add(f.slug.toLowerCase());
  });

  // 1. Director Affinity
  const directorMap = new Map<
    string,
    { count: number; ratingSum: number; ratedCount: number; films: FilmEntry[] }
  >();
  // 2. Writer Frequency
  const writerMap = new Map<
    string,
    { count: number; ratingSum: number; ratedCount: number; films: FilmEntry[] }
  >();
  // 3. Subgenre Affinity
  const subgenreMap = new Map<
    string,
    { count: number; ratingSum: number; ratedCount: number; films: FilmEntry[] }
  >();
  // 4. Decade Sweet Spot
  const decadeMap = new Map<
    string,
    { count: number; ratingSum: number; ratedCount: number; films: FilmEntry[] }
  >();

  loggedFilms.forEach((f) => {
    const r = f.rating;
    // Director
    if (f.director) {
      const dCur = directorMap.get(f.director) || {
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        films: [],
      };
      dCur.count += 1;
      if (r !== null) {
        dCur.ratingSum += r;
        dCur.ratedCount += 1;
      }
      dCur.films.push(f);
      directorMap.set(f.director, dCur);
    }

    // Writers inferred from director/catalog
    const writers = DIRECTOR_WRITER_MAP[f.director] || [f.director];
    writers.forEach((w) => {
      if (!w) return;
      const wCur = writerMap.get(w) || {
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        films: [],
      };
      wCur.count += 1;
      if (r !== null) {
        wCur.ratingSum += r;
        wCur.ratedCount += 1;
      }
      wCur.films.push(f);
      writerMap.set(w, wCur);
    });

    // Subgenres
    const subgenres = new Set<string>();
    f.genres.forEach((g) => {
      const mapped = GENRE_SUBGENRE_MAP[g] || [g];
      mapped.forEach((sg) => subgenres.add(sg));
    });
    subgenres.forEach((sg) => {
      const sgCur = subgenreMap.get(sg) || {
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        films: [],
      };
      sgCur.count += 1;
      if (r !== null) {
        sgCur.ratingSum += r;
        sgCur.ratedCount += 1;
      }
      sgCur.films.push(f);
      subgenreMap.set(sg, sgCur);
    });

    // Decade
    if (f.year) {
      const dec = `${Math.floor(f.year / 10) * 10}s`;
      const decCur = decadeMap.get(dec) || {
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
        films: [],
      };
      decCur.count += 1;
      if (r !== null) {
        decCur.ratingSum += r;
        decCur.ratedCount += 1;
      }
      decCur.films.push(f);
      decadeMap.set(dec, decCur);
    }
  });

  const toFacetArray = (
    map: Map<
      string,
      { count: number; ratingSum: number; ratedCount: number; films: FilmEntry[] }
    >,
    minCount = 2
  ): AffinityFacetItem[] =>
    Array.from(map.entries())
      .filter(([, v]) => v.count >= minCount)
      .map(([name, v]) => {
        const avg = v.ratedCount > 0 ? v.ratingSum / v.ratedCount : baselineMean;
        return {
          name,
          count: v.count,
          avgRating: avg,
          deltaVsMean: avg - baselineMean,
        };
      })
      .sort(
        (a, b) =>
          b.avgRating * Math.log10(b.count + 2) -
          a.avgRating * Math.log10(a.count + 2)
      );

  const fingerprint: ProfileTasteFingerprint = {
    loggedCount: loggedFilms.length,
    baselineMean,
    topDirectors: toFacetArray(directorMap, 1).slice(0, 8),
    topWriters: toFacetArray(writerMap, 1).slice(0, 8),
    topSubgenres: toFacetArray(subgenreMap, 2).slice(0, 8),
    topDecades: toFacetArray(decadeMap, 2).slice(0, 8),
  };

  const dismissedSet = new Set(
    (profile.dismissedRecommendations || []).map((s) => s.toLowerCase())
  );

  const pickTopCitations = (films: FilmEntry[]): SupportingFilmCitation[] =>
    [...films]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 3)
      .map((f) => ({
        title: f.title,
        year: f.year,
        rating: f.rating,
        rewatch: f.rewatch,
      }));

  const recommendations: RecommendedFilmItem[] = [];
  const dismissedItems: RecommendedFilmItem[] = [];

  for (const cand of RECOMMENDATION_CANDIDATE_POOL) {
    const slug = slugifyTitle(cand.title, cand.year);
    const key = `${cand.title.trim().toLowerCase()}::${cand.year}`;

    // Skip if already logged/watched
    if (loggedKeys.has(key) || loggedSlugs.has(slug.toLowerCase())) {
      continue;
    }

    const isOnWatchlist =
      watchlistKeys.has(key) || watchlistSlugs.has(slug.toLowerCase());

    const reasons: RecommendationReason[] = [];

    // 1. Director Affinity Signal
    const dirStats = directorMap.get(cand.director);
    if (dirStats && dirStats.count > 0) {
      const dirAvg =
        dirStats.ratedCount > 0
          ? dirStats.ratingSum / dirStats.ratedCount
          : baselineMean;
      const delta = dirAvg - baselineMean;
      reasons.push({
        type: 'director_affinity',
        headline: `High Director Affinity: ${cand.director} (${dirAvg.toFixed(2)}★ avg across ${dirStats.count} logged)`,
        detail: `You rate ${cand.director}'s films ${
          delta >= 0 ? `+${delta.toFixed(2)}★ above` : 'near'
        } your profile mean (${baselineMean.toFixed(2)}★).`,
        weightScore: Math.round(35 + Math.max(0, delta * 25) + Math.min(15, dirStats.count * 3)),
        supportingFilms: pickTopCitations(dirStats.films),
      });
    }

    // 2. Writer Frequency Signal
    const matchedWriter = cand.writers.find((w) => writerMap.has(w));
    if (matchedWriter) {
      const wStats = writerMap.get(matchedWriter)!;
      const wAvg =
        wStats.ratedCount > 0 ? wStats.ratingSum / wStats.ratedCount : baselineMean;
      reasons.push({
        type: 'writer_frequency',
        headline: `Screenwriter Continuity: Written by ${matchedWriter}`,
        detail: `You have logged ${wStats.count} screenplays by ${matchedWriter} with a ${wAvg.toFixed(
          2
        )}★ average rating.`,
        weightScore: Math.round(28 + Math.min(18, wStats.count * 3)),
        supportingFilms: pickTopCitations(wStats.films),
      });
    }

    // 3. Subgenre Popularity Signal
    const matchedSubgenre = cand.subgenres.find((sg) => subgenreMap.has(sg));
    if (matchedSubgenre) {
      const sgStats = subgenreMap.get(matchedSubgenre)!;
      const sgAvg =
        sgStats.ratedCount > 0
          ? sgStats.ratingSum / sgStats.ratedCount
          : baselineMean;
      reasons.push({
        type: 'subgenre_popular',
        headline: `Signature Sub-Genre Match: ${matchedSubgenre}`,
        detail: `Matches your frequent ${matchedSubgenre} cluster (${sgStats.count.toLocaleString()} logged entries · ${sgAvg.toFixed(
          2
        )}★ mean).`,
        weightScore: Math.round(24 + Math.max(0, (sgAvg - baselineMean) * 20)),
        supportingFilms: pickTopCitations(sgStats.films),
      });
    }

    // 4. Decade Sweet Spot Signal
    const candDecade = `${Math.floor(cand.year / 10) * 10}s`;
    const decStats = decadeMap.get(candDecade);
    if (decStats && decStats.count > 0) {
      const decAvg =
        decStats.ratedCount > 0
          ? decStats.ratingSum / decStats.ratedCount
          : baselineMean;
      reasons.push({
        type: 'decade_sweet_spot',
        headline: `${candDecade} Era Sweet Spot (${cand.year})`,
        detail: `Aligns with your ${candDecade} archive (${decStats.count.toLocaleString()} films logged at ${decAvg.toFixed(
          2
        )}★ avg).`,
        weightScore: Math.round(20 + Math.max(0, (decAvg - baselineMean) * 20)),
        supportingFilms: pickTopCitations(decStats.films),
      });
    }

    reasons.sort((a, b) => b.weightScore - a.weightScore);

    const rawScore =
      58 +
      reasons.reduce((acc, r, i) => acc + r.weightScore * (i === 0 ? 0.55 : 0.2), 0) +
      (cand.communityAvgRating - 4.0) * 12;
    const matchScore = Math.max(72, Math.min(99, Math.round(rawScore)));
    const predictedRating = Math.max(
      3.5,
      Math.min(
        5.0,
        Math.round(
          ((cand.communityAvgRating * 0.6 + baselineMean * 0.4 + 0.25) * 10)
        ) / 10
      )
    );

    const item: RecommendedFilmItem = {
      slug,
      title: cand.title,
      year: cand.year,
      director: cand.director,
      writers: cand.writers,
      genres: cand.genres,
      subgenres: cand.subgenres,
      runtimeMinutes: cand.runtimeMinutes,
      country: cand.country,
      letterboxdUri: `https://letterboxd.com/film/${slug}/`,
      communityAvgRating: cand.communityAvgRating,
      matchScore,
      predictedRating,
      isOnWatchlist,
      acclaimNote: cand.acclaimNote,
      reasons,
    };

    if (dismissedSet.has(slug.toLowerCase())) {
      dismissedItems.push(item);
    } else {
      recommendations.push(item);
    }
  }

  recommendations.sort((a, b) => b.matchScore - a.matchScore);
  dismissedItems.sort((a, b) => b.matchScore - a.matchScore);

  return {
    fingerprint,
    recommendations,
    dismissedItems,
  };
}

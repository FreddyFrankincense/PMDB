import {
  CreditFieldKey,
  FilmRecord,
  HistoricalCategorySpec,
} from '../types/cinema';

/**
 * Complete Historical Academy Awards Category Specifications (1927/28 Inaugural Year to Present)
 * Accurately reflects category introductions, era-specific categories, and naming shifts.
 */
export const HISTORICAL_OSCAR_CATEGORIES: HistoricalCategorySpec[] = [
  // ABOVE THE LINE
  {
    id: 'best-picture',
    name: 'Best Picture',
    historicalNames: [
      { startYear: 1927, endYear: 1929, title: 'Outstanding Picture' },
      { startYear: 1930, endYear: 1940, title: 'Outstanding Production' },
      { startYear: 1941, endYear: 1943, title: 'Outstanding Motion Picture' },
      { startYear: 1944, endYear: 1961, title: 'Best Motion Picture' },
    ],
    division: 'Above the Line',
    startYear: 1927,
    maxNominees: 10,
    creditField: 'film',
    recipientPrompt: 'Production Company / Producers',
    eraNote: 'Inaugural 1927/28 ceremony featured 3 nominees; expanded to 10 in 1931–1943 and 2009–present.',
  },
  {
    id: 'unique-artistic-picture',
    name: 'Unique and Artistic Picture',
    division: 'Special & Era-Specific',
    startYear: 1927,
    endYear: 1927,
    maxNominees: 3,
    creditField: 'director',
    recipientPrompt: 'Studio / Auteur Director',
    eraNote: 'Awarded exclusively at the 1st Academy Awards (1927/28) alongside Outstanding Picture (won by Sunrise: A Song of Two Humans).',
  },
  {
    id: 'best-director',
    name: 'Best Director',
    historicalNames: [
      { startYear: 1927, endYear: 1927, title: 'Best Directing (Dramatic Picture)' },
    ],
    division: 'Above the Line',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'director',
    recipientPrompt: 'Director Name',
    eraNote: 'Split into Dramatic and Comedy Directing only at the 1st Academy Awards (1927/28).',
  },
  {
    id: 'best-director-comedy',
    name: 'Best Directing (Comedy Picture)',
    division: 'Special & Era-Specific',
    startYear: 1927,
    endYear: 1927,
    maxNominees: 3,
    creditField: 'director',
    recipientPrompt: 'Comedy Director Name',
    eraNote: 'Inaugural 1927/28 category honoring silent comedy direction (won by Lewis Milestone for Two Arabian Knights).',
  },
  {
    id: 'best-actor',
    name: 'Best Actor in a Leading Role',
    historicalNames: [
      { startYear: 1927, endYear: 1975, title: 'Best Actor' },
    ],
    division: 'Above the Line',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'cast',
    recipientPrompt: 'Lead Actor Name',
  },
  {
    id: 'best-actress',
    name: 'Best Actress in a Leading Role',
    historicalNames: [
      { startYear: 1927, endYear: 1975, title: 'Best Actress' },
    ],
    division: 'Above the Line',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'cast',
    recipientPrompt: 'Lead Actress Name',
  },
  {
    id: 'best-supporting-actor',
    name: 'Best Actor in a Supporting Role',
    division: 'Above the Line',
    startYear: 1936,
    maxNominees: 5,
    creditField: 'cast',
    recipientPrompt: 'Supporting Actor Name',
    eraNote: 'Introduced at the 9th Academy Awards (1936); originally presented on plaques before receiving full-sized statuettes in 1943.',
  },
  {
    id: 'best-supporting-actress',
    name: 'Best Actress in a Supporting Role',
    division: 'Above the Line',
    startYear: 1936,
    maxNominees: 5,
    creditField: 'cast',
    recipientPrompt: 'Supporting Actress Name',
    eraNote: 'Introduced at the 9th Academy Awards (1936).',
  },

  // WRITING DIVISION
  {
    id: 'best-original-screenplay',
    name: 'Best Original Screenplay',
    historicalNames: [
      { startYear: 1940, endYear: 1947, title: 'Best Original Screenplay' },
      { startYear: 1948, endYear: 1956, title: 'Best Story and Screenplay' },
      { startYear: 1957, endYear: 1975, title: 'Best Story and Screenplay — Written Directly for the Screen' },
    ],
    division: 'Writing',
    startYear: 1940,
    maxNominees: 5,
    creditField: 'writers',
    recipientPrompt: 'Screenwriter(s)',
    eraNote: 'Created in 1940 as a separate screenplay honor distinct from Best Original Story.',
  },
  {
    id: 'best-adapted-screenplay',
    name: 'Best Adapted Screenplay',
    historicalNames: [
      { startYear: 1927, endYear: 1927, title: 'Best Writing (Adaptation)' },
      { startYear: 1928, endYear: 1930, title: 'Best Writing Achievement' },
      { startYear: 1931, endYear: 1934, title: 'Best Adaptation' },
      { startYear: 1935, endYear: 1955, title: 'Best Screenplay' },
      { startYear: 1956, endYear: 2001, title: 'Best Screenplay — Based on Material from Another Medium' },
    ],
    division: 'Writing',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'writers',
    recipientPrompt: 'Screenwriter(s)',
  },
  {
    id: 'best-original-story',
    name: 'Best Original Story',
    historicalNames: [
      { startYear: 1927, endYear: 1927, title: 'Best Writing (Original Story)' },
      { startYear: 1931, endYear: 1956, title: 'Best Motion Picture Story' },
    ],
    division: 'Writing',
    startYear: 1927,
    endYear: 1956,
    maxNominees: 5,
    creditField: 'writers',
    recipientPrompt: 'Story Author(s)',
    eraNote: 'Awarded from the 1st Ceremony (1927/28) until 1956, when it was fully merged into Best Original Screenplay.',
  },
  {
    id: 'best-title-writing',
    name: 'Best Writing (Title Writing)',
    division: 'Special & Era-Specific',
    startYear: 1927,
    endYear: 1927,
    maxNominees: 3,
    creditField: 'writers',
    recipientPrompt: 'Silent Film Intertitle Writer',
    eraNote: 'Awarded only once at the 1st Academy Awards (1927/28) for silent film intertitles before talkies replaced title cards.',
  },

  // CRAFT & TECHNICAL
  {
    id: 'best-cinematography',
    name: 'Best Cinematography',
    historicalNames: [
      { startYear: 1939, endYear: 1966, title: 'Best Cinematography (Color / Black-and-White)' },
    ],
    division: 'Craft & Technical',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'cinematographer',
    recipientPrompt: 'Director of Photography',
    eraNote: 'From 1939 to 1966 (except 1957), Cinematography was awarded across separate Black-and-White and Color categories.',
  },
  {
    id: 'best-cinematography-bw',
    name: 'Best Cinematography (Black-and-White)',
    division: 'Special & Era-Specific',
    startYear: 1939,
    endYear: 1966,
    maxNominees: 5,
    creditField: 'cinematographer',
    recipientPrompt: 'Director of Photography (B&W)',
    eraNote: 'Separate Black-and-White cinematography category active from 1939 through 1966.',
  },
  {
    id: 'best-production-design',
    name: 'Best Production Design',
    historicalNames: [
      { startYear: 1927, endYear: 1940, title: 'Best Art Direction' },
      { startYear: 1941, endYear: 2011, title: 'Best Art Direction — Set Decoration' },
    ],
    division: 'Craft & Technical',
    startYear: 1927,
    maxNominees: 5,
    creditField: 'productionDesigner',
    recipientPrompt: 'Production Designer & Set Decorator',
  },
  {
    id: 'best-engineering-effects',
    name: 'Best Engineering Effects',
    division: 'Special & Era-Specific',
    startYear: 1927,
    endYear: 1927,
    maxNominees: 3,
    creditField: 'film',
    recipientPrompt: 'Engineering / Effects Supervisor',
    eraNote: 'Inaugural 1927/28 technical award (won by Roy Pomeroy for Wings), precursor to Best Visual Effects.',
  },
  {
    id: 'best-sound',
    name: 'Best Sound',
    historicalNames: [
      { startYear: 1929, endYear: 1968, title: 'Best Sound Recording' },
    ],
    division: 'Craft & Technical',
    startYear: 1929,
    maxNominees: 5,
    creditField: 'film',
    recipientPrompt: 'Sound Department / Mixers',
    eraNote: 'Introduced at the 3rd Academy Awards (1929/30) following the arrival of synchronized sound cinema.',
  },
  {
    id: 'best-film-editing',
    name: 'Best Film Editing',
    division: 'Craft & Technical',
    startYear: 1934,
    maxNominees: 5,
    creditField: 'editor',
    recipientPrompt: 'Film Editor(s)',
    eraNote: 'Introduced at the 7th Academy Awards (1934).',
  },
  {
    id: 'best-original-score',
    name: 'Best Original Score',
    historicalNames: [
      { startYear: 1934, endYear: 1937, title: 'Best Scoring' },
      { startYear: 1938, endYear: 1998, title: 'Best Music, Original Dramatic Score' },
    ],
    division: 'Craft & Technical',
    startYear: 1934,
    maxNominees: 5,
    creditField: 'composer',
    recipientPrompt: 'Composer',
    eraNote: 'Introduced at the 7th Academy Awards (1934).',
  },
  {
    id: 'best-original-song',
    name: 'Best Original Song',
    division: 'Craft & Technical',
    startYear: 1934,
    maxNominees: 5,
    creditField: 'composer',
    recipientPrompt: 'Song Title — Music & Lyrics',
    eraNote: 'Introduced at the 7th Academy Awards (1934); won in its inaugural year by "The Continental".',
  },
  {
    id: 'best-assistant-director',
    name: 'Best Assistant Director',
    division: 'Special & Era-Specific',
    startYear: 1932,
    endYear: 1937,
    maxNominees: 5,
    creditField: 'director',
    recipientPrompt: 'Assistant Director',
    eraNote: 'Competitive Academy Award presented from 1932/33 until 1937.',
  },
  {
    id: 'best-dance-direction',
    name: 'Best Dance Direction',
    division: 'Special & Era-Specific',
    startYear: 1935,
    endYear: 1937,
    maxNominees: 5,
    creditField: 'director',
    recipientPrompt: 'Choreographer / Dance Director',
    eraNote: 'Golden Age musical choreography award presented from 1935 to 1937 (famously won by Hermes Pan and Busby Berkeley contenders).',
  },
  {
    id: 'best-visual-effects',
    name: 'Best Visual Effects',
    historicalNames: [
      { startYear: 1939, endYear: 1962, title: 'Best Special Effects' },
      { startYear: 1963, endYear: 1976, title: 'Best Special Visual Effects' },
    ],
    division: 'Craft & Technical',
    startYear: 1939,
    maxNominees: 5,
    creditField: 'film',
    recipientPrompt: 'Visual Effects Supervisors',
    eraNote: 'Established as a regular category in 1939 (won by The Rains Came).',
  },
  {
    id: 'best-costume-design',
    name: 'Best Costume Design',
    division: 'Craft & Technical',
    startYear: 1948,
    maxNominees: 5,
    creditField: 'costumeDesigner',
    recipientPrompt: 'Costume Designer',
    eraNote: 'Introduced at the 21st Academy Awards (1948).',
  },
  {
    id: 'best-international-feature',
    name: 'Best International Feature Film',
    historicalNames: [
      { startYear: 1947, endYear: 1955, title: 'Special / Honorary Foreign Language Film Award' },
      { startYear: 1956, endYear: 2018, title: 'Best Foreign Language Film' },
    ],
    division: 'Above the Line',
    startYear: 1947,
    maxNominees: 5,
    creditField: 'country',
    recipientPrompt: 'Submitting Country & Director',
    eraNote: 'Awarded as Special Foreign Language honors from 1947 (Shoe-Shine) and made competitive in 1956 (La Strada).',
  },
  {
    id: 'best-makeup-hairstyling',
    name: 'Best Makeup and Hairstyling',
    historicalNames: [
      { startYear: 1981, endYear: 2011, title: 'Best Makeup' },
    ],
    division: 'Craft & Technical',
    startYear: 1981,
    maxNominees: 5,
    creditField: 'film',
    recipientPrompt: 'Makeup & Hair Artists',
    eraNote: 'Introduced at the 54th Academy Awards (1981; won by Rick Baker for An American Werewolf in London).',
  },
  {
    id: 'best-animated-feature',
    name: 'Best Animated Feature',
    division: 'Above the Line',
    startYear: 2001,
    maxNominees: 5,
    creditField: 'director',
    recipientPrompt: 'Director(s)',
    eraNote: 'Introduced at the 74th Academy Awards (2001).',
  },
  {
    id: 'best-casting',
    name: 'Achievement in Casting',
    division: 'Craft & Technical',
    startYear: 2025,
    maxNominees: 5,
    creditField: 'film',
    recipientPrompt: 'Casting Director(s)',
    eraNote: 'Introduced for the 98th Academy Awards (2025/26 release year), the first new category since Animated Feature.',
  },
];

export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export interface CeremonyEraMeta {
  year: number;
  ceremonyNumber: number;
  ceremonyOrdinal: string;
  ceremonyLabel: string;
  eraTitle: string;
  historicalContext: string;
  bestPictureMaxSlots: number;
}

export function getCeremonyMeta(year: number): CeremonyEraMeta {
  const clampedYear = Math.max(1927, Math.min(2026, year));
  const ceremonyNumber = clampedYear - 1926;
  const ceremonyOrdinal = formatOrdinal(ceremonyNumber);
  const ceremonyLabel =
    clampedYear <= 1933
      ? `${ceremonyOrdinal} Academy Awards (${clampedYear}/${String(clampedYear + 1).slice(-2)})`
      : `${ceremonyOrdinal} Academy Awards (${clampedYear})`;

  let eraTitle = 'Contemporary Cinema Era';
  let historicalContext =
    'Up to 10 Best Picture nominees, alongside International Feature, Animated Feature, and full technical craft branches.';

  if (clampedYear === 1927) {
    eraTitle = 'Inaugural Banquet at the Hollywood Roosevelt Hotel';
    historicalContext =
      '12 inaugural categories honoring films released Aug 1927–July 1928, featuring Unique and Artistic Picture, Comedy vs. Dramatic Directing, Title Writing, and Engineering Effects.';
  } else if (clampedYear >= 1928 && clampedYear <= 1935) {
    eraTitle = 'Early Sound & Pre-Code Studio Era';
    historicalContext =
      'Unique and Artistic Picture and Title Writing were retired; Sound Recording (1929), Film Editing (1934), Original Score & Song (1934), and Dance Direction (1935) joined the slate.';
  } else if (clampedYear >= 1936 && clampedYear <= 1947) {
    eraTitle = 'Golden Age Studio System & Supporting Acting Debut';
    historicalContext =
      'Best Supporting Actor & Actress debuted in 1936; 10 Best Picture nominees ran from 1931–1943; Cinematography split into Black-and-White and Color in 1939.';
  } else if (clampedYear >= 1948 && clampedYear <= 1966) {
    eraTitle = 'Post-War World Cinema & Widescreen Technicolor Era';
    historicalContext =
      'Costume Design debuted in 1948 and competitive Foreign Language Film in 1956. Black-and-White vs. Color craft splits continued through 1966.';
  } else if (clampedYear >= 1967 && clampedYear <= 2000) {
    eraTitle = 'New Hollywood & Modern auteur Era';
    historicalContext =
      'Unified Cinematography and Art Direction categories; Best Makeup joined in 1981 following The Elephant Man clamor.';
  } else if (clampedYear >= 2001 && clampedYear <= 2008) {
    eraTitle = '21st Century Expansion & Animated Feature Debut';
    historicalContext =
      'Best Animated Feature debuted in 2001 (74th Ceremony), with 5 Best Picture slots prior to the 2009 expansion.';
  } else if (clampedYear >= 2025) {
    eraTitle = 'Modern Expanded Slate & Achievement in Casting';
    historicalContext =
      'Includes the newly inaugurated Achievement in Casting category alongside 10 Best Picture slots and all 24 modern categories.';
  }

  const bestPictureMaxSlots =
    (clampedYear >= 1931 && clampedYear <= 1943) || clampedYear >= 2009 ? 10 : 5;

  return {
    year: clampedYear,
    ceremonyNumber,
    ceremonyOrdinal,
    ceremonyLabel,
    eraTitle,
    historicalContext,
    bestPictureMaxSlots,
  };
}

export function getCategoryDisplayName(cat: HistoricalCategorySpec, year: number): string {
  if (cat.historicalNames) {
    const match = cat.historicalNames.find((h) => year >= h.startYear && year <= h.endYear);
    if (match) return match.title;
  }
  return cat.name;
}

export function getCategoriesForYear(
  year: number,
  includeAllModern: boolean = false,
  customCategories: HistoricalCategorySpec[] = []
): HistoricalCategorySpec[] {
  const base = HISTORICAL_OSCAR_CATEGORIES.filter((cat) => {
    if (includeAllModern) {
      // Include all non-discontinued modern categories + any special categories active in that specific year
      const isModernActive = !cat.endYear;
      const isEraActive = year >= cat.startYear && (!cat.endYear || year <= cat.endYear);
      return isModernActive || isEraActive;
    }
    return year >= cat.startYear && (!cat.endYear || year <= cat.endYear);
  }).map((cat) => ({
    ...cat,
    name: getCategoryDisplayName(cat, year),
    maxNominees:
      cat.id === 'best-picture' ? getCeremonyMeta(year).bestPictureMaxSlots : cat.maxNominees,
  }));

  return [...base, ...customCategories];
}

export function getSuggestedRecipientsForCategory(
  film: FilmRecord,
  creditField: CreditFieldKey
): string[] {
  const m = film.metadata || {};
  switch (creditField) {
    case 'director':
      return m.director ? [m.director] : [];
    case 'cast':
      return m.cast && m.cast.length > 0 ? m.cast : [];
    case 'writers':
      return m.writers && m.writers.length > 0
        ? [m.writers.join(' & '), ...m.writers]
        : m.director
        ? [m.director]
        : [];
    case 'cinematographer':
      return m.cinematographer ? [m.cinematographer] : [];
    case 'composer':
      return m.composer ? [m.composer] : [];
    case 'editor':
      return m.editor ? [m.editor] : [];
    case 'productionDesigner':
      return m.productionDesigner ? [m.productionDesigner] : [];
    case 'costumeDesigner':
      return m.costumeDesigner ? [m.costumeDesigner] : [];
    case 'country':
      return m.country
        ? [`${m.country}${m.director ? ` · Dir. ${m.director}` : ''}`]
        : m.director
        ? [`Dir. ${m.director}`]
        : [];
    case 'film':
    default:
      return m.director ? [`Produced by / Dir. ${m.director}`] : ['Official Feature Entry'];
  }
}

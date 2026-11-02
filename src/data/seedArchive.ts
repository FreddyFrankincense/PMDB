import { CineasteArchiveState, FilmRecord } from '../types/cinema';
import { makeFilmId } from '../utils/letterboxdCsvParser';

const RAW_SEED_FILMS: Array<Omit<FilmRecord, 'id'>> = [
  // 1927 — INAUGURAL 1ST ACADEMY AWARDS ERA
  {
    title: 'Sunrise: A Song of Two Humans',
    year: 1927,
    rating: 5.0,
    liked: true,
    watchedDate: '2025-11-04',
    letterboxdUri: 'https://letterboxd.com/film/sunrise-a-song-of-two-humans/',
    tags: ['35mm', 'silent-masterpiece', 'inaugural-oscars'],
    listIds: ['list-criterion-essentials', 'list-sight-and-sound'],
    review:
      'Murnau transforms the silent screen into fluid architecture. The trolley ride from the marshlands into the gleaming Art Deco metropolis remains one of the most breathtaking tracking sequences ever committed to nitrate. Janet Gaynor and George O’Brien carry mythic weight without uttering a spoken word.',
    metadata: {
      director: 'F. W. Murnau',
      cast: ['George O’Brien', 'Janet Gaynor', 'Margaret Livingston'],
      writers: ['Carl Mayer', 'Hermann Sudermann'],
      cinematographer: 'Charles Rosher & Karl Struss',
      productionDesigner: 'Rochus Gliese',
      country: 'United States',
      runtime: '94m',
      genres: ['Drama', 'Romance'],
    },
  },
  {
    title: 'Metropolis',
    year: 1927,
    rating: 5.0,
    liked: true,
    watchedDate: '2025-11-08',
    letterboxdUri: 'https://letterboxd.com/film/metropolis/',
    tags: ['expressionism', 'restored-print', 'uf-babelsberg'],
    listIds: ['list-criterion-essentials'],
    review:
      'With the 2010 Buenos Aires restoration restoring nearly all of Fritz Lang and Thea von Harbou’s symphonic structure, Metropolis stands unmatched in monumental production design and optical camera effects.',
    metadata: {
      director: 'Fritz Lang',
      cast: ['Brigitte Helm', 'Alfred Abel', 'Gustav Fröhlich', 'Rudolf Klein-Rogge'],
      writers: ['Thea von Harbou', 'Fritz Lang'],
      cinematographer: 'Karl Freund & Günther Rittau',
      composer: 'Gottfried Huppertz',
      productionDesigner: 'Otto Hunte, Erich Kettelhut & Karl Vollbrecht',
      country: 'Germany',
      runtime: '153m',
      genres: ['Sci-Fi', 'Drama'],
    },
  },
  {
    title: 'Wings',
    year: 1927,
    rating: 4.0,
    liked: false,
    watchedDate: '2025-11-12',
    letterboxdUri: 'https://letterboxd.com/film/wings/',
    tags: ['best-picture-winner', 'aerial-photography'],
    listIds: [],
    review:
      'William A. Wellman mounted cameras directly onto biplane fuselages high above Texas clouds, and the resulting dogfights still feel viscerally dangerous nearly a century later. And that famous Café de Paris tracking shot across dozens of tables is pure visual virtuosity.',
    metadata: {
      director: 'William A. Wellman',
      cast: ['Clara Bow', 'Charles "Buddy" Rogers', 'Richard Arlen', 'Gary Cooper'],
      writers: ['John Monk Saunders', 'Hope Loring', 'Louis D. Lighton'],
      cinematographer: 'Harry Perry',
      editor: 'E. Lloyd Sheldon',
      country: 'United States',
      runtime: '144m',
      genres: ['War', 'Drama', 'Action'],
    },
  },
  {
    title: 'The Crowd',
    year: 1927,
    rating: 4.5,
    liked: true,
    watchedDate: '2025-11-15',
    letterboxdUri: 'https://letterboxd.com/film/the-crowd/',
    tags: ['silent-era', 'king-vidor'],
    listIds: ['list-criterion-essentials'],
    review:
      'King Vidor’s camera scaling up the monolithic skyscraper facade only to dissolve into an endless sea of identical desks captures modern urban alienation with devastating clarity.',
    metadata: {
      director: 'King Vidor',
      cast: ['Eleanor Boardman', 'James Murray', 'Bert Roach'],
      writers: ['King Vidor', 'John V. A. Weaver'],
      cinematographer: 'Henry Sharp',
      editor: 'Hugh Wynn',
      country: 'United States',
      runtime: '98m',
      genres: ['Drama'],
    },
  },
  {
    title: '7th Heaven',
    year: 1927,
    rating: 4.0,
    liked: false,
    watchedDate: '2025-11-19',
    letterboxdUri: 'https://letterboxd.com/film/7th-heaven/',
    tags: ['frank-borzage', 'melodrama'],
    listIds: [],
    review:
      'Frank Borzage’s transcendent romanticism elevates a Parisian sewer worker and a street waif literally and spiritually up seven flights of stairs toward the stars.',
    metadata: {
      director: 'Frank Borzage',
      cast: ['Janet Gaynor', 'Charles Farrell', 'Ben Bard'],
      writers: ['Benjamin Glazer', 'Austin Strong'],
      cinematographer: 'Ernest Palmer',
      productionDesigner: 'Harry Oliver',
      country: 'United States',
      runtime: '110m',
      genres: ['Drama', 'Romance'],
    },
  },

  // 1954 — GOLDEN AGE WORLD CINEMA
  {
    title: 'Seven Samurai',
    year: 1954,
    rating: 5.0,
    liked: true,
    watchedDate: '2025-12-02',
    letterboxdUri: 'https://letterboxd.com/film/seven-samurai/',
    tags: ['kurosawa', 'criterion-spine-2', '35mm'],
    listIds: ['list-criterion-essentials', 'list-sight-and-sound'],
    review:
      'Akira Kurosawa’s geometry of motion, multi-camera telephoto editing in the torrential mud, and Takashi Shimura’s quiet moral gravity establish the grammar of modern ensemble action cinema.',
    metadata: {
      director: 'Akira Kurosawa',
      cast: ['Toshiro Mifune', 'Takashi Shimura', 'Keiko Tsushima', 'Seiji Miyaguchi'],
      writers: ['Akira Kurosawa', 'Shinobu Hashimoto', 'Hideo Oguni'],
      cinematographer: 'Asakazu Nakai',
      composer: 'Fumio Hayasaka',
      editor: 'Akira Kurosawa',
      country: 'Japan',
      runtime: '207m',
      genres: ['Action', 'Drama'],
    },
  },
  {
    title: 'Rear Window',
    year: 1954,
    rating: 5.0,
    liked: true,
    watchedDate: '2025-12-06',
    letterboxdUri: 'https://letterboxd.com/film/rear-window/',
    tags: ['hitchcock', 'technicolor'],
    listIds: ['list-criterion-essentials'],
    review:
      'A masterwork of pure Kuleshov effect and voyeuristic suspense constructed entirely within a single Greenwich Village courtyard set.',
    metadata: {
      director: 'Alfred Hitchcock',
      cast: ['James Stewart', 'Grace Kelly', 'Thelma Ritter', 'Raymond Burr'],
      writers: ['John Michael Hayes', 'Cornell Woolrich'],
      cinematographer: 'Robert Burks',
      composer: 'Franz Waxman',
      editor: 'George Tomasini',
      costumeDesigner: 'Edith Head',
      country: 'United States',
      runtime: '112m',
      genres: ['Thriller', 'Mystery'],
    },
  },
  {
    title: 'On the Waterfront',
    year: 1954,
    rating: 4.5,
    liked: true,
    watchedDate: '2025-12-10',
    letterboxdUri: 'https://letterboxd.com/film/on-the-waterfront/',
    tags: ['actors-studio', 'location-shooting'],
    listIds: [],
    review:
      'Boris Kaufman’s wintery Hoboken fog, Leonard Bernstein’s elegiac French horn score, and Marlon Brando’s glove scene with Eva Marie Saint redefine screen naturalism.',
    metadata: {
      director: 'Elia Kazan',
      cast: ['Marlon Brando', 'Karl Malden', 'Lee J. Cobb', 'Rod Steiger', 'Eva Marie Saint'],
      writers: ['Budd Schulberg'],
      cinematographer: 'Boris Kaufman',
      composer: 'Leonard Bernstein',
      editor: 'Gene Milford',
      country: 'United States',
      runtime: '108m',
      genres: ['Crime', 'Drama'],
    },
  },

  // 1975 — NEW HOLLYWOOD & AUTEUR PINNACLE (48TH ACADEMY AWARDS)
  {
    title: 'Barry Lyndon',
    year: 1975,
    rating: 5.0,
    liked: true,
    rewatch: true,
    watchedDate: '2026-01-18',
    letterboxdUri: 'https://letterboxd.com/film/barry-lyndon/',
    tags: ['70mm', 'kubrick', 'zeiss-f0.7', 'criterion'],
    listIds: ['list-criterion-essentials', 'list-sight-and-sound'],
    review:
      'Every frame looks as though it were painted by Gainsborough or Hogarth and lit solely by tallow beeswax candles through NASA Zeiss f/0.7 lenses. Beneath the stately zooms and Schubert piano trio lies Kubrick’s most devastatingly ironic tragedy about human vanity and mortality.',
    metadata: {
      director: 'Stanley Kubrick',
      cast: ['Ryan O’Neal', 'Marisa Berenson', 'Patrick Magee', 'Hardy Krüger', 'Leon Vitali'],
      writers: ['Stanley Kubrick', 'William Makepeace Thackeray'],
      cinematographer: 'John Alcott',
      composer: 'Leonard Rosenman',
      editor: 'Tony Lawson',
      productionDesigner: 'Ken Adam & Roy Walker',
      costumeDesigner: 'Ulla-Britt Söderlund & Milena Canonero',
      country: 'United Kingdom',
      runtime: '185m',
      genres: ['Drama', 'History', 'War'],
    },
  },
  {
    title: 'Mirror',
    year: 1975,
    rating: 5.0,
    liked: true,
    watchedDate: '2026-01-21',
    letterboxdUri: 'https://letterboxd.com/film/mirror/',
    tags: ['tarkovsky', 'poetic-cinema'],
    listIds: ['list-criterion-essentials', 'list-sight-and-sound'],
    review:
      'Andrei Tarkovsky sculpts in time, wind sweeping across rye fields, and childhood memory. Margarita Terekhova’s dual performance and Georgy Rerberg’s shifting sepia-to-color cinematography feel like a dream recalled upon waking.',
    metadata: {
      director: 'Andrei Tarkovsky',
      cast: ['Margarita Terekhova', 'Ignat Daniltsev', 'Oleg Yankovsky', 'Alla Demidova'],
      writers: ['Andrei Tarkovsky', 'Aleksandr Misharin'],
      cinematographer: 'Georgy Rerberg',
      composer: 'Eduard Artemyev',
      editor: 'Lyudmila Feiginova',
      country: 'Soviet Union',
      runtime: '106m',
      genres: ['Drama', 'History'],
    },
  },
  {
    title: 'Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles',
    year: 1975,
    rating: 5.0,
    liked: true,
    watchedDate: '2026-01-25',
    letterboxdUri: 'https://letterboxd.com/film/jeanne-dielman-23-quai-du-commerce-1080-bruxelles/',
    tags: ['chantal-akerman', 'sight-and-sound-1'],
    listIds: ['list-criterion-essentials', 'list-sight-and-sound'],
    review:
      'Chantal Akerman’s rigorous fixed-camera duration turns domestic routine—peeling potatoes, brewing coffee, smoothing bedsheets—into high-wire formal suspense.',
    metadata: {
      director: 'Chantal Akerman',
      cast: ['Delphine Seyrig', 'Jan Decorte', 'Henri Storck'],
      writers: ['Chantal Akerman'],
      cinematographer: 'Babette Mangolte',
      editor: 'Patricia Canino',
      country: 'Belgium',
      runtime: '202m',
      genres: ['Drama'],
    },
  },
  {
    title: 'Dog Day Afternoon',
    year: 1975,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-01-28',
    letterboxdUri: 'https://letterboxd.com/film/dog-day-afternoon/',
    tags: ['sidney-lumet', 'new-york'],
    listIds: [],
    review:
      'Al Pacino and John Cazale radiate live-wire desperation in the sweltering Brooklyn heat, while Dede Allen’s rhythmic editing without a single note of non-diegetic score keeps the street circus taut from first frame to last.',
    metadata: {
      director: 'Sidney Lumet',
      cast: ['Al Pacino', 'John Cazale', 'Charles Durning', 'Chris Sarandon', 'Carol Kane'],
      writers: ['Frank Pierson'],
      cinematographer: 'Victor J. Kemper',
      editor: 'Dede Allen',
      country: 'United States',
      runtime: '125m',
      genres: ['Crime', 'Drama', 'Thriller'],
    },
  },
  {
    title: 'Nashville',
    year: 1975,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-02-02',
    letterboxdUri: 'https://letterboxd.com/film/nashville/',
    tags: ['altman', 'ensemble'],
    listIds: ['list-criterion-essentials'],
    review:
      'Robert Altman weaves 24 characters and overlapping 8-track dialogue into the definitive bicentennial tapestry of American ambition, spectacle, and heartbreak.',
    metadata: {
      director: 'Robert Altman',
      cast: ['Ronee Blakley', 'Keith Carradine', 'Lily Tomlin', 'Gwen Welles', 'Henry Gibson'],
      writers: ['Joan Tewkesbury'],
      cinematographer: 'Paul Lohmann',
      editor: 'Sidney Levin & Dennis M. Hill',
      country: 'United States',
      runtime: '160m',
      genres: ['Drama', 'Music'],
    },
  },
  {
    title: 'One Flew Over the Cuckoo’s Nest',
    year: 1975,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-02-05',
    letterboxdUri: 'https://letterboxd.com/film/one-flew-over-the-cuckoos-nest/',
    tags: ['big-five-oscar-winner'],
    listIds: [],
    review:
      'Miloš Forman’s humane ensemble observation anchors Jack Nicholson and Louise Fletcher’s unforgettable duel of institutional authority versus anarchic spirit.',
    metadata: {
      director: 'Miloš Forman',
      cast: ['Jack Nicholson', 'Louise Fletcher', 'Will Sampson', 'Brad Dourif', 'Danny DeVito'],
      writers: ['Lawrence Hauben', 'Bo Goldman', 'Ken Kesey'],
      cinematographer: 'Haskell Wexler & Bill Butler',
      composer: 'Jack Nitzsche',
      editor: 'Richard Chew, Lynzee Klingman & Sheldon Kahn',
      country: 'United States',
      runtime: '133m',
      genres: ['Drama'],
    },
  },

  // 2023 — 96TH ACADEMY AWARDS ERA
  {
    title: 'Oppenheimer',
    year: 2023,
    rating: 5.0,
    liked: true,
    rewatch: true,
    watchedDate: '2026-02-14',
    letterboxdUri: 'https://letterboxd.com/film/oppenheimer-2023/',
    tags: ['imax-70mm', 'nolan'],
    listIds: ['list-70mm-exhibitions'],
    review:
      'Constructed like a three-hour procedural thriller through Jennifer Lame’s propulsive crosscutting and Ludwig Göransson’s violin-driven score. Cillian Murphy’s thousand-yard stare in the gymnasium speech is haunting.',
    metadata: {
      director: 'Christopher Nolan',
      cast: ['Cillian Murphy', 'Robert Downey Jr.', 'Emily Blunt', 'Matt Damon', 'Florence Pugh'],
      writers: ['Christopher Nolan', 'Kai Bird', 'Martin J. Sherwin'],
      cinematographer: 'Hoyte van Hoytema',
      composer: 'Ludwig Göransson',
      editor: 'Jennifer Lame',
      productionDesigner: 'Ruth De Jong',
      costumeDesigner: 'Ellen Mirojnick',
      country: 'United States',
      runtime: '180m',
      genres: ['Biography', 'Drama', 'History'],
    },
  },
  {
    title: 'Anatomy of a Fall',
    year: 2023,
    rating: 5.0,
    liked: true,
    watchedDate: '2026-02-16',
    letterboxdUri: 'https://letterboxd.com/film/anatomy-of-a-fall/',
    tags: ['palme-dor', 'justine-triet'],
    listIds: ['list-criterion-essentials'],
    review:
      'Justine Triet and Arthur Harari dissect language, translation, and creative resentment inside a marriage with surgical precision. Sandra Hüller delivers one of the defining screen performances of the decade.',
    metadata: {
      director: 'Justine Triet',
      cast: ['Sandra Hüller', 'Swann Arlaud', 'Milo Machado-Graner', 'Antoine Reinartz'],
      writers: ['Justine Triet', 'Arthur Harari'],
      cinematographer: 'Simon Beaufils',
      editor: 'Laurent Sénéchal',
      country: 'France',
      runtime: '152m',
      genres: ['Crime', 'Drama', 'Thriller'],
    },
  },
  {
    title: 'The Zone of Interest',
    year: 2023,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-02-19',
    letterboxdUri: 'https://letterboxd.com/film/the-zone-of-interest/',
    tags: ['jonathan-glazer', 'sound-design'],
    listIds: [],
    review:
      'Two films playing simultaneously: one of cold bourgeois domesticity seen through Łukasz Żal’s clinical multi-camera setups, and another heard through Johnnie Burn’s chilling acoustic wall.',
    metadata: {
      director: 'Jonathan Glazer',
      cast: ['Christian Friedel', 'Sandra Hüller'],
      writers: ['Jonathan Glazer', 'Martin Amis'],
      cinematographer: 'Łukasz Żal',
      composer: 'Mica Levi',
      editor: 'Paul Watts',
      productionDesigner: 'Chris Oddy',
      country: 'United Kingdom / Poland',
      runtime: '105m',
      genres: ['Drama', 'History'],
    },
  },
  {
    title: 'Past Lives',
    year: 2023,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-02-22',
    letterboxdUri: 'https://letterboxd.com/film/past-lives/',
    tags: ['celine-song', '35mm'],
    listIds: [],
    review:
      'Celine Song’s debut turns the Korean concept of In-Yun into an aching, deeply generous meditation on emigration and the lives we leave behind. That final unbroken walk down the East Village block is unforgettable.',
    metadata: {
      director: 'Celine Song',
      cast: ['Greta Lee', 'Teo Yoo', 'John Magaro'],
      writers: ['Celine Song'],
      cinematographer: 'Shabier Kirchner',
      composer: 'Christopher Bear & Daniel Rossen',
      editor: 'Keith Fraase',
      country: 'United States',
      runtime: '106m',
      genres: ['Drama', 'Romance'],
    },
  },
  {
    title: 'Poor Things',
    year: 2023,
    rating: 4.5,
    liked: true,
    watchedDate: '2026-02-25',
    letterboxdUri: 'https://letterboxd.com/film/poor-things-2023/',
    tags: ['lanthimos', 'golden-lion'],
    listIds: [],
    review:
      'Emma Stone’s fearless physical transformation paired with Shona Heath and James Price’s surreal Belle Époque sets and Holly Waddington’s sculptural tailoring.',
    metadata: {
      director: 'Yorgos Lanthimos',
      cast: ['Emma Stone', 'Mark Ruffalo', 'Willem Dafoe', 'Ramy Youssef'],
      writers: ['Tony McNamara', 'Alasdair Gray'],
      cinematographer: 'Robbie Ryan',
      composer: 'Jerskin Fendrix',
      editor: 'Yorgos Mavropsaridis',
      productionDesigner: 'James Price & Shona Heath',
      costumeDesigner: 'Holly Waddington',
      country: 'Ireland / United Kingdom',
      runtime: '141m',
      genres: ['Comedy', 'Drama', 'Sci-Fi'],
    },
  },
];

export function createInitialSeedArchive(): CineasteArchiveState {
  const films: Record<string, FilmRecord> = {};
  for (const raw of RAW_SEED_FILMS) {
    const id = makeFilmId(raw.title, raw.year);
    films[id] = { ...raw, id };
  }

  return {
    films,
    yearlyRankings: {
      1927: {
        year: 1927,
        summaryEssay:
          'The zenith of late silent cinema on the eve of synchronized sound—where camera movement and expressionist architecture achieved pure visual poetry.',
        entries: [
          {
            filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
            rank: 1,
            tier: 'Masterpiece',
            curatorNote: 'Unrivaled camera fluidity and luminous chiaroscuro.',
          },
          {
            filmId: makeFilmId('Metropolis', 1927),
            rank: 2,
            tier: 'Masterpiece',
            curatorNote: 'Monumental architectural vision in its restored 153-minute form.',
          },
          {
            filmId: makeFilmId('The Crowd', 1927),
            rank: 3,
            tier: 'Essential',
            curatorNote: 'King Vidor’s modern urban realism.',
          },
          {
            filmId: makeFilmId('Wings', 1927),
            rank: 4,
            tier: 'Essential',
            curatorNote: 'Astonishing practical aerial combat photography.',
          },
          {
            filmId: makeFilmId('7th Heaven', 1927),
            rank: 5,
            tier: 'Notable',
            curatorNote: 'Sublime silent melodrama.',
          },
        ],
      },
      1954: {
        year: 1954,
        summaryEssay:
          'A golden crossroads of post-war world cinema—Kurosawa’s epic kineticism, Hitchcock’s pure visual suspense, and Kazan’s method naturalism.',
        entries: [
          {
            filmId: makeFilmId('Seven Samurai', 1954),
            rank: 1,
            tier: 'Masterpiece',
            curatorNote: 'Unmatched telephoto action editing and moral architecture.',
          },
          {
            filmId: makeFilmId('Rear Window', 1954),
            rank: 2,
            tier: 'Masterpiece',
            curatorNote: 'Pure Kuleshov montage inside a single courtyard.',
          },
          {
            filmId: makeFilmId('On the Waterfront', 1954),
            rank: 3,
            tier: 'Essential',
            curatorNote: 'Brando and Saint in wintery Hoboken.',
          },
        ],
      },
      1975: {
        year: 1975,
        summaryEssay:
          'Arguably the single richest year of 1970s cinema—bridging European formal radicalism (Akerman, Tarkovsky, Kubrick) with peak American New Hollywood (Lumet, Altman, Forman).',
        entries: [
          {
            filmId: makeFilmId('Barry Lyndon', 1975),
            rank: 1,
            tier: 'Masterpiece',
            curatorNote: 'Candlelit 18th-century painterly perfection.',
          },
          {
            filmId: makeFilmId('Mirror', 1975),
            rank: 2,
            tier: 'Masterpiece',
            curatorNote: 'Tarkovsky’s stream-of-consciousness poem of memory.',
          },
          {
            filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
            rank: 3,
            tier: 'Masterpiece',
            curatorNote: 'Hypnotic structuralist rigor and Delphine Seyrig’s precision.',
          },
          {
            filmId: makeFilmId('Dog Day Afternoon', 1975),
            rank: 4,
            tier: 'Essential',
            curatorNote: 'Pacino and Cazale at their most electric.',
          },
          {
            filmId: makeFilmId('Nashville', 1975),
            rank: 5,
            tier: 'Essential',
            curatorNote: 'Altman’s polyphonic 24-character masterpiece.',
          },
          {
            filmId: makeFilmId('One Flew Over the Cuckoo’s Nest', 1975),
            rank: 6,
            tier: 'Essential',
            curatorNote: 'Forman’s deeply humane ensemble drama.',
          },
        ],
      },
      2023: {
        year: 2023,
        summaryEssay:
          'A banner year for international auteurs, forensic courtroom drama, and large-format celluloid craftsmanship.',
        entries: [
          {
            filmId: makeFilmId('Oppenheimer', 2023),
            rank: 1,
            tier: 'Masterpiece',
            curatorNote: 'Monumental 70mm historical montage.',
          },
          {
            filmId: makeFilmId('Anatomy of a Fall', 2023),
            rank: 2,
            tier: 'Masterpiece',
            curatorNote: 'Triet & Harari’s razor-sharp screenplay and Sandra Hüller.',
          },
          {
            filmId: makeFilmId('The Zone of Interest', 2023),
            rank: 3,
            tier: 'Essential',
            curatorNote: 'Revolutionary sound design and formal restraint.',
          },
          {
            filmId: makeFilmId('Past Lives', 2023),
            rank: 4,
            tier: 'Essential',
            curatorNote: 'Tender, devastatingly honest debut.',
          },
          {
            filmId: makeFilmId('Poor Things', 2023),
            rank: 5,
            tier: 'Essential',
            curatorNote: 'Exuberant production design and fearless lead performance.',
          },
        ],
      },
    },
    oscarBallots: {
      1927: {
        year: 1927,
        ceremonyNotes: 'Personal Retrospective Ballot for the Inaugural 1st Academy Awards (1927/28)',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-1927-pic-1',
            nominees: [
              {
                id: 'nom-1927-pic-1',
                filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
                recipientName: 'William Fox / Fox Film Corporation',
                roleOrDetail: 'Dir. F. W. Murnau',
              },
              {
                id: 'nom-1927-pic-2',
                filmId: makeFilmId('Wings', 1927),
                recipientName: 'Lucien Hubbard / Paramount Famous Lasky',
                roleOrDetail: 'Dir. William A. Wellman',
              },
              {
                id: 'nom-1927-pic-3',
                filmId: makeFilmId('The Crowd', 1927),
                recipientName: 'Irving Thalberg / Metro-Goldwyn-Mayer',
                roleOrDetail: 'Dir. King Vidor',
              },
            ],
          },
          'unique-artistic-picture': {
            categoryId: 'unique-artistic-picture',
            winnerNomineeId: 'nom-1927-uap-1',
            nominees: [
              {
                id: 'nom-1927-uap-1',
                filmId: makeFilmId('Metropolis', 1927),
                recipientName: 'Fritz Lang / UFA',
                roleOrDetail: 'Expressionist Architectural Vision',
              },
              {
                id: 'nom-1927-uap-2',
                filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
                recipientName: 'F. W. Murnau / Fox Film Corporation',
                roleOrDetail: 'A Song of Two Humans',
              },
              {
                id: 'nom-1927-uap-3',
                filmId: makeFilmId('The Crowd', 1927),
                recipientName: 'King Vidor / MGM',
                roleOrDetail: 'Urban Realism',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-1927-dir-1',
            nominees: [
              {
                id: 'nom-1927-dir-1',
                filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
                recipientName: 'F. W. Murnau',
              },
              {
                id: 'nom-1927-dir-2',
                filmId: makeFilmId('Metropolis', 1927),
                recipientName: 'Fritz Lang',
              },
              {
                id: 'nom-1927-dir-3',
                filmId: makeFilmId('The Crowd', 1927),
                recipientName: 'King Vidor',
              },
              {
                id: 'nom-1927-dir-4',
                filmId: makeFilmId('7th Heaven', 1927),
                recipientName: 'Frank Borzage',
              },
            ],
          },
          'best-actress': {
            categoryId: 'best-actress',
            winnerNomineeId: 'nom-1927-actress-1',
            nominees: [
              {
                id: 'nom-1927-actress-1',
                filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
                recipientName: 'Janet Gaynor',
                roleOrDetail: 'as The Wife',
              },
              {
                id: 'nom-1927-actress-2',
                filmId: makeFilmId('Metropolis', 1927),
                recipientName: 'Brigitte Helm',
                roleOrDetail: 'as Maria / The Maschinenmensch',
              },
              {
                id: 'nom-1927-actress-3',
                filmId: makeFilmId('The Crowd', 1927),
                recipientName: 'Eleanor Boardman',
                roleOrDetail: 'as Mary Sims',
              },
            ],
          },
          'best-cinematography': {
            categoryId: 'best-cinematography',
            winnerNomineeId: 'nom-1927-cin-1',
            nominees: [
              {
                id: 'nom-1927-cin-1',
                filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
                recipientName: 'Charles Rosher & Karl Struss',
              },
              {
                id: 'nom-1927-cin-2',
                filmId: makeFilmId('Metropolis', 1927),
                recipientName: 'Karl Freund & Günther Rittau',
              },
              {
                id: 'nom-1927-cin-3',
                filmId: makeFilmId('Wings', 1927),
                recipientName: 'Harry Perry',
              },
            ],
          },
        },
      },
      1975: {
        year: 1975,
        ceremonyNotes: '48th Academy Awards Personal Retrospective Ledger',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-1975-pic-1',
            nominees: [
              {
                id: 'nom-1975-pic-1',
                filmId: makeFilmId('Barry Lyndon', 1975),
                recipientName: 'Stanley Kubrick, Producer',
              },
              {
                id: 'nom-1975-pic-2',
                filmId: makeFilmId('Mirror', 1975),
                recipientName: 'Erik Waisberg, Producer',
              },
              {
                id: 'nom-1975-pic-3',
                filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
                recipientName: 'Evelyne Paul & Corinne Jenart, Producers',
              },
              {
                id: 'nom-1975-pic-4',
                filmId: makeFilmId('Dog Day Afternoon', 1975),
                recipientName: 'Martin Bregman & Martin Elfand, Producers',
              },
              {
                id: 'nom-1975-pic-5',
                filmId: makeFilmId('Nashville', 1975),
                recipientName: 'Robert Altman, Producer',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-1975-dir-1',
            nominees: [
              {
                id: 'nom-1975-dir-1',
                filmId: makeFilmId('Barry Lyndon', 1975),
                recipientName: 'Stanley Kubrick',
              },
              {
                id: 'nom-1975-dir-2',
                filmId: makeFilmId('Mirror', 1975),
                recipientName: 'Andrei Tarkovsky',
              },
              {
                id: 'nom-1975-dir-3',
                filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
                recipientName: 'Chantal Akerman',
              },
              {
                id: 'nom-1975-dir-4',
                filmId: makeFilmId('Nashville', 1975),
                recipientName: 'Robert Altman',
              },
              {
                id: 'nom-1975-dir-5',
                filmId: makeFilmId('Dog Day Afternoon', 1975),
                recipientName: 'Sidney Lumet',
              },
            ],
          },
          'best-actor': {
            categoryId: 'best-actor',
            winnerNomineeId: 'nom-1975-actor-1',
            nominees: [
              {
                id: 'nom-1975-actor-1',
                filmId: makeFilmId('Dog Day Afternoon', 1975),
                recipientName: 'Al Pacino',
                roleOrDetail: 'as Sonny Wortzik',
              },
              {
                id: 'nom-1975-actor-2',
                filmId: makeFilmId('One Flew Over the Cuckoo’s Nest', 1975),
                recipientName: 'Jack Nicholson',
                roleOrDetail: 'as Randle Patrick McMurphy',
              },
              {
                id: 'nom-1975-actor-3',
                filmId: makeFilmId('Barry Lyndon', 1975),
                recipientName: 'Ryan O’Neal',
                roleOrDetail: 'as Redmond Barry',
              },
            ],
          },
          'best-actress': {
            categoryId: 'best-actress',
            winnerNomineeId: 'nom-1975-actress-1',
            nominees: [
              {
                id: 'nom-1975-actress-1',
                filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
                recipientName: 'Delphine Seyrig',
                roleOrDetail: 'as Jeanne Dielman',
              },
              {
                id: 'nom-1975-actress-2',
                filmId: makeFilmId('Mirror', 1975),
                recipientName: 'Margarita Terekhova',
                roleOrDetail: 'as Maria / Natalia',
              },
              {
                id: 'nom-1975-actress-3',
                filmId: makeFilmId('One Flew Over the Cuckoo’s Nest', 1975),
                recipientName: 'Louise Fletcher',
                roleOrDetail: 'as Nurse Mildred Ratched',
              },
            ],
          },
          'best-cinematography': {
            categoryId: 'best-cinematography',
            winnerNomineeId: 'nom-1975-cin-1',
            nominees: [
              {
                id: 'nom-1975-cin-1',
                filmId: makeFilmId('Barry Lyndon', 1975),
                recipientName: 'John Alcott',
              },
              {
                id: 'nom-1975-cin-2',
                filmId: makeFilmId('Mirror', 1975),
                recipientName: 'Georgy Rerberg',
              },
              {
                id: 'nom-1975-cin-3',
                filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
                recipientName: 'Babette Mangolte',
              },
            ],
          },
        },
      },
      2023: {
        year: 2023,
        ceremonyNotes: '96th Academy Awards Personal Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-2023-pic-1',
            nominees: [
              {
                id: 'nom-2023-pic-1',
                filmId: makeFilmId('Oppenheimer', 2023),
                recipientName: 'Emma Thomas, Charles Roven & Christopher Nolan',
              },
              {
                id: 'nom-2023-pic-2',
                filmId: makeFilmId('Anatomy of a Fall', 2023),
                recipientName: 'Marie-Ange Luciani & David Thion',
              },
              {
                id: 'nom-2023-pic-3',
                filmId: makeFilmId('The Zone of Interest', 2023),
                recipientName: 'James Wilson',
              },
              {
                id: 'nom-2023-pic-4',
                filmId: makeFilmId('Past Lives', 2023),
                recipientName: 'David Hinojosa, Christine Vachon & Pamela Koffler',
              },
              {
                id: 'nom-2023-pic-5',
                filmId: makeFilmId('Poor Things', 2023),
                recipientName: 'Ed Guiney, Andrew Lowe, Yorgos Lanthimos & Emma Stone',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-2023-dir-1',
            nominees: [
              {
                id: 'nom-2023-dir-1',
                filmId: makeFilmId('Oppenheimer', 2023),
                recipientName: 'Christopher Nolan',
              },
              {
                id: 'nom-2023-dir-2',
                filmId: makeFilmId('Anatomy of a Fall', 2023),
                recipientName: 'Justine Triet',
              },
              {
                id: 'nom-2023-dir-3',
                filmId: makeFilmId('The Zone of Interest', 2023),
                recipientName: 'Jonathan Glazer',
              },
              {
                id: 'nom-2023-dir-4',
                filmId: makeFilmId('Poor Things', 2023),
                recipientName: 'Yorgos Lanthimos',
              },
              {
                id: 'nom-2023-dir-5',
                filmId: makeFilmId('Past Lives', 2023),
                recipientName: 'Celine Song',
              },
            ],
          },
          'best-actress': {
            categoryId: 'best-actress',
            winnerNomineeId: 'nom-2023-actress-1',
            nominees: [
              {
                id: 'nom-2023-actress-1',
                filmId: makeFilmId('Anatomy of a Fall', 2023),
                recipientName: 'Sandra Hüller',
                roleOrDetail: 'as Sandra Voyter',
              },
              {
                id: 'nom-2023-actress-2',
                filmId: makeFilmId('Poor Things', 2023),
                recipientName: 'Emma Stone',
                roleOrDetail: 'as Bella Baxter',
              },
              {
                id: 'nom-2023-actress-3',
                filmId: makeFilmId('Past Lives', 2023),
                recipientName: 'Greta Lee',
                roleOrDetail: 'as Nora Moon',
              },
            ],
          },
        },
      },
      1941: {
        year: 1941,
        ceremonyNotes: '14th Academy Awards Personal Retrospective Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-1941-pic-1',
            nominees: [
              {
                id: 'nom-1941-pic-1',
                filmId: makeFilmId('Citizen Kane', 1941),
                recipientName: 'Orson Welles / Mercury Productions',
              },
              {
                id: 'nom-1941-pic-2',
                filmId: makeFilmId('The Maltese Falcon', 1941),
                recipientName: 'Hal B. Wallis, Producer',
              },
              {
                id: 'nom-1941-pic-3',
                filmId: makeFilmId('How Green Was My Valley', 1941),
                recipientName: 'Darryl F. Zanuck, Producer',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-1941-dir-1',
            nominees: [
              {
                id: 'nom-1941-dir-1',
                filmId: makeFilmId('Citizen Kane', 1941),
                recipientName: 'Orson Welles',
              },
              {
                id: 'nom-1941-dir-2',
                filmId: makeFilmId('How Green Was My Valley', 1941),
                recipientName: 'John Ford',
              },
              {
                id: 'nom-1941-dir-3',
                filmId: makeFilmId('The Maltese Falcon', 1941),
                recipientName: 'John Huston',
              },
            ],
          },
        },
      },
      1954: {
        year: 1954,
        ceremonyNotes: '27th Academy Awards Personal Retrospective Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-1954-pic-1',
            nominees: [
              {
                id: 'nom-1954-pic-1',
                filmId: makeFilmId('Seven Samurai', 1954),
                recipientName: 'Sojiro Motoki / Toho',
              },
              {
                id: 'nom-1954-pic-2',
                filmId: makeFilmId('Rear Window', 1954),
                recipientName: 'Alfred Hitchcock, Producer',
              },
              {
                id: 'nom-1954-pic-3',
                filmId: makeFilmId('On the Waterfront', 1954),
                recipientName: 'Sam Spiegel, Producer',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-1954-dir-2',
            nominees: [
              {
                id: 'nom-1954-dir-1',
                filmId: makeFilmId('Seven Samurai', 1954),
                recipientName: 'Akira Kurosawa',
              },
              {
                id: 'nom-1954-dir-2',
                filmId: makeFilmId('Rear Window', 1954),
                recipientName: 'Alfred Hitchcock',
              },
              {
                id: 'nom-1954-dir-3',
                filmId: makeFilmId('On the Waterfront', 1954),
                recipientName: 'Elia Kazan',
              },
            ],
          },
          'best-actor': {
            categoryId: 'best-actor',
            winnerNomineeId: 'nom-1954-act-1',
            nominees: [
              {
                id: 'nom-1954-act-1',
                filmId: makeFilmId('On the Waterfront', 1954),
                recipientName: 'Marlon Brando',
                roleOrDetail: 'as Terry Malloy',
              },
              {
                id: 'nom-1954-act-2',
                filmId: makeFilmId('Seven Samurai', 1954),
                recipientName: 'Takashi Shimura',
                roleOrDetail: 'as Kambei Shimada',
              },
              {
                id: 'nom-1954-act-3',
                filmId: makeFilmId('Rear Window', 1954),
                recipientName: 'James Stewart',
                roleOrDetail: 'as L. B. Jefferies',
              },
            ],
          },
        },
      },
      1972: {
        year: 1972,
        ceremonyNotes: '45th Academy Awards Personal Retrospective Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-1972-pic-1',
            nominees: [
              {
                id: 'nom-1972-pic-1',
                filmId: makeFilmId('The Godfather', 1972),
                recipientName: 'Albert S. Ruddy, Producer',
              },
              {
                id: 'nom-1972-pic-2',
                filmId: makeFilmId('Aguirre, the Wrath of God', 1972),
                recipientName: 'Werner Herzog, Producer',
              },
              {
                id: 'nom-1972-pic-3',
                filmId: makeFilmId('Solaris', 1972),
                recipientName: 'Viacheslav Tarasov, Producer',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-1972-dir-1',
            nominees: [
              {
                id: 'nom-1972-dir-1',
                filmId: makeFilmId('The Godfather', 1972),
                recipientName: 'Francis Ford Coppola',
              },
              {
                id: 'nom-1972-dir-2',
                filmId: makeFilmId('Solaris', 1972),
                recipientName: 'Andrei Tarkovsky',
              },
              {
                id: 'nom-1972-dir-3',
                filmId: makeFilmId('Aguirre, the Wrath of God', 1972),
                recipientName: 'Werner Herzog',
              },
            ],
          },
        },
      },
      2007: {
        year: 2007,
        ceremonyNotes: '80th Academy Awards Personal Retrospective Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-2007-pic-1',
            nominees: [
              {
                id: 'nom-2007-pic-1',
                filmId: makeFilmId('There Will Be Blood', 2007),
                recipientName: 'Paul Thomas Anderson, Daniel Lupi & JoAnne Sellar',
              },
              {
                id: 'nom-2007-pic-2',
                filmId: makeFilmId('No Country for Old Men', 2007),
                recipientName: 'Scott Rudin, Ethan Coen & Joel Coen',
              },
              {
                id: 'nom-2007-pic-3',
                filmId: makeFilmId('Zodiac', 2007),
                recipientName: 'Ceán Chaffin, Brad Fischer & Mike Medavoy',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-2007-dir-2',
            nominees: [
              {
                id: 'nom-2007-dir-1',
                filmId: makeFilmId('There Will Be Blood', 2007),
                recipientName: 'Paul Thomas Anderson',
              },
              {
                id: 'nom-2007-dir-2',
                filmId: makeFilmId('No Country for Old Men', 2007),
                recipientName: 'Joel Coen & Ethan Coen',
              },
              {
                id: 'nom-2007-dir-3',
                filmId: makeFilmId('Zodiac', 2007),
                recipientName: 'David Fincher',
              },
            ],
          },
        },
      },
      2016: {
        year: 2016,
        ceremonyNotes: '89th Academy Awards Personal Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-2016-pic-1',
            nominees: [
              {
                id: 'nom-2016-pic-1',
                filmId: makeFilmId('Moonlight', 2016),
                recipientName: 'Adele Romanski, Dede Gardner & Jeremy Kleiner',
              },
              {
                id: 'nom-2016-pic-2',
                filmId: makeFilmId('The Handmaiden', 2016),
                recipientName: 'Park Chan-wook & Syd Lim',
              },
              {
                id: 'nom-2016-pic-3',
                filmId: makeFilmId('Arrival', 2016),
                recipientName: 'Shawn Levy, Dan Levine, Aaron Ryder & David Linde',
              },
              {
                id: 'nom-2016-pic-4',
                filmId: makeFilmId('La La Land', 2016),
                recipientName: 'Fred Berger, Jordan Horowitz & Marc Platt',
              },
            ],
          },
        },
      },
      2019: {
        year: 2019,
        ceremonyNotes: '92nd Academy Awards Personal Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-2019-pic-1',
            nominees: [
              {
                id: 'nom-2019-pic-1',
                filmId: makeFilmId('Parasite', 2019),
                recipientName: 'Kwak Sin-ae & Bong Joon-ho',
              },
              {
                id: 'nom-2019-pic-2',
                filmId: makeFilmId('Portrait of a Lady on Fire', 2019),
                recipientName: 'Bénédicte Couvreur, Producer',
              },
              {
                id: 'nom-2019-pic-3',
                filmId: makeFilmId('The Irishman', 2019),
                recipientName: 'Martin Scorsese, Robert De Niro & Emma Tillinger Koskoff',
              },
              {
                id: 'nom-2019-pic-4',
                filmId: makeFilmId('Uncut Gems', 2019),
                recipientName: 'Sebastian Bear-McClard, Eli Bush & Scott Rudin',
              },
              {
                id: 'nom-2019-pic-5',
                filmId: makeFilmId('The Lighthouse', 2019),
                recipientName: 'Rodrigo Teixeira, Jay Van Hoy & Robert Eggers',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-2019-dir-1',
            nominees: [
              {
                id: 'nom-2019-dir-1',
                filmId: makeFilmId('Parasite', 2019),
                recipientName: 'Bong Joon-ho',
              },
              {
                id: 'nom-2019-dir-2',
                filmId: makeFilmId('Portrait of a Lady on Fire', 2019),
                recipientName: 'Céline Sciamma',
              },
              {
                id: 'nom-2019-dir-3',
                filmId: makeFilmId('The Irishman', 2019),
                recipientName: 'Martin Scorsese',
              },
            ],
          },
        },
      },
      2024: {
        year: 2024,
        ceremonyNotes: '97th Academy Awards Personal Ballot',
        categories: {
          'best-picture': {
            categoryId: 'best-picture',
            winnerNomineeId: 'nom-2024-pic-1',
            nominees: [
              {
                id: 'nom-2024-pic-1',
                filmId: makeFilmId('Anora', 2024),
                recipientName: 'Alex Coco, Samantha Quan & Sean Baker',
              },
              {
                id: 'nom-2024-pic-2',
                filmId: makeFilmId('The Brutalist', 2024),
                recipientName: 'Brady Corbet, D.J. Gugenheim & Trevor Matthews',
              },
              {
                id: 'nom-2024-pic-3',
                filmId: makeFilmId('Dune: Part Two', 2024),
                recipientName: 'Mary Parent, Cale Boyter & Denis Villeneuve',
              },
              {
                id: 'nom-2024-pic-4',
                filmId: makeFilmId('Challengers', 2024),
                recipientName: 'Amy Pascal, Luca Guadagnino & Zendaya',
              },
              {
                id: 'nom-2024-pic-5',
                filmId: makeFilmId('Conclave', 2024),
                recipientName: 'Tessa Ross, Juliette Howell & Michael A. Jackman',
              },
            ],
          },
          'best-director': {
            categoryId: 'best-director',
            winnerNomineeId: 'nom-2024-dir-2',
            nominees: [
              {
                id: 'nom-2024-dir-1',
                filmId: makeFilmId('Anora', 2024),
                recipientName: 'Sean Baker',
              },
              {
                id: 'nom-2024-dir-2',
                filmId: makeFilmId('The Brutalist', 2024),
                recipientName: 'Brady Corbet',
              },
              {
                id: 'nom-2024-dir-3',
                filmId: makeFilmId('Dune: Part Two', 2024),
                recipientName: 'Denis Villeneuve',
              },
            ],
          },
        },
      },
    },
    lists: [
      {
        id: 'list-criterion-essentials',
        name: 'Criterion Closet & Restoration Canon',
        description:
          'Landmark restorations, 35mm masters, and formal touchstones across a century of world cinema.',
        createdDate: '2025-10-15',
        letterboxdUrl: 'https://letterboxd.com/lists/',
        isRanked: true,
        entries: [
          {
            filmId: makeFilmId('Barry Lyndon', 1975),
            position: 1,
            notes: '4K restoration supervised by Jan Harlan; unmatched f/0.7 candlelight.',
          },
          {
            filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
            position: 2,
            notes: 'Movietone preservation master.',
          },
          {
            filmId: makeFilmId('Seven Samurai', 1954),
            position: 3,
            notes: 'Toho 4K restoration.',
          },
          {
            filmId: makeFilmId('Mirror', 1975),
            position: 4,
            notes: 'Mosfilm 2K restoration.',
          },
          {
            filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
            position: 5,
            notes: 'Cinematek Brussels restoration.',
          },
          {
            filmId: makeFilmId('Anatomy of a Fall', 2023),
            position: 6,
            notes: 'Palme d’Or winner.',
          },
        ],
      },
      {
        id: 'list-sight-and-sound',
        name: 'Personal All-Time Sight & Sound Ballot',
        description:
          'Ten formal milestones that reshaped how time, architecture, and human interiority are projected.',
        createdDate: '2026-01-01',
        isRanked: true,
        entries: [
          {
            filmId: makeFilmId('Barry Lyndon', 1975),
            position: 1,
            notes: 'Kubrick’s greatest achievement.',
          },
          {
            filmId: makeFilmId('Sunrise: A Song of Two Humans', 1927),
            position: 2,
            notes: 'Pure silent visual symphony.',
          },
          {
            filmId: makeFilmId('Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', 1975),
            position: 3,
            notes: 'Duration as narrative tension.',
          },
          {
            filmId: makeFilmId('Seven Samurai', 1954),
            position: 4,
            notes: 'Ensemble kinetic geometry.',
          },
          {
            filmId: makeFilmId('Mirror', 1975),
            position: 5,
            notes: 'Sculpting in time.',
          },
        ],
      },
    ],
    lastImportedAt: '2026-02-26T18:00:00.000Z',
  };
}

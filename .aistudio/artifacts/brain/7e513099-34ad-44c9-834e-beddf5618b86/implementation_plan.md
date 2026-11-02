# Cineaste Archive & Personal Academy Ledger

An interactive film curation studio that transforms your Letterboxd export (`ratings.csv`, `reviews.csv`, `diary.csv`, `watched.csv`, and custom `lists/*.csv`) into an editorial catalog, complete with drag-and-drop annual film rankings and a historically accurate personal Academy Awards ballot system spanning every ceremony from 1927/28 to the present.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and product choices incorporate your preferences from our initial review. Please confirm if you are ready to build or if you would like any adjustments.

- **Public Film Metadata & Poster Enrichment**: Uses a multi-source public lookup pipeline (querying public IMDb suggestion feeds, Wikidata/Wikipedia film entities, iTunes/Apple Movie artwork APIs, and optional TMDB key support) via a backend proxy route so movie posters, directors, cast, screenwriters, cinematographers, composers, and technical credits populate automatically without requiring paid API keys, paired with instant inline editing.
- **Historically Accurate Oscar Era Engine (1927–Present)**: Dynamically generates the exact slate of categories active for any selected year—from the 1st Academy Awards (1927/28, featuring *Unique and Artistic Picture*, *Directing (Comedy/Dramatic)*, and *Title Writing*) through the introduction of *Supporting Acting* (1936), *Foreign Language/International Feature* (1947/1956), *Animated Feature* (2001), and *Best Casting* (2025)—while still allowing custom category overrides per year.
- **Local Persistence with Full JSON Archive Portability**: Saves all imported Letterboxd libraries, enriched credits, yearly top rankings, and historical Oscar ballots locally in the browser (`IndexedDB` / `localStorage`) with one-click full JSON archive export and import.
- **Hybrid Visual Aesthetic (Dark Cinema Editorial × Clean Archival Print)**: Blends Criterion/Letterboxd dark screening-room surfaces with Swiss archival print typography, warm alabaster paper ballot sheets, hairline rules, and a seamless Dark/Archival Light theme switcher.

---

## 1. Overview & Core Concept

- **What It Does**: Ingests your Letterboxd CSV exports (along with a pre-loaded curated cinephile archive so the app is immediately explorable on first launch), enriches films with high-resolution posters and above/below-the-line crew credits, and provides two flagship curation workspaces for every cinema year (1927–Present):
  1. **Annual Ranked List Studio**: Order and tier your top films of any release year, compare against your original Letterboxd star ratings and reviews, and add curator notes.
  2. **Personal Academy Awards Ballot**: Nominate up to 5 (or 10 for Best Picture) eligible films from that year across historically accurate categories, crown a single Winner per category, and record performance/craft citations (e.g., naming the specific actor, director, or cinematographer).
- **Target Audience / Persona**: Cinephiles, Letterboxd patrons, and film historians who want a structured, visually refined permanent home for their annual rankings and retrospective personal Oscar ceremonies.
- **Key Value**: Bridges the gap between flat Letterboxd CSV spreadsheets and a publication-grade annual film retrospective—automatically resolving missing posters and cast/crew credits while respecting the historical evolution of Academy Award categories.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Library & Letterboxd CSV Import Flow**:
   - Drop individual or multiple Letterboxd export CSV files (`ratings.csv`, `reviews.csv`, `watched.csv`, `diary.csv`, and custom list CSVs) into the Import Drawer, or explore the pre-seeded historical film archive spanning classic and contemporary cinema.
   - The app deduplicates films by title + release year (or Letterboxd URI), merges star ratings ($0.5\text{★}$–$5.0\text{★}$), review text, watch dates, rewatch flags, and list memberships, and triggers background poster/credit enrichment.
2. **Visual Film Catalog & Multi-Faceted Filtering**:
   - Browse your entire library in a high-density poster grid or Swiss archival ledger table.
   - Filter instantaneously by Release Year or Decade (1920s–2020s), Star Rating range, Reviewed status, Letterboxd List membership, Oscar Nomination/Winner status in your personal ledger, or search by Title, Director, and Cast.
3. **Annual Ranked List Workspace**:
   - Select any release year from the chronological timeline rail (1927–2026).
   - View all watched/rated films from that year on the left, auto-sorted by your Letterboxd star rating as a starting baseline, and reorder your official **Personal Yearly Top Ranking** (#1, #2, #3...) via keyboard, up/down controls, or drag-and-drop, complete with pull-quote snippets from your Letterboxd review.
4. **Historical Personal Oscars Ballot & Ceremony Ledger**:
   - Switch to the **Academy Ballot** view for the selected year (displaying the corresponding ceremony number, e.g., *1st Academy Awards · 1927/28* or *97th Academy Awards · 2024*).
   - Browse the era-accurate categories grouped by division (*Above the Line*, *Writing*, *Craft & Technical*, *Special & Era-Specific*).
   - Click **Add Nominee** in any category to pick from your watched films of that year (or any film in that release year). The app automatically suggests the relevant credit (e.g., pre-filling the film's Director for *Best Director* or Lead Cast options for *Best Actor/Actress*) with full manual editability.
   - Toggle the **Golden Laurel / Winner** seal on one nominee per category to crown your personal Oscar winner, automatically computing a real-time **Tally Board** (most-nominated and most-awarded films of that year).

### Visual Identity & Theme
- **Aesthetic Direction**: **Criterion Screening Room × Swiss Archival Print Catalog**. Combines the moody, poster-forward theater darkness of Letterboxd and Criterion Channel with the structured hairline grids, warm paper tones, and serif editorial authority of a museum retrospective catalog.Supports instant toggling between **Screening Room (Dark)** and **Archival Print (Light)**.
- **Color Palette & Mood (60-30-10 Discipline)**:
  - *Screening Room Dark (Default)*:
    - **60% Dominant Canvas**: Deep Nitrate Charcoal (`#0C0C0E`) and Slate Shadow (`#121316`).
    - **30% Structural Surfaces**: Warm Archival Graphite (`#18191E`), delicate hairline rules (`#262830`), primary Alabaster text (`#F4F1EA`), and Muted Silver metadata (`#9A9891`).
    - **10% Accent Budget**: Academy Burnished Gold (`#D4AF37` / `#C59B27`) reserved strictly for Winner laurels, star ratings, and primary CTAs; Criterion Terracotta (`#C84B31`) for secondary editorial highlights.
  - *Archival Print Light (Toggleable)*:
    - **60% Dominant Canvas**: Warm Alabaster Paper (`#FBF9F5`).
    - **30% Structural Surfaces**: Limestone Ledger (`#F2EFE9`), 1px Stone Hairlines (`#DED9CE`), Deep Ink Charcoal text (`#181615`), and Warm Stone captions (`#6E6A63`).
    - **10% Accent Budget**: Antique Bronze Gold (`#9A7B1C`) and Archival Crimson (`#9A3412`).
- **Typography & Hierarchy (2+1 Font Rule)**:
  - *Display & Ceremony Headlines*: `Cormorant Garamond` (SemiBold 600 / Italic) — evokes classic film titles, Criterion essays, and official Academy Award envelopes.
  - *UI Controls, Navigation & Prose*: `Plus Jakarta Sans` (Regular 400 / SemiBold 600) — crisp, high-legibility geometric sans-serif for dense filter bars and review reading (`65ch` measure).
  - *Tabular Data, Years, Rankings & Tallies*: `JetBrains Mono` (`tabular-nums`) — ensures vertical alignment across release years, rank indices (`01`, `02`), star ratings (`4.5★`), and nomination counts.
- **Component Styling & Layout**:
  - **Top Bar Contract**: Strict single-row 3-zone header: Brand wordmark (`Cineaste Ledger`) on the left, 4 concise single-line navigation links (`Catalog`, `Yearly Rankings`, `Academy Ballots`, `Lists & Reviews`) in the center, and 1 primary action (`Import / Export`) on the right.
  - **Zero-Pill Metadata Discipline**: Film metadata (Release Year, Director, Runtime, Star Rating, Nomination count) renders as clean, unboxed inline text separated by middots (`1975 · Dir. Stanley Kubrick · ★★★★½ · 7 Nominations`), never wrapped in noisy rounded pill chips.
  - **Single-Elevation Depth**: Flat gallery cards framed by 1px hairline borders and 2:3 theatrical poster aspect ratios with resilient custom SVG/typographic clapperboard fallbacks if a poster is still loading.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Keyless Multi-Source Public Metadata Enrichment + Express Proxy**
  - *Chosen Approach*: Build an Express server proxy (`/api/metadata/enrich` and `/api/metadata/search`) that queries public, unauthenticated film endpoints (IMDb public suggestion JSON API for high-res poster URLs and principal cast/year matches, plus Wikipedia/Wikidata MediaWiki APIs for director, screenwriter, cinematographer, composer, and editor credits) and caches results in `localStorage`. Also allow users to optionally plug in a custom poster URL or edit any credit inline.
  - *Why*: Letterboxd CSV files only provide `Name`, `Year`, `Letterboxd URI`, and `Rating`. Querying public IMDb/Wikidata endpoints server-side avoids CORS blocks, requires zero API key setup from the user, and populates real theatrical posters and crew credits automatically.
  - *Alternatives Considered*: Requiring the user to register for a personal TMDB API key before using the app (rejected because it creates friction and violates the seamless out-of-the-box experience).
- **Decision 2: Era-Accurate Historical Oscar Category Rules Engine (1927–2026)**
  - *Chosen Approach*: Implement a deterministic historical rule table mapping each release year / ceremony year (from the 1st Academy Awards in 1927/28 to the 98th in 2025/26) to its authentic category list, nomination slot limits (e.g., 3–5 vs. 10 Best Picture slots in 1931–1943 and 2009–present), and historical category names (e.g., *Best Story* retired in 1957, *Best Dance Direction* 1935–1937, *Best Animated Feature* added in 2001, *Best Casting* added in 2025), plus a toggle to "Include All Modern Categories" if the user wants to retroactively award modern categories (like *Best Stunt/Casting* or *Animated Feature*) in earlier years.
  - *Why*: Directly fulfills your choice for historically accurate categories matching each Oscar era while giving flexibility for retrospective "what-if" awards.
- **Decision 3: Multi-File Letterboxd CSV Parser with Pre-Seeded Masterpiece Archive**
  - *Chosen Approach*: Support drag-and-drop of `ratings.csv`, `reviews.csv`, `diary.csv`, `watched.csv`, and multiple `lists/*.csv` files (parsing standard RFC 4180 CSV with multi-line quoted reviews), while initializing first-time visitors with a rich sample dataset spanning 1927–2025 so every view is immediately interactive before importing personal CSVs.
  - *Why*: Users can immediately test yearly rankings and historical ballots from 1927 to today, then either merge or replace the sample data with their own Letterboxd CSV export in seconds.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        TOP NAVIGATION BAR (3-Zone)                         │
│  [Cineaste Ledger]     [Catalog · Yearly Rankings · Academy Ballots ·      │
│                         Lists & Reviews]                [Import / Backup]  │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────────┐   ┌─────────────────────────┐   ┌────────────────────┐
│  1. FILM CATALOG &  │   │ 2. ANNUAL RANKED LIST   │   │ 3. HISTORICAL      │
│     LISTS EXPLORER  │   │    STUDIO (1927–2026)   │   │    OSCAR BALLOT    │
├─────────────────────┤   ├─────────────────────────┤   ├────────────────────┤
│ • Poster Grid /     │   │ • Decade & Year Scrubber│   │ • Era Category     │
│   Archival Table    │   │ • Unranked Year Pool    │   │   Engine (1st–98th)│
│ • Multi-Faceted     │   │   (Sorted by ★ Rating)  │   │ • Nominee Picker   │
│   Filter & Search   │   │ • Ordered Top List      │   │   & Credit Auto-   │
│ • Film Detail &     │   │   (Drag / Move / Tier)  │   │   Suggest          │
│   Review Drawer     │   │ • Ranking vs. Rating    │   │ • Winner Laurel &  │
│ • Custom Lists View │   │   Delta Indicator       │   │   Ceremony Tally   │
└──────────┬──────────┘   └────────────┬────────────┘   └─────────┬──────────┘
           │                           │                          │
           └───────────────────────────┼──────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             CLIENT ARCHIVE STORE (React Context + LocalStorage)            │
│  • Films Map (keyed by slug/year: ratings, reviews, watchDates, credits)   │
│  • YearlyRankings Map (year -> ordered filmIds[], tier notes)              │
│  • OscarBallots Map (year -> categoryId -> nominees[], winnerId, custom)   │
│  • LetterboxdLists Array (imported list CSVs & custom curated collections) │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│  CSV & JSON ARCHIVE ENGINE          │  │  EXPRESS METADATA PROXY (/api/*)  │
│  • RFC-4180 Multi-line CSV Parser   │  │  • /api/metadata/enrich           │
│  • Merges ratings, reviews, diary,  │  │  • Queries Public IMDb Suggestion │
│    watched & Letterboxd list CSVs   │  │    API + Wikidata/Wikipedia APIs  │
│  • Full JSON State Export & Restore │  │    for Posters, Director, Cast,   │
│                                     │  │    Writer, Cinematographer, Score │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

### Data Model & State

- **`FilmRecord`**:
  - `id`: Deterministic key (`${normalizedTitle}-${year}`)
  - `title`, `year`, `letterboxdUri`
  - `rating`: Number (`0.5` to `5.0`, nullable)
  - `liked`: Boolean
  - `review`: String (full markdown/text from `reviews.csv`)
  - `watchedDate`, `rewatch`: Extracted from `diary.csv` / `watched.csv`
  - `listIds`: Array of Letterboxd list IDs this film belongs to
  - `metadata`: `{ posterUrl, backdropUrl, director, cast: string[], writers: string[], cinematographer, composer, editor, country, runtime, genres: string[], imdbId, enrichedAt }`
- **`YearlyRanking`**:
  - `year`: Number (`1927`–`2026`)
  - `entries`: Array of `{ filmId, rank, curatorNote, tier: 'Masterpiece' | 'Essential' | 'Notable' }`
  - `summaryEssay`: Optional overall year-in-review reflection
- **`YearlyOscarBallot`**:
  - `year`: Number (`1927`–`2026`)
  - `ceremonyNumber`: Computed ordinal (`1st` through `98th`)
  - `useModernCategoriesOverride`: Boolean (allows unlocking modern categories in classic years)
  - `categories`: Record mapping `categoryId` to:
    - `nominees`: Array of `{ id, filmId, recipientName, roleOrDetail, note }`
    - `winnerNomineeId`: String (nullable)
- **`HistoricalCategorySpec`**:
  - Built-in rule definitions covering all Academy Award categories with `startYear`, `endYear` (if discontinued, e.g., *Best Title Writing* 1927, *Best Story* 1927–1956, *Best Assistant Director* 1933–1937, *Best Dance Direction* 1935–1937, *Black-and-White vs. Color Cinematography/Art Direction* splits 1939–1966), `division`, `maxNominees`, and `creditField` (links category to `director`, `cast`, `writers`, `cinematographer`, `composer`, `editor`, or `film`).

### Interactive Component & State Mapping

- **Year & Decade Navigation Rail**: Clicking any decade (`1920s`–`2020s`) and year (`1927`–`2026`) updates the active year context across both **Yearly Rankings** and **Academy Ballots**, displaying badges for how many films you've rated in that year and whether your ballot is complete.
- **CSV Import & Enrichment Modal**:
  - Accepts multiple `.csv` files at once, automatically detecting whether each file is a Letterboxd `ratings.csv`, `reviews.csv`, `diary.csv`, `watched.csv`, or a Letterboxd `list` CSV (which includes a 4-line metadata header before the film rows).
  - Runs a non-blocking background enrichment queue that calls `/api/metadata/enrich` in batches, updating film posters and credits live in the UI with a progress counter and retry/manual-edit controls.
- **Interactive Ballot Builder & Nominee Modal**:
  - Selecting a category (e.g., *Best Actor in a Leading Role* or *Best Cinematography*) opens the eligible films from the active year (sorted by your yearly rank and star rating).
  - Selecting a film auto-populates candidate names from `film.metadata` (e.g., clicking a film for *Best Director* fills in its director; clicking for *Best Actor* offers quick-select chips of the film's principal cast plus a custom text input).
  - Clicking the **Crown Winner** button marks the nominee with the burnished gold Academy laurel and updates the ceremony's **Studio & Film Tally Board** (e.g., *Barry Lyndon — 7 Nominations · 4 Wins*).

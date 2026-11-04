# Full-Archive Letterboxd Paginated Scraper Plan (6,000+ Films & 180+ Lists)

This plan accounts for why the current Letterboxd Scraper captured **494 films (out of 6,024)** and **50 lists (out of 181)** during real-world testing, and outlines the multi-page crawler architecture required to ingest complete user filmographies and list libraries.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Why Exact Counts Stopped at 50 Lists and 494 Films**
> 1. **The 50-List RSS Hard Cap**: When scraping a profile, the current scraper queries `https://letterboxd.com/<username>/rss/`. Letterboxd's RSS feed is hard-capped at the **50 most recently updated lists** (`<guid>letterboxd-list-...</guid>`). The remaining **131 lists** are never included in the RSS XML.
> 2. **The 10-Film List Preview Cap in RSS**: Inside each of those 50 RSS list items, Letterboxd truncates the `<description>` HTML list to a **10-film preview** (*"...plus X more. View the full list on Letterboxd"*). Combining ~50 recent diary watches with 50 list previews (× ~10 films each) and deduplicating by `title::year` produced **494 unique films**, leaving the other **5,530 watched films** unscraped.
> 3. **Missing Pagination Crawler**: Letterboxd paginates watched films at **72 films/page** (`/<username>/films/page/1..84/` for 6,024 films), user list indexes at **12 lists/page** (`/<username>/lists/page/1..16/` for 181 lists), and individual lists at **100 films/page** (`/<username>/list/<slug>/page/1..N/`). Currently, the scraper only makes a single unpaginated request.

- **Decision 1 — Deep Multi-Page Pagination Engine**: Upgrade the scraper from a single-request RSS/page-1 fetcher to an asynchronous, multi-page crawler that discovers total film and list counts from the profile header (`6,024 films`, `181 lists`) and crawls all `/films/page/1..N/` and `/lists/page/1..N/` pages.
- **Decision 2 — Hybrid Server + Browser Relay Pool for Cloudflare Resilience**: Because Cloudflare frequently challenges datacenter IPs on HTML endpoints (`/films/page/N/`) while allowing `/rss/`, the paginated crawler will use a hybrid transport pool (direct fetch + rotated CORS/edge relays + client-side parallel batch fetching) so all 84 film pages and 16 list index pages resolve reliably without 403 blocks.
- **Decision 3 — Real-Time Progress Telemetry & Incremental Archive Commit**: Crawling 84 film pages + 16 list index pages + 181 list detail pages requires ~100–280 HTTP requests. We will add a live progress bar (e.g., `Scraping Watched Films: Page 34 / 84 (2,448 / 6,024 films) · Lists: 181 / 181`) with incremental batch commits so the UI never freezes or times out.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the single-shot RSS/page-1 scraper with a **Full-Archive Paginated Crawler** capable of ingesting 6,000+ watched films, ratings, likes, diary dates, and 180+ curated lists directly from public Letterboxd pages.
- **Target Audience / Persona**: High-volume Letterboxd archivists with thousands of logged films and ratusan/hundreds of curated lists who want complete parity between URL scraping and CSV export ingestion.
- **Key Value**: Eliminates the 50-list and ~500-film RSS ceiling, achieving 100% discovery of all public films (`/<username>/films/page/1..N/`) and all public lists (`/<username>/lists/page/1..N/` + full list entries).

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Profile / Full Archive Scrape**: User enters their Letterboxd profile URL or username in **Data Sources -> URL Scraping** and selects **Full Paginated Crawl (All Films & All Lists)**.
  2. **Discovery Phase (1–2s)**: The scraper fetches page 1 of `/<username>/`, `/<username>/films/`, and `/<username>/lists/` to detect exact target totals (e.g., **6,024 Films across 84 pages** and **181 Lists across 16 pages**) and immediately displays these target counts in the progress panel.
  3. **Batched Page Crawl with Live Progress**: A two-stage progress bar streams page-by-page completion:
     - **Stage 1 (Watched Films Grid)**: Crawls `/films/page/1/` through `/films/page/84/` (72 films/page) with concurrent worker batching, extracting film title, release year, exact Letterboxd slug (`data-film-slug` / `data-item-slug`), member star rating (`rated-X`), and liked heart status (`icon-liked`).
     - **Stage 2 (Curated Lists Index & List Expansion)**: Crawls `/lists/page/1/` through `/lists/page/16/` (12 lists/page) to capture all **181 lists**, then fetches the full paginated film entries (`/list/<slug>/page/1..M/`, 100 films/page) so lists with >10 films are never truncated to RSS previews.
  4. **Incremental & Resumable Sync**: Commits scraped batches into `archive.films` and `archive.lists` progressively and supports pausing/resuming if a network relay rate-limits.
- **Visual Identity & Theme**:
  - Preserves the **Archival Darkroom** aesthetic (`#0B0C0E` obsidian canvas, `#F59E0B` amber gold progress indicators, `#10B981` emerald completion badges, `JetBrains Mono` tabular counters).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Orchestrated Batched Pagination vs. Single Monolithic Server Request**
  - *Chosen Approach*: **Client-orchestrated batched pagination** calling a new `/api/letterboxd/scrape-page` endpoint (with automatic client-side CORS relay failover).
  - *Why*: A single HTTP POST that tries to fetch 84 film pages + 181 list pages (~265 sequential requests) on the server will exceed browser/proxy 30–60s HTTP request timeouts. By orchestrating page batches (e.g., 6 pages per concurrent batch) from the client with server + browser relay failover, the user sees real-time progress (`2,448 / 6,024 films`), never hits an HTTP timeout, and works identically in both the hosted web app and the Standalone Desktop executable.
- **Decision 2: Slug-Keyed Deduplication (`data-item-slug` / `data-film-slug`) Over `title::year` Collisions**
  - *Chosen Approach*: Key scraped films by their canonical Letterboxd `filmSlug` (e.g., `parasite-2019` or `crash-1996` vs `crash-2004`) and extract release years from `data-item-full-display-name`, `data-film-release-year`, or slug suffix before falling back to title normalization.
  - *Why*: In a 6,024-film archive, hundreds of films share identical titles or lack an inline year on compact grid cards, which previously caused false deduplication drops.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Pagination Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   DataSourcesView / CsvImportModal UI                      │
│  [Full Paginated Crawl Toggle]  [Live Progress: 4,320/6,024 Films | 181/181]│
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             Paginated Crawler Coordinator (letterboxdScraper.ts)           │
│  1. Discover Totals: Parse `.paginate-pages` last page # on /films & /lists│
│  2. Film Worker Pool (Concurrency: 6): Crawl /<user>/films/page/1..84/     │
│  3. List Index Pool (Concurrency: 4): Crawl /<user>/lists/page/1..16/      │
│  4. List Detail Expander: Crawl /<user>/list/<slug>/page/1..K/ (100/page)  │
│  5. RSS Overlay: Merge /<user>/rss/ for recent full-text reviews & dates   │
└─────────────────┬───────────────────────────────────────┬──────────────────┘
                  │                                       │
     Primary Server Relay                     Browser Multi-Relay Pool
   (`/api/letterboxd/scrape-page`)          (allorigins / codetabs / corsproxy)
                  │                                       │
                  └───────────────────┬───────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│               Enhanced DOM & JSON-LD Parser Engine                         │
│  • Poster Grid Parser: `li.poster-container`, `div.react-component.poster` │
│    (`data-item-slug`, `data-item-full-display-name`, `.rated-2..10`)       │
│  • List Index Parser: `section.list-set article.list-summary` (all 12/pg)  │
│  • Pagination Detector: Extracts max page N from `.paginate-page a`        │
└────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
1. **Pagination Discovery & HTML Parser Upgrade**:
   - Add `extractMaxPageNumber(html)` to read the highest page number in `<div class="paginate-pages">...<li class="paginate-page"><a href=".../page/84/">84</a></li>` (and header count badges like `6,024 films` / `181 lists`).
   - Add `parseLetterboxdListsIndexHtml(html)` to extract all 12 list cards per `/lists/page/N/` page (capturing list title, `/list/<slug>/` URL, film count badge, and description) even before expanding individual lists.
   - Upgrade `parseLetterboxdHtmlOrRssToResult` to parse all modern Letterboxd poster grid attributes (`data-item-slug`, `data-film-slug`, `data-item-full-display-name`, `data-item-name`, `alt` attributes inside `.film-poster`, and `.poster-viewingdata` rating/like spans).
2. **Multi-Relay Transport Endpoint (`/api/letterboxd/scrape-page`)**:
   - Server endpoint and standalone desktop handler that fetches any specific Letterboxd page URL (`/films/page/N/`, `/lists/page/N/`, `/list/<slug>/page/N/`) using rotated browser headers and server-side proxy relays when direct datacenter IP requests encounter a Cloudflare challenge.
3. **Live Progress UI in `DataSourcesView` & `CsvImportModal`**:
   - Displays a real-time progress tracker showing pages crawled, films discovered (`X / 6,024`), lists discovered (`Y / 181`), and a **Stop & Save Partial** or **Complete Sync** control.

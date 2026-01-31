# LessBoardGames

A tool for thoughtfully reducing a board game collection through structured self-interview.

## Goal

Help user `terwox` reduce their BGG collection from 453 → 400 base games by forcing articulation of why each game deserves shelf space.

## Philosophy

- **Neutral, not judgmental.** Present facts. Ask one question: "Why are you keeping this?"
- **No leading questions, no suggestions, no "are you sure?"** — the user's own inability to articulate a good reason is the intervention.
- **Write-back to BGG is MVP** — decisions must persist in the canonical source.

## Tech Stack

- **Frontend:** Svelte
- **Persistence:** Local JSON (for session state, queue progress)
- **External:** BGG XML API2 for reads, BGG collection API for writes
- **Runs locally** — no deployment needed

## BGG API Notes

### API Token (Required)

BGG now requires a Bearer token for all XML API requests ("the XMLAPIcalypse").

1. Register your app at <https://boardgamegeek.com/applications>
2. Wait for approval (may take a week+)
3. Get your token from the applications dashboard
4. Create `.env` with `BGG_API_TOKEN=your-token-here`

### Reading Collection
```
GET https://boardgamegeek.com/xmlapi2/collection?username=terwox&own=1&stats=1
Authorization: Bearer <token>
```
Returns XML with: game name, BGG ID, year, play count, last played, user rating, date added (numplays, lastmodified, rating, etc.)

Note: BGG API is slow and may return 202 "please wait" — implement retry with backoff.

### Writing to BGG (MVP requirement)
BGG doesn't have a clean write API. To update collection item comments:

1. **Authenticate:** POST to `https://boardgamegeek.com/login/api/v1` with credentials
2. **Update collection item:** POST to `https://boardgamegeek.com/api/collectionitems` with item updates

### Credential Storage
Store BGG credentials in encrypted local storage:
- Prompt for username/password on first run
- Encrypt with a local key (use Web Crypto API or similar)
- Persist encrypted credentials locally
- Decrypt and use for session auth
- Provide UI to clear stored credentials

### Write-Back Queue (Robust)
BGG's API is flaky. Implement a persistent retry queue:

1. **On decision submit:**
   - Write decision to local `/data/pending-writes/` as JSON file (one per game)
   - Attempt BGG API write immediately
   - If success: move file to `/data/completed-writes/`
   - If failure: leave in pending, log error

2. **Retry logic:**
   - On app startup, check `/data/pending-writes/` for any queued writes
   - Before retrying, fetch current BGG comment for that game
   - Check if our write already exists (search for our timestamp/format)
   - If already present: move to completed (we succeeded previously but didn't know)
   - If not present: attempt write again
   - Retry interval: 24 hours minimum between attempts (to avoid duplicate prepends if API says "failed" but actually succeeded)

3. **UI feedback:**
   - Show count of pending writes: "3 decisions waiting to sync to BGG"
   - Manual "retry now" button
   - Status per game: synced ✓ / pending ⏳ / failed ✗

No manual fallback. The queue handles it.

## Data Model

### Game (from BGG)
```
{
  bggId: number,
  name: string,
  yearPublished: number,
  thumbnailUrl: string,
  dateAdded: date,        // when added to collection
  playCount: number,
  lastPlayed: date | null,
  userRating: number | null,
  // optional context
  weight: number,
  playerCount: { min: number, max: number },
  bggRating: number
}
```

### Decision (local + write to BGG)
```
{
  bggId: number,
  status: "keep" | "remove",
  reasoning: string,      // min 3 chars if keeping
  notes: string,          // optional freeform
  decidedAt: timestamp
}
```

## UI Flow

### 1. Setup Screen
- Fetch collection from BGG (show loading, handle 202 retry)
- Display: "Found X games. Goal: reach 400. You need to remove at least Y."
- Button: "Start Interview"

### 2. Interview Screen (core loop)
**Display:**
- Game thumbnail
- Game name (year)
- "Owned: X years"
- "Played: Y times"
- "Last played: [date]" (or "Never played")
- "Your rating: Z" (or "Unrated")

**Prompt:** "Why are you keeping this?"

**Response options:**
- Radio button: "I'm not keeping it" → sets status to "remove"
- Text field: freeform reasoning (min 3 characters) → sets status to "keep" with reasoning

**Notes:** Optional textarea, no minimum, for edge cases ("at parents' house", "waiting for new edition", etc.)

**Submit button:** Disabled until valid response. On submit:
1. Save decision to local JSON
2. Write comment to BGG (async, show error if fails but don't block)
3. Advance to next game

**Progress bar:** "X reviewed | Y removing | Z to go until 400"

### 3. Review Screen
- List all decisions made this session
- Filter by keep/remove
- Edit capability (re-interview a game)
- Export summary

## Interview Queue Logic

**Default sort:** Games most likely to be easy cuts first
1. Unplayed games, oldest first
2. Played but not in 3+ years, lowest-rated first
3. Everything else by last-played ascending

User can shuffle or re-sort if desired.

## BGG Comment Format

When writing back to BGG, prepend to existing comment (don't overwrite):

```
[LessBoardGames 2026-01-30] KEEP: "It's my favorite 2p game with my partner"
```

or

```
[LessBoardGames 2026-01-30] REMOVE - queued for sale/gift
```

## MVP Scope

1. ✅ Fetch collection from BGG
2. ✅ Interview UI with facts + single question
3. ✅ Local JSON persistence
4. ✅ Encrypted credential storage
5. ✅ BGG comment write-back with persistent retry queue
6. ✅ Progress tracking

## Stretch Goals (post-MVP)

- Comparative prompts ("You have N games at this weight. Rank them.")
- "Games like this one you rated higher" suggestions
- Bulk export for marketplace listing
- Undo/re-interview
- Filter by player count, weight, category

## Running Locally

```bash
npm install
npm run dev
```

Opens at localhost:5173 (or whatever Vite assigns).

## File Structure

```
/src
  /lib
    bgg-api.ts        # BGG fetch + auth + write
    credentials.ts    # Encrypted credential storage
    write-queue.ts    # Persistent retry queue logic
    store.ts          # Svelte stores for state
    types.ts          # TypeScript interfaces
  /components
    GameCard.svelte   # Display game info
    InterviewForm.svelte
    ProgressBar.svelte
    SyncStatus.svelte # Pending/completed write status
  /routes
    +page.svelte      # Main app
  app.css
/data
  decisions.json      # Local persistence
  credentials.enc     # Encrypted BGG credentials
  /pending-writes     # Queued BGG writes (one JSON per game)
  /completed-writes   # Successfully synced writes (receipts)
```

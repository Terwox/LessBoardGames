# Shelf Heatmap — Feature Spec

**Goal:** Upload photos of your game shelves organized by zone, identify/link visible games to BGG entries, draw bounding boxes (grouping base games with co-located expansions), and color each box by a logarithmic recency gradient showing how long since last played.

**Why:** Physical board game organization by purpose/frequency zone. The heatmap is a reorganization decision tool — a bright red box on the "on deck" shelf screams "why haven't I played this in 4 years?" and a green box in the backlog says "bring this forward."

### Zones (from Alice's Logseq journal, 2026-03-21)

| Zone | Location | Purpose | Expected heat |
|------|----------|---------|---------------|
| **Outgoing** | Front door | Free / trade / sell | Any (leaving) |
| **Grab & Go** | Small shelves | Guests, take to events | Green–yellow |
| **On Deck** | Primary shelves | Want to play soon | Green–yellow |
| **Backlog** | Office | Sometimes games | Yellow–orange |
| **Big Box** | Bedroom | KDM, Nemesis, etc. | Any (stored) |

## Overview

Three workflows, one new page (`/shelf`):

1. **Detect** — Upload shelf photo per zone, AI-identify visible games
2. **Audit** — Link detected games to BGG collection entries; correct misidentifications
3. **Render** — Overlay bounding boxes on photos, colored by play recency; flag zone mismatches

---

## 1. Data Model

### New types (`src/lib/types.ts`)

```typescript
type ShelfZone = 'outgoing' | 'grab-and-go' | 'on-deck' | 'backlog' | 'big-box' | 'other';

interface ShelfPhoto {
  id: string;             // nanoid
  filename: string;       // original filename
  path: string;           // server storage path (static/shelves/)
  uploadedAt: string;     // ISO 8601
  width: number;          // intrinsic image width (px)
  height: number;         // intrinsic image height (px)
  zone: ShelfZone;        // which organizational zone this photo represents
  label: string;          // user-friendly name ("Primary shelf", "Office wire rack")
}

interface ShelfGame {
  id: string;             // nanoid
  photoId: string;        // FK → ShelfPhoto.id
  detectedName: string;   // what AI or user typed
  bggId: number | null;   // null = not yet linked to collection
  // Bounding box as % of image dimensions (resolution-independent)
  box: {
    x: number;            // left edge, 0–100
    y: number;            // top edge, 0–100
    w: number;            // width, 0–100
    h: number;            // height, 0–100
  };
  // Expansion grouping: when a base game and its expansions share
  // physical shelf space, one box covers the group.
  // `bggId` is the base game; grouped expansion IDs go here.
  groupedExpansionBggIds: number[];
  status: 'detected' | 'linked' | 'unmatched';
}
```

### Persistence

Same pattern as existing `persistence.ts` — JSON files on disk:
- `data/shelf-photos.json` → `ShelfPhoto[]`
- `data/shelf-games.json` → `ShelfGame[]`

---

## 2. Phase 1 — Detection

### Upload

- Drag-and-drop or file picker on `/shelf`
- Server endpoint `POST /api/shelf/upload` saves to `static/shelves/{id}.jpg`
- Returns the `ShelfPhoto` record

### AI Identification

**Not** real-time object detection — one-shot vision API call.

- Server endpoint `POST /api/shelf/detect` accepts `{ photoId: string }`
- Sends the image to a vision model (Claude, GPT-4V, or Qwen3-VL) with prompt:

  > List every board game box visible in this image. For each, provide:
  > - `name`: the game title
  > - `region`: approximate location as `{x, y, w, h}` percentages of image dimensions (top-left origin)
  >
  > Group a base game with any expansions sitting directly next to it as a single entry.
  > Return JSON array.

- Response parsed into `ShelfGame[]` records with `status: 'detected'`
- **Trade-off:** Vision models give approximate regions, not pixel-perfect boxes. This is fine — the user adjusts in the audit step. Giving up precision for zero-annotation first pass.

### Manual Fallback

If AI detection is unavailable or wrong, the user can:
1. Click "Add Game" → draw a box on the image (canvas drag)
2. Type the game name
3. System fuzzy-matches against BGG collection

---

## 3. Phase 2 — Audit & Linking

### UI: Audit Screen

Split view:
- **Left:** Shelf photo with semi-transparent overlaid boxes (draggable/resizable)
- **Right:** Audit list — each detected game showing:
  - Detected name
  - Linked BGG entry (thumbnail + name) or "Unmatched"
  - Confidence indicator
  - Action buttons: Link / Re-link / Delete / Mark as group

### Linking Flow

For each detected game:
1. Auto-match: fuzzy search `detectedName` against `games[].name` from BGG collection
2. If match score > threshold → auto-link, status = `'linked'`
3. If ambiguous → show top 3 candidates, user picks one
4. If no match → mark `'unmatched'` (game exists on shelf but not in BGG collection — possibly traded/not logged)

### Box Adjustment

Canvas-based interaction on the photo:
- **Drag** existing box to reposition
- **Resize** handles on corners/edges
- **Draw** new box (click-drag)
- **Delete** box (right-click or button)
- **Merge** two boxes (select both → "Group as base+expansion")

When merging: the resulting box uses the base game's `bggId` and adds the expansion's `bggId` to `groupedExpansionBggIds`. The box dimensions become the union bounding rectangle.

### Bidirectional Audit Report

After linking, show two lists:
- **On shelf but not in BGG collection:** games detected but unmatched (maybe you own them but haven't logged them, or the AI hallucinated)
- **In BGG collection but not on shelf:** owned games not visible (maybe in a closet, at a friend's, or on a different shelf)

This is informational, not blocking.

---

## 4. Phase 3 — Heatmap Rendering

### Logarithmic Recency Gradient

Alice's insight: 5 years and 10 years feel equivalently stale, but 5 months and 3 years feel very different — even though the absolute gap is smaller. Logarithmic compression handles this naturally.

```typescript
function recencyColor(lastPlayed: string | null, playCount: number): string {
  // Never played = worst case
  if (playCount === 0 || !lastPlayed) {
    return 'hsl(0, 85%, 45%)';  // deep red
  }

  const MS_PER_DAY = 86_400_000;
  const daysSince = (Date.now() - new Date(lastPlayed).getTime()) / MS_PER_DAY;

  // log₁₀ scale examples:
  //   Today:     log₁₀(1)    = 0.00  → pure green
  //   1 week:    log₁₀(8)    = 0.90
  //   1 month:   log₁₀(31)   = 1.49
  //   6 months:  log₁₀(181)  = 2.26
  //   1 year:    log₁₀(366)  = 2.56
  //   3 years:   log₁₀(1096) = 3.04
  //   5 years:   log₁₀(1826) = 3.26
  //   10 years:  log₁₀(3651) = 3.56
  //
  // Ceiling at ~3.5 (≈8.6 years) — beyond this is "max stale"

  const score = Math.log10(daysSince + 1);
  const MAX_SCORE = 3.5;
  const t = Math.min(score / MAX_SCORE, 1.0);

  // HSL hue: 120° (green) → 60° (yellow) → 0° (red)
  const hue = 120 * (1 - t);
  return `hsl(${hue}, 80%, 50%)`;
}
```

**Why log₁₀ and not ln:** The numbers map more intuitively to mental anchors (1 month ≈ 1.5, 1 year ≈ 2.5, 5 years ≈ 3.25). Either works; log₁₀ just reads cleaner in the code and debug views.

### Visual example (today = 2026-03-21)

| Last Played       | Days | log₁₀  | Hue  | Color       |
|--------------------|------|--------|------|-------------|
| 2026-03-20 (1d)    | 1    | 0.30   | 110° | bright green |
| 2026-02-21 (1mo)   | 28   | 1.46   | 70°  | yellow-green |
| 2025-09-21 (6mo)   | 181  | 2.26   | 43°  | amber        |
| 2025-03-21 (1yr)   | 365  | 2.56   | 32°  | orange       |
| 2023-03-21 (3yr)   | 1096 | 3.04   | 16°  | deep orange  |
| 2021-03-21 (5yr)   | 1826 | 3.26   | 8°   | red-orange   |
| Never played       | ∞    | ∞      | 0°   | deep red     |

### Rendering

- CSS overlay on the `<img>` (or `<canvas>` for export)
- Each box: semi-transparent fill (30% opacity) + solid 2px border (full saturation)
- Game name label at top of box (white text, dark shadow for contrast)
- Hover tooltip: game name, last played date, play count, rating

### Grouped Boxes

When a box has `groupedExpansionBggIds`:
- Color is based on the **base game's** `lastPlayed`
- Label shows base game name with expansion count: "Cascadia (+1)"
- Tooltip lists all grouped games

### Legend

Horizontal gradient bar at the bottom:
```
 🟢 Today  →  🟡 6 months  →  🟠 1–3 years  →  🔴 5+ years / Never
```

### Zone Mismatch Detection

After heatmap render, flag games that seem like they're in the wrong zone:

| Situation | Flag |
|-----------|------|
| Red/orange game on **On Deck** or **Grab & Go** shelf | ⚠️ "Haven't played in 2+ years — move to Backlog or Outgoing?" |
| Green game in **Backlog** | 💡 "Played recently — promote to On Deck?" |
| Never-played game in **Grab & Go** | ⚠️ "Never played — confident it's guest-ready?" |
| Any game in **Outgoing** | ✅ No flag (it's leaving regardless) |

These show as badges on the box overlay and in a summary "Reorganization Suggestions" panel.

This is the actual value proposition — the heatmap isn't decorative, it's a reorganization decision engine. "Here's what your shelves look like. Here's what doesn't belong."

---

## 5. Route Structure

```
/shelf                         — main shelf view
  GET  /api/shelf/photos       — list photos
  POST /api/shelf/upload       — upload photo
  POST /api/shelf/detect       — AI detection
  GET  /api/shelf/games        — list ShelfGame records
  PUT  /api/shelf/games/:id    — update a ShelfGame (relink, move box, etc.)
  POST /api/shelf/games        — manually add a ShelfGame
  DELETE /api/shelf/games/:id  — remove a ShelfGame
```

---

## 6. Implementation Plan

| Phase | What | Effort |
|-------|------|--------|
| A | Data model + persistence + upload endpoint | Small |
| B | `/shelf` page with photo display + manual box drawing (canvas) | Medium |
| C | AI detection endpoint (vision API call) | Small |
| D | Audit UI: linking, fuzzy match, box adjustment | Medium-Large |
| E | Heatmap coloring + legend + tooltips | Small-Medium |
| F | Export: "Download heatmap" as annotated PNG/JPG | Small |

**Recommended order:** A → B → E → C → D → F

Start with manual box drawing + coloring (B+E) so you have a working heatmap quickly, then layer on AI detection (C) and the full audit flow (D). The AI can be swapped or improved without touching the core UX.

---

## 7. Open Questions

1. **Multiple shelf photos?** The spec supports it (photos are per-zone). v1 minimum: one photo of the primary shelves. Stretch: all five zones photographed, full-apartment board game heatmap.

2. **Re-detection after rearranging?** If you move games around, you'd re-upload and re-detect. Existing link mappings (bggId → box) could carry forward if you want a "re-detect keeping links" flow.

3. **Games not visible in photo?** Stacked games, games stored elsewhere. The audit report ("in BGG but not on shelf") handles this — it's informational context, not a problem to solve.

4. **Canvas library?** Could use:
   - Raw `<canvas>` + pointer events (lightweight, no deps)
   - Fabric.js (mature, good for drag/resize/draw)
   - Konva (React-focused but has vanilla option)
   
   Recommendation: raw `<canvas>` for v1 — this app has zero runtime deps currently, and the interaction set (draw rect, drag, resize) is simple enough.

5. **Vision model selection?** Claude (via Anthropic API) is already in the stack implicitly. Could also use Qwen3-VL (free via OpenRouter) for the detection call to avoid burning Claude tokens on a one-shot task.

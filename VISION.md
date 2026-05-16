# LessBoardGames Vision

## End State

LessBoardGames is a private, practical board-game collection tool for deciding what deserves shelf space. It combines BGG collection data, local play history, self-interview prompts, expansion/base-game linking, and shelf-photo heatmaps so Alice can cull, reorganize, and rediscover games with less friction.

The product should feel like a competent personal operations tool, not a public collection showcase.

## Emotional Core

The app should make collection decisions feel honest instead of guilty. It should surface the mismatch between aspiration, space, and actual play without shaming the user or turning the collection into a spreadsheet punishment chamber.

The best output is a clear decision: keep, sell, move forward, move back, log missing data, or revisit later.

## North Star Flows

### Collection Interview

Fetch the BGG collection, show one game at a time, ask why it deserves space, account for expansions, save decisions locally, and produce a reviewable cull list.

### Shelf Heatmap

Upload shelf photos by zone, identify visible games, link them to BGG records, draw or correct boxes, color by play recency, and flag zone mismatches.

### Audit Gap

Show what is in BGG but not visible on shelves, and what is visible on shelves but missing or unmatched in BGG.

## Design Pillars

### Actionable Over Comprehensive

The app should help make the next shelf decision. Completeness is useful only when it improves action.

### Human Correction Is First-Class

Vision models will miss, hallucinate, and localize poorly. Manual boxes, relinking, and status correction are not fallbacks; they are part of the product.

### Local And Private By Default

Credentials, shelf photos, cached collection data, decisions, and personal notes should stay local unless Alice explicitly chooses otherwise.

### Physical Space Matters

The app is about actual shelves, not just a collection database. Zone, box size, expansion grouping, and recency color should drive reorganization.

### Use Hybrid Vision

Detection/localization and identification are separate problems. Use detectors for boxes and VLMs or BGG matching for names; do not expect one model to do both reliably.

## Agent Decision Rules

- Preserve local persistence and privacy.
- Keep workflows dense, utilitarian, and quick to scan.
- Do not require perfect AI detection before the user can proceed manually.
- Treat expansions as part of base-game shelf footprint when physically co-located.
- Prefer deterministic BGG/cache parsing over ad hoc text handling.
- Add tests for matching, recency coloring, persistence, and API parsing when touched.

## Non-Goals

- Not a public social collection site.
- Not a replacement for BGG.
- Not a generic inventory system.
- Not a pure computer-vision demo.
- Not a dashboard where insight never turns into action.

## Morning Review Rubric

An overnight branch is worth keeping if it:

- Makes culling, shelf linking, or heatmap review faster and clearer.
- Handles AI uncertainty gracefully.
- Protects local data and credentials.
- Improves BGG/cache reliability.
- Does not add decorative UI at the expense of decision speed.


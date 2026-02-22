import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExpansionLink } from '$lib/types';
import type { Game } from '$lib/types';
import { BGG_API_BASE, cookieHeader, hasCookies } from './bgg-api';

const DATA_DIR = join(process.cwd(), 'data');
const CACHE_PATH = join(DATA_DIR, 'expansion-links.json');
const BATCH_SIZE = 15;
const DELAY_BETWEEN_BATCHES_MS = 2500;

// In-memory cache + background fetch state
let expansionCache: Record<number, ExpansionLink[]> = {};
let fetchInProgress = false;
let fetchedCount = 0;
let totalToFetch = 0;
let usedMethod: 'api' | 'name-match' | 'none' = 'none';

function ensureDir() {
	if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadCache(): Record<number, ExpansionLink[]> {
	try {
		if (existsSync(CACHE_PATH)) {
			const raw = readFileSync(CACHE_PATH, 'utf-8');
			expansionCache = JSON.parse(raw);
		}
	} catch {
		expansionCache = {};
	}
	return expansionCache;
}

function saveCache() {
	ensureDir();
	writeFileSync(CACHE_PATH, JSON.stringify(expansionCache, null, '\t'));
}

export function getCachedExpansions(): Record<number, ExpansionLink[]> {
	if (Object.keys(expansionCache).length === 0) {
		loadCache();
	}
	return expansionCache;
}

export function getFetchStatus() {
	return {
		inProgress: fetchInProgress,
		fetched: fetchedCount,
		total: totalToFetch,
		cached: Object.keys(expansionCache).length,
		method: usedMethod
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Name-prefix heuristic: if "Game: Subtitle" exists and "Game" (or "Game: Other") also
 * exists in the collection, flag it as a probable expansion.
 *
 * Handles common BGG naming patterns:
 *   "Pixel Tactics: Legends" → base "Pixel Tactics"
 *   "Dominion: Intrigue" → base "Dominion"
 *   "Carcassonne: Hunters and Gatherers" → base "Carcassonne"
 *
 * Also catches numbered entries like "EXIT: The Game – ..." by matching the prefix
 * to other games with the same prefix (shortest name wins as "base").
 */
export function analyzeByNamePrefix(games: Game[]): Record<number, ExpansionLink[]> {
	const result: Record<number, ExpansionLink[]> = {};

	// Build a map of normalized name → game for quick lookup
	// Also build prefix groups: "Base Name" → [games with that prefix]
	const nameToGame = new Map<string, Game>();
	const prefixGroups = new Map<string, Game[]>();

	for (const game of games) {
		nameToGame.set(game.name.toLowerCase(), game);

		// Extract prefix before first colon or dash separator
		const colonIdx = game.name.indexOf(':');
		const dashIdx = game.name.indexOf(' – '); // en-dash
		const hyphenIdx = game.name.indexOf(' - '); // regular hyphen

		const separators = [colonIdx, dashIdx, hyphenIdx].filter((i) => i > 0);
		if (separators.length === 0) continue;

		const splitAt = Math.min(...separators);
		const prefix = game.name.substring(0, splitAt).trim().toLowerCase();

		if (prefix.length < 3) continue; // Skip very short prefixes

		if (!prefixGroups.has(prefix)) {
			prefixGroups.set(prefix, []);
		}
		prefixGroups.get(prefix)!.push(game);
	}

	// For each prefix group, find the "base game" (shortest name, or exact prefix match)
	for (const [prefix, groupGames] of prefixGroups) {
		if (groupGames.length < 2) {
			// Only one game with this prefix — check if the bare prefix exists as a game
			const bareBase = nameToGame.get(prefix);
			if (bareBase && bareBase.bggId !== groupGames[0].bggId) {
				result[groupGames[0].bggId] = [{
					bggId: bareBase.bggId,
					name: bareBase.name
				}];
			}
			continue;
		}

		// Multiple games share a prefix — find the base
		// Priority: exact prefix name match > shortest name
		let baseGame: Game | undefined = undefined;

		// Check if bare prefix exists as its own game
		const bareBase = nameToGame.get(prefix);
		if (bareBase) {
			baseGame = bareBase;
		} else {
			// Shortest name in the group is likely the base
			const sorted = [...groupGames].sort((a, b) => a.name.length - b.name.length);
			baseGame = sorted[0];
		}

		if (!baseGame) continue;

		// Flag all others as expansions of the base
		for (const game of groupGames) {
			if (game.bggId === baseGame.bggId) continue;
			result[game.bggId] = [{
				bggId: baseGame.bggId,
				name: baseGame.name
			}];
		}
	}

	const expansionCount = Object.values(result).filter((v) => v.length > 0).length;
	console.log(`[Expansions] Name-prefix analysis: ${expansionCount} probable expansions found in ${games.length} games`);

	return result;
}

// ─── BGG API fetch (for when Bearer token becomes available) ───

function parseExpansionXml(xml: string): Record<number, ExpansionLink[]> {
	const result: Record<number, ExpansionLink[]> = {};

	const gameRegex = /<item\s+type="boardgame"\s+id="(\d+)">([\s\S]*?)<\/item>/g;
	let gameMatch;

	while ((gameMatch = gameRegex.exec(xml)) !== null) {
		const bggId = parseInt(gameMatch[1]);
		const gameInner = gameMatch[2];

		const linkRegex = /<link\s+type="boardgameexpansion"\s+id="(\d+)"\s+value="([^"]*)"/g;
		let linkMatch;
		const baseGames: ExpansionLink[] = [];

		while ((linkMatch = linkRegex.exec(gameInner)) !== null) {
			baseGames.push({
				bggId: parseInt(linkMatch[1]),
				name: linkMatch[2]
			});
		}

		result[bggId] = baseGames;
	}

	return result;
}

async function fetchBatchExpansions(ids: number[]): Promise<Record<number, ExpansionLink[]> | null> {
	const url = `${BGG_API_BASE}/thing?id=${ids.join(',')}`;
	const headers: Record<string, string> = {};
	if (hasCookies()) {
		headers['Cookie'] = cookieHeader();
	}

	const backoff = [2000, 4000, 8000];
	for (let attempt = 0; attempt <= backoff.length; attempt++) {
		const response = await fetch(url, { headers });

		if (response.status === 200) {
			const xml = await response.text();
			return parseExpansionXml(xml);
		}

		if (response.status === 401) {
			console.log(`[Expansions] 401 Unauthorized — /thing endpoint requires Bearer token.`);
			return null;
		}

		if (response.status === 202 && attempt < backoff.length) {
			await delay(backoff[attempt]);
			continue;
		}

		console.log(`[Expansions] Batch fetch failed: status=${response.status} for ${ids.length} IDs`);
		return {};
	}

	return {};
}

/**
 * Start expansion detection. Tries BGG API first (one test batch);
 * if that fails with 401, falls back to name-prefix heuristic.
 */
export function startBackgroundFetch(bggIds: number[], games?: Game[]) {
	if (fetchInProgress) return;

	loadCache();

	// If we already have cached data, skip
	const needed = bggIds.filter((id) => !(id in expansionCache));
	if (needed.length === 0) {
		console.log(`[Expansions] All ${bggIds.length} games already cached`);
		return;
	}

	fetchInProgress = true;
	fetchedCount = 0;
	totalToFetch = needed.length;

	console.log(`[Expansions] Starting: ${needed.length} games to check, ${bggIds.length - needed.length} cached`);

	(async () => {
		try {
			// Try one API batch first to see if it works
			const testBatch = needed.slice(0, Math.min(BATCH_SIZE, needed.length));
			const testResult = await fetchBatchExpansions(testBatch);

			if (testResult === null) {
				// API requires token — fall back to name-prefix heuristic
				console.log(`[Expansions] API unavailable, using name-prefix heuristic`);

				if (games && games.length > 0) {
					const nameMatches = analyzeByNamePrefix(games);
					// Merge into cache — mark all games as checked
					for (const id of bggIds) {
						expansionCache[id] = nameMatches[id] ?? [];
					}
					usedMethod = 'name-match';
				}

				fetchedCount = totalToFetch;
				saveCache();
				return;
			}

			// API works! Use it for real
			usedMethod = 'api';

			// Merge test batch results
			for (const [id, links] of Object.entries(testResult)) {
				expansionCache[parseInt(id)] = links;
			}
			fetchedCount = testBatch.length;
			saveCache();

			// Continue with remaining batches
			const remaining = needed.slice(BATCH_SIZE);
			for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
				const batch = remaining.slice(i, i + BATCH_SIZE);
				const links = await fetchBatchExpansions(batch);

				if (links === null) {
					console.log(`[Expansions] API stopped responding, partial results saved`);
					break;
				}

				for (const [id, expansionLinks] of Object.entries(links)) {
					expansionCache[parseInt(id)] = expansionLinks;
				}

				fetchedCount = BATCH_SIZE + Math.min(i + BATCH_SIZE, remaining.length);
				saveCache();

				const expansionCount = Object.values(links).filter((v) => v.length > 0).length;
				console.log(`[Expansions] Progress: ${fetchedCount}/${needed.length} (found ${expansionCount} expansions in batch)`);

				if (i + BATCH_SIZE < remaining.length) {
					await delay(DELAY_BETWEEN_BATCHES_MS);
				}
			}
		} catch (e) {
			console.log(`[Expansions] Error: ${e instanceof Error ? e.message : 'unknown'}`);
		} finally {
			fetchInProgress = false;
			saveCache();
			const totalExpansions = Object.values(expansionCache).filter((v) => v.length > 0).length;
			console.log(`[Expansions] Done (${usedMethod}). ${Object.keys(expansionCache).length} games checked, ${totalExpansions} are expansions`);
		}
	})();
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExpansionLink } from '$lib/types';
import { BGG_API_BASE, cookieHeader, hasCookies } from './bgg-api';

const DATA_DIR = join(process.cwd(), 'data');
const CACHE_PATH = join(DATA_DIR, 'expansion-links.json');
const BATCH_SIZE = 15; // BGG /thing supports comma-separated IDs
const DELAY_BETWEEN_BATCHES_MS = 2500;

// In-memory cache + background fetch state
let expansionCache: Record<number, ExpansionLink[]> = {};
let fetchInProgress = false;
let fetchedCount = 0;
let totalToFetch = 0;

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
		cached: Object.keys(expansionCache).length
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse expansion links from BGG /thing XML response.
 * A <link type="boardgameexpansion" ...> on an item means that item IS AN EXPANSION OF that linked game.
 * Returns a map of bggId -> array of base games it expands.
 */
function parseExpansionXml(xml: string): Record<number, ExpansionLink[]> {
	const result: Record<number, ExpansionLink[]> = {};

	// Match each top-level <item type="boardgame" id="...">
	const gameRegex = /<item\s+type="boardgame"\s+id="(\d+)">([\s\S]*?)<\/item>/g;
	let gameMatch;

	while ((gameMatch = gameRegex.exec(xml)) !== null) {
		const bggId = parseInt(gameMatch[1]);
		const gameInner = gameMatch[2];

		// Find all boardgameexpansion links — these indicate base games this item expands
		const linkRegex = /<link\s+type="boardgameexpansion"\s+id="(\d+)"\s+value="([^"]*)"/g;
		let linkMatch;
		const baseGames: ExpansionLink[] = [];

		while ((linkMatch = linkRegex.exec(gameInner)) !== null) {
			baseGames.push({
				bggId: parseInt(linkMatch[1]),
				name: linkMatch[2]
			});
		}

		// Store the result — empty array means "checked, not an expansion"
		result[bggId] = baseGames;
	}

	return result;
}

/**
 * Fetch expansion data for a batch of IDs from BGG /thing.
 * Handles 202 retry. Returns null on 401 (auth required, should stop all fetching).
 */
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
			console.log(`[Expansions] 401 Unauthorized — /thing endpoint requires Bearer token. Aborting.`);
			return null; // Signal to stop
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
 * Start a background fetch of expansion links for all given game IDs.
 * Non-blocking — runs in the background, updates cache incrementally.
 */
export function startBackgroundFetch(bggIds: number[]) {
	if (fetchInProgress) return;

	// Load cache, determine which IDs we still need
	loadCache();
	const needed = bggIds.filter((id) => !(id in expansionCache));

	if (needed.length === 0) {
		console.log(`[Expansions] All ${bggIds.length} games already cached`);
		return;
	}

	fetchInProgress = true;
	fetchedCount = 0;
	totalToFetch = needed.length;

	console.log(`[Expansions] Starting background fetch: ${needed.length} games to fetch, ${bggIds.length - needed.length} cached`);

	// Fire and forget — runs in background
	(async () => {
		try {
			for (let i = 0; i < needed.length; i += BATCH_SIZE) {
				const batch = needed.slice(i, i + BATCH_SIZE);
				const links = await fetchBatchExpansions(batch);

				// null = 401 auth failure, stop entirely
				if (links === null) {
					console.log(`[Expansions] Stopping — API requires Bearer token (not available via cookie auth)`);
					break;
				}

				// Merge into cache
				for (const [id, expansionLinks] of Object.entries(links)) {
					expansionCache[parseInt(id)] = expansionLinks;
				}

				fetchedCount = Math.min(i + BATCH_SIZE, needed.length);

				// Save incrementally every batch
				saveCache();

				const expansionCount = Object.values(links).filter((v) => v.length > 0).length;
				console.log(`[Expansions] Progress: ${fetchedCount}/${needed.length} (found ${expansionCount} expansions in batch of ${batch.length})`);

				if (i + BATCH_SIZE < needed.length) {
					await delay(DELAY_BETWEEN_BATCHES_MS);
				}
			}
		} catch (e) {
			console.log(`[Expansions] Background fetch error: ${e instanceof Error ? e.message : 'unknown'}`);
		} finally {
			fetchInProgress = false;
			saveCache();
			const totalExpansions = Object.values(expansionCache).filter((v) => v.length > 0).length;
			console.log(`[Expansions] Done. ${Object.keys(expansionCache).length} games checked, ${totalExpansions} are expansions`);
		}
	})();
}

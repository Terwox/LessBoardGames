import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { BoxDimensions } from '$lib/types';
import { BGG_API_BASE, cookieHeader, hasCookies } from './bgg-api';

const DATA_DIR = join(process.cwd(), 'data');
const CACHE_PATH = join(DATA_DIR, 'dimensions.json');
const BATCH_SIZE = 15; // BGG /thing supports comma-separated IDs
const DELAY_BETWEEN_BATCHES_MS = 2000;
const DEFAULT_VOLUME = 12 * 12 * 3; // ~432 cubic inches (standard box)

// In-memory cache + background fetch state
let dimensionCache: Record<number, BoxDimensions> = {};
let fetchInProgress = false;
let fetchedCount = 0;
let totalToFetch = 0;

function ensureDir() {
	if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadCache(): Record<number, BoxDimensions> {
	try {
		if (existsSync(CACHE_PATH)) {
			const raw = readFileSync(CACHE_PATH, 'utf-8');
			dimensionCache = JSON.parse(raw);
		}
	} catch {
		dimensionCache = {};
	}
	return dimensionCache;
}

function saveCache() {
	ensureDir();
	writeFileSync(CACHE_PATH, JSON.stringify(dimensionCache, null, '\t'));
}

export function getCachedDimensions(): Record<number, BoxDimensions> {
	if (Object.keys(dimensionCache).length === 0) {
		loadCache();
	}
	return dimensionCache;
}

export function getFetchStatus() {
	return {
		inProgress: fetchInProgress,
		fetched: fetchedCount,
		total: totalToFetch,
		cached: Object.keys(dimensionCache).length
	};
}

export function getDefaultVolume(): number {
	return DEFAULT_VOLUME;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse dimension data from BGG /thing?versions=1 XML response.
 * Returns a map of bggId -> BoxDimensions (first version with non-zero dims).
 */
function parseDimensionsXml(xml: string): Record<number, BoxDimensions> {
	const result: Record<number, BoxDimensions> = {};

	// Match each top-level <item type="boardgame" id="...">
	const gameRegex = /<item\s+type="boardgame"\s+id="(\d+)">([\s\S]*?)<\/item>/g;
	let gameMatch;

	while ((gameMatch = gameRegex.exec(xml)) !== null) {
		const bggId = parseInt(gameMatch[1]);
		const gameInner = gameMatch[2];

		// Find versions block
		const versionsMatch = gameInner.match(/<versions>([\s\S]*?)<\/versions>/);
		if (!versionsMatch) continue;

		// Match each version item
		const versionRegex = /<item\s+type="boardgameversion"[^>]*>([\s\S]*?)<\/item>/g;
		let versionMatch;

		while ((versionMatch = versionRegex.exec(versionsMatch[1])) !== null) {
			const vInner = versionMatch[1];
			const width = parseFloat(vInner.match(/<width\s+value="([^"]*)"/)?.[ 1] ?? '0');
			const length = parseFloat(vInner.match(/<length\s+value="([^"]*)"/)?.[ 1] ?? '0');
			const depth = parseFloat(vInner.match(/<depth\s+value="([^"]*)"/)?.[ 1] ?? '0');

			if (width > 0 && length > 0 && depth > 0) {
				result[bggId] = {
					width: Math.round(width * 100) / 100,
					length: Math.round(length * 100) / 100,
					depth: Math.round(depth * 100) / 100,
					volume: Math.round(width * length * depth * 100) / 100
				};
				break; // First version with real dims wins
			}
		}
	}

	return result;
}

/**
 * Fetch dimensions for a batch of IDs from BGG /thing?versions=1.
 * Handles 202 retry. Returns null on 401 (auth required, should stop all fetching).
 */
async function fetchBatchDimensions(ids: number[]): Promise<Record<number, BoxDimensions> | null> {
	const url = `${BGG_API_BASE}/thing?id=${ids.join(',')}&versions=1`;
	const headers: Record<string, string> = {};
	if (hasCookies()) {
		headers['Cookie'] = cookieHeader();
	}

	const backoff = [2000, 4000, 8000];
	for (let attempt = 0; attempt <= backoff.length; attempt++) {
		const response = await fetch(url, { headers });

		if (response.status === 200) {
			const xml = await response.text();
			return parseDimensionsXml(xml);
		}

		if (response.status === 401) {
			console.log(`[Dimensions] 401 Unauthorized — /thing endpoint requires Bearer token. Aborting.`);
			return null; // Signal to stop
		}

		if (response.status === 202 && attempt < backoff.length) {
			await delay(backoff[attempt]);
			continue;
		}

		console.log(`[Dimensions] Batch fetch failed: status=${response.status} for ${ids.length} IDs`);
		return {};
	}

	return {};
}

/**
 * Start a background fetch of dimensions for all given game IDs.
 * Non-blocking — runs in the background, updates cache incrementally.
 */
export function startBackgroundFetch(bggIds: number[]) {
	if (fetchInProgress) return;

	// Load cache, determine which IDs we still need
	loadCache();
	const needed = bggIds.filter((id) => !(id in dimensionCache));

	if (needed.length === 0) {
		console.log(`[Dimensions] All ${bggIds.length} games already cached`);
		return;
	}

	fetchInProgress = true;
	fetchedCount = 0;
	totalToFetch = needed.length;

	console.log(`[Dimensions] Starting background fetch: ${needed.length} games to fetch, ${bggIds.length - needed.length} cached`);

	// Fire and forget — runs in background
	(async () => {
		try {
			for (let i = 0; i < needed.length; i += BATCH_SIZE) {
				const batch = needed.slice(i, i + BATCH_SIZE);
				const dims = await fetchBatchDimensions(batch);

				// null = 401 auth failure, stop entirely
				if (dims === null) {
					console.log(`[Dimensions] Stopping — API requires Bearer token (not available via cookie auth)`);
					break;
				}

				// Merge into cache
				for (const [id, dim] of Object.entries(dims)) {
					dimensionCache[parseInt(id)] = dim;
				}

				fetchedCount = Math.min(i + BATCH_SIZE, needed.length);

				// Save incrementally every batch
				saveCache();

				console.log(`[Dimensions] Progress: ${fetchedCount}/${needed.length} (found dims for ${Object.keys(dims).length} of ${batch.length} in this batch)`);

				if (i + BATCH_SIZE < needed.length) {
					await delay(DELAY_BETWEEN_BATCHES_MS);
				}
			}
		} catch (e) {
			console.log(`[Dimensions] Background fetch error: ${e instanceof Error ? e.message : 'unknown'}`);
		} finally {
			fetchInProgress = false;
			saveCache();
			console.log(`[Dimensions] Done. ${Object.keys(dimensionCache).length} total games with dimensions cached`);
		}
	})();
}

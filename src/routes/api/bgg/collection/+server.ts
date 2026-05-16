import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCollectionOnce } from '$lib/server/bgg-api';
import { saveCollectionCache, loadCollectionCache } from '$lib/server/persistence';

export const GET: RequestHandler = async ({ url }) => {
	const username = url.searchParams.get('username');
	if (!username) {
		return json({ error: 'username parameter required' }, { status: 400 });
	}

	try {
		const result = await fetchCollectionOnce(username);

		if (result.status === 200 && result.games) {
			// Cache collection locally on every successful fetch
			try {
				await saveCollectionCache(result.games);
			} catch (cacheErr) {
				console.error('[Cache] Failed to write collection cache:', cacheErr);
				// Non-fatal — still return games to client
			}
			return json({ games: result.games });
		}

		if (result.status === 202) {
			return json({ message: 'BGG is processing your collection' }, { status: 202 });
		}

		// On auth failure or other errors, fall back to cached collection
		const cached = await loadCollectionCache();
		if (cached && cached.games.length > 0) {
			console.log(`[Cache] BGG returned ${result.status}, serving ${cached.games.length} cached games`);
			return json({ games: cached.games, cached: true });
		}

		return json({ error: result.error ?? 'Unknown error' }, { status: result.status });
	} catch (e) {
		// Network errors also fall back to cache
		const cached = await loadCollectionCache();
		if (cached && cached.games.length > 0) {
			console.log(`[Cache] BGG fetch failed, serving ${cached.games.length} cached games`);
			return json({ games: cached.games, cached: true });
		}
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ error: message }, { status: 502 });
	}
};

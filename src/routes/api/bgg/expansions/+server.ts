import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCachedExpansions, getFetchStatus, startBackgroundFetch } from '$lib/server/expansion-cache';

/** GET: Return cached expansion links + fetch status */
export const GET: RequestHandler = async () => {
	return json({
		expansions: getCachedExpansions(),
		status: getFetchStatus()
	});
};

/** POST: Start background expansion fetch for given game IDs */
export const POST: RequestHandler = async ({ request }) => {
	const { bggIds, games } = await request.json();
	if (!Array.isArray(bggIds) || bggIds.length === 0) {
		return json({ error: 'bggIds array required' }, { status: 400 });
	}

	startBackgroundFetch(bggIds, games);
	return json({ ok: true, status: getFetchStatus() });
};

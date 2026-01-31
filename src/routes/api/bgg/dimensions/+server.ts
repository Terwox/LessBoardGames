import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCachedDimensions, getFetchStatus, startBackgroundFetch, getDefaultVolume } from '$lib/server/dimension-cache';

/** GET: Return cached dimensions + fetch status */
export const GET: RequestHandler = async () => {
	return json({
		dimensions: getCachedDimensions(),
		status: getFetchStatus(),
		defaultVolume: getDefaultVolume()
	});
};

/** POST: Start background dimension fetch for given game IDs */
export const POST: RequestHandler = async ({ request }) => {
	const { bggIds } = await request.json();
	if (!Array.isArray(bggIds) || bggIds.length === 0) {
		return json({ error: 'bggIds array required' }, { status: 400 });
	}

	startBackgroundFetch(bggIds);
	return json({ ok: true, status: getFetchStatus() });
};

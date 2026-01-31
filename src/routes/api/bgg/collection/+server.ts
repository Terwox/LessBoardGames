import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCollectionOnce } from '$lib/server/bgg-api';

export const GET: RequestHandler = async ({ url }) => {
	const username = url.searchParams.get('username');
	if (!username) {
		return json({ error: 'username parameter required' }, { status: 400 });
	}

	try {
		const result = await fetchCollectionOnce(username);

		if (result.status === 200) {
			return json({ games: result.games });
		}

		if (result.status === 202) {
			return json({ message: 'BGG is processing your collection' }, { status: 202 });
		}

		return json({ error: result.error ?? 'Unknown error' }, { status: result.status });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ error: message }, { status: 502 });
	}
};

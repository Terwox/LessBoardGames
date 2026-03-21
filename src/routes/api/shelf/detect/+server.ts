import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ShelfGame } from '$lib/types';
import { detectGamesInPhoto } from '$lib/server/vision-detect';
import { saveShelfGame } from '$lib/server/shelf-persistence';

export const POST: RequestHandler = async ({ request }) => {
	const { photoId } = await request.json();

	if (!photoId) {
		return json({ error: 'Missing photoId' }, { status: 400 });
	}

	try {
		const detected = await detectGamesInPhoto(photoId);

		const games: ShelfGame[] = detected.map((d) => ({
			id: crypto.randomUUID(),
			photoId,
			detectedName: d.name,
			bggId: null,
			box: d.box,
			groupedExpansionBggIds: [],
			status: 'detected' as const
		}));

		for (const game of games) {
			await saveShelfGame(game);
		}

		return json({ games });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Detection failed';
		console.error('[detect]', message);
		return json({ error: message }, { status: 502 });
	}
};

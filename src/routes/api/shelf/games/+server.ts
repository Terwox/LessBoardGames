import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ShelfGame } from '$lib/types';
import { loadShelfGames, saveShelfGame } from '$lib/server/shelf-persistence';

export const GET: RequestHandler = async () => {
	const games = await loadShelfGames();
	return json({ games });
};

export const POST: RequestHandler = async ({ request }) => {
	const game: ShelfGame = await request.json();
	if (!game.id) {
		game.id = crypto.randomUUID();
	}
	await saveShelfGame(game);
	return json({ game }, { status: 201 });
};

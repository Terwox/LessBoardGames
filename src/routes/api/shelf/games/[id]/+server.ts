import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateShelfGame, deleteShelfGame } from '$lib/server/shelf-persistence';

export const PUT: RequestHandler = async ({ params, request }) => {
	const updates = await request.json();
	const game = await updateShelfGame(params.id, updates);
	if (!game) {
		return json({ error: 'Game not found' }, { status: 404 });
	}
	return json({ game });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteShelfGame(params.id);
	return json({ ok: true });
};

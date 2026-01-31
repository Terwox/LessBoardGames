import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteDecision } from '$lib/server/persistence';

export const DELETE: RequestHandler = async ({ params }) => {
	const bggId = parseInt(params.bggId);
	if (isNaN(bggId)) {
		return json({ error: 'Invalid bggId' }, { status: 400 });
	}
	await deleteDecision(bggId);
	return json({ ok: true });
};

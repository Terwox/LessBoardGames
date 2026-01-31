import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadDecisions, saveDecision } from '$lib/server/persistence';

export const GET: RequestHandler = async () => {
	const decisions = await loadDecisions();
	return json({ decisions });
};

export const POST: RequestHandler = async ({ request }) => {
	const decision = await request.json();
	await saveDecision(decision);
	return json({ ok: true });
};

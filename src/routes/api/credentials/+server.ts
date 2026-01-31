import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	saveCredentials,
	hasStoredCredentials,
	clearCredentials
} from '$lib/server/credentials';

export const GET: RequestHandler = async () => {
	const hasCredentials = await hasStoredCredentials();
	return json({ hasCredentials });
};

export const POST: RequestHandler = async ({ request }) => {
	const { username, password } = await request.json();
	if (!username || !password) {
		return json({ error: 'username and password required' }, { status: 400 });
	}
	await saveCredentials(username, password);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async () => {
	await clearCredentials();
	return json({ ok: true });
};

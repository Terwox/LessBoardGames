import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loginToBgg, isLoggedIn, logout } from '$lib/server/bgg-api';

export const POST: RequestHandler = async ({ request }) => {
	const { username, password } = await request.json();
	if (!username || !password) {
		return json({ error: 'username and password required' }, { status: 400 });
	}

	try {
		await loginToBgg(username, password);
		return json({ ok: true, loggedIn: true });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Login failed';
		return json({ error: message }, { status: 401 });
	}
};

export const GET: RequestHandler = async () => {
	return json({ loggedIn: isLoggedIn() });
};

export const DELETE: RequestHandler = async () => {
	logout();
	return json({ ok: true });
};

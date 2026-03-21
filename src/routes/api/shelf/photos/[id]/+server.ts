import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteShelfPhoto } from '$lib/server/shelf-persistence';

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteShelfPhoto(params.id);
	return json({ ok: true });
};

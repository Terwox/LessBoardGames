import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getShelfImagePath } from '$lib/server/shelf-persistence';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export const GET: RequestHandler = async ({ params }) => {
	const imgPath = getShelfImagePath(params.id);

	if (!existsSync(imgPath)) {
		error(404, 'Image not found');
	}

	const buffer = await readFile(imgPath);
	return new Response(buffer, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'public, max-age=86400'
		}
	});
};

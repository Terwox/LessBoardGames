import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ShelfPhoto } from '$lib/types';
import { loadShelfPhotos, saveShelfPhoto, saveShelfImage } from '$lib/server/shelf-persistence';

export const GET: RequestHandler = async () => {
	const photos = await loadShelfPhotos();
	return json({ photos });
};

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('image') as File | null;
	const zone = formData.get('zone') as string;
	const label = formData.get('label') as string;
	const width = Number(formData.get('width'));
	const height = Number(formData.get('height'));

	if (!file || !zone) {
		return json({ error: 'Missing image or zone' }, { status: 400 });
	}

	const id = crypto.randomUUID();
	const buffer = Buffer.from(await file.arrayBuffer());

	const photo: ShelfPhoto = {
		id,
		filename: file.name,
		uploadedAt: new Date().toISOString(),
		width,
		height,
		zone: zone as ShelfPhoto['zone'],
		label: label || file.name
	};

	await saveShelfImage(id, buffer);
	await saveShelfPhoto(photo);

	return json({ photo }, { status: 201 });
};

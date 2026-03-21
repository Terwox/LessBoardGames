import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ShelfPhoto, ShelfGame } from '$lib/types';

const DATA_DIR = path.resolve('data');
const SHELF_PHOTOS_FILE = path.join(DATA_DIR, 'shelf-photos.json');
const SHELF_GAMES_FILE = path.join(DATA_DIR, 'shelf-games.json');
const SHELF_IMAGES_DIR = path.join(DATA_DIR, 'shelf-images');

async function ensureShelfDirs(): Promise<void> {
	for (const dir of [DATA_DIR, SHELF_IMAGES_DIR]) {
		if (!existsSync(dir)) {
			await mkdir(dir, { recursive: true });
		}
	}
}

// --- Shelf Photos ---

export async function loadShelfPhotos(): Promise<ShelfPhoto[]> {
	await ensureShelfDirs();
	if (!existsSync(SHELF_PHOTOS_FILE)) return [];
	const raw = await readFile(SHELF_PHOTOS_FILE, 'utf-8');
	return JSON.parse(raw);
}

async function saveAllPhotos(photos: ShelfPhoto[]): Promise<void> {
	const tmp = SHELF_PHOTOS_FILE + '.tmp';
	await writeFile(tmp, JSON.stringify(photos, null, '\t'), 'utf-8');
	await rename(tmp, SHELF_PHOTOS_FILE);
}

export async function saveShelfPhoto(photo: ShelfPhoto): Promise<void> {
	await ensureShelfDirs();
	const photos = await loadShelfPhotos();
	const idx = photos.findIndex((p) => p.id === photo.id);
	if (idx >= 0) {
		photos[idx] = photo;
	} else {
		photos.push(photo);
	}
	await saveAllPhotos(photos);
}

export async function deleteShelfPhoto(id: string): Promise<void> {
	await ensureShelfDirs();
	const photos = await loadShelfPhotos();
	const photo = photos.find((p) => p.id === id);
	if (photo) {
		// Delete the image file
		const imgPath = getShelfImagePath(id);
		if (existsSync(imgPath)) {
			await unlink(imgPath);
		}
	}
	const filtered = photos.filter((p) => p.id !== id);
	await saveAllPhotos(filtered);

	// Also delete all games associated with this photo
	const games = await loadShelfGames();
	const filteredGames = games.filter((g) => g.photoId !== id);
	await saveAllGames(filteredGames);
}

// --- Shelf Images ---

export function getShelfImagePath(photoId: string): string {
	return path.join(SHELF_IMAGES_DIR, `${photoId}.jpg`);
}

export async function saveShelfImage(photoId: string, buffer: Buffer): Promise<void> {
	await ensureShelfDirs();
	const imgPath = getShelfImagePath(photoId);
	await writeFile(imgPath, buffer);
}

// --- Shelf Games ---

export async function loadShelfGames(): Promise<ShelfGame[]> {
	await ensureShelfDirs();
	if (!existsSync(SHELF_GAMES_FILE)) return [];
	const raw = await readFile(SHELF_GAMES_FILE, 'utf-8');
	return JSON.parse(raw);
}

async function saveAllGames(games: ShelfGame[]): Promise<void> {
	const tmp = SHELF_GAMES_FILE + '.tmp';
	await writeFile(tmp, JSON.stringify(games, null, '\t'), 'utf-8');
	await rename(tmp, SHELF_GAMES_FILE);
}

export async function saveShelfGame(game: ShelfGame): Promise<void> {
	await ensureShelfDirs();
	const games = await loadShelfGames();
	const idx = games.findIndex((g) => g.id === game.id);
	if (idx >= 0) {
		games[idx] = game;
	} else {
		games.push(game);
	}
	await saveAllGames(games);
}

export async function updateShelfGame(id: string, updates: Partial<ShelfGame>): Promise<ShelfGame | null> {
	await ensureShelfDirs();
	const games = await loadShelfGames();
	const idx = games.findIndex((g) => g.id === id);
	if (idx < 0) return null;
	games[idx] = { ...games[idx], ...updates };
	await saveAllGames(games);
	return games[idx];
}

export async function deleteShelfGame(id: string): Promise<void> {
	await ensureShelfDirs();
	const games = await loadShelfGames();
	const filtered = games.filter((g) => g.id !== id);
	await saveAllGames(filtered);
}

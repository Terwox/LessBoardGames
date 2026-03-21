import type { Game, ShelfPhoto, ShelfGame } from './types';

function createShelfState() {
	let photos = $state<ShelfPhoto[]>([]);
	let games = $state<ShelfGame[]>([]);
	let collectionGames = $state<Game[]>([]);
	let selectedPhotoId = $state<string | null>(null);
	let selectedGameId = $state<string | null>(null);
	let isUploading = $state(false);
	let isDetecting = $state(false);
	let error = $state<string | null>(null);

	const selectedPhoto = $derived(photos.find((p) => p.id === selectedPhotoId) ?? null);
	const gamesForSelectedPhoto = $derived(
		games.filter((g) => g.photoId === selectedPhotoId)
	);
	const linkedCount = $derived(games.filter((g) => g.status === 'linked').length);
	const detectedCount = $derived(games.filter((g) => g.status === 'detected').length);
	const unmatchedCount = $derived(games.filter((g) => g.status === 'unmatched').length);

	// Lookup: bggId → Game for quick access when coloring boxes
	const collectionByBggId = $derived(
		new Map(collectionGames.map((g) => [g.bggId, g]))
	);

	// Games in collection but not on any shelf photo
	const linkedBggIds = $derived(
		new Set(games.filter((g) => g.bggId !== null).map((g) => g.bggId!))
	);
	const gamesNotOnShelf = $derived(
		collectionGames.filter((g) => !linkedBggIds.has(g.bggId))
	);

	async function loadAll() {
		const [photosRes, gamesRes, collectionRes] = await Promise.all([
			fetch('/api/shelf/photos'),
			fetch('/api/shelf/games'),
			fetch('/api/bgg/collection?username=terwox')
		]);

		if (photosRes.ok) {
			const data = await photosRes.json();
			photos = data.photos;
		}
		if (gamesRes.ok) {
			const data = await gamesRes.json();
			games = data.games;
		}
		if (collectionRes.ok) {
			const data = await collectionRes.json();
			collectionGames = data.games ?? [];
		}
	}

	function selectPhoto(id: string | null) {
		selectedPhotoId = id;
		selectedGameId = null;
	}

	function addPhoto(photo: ShelfPhoto) {
		photos = [...photos, photo];
		selectedPhotoId = photo.id;
	}

	function removePhoto(id: string) {
		photos = photos.filter((p) => p.id !== id);
		games = games.filter((g) => g.photoId !== id);
		if (selectedPhotoId === id) {
			selectedPhotoId = photos[0]?.id ?? null;
		}
	}

	function addGame(game: ShelfGame) {
		games = [...games, game];
	}

	function addGames(newGames: ShelfGame[]) {
		games = [...games, ...newGames];
	}

	function updateGame(id: string, updates: Partial<ShelfGame>) {
		games = games.map((g) => (g.id === id ? { ...g, ...updates } : g));
	}

	function removeGame(id: string) {
		games = games.filter((g) => g.id !== id);
		if (selectedGameId === id) selectedGameId = null;
	}

	return {
		get photos() { return photos; },
		get games() { return games; },
		get collectionGames() { return collectionGames; },
		get selectedPhotoId() { return selectedPhotoId; },
		get selectedGameId() { return selectedGameId; },
		set selectedGameId(v) { selectedGameId = v; },
		get isUploading() { return isUploading; },
		set isUploading(v) { isUploading = v; },
		get isDetecting() { return isDetecting; },
		set isDetecting(v) { isDetecting = v; },
		get error() { return error; },
		set error(v) { error = v; },

		get selectedPhoto() { return selectedPhoto; },
		get gamesForSelectedPhoto() { return gamesForSelectedPhoto; },
		get linkedCount() { return linkedCount; },
		get detectedCount() { return detectedCount; },
		get unmatchedCount() { return unmatchedCount; },
		get collectionByBggId() { return collectionByBggId; },
		get gamesNotOnShelf() { return gamesNotOnShelf; },

		loadAll,
		selectPhoto,
		addPhoto,
		removePhoto,
		addGame,
		addGames,
		updateGame,
		removeGame
	};
}

export const shelfState = createShelfState();

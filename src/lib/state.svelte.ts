import type { Game, Decision, PendingWrite, SortMode, BoxDimensions, ExpansionLink } from './types';

const CUBIC_INCHES_PER_CUBIC_FOOT = 1728;

function createAppState() {
	let screen = $state<'setup' | 'interview' | 'review'>('setup');
	let games = $state<Game[]>([]);
	let decisions = $state<Decision[]>([]);
	let queue = $state<Game[]>([]);
	let currentIndex = $state(0);
	let pendingWrites = $state<PendingWrite[]>([]);
	let isLoading = $state(false);
	let loadingMessage = $state('');
	let error = $state<string | null>(null);
	let bggUsername = $state('');
	let loggedIn = $state(false);
	let dimensions = $state<Record<number, BoxDimensions>>({});
	let defaultVolume = $state(432); // 12x12x3 standard box
	let dimensionsFetching = $state(false);
	let dimensionsFetched = $state(0);
	let dimensionsTotal = $state(0);
	let expansionOf = $state<Record<number, ExpansionLink[]>>({});
	let expansionsFetching = $state(false);
	let expansionsFetched = $state(0);
	let expansionsTotal = $state(0);

	const currentGame = $derived(queue[currentIndex] ?? null);
	const reviewedCount = $derived(decisions.length);
	const removeCount = $derived(decisions.filter((d) => d.status === 'remove').length);
	const keepCount = $derived(decisions.filter((d) => d.status === 'keep').length);
	const skipCount = $derived(decisions.filter((d) => d.status === 'skip').length);
	const totalGames = $derived(games.length);
	const effectiveTotal = $derived(totalGames - skipCount); // Skipped games don't count
	const needToRemove = $derived(Math.max(0, effectiveTotal - 400));
	const remainingToGoal = $derived(Math.max(0, needToRemove - removeCount));
	const isGoalMet = $derived(removeCount >= needToRemove && needToRemove > 0);

	// Volume calculations
	const removeVolumeInches = $derived(
		decisions
			.filter((d) => d.status === 'remove')
			.reduce((sum, d) => sum + (dimensions[d.bggId]?.volume ?? defaultVolume), 0)
	);
	const removeVolumeCuFt = $derived(
		Math.round((removeVolumeInches / CUBIC_INCHES_PER_CUBIC_FOOT) * 10) / 10
	);
	const dimensionsCoverage = $derived(
		games.length > 0
			? Math.round((games.filter((g) => g.bggId in dimensions).length / games.length) * 100)
			: 0
	);
	const collectionBggIds = $derived(new Set(games.map((g) => g.bggId)));
	const recentCount = $derived(() => {
		const oneYearAgo = new Date();
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
		return games.filter((g) => g.dateAdded && new Date(g.dateAdded) >= oneYearAgo).length;
	});
	const expansionCount = $derived(
		games.filter((g) => {
			const links = expansionOf[g.bggId];
			return links && links.some((base) => collectionBggIds.has(base.bggId));
		}).length
	);

	function buildQueue(sortMode: SortMode = 'default') {
		const decided = new Set(decisions.map((d) => d.bggId));
		const undecided = games.filter((g) => !decided.has(g.bggId));

		if (sortMode === 'shuffle') {
			queue = shuffleArray(undecided);
		} else if (sortMode === 'alphabetical') {
			queue = [...undecided].sort((a, b) => a.name.localeCompare(b.name));
		} else if (sortMode === 'rating') {
			queue = [...undecided].sort((a, b) => (a.userRating ?? 0) - (b.userRating ?? 0));
		} else {
			queue = buildDefaultQueue(undecided);
		}
		currentIndex = 0;
	}

	function isExpansionInCollection(game: Game): boolean {
		const links = expansionOf[game.bggId];
		return !!links && links.some((base) => collectionBggIds.has(base.bggId));
	}

	function buildDefaultQueue(undecided: Game[]): Game[] {
		const threeYearsAgo = new Date();
		threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
		const oneYearAgo = new Date();
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

		// Filter out recent acquisitions (owned < 1 year) — they get a grace period
		const recentCutoff = undecided.filter((g) => {
			if (!g.dateAdded) return false; // no date = keep in queue
			return new Date(g.dateAdded) >= oneYearAgo;
		});
		const recentIds = new Set(recentCutoff.map((g) => g.bggId));
		const eligible = undecided.filter((g) => !recentIds.has(g.bggId));

		// Separate expansions (of owned base games) from standalone games
		const expansions = eligible
			.filter((g) => isExpansionInCollection(g))
			.sort((a, b) => a.name.localeCompare(b.name));
		const expansionIds = new Set(expansions.map((g) => g.bggId));
		const standalone = eligible.filter((g) => !expansionIds.has(g.bggId));

		// Tier 1: Never played, oldest owned first
		const neverPlayed = standalone
			.filter((g) => g.playCount === 0)
			.sort((a, b) => compareDates(a.dateAdded, b.dateAdded));

		const neverPlayedIds = new Set(neverPlayed.map((g) => g.bggId));

		// Tier 2: Played but not in 3+ years, lowest-rated first
		const stale = standalone
			.filter((g) => {
				if (neverPlayedIds.has(g.bggId)) return false;
				if (g.playCount === 0) return false;
				if (!g.lastPlayed) return true;
				return new Date(g.lastPlayed) < threeYearsAgo;
			})
			.sort((a, b) => (a.userRating ?? 0) - (b.userRating ?? 0));

		const staleIds = new Set(stale.map((g) => g.bggId));

		// Tier 3: Everything else by last-played ascending
		const rest = standalone
			.filter((g) => !neverPlayedIds.has(g.bggId) && !staleIds.has(g.bggId))
			.sort((a, b) => compareDates(a.lastPlayed, b.lastPlayed));

		// Tier 4: Expansions of owned base games, alphabetical
		return [...neverPlayed, ...stale, ...rest, ...expansions];
	}

	function compareDates(a: string | null, b: string | null): number {
		const aTime = a ? new Date(a).getTime() : 0;
		const bTime = b ? new Date(b).getTime() : 0;
		return aTime - bTime;
	}

	function shuffleArray<T>(arr: T[]): T[] {
		const shuffled = [...arr];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	function advanceToNext() {
		currentIndex++;
	}

	function goToGame(bggId: number) {
		const idx = queue.findIndex((g) => g.bggId === bggId);
		if (idx >= 0) currentIndex = idx;
	}

	return {
		get screen() { return screen; },
		set screen(v) { screen = v; },
		get games() { return games; },
		set games(v) { games = v; },
		get decisions() { return decisions; },
		set decisions(v) { decisions = v; },
		get queue() { return queue; },
		get currentIndex() { return currentIndex; },
		get pendingWrites() { return pendingWrites; },
		set pendingWrites(v) { pendingWrites = v; },
		get isLoading() { return isLoading; },
		set isLoading(v) { isLoading = v; },
		get loadingMessage() { return loadingMessage; },
		set loadingMessage(v) { loadingMessage = v; },
		get error() { return error; },
		set error(v) { error = v; },
		get bggUsername() { return bggUsername; },
		set bggUsername(v) { bggUsername = v; },
		get loggedIn() { return loggedIn; },
		set loggedIn(v) { loggedIn = v; },
		get dimensions() { return dimensions; },
		set dimensions(v) { dimensions = v; },
		get defaultVolume() { return defaultVolume; },
		set defaultVolume(v) { defaultVolume = v; },
		get dimensionsFetching() { return dimensionsFetching; },
		set dimensionsFetching(v) { dimensionsFetching = v; },
		get dimensionsFetched() { return dimensionsFetched; },
		set dimensionsFetched(v) { dimensionsFetched = v; },
		get dimensionsTotal() { return dimensionsTotal; },
		set dimensionsTotal(v) { dimensionsTotal = v; },
		get expansionOf() { return expansionOf; },
		set expansionOf(v) { expansionOf = v; },
		get expansionsFetching() { return expansionsFetching; },
		set expansionsFetching(v) { expansionsFetching = v; },
		get expansionsFetched() { return expansionsFetched; },
		set expansionsFetched(v) { expansionsFetched = v; },
		get expansionsTotal() { return expansionsTotal; },
		set expansionsTotal(v) { expansionsTotal = v; },

		get currentGame() { return currentGame; },
		get reviewedCount() { return reviewedCount; },
		get removeCount() { return removeCount; },
		get keepCount() { return keepCount; },
		get skipCount() { return skipCount; },
		get totalGames() { return totalGames; },
		get effectiveTotal() { return effectiveTotal; },
		get needToRemove() { return needToRemove; },
		get remainingToGoal() { return remainingToGoal; },
		get isGoalMet() { return isGoalMet; },
		get removeVolumeCuFt() { return removeVolumeCuFt; },
		get dimensionsCoverage() { return dimensionsCoverage; },
		get collectionBggIds() { return collectionBggIds; },
		get recentCount() { return recentCount(); },
		get expansionCount() { return expansionCount; },

		buildQueue,
		advanceToNext,
		goToGame
	};
}

export const appState = createAppState();

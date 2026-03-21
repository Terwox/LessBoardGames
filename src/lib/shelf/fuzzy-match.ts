import type { Game } from '$lib/types';

export interface MatchCandidate {
	game: Game;
	score: number; // 0-1, higher = better match
}

/**
 * Normalize a game name for matching: lowercase, strip edition markers,
 * remove punctuation, collapse whitespace.
 */
export function normalizeGameName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\b\d+(st|nd|rd|th)\s+edition\b/gi, '')
		.replace(/\(.*?edition.*?\)/gi, '')
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Tokenize a string into unique lowercase words.
 */
function tokenize(s: string): Set<string> {
	return new Set(normalizeGameName(s).split(' ').filter(Boolean));
}

/**
 * Jaccard similarity of word tokens: |intersection| / |union|
 */
export function tokenJaccard(a: string, b: string): number {
	const ta = tokenize(a);
	const tb = tokenize(b);
	if (ta.size === 0 && tb.size === 0) return 1;
	let intersection = 0;
	for (const t of ta) {
		if (tb.has(t)) intersection++;
	}
	const union = ta.size + tb.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/**
 * Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
	const an = normalizeGameName(a);
	const bn = normalizeGameName(b);
	if (an === bn) return 0;

	const m = an.length;
	const n = bn.length;
	const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
		Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				an[i - 1] === bn[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

/**
 * Find the best matches for a detected game name from the collection.
 * Returns candidates sorted by score (highest first).
 */
export function findBestMatches(
	detectedName: string,
	collection: Game[],
	topN: number = 3
): MatchCandidate[] {
	const candidates: MatchCandidate[] = collection.map((game) => {
		const jaccard = tokenJaccard(detectedName, game.name);

		// Normalize levenshtein to 0-1 score (1 = identical)
		const maxLen = Math.max(
			normalizeGameName(detectedName).length,
			normalizeGameName(game.name).length,
			1
		);
		const levDist = levenshtein(detectedName, game.name);
		const levScore = 1 - levDist / maxLen;

		// Weighted combination: Jaccard handles word-level matching (important for
		// multi-word titles), Levenshtein handles typos/minor differences
		const score = 0.6 * jaccard + 0.4 * Math.max(levScore, 0);

		return { game, score };
	});

	return candidates
		.sort((a, b) => b.score - a.score)
		.slice(0, topN);
}

/**
 * Auto-link threshold: above this score, auto-link without confirmation.
 */
export const AUTO_LINK_THRESHOLD = 0.7;

/**
 * Suggest threshold: between this and AUTO_LINK, show as suggestion.
 */
export const SUGGEST_THRESHOLD = 0.4;

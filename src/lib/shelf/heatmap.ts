import type { ShelfZone } from '$lib/types';

const MS_PER_DAY = 86_400_000;
const MAX_SCORE = 3.5;

/**
 * Returns an HSL color string based on play recency (logarithmic scale).
 * Green (120deg) = played today, Red (0deg) = 5+ years / never played.
 */
export function recencyColor(lastPlayed: string | null, playCount: number): string {
	if (playCount === 0 || !lastPlayed) {
		return 'hsl(0, 80%, 55%)'; // deep red — never played
	}

	const daysSince = (Date.now() - new Date(lastPlayed).getTime()) / MS_PER_DAY;
	const score = Math.min(Math.log10(daysSince + 1) / MAX_SCORE, 1.0);
	const hue = Math.round(120 * (1 - score));
	return `hsl(${hue}, 80%, 55%)`;
}

/**
 * Returns a 0-1 "staleness" score for sorting/filtering.
 * 0 = played today, 1 = 5+ years / never.
 */
export function recencyScore(lastPlayed: string | null, playCount: number): number {
	if (playCount === 0 || !lastPlayed) return 1;
	const daysSince = (Date.now() - new Date(lastPlayed).getTime()) / MS_PER_DAY;
	return Math.min(Math.log10(daysSince + 1) / MAX_SCORE, 1.0);
}

interface ZoneMismatchResult {
	suggestion: string;
}

/**
 * Check if a game seems misplaced in its zone based on play recency.
 * Returns null if no mismatch detected.
 */
export function zoneMismatch(
	zone: ShelfZone,
	lastPlayed: string | null,
	playCount: number
): ZoneMismatchResult | null {
	const score = recencyScore(lastPlayed, playCount);

	// Outgoing: no flags, it's leaving regardless
	if (zone === 'outgoing') return null;

	// "On Deck" / "Grab & Go": should be green-yellow (recently played)
	if (zone === 'on-deck' || zone === 'grab-and-go') {
		if (playCount === 0) {
			return { suggestion: 'Never played — confident it belongs here?' };
		}
		if (score > 0.7) { // roughly 2+ years
			return { suggestion: "Haven't played in 2+ years — move to Backlog or Outgoing?" };
		}
	}

	// Backlog: flag recently-played games that could be promoted
	if (zone === 'backlog') {
		if (score < 0.4) { // roughly within last 3 months
			return { suggestion: 'Played recently — promote to On Deck?' };
		}
	}

	// Big Box: flag never-played
	if (zone === 'big-box') {
		if (playCount === 0) {
			return { suggestion: 'Never played — still earning its shelf space?' };
		}
	}

	return null;
}

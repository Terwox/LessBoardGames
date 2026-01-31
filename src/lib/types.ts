export interface Game {
	bggId: number;
	collId: number;
	name: string;
	yearPublished: number;
	thumbnailUrl: string;
	imageUrl: string;
	dateAdded: string;
	playCount: number;
	lastPlayed: string | null;
	userRating: number | null;
	weight: number;
	playerCount: { min: number; max: number };
	bggRating: number;
	comment: string;
}

export interface Decision {
	bggId: number;
	collId: number;
	gameName: string;
	status: 'keep' | 'remove' | 'skip';
	reasoning: string;
	notes: string;
	decidedAt: string;
}

export interface PendingWrite {
	bggId: number;
	collId: number;
	gameName: string;
	decision: Decision;
	commentToWrite: string;
	existingComment: string;
	attempts: number;
	lastAttempt: string | null;
	status: 'pending' | 'synced' | 'failed';
	error: string | null;
}

export interface BoxDimensions {
	width: number;  // inches
	length: number; // inches
	depth: number;  // inches
	volume: number; // cubic inches (w * l * d)
}

export type SortMode = 'default' | 'shuffle' | 'alphabetical' | 'rating';

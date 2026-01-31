import type { Game } from '$lib/types';

export function parseCollectionXml(xml: string): Game[] {
	// Simple XML parser — BGG collection XML is well-structured enough
	// that we can extract what we need with regex rather than a full parser.
	const games: Game[] = [];

	// Match each <item> block — attributes can be in any order
	const itemRegex = /<item\s([^>]*?)>([\s\S]*?)<\/item>/g;
	let match;

	while ((match = itemRegex.exec(xml)) !== null) {
		const [, attrs, inner] = match;

		const subtype = extractAttr(attrs, 'subtype');
		if (subtype !== 'boardgame') continue;

		const objectId = extractAttr(attrs, 'objectid');
		const collId = extractAttr(attrs, 'collid');
		if (!objectId) continue;

		const name = extractText(inner, 'name') || 'Unknown';
		const yearPublished = parseInt(extractText(inner, 'yearpublished') || '0');
		const thumbnail = extractText(inner, 'thumbnail') || '';
		const image = extractText(inner, 'image') || '';
		const numplays = parseInt(extractText(inner, 'numplays') || '0');
		const comment = extractText(inner, 'comment') || '';

		// Status attributes
		const statusMatch = inner.match(/<status\s([^>]*?)\/?>/);
		const statusAttrs = statusMatch ? statusMatch[1] : '';
		const lastModified = extractAttr(statusAttrs, 'lastmodified') || '';

		// Stats attributes
		const statsMatch = inner.match(/<stats\s([^>]*?)>([\s\S]*?)<\/stats>/);
		const statsAttrs = statsMatch ? statsMatch[1] : '';
		const statsInner = statsMatch ? statsMatch[2] : '';

		const minPlayers = parseInt(extractAttr(statsAttrs, 'minplayers') || '1');
		const maxPlayers = parseInt(extractAttr(statsAttrs, 'maxplayers') || '1');

		// Rating (user's rating)
		const ratingMatch = statsInner.match(/<rating\s+value="([^"]*)"/);
		const userRatingRaw = ratingMatch ? ratingMatch[1] : '';
		const userRating = userRatingRaw && userRatingRaw !== 'N/A'
			? parseFloat(userRatingRaw)
			: null;

		// Bayesian average
		const bAvgMatch = statsInner.match(/<bayesaverage\s+value="([^"]*)"/);
		const bggRating = bAvgMatch ? parseFloat(bAvgMatch[1]) || 0 : 0;

		// Average weight
		const weightMatch = statsInner.match(/<averageweight\s+value="([^"]*)"/);
		const weight = weightMatch ? parseFloat(weightMatch[1]) || 0 : 0;

		games.push({
			bggId: parseInt(objectId),
			collId: parseInt(collId || '0'),
			name,
			yearPublished,
			thumbnailUrl: thumbnail,
			imageUrl: image,
			dateAdded: lastModified,
			playCount: numplays,
			lastPlayed: numplays > 0 ? lastModified : null,
			userRating: userRating !== null && !isNaN(userRating) ? userRating : null,
			weight,
			playerCount: { min: minPlayers, max: maxPlayers },
			bggRating,
			comment
		});
	}

	return games;
}

function extractText(xml: string, tag: string): string | null {
	// Handle both <tag>text</tag> and <tag sortindex="1">text</tag>
	const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
	const match = xml.match(regex);
	return match ? match[1].trim() : null;
}

function extractAttr(attrString: string, name: string): string | null {
	const regex = new RegExp(`${name}="([^"]*)"`);
	const match = attrString.match(regex);
	return match ? match[1] : null;
}

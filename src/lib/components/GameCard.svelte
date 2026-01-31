<script lang="ts">
	import type { Game } from '$lib/types';

	let { game }: { game: Game } = $props();

	const ownedYears = $derived(() => {
		if (!game.dateAdded) return null;
		const added = new Date(game.dateAdded);
		const now = new Date();
		const years = (now.getTime() - added.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
		return Math.round(years * 10) / 10;
	});

	const lastPlayedDisplay = $derived(() => {
		if (game.playCount === 0) return 'Never played';
		if (!game.lastPlayed) return 'Unknown';
		const d = new Date(game.lastPlayed);
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	});

	const ratingDisplay = $derived(() => {
		if (game.userRating === null) return 'Unrated';
		return game.userRating.toFixed(1);
	});
</script>

<div class="game-card">
	<div class="game-image">
		{#if game.thumbnailUrl}
			<img src={game.thumbnailUrl} alt={game.name} />
		{:else}
			<div class="no-image">No image</div>
		{/if}
	</div>
	<div class="game-info">
		<h2 class="game-name">
			<a href="https://boardgamegeek.com/boardgame/{game.bggId}" target="_blank" rel="noopener">{game.name}</a>
			<span class="year">({game.yearPublished})</span>
		</h2>
		<dl class="game-facts">
			{#if ownedYears() !== null}
				<div class="fact">
					<dt>Owned</dt>
					<dd>{ownedYears()} years</dd>
				</div>
			{/if}
			<div class="fact">
				<dt>Played</dt>
				<dd>{game.playCount} {game.playCount === 1 ? 'time' : 'times'}</dd>
			</div>
			<div class="fact">
				<dt>Last played</dt>
				<dd>{lastPlayedDisplay()}</dd>
			</div>
			<div class="fact">
				<dt>Your rating</dt>
				<dd class:unrated={game.userRating === null}>{ratingDisplay()}</dd>
			</div>
			{#if game.weight > 0}
				<div class="fact">
					<dt>Weight</dt>
					<dd>{game.weight.toFixed(1)} / 5</dd>
				</div>
			{/if}
			<div class="fact">
				<dt>Players</dt>
				<dd>{game.playerCount.min}–{game.playerCount.max}</dd>
			</div>
		</dl>
	</div>
</div>

<style>
	.game-card {
		display: flex;
		gap: 1.5rem;
		padding: 1.5rem;
		background: var(--surface, #fff);
		border: 1px solid var(--border, #e0e0e0);
		border-radius: 8px;
	}

	.game-image {
		flex-shrink: 0;
		width: 150px;
		height: 150px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.game-image img {
		max-width: 100%;
		max-height: 100%;
		border-radius: 4px;
	}

	.no-image {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f0f0f0;
		color: #999;
		border-radius: 4px;
		font-size: 0.85rem;
	}

	.game-info {
		flex: 1;
		min-width: 0;
	}

	.game-name {
		margin: 0 0 0.75rem;
		font-size: 1.4rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.game-name a {
		color: inherit;
		text-decoration: none;
	}

	.game-name a:hover {
		text-decoration: underline;
		color: #4a6fa5;
	}

	.year {
		font-weight: 400;
		color: #666;
	}

	.game-facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	.fact {
		display: flex;
		flex-direction: column;
	}

	dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin-bottom: 0.15rem;
	}

	dd {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.unrated {
		color: #999;
		font-style: italic;
	}
</style>

<script lang="ts">
	import { shelfState } from '$lib/shelf-state.svelte';
	import { zoneMismatch } from '$lib/shelf/heatmap';
	import type { ShelfGame } from '$lib/types';

	interface Mismatch {
		game: ShelfGame;
		gameName: string;
		zone: string;
		suggestion: string;
	}

	const mismatches = $derived(() => {
		const results: Mismatch[] = [];
		for (const game of shelfState.games) {
			if (game.status !== 'linked' || game.bggId === null) continue;
			const cg = shelfState.collectionByBggId.get(game.bggId);
			if (!cg) continue;

			const photo = shelfState.photos.find((p) => p.id === game.photoId);
			if (!photo) continue;

			const result = zoneMismatch(photo.zone, cg.lastPlayed, cg.playCount);
			if (result) {
				results.push({
					game,
					gameName: cg.name,
					zone: photo.zone,
					suggestion: result.suggestion
				});
			}
		}
		return results;
	});
</script>

{#if mismatches().length > 0}
	<div class="mismatches">
		<h3>Reorganization Suggestions ({mismatches().length})</h3>
		{#each mismatches() as m}
			<div class="mismatch-item">
				<div class="mismatch-header">
					<span class="mismatch-name">{m.gameName}</span>
					<span class="mismatch-zone">{m.zone}</span>
				</div>
				<p class="mismatch-suggestion">{m.suggestion}</p>
			</div>
		{/each}
	</div>
{/if}

<style>
	.mismatches {
		border-top: 1px solid #eee;
		padding-top: 0.5rem;
	}
	h3 {
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
		color: #c60;
	}
	.mismatch-item {
		padding: 0.3rem 0;
		border-bottom: 1px solid #f0f0f0;
	}
	.mismatch-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.mismatch-name {
		font-size: 0.8rem;
		font-weight: 500;
	}
	.mismatch-zone {
		font-size: 0.65rem;
		background: #eee;
		padding: 1px 4px;
		border-radius: 3px;
	}
	.mismatch-suggestion {
		font-size: 0.75rem;
		color: #666;
		margin: 0.15rem 0 0;
	}
</style>

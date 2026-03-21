<script lang="ts">
	import { onMount } from 'svelte';
	import { shelfState } from '$lib/shelf-state.svelte';
	import PhotoUploader from '$lib/components/shelf/PhotoUploader.svelte';
	import ShelfCanvas from '$lib/components/shelf/ShelfCanvas.svelte';
	import HeatmapLegend from '$lib/components/shelf/HeatmapLegend.svelte';
	import GameLinker from '$lib/components/shelf/GameLinker.svelte';
	import ZoneMismatches from '$lib/components/shelf/ZoneMismatches.svelte';
	import type { ShelfGame } from '$lib/types';

	onMount(() => {
		shelfState.loadAll();
	});

	async function handleCreate(e: { box: ShelfGame['box']; name: string }) {
		if (!shelfState.selectedPhotoId) return;

		const game: ShelfGame = {
			id: crypto.randomUUID(),
			photoId: shelfState.selectedPhotoId,
			detectedName: e.name || 'New game',
			bggId: null,
			box: e.box,
			groupedExpansionBggIds: [],
			status: 'detected'
		};

		const res = await fetch('/api/shelf/games', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(game)
		});
		if (res.ok) {
			const data = await res.json();
			shelfState.addGame(data.game);
		}
	}

	async function handleUpdate(id: string, box: ShelfGame['box']) {
		shelfState.updateGame(id, { box });
		await fetch(`/api/shelf/games/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ box })
		});
	}

	async function handleDelete(id: string) {
		shelfState.removeGame(id);
		await fetch(`/api/shelf/games/${id}`, { method: 'DELETE' });
	}

	function handleSelect(id: string | null) {
		shelfState.selectedGameId = id;
	}

	async function handleDetect() {
		if (!shelfState.selectedPhotoId) return;
		shelfState.isDetecting = true;
		shelfState.error = null;
		try {
			const res = await fetch('/api/shelf/detect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ photoId: shelfState.selectedPhotoId })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Detection failed');
			}
			const data = await res.json();
			shelfState.addGames(data.games);
		} catch (e) {
			shelfState.error = e instanceof Error ? e.message : 'Detection failed';
		} finally {
			shelfState.isDetecting = false;
		}
	}

	function exportSummary() {
		const lines: string[] = ['Shelf Heatmap Summary', `Generated: ${new Date().toISOString()}`, ''];

		const photosByZone = new Map<string, typeof shelfState.photos>();
		for (const photo of shelfState.photos) {
			const list = photosByZone.get(photo.zone) ?? [];
			list.push(photo);
			photosByZone.set(photo.zone, list);
		}

		for (const [zone, photos] of photosByZone) {
			lines.push(`== ${zone.toUpperCase()} ==`);
			for (const photo of photos) {
				lines.push(`  ${photo.label}`);
				const photoGames = shelfState.games.filter((g) => g.photoId === photo.id && g.status === 'linked');
				for (const g of photoGames) {
					const cg = shelfState.collectionByBggId.get(g.bggId!);
					if (cg) {
						const last = cg.lastPlayed ?? 'Never';
						lines.push(`    - ${cg.name} (plays: ${cg.playCount}, last: ${last})`);
					}
				}
			}
			lines.push('');
		}

		const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'shelf-heatmap-summary.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="shelf-page">
	<div class="sidebar-left">
		<h2>Photos</h2>
		<PhotoUploader />
	</div>

	<div class="main-canvas">
		{#if shelfState.selectedPhoto}
			<div class="canvas-header">
				<h2>{shelfState.selectedPhoto.label}</h2>
				<span class="zone-badge">{shelfState.selectedPhoto.zone}</span>
				<button class="detect-btn" onclick={handleDetect} disabled={shelfState.isDetecting}>
					{shelfState.isDetecting ? 'Detecting...' : 'Detect Games'}
				</button>
			</div>
			<ShelfCanvas
				photo={shelfState.selectedPhoto}
				boxes={shelfState.gamesForSelectedPhoto}
				collectionByBggId={shelfState.collectionByBggId}
				mode="draw"
				selectedGameId={shelfState.selectedGameId}
				oncreate={handleCreate}
				onupdate={handleUpdate}
				ondelete={handleDelete}
				onselect={handleSelect}
			/>
			<div class="canvas-footer">
				<HeatmapLegend />
				{#if shelfState.linkedCount > 0}
					<button class="export-btn" onclick={exportSummary}>Export summary</button>
				{/if}
			</div>
			<ZoneMismatches />
		{:else}
			<div class="empty-state">
				<p>Upload a shelf photo to get started.</p>
			</div>
		{/if}

		{#if shelfState.error}
			<div class="error">{shelfState.error}</div>
		{/if}
	</div>

	<div class="sidebar-right">
		<h2>Games ({shelfState.gamesForSelectedPhoto.length})</h2>
		{#if shelfState.gamesForSelectedPhoto.length === 0}
			<p class="hint">Draw boxes on the photo or use Detect Games.</p>
		{:else}
			<GameLinker />
		{/if}

		{#if shelfState.gamesNotOnShelf.length > 0 && shelfState.linkedCount > 0}
			<details class="audit-report">
				<summary>Not on shelf ({shelfState.gamesNotOnShelf.length})</summary>
				<p class="audit-hint">Games in your BGG collection not visible in any photo.</p>
				<ul class="audit-list">
					{#each shelfState.gamesNotOnShelf.slice(0, 20) as game}
						<li>{game.name}</li>
					{/each}
					{#if shelfState.gamesNotOnShelf.length > 20}
						<li class="more">...and {shelfState.gamesNotOnShelf.length - 20} more</li>
					{/if}
				</ul>
			</details>
		{/if}
	</div>
</div>

<style>
	.shelf-page {
		display: grid;
		grid-template-columns: 220px 1fr 220px;
		gap: 1rem;
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem;
		height: calc(100vh - 50px);
	}
	.sidebar-left, .sidebar-right {
		overflow-y: auto;
	}
	h2 {
		font-size: 0.95rem;
		margin: 0 0 0.5rem;
	}
	.main-canvas {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
	}
	.canvas-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.canvas-header h2 {
		margin: 0;
	}
	.zone-badge {
		background: #eee;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
		font-size: 0.7rem;
		color: #666;
	}
	.detect-btn {
		margin-left: auto;
		padding: 0.3rem 0.75rem;
		font-size: 0.8rem;
		background: #333;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	.detect-btn:disabled {
		background: #999;
		cursor: not-allowed;
	}
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 300px;
		color: #999;
	}
	.error {
		background: #fee;
		color: #c00;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.85rem;
	}
	.canvas-footer {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.export-btn {
		padding: 0.25rem 0.6rem;
		font-size: 0.75rem;
		background: none;
		border: 1px solid #ccc;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	.hint {
		color: #999;
		font-size: 0.8rem;
	}
	.audit-report {
		margin-top: 1rem;
		border-top: 1px solid #eee;
		padding-top: 0.5rem;
	}
	.audit-report summary {
		font-size: 0.8rem;
		cursor: pointer;
		color: #666;
	}
	.audit-hint {
		font-size: 0.7rem;
		color: #999;
		margin: 0.25rem 0;
	}
	.audit-list {
		font-size: 0.75rem;
		padding-left: 1.2rem;
		margin: 0;
	}
	.audit-list li { padding: 1px 0; }
	.audit-list .more { color: #999; font-style: italic; }
</style>

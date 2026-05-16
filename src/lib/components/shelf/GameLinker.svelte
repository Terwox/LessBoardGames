<script lang="ts">
	import type { ShelfGame, Game } from '$lib/types';
	import { shelfState } from '$lib/shelf-state.svelte';
	import { findBestMatches, AUTO_LINK_THRESHOLD, SUGGEST_THRESHOLD } from '$lib/shelf/fuzzy-match';

	let searchQuery = $state('');
	let searchResults = $state<Game[]>([]);
	let editingNameId = $state<string | null>(null);
	let editNameValue = $state('');
	let bggUrlInput = $state('');

	const unllinkedGames = $derived(
		shelfState.gamesForSelectedPhoto.filter((g) => g.status === 'detected')
	);

	function getMatches(game: ShelfGame) {
		return findBestMatches(game.detectedName, shelfState.collectionGames, 3);
	}

	async function linkGame(gameId: string, bggId: number) {
		shelfState.updateGame(gameId, { bggId, status: 'linked' });
		await fetch(`/api/shelf/games/${gameId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ bggId, status: 'linked' })
		});
	}

	async function markUnmatched(gameId: string) {
		shelfState.updateGame(gameId, { status: 'unmatched' });
		await fetch(`/api/shelf/games/${gameId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: 'unmatched' })
		});
	}

	async function unlinkGame(gameId: string) {
		shelfState.updateGame(gameId, { bggId: null, status: 'detected' });
		await fetch(`/api/shelf/games/${gameId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ bggId: null, status: 'detected' })
		});
	}

	async function autoLinkAll() {
		for (const game of unllinkedGames) {
			const matches = getMatches(game);
			if (matches.length > 0 && matches[0].score >= AUTO_LINK_THRESHOLD) {
				await linkGame(game.id, matches[0].game.bggId);
			}
		}
	}

	function startEditName(game: ShelfGame) {
		editingNameId = game.id;
		editNameValue = game.detectedName;
	}

	async function saveName(gameId: string) {
		const trimmed = editNameValue.trim();
		if (!trimmed) return;
		shelfState.updateGame(gameId, { detectedName: trimmed });
		await fetch(`/api/shelf/games/${gameId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ detectedName: trimmed })
		});
		editingNameId = null;
		editNameValue = '';
	}

	function parseBggId(input: string): number | null {
		const trimmed = input.trim();
		// Direct numeric ID
		if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
		// BGG URL: boardgamegeek.com/boardgame/12345/...
		const match = trimmed.match(/boardgamegeek\.com\/boardgame\/(\d+)/);
		return match ? parseInt(match[1], 10) : null;
	}

	async function linkByUrl(gameId: string) {
		const bggId = parseBggId(bggUrlInput);
		if (bggId === null) return;
		await linkGame(gameId, bggId);
		bggUrlInput = '';
	}

	function selectGame(gameId: string) {
		shelfState.selectedGameId = gameId;
	}

	function selectGameFromKeyboard(event: KeyboardEvent, gameId: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		selectGame(gameId);
	}

	function searchCollection(query: string) {
		if (!query.trim()) {
			searchResults = [];
			return;
		}
		const q = query.toLowerCase();
		searchResults = shelfState.collectionGames
			.filter((g) => g.name.toLowerCase().includes(q))
			.slice(0, 8);
	}

	$effect(() => {
		searchCollection(searchQuery);
	});

	// Track which game is being manually searched
	let manualSearchFor = $state<string | null>(null);
</script>

<div class="linker">
	{#if unllinkedGames.length > 0}
		<div class="actions">
			<button class="auto-link-btn" onclick={autoLinkAll}>
				Auto-link all ({unllinkedGames.length} unlinked)
			</button>
		</div>
	{/if}

	{#each shelfState.gamesForSelectedPhoto as game}
		<div
			class="link-card"
			class:selected={shelfState.selectedGameId === game.id}
			class:linked={game.status === 'linked'}
			class:unmatched={game.status === 'unmatched'}
			role="button"
			tabindex="0"
			onclick={() => selectGame(game.id)}
			onkeydown={(e) => selectGameFromKeyboard(e, game.id)}
		>
			<div class="card-header">
				{#if editingNameId === game.id}
					<input
						class="name-edit"
						type="text"
						bind:value={editNameValue}
						onkeydown={(e) => { if (e.key === 'Enter') saveName(game.id); if (e.key === 'Escape') editingNameId = null; }}
					/>
					<button class="name-save" onclick={() => saveName(game.id)}>✓</button>
				{:else}
					<strong ondblclick={() => startEditName(game)} title="Double-click to rename">{game.detectedName || '(unnamed)'}</strong>
					<button class="name-edit-btn" onclick={() => startEditName(game)} title="Edit name">✏️</button>
				{/if}
				<span class="status-badge">{game.status}</span>
			</div>

			{#if game.status === 'linked'}
				{@const cg = shelfState.collectionByBggId.get(game.bggId!)}
				{#if cg}
					<div class="linked-info">
						<img src={cg.thumbnailUrl} alt={cg.name} class="thumb" />
						<div>
							<div class="linked-name">{cg.name}</div>
							<div class="linked-meta">
								Plays: {cg.playCount} | Last: {cg.lastPlayed ?? 'Never'}
							</div>
						</div>
					</div>
				{/if}
				<button class="unlink-btn" onclick={() => unlinkGame(game.id)}>Unlink</button>

			{:else if game.status === 'detected'}
				{@const matches = getMatches(game)}
				<div class="candidates">
					{#each matches as match}
						{#if match.score >= SUGGEST_THRESHOLD}
							<button
								class="candidate"
								class:strong={match.score >= AUTO_LINK_THRESHOLD}
								onclick={() => linkGame(game.id, match.game.bggId)}
							>
								<img src={match.game.thumbnailUrl} alt={match.game.name} class="thumb-sm" />
								<span class="candidate-name">{match.game.name}</span>
								<span class="candidate-score">{Math.round(match.score * 100)}%</span>
							</button>
						{/if}
					{/each}
				</div>

				<div class="bgg-url-input">
					<input
						type="text"
						bind:value={bggUrlInput}
						placeholder="BGG ID or URL..."
						onkeydown={(e) => { if (e.key === 'Enter') linkByUrl(game.id); }}
						onfocus={() => bggUrlInput = ''}
					/>
					<button onclick={() => linkByUrl(game.id)} disabled={!parseBggId(bggUrlInput)}>Link</button>
				</div>

				{#if manualSearchFor === game.id}
					<div class="manual-search">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search collection..."
						/>
						{#each searchResults as result}
							<button class="search-result" onclick={() => { linkGame(game.id, result.bggId); manualSearchFor = null; searchQuery = ''; }}>
								<img src={result.thumbnailUrl} alt={result.name} class="thumb-sm" />
								{result.name}
							</button>
						{/each}
					</div>
				{:else}
					<div class="card-actions">
						<button onclick={() => { manualSearchFor = game.id; searchQuery = ''; }}>Search</button>
						<button onclick={() => markUnmatched(game.id)}>Not in collection</button>
					</div>
				{/if}

			{:else}
				<!-- unmatched -->
				<div class="card-actions">
					<button onclick={() => { manualSearchFor = game.id; shelfState.updateGame(game.id, { status: 'detected' }); searchQuery = ''; }}>Try linking</button>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.linker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.actions {
		margin-bottom: 0.25rem;
	}
	.auto-link-btn {
		width: 100%;
		padding: 0.3rem;
		font-size: 0.75rem;
		background: #333;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	.link-card {
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		padding: 0.4rem;
		font-size: 0.8rem;
	}
	.link-card.selected { border-color: #333; }
	.link-card.linked { border-left: 3px solid #3a3; }
	.link-card.unmatched { border-left: 3px solid #c60; }
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}
	.card-header strong {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.status-badge {
		font-size: 0.6rem;
		padding: 1px 4px;
		border-radius: 3px;
		background: #eee;
		color: #666;
		flex-shrink: 0;
	}
	.linked-info {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.25rem;
	}
	.thumb {
		width: 36px;
		height: 36px;
		object-fit: cover;
		border-radius: 3px;
	}
	.linked-name { font-weight: 500; font-size: 0.75rem; }
	.linked-meta { font-size: 0.65rem; color: #888; }
	.unlink-btn {
		font-size: 0.65rem;
		padding: 1px 6px;
		cursor: pointer;
		background: none;
		border: 1px solid #ccc;
		border-radius: 3px;
	}
	.candidates {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 0.25rem;
	}
	.candidate {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem;
		border: 1px solid #e0e0e0;
		border-radius: 3px;
		background: none;
		cursor: pointer;
		text-align: left;
		font-size: 0.75rem;
	}
	.candidate:hover { background: #f0f0f0; }
	.candidate.strong { border-color: #3a3; }
	.thumb-sm {
		width: 24px;
		height: 24px;
		object-fit: cover;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.candidate-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.candidate-score {
		color: #888;
		font-size: 0.65rem;
		flex-shrink: 0;
	}
	.card-actions {
		display: flex;
		gap: 0.25rem;
	}
	.card-actions button {
		flex: 1;
		font-size: 0.7rem;
		padding: 0.2rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 3px;
		background: none;
	}
	.manual-search {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.manual-search input {
		width: 100%;
		font-size: 0.75rem;
		padding: 0.2rem 0.3rem;
		box-sizing: border-box;
	}
	.search-result {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem;
		border: none;
		background: #f8f8f8;
		cursor: pointer;
		text-align: left;
		font-size: 0.75rem;
		border-radius: 2px;
	}
	.search-result:hover { background: #eee; }
	.name-edit {
		flex: 1;
		font-size: 0.8rem;
		font-weight: bold;
		padding: 1px 4px;
		border: 1px solid #4488ff;
		border-radius: 3px;
		min-width: 0;
	}
	.name-save {
		padding: 0 4px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.name-edit-btn {
		padding: 0 2px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.65rem;
		opacity: 0.4;
		flex-shrink: 0;
	}
	.name-edit-btn:hover { opacity: 1; }
	.link-card:hover .name-edit-btn { opacity: 0.7; }
	.bgg-url-input {
		display: flex;
		gap: 2px;
		margin-bottom: 0.25rem;
	}
	.bgg-url-input input {
		flex: 1;
		font-size: 0.7rem;
		padding: 2px 4px;
		min-width: 0;
	}
	.bgg-url-input button {
		font-size: 0.65rem;
		padding: 1px 6px;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 3px;
		background: none;
		flex-shrink: 0;
	}
	.bgg-url-input button:disabled { opacity: 0.3; cursor: not-allowed; }
</style>

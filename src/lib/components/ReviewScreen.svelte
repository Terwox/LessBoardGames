<script lang="ts">
	import { appState } from '$lib/state.svelte';
	import type { Decision } from '$lib/types';

	let filter = $state<'all' | 'keep' | 'remove' | 'skip'>('all');

	const filtered = $derived(
		filter === 'all'
			? appState.decisions
			: appState.decisions.filter((d) => d.status === filter)
	);

	function goBack() {
		appState.screen = 'interview';
	}

	function reviseDecision(decision: Decision) {
		// Navigate to that game in the interview queue, removing the old decision
		// so the game reappears for re-evaluation
		appState.decisions = appState.decisions.filter((d) => d.bggId !== decision.bggId);
		appState.buildQueue();
		appState.goToGame(decision.bggId);
		appState.screen = 'interview';

		// Persist the removal
		fetch(`/api/decisions/${decision.bggId}`, { method: 'DELETE' }).catch(() => {});
	}

	function exportSummary() {
		const lines = appState.decisions.map((d) => {
			const status = d.status === 'keep' ? 'KEEP' : d.status === 'skip' ? 'SKIP' : 'REMOVE';
			const reason = d.status === 'keep' ? `: "${d.reasoning}"` : '';
			const notes = d.notes ? ` [${d.notes}]` : '';
			return `${status} - ${d.gameName}${reason}${notes}`;
		});

		const volumeLine = appState.removeVolumeCuFt > 0
			? `\nShelf space freed: ~${appState.removeVolumeCuFt} cubic feet`
			: '';

		const skipLine = appState.skipCount > 0 ? ` | Skipped: ${appState.skipCount}` : '';

		const header = [
			`LessBoardGames Export - ${new Date().toLocaleDateString()}`,
			`Total reviewed: ${appState.reviewedCount}`,
			`Keeping: ${appState.keepCount} | Removing: ${appState.removeCount}${skipLine}${volumeLine}`,
			'---'
		];

		const text = [...header, ...lines].join('\n');
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `lessboardgames-export-${new Date().toISOString().slice(0, 10)}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="review-screen">
	<div class="review-header">
		<button class="back-btn" onclick={goBack}>Back to interview</button>
		<h2>Review Decisions</h2>
		<div class="review-stats">
			<span>{appState.reviewedCount} reviewed</span>
			<span class="keep">{appState.keepCount} keeping</span>
			<span class="remove">{appState.removeCount} removing</span>
			{#if appState.skipCount > 0}
				<span class="skip">{appState.skipCount} skipped</span>
			{/if}
			{#if appState.removeCount > 0 && appState.removeVolumeCuFt > 0}
				<span class="volume">~{appState.removeVolumeCuFt} cu ft freed (est.)</span>
			{/if}
		</div>
	</div>

	<div class="controls">
		<div class="filter-group">
			<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All ({appState.reviewedCount})</button>
			<button class:active={filter === 'keep'} onclick={() => (filter = 'keep')}>Keep ({appState.keepCount})</button>
			<button class:active={filter === 'remove'} onclick={() => (filter = 'remove')}>Remove ({appState.removeCount})</button>
			{#if appState.skipCount > 0}
				<button class:active={filter === 'skip'} onclick={() => (filter = 'skip')}>Skip ({appState.skipCount})</button>
			{/if}
		</div>
		<button class="export-btn" onclick={exportSummary}>Export</button>
	</div>

	{#if filtered.length === 0}
		<p class="empty">No decisions yet.</p>
	{:else}
		<div class="decision-list">
			{#each filtered as decision (decision.bggId)}
				{@const dims = appState.dimensions[decision.bggId]}
				{@const volumeCuFt = dims ? Math.round((dims.volume / 1728) * 10) / 10 : null}
				<div class="decision-card" class:is-keep={decision.status === 'keep'} class:is-remove={decision.status === 'remove'} class:is-skip={decision.status === 'skip'}>
					<div class="decision-status">
						{decision.status === 'keep' ? 'KEEP' : decision.status === 'skip' ? 'SKIP' : 'REMOVE'}
					</div>
					<div class="decision-info">
						<span class="decision-name">
							{decision.gameName}
							{#if volumeCuFt}
								<span class="decision-volume">{volumeCuFt} cu ft</span>
							{/if}
						</span>
						{#if decision.status === 'keep' && decision.reasoning}
							<span class="decision-reasoning">"{decision.reasoning}"</span>
						{/if}
						{#if decision.notes}
							<span class="decision-notes">{decision.notes}</span>
						{/if}
					</div>
					<button class="revise-btn" onclick={() => reviseDecision(decision)} title="Revise this decision">✏️</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.review-screen {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.review-header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.review-header h2 {
		margin: 0;
	}

	.back-btn {
		align-self: flex-start;
		background: none;
		border: 1px solid var(--border, #e0e0e0);
		border-radius: 4px;
		padding: 0.4rem 0.75rem;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.review-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
		color: #666;
	}

	.review-stats .keep { color: #27ae60; font-weight: 500; }
	.review-stats .remove { color: #c0392b; font-weight: 500; }
	.review-stats .skip { color: #7f8c8d; font-weight: 500; }
	.review-stats .volume { color: #8e44ad; font-weight: 500; }

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.filter-group {
		display: flex;
		gap: 0.25rem;
	}

	.filter-group button {
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border, #e0e0e0);
		background: #fff;
		cursor: pointer;
		font-size: 0.85rem;
		border-radius: 4px;
	}

	.filter-group button.active {
		background: var(--accent, #4a6fa5);
		color: #fff;
		border-color: var(--accent, #4a6fa5);
	}

	.export-btn {
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border, #e0e0e0);
		background: #fff;
		cursor: pointer;
		font-size: 0.85rem;
		border-radius: 4px;
	}

	.empty {
		color: #999;
		font-style: italic;
	}

	.decision-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.decision-card {
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border, #e0e0e0);
		border-radius: 6px;
		align-items: flex-start;
	}

	.decision-card.is-keep {
		border-left: 3px solid #27ae60;
	}

	.decision-card.is-remove {
		border-left: 3px solid #c0392b;
	}

	.decision-card.is-skip {
		border-left: 3px solid #7f8c8d;
	}

	.decision-status {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.is-keep .decision-status {
		background: #e8f5e9;
		color: #27ae60;
	}

	.is-remove .decision-status {
		background: #fbe9e7;
		color: #c0392b;
	}

	.is-skip .decision-status {
		background: #ecf0f1;
		color: #7f8c8d;
	}

	.decision-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.decision-name {
		font-weight: 500;
	}

	.decision-reasoning {
		color: #555;
		font-style: italic;
		font-size: 0.9rem;
	}

	.decision-notes {
		color: #888;
		font-size: 0.8rem;
	}

	.decision-volume {
		font-size: 0.75rem;
		color: #8e44ad;
		font-weight: 400;
		margin-left: 0.5rem;
	}

	.revise-btn {
		flex-shrink: 0;
		align-self: center;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 0.25rem 0.4rem;
		cursor: pointer;
		font-size: 0.85rem;
		opacity: 0.4;
		transition: opacity 0.15s, border-color 0.15s;
		margin-left: auto;
	}

	.revise-btn:hover {
		opacity: 1;
		border-color: var(--border, #e0e0e0);
	}
</style>

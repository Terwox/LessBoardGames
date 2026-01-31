<script lang="ts">
	import { appState } from '$lib/state.svelte';

	const total = $derived(appState.totalGames);
	const reviewed = $derived(appState.reviewedCount);
	const removing = $derived(appState.removeCount);
	const keeping = $derived(appState.keepCount);
	const skipping = $derived(appState.skipCount);
	const remaining = $derived(appState.remainingToGoal);
	const goalMet = $derived(appState.isGoalMet);
	const needToRemove = $derived(appState.needToRemove);
	const volumeCuFt = $derived(appState.removeVolumeCuFt);

	const keepPct = $derived(total > 0 ? (keeping / total) * 100 : 0);
	const removePct = $derived(total > 0 ? (removing / total) * 100 : 0);
	const skipPct = $derived(total > 0 ? (skipping / total) * 100 : 0);
</script>

<div class="progress-bar">
	<div class="stats">
		<span class="stat">{reviewed} reviewed</span>
		<span class="stat remove-stat">{removing} removing</span>
		<span class="stat keep-stat">{keeping} keeping</span>
		{#if skipping > 0}
			<span class="stat skip-stat">{skipping} skipped</span>
		{/if}
		{#if needToRemove > 0}
			<span class="stat goal-stat" class:goal-met={goalMet}>
				{#if goalMet}
					Goal reached!
				{:else}
					{remaining} more to remove
				{/if}
			</span>
		{/if}
		{#if removing > 0 && volumeCuFt > 0}
			<span class="stat volume-stat">{volumeCuFt} cu ft freed</span>
		{/if}
	</div>
	<div class="bar">
		<div class="bar-segment keep" style="width: {keepPct}%"></div>
		<div class="bar-segment remove" style="width: {removePct}%"></div>
		<div class="bar-segment skip" style="width: {skipPct}%"></div>
	</div>
</div>

<style>
	.progress-bar {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		font-size: 0.85rem;
	}

	.stat {
		color: #666;
	}

	.remove-stat {
		color: #c0392b;
		font-weight: 500;
	}

	.keep-stat {
		color: #27ae60;
		font-weight: 500;
	}

	.skip-stat {
		color: #7f8c8d;
		font-weight: 500;
	}

	.goal-stat {
		font-weight: 600;
		color: #e67e22;
	}

	.goal-stat.goal-met {
		color: #27ae60;
	}

	.volume-stat {
		color: #8e44ad;
		font-weight: 500;
	}

	.bar {
		height: 8px;
		background: #eee;
		border-radius: 4px;
		overflow: hidden;
		display: flex;
	}

	.bar-segment {
		height: 100%;
		transition: width 0.3s ease;
	}

	.bar-segment.keep {
		background: #27ae60;
	}

	.bar-segment.remove {
		background: #c0392b;
	}

	.bar-segment.skip {
		background: #bdc3c7;
	}
</style>

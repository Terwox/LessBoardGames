<script lang="ts">
	import type { Game, Decision } from '$lib/types';
	import { appState } from '$lib/state.svelte';

	let { game, onsubmit }: { game: Game; onsubmit: (decision: Decision) => void } = $props();

	let choice = $state<'keep' | 'remove' | 'skip' | null>(null);
	let reasoning = $state('');
	let notes = $state('');

	const isValid = $derived(
		choice === 'remove' || choice === 'skip' || (choice === 'keep' && reasoning.trim().length >= 3)
	);

	function handleSubmit() {
		if (!isValid || !choice) return;

		const decision: Decision = {
			bggId: game.bggId,
			collId: game.collId,
			gameName: game.name,
			status: choice,
			reasoning: choice === 'keep' ? reasoning.trim() : (choice === 'skip' ? notes.trim() || 'Skipped' : ''),
			notes: notes.trim(),
			decidedAt: new Date().toISOString()
		};

		onsubmit(decision);

		// Reset form
		choice = null;
		reasoning = '';
		notes = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && e.ctrlKey && isValid) {
			handleSubmit();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="interview-form" onkeydown={handleKeydown}>
	<p class="prompt">Why are you keeping this?</p>

	<div class="choices">
		<label class="choice" class:selected={choice === 'remove'}>
			<input type="radio" bind:group={choice} value="remove" />
			<span>I'm not keeping it</span>
		</label>

		<label class="choice" class:selected={choice === 'keep'}>
			<input type="radio" bind:group={choice} value="keep" />
			<span>I'm keeping it because...</span>
		</label>

		<label class="choice skip-choice" class:selected={choice === 'skip'}>
			<input type="radio" bind:group={choice} value="skip" />
			<span>Skip — doesn't count</span>
			<span class="skip-hint">digital, stored in another box, etc.</span>
		</label>
	</div>

	{#if choice === 'keep'}
		<div class="reasoning-field">
			<textarea
				bind:value={reasoning}
				placeholder="Why does this game deserve shelf space?"
				rows="3"
			></textarea>
			{#if reasoning.trim().length > 0 && reasoning.trim().length < 3}
				<p class="hint">At least 3 characters</p>
			{/if}
		</div>
	{/if}

	<div class="notes-field">
		<label class="notes-label" for="notes">Notes (optional)</label>
		<textarea
			id="notes"
			bind:value={notes}
			placeholder="e.g. &quot;at parents' house&quot;, &quot;waiting for reprint&quot;"
			rows="2"
		></textarea>
	</div>

	<button class="submit-btn" disabled={!isValid} onclick={handleSubmit}>
		{choice === 'remove' ? 'Remove from collection' : choice === 'skip' ? 'Skip this game' : 'Keep it'}
		<span class="shortcut">Ctrl+Enter</span>
	</button>
</div>

<style>
	.interview-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.prompt {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		color: var(--text, #222);
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 2px solid var(--border, #e0e0e0);
		border-radius: 6px;
		cursor: pointer;
		transition: border-color 0.15s, background-color 0.15s;
	}

	.choice:hover {
		border-color: #999;
	}

	.choice.selected {
		border-color: var(--accent, #4a6fa5);
		background: var(--accent-bg, #f0f4fa);
	}

	.choice input[type='radio'] {
		margin: 0;
	}

	.choice span {
		font-size: 1rem;
	}

	.skip-choice {
		flex-wrap: wrap;
	}

	.skip-hint {
		font-size: 0.8rem !important;
		color: #999;
		width: 100%;
		padding-left: 1.75rem;
		margin-top: -0.25rem;
	}

	.reasoning-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 2px solid var(--border, #e0e0e0);
		border-radius: 6px;
		font-family: inherit;
		font-size: 0.95rem;
		resize: vertical;
		box-sizing: border-box;
	}

	textarea:focus {
		outline: none;
		border-color: var(--accent, #4a6fa5);
	}

	.hint {
		font-size: 0.8rem;
		color: #999;
		margin: 0;
	}

	.notes-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.notes-label {
		font-size: 0.85rem;
		color: #666;
	}

	.submit-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		background: var(--accent, #4a6fa5);
		color: #fff;
		transition: opacity 0.15s;
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.submit-btn:not(:disabled):hover {
		opacity: 0.9;
	}

	.shortcut {
		font-size: 0.75rem;
		font-weight: 400;
		opacity: 0.7;
	}
</style>

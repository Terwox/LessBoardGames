<script lang="ts">
	import { appState } from '$lib/state.svelte';
	import type { Decision } from '$lib/types';
	import GameCard from '$lib/components/GameCard.svelte';
	import InterviewForm from '$lib/components/InterviewForm.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import ReviewScreen from '$lib/components/ReviewScreen.svelte';
	import { onMount, onDestroy } from 'svelte';

	let password = $state('');
	let dimensionPollTimer: ReturnType<typeof setInterval> | null = null;
	let expansionPollTimer: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		// Load existing decisions for session resume
		try {
			const res = await fetch('/api/decisions');
			if (res.ok) {
				const data = await res.json();
				appState.decisions = data.decisions ?? [];
			}
		} catch {
			// No saved decisions yet
		}

		// Check if already logged in from a previous request in this server session
		try {
			const res = await fetch('/api/bgg/login');
			if (res.ok) {
				const data = await res.json();
				appState.loggedIn = data.loggedIn;
			}
		} catch {
			// Not logged in
		}
	});

	onDestroy(() => {
		if (dimensionPollTimer) clearInterval(dimensionPollTimer);
		if (expansionPollTimer) clearInterval(expansionPollTimer);
	});

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function startDimensionFetch() {
		const bggIds = appState.games.map((g) => g.bggId);
		if (bggIds.length === 0) return;

		// Kick off background fetch
		try {
			await fetch('/api/bgg/dimensions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bggIds })
			});
		} catch {
			// Non-critical
		}

		// Poll for updates
		pollDimensions();
		dimensionPollTimer = setInterval(pollDimensions, 5000);
	}

	async function pollDimensions() {
		try {
			const res = await fetch('/api/bgg/dimensions');
			if (res.ok) {
				const data = await res.json();
				appState.dimensions = data.dimensions;
				appState.defaultVolume = data.defaultVolume;
				appState.dimensionsFetching = data.status.inProgress;
				appState.dimensionsFetched = data.status.fetched;
				appState.dimensionsTotal = data.status.total;

				// Stop polling when done
				if (!data.status.inProgress && dimensionPollTimer) {
					clearInterval(dimensionPollTimer);
					dimensionPollTimer = null;
				}
			}
		} catch {
			// Non-critical
		}
	}

	async function startExpansionFetch() {
		const bggIds = appState.games.map((g) => g.bggId);
		if (bggIds.length === 0) return;

		// Send full game list for name-prefix fallback analysis
		const games = appState.games.map((g) => ({ bggId: g.bggId, name: g.name }));

		// Kick off background fetch (tries API first, falls back to name-matching)
		try {
			await fetch('/api/bgg/expansions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bggIds, games })
			});
		} catch {
			// Non-critical
		}

		// Poll for updates
		pollExpansions();
		expansionPollTimer = setInterval(pollExpansions, 5000);
	}

	async function pollExpansions() {
		try {
			const res = await fetch('/api/bgg/expansions');
			if (res.ok) {
				const data = await res.json();
				appState.expansionOf = data.expansions;
				appState.expansionsFetching = data.status.inProgress;
				appState.expansionsFetched = data.status.fetched;
				appState.expansionsTotal = data.status.total;

				// Rebuild queue when expansion data arrives (to re-sort)
				if (appState.games.length > 0) {
					appState.buildQueue();
				}

				// Stop polling when done
				if (!data.status.inProgress && expansionPollTimer) {
					clearInterval(expansionPollTimer);
					expansionPollTimer = null;
				}
			}
		} catch {
			// Non-critical
		}
	}

	async function handleLogin() {
		if (!appState.bggUsername.trim() || !password) return;

		appState.isLoading = true;
		appState.loadingMessage = 'Logging into BGG...';
		appState.error = null;

		try {
			const loginRes = await fetch('/api/bgg/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: appState.bggUsername.trim(), password })
			});
			const loginData = await loginRes.json();

			if (!loginRes.ok) {
				throw new Error(loginData.error || 'Login failed');
			}

			appState.loggedIn = true;

			// Save credentials for future sessions
			try {
				await fetch('/api/credentials', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ username: appState.bggUsername.trim(), password })
				});
			} catch {
				// Non-critical — credentials just won't persist
			}

			password = '';

			// Fetch collection with client-side retry (BGG returns 202 while it builds the response)
			const maxAttempts = 8;
			const backoffMs = [2000, 3000, 5000, 8000, 12000, 16000, 20000];

			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				appState.loadingMessage = `Fetching collection from BGG (attempt ${attempt}/${maxAttempts})...`;

				const collRes = await fetch(`/api/bgg/collection?username=${encodeURIComponent(appState.bggUsername.trim())}`);

				if (collRes.status === 200) {
					const collData = await collRes.json();
					const games = collData.games;
					if (!games || games.length === 0) {
						throw new Error('BGG returned an empty collection. The XML format may have changed, or your collection may be set to private.');
					}
					appState.games = games;
					appState.buildQueue();
					startDimensionFetch();
					startExpansionFetch();
					return;
				}

				if (collRes.status === 202) {
					if (attempt < maxAttempts) {
						const waitSec = Math.round(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] / 1000);
						appState.loadingMessage = `BGG is preparing your collection... retrying in ${waitSec}s (attempt ${attempt}/${maxAttempts})`;
						await delay(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
						continue;
					}
					throw new Error('BGG is still processing your collection. Try again in a moment.');
				}

				const collData = await collRes.json();
				throw new Error(collData.error || `Failed to fetch collection (HTTP ${collRes.status})`);
			}
		} catch (e) {
			appState.error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			appState.isLoading = false;
			appState.loadingMessage = '';
		}
	}

	async function handleDecision(decision: Decision) {
		try {
			await fetch('/api/decisions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(decision)
			});
		} catch {
			// Continue even if save fails
		}

		const existing = appState.decisions.findIndex((d) => d.bggId === decision.bggId);
		if (existing >= 0) {
			appState.decisions[existing] = decision;
		} else {
			appState.decisions = [...appState.decisions, decision];
		}

		appState.advanceToNext();
	}

	function handleLoginKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleLogin();
		}
	}
</script>

<main>
	{#if appState.screen === 'setup'}
		<div class="setup-screen">
			<h1>LessBoardGames</h1>
			<p class="tagline">Reduce your collection through honest self-interview.</p>

			{#if appState.decisions.length > 0}
				<div class="resume-notice">
					<p>You have {appState.decisions.length} previous decisions saved.</p>
				</div>
			{/if}

			{#if appState.games.length === 0}
				<div class="login-section">
					<p class="instruction">Log in with your BGG account to fetch your collection.</p>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="login-form" onkeydown={handleLoginKeydown}>
						<label for="bgg-username">BGG Username</label>
						<input
							id="bgg-username"
							type="text"
							bind:value={appState.bggUsername}
							placeholder="terwox"
							disabled={appState.isLoading}
						/>
						<label for="bgg-password">BGG Password</label>
						<input
							id="bgg-password"
							type="password"
							bind:value={password}
							placeholder="Password"
							disabled={appState.isLoading}
						/>
						<button
							class="login-btn"
							onclick={handleLogin}
							disabled={appState.isLoading || !appState.bggUsername.trim() || !password}
						>
							{#if appState.isLoading}
								{appState.loadingMessage}
							{:else}
								Log in & fetch collection
							{/if}
						</button>
					</div>
					<p class="privacy-note">Your password is sent to BGG for login and optionally stored encrypted on this machine. It never leaves your computer otherwise.</p>
				</div>
			{/if}

			{#if appState.error}
				<div class="error">{appState.error}</div>
			{/if}

			{#if appState.games.length > 0}
				<div class="collection-summary">
					<p>Found <strong>{appState.totalGames}</strong> base games.</p>
					{#if appState.needToRemove > 0}
						<p>Goal: reach 400. You need to remove at least <strong>{appState.needToRemove}</strong>.</p>
					{:else}
						<p>You're already at or below 400 games. You can still review if you'd like.</p>
					{/if}
					{#if appState.decisions.length > 0}
						<p>Resuming: {appState.decisions.length} already decided, {appState.totalGames - appState.decisions.length} to go.</p>
					{/if}
					<button class="start-btn" onclick={() => { appState.buildQueue(); appState.screen = 'interview'; }}>
						{appState.decisions.length > 0 ? 'Resume Interview' : 'Start Interview'}
					</button>
				</div>
			{/if}
		</div>

	{:else if appState.screen === 'interview'}
		<div class="interview-screen">
			<div class="interview-header">
				<ProgressBar />
				<div class="header-actions">
					<button class="review-btn" onclick={() => (appState.screen = 'review')}>
						Review decisions ({appState.reviewedCount})
					</button>
				</div>
			</div>

			{#if appState.currentGame}
				<GameCard game={appState.currentGame} expansionOf={appState.expansionOf[appState.currentGame.bggId]?.filter((b) => appState.collectionBggIds.has(b.bggId))} />
				<InterviewForm game={appState.currentGame} onsubmit={handleDecision} />
			{:else}
				<div class="done-message">
					<h2>All done!</h2>
					<p>You've reviewed all {appState.totalGames} games.</p>
					<p>
						Keeping {appState.keepCount}. Removing {appState.removeCount}.
						{#if appState.skipCount > 0}
							Skipped {appState.skipCount}.
						{/if}
						{#if appState.removeVolumeCuFt > 0}
							(~{appState.removeVolumeCuFt} cu ft of shelf space)
						{/if}
						{#if appState.isGoalMet}
							Goal reached!
						{:else if appState.needToRemove > 0}
							Still {appState.remainingToGoal} short of the 400 goal.
						{/if}
					</p>
					<button onclick={() => (appState.screen = 'review')}>Review all decisions</button>
				</div>
			{/if}

			<SyncStatus />
		</div>

	{:else if appState.screen === 'review'}
		<ReviewScreen />
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		color: #222;
		background: #fafafa;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	main {
		max-width: 680px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.setup-screen {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		text-align: center;
	}

	.setup-screen h1 {
		font-size: 2rem;
		margin: 0;
	}

	.tagline {
		color: #666;
		margin: 0;
	}

	.resume-notice {
		background: #f0f4fa;
		border: 1px solid #c5d5ea;
		border-radius: 6px;
		padding: 0.75rem 1rem;
	}

	.resume-notice p {
		margin: 0;
		font-size: 0.9rem;
		color: #4a6fa5;
	}

	.login-section {
		text-align: left;
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.instruction {
		margin: 0 0 1rem;
		font-size: 0.95rem;
		color: #555;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.login-form label {
		font-weight: 500;
		font-size: 0.85rem;
		margin-top: 0.25rem;
	}

	.login-form input {
		padding: 0.6rem 0.75rem;
		border: 2px solid #e0e0e0;
		border-radius: 6px;
		font-size: 1rem;
	}

	.login-form input:focus {
		outline: none;
		border-color: #4a6fa5;
	}

	.login-btn {
		margin-top: 0.5rem;
		padding: 0.7rem 1.25rem;
		border: none;
		border-radius: 6px;
		background: #4a6fa5;
		color: #fff;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
	}

	.login-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.privacy-note {
		margin: 0.75rem 0 0;
		font-size: 0.8rem;
		color: #999;
	}

	.error {
		background: #fbe9e7;
		color: #c0392b;
		padding: 0.75rem 1rem;
		border-radius: 6px;
		text-align: left;
	}

	.collection-summary {
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1.5rem;
		text-align: left;
	}

	.collection-summary p {
		margin: 0 0 0.5rem;
	}

	.start-btn {
		margin-top: 1rem;
		padding: 0.75rem 2rem;
		border: none;
		border-radius: 6px;
		background: #27ae60;
		color: #fff;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.start-btn:hover {
		opacity: 0.9;
	}

	.interview-screen {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.interview-header {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.header-actions {
		display: flex;
		justify-content: flex-end;
	}

	.review-btn {
		background: none;
		border: 1px solid #e0e0e0;
		border-radius: 4px;
		padding: 0.4rem 0.75rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: #666;
	}

	.review-btn:hover {
		border-color: #999;
	}

	.done-message {
		text-align: center;
		padding: 2rem;
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
	}

	.done-message h2 {
		margin: 0 0 0.5rem;
	}

	.done-message p {
		margin: 0 0 0.5rem;
		color: #666;
	}

	.done-message button {
		margin-top: 1rem;
		padding: 0.6rem 1.5rem;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
		font-size: 0.95rem;
	}
</style>

<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="top-nav">
	<a href="/" class:active={page.url.pathname === '/'}>Interview</a>
	<a href="/shelf" class:active={page.url.pathname === '/shelf'}>Shelf</a>
</nav>

{@render children()}

<style>
	.top-nav {
		display: flex;
		gap: 1.5rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid #e0e0e0;
		background: #fafafa;
		font-size: 0.85rem;
	}
	.top-nav a {
		text-decoration: none;
		color: #666;
		padding: 0.25rem 0;
	}
	.top-nav a:hover {
		color: #333;
	}
	.top-nav a.active {
		color: #111;
		font-weight: 600;
		border-bottom: 2px solid #111;
	}
</style>

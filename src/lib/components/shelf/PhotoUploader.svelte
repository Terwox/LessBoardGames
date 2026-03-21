<script lang="ts">
	import type { ShelfZone, ShelfPhoto } from '$lib/types';
	import { shelfState } from '$lib/shelf-state.svelte';

	const ZONE_OPTIONS: { value: ShelfZone; label: string }[] = [
		{ value: 'grab-and-go', label: 'Grab & Go' },
		{ value: 'on-deck', label: 'On Deck' },
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'big-box', label: 'Big Box' },
		{ value: 'outgoing', label: 'Outgoing' },
		{ value: 'other', label: 'Other' }
	];

	const MAX_WIDTH = 2048;

	let zone = $state<ShelfZone>('on-deck');
	let label = $state('');
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;

	async function resizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				let { width, height } = img;
				if (width > MAX_WIDTH) {
					height = Math.round(height * (MAX_WIDTH / width));
					width = MAX_WIDTH;
				}
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(img, 0, 0, width, height);
				canvas.toBlob(
					(blob) => {
						if (blob) resolve({ blob, width, height });
						else reject(new Error('Canvas toBlob failed'));
					},
					'image/jpeg',
					0.85
				);
			};
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = URL.createObjectURL(file);
		});
	}

	async function uploadFile(file: File) {
		if (!file.type.startsWith('image/')) {
			shelfState.error = 'Please upload an image file';
			return;
		}

		shelfState.isUploading = true;
		shelfState.error = null;

		try {
			const { blob, width, height } = await resizeImage(file);

			const formData = new FormData();
			formData.append('image', blob, file.name);
			formData.append('zone', zone);
			formData.append('label', label || file.name.replace(/\.[^.]+$/, ''));
			formData.append('width', String(width));
			formData.append('height', String(height));

			const res = await fetch('/api/shelf/photos', { method: 'POST', body: formData });
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Upload failed');
			}
			const data = await res.json();
			shelfState.addPhoto(data.photo);
			label = '';
		} catch (e) {
			shelfState.error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			shelfState.isUploading = false;
		}
	}

	function handleDrop(e: DragEvent) {
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) uploadFile(file);
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadFile(file);
		input.value = '';
	}

	async function deletePhoto(id: string) {
		await fetch(`/api/shelf/photos/${id}`, { method: 'DELETE' });
		shelfState.removePhoto(id);
	}
</script>

<div class="uploader">
	<div class="form-row">
		<select bind:value={zone}>
			{#each ZONE_OPTIONS as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<input type="text" bind:value={label} placeholder="Shelf label (optional)" />
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		ondragover={(e) => { e.preventDefault(); dragOver = true; }}
		ondragleave={() => (dragOver = false)}
		ondrop={(e) => { e.preventDefault(); handleDrop(e); }}
		onclick={() => fileInput.click()}
	>
		{#if shelfState.isUploading}
			<span>Uploading...</span>
		{:else}
			<span>Drop shelf photo here or click to browse</span>
		{/if}
	</div>

	<input type="file" accept="image/*" bind:this={fileInput} onchange={handleFileSelect} hidden />

	{#if shelfState.photos.length > 0}
		<div class="photo-grid">
			{#each shelfState.photos as photo}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="photo-thumb"
					class:selected={shelfState.selectedPhotoId === photo.id}
					onclick={() => shelfState.selectPhoto(photo.id)}
				>
					<img src="/api/shelf/photos/{photo.id}/image" alt={photo.label} />
					<span class="photo-label">{photo.label}</span>
					<span class="photo-zone">{photo.zone}</span>
					<button
						class="delete-btn"
						onclick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
						title="Delete photo"
					>&times;</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.uploader {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.form-row {
		display: flex;
		gap: 0.5rem;
	}
	.form-row select {
		flex: 0 0 auto;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
	}
	.form-row input {
		flex: 1;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
	}
	.drop-zone {
		border: 2px dashed #ccc;
		border-radius: 6px;
		padding: 1.5rem;
		text-align: center;
		cursor: pointer;
		color: #888;
		font-size: 0.85rem;
		transition: border-color 0.15s, background 0.15s;
	}
	.drop-zone:hover,
	.drop-zone.drag-over {
		border-color: #666;
		background: #f5f5f5;
	}
	.photo-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.photo-thumb {
		position: relative;
		width: 80px;
		border: 2px solid transparent;
		border-radius: 4px;
		padding: 0;
		background: none;
		cursor: pointer;
		overflow: hidden;
	}
	.photo-thumb.selected {
		border-color: #333;
	}
	.photo-thumb img {
		width: 100%;
		height: 60px;
		object-fit: cover;
		display: block;
	}
	.photo-label {
		display: block;
		font-size: 0.65rem;
		padding: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.photo-zone {
		display: block;
		font-size: 0.6rem;
		color: #888;
		padding: 0 2px 2px;
	}
	.delete-btn {
		position: absolute;
		top: 1px;
		right: 1px;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border: none;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
	}
</style>

<script lang="ts">
	import type { ShelfPhoto, ShelfGame, Game } from '$lib/types';
	import { recencyColor } from '$lib/shelf/heatmap';

	type BoxEvent = { box: { x: number; y: number; w: number; h: number }; name: string };

	interface Props {
		photo: ShelfPhoto;
		boxes: ShelfGame[];
		collectionByBggId: Map<number, Game>;
		mode?: 'draw' | 'view';
		selectedGameId?: string | null;
		oncreate?: (e: BoxEvent) => void;
		onupdate?: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
		ondelete?: (id: string) => void;
		onselect?: (id: string | null) => void;
	}

	let {
		photo,
		boxes,
		collectionByBggId,
		mode = 'draw',
		selectedGameId = null,
		oncreate,
		onupdate,
		ondelete,
		onselect
	}: Props = $props();

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let img: HTMLImageElement;
	let renderW = $state(0);
	let renderH = $state(0);

	type InteractionState =
		| { type: 'idle' }
		| { type: 'drawing'; startX: number; startY: number; curX: number; curY: number }
		| { type: 'moving'; gameId: string; offsetX: number; offsetY: number; origBox: ShelfGame['box'] }
		| { type: 'resizing'; gameId: string; edges: string; origBox: ShelfGame['box']; startPx: number; startPy: number };

	let interaction = $state<InteractionState>({ type: 'idle' });

	const EDGE_THRESHOLD = 8; // px

	function pxToPercent(px: number, py: number): { x: number; y: number } {
		return {
			x: (px / renderW) * 100,
			y: (py / renderH) * 100
		};
	}

	function percentToPx(x: number, y: number): { px: number; py: number } {
		return {
			px: (x / 100) * renderW,
			py: (y / 100) * renderH
		};
	}

	function hitTest(px: number, py: number): { gameId: string; edges: string } | null {
		const p = pxToPercent(px, py);
		// Check in reverse order (top-most first)
		for (let i = boxes.length - 1; i >= 0; i--) {
			const b = boxes[i];
			const { px: bx, py: by } = percentToPx(b.box.x, b.box.y);
			const { px: bx2, py: by2 } = percentToPx(b.box.x + b.box.w, b.box.y + b.box.h);

			// Check edges first
			let edges = '';
			if (Math.abs(py - by) < EDGE_THRESHOLD && px >= bx - EDGE_THRESHOLD && px <= bx2 + EDGE_THRESHOLD) edges += 'n';
			if (Math.abs(py - by2) < EDGE_THRESHOLD && px >= bx - EDGE_THRESHOLD && px <= bx2 + EDGE_THRESHOLD) edges += 's';
			if (Math.abs(px - bx) < EDGE_THRESHOLD && py >= by - EDGE_THRESHOLD && py <= by2 + EDGE_THRESHOLD) edges += 'w';
			if (Math.abs(px - bx2) < EDGE_THRESHOLD && py >= by - EDGE_THRESHOLD && py <= by2 + EDGE_THRESHOLD) edges += 'e';

			if (edges) return { gameId: b.id, edges };

			// Check interior
			if (px >= bx && px <= bx2 && py >= by && py <= by2) {
				return { gameId: b.id, edges: '' };
			}
		}
		return null;
	}

	function getCursor(px: number, py: number): string {
		if (mode === 'view') return 'default';
		const hit = hitTest(px, py);
		if (!hit) return 'crosshair';
		if (!hit.edges) return 'move';
		const e = hit.edges;
		if ((e === 'n' || e === 's')) return 'ns-resize';
		if ((e === 'e' || e === 'w')) return 'ew-resize';
		if (e === 'nw' || e === 'se') return 'nwse-resize';
		if (e === 'ne' || e === 'sw') return 'nesw-resize';
		return 'move';
	}

	function onPointerDown(e: PointerEvent) {
		if (mode === 'view') return;
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const hit = hitTest(px, py);

		canvas.setPointerCapture(e.pointerId);

		if (hit && hit.edges) {
			// Resize
			const box = boxes.find((b) => b.id === hit.gameId)!;
			interaction = {
				type: 'resizing',
				gameId: hit.gameId,
				edges: hit.edges,
				origBox: { ...box.box },
				startPx: px,
				startPy: py
			};
			onselect?.(hit.gameId);
		} else if (hit) {
			// Move
			const box = boxes.find((b) => b.id === hit.gameId)!;
			const p = pxToPercent(px, py);
			interaction = {
				type: 'moving',
				gameId: hit.gameId,
				offsetX: p.x - box.box.x,
				offsetY: p.y - box.box.y,
				origBox: { ...box.box }
			};
			onselect?.(hit.gameId);
		} else {
			// Draw new box
			const p = pxToPercent(px, py);
			interaction = { type: 'drawing', startX: p.x, startY: p.y, curX: p.x, curY: p.y };
			onselect?.(null);
		}
	}

	function onPointerMove(e: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		if (interaction.type === 'idle') {
			canvas.style.cursor = getCursor(px, py);
			return;
		}

		const p = pxToPercent(px, py);

		if (interaction.type === 'drawing') {
			interaction.curX = clamp(p.x, 0, 100);
			interaction.curY = clamp(p.y, 0, 100);
		} else if (interaction.type === 'moving') {
			const newX = clamp(p.x - interaction.offsetX, 0, 100 - interaction.origBox.w);
			const newY = clamp(p.y - interaction.offsetY, 0, 100 - interaction.origBox.h);
			onupdate?.(interaction.gameId, {
				...interaction.origBox,
				x: newX,
				y: newY
			});
		} else if (interaction.type === 'resizing') {
			const dpx = pxToPercent(px - interaction.startPx, py - interaction.startPy);
			// dpx here is wrong since pxToPercent expects absolute coords; compute delta manually
			const dx = ((px - interaction.startPx) / renderW) * 100;
			const dy = ((py - interaction.startPy) / renderH) * 100;
			const ob = interaction.origBox;
			let { x, y, w, h } = ob;

			if (interaction.edges.includes('e')) w = Math.max(2, ob.w + dx);
			if (interaction.edges.includes('w')) { x = ob.x + dx; w = Math.max(2, ob.w - dx); }
			if (interaction.edges.includes('s')) h = Math.max(2, ob.h + dy);
			if (interaction.edges.includes('n')) { y = ob.y + dy; h = Math.max(2, ob.h - dy); }

			onupdate?.(interaction.gameId, {
				x: clamp(x, 0, 100),
				y: clamp(y, 0, 100),
				w: clamp(w, 2, 100),
				h: clamp(h, 2, 100)
			});
		}

		draw();
	}

	function onPointerUp(e: PointerEvent) {
		if (interaction.type === 'drawing') {
			const x = Math.min(interaction.startX, interaction.curX);
			const y = Math.min(interaction.startY, interaction.curY);
			const w = Math.abs(interaction.curX - interaction.startX);
			const h = Math.abs(interaction.curY - interaction.startY);
			// Only create if box is big enough (>2% each dimension)
			if (w > 2 && h > 2) {
				oncreate?.({ box: { x, y, w, h }, name: '' });
			}
		}
		interaction = { type: 'idle' };
		canvas.releasePointerCapture(e.pointerId);
		draw();
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const hit = hitTest(px, py);
		if (hit) {
			ondelete?.(hit.gameId);
		}
	}

	function clamp(v: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, v));
	}

	function getBoxColor(game: ShelfGame): string {
		if (game.bggId === null) return 'rgba(150, 150, 150, 0.8)';
		const cg = collectionByBggId.get(game.bggId);
		if (!cg) return 'rgba(150, 150, 150, 0.8)';
		return recencyColor(cg.lastPlayed, cg.playCount);
	}

	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d')!;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const dpr = window.devicePixelRatio || 1;

		for (const box of boxes) {
			const { px, py } = percentToPx(box.box.x, box.box.y);
			const w = (box.box.w / 100) * renderW;
			const h = (box.box.h / 100) * renderH;

			const color = getBoxColor(box);
			const isSelected = box.id === selectedGameId;

			// Fill
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = color;
			ctx.fillRect(px * dpr, py * dpr, w * dpr, h * dpr);

			// Border
			ctx.globalAlpha = 1;
			ctx.strokeStyle = color;
			ctx.lineWidth = (isSelected ? 3 : 2) * dpr;
			ctx.strokeRect(px * dpr, py * dpr, w * dpr, h * dpr);

			// Selection highlight
			if (isSelected) {
				ctx.strokeStyle = 'white';
				ctx.lineWidth = 1 * dpr;
				ctx.setLineDash([4 * dpr, 4 * dpr]);
				ctx.strokeRect(px * dpr, py * dpr, w * dpr, h * dpr);
				ctx.setLineDash([]);
			}

			// Label
			const labelText = box.detectedName || '(unnamed)';
			const fontSize = Math.max(10, Math.min(14, h * 0.25)) * dpr;
			ctx.font = `${fontSize}px sans-serif`;
			ctx.fillStyle = 'white';
			ctx.shadowColor = 'rgba(0,0,0,0.8)';
			ctx.shadowBlur = 3 * dpr;
			ctx.fillText(labelText, (px + 3) * dpr, (py + fontSize / dpr + 2) * dpr, (w - 6) * dpr);
			ctx.shadowBlur = 0;
		}

		// Draw in-progress box
		if (interaction.type === 'drawing') {
			const x = Math.min(interaction.startX, interaction.curX);
			const y = Math.min(interaction.startY, interaction.curY);
			const w = Math.abs(interaction.curX - interaction.startX);
			const h = Math.abs(interaction.curY - interaction.startY);
			const { px, py } = percentToPx(x, y);
			const pw = (w / 100) * renderW;
			const ph = (h / 100) * renderH;

			ctx.globalAlpha = 0.3;
			ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
			ctx.fillRect(px * dpr, py * dpr, pw * dpr, ph * dpr);
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#4488ff';
			ctx.lineWidth = 2 * dpr;
			ctx.setLineDash([4 * dpr, 4 * dpr]);
			ctx.strokeRect(px * dpr, py * dpr, pw * dpr, ph * dpr);
			ctx.setLineDash([]);
		}
	}

	function syncSize() {
		if (!img || !canvas) return;
		renderW = img.clientWidth;
		renderH = img.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = renderW * dpr;
		canvas.height = renderH * dpr;
		draw();
	}

	$effect(() => {
		// Re-draw when boxes or selection changes
		boxes;
		selectedGameId;
		draw();
	});

	$effect(() => {
		if (!container) return;
		const observer = new ResizeObserver(() => syncSize());
		observer.observe(container);
		return () => observer.disconnect();
	});
</script>

<div class="canvas-container" bind:this={container}>
	<img
		bind:this={img}
		src="/api/shelf/photos/{photo.id}/image"
		alt={photo.label}
		onload={syncSize}
		draggable="false"
	/>
	<canvas
		bind:this={canvas}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		oncontextmenu={onContextMenu}
	></canvas>
</div>

<style>
	.canvas-container {
		position: relative;
		display: inline-block;
		width: 100%;
	}
	.canvas-container img {
		display: block;
		width: 100%;
		height: auto;
		user-select: none;
		-webkit-user-drag: none;
	}
	.canvas-container canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
</style>

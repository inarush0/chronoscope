<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { TimelineController } from './TimelineController.js';
	import type { TimelineControllerOptions } from './TimelineController.js';
	import type { TickMark } from './types.js';

	// ─── Props ─────────────────────────────────────────────────────────────────

	interface Props {
		initialViewStart: number;
		initialViewEnd: number;
		initialPlayhead?: number;
		onSelectionChange?: TimelineControllerOptions['onSelectionChange'];
		onPlayheadChange?: TimelineControllerOptions['onPlayheadChange'];
	}

	let {
		initialViewStart,
		initialViewEnd,
		initialPlayhead,
		onSelectionChange,
		onPlayheadChange
	}: Props = $props();

	// ─── DOM refs ──────────────────────────────────────────────────────────────

	let wrapper: HTMLDivElement;
	let canvas: HTMLCanvasElement;

	// ─── Overlay state (driven by rAF loop, updates DOM labels) ───────────────

	let ticks = $state<TickMark[]>([]);
	let playheadX = $state(0);
	// untrack: these are stable "initial" props; the rAF loop owns playheadTime after init.
	let playheadTime = $state(untrack(() => initialPlayhead ?? initialViewStart));

	// ─── Controller (reactive so exported methods and template track it) ───────

	let ctrl = $state<TimelineController | undefined>(undefined);

	// ─── Exposed imperative API ────────────────────────────────────────────────

	export function resetView() {
		ctrl?.resetView();
	}

	export function zoomToSelection() {
		ctrl?.zoomToSelection();
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(() => {
		let ro: ResizeObserver | undefined;
		let rafId: number;

		// Only recompute tick array when the view window changes.
		let lastViewStart = NaN;
		let lastViewEnd = NaN;

		async function init() {
			ctrl = await TimelineController.create(canvas, {
				initialViewStart,
				initialViewEnd,
				initialPlayhead,
				onSelectionChange,
				onPlayheadChange
			});

			ro = new ResizeObserver(([entry]) => {
				const { width, height } = entry.contentRect;
				ctrl!.resize(width, height);
			});
			ro.observe(wrapper);

			function loop() {
				if (ctrl) {
					const vs = ctrl.getViewState();
					if (vs.viewStart !== lastViewStart || vs.viewEnd !== lastViewEnd) {
						ticks = ctrl.getTicks();
						lastViewStart = vs.viewStart;
						lastViewEnd = vs.viewEnd;
					}
					playheadX = ctrl.getPlayheadX();
					playheadTime = vs.playhead;
				}
				rafId = requestAnimationFrame(loop);
			}
			rafId = requestAnimationFrame(loop);
		}

		init();

		return () => {
			cancelAnimationFrame(rafId);
			ro?.disconnect();
			ctrl?.destroy();
		};
	});

	// ─── Derived ───────────────────────────────────────────────────────────────

	const playheadLabel = $derived(
		new Date(playheadTime).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
	);
</script>

<!-- ─── Markup ───────────────────────────────────────────────────────────────── -->

<div class="timeline-root" bind:this={wrapper}>
	<canvas bind:this={canvas}></canvas>

	<!-- Tick labels — DOM-positioned over the header band -->
	<div class="tick-labels" aria-hidden="true">
		{#each ticks as tick (tick.time)}
			<span class="tick-label" style="left: {tick.x}px">{tick.label}</span>
		{/each}
	</div>

	<!-- Playhead time readout — follows the playhead line -->
	<div class="playhead-readout" style="left: {playheadX}px" aria-hidden="true">
		{playheadLabel}
	</div>
</div>

<!-- ─── Styles ──────────────────────────────────────────────────────────────── -->

<style>
	.timeline-root {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* ── Tick labels ── */

	.tick-labels {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 32px; /* matches HEADER_HEIGHT in TimelineController */
		pointer-events: none;
		overflow: hidden;
	}

	.tick-label {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		font-size: 10px;
		font-family: ui-monospace, 'Cascadia Code', 'Fira Mono', monospace;
		color: #7070aa;
		white-space: nowrap;
		user-select: none;
	}

	/* ── Playhead time readout ── */

	.playhead-readout {
		position: absolute;
		top: 32px; /* sits just below the header band */
		transform: translateX(-50%);
		font-size: 10px;
		font-family: ui-monospace, 'Cascadia Code', 'Fira Mono', monospace;
		color: #ff5f5f;
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
		background: rgba(19, 19, 31, 0.75);
		padding: 1px 4px;
		border-radius: 2px;
	}
</style>
